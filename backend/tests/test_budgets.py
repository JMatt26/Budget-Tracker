from datetime import date, timedelta


def _set_monthly_income(client, amount):
    resp = client.post(
        "/income/", json={"name": "Job", "amount": amount, "frequency": "monthly"}
    )
    assert resp.status_code == 201, resp.text


def test_create_budget(auth_client):
    _set_monthly_income(auth_client, "1000.00")
    today = date.today()
    payload = {
        "name": "January Budget",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }

    resp = auth_client.post("/budgets/", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"] is not None
    assert data["name"] == "January Budget"
    assert data["limit"] == "1000.00"


def test_list_budgets(auth_client):
    today = date.today()
    payload = {
        "name": "Groceries Budget",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }

    auth_client.post("/budgets/", json=payload)

    resp = auth_client.get("/budgets/")
    assert resp.status_code == 200, resp.text

    data = resp.json()

    # New response wrapper
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data

    items = data["items"]

    # Preserve original expectations
    assert isinstance(items, list)
    assert any(b["name"] == "Groceries Budget" for b in items)



def test_get_budget_by_id(auth_client):
    today = date.today()
    payload = {
        "name": "Rent Budget",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=30)).isoformat(),
    }
    create_resp = auth_client.post("/budgets/", json=payload)
    assert create_resp.status_code == 201
    budget_id = create_resp.json()["id"]

    get_resp = auth_client.get(f"/budgets/{budget_id}")
    assert get_resp.status_code == 200, get_resp.text
    data = get_resp.json()

    assert data["id"] == budget_id
    assert data["name"] == "Rent Budget"


def test_budget_status_tracks_expenses(auth_client):
    _set_monthly_income(auth_client, "500.00")
    today = date.today()
    end = today + timedelta(days=30)

    # 1. Create a budget
    budget_payload = {
        "name": "Food Budget",
        "start_date": today.isoformat(),
        "end_date": end.isoformat(),
    }
    budget_resp = auth_client.post("/budgets/", json=budget_payload)
    assert budget_resp.status_code == 201, budget_resp.text
    budget_id = budget_resp.json()["id"]

    # 2. Create two expense transactions within the budget period and linked to this budget
    tx1_payload = {
        "amount": "100.00",
        "description": "Groceries 1",
        "date": today.isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
        "budget_id": budget_id,
    }
    tx2_payload = {
        "amount": "50.00",
        "description": "Groceries 2",
        "date": (today + timedelta(days=1)).isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
        "budget_id": budget_id,
    }

    resp1 = auth_client.post("/transactions/", json=tx1_payload)
    resp2 = auth_client.post("/transactions/", json=tx2_payload)
    assert resp1.status_code == 201, resp1.text
    assert resp2.status_code == 201, resp2.text

    # 3. Check budget status
    status_resp = auth_client.get(f"/budgets/{budget_id}/status")
    assert status_resp.status_code == 200, status_resp.text

    data = status_resp.json()
    totals_expense = data["total_expense"]
    remaining = data["remaining"]
    exceeded = data["exceeded"]

    assert totals_expense == "150.00"
    assert remaining == "500.00"
    assert exceeded is False


def test_budget_status_tracks_investment_and_income(auth_client):
    _set_monthly_income(auth_client, "500.00")
    today = date.today()
    end = today + timedelta(days=30)

    budget_payload = {
        "name": "Mixed Budget",
        "start_date": today.isoformat(),
        "end_date": end.isoformat(),
    }
    budget_resp = auth_client.post("/budgets/", json=budget_payload)
    assert budget_resp.status_code == 201, budget_resp.text
    budget_id = budget_resp.json()["id"]

    expense_payload = {
        "amount": "100.00",
        "description": "Groceries",
        "date": today.isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
        "budget_id": budget_id,
    }
    investment_payload = {
        "amount": "50.00",
        "description": "Brokerage transfer",
        "date": today.isoformat(),
        "type": "investment",
        "category_id": None,
        "budget_id": budget_id,
    }
    income_payload = {
        "amount": "30.00",
        "description": "Refund",
        "date": today.isoformat(),
        "type": "income",
        "category_id": None,
        "budget_id": budget_id,
    }

    assert auth_client.post("/transactions/", json=expense_payload).status_code == 201
    assert auth_client.post("/transactions/", json=investment_payload).status_code == 201
    assert auth_client.post("/transactions/", json=income_payload).status_code == 201

    status_resp = auth_client.get(f"/budgets/{budget_id}/status")
    assert status_resp.status_code == 200, status_resp.text

    data = status_resp.json()
    assert data["total_expense"] == "100.00"
    assert data["total_investment"] == "50.00"
    assert data["total_income"] == "30.00"
    # saved = 30 - 100 - 50 = -120; remaining = 500 - 100 - 50 - (-120)
    assert data["remaining"] == "470.00"
    assert data["exceeded"] is False


