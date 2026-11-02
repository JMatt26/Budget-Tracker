import { describe, expect, it } from "vitest";
import type { StatementRow } from "../../../lib/types";
import {
  fromStatementRow,
  importRowsReducer,
  rowProblem,
  selectedTotals,
  toNewTransaction,
} from "./importRowsReducer";
import type { ImportRow } from "./importRowsReducer";

const statementRow = (overrides: Partial<StatementRow> = {}): StatementRow => ({
  index: 0,
  date: "2026-10-03",
  description: "STARBUCKS",
  amount: 6.45,
  type: "expense",
  payment_method: "Visa",
  category_ids: [],
  budget_id: null,
  duplicate: false,
  selected: true,
  warning: null,
  ...overrides,
});

const load = (...rows: StatementRow[]): ImportRow[] =>
  importRowsReducer([], { kind: "load", rows });

describe("importRowsReducer", () => {
  it("loads statement rows as editable rows", () => {
    const [row] = load(statementRow({ amount: 1204.1, payment_method: null, date: null }));
    expect(row).toMatchObject({ key: 0, amount: "1204.10", payment_method: "", date: "" });
  });

  it("edits one row by key", () => {
    const rows = load(statementRow(), statementRow({ index: 1 }));
    const next = importRowsReducer(rows, { kind: "edit", key: 1, patch: { amount: "9.99" } });
    expect(next.map((r) => r.amount)).toEqual(["6.45", "9.99"]);
    expect(next[0]).toBe(rows[0]); // untouched rows keep their identity
  });

  it("drops the payment method when a row stops being an expense", () => {
    const rows = load(statementRow());
    const [row] = importRowsReducer(rows, { kind: "edit", key: 0, patch: { type: "income" } });
    expect(row.payment_method).toBe("");
  });

  it("applies bulk edits to selected rows only", () => {
    const rows = load(
      statementRow({ index: 0 }),
      statementRow({ index: 1, selected: false }),
      statementRow({ index: 2, type: "income", payment_method: null })
    );
    let next = importRowsReducer(rows, { kind: "editSelected", patch: { budget_id: 7, payment_method: "Amex" } });
    expect(next.map((r) => r.budget_id)).toEqual([7, null, 7]);
    // income rows never take a payment method
    expect(next.map((r) => r.payment_method)).toEqual(["Amex", "Visa", ""]);

    next = importRowsReducer(next, { kind: "addCategorySelected", id: 3 });
    next = importRowsReducer(next, { kind: "addCategorySelected", id: 3 });
    expect(next.map((r) => r.category_ids)).toEqual([[3], [], [3]]);
  });

  it("selects all and unticks duplicates", () => {
    const rows = load(statementRow({ selected: false }), statementRow({ index: 1, duplicate: true }));
    const all = importRowsReducer(rows, { kind: "selectAll", selected: true });
    expect(all.every((r) => r.selected)).toBe(true);
    const next = importRowsReducer(all, { kind: "deselectDuplicates" });
    expect(next.map((r) => r.selected)).toEqual([true, false]);
  });
});

describe("rowProblem", () => {
  const row = (patch: Partial<ImportRow> = {}) => ({ ...fromStatementRow(statementRow()), ...patch });

  it("accepts a complete row", () => {
    expect(rowProblem(row())).toBeNull();
  });

  it.each([
    [{ date: "" }, "Enter a date."],
    [{ amount: "" }, "Enter an amount above 0."],
    [{ amount: "0" }, "Enter an amount above 0."],
    [{ amount: "-5" }, "Enter an amount above 0."],
    [{ amount: "1.234" }, "Use at most two decimal places."],
    [{ payment_method: "" as const }, "Choose a payment method."],
  ])("rejects %o", (patch, message) => {
    expect(rowProblem(row(patch))).toBe(message);
  });

  it("doesn't need a payment method for income", () => {
    expect(rowProblem(row({ type: "income", payment_method: "" }))).toBeNull();
  });
});

describe("toNewTransaction and selectedTotals", () => {
  it("builds the API payload", () => {
    const row = { ...fromStatementRow(statementRow()), description: "  ", category_ids: [1, 2] };
    expect(toNewTransaction(row)).toEqual({
      date: "2026-10-03",
      amount: 6.45,
      description: null,
      type: "expense",
      payment_method: "Visa",
      category_ids: [1, 2],
      budget_id: null,
    });
  });

  it("totals the selected rows", () => {
    const rows = load(
      statementRow({ amount: 10 }),
      statementRow({ index: 1, amount: 5, selected: false }),
      statementRow({ index: 2, amount: 100, type: "income", payment_method: null })
    );
    expect(selectedTotals(rows)).toEqual({ out: 10, in: 100 });
  });
});
