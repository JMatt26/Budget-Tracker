import type { PaymentMethod, StatementRow, TransactionType } from "../../../lib/types";
import type { NewTransaction } from "../../../lib/import-api";

// A statement row as the user edits it before importing.
export type ImportRow = {
  key: number;
  selected: boolean;
  date: string; // yyyy-mm-dd, "" when unreadable
  description: string;
  amount: string; // as typed
  type: TransactionType;
  payment_method: PaymentMethod | "";
  category_ids: number[];
  budget_id: number | null;
  duplicate: boolean;
  warning: string | null;
};

export type RowPatch = Partial<Omit<ImportRow, "key">>;

export type ImportAction =
  | { kind: "load"; rows: StatementRow[] }
  | { kind: "edit"; key: number; patch: RowPatch }
  // applies to every selected row
  | { kind: "editSelected"; patch: RowPatch }
  | { kind: "addCategorySelected"; id: number }
  | { kind: "selectAll"; selected: boolean }
  | { kind: "deselectDuplicates" };

export const fromStatementRow = (row: StatementRow): ImportRow => ({
  key: row.index,
  selected: row.selected,
  date: row.date ?? "",
  description: row.description,
  amount: row.amount == null ? "" : row.amount.toFixed(2),
  type: row.type,
  payment_method: row.payment_method ?? "",
  category_ids: row.category_ids,
  budget_id: row.budget_id,
  duplicate: row.duplicate,
  warning: row.warning,
});

// Only expenses have a payment method, so other rows never take one.
const applyPatch = (row: ImportRow, patch: RowPatch): ImportRow => {
  const next = { ...row, ...patch };
  if (next.type !== "expense") next.payment_method = "";
  return next;
};

export const importRowsReducer = (rows: ImportRow[], action: ImportAction): ImportRow[] => {
  switch (action.kind) {
    case "load":
      return action.rows.map(fromStatementRow);
    case "edit":
      return rows.map((r) => (r.key === action.key ? applyPatch(r, action.patch) : r));
    case "editSelected":
      return rows.map((r) => (r.selected ? applyPatch(r, action.patch) : r));
    case "addCategorySelected":
      return rows.map((r) =>
        r.selected && !r.category_ids.includes(action.id)
          ? { ...r, category_ids: [...r.category_ids, action.id] }
          : r
      );
    case "selectAll":
      return rows.map((r) => ({ ...r, selected: action.selected }));
    case "deselectDuplicates":
      return rows.map((r) => (r.duplicate ? { ...r, selected: false } : r));
  }
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// What's wrong with a row, or null if it can be imported.
export const rowProblem = (row: ImportRow): string | null => {
  if (!DATE_RE.test(row.date) || Number.isNaN(new Date(`${row.date}T00:00:00`).getTime())) {
    return "Enter a date.";
  }
  const amount = Number(row.amount);
  if (!row.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    return "Enter an amount above 0.";
  }
  if (!/^\d+(\.\d{1,2})?$/.test(row.amount.trim())) {
    return "Use at most two decimal places.";
  }
  if (row.type === "expense" && !row.payment_method) {
    return "Choose a payment method.";
  }
  return null;
};

export const toNewTransaction = (row: ImportRow): NewTransaction => ({
  date: row.date,
  amount: Number(row.amount),
  description: row.description.trim() || null,
  type: row.type,
  payment_method: row.type === "expense" ? (row.payment_method || null) : null,
  category_ids: row.category_ids,
  budget_id: row.budget_id,
});

// Money out and in across the selected rows.
export const selectedTotals = (rows: ImportRow[]) => {
  let out = 0;
  let inflow = 0;
  for (const r of rows) {
    if (!r.selected) continue;
    const amount = Number(r.amount);
    if (!Number.isFinite(amount)) continue;
    if (r.type === "expense") out += amount;
    else if (r.type === "income") inflow += amount;
  }
  return { out, in: inflow };
};
