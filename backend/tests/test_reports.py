from datetime import date
from decimal import Decimal
from starlette.testclient import TestClient


def test_summary_no_transactions(auth_client):
    resp = auth_client.get("/reports/summary")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    totals = data["totals"]

    assert totals["total_income"] == "0"
    assert totals["total_expense"] == "0"
    assert totals["net"] == "0"


def test_summary_with_transactions(auth_client):
    # Create an income transaction
    income_payload = {
        "amount": "1000.00",
        "description": "Salary",
        "date": date.today().isoformat(),
        "type": "income",
        "category_id": None,
    }
    resp_income = auth_client.post("/transactions/", json=income_payload)
    assert resp_income.status_code == 201, resp_income.text

    # Create an expense transaction
    expense_payload = {
        "amount": "250.00",
        "description": "Rent",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }
    resp_expense = auth_client.post("/transactions/", json=expense_payload)
    assert resp_expense.status_code == 201, resp_expense.text

    # Call summary
    resp = auth_client.get("/reports/summary")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    totals = data["totals"]

    assert totals["total_income"] == "1000.00"
    assert totals["total_expense"] == "250.00"
    assert totals["net"] == "750.00"



def test_summary_grouped_by_category(auth_client: TestClient):
    # Create two categories: one expense, one income
    food_resp = auth_client.post(
        "/categories",
        json={"name": "Food", "type": "expense"},
    )
    assert food_resp.status_code == 201, food_resp.text
    food_id = food_resp.json()["id"]

    salary_resp = auth_client.post(
        "/categories",
        json={"name": "Salary", "type": "income"},
    )
    assert salary_resp.status_code == 201, salary_resp.text
    salary_id = salary_resp.json()["id"]

    # Create one expense in Food and one income in Salary
    tx1 = {
        "amount": 50.0,
        "description": "Groceries",
        "date": "2025-01-01",
        "type": "expense",
        "category_id": food_id,
    }
    tx2 = {
        "amount": 1000.0,
        "description": "Paycheck",
        "date": "2025-01-02",
        "type": "income",
        "category_id": salary_id,
    }

    r1 = auth_client.post("/transactions", json=tx1)
    assert r1.status_code == 201, r1.text
    r2 = auth_client.post("/transactions", json=tx2)
    assert r2.status_code == 201, r2.text

    # Request summary grouped by category
    resp = auth_client.get("/reports/summary?group_by=category")
    assert resp.status_code == 200, resp.text

    data = resp.json()
    assert "totals" in data
    assert "by_category" in data

    groups = data["by_category"]
    assert isinstance(groups, list)

    def find_group(name: str):
        return next((g for g in groups if g["category_name"] == name), None)

    food_group = find_group("Food")
    salary_group = find_group("Salary")

    assert food_group is not None
    assert salary_group is not None

    # Amounts are serialized as strings; compare via Decimal
    assert Decimal(food_group["total_expense"]) == Decimal("50.00")
    assert Decimal(food_group["total_income"]) == Decimal("0")
    assert Decimal(salary_group["total_income"]) == Decimal("1000.00")
    assert Decimal(salary_group["total_expense"]) == Decimal("0")


def test_transactions_export_csv(auth_client: TestClient):
    # Create a couple of transactions to show up in the export
    tx_payload = {
        "amount": 42.5,
        "description": "Test export",
        "date": "2025-01-03",
        "type": "expense",
    }
    resp_create = auth_client.post("/transactions", json=tx_payload)
    assert resp_create.status_code == 201, resp_create.text

    resp = auth_client.get("/reports/transactions/export")
    assert resp.status_code == 200

    # Content type should be CSV
    assert resp.headers["content-type"].startswith("text/csv")

    body = resp.text
    # Header row should be present
    assert "id,date,amount,type,description,category_id,budget_id" in body
    # Our transaction description should appear somewhere in the CSV
    assert "Test export" in body
