import pytest


def test_health(client):
    r = client.get("/health")
    assert r.json() == {"status": "ok"}