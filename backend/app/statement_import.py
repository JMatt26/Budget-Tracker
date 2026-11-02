"""Read a bank or card statement CSV into rows for the import review.

Banks lay their exports out differently: some have a header row, some put
account details above it, some have no header at all; some have one signed
amount column, others separate debit and credit columns. This module finds
the table, works out which column is which (unless the user said), and
turns every line into a date, description, positive amount and type.

Nothing here touches the database; the router adds duplicate flags and
category suggestions.
"""
import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional

from .schemas import ColumnMapping, StatementKind

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 2000

# Tried in order; the first that reads every date in the file wins, which
# settles day/month ambiguity for the file as a whole.
DATE_FORMATS = [
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%d/%m/%Y",
    "%m/%d/%y",
    "%d/%m/%y",
    "%Y/%m/%d",
    "%d %b %Y",
    "%b %d, %Y",
    "%d-%b-%Y",
    "%b %d %Y",
]

_HEADER_ROLES = {
    "date": {"date", "transaction date", "trans date", "posted date", "post date", "posting date"},
    "description": {
        "description", "transaction description", "merchant", "merchant name",
        "payee", "details", "name", "memo", "narrative",
    },
    "amount": {"amount", "transaction amount"},
    "debit": {"debit", "debits", "withdrawal", "withdrawals", "money out", "charges"},
    "credit": {"credit", "credits", "deposit", "deposits", "money in", "payments"},
}

# how far down to look for the table before giving up
_SEARCH_ROWS = 30


class StatementError(ValueError):
    """The file can't be read as a statement; the message is for the user."""


@dataclass
class ParsedRow:
    index: int
    date: Optional[date]
    description: str
    amount: Optional[Decimal]  # always positive
    type: str  # income | expense
    warning: Optional[str] = None


@dataclass
class ParsedStatement:
    columns: List[str]
    mapping: ColumnMapping
    rows: List[ParsedRow] = field(default_factory=list)


def normalize_description(text: Optional[str]) -> str:
    """'STARBUCKS #1234 TORONTO' -> 'starbucks toronto': what's left once
    store numbers and punctuation are gone, for matching entries up."""
    words = re.sub(r"[^a-z]+", " ", (text or "").lower()).split()
    return " ".join(w for w in words if len(w) > 1)


def parse_amount(text: str) -> Optional[Decimal]:
    """'$1,234.50', '(12.00)', '-12', '12.00-', '40.00 CR' or '40.00 DR'."""
    t = re.sub(r"[\s$,]|CAD|USD", "", text.strip().upper())
    if not t:
        return None
    negative = False
    if t.endswith("CR"):
        t = t[:-2]
    elif t.endswith("DR"):
        t, negative = t[:-2], True
    if t.startswith("(") and t.endswith(")"):
        t, negative = t[1:-1], not negative
    if t.startswith("-"):
        t, negative = t[1:], not negative
    elif t.endswith("-"):
        t, negative = t[:-1], not negative
    elif t.startswith("+"):
        t = t[1:]
    try:
        value = Decimal(t)
    except InvalidOperation:
        return None
    if not value.is_finite():
        return None
    return -value if negative else value


def _clean_date_text(text: str) -> str:
    text = text.strip()
    # drop a time part from ISO timestamps
    if re.match(r"^\d{4}-\d{2}-\d{2}[ T]", text):
        return text[:10]
    return text


def _parse_date(text: str, fmt: str) -> Optional[date]:
    try:
        return datetime.strptime(_clean_date_text(text), fmt).date()
    except ValueError:
        return None


def _looks_like_date(text: str) -> bool:
    return any(_parse_date(text, f) for f in DATE_FORMATS)


def _detect_date_format(values: List[str]) -> Optional[str]:
    values = [v for v in values if v.strip()]
    if not values:
        return None
    best, best_count = None, 0
    for fmt in DATE_FORMATS:
        count = sum(1 for v in values if _parse_date(v, fmt))
        if count == len(values):
            return fmt
        if count > best_count:
            best, best_count = fmt, count
    return best


def _header_key(cell: str) -> str:
    return " ".join(re.sub(r"[^a-z]+", " ", cell.lower()).split())


def _roles_from_header(row: List[str]) -> Dict[str, int]:
    """Column index for each role this header names (first match wins, so
    'Transaction Date' beats a later 'Posted Date')."""
    roles: Dict[str, int] = {}
    for i, cell in enumerate(row):
        key = _header_key(cell)
        for role, names in _HEADER_ROLES.items():
            if role in roles:
                continue
            if key in names or (role == "amount" and key.startswith("amount")):
                roles[role] = i
                break
    return roles


def _is_header(row: List[str]) -> bool:
    roles = _roles_from_header(row)
    return "date" in roles and any(r in roles for r in ("amount", "debit", "credit"))


def _is_data_row(row: List[str]) -> bool:
    has_date = any(_looks_like_date(c) for c in row if c.strip())
    has_amount = any(parse_amount(c) is not None for c in row if c.strip() and not _looks_like_date(c))
    return has_date and has_amount


