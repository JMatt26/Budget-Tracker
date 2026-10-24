def test_get_income_when_none_set(auth_client):
    resp = auth_client.get("/income/")
    assert resp.status_code == 200, resp.text
    assert resp.json() is None


def test_set_and_get_income(auth_client):
    payload = {"amount": "1500.00", "frequency": "monthly"}

    resp = auth_client.put("/income/", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["amount"] == 1500.0
    assert data["frequency"] == "monthly"

    resp = auth_client.get("/income/")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["amount"] == 1500.0
    assert data["frequency"] == "monthly"


def test_upsert_income_updates_existing_record(auth_client):
    auth_client.put("/income/", json={"amount": "1000.00", "frequency": "weekly"})
    resp = auth_client.put("/income/", json={"amount": "2000.00", "frequency": "yearly"})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["amount"] == 2000.0
    assert data["frequency"] == "yearly"

    resp = auth_client.get("/income/")
    assert len(resp.json()) == len(data)  # still a single record, not a list


def test_invalid_frequency_rejected(auth_client):
    resp = auth_client.put("/income/", json={"amount": "1000.00", "frequency": "daily"})
    assert resp.status_code == 422, resp.text


def test_delete_income(auth_client):
    auth_client.put("/income/", json={"amount": "1000.00", "frequency": "weekly"})

    resp = auth_client.delete("/income/")
    assert resp.status_code == 204, resp.text

    resp = auth_client.get("/income/")
    assert resp.json() is None