def test_budget_status_prorates_limit_for_sub_period(auth_client):
    _set_monthly_income(auth_client, "400.00")
    today = date.today()
    # A clean 28-day budget so a 7-day week is an exact quarter of it.
    start = today
    end = today + timedelta(days=27)

    budget_payload = {
        "name": "Four Week Budget",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }
    budget_resp = auth_client.post("/budgets/", json=budget_payload)
    assert budget_resp.status_code == 201, budget_resp.text
    budget_id = budget_resp.json()["id"]

    week1_start = start
    week1_end = start + timedelta(days=6)
    week2_start = start + timedelta(days=7)

    in_week1_payload = {
        "amount": "40.00",
        "description": "Week 1 expense",
        "date": week1_start.isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
        "budget_id": budget_id,
    }
    in_week2_payload = {
        "amount": "999.00",
        "description": "Week 2 expense, should not count toward week 1",
        "date": week2_start.isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
        "budget_id": budget_id,
    }

    assert auth_client.post("/transactions/", json=in_week1_payload).status_code == 201
    assert auth_client.post("/transactions/", json=in_week2_payload).status_code == 201

    status_resp = auth_client.get(
        f"/budgets/{budget_id}/status",
        params={
            "start_date": week1_start.isoformat(),
            "end_date": week1_end.isoformat(),
        },
    )
    assert status_resp.status_code == 200, status_resp.text

    data = status_resp.json()
    assert data["period_start"] == week1_start.isoformat()
    assert data["period_end"] == week1_end.isoformat()
    # 400 * (7 days / 28 days) = 100
    assert data["period_limit"] == "100.00"
    assert data["total_expense"] == "40.00"
    # no income logged, so remaining is the whole prorated limit
    assert data["remaining"] == "100.00"
    assert data["exceeded"] is False


def test_budget_status_rejects_sub_period_out_of_order(auth_client):
    today = date.today()
    budget_payload = {
        "name": "Order Check Budget",
        "start_date": today.isoformat(),
        "end_date": (today + timedelta(days=13)).isoformat(),
    }
    budget_resp = auth_client.post("/budgets/", json=budget_payload)
    budget_id = budget_resp.json()["id"]

    resp = auth_client.get(
        f"/budgets/{budget_id}/status",
        params={
            "start_date": (today + timedelta(days=10)).isoformat(),
            "end_date": (today + timedelta(days=2)).isoformat(),
        },
    )
    assert resp.status_code == 400


def test_budget_limit_is_total_monthly_income(auth_client):
    # 1200/month + 100/week (= 433.33/month) + 24 * 50 per year (= 100/month)
    for name, amount, freq in [
        ("Job", "1200.00", "monthly"),
        ("Side", "100.00", "weekly"),
        ("Twice", "50.00", "semimonthly"),
    ]:
        resp = auth_client.post(
            "/income/", json={"name": name, "amount": amount, "frequency": freq}
        )
        assert resp.status_code == 201, resp.text

    today = date.today()
    created = auth_client.post(
        "/budgets/",
        json={
            "name": "Income Budget",
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=29)).isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    budget_id = created.json()["id"]
    assert created.json()["limit"] == "1733.33"

    # Follows income changes without touching the budget.
    income_id = auth_client.get("/income/").json()[0]["id"]
    auth_client.put(f"/income/{income_id}", json={"amount": "2200.00"})
    assert auth_client.get(f"/budgets/{budget_id}").json()["limit"] == "2733.33"
    assert auth_client.get("/budgets/").json()["items"][0]["limit"] == "2733.33"
    assert auth_client.get(f"/budgets/{budget_id}/status").json()["period_limit"] == "2733.33"


