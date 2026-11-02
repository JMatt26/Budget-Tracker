import React, { useReducer, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { PAYMENT_METHODS } from "../../../lib/types";
import type { ColumnMapping, PaymentMethod, StatementKind, StatementPreview } from "../../../lib/types";
import { createTransactionsBulk, previewStatement } from "../../../lib/import-api";
import { fetchBudgets } from "../../../lib/budget-api";
import { invalidateTransactionQueries } from "../../../lib/queries";
import { formatMoney } from "../../../lib/format";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Field, FormError } from "../../../components/ui/Field";
import { Segmented } from "../../../components/ui/Segmented";
import { Icon } from "../../../components/ui/Icon";
import { fetchCategories } from "../TransactionForm";
import { importRowsReducer, rowProblem, selectedTotals, toNewTransaction } from "./importRowsReducer";
import { ReviewTable } from "./ReviewTable";

const KIND_OPTIONS: { value: StatementKind; label: string }[] = [
  { value: "credit", label: "Credit card" },
  { value: "bank", label: "Bank account" },
];

// Same order as the server's DATE_FORMATS.
const DATE_FORMATS: { value: string; label: string }[] = [
  { value: "%Y-%m-%d", label: "2026-10-31" },
  { value: "%m/%d/%Y", label: "10/31/2026 (month first)" },
  { value: "%d/%m/%Y", label: "31/10/2026 (day first)" },
  { value: "%m/%d/%y", label: "10/31/26 (month first)" },
  { value: "%d/%m/%y", label: "31/10/26 (day first)" },
  { value: "%Y/%m/%d", label: "2026/10/31" },
  { value: "%d %b %Y", label: "31 Oct 2026" },
  { value: "%b %d, %Y", label: "Oct 31, 2026" },
  { value: "%d-%b-%Y", label: "31-Oct-2026" },
  { value: "%b %d %Y", label: "Oct 31 2026" },
];

