import React, { useState } from "react";
import clsx from "clsx";
import { PAYMENT_METHODS } from "../../../lib/types";
import type { Budget, Category, PaymentMethod, TransactionType } from "../../../lib/types";
import { categoryNames } from "../../../lib/format";
import { CategoryPicker } from "../CategoryPicker";
import type { ImportAction, ImportRow } from "./importRowsReducer";
import { rowProblem } from "./importRowsReducer";

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
];

export const ReviewTable = ({
  rows,
  dispatch,
  categories,
  budgets,
  problemKey,
}: {
  rows: ImportRow[];
  dispatch: React.Dispatch<ImportAction>;
  categories: Category[];
  budgets: Budget[];
  problemKey: number | null;
}) => {
  const selectedCount = rows.filter((r) => r.selected).length;
  const duplicates = rows.filter((r) => r.duplicate && r.selected).length;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  return (
    <div className="flex flex-col gap-3">
      <BulkBar
        dispatch={dispatch}
        categories={categories}
        budgets={budgets}
        allSelected={allSelected}
        selectedCount={selectedCount}
        selectedDuplicates={duplicates}
      />
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <ReviewRow
            key={row.key}
            row={row}
            dispatch={dispatch}
            categories={categories}
            budgets={budgets}
            highlighted={row.key === problemKey}
          />
        ))}
      </ul>
    </div>
  );
};

const BulkBar = ({
  dispatch,
  categories,
  budgets,
  allSelected,
  selectedCount,
  selectedDuplicates,
}: {
  dispatch: React.Dispatch<ImportAction>;
  categories: Category[];
  budgets: Budget[];
  allSelected: boolean;
  selectedCount: number;
  selectedDuplicates: number;
}) => {
  const none = selectedCount === 0;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-line-soft p-2 text-[13px]">
      <label className="flex min-h-[36px] items-center gap-2 px-2 font-medium text-ink">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => dispatch({ kind: "selectAll", selected: e.target.checked })}
        />
        Select all
      </label>
      {selectedDuplicates > 0 && (
        <button
          type="button"
          className="min-h-[36px] rounded-lg px-2 font-medium text-accent hover:bg-surface"
          onClick={() => dispatch({ kind: "deselectDuplicates" })}
        >
          Untick {selectedDuplicates} possible {selectedDuplicates === 1 ? "duplicate" : "duplicates"}
        </button>
      )}
      <span className="ml-auto text-muted max-sm:ml-0 max-sm:w-full">For the selected rows:</span>
      <BulkSelect
        label="Type"
        disabled={none}
        options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
        onPick={(v) => dispatch({ kind: "editSelected", patch: { type: v as TransactionType } })}
      />
      <BulkSelect
        label="Paid with"
        disabled={none}
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
        onPick={(v) => dispatch({ kind: "editSelected", patch: { payment_method: v as PaymentMethod } })}
      />
      <BulkSelect
        label="Add category"
        disabled={none}
        options={[
          ...categories.map((c) => ({ value: String(c.id), label: c.name })),
          { value: "clear", label: "Clear categories" },
        ]}
        onPick={(v) =>
          dispatch(
            v === "clear"
              ? { kind: "editSelected", patch: { category_ids: [] } }
              : { kind: "addCategorySelected", id: Number(v) }
          )
        }
      />
      <BulkSelect
        label="Budget"
        disabled={none}
        options={[
          ...budgets.map((b) => ({ value: String(b.id), label: b.name })),
          { value: "none", label: "No budget" },
        ]}
        onPick={(v) =>
          dispatch({ kind: "editSelected", patch: { budget_id: v === "none" ? null : Number(v) } })
        }
      />
    </div>
  );
};

