from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db import get_db
from app import models


def _get_db_from_auth_client(auth_client) -> Session:
    # Assumes your `conftest.py` overrides get_db dependency to use a test session
    return next(get_db())


def test_create_transaction(auth_client):
    payload = {
        "amount": "123.45",
        "description": "Grocery shopping",
        "date": date.today().isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
    }

    response = auth_client.post("/transactions/", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert data["id"] is not None
    assert data["amount"] == 123.45
    assert data["description"] == payload["description"]
    assert data["type"] == payload["type"]


def test_list_transactions_returns_created_transaction(auth_client):
    # Arrange: create one transaction
    create_payload = {
        "amount": 50.0,
        "description": "Groceries",
        "date": "2025-01-01",
        "type": "expense",
        "payment_method": "Cash",
    }
    create_resp = auth_client.post("/transactions", json=create_payload)
    assert create_resp.status_code == 201, create_resp.text

    # Act
    resp = auth_client.get("/transactions")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Assert wrapper shape
    assert "items" in data
    assert "total" in data
    assert "limit" in data
    assert "offset" in data

    assert data["total"] == 1
    assert len(data["items"]) == 1
    tx = data["items"][0]
    assert tx["amount"] == 50.0
    assert tx["description"] == "Groceries"
    assert tx["type"] == "expense"


def test_list_transactions_pagination_metadata(auth_client):
    # Create 3 transactions
    for i in range(3):
        payload = {
            "amount": 10.0 + i,
            "description": f"Tx {i}",
            "date": "2025-01-01",
            "type": "expense",
            "payment_method": "Cash",
        }
        resp = auth_client.post("/transactions", json=payload)
        assert resp.status_code == 201, resp.text

    # Request with limit=2
    resp = auth_client.get("/transactions?limit=2&offset=0")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total"] == 3
    assert data["limit"] == 2
    assert data["offset"] == 0
    assert len(data["items"]) == 2

    # Sanity-check at least one item shape
    first = data["items"][0]
    assert "amount" in first
    assert "description" in first
    assert "type" in first


def test_get_transaction_by_id(auth_client):
    # create
    payload = {
        "amount": "10.00",
        "description": "Coffee",
        "date": date.today().isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
    }
    resp = auth_client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    # get
    get_resp = auth_client.get(f"/transactions/{tx_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == tx_id
    assert data["description"] == "Coffee"


def test_update_transaction(auth_client):
    # create
    payload = {
        "amount": "20.00",
        "description": "Old desc",
        "date": date.today().isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
    }
    resp = auth_client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    # update
    update_payload = {
        "description": "New desc",
        "amount": "25.00",
    }
    upd_resp = auth_client.put(f"/transactions/{tx_id}", json=update_payload)
    assert upd_resp.status_code == 200
    data = upd_resp.json()
    assert data["description"] == "New desc"
    assert data["amount"] == 25.00


def test_delete_transaction(auth_client):
    payload = {
        "amount": "5.00",
        "description": "To delete",
        "date": date.today().isoformat(),
        "type": "expense",
        "payment_method": "Cash",
        "category_id": None,
    }
    resp = auth_client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    del_resp = auth_client.delete(f"/transactions/{tx_id}")
    assert del_resp.status_code == 204

    # verify it is actually gone
    get_resp = auth_client.get(f"/transactions/{tx_id}")
    assert get_resp.status_code == 404


def _tx(**overrides):
    return {
        "amount": "12.50",
        "date": "2025-01-15",
        "type": "expense",
        "payment_method": "Visa",
        **overrides,
    }


def test_expense_requires_payment_method(auth_client):
    payload = _tx()
    del payload["payment_method"]
    resp = auth_client.post("/transactions/", json=payload)
    assert resp.status_code == 422, resp.text


def test_expense_rejects_unknown_payment_method(auth_client):
    resp = auth_client.post("/transactions/", json=_tx(payment_method="Mastercard"))
    assert resp.status_code == 422, resp.text


def test_expense_accepts_each_payment_method(auth_client):
    for method in ["Amex", "Visa", "Debit", "Cash"]:
        resp = auth_client.post("/transactions/", json=_tx(payment_method=method))
        assert resp.status_code == 201, resp.text
        assert resp.json()["payment_method"] == method


def test_non_expense_payment_method_is_ignored(auth_client):
    income = {"amount": "100.00", "date": "2025-01-15", "type": "income"}
    resp = auth_client.post("/transactions/", json=income)
    assert resp.status_code == 201, resp.text
    assert resp.json()["payment_method"] is None

    resp = auth_client.post("/transactions/", json={**income, "payment_method": "Cash"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["payment_method"] is None


def test_update_payment_method_and_type_changes(auth_client):
    tx_id = auth_client.post("/transactions/", json=_tx()).json()["id"]

    resp = auth_client.put(f"/transactions/{tx_id}", json={"payment_method": "Amex"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["payment_method"] == "Amex"

    # Becoming income clears the method...
    resp = auth_client.put(f"/transactions/{tx_id}", json={"type": "income"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["payment_method"] is None

    # ...and becoming an expense again needs one.
    resp = auth_client.put(f"/transactions/{tx_id}", json={"type": "expense"})
    assert resp.status_code == 422, resp.text
    resp = auth_client.put(
        f"/transactions/{tx_id}", json={"type": "expense", "payment_method": "Debit"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["payment_method"] == "Debit"
