def _create(client, **overrides):
    payload = {"name": "Job", "amount": "1500.00", "frequency": "monthly", **overrides}
    return client.post("/income/", json=payload)


def test_list_income_when_none_set(auth_client):
    resp = auth_client.get("/income/")
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


def test_create_multiple_incomes_with_different_frequencies(auth_client):
    r1 = _create(auth_client, name="Main job", amount="1500.00", frequency="biweekly")
    r2 = _create(auth_client, name="Freelance", amount="400.00", frequency="weekly")
    r3 = _create(auth_client, name="Bonus", amount="5000.00", frequency="yearly")
    assert r1.status_code == r2.status_code == r3.status_code == 201

    data = auth_client.get("/income/").json()
    assert [i["name"] for i in data] == ["Main job", "Freelance", "Bonus"]
    assert [i["frequency"] for i in data] == ["biweekly", "weekly", "yearly"]
    assert data[0]["amount"] == 1500.0


def test_update_income(auth_client):
    income_id = _create(auth_client).json()["id"]
    resp = auth_client.put(
        f"/income/{income_id}", json={"amount": "2000.00", "frequency": "yearly"}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["amount"] == 2000.0
    assert data["frequency"] == "yearly"
    assert data["name"] == "Job"  # untouched field preserved
    assert len(auth_client.get("/income/").json()) == 1


def test_invalid_frequency_rejected(auth_client):
    assert _create(auth_client, frequency="daily").status_code == 422


def test_non_positive_amount_rejected(auth_client):
    assert _create(auth_client, amount="0").status_code == 422


def test_delete_income(auth_client):
    keep = _create(auth_client, name="Keep").json()["id"]
    gone = _create(auth_client, name="Gone").json()["id"]

    assert auth_client.delete(f"/income/{gone}").status_code == 204
    remaining = auth_client.get("/income/").json()
    assert [i["id"] for i in remaining] == [keep]


def test_update_and_delete_missing_income_404(auth_client):
    assert auth_client.put("/income/999", json={"name": "x"}).status_code == 404
    assert auth_client.delete("/income/999").status_code == 404


def test_cannot_modify_another_users_income(auth_client, client):
    income_id = _create(auth_client).json()["id"]

    client.post("/auth/register", json={"email": "other@example.com", "password": "testpassword123"})
    login = client.post(
        "/auth/login", data={"username": "other@example.com", "password": "testpassword123"}
    )
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert client.put(f"/income/{income_id}", json={"name": "x"}, headers=other_headers).status_code == 404
    assert client.delete(f"/income/{income_id}", headers=other_headers).status_code == 404
    assert client.get("/income/", headers=other_headers).json() == []
