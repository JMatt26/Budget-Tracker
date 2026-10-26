from datetime import date, timedelta

from sqlalchemy import create_engine, text

from app.budget_cycles import _add_months, infer_recurrence, next_cycle_dates


def _first_of_month(d: date) -> date:
    return d.replace(day=1)


def _create(client, **overrides):
    payload = {"name": "Monthly", **overrides}
    resp = client.post("/budgets/", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _past_monthly(client, months_ago=2):
    start = _add_months(_first_of_month(date.today()), -months_ago)
    end = _add_months(start, 1) - timedelta(days=1)
    return _create(
        client,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        recurrence="monthly",
    )


def test_next_cycle_dates():
    assert next_cycle_dates(date(2026, 10, 31), "monthly") == (date(2026, 11, 1), date(2026, 11, 30))
    assert next_cycle_dates(date(2026, 12, 31), "monthly") == (date(2027, 1, 1), date(2027, 1, 31))
    assert next_cycle_dates(date(2026, 10, 14), "monthly") == (date(2026, 10, 15), date(2026, 11, 14))
    assert next_cycle_dates(date(2026, 10, 25), "weekly") == (date(2026, 10, 26), date(2026, 11, 1))


def test_infer_recurrence():
    assert infer_recurrence(date(2026, 2, 1), date(2026, 2, 28)) == "monthly"
    assert infer_recurrence(date(2026, 10, 19), date(2026, 10, 25)) == "weekly"
    assert infer_recurrence(date(2026, 10, 3), date(2026, 10, 20)) is None


def test_create_budget_starts_its_own_series(auth_client):
    budget = _create(auth_client, start_date="2026-10-01", end_date="2026-10-31")
    assert budget["series_id"] == budget["id"]
    assert budget["recurrence"] is None


def test_ended_recurring_budget_rolls_over_with_limits_and_targets(auth_client):
    first = _past_monthly(auth_client, months_ago=2)
    cat = auth_client.post(
        f"/budgets/{first['id']}/categories",
        json={"category_name": "Food", "category_type": "expense", "limit": "300.00"},
    )
    assert cat.status_code == 201, cat.text
    auth_client.put(f"/budgets/{first['id']}/targets", json={"spending": "900.00"})

    items = auth_client.get("/budgets/").json()["items"]
    # Only the current cycle is listed
    assert len(items) == 1
    current = items[0]
    assert current["id"] != first["id"]
    assert current["series_id"] == first["id"]
    assert current["start_date"] == _first_of_month(date.today()).isoformat()
    assert current["recurrence"] == "monthly"

    cats = auth_client.get(f"/budgets/{current['id']}/categories").json()
    assert [(c["category"]["name"], c["limit"]) for c in cats] == [("Food", "300.00")]
    assert auth_client.get(f"/budgets/{current['id']}/targets").json()["spending"] == "900.00"

    # The skipped month was created too, so history has three cycles
    history = auth_client.get(f"/budgets/{first['id']}/history").json()
    assert history["current_id"] == current["id"]
    assert [c["is_current"] for c in history["items"]] == [True, False, False]
    assert history["items"][-1]["id"] == first["id"]


def test_one_off_budget_does_not_roll_over(auth_client):
    start = _add_months(_first_of_month(date.today()), -1)
    budget = _create(
        auth_client,
        start_date=start.isoformat(),
        end_date=(_add_months(start, 1) - timedelta(days=1)).isoformat(),
    )
    items = auth_client.get("/budgets/").json()["items"]
    assert [b["id"] for b in items] == [budget["id"]]
    history = auth_client.get(f"/budgets/{budget['id']}/history").json()
    assert [c["id"] for c in history["items"]] == [budget["id"]]


def test_history_totals_per_cycle(auth_client):
    first = _past_monthly(auth_client, months_ago=1)
    auth_client.post(
        "/transactions/",
        json={
            "amount": "40.00",
            "date": first["start_date"],
            "type": "expense",
            "payment_method": "Visa",
            "budget_id": first["id"],
        },
    )
    history = auth_client.get(f"/budgets/{first['id']}/history").json()
    by_id = {c["id"]: c for c in history["items"]}
    assert by_id[first["id"]]["total_expense"] == "40.00"
    assert by_id[history["current_id"]]["total_expense"] == "0"


def test_transaction_lands_in_cycle_covering_its_date(auth_client):
    first = _past_monthly(auth_client, months_ago=1)
    # Linked to the old cycle but dated today: belongs to the current cycle
    resp = auth_client.post(
        "/transactions/",
        json={
            "amount": "10.00",
            "date": date.today().isoformat(),
            "type": "income",
            "budget_id": first["id"],
        },
    )
    assert resp.status_code == 201, resp.text
    current_id = auth_client.get(f"/budgets/{first['id']}/history").json()["current_id"]
    assert resp.json()["budget_id"] == current_id

    # Moving it back into last month moves it to that cycle
    resp = auth_client.put(
        f"/transactions/{resp.json()['id']}", json={"date": first["start_date"]}
    )
    assert resp.json()["budget_id"] == first["id"]


def test_delete_removes_whole_series(auth_client):
    first = _past_monthly(auth_client, months_ago=1)
    current_id = auth_client.get(f"/budgets/{first['id']}/history").json()["current_id"]
    assert auth_client.delete(f"/budgets/{current_id}").status_code == 204
    assert auth_client.get("/budgets/").json()["items"] == []
    assert auth_client.get(f"/budgets/{first['id']}").status_code == 404


def test_turning_off_recurrence_stops_rollover(auth_client):
    budget = _create(
        auth_client,
        start_date=date.today().isoformat(),
        end_date=date.today().isoformat(),
        recurrence="weekly",
    )
    resp = auth_client.put(f"/budgets/{budget['id']}", json={"recurrence": None})
    assert resp.json()["recurrence"] is None


def test_upgrade_schema_adds_columns_and_infers_recurrence(tmp_path):
    from app.schema_upgrades import upgrade_schema

    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        conn.execute(text(
            'CREATE TABLE budgets (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL, '
            '"limit" NUMERIC(10, 2) NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, '
            'user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL, '
            'updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL)'
        ))
        conn.execute(text(
            "INSERT INTO budgets (id, name, \"limit\", start_date, end_date, user_id) VALUES "
            "(1, 'Month', 0, '2026-10-01', '2026-10-31', 1), "
            "(2, 'Week', 0, '2026-10-19', '2026-10-25', 1), "
            "(3, 'Trip', 0, '2026-10-03', '2026-10-20', 1)"
        ))

    upgrade_schema(engine)
    upgrade_schema(engine)  # idempotent

    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, recurrence, series_id FROM budgets ORDER BY id")).all()
    assert rows == [(1, "monthly", 1), (2, "weekly", 2), (3, None, 3)]
