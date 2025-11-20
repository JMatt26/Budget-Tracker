from datetime import date


def test_summary_no_transactions(client):
    resp = client.get("/reports/summary")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    totals = data["totals"]

    assert totals["total_income"] == "0"
    assert totals["total_expense"] == "0"
    assert totals["net"] == "0"


def test_summary_with_transactions(client):
    # Create an income transaction
    income_payload = {
        "amount": "1000.00",
        "description": "Salary",
        "date": date.today().isoformat(),
        "type": "income",
        "category_id": None,
    }
    resp_income = client.post("/transactions/", json=income_payload)
    assert resp_income.status_code == 201, resp_income.text

    # Create an expense transaction
    expense_payload = {
        "amount": "250.00",
        "description": "Rent",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }
    resp_expense = client.post("/transactions/", json=expense_payload)
    assert resp_expense.status_code == 201, resp_expense.text

    # Call summary
    resp = client.get("/reports/summary")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    totals = data["totals"]

    assert totals["total_income"] == "1000.00"
    assert totals["total_expense"] == "250.00"
    assert totals["net"] == "750.00"