const errorDetail = (err: unknown, fallback: string): string => {
  const detail = (err as any)?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

export const ImportStatementModal = ({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (count: number) => void;
}) => {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [kind, setKind] = useState<StatementKind>("credit");
  const [kindChosen, setKindChosen] = useState(false);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [mappingDraft, setMappingDraft] = useState<ColumnMapping | null>(null);
  const [rows, dispatch] = useReducer(importRowsReducer, []);
  const [problemKey, setProblemKey] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const { data: budgets } = useQuery({ queryKey: ["budgets", "for-form"], queryFn: fetchBudgets });

  const previewMutation = useMutation({
    mutationFn: (mapping?: ColumnMapping) =>
      previewStatement(file as File, { kind, paymentMethod, mapping }),
    onSuccess: (data) => {
      setPreview(data);
      setMappingDraft(data.mapping);
      dispatch({ kind: "load", rows: data.rows });
      setShowColumns(false);
      setProblemKey(null);
      setImportError(null);
      setStep("review");
    },
  });

  const selected = rows.filter((r) => r.selected);

  const importMutation = useMutation({
    mutationFn: () => createTransactionsBulk(selected.map(toNewTransaction)),
    onSuccess: (created) => {
      invalidateTransactionQueries(queryClient);
      onImported(created.length);
      onClose();
    },
    onError: (err) => {
      const message = errorDetail(err, "Couldn't import these transactions.");
      setImportError(message);
      // "Row N: ..." counts the rows that were sent
      const match = /^Row (\d+):/.exec(message);
      const row = match ? selected[Number(match[1]) - 1] : undefined;
      if (row) showRow(row.key);
    },
  });

  const showRow = (key: number) => {
    setProblemKey(key);
    document.getElementById(`import-row-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleImport = () => {
    setImportError(null);
    const bad = selected.find((r) => rowProblem(r));
    if (bad) {
      setImportError("Fix the highlighted rows or untick them.");
      showRow(bad.key);
      return;
    }
    importMutation.mutate();
  };

  const handleClose = () => {
    if (step === "review" && !window.confirm("Discard this import? Nothing has been saved yet.")) return;
    onClose();
  };

  const choosePaymentMethod = (method: PaymentMethod | "") => {
    setPaymentMethod(method);
    // a card's statement shows charges as positive amounts, a bank account's
    // shows withdrawals as negative ones
    if (!kindChosen && method) setKind(method === "Debit" || method === "Cash" ? "bank" : "credit");
  };

  const pickFile = (files: FileList | null) => {
    const picked = files?.[0];
    if (picked) {
      setFile(picked);
      previewMutation.reset();
    }
  };

  const totals = selectedTotals(rows);

  return (
    <Modal
      size="xl"
      title="Import statement"
      subtitle={
        step === "upload"
          ? "Upload a CSV export of a card or bank statement. Nothing is saved until you review it."
          : `${preview?.rows.length ?? 0} entries in ${file?.name ?? "the statement"}. Review them, then import.`
      }
      onClose={handleClose}
    >
      {step === "upload" ? (
        <form
          className="mx-auto flex max-w-lg flex-col gap-5 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) previewMutation.mutate(undefined);
          }}
        >
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files);
            }}
            className={clsx(
              "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
              dragging ? "border-accent bg-accent-soft" : "border-line hover:border-ink/25"
            )}
          >
            <Icon name="upload" size={26} className="text-muted" />
            <span className="text-sm font-medium text-ink">
              {file ? file.name : "Choose a CSV file or drop it here"}
            </span>
            <span className="text-xs text-muted">
              {file ? "Click to choose a different file" : "Up to 2 MB, from your bank's \"Download transactions\" option"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => pickFile(e.target.files)}
            />
          </label>

          <Field
            label="Paid with"
            hint="Applied to every expense in the statement; you can change it per row."
          >
            <select
              className="field"
              value={paymentMethod}
              onChange={(e) => choosePaymentMethod(e.target.value as PaymentMethod | "")}
            >
              <option value="">Choose later…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-1.5">
            <Segmented
              label="Statement kind"
              fullWidth
              options={KIND_OPTIONS}
              value={kind}
              onChange={(v) => {
                setKind(v);
                setKindChosen(true);
              }}
            />
            <span className="text-xs text-muted">
              {kind === "credit"
                ? "Charges are positive amounts and payments negative."
                : "Withdrawals are negative amounts and deposits positive."}
            </span>
          </div>

          {previewMutation.isError && (
            <FormError>{errorDetail(previewMutation.error, "Couldn't read that file.")}</FormError>
          )}

          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              className="flex-[2]"
              disabled={!file || previewMutation.isPending}
            >
              {previewMutation.isPending ? "Reading…" : "Review entries"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex min-h-full flex-col gap-4">
          {preview && mappingDraft && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                className="self-start text-[13px] font-medium text-accent hover:underline"
                aria-expanded={showColumns}
                onClick={() => setShowColumns((v) => !v)}
              >
                {showColumns ? "Hide columns" : "Dates or amounts look wrong? Adjust the columns"}
              </button>
              {showColumns && (
                <ColumnsPanel
                  columns={preview.columns}
                  mapping={mappingDraft}
                  onChange={setMappingDraft}
                  pending={previewMutation.isPending}
                  error={previewMutation.isError ? errorDetail(previewMutation.error, "Couldn't read the file with those columns.") : null}
                  onApply={() => previewMutation.mutate(mappingDraft)}
                />
              )}
            </div>
          )}

          <ReviewTable
            rows={rows}
            dispatch={dispatch}
            categories={categories ?? []}
            budgets={budgets?.items ?? []}
            problemKey={problemKey}
          />

          {/* -bottom-6: sticky offsets count from inside the modal body's padding */}
          <footer className="sticky -bottom-6 -mx-6 -mb-6 mt-auto flex flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-4">
            <div className="flex min-w-0 flex-1 flex-col text-[13px] text-muted max-sm:basis-full">
              <span>
                <span className="font-medium text-ink">{selected.length}</span> of {rows.length} selected
                {" · "}Out {formatMoney(totals.out)} · In {formatMoney(totals.in)}
              </span>
              {importError && <span className="text-spend">{importError}</span>}
            </div>
            <Button variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button
              onClick={handleImport}
              disabled={selected.length === 0 || importMutation.isPending}
              className="max-sm:flex-1"
            >
              {importMutation.isPending
                ? "Importing…"
                : `Import ${selected.length} ${selected.length === 1 ? "transaction" : "transactions"}`}
            </Button>
          </footer>
        </div>
      )}
    </Modal>
  );
};

const ColumnsPanel = ({
  columns,
  mapping,
  onChange,
  onApply,
  pending,
  error,
}: {
  columns: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
  onApply: () => void;
  pending: boolean;
  error: string | null;
}) => {
  const splitAmounts = mapping.amount == null;

  const columnSelect = (
    role: "date" | "description" | "description_extra" | "amount" | "debit" | "credit",
    label: string,
    optional = true
  ) => (
    <Field label={label}>
      <select
        className="field"
        value={mapping[role] ?? ""}
        onChange={(e) =>
          onChange({ ...mapping, [role]: e.target.value === "" ? null : Number(e.target.value) })
        }
      >
        {optional && <option value="">None</option>}
        {columns.map((c, i) => (
          <option key={i} value={i}>
            {c}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {columnSelect("date", "Date", false)}
        {columnSelect("description", "Description")}
        {columnSelect("description_extra", "More description")}
        <Field label="Date format">
          <select
            className="field"
            value={mapping.date_format ?? ""}
            onChange={(e) => onChange({ ...mapping, date_format: e.target.value || null })}
          >
            <option value="">Detect</option>
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Segmented
        label="Amount columns"
        size="sm"
        options={[
          { value: "single", label: "One amount column" },
          { value: "split", label: "Separate money out / in" },
        ]}
        value={splitAmounts ? "split" : "single"}
        onChange={(v) =>
          onChange(
            v === "single"
              ? { ...mapping, amount: mapping.debit ?? mapping.credit ?? 0, debit: null, credit: null }
              : { ...mapping, amount: null, debit: mapping.amount ?? 0, credit: null }
          )
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {splitAmounts ? (
          <>
            {columnSelect("debit", "Money out")}
            {columnSelect("credit", "Money in")}
          </>
        ) : (
          columnSelect("amount", "Amount", false)
        )}
        <label className="flex items-center gap-2 self-end pb-3 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={mapping.flip_sign}
            onChange={(e) => onChange({ ...mapping, flip_sign: e.target.checked })}
          />
          Swap income and expenses
        </label>
      </div>
      {error && <FormError>{error}</FormError>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={onApply} disabled={pending}>
          {pending ? "Reading…" : "Re-read statement"}
        </Button>
        <span className="text-xs text-muted">This replaces any edits you've made below.</span>
      </div>
    </div>
  );
};
