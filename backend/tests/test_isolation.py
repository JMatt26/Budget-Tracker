"""One user must never be able to see or change another user's data.

Alice owns a full set of data; Bob then probes every resource and route that
takes an id, and every list/summary route, and must see nothing of hers.
"""
from datetime import date, timedelta

import pytest

from app.budget_cycles import _add_months


@pytest.fixture
def alice(make_user_client):
    return make_user_client("alice@example.com")


@pytest.fixture
def bob(make_user_client):
    return make_user_client("bob@example.com")


@pytest.fixture
def alices_data(alice):
    """Create a row of every kind for Alice and return the ids."""
    category = alice.post("/categories/", json={"name": "Groceries", "type": "expense"})
    assert category.status_code == 201, category.text
    category_id = category.json()["id"]

    # a recurring monthly budget that ended two months ago, so rolling it over
    # leaves Alice with history as well
    start = _add_months(date.today().replace(day=1), -2)
    end = _add_months(start, 1) - timedelta(days=1)
    budget = alice.post(
        "/budgets/",
        json={
            "name": "Alice budget",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "recurrence": "monthly",
        },
    )
    assert budget.status_code == 201, budget.text
    first_budget_id = budget.json()["id"]

    bc = alice.post(
        f"/budgets/{first_budget_id}/categories",
        json={"category_id": category_id, "limit": "100.00"},
    )
    assert bc.status_code == 201, bc.text
    budget_category_id = bc.json()["id"]

    target = alice.put(
        f"/budgets/{first_budget_id}/targets", json={"spending": "50.00", "saved": "10.00"}
    )
    assert target.status_code == 200, target.text

    # listing rolls the series over; the current cycle is what Alice sees
    listing = alice.get("/budgets/").json()["items"]
    assert len(listing) == 1
    current_budget_id = listing[0]["id"]

    tx = alice.post(
        "/transactions/",
        json={
            "amount": "12.34",
            "description": "alice secret purchase",
            "date": date.today().isoformat(),
            "type": "expense",
            "category_id": category_id,
            "budget_id": current_budget_id,
            "payment_method": "Visa",
        },
    )
    assert tx.status_code == 201, tx.text

    incomes = [
        alice.post("/income/", json={"name": "Job", "amount": "2000.00", "frequency": "monthly"}),
        alice.post("/income/", json={"name": "Side", "amount": "100.00", "frequency": "weekly"}),
    ]
    for resp in incomes:
        assert resp.status_code == 201, resp.text

    return {
        "category_id": category_id,
        "first_budget_id": first_budget_id,
        "current_budget_id": current_budget_id,
        "budget_category_id": budget_category_id,
        "transaction_id": tx.json()["id"],
        "income_ids": [r.json()["id"] for r in incomes],
    }


def test_alices_own_data_is_visible_to_alice(alice, alices_data):
    # guards the fixture itself: if Alice can't see her data, nothing below means anything
    assert alice.get("/categories/").json()["total"] == 1
    assert alice.get("/transactions/").json()["total"] == 1
    assert len(alice.get("/income/").json()) == 2
    assert alice.get(f"/budgets/{alices_data['current_budget_id']}/history").status_code == 200


def test_bob_sees_empty_lists(bob, alices_data):
    assert bob.get("/categories/").json()["total"] == 0
    assert bob.get("/transactions/").json()["total"] == 0
    assert bob.get("/budgets/").json()["total"] == 0
    assert bob.get("/income/").json() == []


def test_bob_reports_contain_nothing_of_alice(bob, alices_data):
    summary = bob.get("/reports/summary", params={"group_by": "category"}).json()
    assert float(summary["totals"]["total_expense"]) == 0
    assert float(summary["totals"]["total_income"]) == 0
    assert not summary.get("by_category")

    export = bob.get("/reports/transactions/export")
    assert export.status_code == 200
    assert "alice secret purchase" not in export.text


