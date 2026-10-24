import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100">Income</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-medium text-slate-100">
            Your current income
          </h3>
          {isLoading ? (
            <div className="h-24 animate-pulse rounded-lg bg-slate-800/60" />
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Frequency
                </label>
                <select
                  value={frequency}
                  onChange={(e) =>
                    setFrequency(e.target.value as IncomeFrequency)
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              {saved && (
                <p className="text-sm text-emerald-400">Income saved.</p>
              )}
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving..." : "Save income"}
              </Button>
            </form>
          )}
        </Card>

        <IncomeProjections income={previewIncome} />
      </div>
    </div>
  );
};
