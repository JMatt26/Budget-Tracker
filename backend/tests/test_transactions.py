from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.db import get_db
from app import models


def _get_db_from_client(client) -> Session:
    # Assumes your `conftest.py` overrides get_db dependency to use a test session
    return next(get_db())


def test_create_transaction(client):
    payload = {
        "amount": "123.45",
        "description": "Grocery shopping",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }

    response = client.post("/transactions/", json=payload)
    assert response.status_code == 201, response.text

    data = response.json()
    assert data["id"] is not None
    assert data["amount"] == payload["amount"]
    assert data["description"] == payload["description"]
    assert data["type"] == payload["type"]


def test_list_transactions_returns_created_transaction(client):
    # create one transaction
    payload = {
        "amount": "50.00",
        "description": "Test income",
        "date": date.today().isoformat(),
        "type": "income",
        "category_id": None,
    }
    create_resp = client.post("/transactions/", json=payload)
    assert create_resp.status_code == 201

    # list transactions
    list_resp = client.get("/transactions/")
    assert list_resp.status_code == 200

    items = list_resp.json()
    assert isinstance(items, list)
    assert any(tx["description"] == "Test income" for tx in items)


def test_get_transaction_by_id(client):
    # create
    payload = {
        "amount": "10.00",
        "description": "Coffee",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }
    resp = client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    # get
    get_resp = client.get(f"/transactions/{tx_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == tx_id
    assert data["description"] == "Coffee"


def test_update_transaction(client):
    # create
    payload = {
        "amount": "20.00",
        "description": "Old desc",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }
    resp = client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    # update
    update_payload = {
        "description": "New desc",
        "amount": "25.00",
    }
    upd_resp = client.put(f"/transactions/{tx_id}", json=update_payload)
    assert upd_resp.status_code == 200
    data = upd_resp.json()
    assert data["description"] == "New desc"
    assert data["amount"] == "25.00"


def test_delete_transaction(client):
    payload = {
        "amount": "5.00",
        "description": "To delete",
        "date": date.today().isoformat(),
        "type": "expense",
        "category_id": None,
    }
    resp = client.post("/transactions/", json=payload)
    assert resp.status_code == 201
    tx_id = resp.json()["id"]

    del_resp = client.delete(f"/transactions/{tx_id}")
    assert del_resp.status_code == 204

    # verify it is actually gone
    get_resp = client.get(f"/transactions/{tx_id}")
    assert get_resp.status_code == 404
