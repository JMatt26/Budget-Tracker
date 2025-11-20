from app import models


def test_create_category(client):
    payload = {
        "name": "Groceries",
        "type": "expense",
    }

    resp = client.post("/categories/", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"] is not None
    assert data["name"] == "Groceries"
    assert data["type"] == "expense"


def test_create_category_duplicate_name_fails(client):
    payload = {
        "name": "Salary",
        "type": "income",
    }

    # First create should succeed
    resp1 = client.post("/categories/", json=payload)
    assert resp1.status_code == 201

    # Second with same name should fail
    resp2 = client.post("/categories/", json=payload)
    assert resp2.status_code == 400
    body = resp2.json()
    assert "already exists" in body["detail"]


def test_list_categories(client):
    # Ensure at least one category exists
    payload = {"name": "Rent", "type": "expense"}
    client.post("/categories/", json=payload)

    resp = client.get("/categories/")
    assert resp.status_code == 200
    items = resp.json()

    assert isinstance(items, list)
    assert any(cat["name"] == "Rent" for cat in items)


def test_get_category_by_id(client):
    # create one category first
    payload = {"name": "Investments", "type": "income"}
    create_resp = client.post("/categories/", json=payload)
    assert create_resp.status_code == 201
    cat_id = create_resp.json()["id"]

    get_resp = client.get(f"/categories/{cat_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == cat_id
    assert data["name"] == "Investments"


def test_delete_category_without_transactions(client):
    payload = {"name": "Misc", "type": "expense"}
    resp = client.post("/categories/", json=payload)
    assert resp.status_code == 201
    cat_id = resp.json()["id"]

    del_resp = client.delete(f"/categories/{cat_id}")
    assert del_resp.status_code == 204

    # verify it's gone
    get_resp = client.get(f"/categories/{cat_id}")
    assert get_resp.status_code == 404

def test_delete_category_with_existing_transaction_fails(client):
    # 1. Create a category
    cat_payload = {
        "name": "Food",
        "type": "expense"
    }
    cat_resp = client.post("/categories/", json=cat_payload)
    assert cat_resp.status_code == 201
    category_id = cat_resp.json()["id"]

    # 2. Create a transaction that uses this category
    tx_payload = {
        "amount": "12.34",
        "description": "Burger",
        "date": "2025-11-19",
        "type": "expense",
        "category_id": category_id,
    }
    tx_resp = client.post("/transactions/", json=tx_payload)
    assert tx_resp.status_code == 201

    # 3. Attempt to delete the category
    del_resp = client.delete(f"/categories/{category_id}")

    # 4. Assert deletion is rejected
    assert del_resp.status_code == 400
    body = del_resp.json()
    assert "existing transactions" in body["detail"]