// A select that acts once per pick and then shows its label again.
const BulkSelect = ({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (value: string) => void;
  disabled: boolean;
}) => (
  <select
    aria-label={`${label} for selected rows`}
    className="field-sm min-h-[36px]"
    value=""
    disabled={disabled}
    onChange={(e) => {
      if (e.target.value) onPick(e.target.value);
    }}
  >
    <option value="">{label}…</option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const ReviewRow = React.memo(function ReviewRow({
  row,
  dispatch,
  categories,
  budgets,
  highlighted,
}: {
  row: ImportRow;
  dispatch: React.Dispatch<ImportAction>;
  categories: Category[];
  budgets: Budget[];
  highlighted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const edit = (patch: Parameters<typeof applyEdit>[2]) => applyEdit(dispatch, row.key, patch);
  const problem = row.selected ? rowProblem(row) : null;
  const rowCategories = categories.filter((c) => row.category_ids.includes(c.id));
  const budget = budgets.find((b) => b.id === row.budget_id);

  return (
    <li
      id={`import-row-${row.key}`}
      className={clsx(
        "flex flex-col gap-2 rounded-xl border p-3 transition",
        problem ? "border-spend/60" : "border-line",
        highlighted && "ring-2 ring-spend/40",
        !row.selected && "opacity-60"
      )}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_9.5rem_minmax(0,1fr)_7.5rem_6.5rem_7rem]">
        <input
          type="checkbox"
          aria-label={`Import ${row.description || "this entry"}`}
          checked={row.selected}
          onChange={(e) => edit({ selected: e.target.checked })}
        />
        <input
          type="date"
          aria-label="Date"
          className="field-sm min-h-[38px] w-full"
          value={row.date}
          onChange={(e) => edit({ date: e.target.value })}
        />
        <input
          type="text"
          aria-label="Description"
          maxLength={255}
          placeholder="Description"
          className="field-sm min-h-[38px] w-full max-sm:col-span-2"
          value={row.description}
          onChange={(e) => edit({ description: e.target.value })}
        />
        <select
          aria-label="Type"
          className="field-sm min-h-[38px] w-full max-sm:col-start-1 max-sm:col-span-2"
          value={row.type}
          onChange={(e) => edit({ type: e.target.value as TransactionType })}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {row.type === "expense" ? (
          <select
            aria-label="Paid with"
            className="field-sm min-h-[38px] w-full max-sm:col-span-2"
            value={row.payment_method}
            onChange={(e) => edit({ payment_method: e.target.value as PaymentMethod | "" })}
          >
            <option value="">Paid with…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <span className="max-sm:hidden" />
        )}
        <label className="flex items-center gap-1 text-[13px] text-muted max-sm:col-span-2">
          $
          <input
            type="text"
            inputMode="decimal"
            aria-label="Amount"
            placeholder="0.00"
            className="field-sm min-h-[38px] w-full text-right"
            value={row.amount}
            onChange={(e) => edit({ amount: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted sm:pl-6">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md font-medium text-accent hover:underline"
        >
          {categoryNames(rowCategories)}
          {" · "}
          {budget ? budget.name : "No budget"}
          {expanded ? " ▴" : " ▾"}
        </button>
        {row.duplicate && (
          <span className="rounded-full bg-line-soft px-2 py-0.5 font-medium text-ink-2">
            Possible duplicate
          </span>
        )}
        {row.warning && (
          <span className="rounded-full bg-spend-soft px-2 py-0.5 font-medium text-spend">{row.warning}</span>
        )}
        {problem && <span className="text-spend">{problem}</span>}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-line-soft pt-3 sm:pl-6">
          <CategoryPicker
            categories={categories}
            type={row.type}
            value={row.category_ids}
            onChange={(ids) => edit({ category_ids: ids })}
          />
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Budget</span>
            <select
              className="field"
              value={row.budget_id ?? ""}
              onChange={(e) => edit({ budget_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">None</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </li>
  );
});

const applyEdit = (
  dispatch: React.Dispatch<ImportAction>,
  key: number,
  patch: Extract<ImportAction, { kind: "edit" }>["patch"]
) => dispatch({ kind: "edit", key, patch });