def _budget_with_category(auth_client, start, end):
    budget_id = auth_client.post(
        "/budgets/",
        json={"name": "B", "start_date": start.isoformat(), "end_date": end.isoformat()},
    ).json()["id"]
    cat_id = auth_client.post(
        "/categories/", json={"name": "Food", "type": "expense"}
    ).json()["id"]
    resp = auth_client.post(
        f"/budgets/{budget_id}/categories", json={"category_id": cat_id, "limit": "200.00"}
    )
    assert resp.status_code == 201, resp.text
    return budget_id, cat_id


def _post_tx(auth_client, budget_id, cat_id, day, amount, tx_type="expense"):
    payload = {
        "amount": amount,
        "date": day.isoformat(),
        "type": tx_type,
        "category_id": cat_id,
        "budget_id": budget_id,
    }
    if tx_type == "expense":
        payload["payment_method"] = "Cash"
    assert auth_client.post("/transactions/", json=payload).status_code == 201


def test_category_spending_counts_only_expenses(auth_client):
    today = date.today()
    budget_id, cat_id = _budget_with_category(auth_client, today, today + timedelta(days=13))
    _post_tx(auth_client, budget_id, cat_id, today, "40.00")
    _post_tx(auth_client, budget_id, cat_id, today, "500.00", "income")
    _post_tx(auth_client, budget_id, cat_id, today, "60.00", "investment")

    cats = auth_client.get(f"/budgets/{budget_id}/categories").json()
    assert cats[0]["actual_spending"] == "40.00"


def test_category_spending_respects_sub_period(auth_client):
    today = date.today()
    budget_id, cat_id = _budget_with_category(auth_client, today, today + timedelta(days=13))
    _post_tx(auth_client, budget_id, cat_id, today, "10.00")
    _post_tx(auth_client, budget_id, cat_id, today + timedelta(days=8), "25.00")

    week2 = {
        "start_date": (today + timedelta(days=7)).isoformat(),
        "end_date": (today + timedelta(days=13)).isoformat(),
    }
    cats = auth_client.get(f"/budgets/{budget_id}/categories", params=week2).json()
    assert cats[0]["actual_spending"] == "25.00"


def test_expense_breakdown_groups_by_category(auth_client):
    today = date.today()
    budget_id, cat_id = _budget_with_category(auth_client, today, today + timedelta(days=13))
    other_id = auth_client.post(
        "/categories/", json={"name": "Fun", "type": "expense"}
    ).json()["id"]  # never added to the budget

    _post_tx(auth_client, budget_id, cat_id, today, "30.00")
    _post_tx(auth_client, budget_id, cat_id, today, "20.00")
    _post_tx(auth_client, budget_id, other_id, today, "70.00")
    _post_tx(auth_client, budget_id, None, today, "5.00")
    _post_tx(auth_client, budget_id, cat_id, today, "999.00", "income")

    data = auth_client.get(f"/budgets/{budget_id}/expense-breakdown").json()
    assert data["total_expense"] == "125.00"
    assert [(i["category_name"], i["total"]) for i in data["items"]] == [
        ("Fun", "70.00"),
        ("Food", "50.00"),
        ("Uncategorized", "5.00"),
    ]
    food = next(i for i in data["items"] if i["category_name"] == "Food")
    assert food["limit"] == "200.00"
    assert next(i for i in data["items"] if i["category_name"] == "Fun")["limit"] is None


def test_expense_breakdown_404_for_unknown_budget(auth_client):
    assert auth_client.get("/budgets/999/expense-breakdown").status_code == 404
