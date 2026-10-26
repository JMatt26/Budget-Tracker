import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Card, CardHeader, Skeleton } from "../../components/ui/Card";
import { Button, IconButton } from "../../components/ui/Button";
import { Field, FormActions, FormError } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import {
  createIncome,
  deleteIncome,
  fetchIncomes,
  updateIncome,
  type IncomePayload,
} from "../../lib/income-api";
import { formatMoney } from "../../lib/format";
import type { Income, IncomeFrequency } from "../../lib/types";
import { FREQUENCY_TEXT, IncomeProjections } from "./IncomeProjections";

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semimonthly", label: "Twice a month" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const IncomeForm = ({
  income,
  onClose,
  onSuccess,
}: {
  income: Income | null;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [name, setName] = useState(income?.name ?? "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [frequency, setFrequency] = useState<IncomeFrequency>(income?.frequency ?? "monthly");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: IncomePayload) =>
      income ? updateIncome(income.id, payload) : createIncome(payload),
    onSuccess,
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Unable to save income.");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (!name.trim()) {
      setError("Give this income a name.");
      return;
    }
    if (!amount || numericAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }
    mutation.mutate({ name: name.trim(), amount: numericAmount, frequency });
  };

  return (
    <Modal
      title={income ? "Edit income" : "Add income"}
      subtitle="How much it is, and how often it arrives"
      onClose={onClose}
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Main job, Freelance"
            autoFocus
          />
        </Field>
        <Field label="Amount">
          <span className="flex min-h-[60px] items-center gap-1 rounded-2xl border border-line px-4 text-2xl font-semibold text-ink transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            $
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-semibold text-ink placeholder:text-line focus:outline-none focus:ring-0"
              placeholder="0.00"
            />
          </span>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Frequency</span>
          <div role="group" aria-label="Frequency" className="grid grid-cols-2 gap-2">
            {FREQUENCY_OPTIONS.map((opt) => {
              const active = frequency === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFrequency(opt.value)}
                  className={clsx(
                    "min-h-[48px] rounded-xl border-[1.5px] text-sm font-medium transition",
                    active
                      ? "border-accent bg-accent-soft/60 text-ink"
                      : "border-line bg-surface text-ink hover:border-ink/25"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        {error && <FormError>{error}</FormError>}
        <FormActions>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : income ? "Save changes" : "Add income"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
};

export const IncomePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: incomes = [], isLoading } = useQuery({
    queryKey: ["income"],
    queryFn: fetchIncomes,
  });

  // `undefined` = closed, `null` = adding a new source, Income = editing it.
  const [editing, setEditing] = useState<Income | null | undefined>(undefined);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["income"] });

  const removeMutation = useMutation({
    mutationFn: deleteIncome,
    onSuccess: refresh,
  });

  const handleDelete = (income: Income) => {
    if (window.confirm(`Delete "${income.name}"?`)) {
      removeMutation.mutate(income.id);
    }
  };

  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Your income sources"
          subtitle="Each source can arrive on its own schedule"
          action={
            <Button size="sm" onClick={() => setEditing(null)}>
              <Icon name="plus" size={16} />
              Add income
            </Button>
          }
        />
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : incomes.length === 0 ? (
          <p className="text-sm text-muted">
            No income yet. Add your paycheck, side income, or anything else you earn.
          </p>
        ) : (
          <ul className="flex flex-col">
            {incomes.map((income) => (
              <li
                key={income.id}
                className="flex items-center gap-3 border-t border-line-soft py-3.5 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{income.name}</p>
                  <p className="text-[13px] text-muted">
                    {formatMoney(income.amount)} {FREQUENCY_TEXT[income.frequency]}
                  </p>
                </div>
                <IconButton label={`Edit ${income.name}`} onClick={() => setEditing(income)}>
                  <Icon name="edit" size={16} />
                </IconButton>
                <IconButton label={`Delete ${income.name}`} onClick={() => handleDelete(income)}>
                  <Icon name="trash" size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <IncomeProjections incomes={incomes} title="What that adds up to" />

      {editing !== undefined && (
        <IncomeForm
          income={editing}
          onClose={() => setEditing(undefined)}
          onSuccess={() => {
            refresh();
            setEditing(undefined);
          }}
        />
      )}
    </div>
  );
};