def _infer_mapping(rows: List[List[str]], width: int) -> ColumnMapping:
    """Guess the columns of a file without a recognisable header."""
    sample = rows[:50]

    def cells(i: int) -> List[str]:
        return [r[i].strip() for r in sample if i < len(r) and r[i].strip()]

    date_col = next(
        (i for i in range(width) if cells(i) and all(_looks_like_date(c) for c in cells(i))),
        None,
    )
    if date_col is None:
        raise StatementError("Couldn't find a date column in this file.")

    numeric = [
        i for i in range(width)
        if i != date_col and cells(i) and all(parse_amount(c) is not None for c in cells(i))
    ]
    if not numeric:
        raise StatementError("Couldn't find an amount column in this file.")

    text_cols = [i for i in range(width) if i != date_col and i not in numeric and cells(i)]
    description = max(
        text_cols,
        key=lambda i: sum(len(c) for c in cells(i)) / len(cells(i)),
        default=None,
    )

    if len(numeric) >= 3:
        # debit, credit, then a running balance
        return ColumnMapping(date=date_col, description=description, debit=numeric[0], credit=numeric[1])
    if len(numeric) == 2:
        a, b = numeric
        # debit/credit columns are filled one at a time; an amount and a
        # balance are both filled on every line
        one_at_a_time = all(
            bool(r[a].strip() if a < len(r) else "") != bool(r[b].strip() if b < len(r) else "")
            for r in sample
        )
        if one_at_a_time:
            return ColumnMapping(date=date_col, description=description, debit=a, credit=b)
    return ColumnMapping(date=date_col, description=description, amount=numeric[0])


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def _read_rows(text: str) -> List[List[str]]:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    return [r for r in rows if any(c.strip() for c in r)]


def parse_statement(
    data: bytes,
    kind: StatementKind = "credit",
    mapping: Optional[ColumnMapping] = None,
) -> ParsedStatement:
    if len(data) > MAX_BYTES:
        raise StatementError("That file is too large; statements must be under 2 MB.")
    rows = _read_rows(_decode(data))
    if not rows:
        raise StatementError("That file is empty.")

    # Find where the table starts: a header row, or the first transaction
    # line of a file without one. Anything above it is account details.
    header: Optional[List[str]] = None
    start = None
    for i, row in enumerate(rows[:_SEARCH_ROWS]):
        if _is_header(row):
            header, start = row, i + 1
            break
        if _is_data_row(row):
            start = i
            # an unrecognised header right above the data still names the columns
            if i > 0 and len(rows[i - 1]) == len(row) and not _is_data_row(rows[i - 1]):
                header = rows[i - 1]
            break
    if start is None:
        raise StatementError(
            "Couldn't find any transactions in this file. Is it a CSV statement export?"
        )

    data_rows = rows[start:]
    if not data_rows:
        raise StatementError("This statement has no transactions in it.")
    if len(data_rows) > MAX_ROWS:
        raise StatementError(f"This statement has more than {MAX_ROWS} lines; split it into smaller files.")

    width = max(len(r) for r in [*data_rows, header or []])
    if header:
        columns = [h.strip() or f"Column {i + 1}" for i, h in enumerate(header)]
        columns += [f"Column {i + 1}" for i in range(len(columns), width)]
    else:
        columns = [f"Column {i + 1}" for i in range(width)]

    if mapping is None:
        roles = _roles_from_header(header) if header else {}
        if "date" in roles and any(r in roles for r in ("amount", "debit", "credit")):
            mapping = ColumnMapping(
                date=roles["date"],
                description=roles.get("description"),
                amount=roles.get("amount"),
                debit=None if "amount" in roles else roles.get("debit"),
                credit=None if "amount" in roles else roles.get("credit"),
            )
        else:
            mapping = _infer_mapping(data_rows, width)

    for col in (mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit):
        if col is not None and col >= width:
            raise StatementError(f"This file has only {width} columns.")

    def cell(row: List[str], col: Optional[int]) -> str:
        return row[col].strip() if col is not None and col < len(row) else ""

    date_format = mapping.date_format
    if date_format is not None and date_format not in DATE_FORMATS:
        raise StatementError("Unsupported date format.")
    if date_format is None:
        date_format = _detect_date_format([cell(r, mapping.date) for r in data_rows])
    cols: ColumnMapping = mapping.model_copy(update={"date_format": date_format})

    parsed: List[ParsedRow] = []
    for index, row in enumerate(data_rows):
        problems = []

        tx_date = _parse_date(cell(row, cols.date), date_format) if date_format else None
        if tx_date is None:
            problems.append("date")

        # money in is positive, money out negative
        if cols.amount is not None:
            raw = parse_amount(cell(row, cols.amount))
            # a card statement shows charges as positive; a bank account
            # shows withdrawals as negative
            inflow = None if raw is None else (-raw if kind == "credit" else raw)
        else:
            out_text, in_text = cell(row, cols.debit), cell(row, cols.credit)
            money_out = parse_amount(out_text) if out_text else Decimal(0)
            money_in = parse_amount(in_text) if in_text else Decimal(0)
            inflow = None if money_out is None or money_in is None else abs(money_in) - abs(money_out)
        if inflow is not None and cols.flip_sign:
            inflow = -inflow
        if inflow is None or inflow == 0:
            problems.append("amount")

        parsed.append(ParsedRow(
            index=index,
            date=tx_date,
            description=cell(row, cols.description)[:255],
            amount=abs(inflow) if inflow else None,
            type="income" if inflow is not None and inflow > 0 else "expense",
            warning=f"Couldn't read the {' or '.join(problems)}." if problems else None,
        ))

    return ParsedStatement(columns=columns, mapping=cols, rows=parsed)
