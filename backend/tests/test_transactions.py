import pytest

@pytest.mark.asyncio
async def test_create_and_list_transactions(client):
    payload = {
        "amount": 19.99,
        "currency": "CAD",
        "payment_method": "debit",
        "account": "checking",
        "category": "groceries",
        "merchant": "Metro",
        "description": "milk and eggs",
    }
    r = await client.post("/api/transactions", json=payload)
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["id"] > 0
    assert created["merchant"] == "Metro"

    r2 = await client.get("/api/transactions")
    assert r2.status_code == 200
    items = r2.json()
    assert len(items) == 1
    assert items[0]["id"] == created["id"]
    assert items[0]["merchant"] == "Metro"