"""Budget rollover must use the app's timezone and never create a cycle twice."""
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.budget_cycles import roll_over_budgets, today_local
from tests.conftest import TestingSessionLocal


def test_today_local_uses_the_configured_timezone():
    # 01:00 UTC on 27 Oct is still the evening of 26 Oct in Toronto (EDT, UTC-4)
    late_evening_in_toronto = datetime(2026, 10, 27, 1, 0, tzinfo=timezone.utc)
    assert today_local(late_evening_in_toronto) == date(2026, 10, 26)

    # and 12:00 UTC is the same calendar day in Toronto
    assert today_local(datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)) == date(2026, 10, 27)


def test_today_local_follows_the_timezone_setting(monkeypatch):
    from app.core import config as config_module

    monkeypatch.setattr(config_module.get_settings(), "timezone", "UTC")
    assert today_local(datetime(2026, 10, 27, 1, 0, tzinfo=timezone.utc)) == date(2026, 10, 27)


def _user_and_series(db, today):
    """A user with one recurring monthly budget whose cycle ended last month."""
    user = models.User(email="u@example.com", hashed_password="x")
    db.add(user)
    db.flush()
    end = today.replace(day=1) - timedelta(days=1)  # last day of the previous month
    start = end.replace(day=1)
    first = models.Budget(
        name="Rent", limit=0, start_date=start, end_date=end,
        recurrence="monthly", user_id=user.id,
    )
    db.add(first)
    db.flush()
    first.series_id = first.id
    db.commit()
    return user, first


def _cycles(db, series_id):
    return (
        db.query(models.Budget)
        .filter(models.Budget.series_id == series_id)
        .order_by(models.Budget.start_date)
        .all()
    )


def test_rollover_runs_on_the_injected_date_not_the_server_date():
    db = TestingSessionLocal()
    try:
        user, first = _user_and_series(db, date(2026, 10, 26))  # ended 2026-09-30

        roll_over_budgets(db, user.id, today=date(2026, 9, 30))  # last day: still current
        assert len(_cycles(db, first.series_id)) == 1

        roll_over_budgets(db, user.id, today=date(2026, 10, 1))  # a day later: new cycle
        cycles = _cycles(db, first.series_id)
        assert [c.start_date for c in cycles] == [date(2026, 9, 1), date(2026, 10, 1)]
    finally:
        db.close()


def test_rollover_catches_up_one_cycle_per_skipped_period():
    db = TestingSessionLocal()
    try:
        user, first = _user_and_series(db, date(2026, 10, 26))
        roll_over_budgets(db, user.id, today=date(2027, 1, 15))
        starts = [c.start_date for c in _cycles(db, first.series_id)]
        assert starts == [date(2026, 9, 1), date(2026, 10, 1), date(2026, 11, 1),
                          date(2026, 12, 1), date(2027, 1, 1)]
        # calling it again is a no-op
        roll_over_budgets(db, user.id, today=date(2027, 1, 15))
        assert len(_cycles(db, first.series_id)) == 5
    finally:
        db.close()


def test_rollover_survives_another_request_creating_the_cycle_first():
    """Simulate the race: between this request deciding a new cycle is needed
    and inserting it, another request inserts that same cycle."""
    db = TestingSessionLocal()
    other = TestingSessionLocal()
    try:
        user, first = _user_and_series(db, date(2026, 10, 26))
        series_id = first.series_id
        original_end = first.end_date

        # "the other request" wins the race and commits the October cycle
        winner = models.Budget(
            name=first.name, limit=0,
            start_date=original_end + timedelta(days=1), end_date=date(2026, 10, 31),
            recurrence="monthly", series_id=series_id, user_id=user.id,
        )
        other.add(winner)
        other.commit()

        # this request still holds the stale view (it only saw the first cycle)
        stale_first = db.get(models.Budget, first.id)
        from app import budget_cycles

        real_current = budget_cycles.current_cycles
        budget_cycles.current_cycles = lambda d, u: {series_id: stale_first}
        try:
            roll_over_budgets(db, user.id, today=date(2026, 10, 26))  # must not raise
        finally:
            budget_cycles.current_cycles = real_current

        cycles = _cycles(db, series_id)
        assert [c.start_date for c in cycles] == [date(2026, 9, 1), date(2026, 10, 1)]
    finally:
        db.close()
        other.close()


def test_database_rejects_a_duplicate_cycle():
    db = TestingSessionLocal()
    try:
        user, first = _user_and_series(db, date(2026, 10, 26))
        db.add(models.Budget(
            name="dup", limit=0, start_date=first.start_date, end_date=first.end_date,
            recurrence="monthly", series_id=first.series_id, user_id=user.id,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_one_off_budgets_with_no_series_are_not_constrained():
    db = TestingSessionLocal()
    try:
        user = models.User(email="u@example.com", hashed_password="x")
        db.add(user)
        db.flush()
        for _ in range(2):
            db.add(models.Budget(
                name="old", limit=0, start_date=date(2026, 1, 1), end_date=date(2026, 1, 31),
                user_id=user.id,  # series_id stays NULL (pre-series rows)
            ))
        db.commit()  # NULL series_ids never collide
    finally:
        db.close()


def test_editing_a_cycle_onto_a_sibling_start_date_is_a_400_not_a_500(auth_client):
    from datetime import date as d

    from app.budget_cycles import _add_months

    start = _add_months(d.today().replace(day=1), -2)
    end = _add_months(start, 1) - timedelta(days=1)
    first = auth_client.post("/budgets/", json={
        "name": "M", "start_date": start.isoformat(), "end_date": end.isoformat(),
        "recurrence": "monthly",
    }).json()
    auth_client.get("/budgets/")  # rolls over: creates the later cycles
    history = auth_client.get(f"/budgets/{first['id']}/history").json()["items"]
    second = history[-2]  # the cycle right after the first

    resp = auth_client.put(f"/budgets/{second['id']}", json={"start_date": first["start_date"]})
    assert resp.status_code == 400, resp.text
    assert "already starts on that date" in resp.json()["detail"]
