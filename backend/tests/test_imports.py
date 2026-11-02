import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app.budget_cycles import _add_months

FIXTURES = Path(__file__).parent / "fixtures" / "statements"


@pytest.fixture
def alice(make_user_client):
    return make_user_client("alice@example.com")


@pytest.fixture
def bob(make_user_client):
    return make_user_client("bob@example.com")


def _preview(client, name="credit_card.csv", content=None, **form):
    data = content if content is not None else (FIXTURES / name).read_bytes()
    form.setdefault("kind", "credit")
    return client.post(
        "/imports/statement/preview",
        files={"file": (name, data, "text/csv")},
        data=form,
    )


def _category(client, name):
    resp = client.post("/categories/", json={"name": name, "type": "expense"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _tx(**overrides):
    return {
        "amount": "6.45",
        "date": "2026-10-03",
        "type": "expense",
        "payment_method": "Visa",
        **overrides,
    }


def test_preview_reads_rows_and_applies_payment_method(alice):
    resp = _preview(alice, payment_method="Amex")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["mapping"]["date_format"] == "%m/%d/%Y"
    rows = data["rows"]
    assert [(r["date"], r["amount"], r["type"]) for r in rows] == [
        ("2026-10-03", 6.45, "expense"),
        ("2026-10-05", 1204.10, "expense"),
        ("2026-10-09", 500.0, "income"),
    ]
    # only expenses carry a payment method
    assert [r["payment_method"] for r in rows] == ["Amex", "Amex", None]
    assert all(r["selected"] and not r["duplicate"] for r in rows)
    # nothing is saved by a preview
    assert alice.get("/transactions/").json()["total"] == 0


def test_preview_with_mapping_override(alice):
    mapping = {"date": 1, "description": 2, "amount": 5, "date_format": "%m/%d/%Y"}
    resp = _preview(alice, mapping=json.dumps(mapping))
    assert resp.status_code == 200, resp.text
    assert resp.json()["rows"][0]["date"] == "2026-10-04"


@pytest.mark.parametrize("form,content", [
    ({"mapping": "{not json"}, None),
    ({"mapping": json.dumps({"date": 0})}, None),  # no amount column
    ({}, b"nothing,here\n"),
])
def test_preview_rejects_bad_input(alice, form, content):
    resp = _preview(alice, content=content, **form)
    assert resp.status_code == 400, resp.text


def test_preview_flags_duplicates_once_each(alice):
    saved = alice.post("/transactions/", json=_tx(description="Starbucks 99 Toronto"))
    assert saved.status_code == 201, saved.text
    two_coffees = (
        b"Date,Description,Amount\n"
        b"10/03/2026,STARBUCKS #1234 TORONTO,6.45\n"
        b"10/03/2026,STARBUCKS #1234 TORONTO,6.45\n"
    )
    rows = _preview(alice, content=two_coffees).json()["rows"]
    assert [(r["duplicate"], r["selected"]) for r in rows] == [(True, False), (False, True)]


def test_preview_suggests_categories_and_current_budget_cycle(alice):
    food = _category(alice, "Food")
    treats = _category(alice, "Treats")
    # a monthly budget that has since rolled over
    start = _add_months(date.today().replace(day=1), -2)
    old = alice.post("/budgets/", json={
        "name": "Monthly",
        "start_date": start.isoformat(),
        "end_date": (_add_months(start, 1) - timedelta(days=1)).isoformat(),
        "recurrence": "monthly",
    }).json()
    resp = alice.post("/transactions/", json=_tx(
        date=start.isoformat(), description="Starbucks #77 Toronto", category_ids=[food, treats], budget_id=old["id"],
    ))
    assert resp.status_code == 201, resp.text
    current = alice.get("/budgets/").json()["items"][0]
    assert current["id"] != old["id"]

    rows = _preview(alice).json()["rows"]
    assert sorted(rows[0]["category_ids"]) == sorted([food, treats])
    assert rows[0]["budget_id"] == current["id"]
    assert rows[1]["category_ids"] == [] and rows[1]["budget_id"] is None


def test_preview_never_uses_another_users_history(alice, bob):
    food = _category(alice, "Food")
    alice.post("/transactions/", json=_tx(description="STARBUCKS #1234 TORONTO", category_ids=[food]))
    rows = _preview(bob).json()["rows"]
    assert rows[0]["category_ids"] == []
    assert rows[0]["duplicate"] is False


def test_bulk_create_saves_everything(alice):
    food = _category(alice, "Food")
    fun = _category(alice, "Fun")
    resp = alice.post("/transactions/bulk", json={"items": [
        _tx(description="Coffee", category_ids=[food, fun]),
        _tx(amount="2500.00", type="income", payment_method=None, description="Payroll"),
    ]})
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert [t["description"] for t in created] == ["Coffee", "Payroll"]
    assert sorted(created[0]["category_ids"]) == sorted([food, fun])
    assert alice.get("/transactions/").json()["total"] == 2


@pytest.mark.parametrize("bad,detail", [
    ({"payment_method": None}, "Row 2: payment_method is required for expenses."),
    ({"amount": "abc"}, "Row 2: amount:"),
    ({"category_ids": [9999]}, "Row 2: Category does not exist."),
    ({"budget_id": 9999}, "Row 2: Budget does not exist."),
])
def test_bulk_create_is_all_or_nothing(alice, bad, detail):
    resp = alice.post("/transactions/bulk", json={"items": [_tx(), _tx(**bad), _tx()]})
    assert resp.status_code == 400, resp.text
    assert resp.json()["detail"].startswith(detail)
    assert alice.get("/transactions/").json()["total"] == 0


def test_bulk_create_rejects_bad_rows_after_a_budget_rollover(alice):
    # the first row's expired recurring budget rolls over (and commits)
    # before the bad third row is seen; nothing may be saved regardless
    start = _add_months(date.today().replace(day=1), -2)
    old = alice.post("/budgets/", json={
        "name": "Monthly",
        "start_date": start.isoformat(),
        "end_date": (_add_months(start, 1) - timedelta(days=1)).isoformat(),
        "recurrence": "monthly",
    }).json()
    food = _category(alice, "Food")
    items = [
        _tx(date=date.today().isoformat(), budget_id=old["id"], category_ids=[food]),
        _tx(category_ids=[food]),
        _tx(category_ids=[9999]),
    ]
    resp = alice.post("/transactions/bulk", json={"items": items})
    assert resp.status_code == 400, resp.text
    assert alice.get("/transactions/").json()["total"] == 0


def test_bulk_create_links_each_row_to_its_budget_cycle(alice):
    start = _add_months(date.today().replace(day=1), -2)
    old = alice.post("/budgets/", json={
        "name": "Monthly",
        "start_date": start.isoformat(),
        "end_date": (_add_months(start, 1) - timedelta(days=1)).isoformat(),
        "recurrence": "monthly",
    }).json()
    current = alice.get("/budgets/").json()["items"][0]
    created = alice.post("/transactions/bulk", json={"items": [
        _tx(date=start.isoformat(), budget_id=current["id"]),
        _tx(date=date.today().isoformat(), budget_id=current["id"]),
    ]}).json()
    assert [t["budget_id"] for t in created] == [old["id"], current["id"]]


def test_bulk_create_cannot_use_another_users_category(alice, bob):
    food = _category(alice, "Food")
    resp = bob.post("/transactions/bulk", json={"items": [_tx(category_ids=[food])]})
    assert resp.status_code == 400, resp.text


def test_bulk_create_needs_items(alice):
    assert alice.post("/transactions/bulk", json={"items": []}).status_code == 422
