from fastapi.testclient import TestClient


def test_logging_includes_basic_request_info(client: TestClient, capsys):
    # Hit a simple public endpoint
    resp = client.get("/health")
    assert resp.status_code == 200

    # Capture raw stdout lines
    lines = capsys.readouterr().out.splitlines()

    # Just verify that at least one line is from logger=app.request and has status_code=200.
    assert any(
        '"logger": "app.request"' in line and '"status_code": 200' in line
        for line in lines
    ), "Expected at least one app.request log entry with status_code=200"


def test_logging_includes_user_id_when_authenticated(auth_client: TestClient, capsys):
    # Trigger an authenticated request; auth_client has already registered + logged in
    resp = auth_client.get("/transactions")
    assert resp.status_code == 200

    # Capture raw stdout lines
    lines = capsys.readouterr().out.splitlines()

    # Look for an app.request log with a non-null user_id on a 200 response.
    assert any(
        '"logger": "app.request"' in line
        and '"status_code": 200' in line
        and '"user_id":' in line
        and '"user_id": null' not in line
        for line in lines
    ), "Expected an app.request log entry with non-null user_id on a 200 response"
