import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Card, CardHeader, Skeleton } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { FormError } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { fetchIncome, upsertIncome } from "../../lib/income-api";
import type { Income, IncomeFrequency } from "../../lib/types";
import { IncomeProjections } from "./IncomeProjections";

const FREQUENCY_OPTIONS: { value: IncomeFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const IncomePage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: income, isLoading } = useQuery({
    queryKey: ["income"],
    queryFn: fetchIncome,
  });

  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<IncomeFrequency>("monthly");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (income) {
      setAmount(String(income.amount));
      setFrequency(income.frequency);
    }
  }, [income]);

  const mutation = useMutation({
    mutationFn: upsertIncome,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["income"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Unable to save income.");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const numericAmount = Number(amount);
    if (!amount || numericAmount <= 0) {
      setError("Amount must be greater than 0.");
      return;
    }

    mutation.mutate({ amount: numericAmount, frequency });
  };

  // Reflect what's currently in the form, not just the last saved value,
  // so the projection updates live as the user types or changes frequency.
  const numericAmount = Number(amount);
  const previewIncome: Income | null =
    amount && numericAmount > 0
      ? {
          id: income?.id ?? 0,
          amount: numericAmount,
          frequency,
          created_at: income?.created_at,
          updated_at: income?.updated_at,
        }
      : income ?? null;

  return (
    <div className="grid items-start gap-5 md:grid-cols-2">
      <Card>
        <CardHeader title="Your current income" subtitle="How much each paycheck is, and how often it arrives" />
        {isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted">Amount</span>
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
            </label>
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
            {saved && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-saved">
                <Icon name="check" size={16} strokeWidth={2.4} />
                Income saved.
              </p>
            )}
            <Button type="submit" size="lg" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save income"}
            </Button>
          </form>
        )}
      </Card>

      <IncomeProjections income={previewIncome} title="What that adds up to" />
    </div>
  );
};
