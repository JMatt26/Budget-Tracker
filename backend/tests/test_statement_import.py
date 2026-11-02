from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.schemas import ColumnMapping
from app.statement_import import (
    StatementError,
    _roles_from_header,
    normalize_description,
    parse_amount,
    parse_statement,
)

FIXTURES = Path(__file__).parent / "fixtures" / "statements"


def _parse(name, **kwargs):
    return parse_statement((FIXTURES / name).read_bytes(), **kwargs)


def _summary(parsed):
    return [(r.date, r.description, r.amount, r.type) for r in parsed.rows]


def test_credit_card_with_header():
    parsed = _parse("credit_card.csv", kind="credit")
    assert parsed.columns[:3] == ["Transaction Date", "Post Date", "Description"]
    assert parsed.mapping.date == 0  # the transaction date, not the posted date
    assert parsed.mapping.date_format == "%m/%d/%Y"
    assert _summary(parsed) == [
        (date(2026, 10, 3), "STARBUCKS #1234 TORONTO", Decimal("6.45"), "expense"),
        (date(2026, 10, 5), "LOBLAWS, #88", Decimal("1204.10"), "expense"),
        (date(2026, 10, 9), "PAYMENT THANK YOU", Decimal("500.00"), "income"),
    ]
    assert all(r.warning is None for r in parsed.rows)


def test_bank_account_skips_preamble_and_reads_debit_credit_columns():
    parsed = _parse("bank_account.csv", kind="bank")
    assert parsed.mapping.debit == 2 and parsed.mapping.credit == 3
    assert _summary(parsed) == [
        (date(2026, 10, 1), "ACME PAYROLL", Decimal("2500.00"), "income"),
        (date(2026, 10, 2), "HYDRO ONE", Decimal("85.20"), "expense"),
        (date(2026, 10, 15), "E-TRANSFER RENT", Decimal("1450.00"), "expense"),
    ]


def test_headerless_file_is_inferred_and_balance_ignored():
    parsed = _parse("headerless.csv", kind="bank")
    assert parsed.columns == [f"Column {i}" for i in range(1, 6)]
    assert (parsed.mapping.date, parsed.mapping.description) == (0, 1)
    assert (parsed.mapping.debit, parsed.mapping.credit) == (2, 3)
    assert _summary(parsed) == [
        (date(2026, 10, 14), "NETFLIX.COM", Decimal("16.99"), "expense"),
        (date(2026, 10, 15), "TIM HORTONS 0042", Decimal("3.25"), "expense"),
        (date(2026, 10, 20), "REFUND AMAZON", Decimal("25.00"), "income"),
    ]


def test_rbc_export_joins_both_descriptions_and_reads_cad_column():
    parsed = _parse("rbc.csv", kind="bank")
    m = parsed.mapping
    assert (m.date, m.description, m.description_extra, m.amount) == (2, 4, 5, 6)
    assert _summary(parsed) == [
        (date(2026, 10, 3), "Payroll Deposit - EXAMPLE CORP", Decimal("1850.00"), "income"),
        (date(2026, 10, 4), "Contactless Interac purchase - 4821 - GROCER 112", Decimal("64.18"), "expense"),
        (date(2026, 10, 6), "Cheque", Decimal("900.00"), "expense"),
        (date(2026, 10, 7), "Online Banking transfer - 7732", Decimal("200.00"), "expense"),
    ]


@pytest.mark.parametrize(
    "header, expected",
    [
        # Scotiabank / TD style
        (["Date", "Transaction Details", "Withdrawals", "Deposits", "Balance"],
         {"date": 0, "description": 1, "debit": 2, "credit": 3}),
        # French (Desjardins, National Bank)
        (["Date de transaction", "Libellé", "Débit", "Crédit", "Solde"],
         {"date": 0, "description": 1, "debit": 2, "credit": 3}),
        (["Date", "Description", "Montant"], {"date": 0, "description": 1, "amount": 2}),
        # currency in the header, a balance that must be ignored
        (["Posted Date", "Payee", "Amount (CAD)", "Balance"],
         {"date": 0, "description": 1, "amount": 2}),
        # Amex style: a memo column only adds to the description
        (["Date", "Reference", "Description", "Amount"],
         {"date": 0, "description_extra": 1, "description": 2, "amount": 3}),
        # memo is the description when there's nothing better
        (["Booking Date", "Memo", "Money In", "Money Out"],
         {"date": 0, "description": 1, "credit": 2, "debit": 3}),
        # a foreign-currency amount is never the amount
        (["Date", "Merchant", "Original Amount", "Billed Amount"],
         {"date": 0, "description": 1, "amount": 3}),
        (["Date", "Description", "Debit/Credit"], {"date": 0, "description": 1, "amount": 2}),
    ],
)
def test_header_synonyms(header, expected):
    assert _roles_from_header(header) == expected


def test_day_first_dates_are_detected_from_the_whole_file():
    # 03/10 alone could be March 10th; 25/10 settles it
    parsed = _parse("day_first.csv", kind="bank")
    assert parsed.mapping.date_format == "%d/%m/%Y"
    assert [r.date for r in parsed.rows] == [date(2026, 10, 3), date(2026, 10, 25)]
    assert [r.type for r in parsed.rows] == ["expense", "income"]


def test_user_mapping_overrides_detection():
    mapping = ColumnMapping(date=1, description=2, amount=5, date_format="%m/%d/%Y", flip_sign=True)
    parsed = _parse("credit_card.csv", kind="credit", mapping=mapping)
    assert parsed.rows[0].date == date(2026, 10, 4)  # the posted date
    assert parsed.rows[0].type == "income"  # signs flipped


@pytest.mark.parametrize("text,expected", [
    ("12.50", Decimal("12.50")),
    ("$1,234.50", Decimal("1234.50")),
    ("-7", Decimal("-7")),
    ("(12.00)", Decimal("-12.00")),
    ("12.00-", Decimal("-12.00")),
    ("40.00 CR", Decimal("40.00")),
    ("40.00 DR", Decimal("-40.00")),
    ("", None),
    ("abc", None),
    ("NaN", None),
])
def test_parse_amount(text, expected):
    assert parse_amount(text) == expected


def test_unreadable_row_is_kept_with_a_warning():
    data = b"Date,Description,Amount\n2026-10-01,Ok,5.00\nsoon,Broken,oops\n"
    parsed = parse_statement(data, kind="credit")
    assert parsed.rows[0].warning is None
    assert parsed.rows[1].warning == "Couldn't read the date or amount."
    assert parsed.rows[1].amount is None


@pytest.mark.parametrize("data", [
    b"",
    b"\n\n",
    b"just,some,words\nnothing,to,see\n",
])
def test_files_without_transactions_are_rejected(data):
    with pytest.raises(StatementError):
        parse_statement(data)


def test_unknown_date_format_is_rejected():
    with pytest.raises(StatementError):
        _parse("credit_card.csv", mapping=ColumnMapping(date=0, amount=5, date_format="%s"))


def test_normalize_description():
    assert normalize_description("STARBUCKS #1234 TORONTO") == "starbucks toronto"
    assert normalize_description("Tim Hortons 0042") == "tim hortons"
    assert normalize_description(None) == ""