def _alice_id_routes(d):
    """(method, path, json) for every route that takes one of Alice's ids."""
    cat, tx = d["category_id"], d["transaction_id"]
    first, cur, bc = d["first_budget_id"], d["current_budget_id"], d["budget_category_id"]
    routes = [
        ("GET", f"/categories/{cat}", None),
        ("PUT", f"/categories/{cat}", {"name": "Hacked"}),
        ("DELETE", f"/categories/{cat}", None),
        ("GET", f"/transactions/{tx}", None),
        ("PUT", f"/transactions/{tx}", {"description": "hacked"}),
        ("DELETE", f"/transactions/{tx}", None),
    ]
    for income_id in d["income_ids"]:
        routes += [
            ("PUT", f"/income/{income_id}", {"amount": "1.00"}),
            ("DELETE", f"/income/{income_id}", None),
        ]
    for budget_id in (first, cur):
        routes += [
            ("GET", f"/budgets/{budget_id}", None),
            ("PUT", f"/budgets/{budget_id}", {"name": "hacked"}),
            ("DELETE", f"/budgets/{budget_id}", None),
            ("GET", f"/budgets/{budget_id}/history", None),
            ("GET", f"/budgets/{budget_id}/status", None),
            ("GET", f"/budgets/{budget_id}/targets", None),
            ("PUT", f"/budgets/{budget_id}/targets", {"spending": "1.00"}),
            ("GET", f"/budgets/{budget_id}/expense-breakdown", None),
            ("GET", f"/budgets/{budget_id}/categories", None),
            ("POST", f"/budgets/{budget_id}/categories", {"category_id": cat, "limit": "1.00"}),
            ("PUT", f"/budgets/{budget_id}/categories/{bc}", {"limit": "1.00"}),
            ("DELETE", f"/budgets/{budget_id}/categories/{bc}", None),
            ("GET", f"/budgets/{budget_id}/categories/{bc}/transactions", None),
        ]
    return routes


def test_bob_cannot_touch_alices_ids(bob, alice, alices_data):
    for method, path, body in _alice_id_routes(alices_data):
        resp = bob.request(method, path, json=body)
        assert resp.status_code == 404, f"{method} {path} -> {resp.status_code}: {resp.text}"
        assert "alice" not in resp.text.lower(), f"{method} {path} leaked data"

    # and nothing of Alice's actually changed or went away
    assert alice.get("/categories/").json()["total"] == 1
    assert alice.get("/transactions/").json()["total"] == 1
    assert len(alice.get("/income/").json()) == 2
    assert alice.get(f"/budgets/{alices_data['current_budget_id']}").status_code == 200
    assert (
        alice.get(f"/transactions/{alices_data['transaction_id']}").json()["description"]
        == "alice secret purchase"
    )


def test_bob_cannot_link_his_records_to_alices_category_or_budget(bob, alices_data):
    tx = {
        "amount": "5.00",
        "date": date.today().isoformat(),
        "type": "expense",
        "payment_method": "Cash",
    }
    resp = bob.post("/transactions/", json={**tx, "category_id": alices_data["category_id"]})
    assert resp.status_code in (400, 404), resp.text
    resp = bob.post("/transactions/", json={**tx, "budget_id": alices_data["current_budget_id"]})
    assert resp.status_code in (400, 404), resp.text

    # Bob's own budget cannot adopt Alice's category either
    start = date.today().replace(day=1)
    own = bob.post(
        "/budgets/",
        json={
            "name": "Bob",
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(days=27)).isoformat(),
        },
    ).json()
    resp = bob.post(
        f"/budgets/{own['id']}/categories",
        json={"category_id": alices_data["category_id"], "limit": "1.00"},
    )
    assert resp.status_code in (400, 404), resp.text


def test_bob_cannot_move_his_transaction_into_alices_category(bob, alices_data):
    created = bob.post(
        "/transactions/",
        json={
            "amount": "5.00",
            "date": date.today().isoformat(),
            "type": "income",
        },
    )
    assert created.status_code == 201, created.text
    resp = bob.put(
        f"/transactions/{created.json()['id']}",
        json={"category_id": alices_data["category_id"]},
    )
    assert resp.status_code in (400, 404), resp.text


def test_unauthenticated_requests_are_rejected(client, alices_data):
    for method, path, body in _alice_id_routes(alices_data)[:6] + [
        ("GET", "/categories/", None),
        ("GET", "/transactions/", None),
        ("GET", "/budgets/", None),
        ("GET", "/income/", None),
        ("GET", "/reports/summary", None),
        ("GET", "/reports/transactions/export", None),
    ]:
        resp = client.request(method, path, json=body)
        assert resp.status_code == 401, f"{method} {path} -> {resp.status_code}"
