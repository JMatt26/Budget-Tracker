from datetime import date, timedelta


def test_create_budget(client):
    today = date.today()
    payload = {
        "name": "January Budget",
        "limit": "1000.00",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }

    resp = client.post("/budgets/", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"] is not None
    assert data["name"] == "January Budget"
    assert data["limit"] == "1000.00"


def test_list_budgets(client):
    today = date.today()
    payload = {
        "name": "Groceries Budget",
        "limit": "400.00",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }
    client.post("/budgets/", json=payload)

    resp = client.get("/budgets/")
    assert resp.status_code == 200, resp.text
    items = resp.json()

    assert isinstance(items, list)
    assert any(b["name"] == "Groceries Budget" for b in items)


def test_get_budget_by_id(client):
    today = date.today()
    payload = {
        "name": "Rent Budget",
        "limit": "800.00",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }
    create_resp = client.post("/budgets/", json=payload)
    assert create_resp.status_code == 201
    budget_id = create_resp.json()["id"]

    get_resp = client.get(f"/budgets/{budget_id}")
    assert get_resp.status_code == 200, get_resp.text
    data = get_resp.json()

    assert data["id"] == budget_id
    assert data["name"] == "Rent Budget"


def test_budget_status_tracks_expenses(client):
    today = date.today()
    end = today + timedelta(days=30)

    # 1. Create a budget
    budget_payload = {
        "name": "Food Budget",
        "limit": "500.00",
        "start_date": today.isoformat(),
        "end_date": end.isoformat(),
    }
    budget_resp = client.post("/budgets/", json=budget_payload)
    assert budget_resp.status_code == 201, budget_resp.text
    budget_id = budget_resp.json()["id"]

    # 2. Create two expense transactions within the budget period and linked to this budget
    tx1_payload = {
        "amount": "100.00",
        "description": "Groceries 1",
        "date": today.isoformat(),
        "type": "expense",
        "category_id": None,
        "budget_id": budget_id,
    }
    tx2_payload = {
        "amount": "50.00",
        "description": "Groceries 2",
        "date": (today + timedelta(days=1)).isoformat(),
        "type": "expense",
        "category_id": None,
        "budget_id": budget_id,
    }

    resp1 = client.post("/transactions/", json=tx1_payload)
    resp2 = client.post("/transactions/", json=tx2_payload)
    assert resp1.status_code == 201, resp1.text
    assert resp2.status_code == 201, resp2.text

    # 3. Check budget status
    status_resp = client.get(f"/budgets/{budget_id}/status")
    assert status_resp.status_code == 200, status_resp.text

    data = status_resp.json()
    totals_expense = data["total_expense"]
    remaining = data["remaining"]
    exceeded = data["exceeded"]

    assert totals_expense == "150.00"
    assert remaining == "350.00"
    assert exceeded is False
