from app import models


def test_create_category(auth_client):
    payload = {
        "name": "Groceries",
        "type": "expense",
        "payment_method": "Cash",
    }

    resp = auth_client.post("/categories/", json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()

    assert data["id"] is not None
    assert data["name"] == "Groceries"
    assert data["type"] == "expense"


def test_create_category_duplicate_name_fails(auth_client):
    payload = {
        "name": "Salary",
        "type": "income",
    }

    # First create should succeed
    resp1 = auth_client.post("/categories/", json=payload)
    assert resp1.status_code == 201

    # Second with same name should fail
    resp2 = auth_client.post("/categories/", json=payload)
    assert resp2.status_code == 400
    body = resp2.json()
    assert "already exists" in body["detail"]


# tests/test_categories.py
def test_list_categories(auth_client):
    payload = {"name": "Food", "type": "expense"}
    create_resp = auth_client.post("/categories", json=payload)
    assert create_resp.status_code == 201

    resp = auth_client.get("/categories")
    assert resp.status_code == 200
    data = resp.json()

    assert "items" in data
    assert "total" in data
    assert data["total"] == 1
    assert len(data["items"]) == 1

    category = data["items"][0]
    assert category["name"] == "Food"



def test_get_category_by_id(auth_client):
    # create one category first
    payload = {"name": "Investments", "type": "income"}
    create_resp = auth_client.post("/categories/", json=payload)
    assert create_resp.status_code == 201
    cat_id = create_resp.json()["id"]

    get_resp = auth_client.get(f"/categories/{cat_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == cat_id
    assert data["name"] == "Investments"


def test_delete_category_without_transactions(auth_client):
    payload = {"name": "Misc", "type": "expense"}
    resp = auth_client.post("/categories/", json=payload)
    assert resp.status_code == 201
    cat_id = resp.json()["id"]

    del_resp = auth_client.delete(f"/categories/{cat_id}")
    assert del_resp.status_code == 204

    # verify it's gone
    get_resp = auth_client.get(f"/categories/{cat_id}")
    assert get_resp.status_code == 404

def test_delete_category_with_existing_transaction_fails(auth_client):
    # 1. Create a category
    cat_payload = {
        "name": "Food",
        "type": "expense"
    }
    cat_resp = auth_client.post("/categories/", json=cat_payload)
    assert cat_resp.status_code == 201
    category_id = cat_resp.json()["id"]

    # 2. Create a transaction that uses this category
    tx_payload = {
        "amount": "12.34",
        "description": "Burger",
        "date": "2025-11-19",
        "type": "expense",
        "payment_method": "Cash",
        "category_id": category_id,
    }
    tx_resp = auth_client.post("/transactions/", json=tx_payload)
    assert tx_resp.status_code == 201

    # 3. Attempt to delete the category
    del_resp = auth_client.delete(f"/categories/{category_id}")

    # 4. Assert deletion is rejected
    assert del_resp.status_code == 400
    body = del_resp.json()
    assert "existing transactions" in body["detail"]


def test_two_users_can_use_the_same_category_name(make_user_client):
    alice = make_user_client("alice@example.com")
    bob = make_user_client("bob@example.com")

    payload = {"name": "Food", "type": "expense"}
    assert alice.post("/categories/", json=payload).status_code == 201
    assert bob.post("/categories/", json=payload).status_code == 201

    # each user still only sees their own
    assert alice.get("/categories/").json()["total"] == 1
    assert bob.get("/categories/").json()["total"] == 1


def test_rename_to_other_users_name_is_allowed(make_user_client):
    alice = make_user_client("alice@example.com")
    bob = make_user_client("bob@example.com")

    alice.post("/categories/", json={"name": "Food", "type": "expense"})
    bob_cat = bob.post("/categories/", json={"name": "Meals", "type": "expense"}).json()

    resp = bob.put(f"/categories/{bob_cat['id']}", json={"name": "Food"})
    assert resp.status_code == 200, resp.text


def test_same_user_still_cannot_duplicate_on_rename(auth_client):
    auth_client.post("/categories/", json={"name": "Food", "type": "expense"})
    other = auth_client.post(
        "/categories/", json={"name": "Meals", "type": "expense"}
    ).json()

    resp = auth_client.put(f"/categories/{other['id']}", json={"name": "Food"})
    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]


def test_unique_constraint_backs_up_the_router_check(auth_client):
    """If two requests race past the duplicate check, the database constraint
    must still reject the second one with the same 400, not a 500."""
    from unittest.mock import patch

    from app.routers import categories as categories_router

    auth_client.post("/categories/", json={"name": "Food", "type": "expense"})

    class _NoDuplicateFound:
        def filter(self, *a, **k):
            return self

        def first(self):
            return None

    real_query = categories_router.Session.query

    def fake_query(self, *entities, **kw):
        # make only the pre-insert duplicate lookup miss
        if entities and entities[0] is categories_router.models.Category:
            return _NoDuplicateFound()
        return real_query(self, *entities, **kw)

    with patch.object(categories_router.Session, "query", fake_query):
        resp = auth_client.post("/categories/", json={"name": "Food", "type": "expense"})

    assert resp.status_code == 400
    assert "already exists" in resp.json()["detail"]
