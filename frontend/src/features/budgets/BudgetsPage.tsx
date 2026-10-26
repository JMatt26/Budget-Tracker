import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { api } from "../../lib/api";
import { Card, Skeleton } from "../../components/ui/Card";
import { Button, IconButton } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, FormActions, FormError } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { Icon } from "../../components/ui/Icon";
import { ProgressBar, budgetTone, TONE_TEXT } from "../../components/ui/Progress";
import type { Budget } from "../../lib/types";
import { fetchBudgets, fetchBudgetStatus } from "../../lib/budget-api";
import { describeBudgetPeriod, formatMoney } from "../../lib/format";

const BudgetStatusCard = ({ budget }: { budget: Budget }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["budget-status", budget.id],
    queryFn: () => fetchBudgetStatus(budget.id),
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Refetch when component mounts
    staleTime: 0, // Always consider data stale to ensure fresh results
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget-status"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to delete budget");
    },
  });

  const limit = Number(budget.limit ?? 0);
  const spent = Number(data?.total_expense ?? 0);
  const remaining = Number(data?.remaining ?? 0);
  const exceeded = data?.exceeded ?? false;
  const progress = limit > 0 ? (spent / limit) * 100 : 0;
  const tone = exceeded ? "over" : budgetTone(spent, limit);

  return (
    <article className="card-hover relative flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      {/* Whole card links to the detail page; the delete button sits above it. */}
      <Link
        to={`/budgets/${budget.id}`}
        aria-label={`Open ${budget.name}`}
        className="absolute inset-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <h3 title={budget.name} className="max-w-full truncate text-base font-semibold text-ink">
            {budget.name}
          </h3>
          <span className="rounded-md bg-line-soft px-2 py-0.5 text-xs font-medium text-muted">
            {describeBudgetPeriod(budget.start_date, budget.end_date)}
            {budget.recurrence && " · Repeats"}
          </span>
          {budget.category && (
            <p className="text-xs text-muted">
              Category: {budget.category.name}
            </p>
          )}
        </div>
        <div className="-mr-2 -mt-1 flex items-center gap-1">
          <IconButton
            label={deleteBudgetMutation.isPending ? "Deleting..." : `Delete ${budget.name}`}
            className="relative z-10 hover:bg-spend-soft hover:text-spend"
            disabled={deleteBudgetMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  budget.recurrence
                    ? `Are you sure you want to delete "${budget.name}" and all of its past cycles? This will remove the budget association from their transactions.`
                    : `Are you sure you want to delete "${budget.name}"? This will remove the budget association from all transactions.`
                )
              ) {
                deleteBudgetMutation.mutate(budget.id);
              }
            }}
          >
            <Icon name="trash" size={16} />
          </IconButton>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-32 rounded-lg" />
          <span className="text-xs text-muted">Calculating...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted">
            {exceeded ? "Over budget by" : "Left to spend"}
          </span>
          <span
            className={clsx(
              "text-3xl font-semibold tracking-tight",
              exceeded ? "text-spend" : "text-ink"
            )}
          >
            {formatMoney(Math.abs(remaining))}
          </span>
        </div>
      )}

      <ProgressBar value={progress} tone={tone} />

      <div className="flex justify-between text-[13px] text-muted">
        <span>
          {formatMoney(spent)} of {formatMoney(limit)} spent
        </span>
        <span className={clsx("font-medium", TONE_TEXT[tone])}>
          {Math.round(progress)}%
        </span>
      </div>

      {exceeded && (
        <p className="-mt-2 text-xs text-spend">
          You've exceeded this budget.
        </p>
      )}
    </article>
  );
};

type BudgetPeriod = "monthly" | "weekly" | "specified";

const PERIOD_OPTIONS: { value: BudgetPeriod; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "specified", label: "Custom dates" },
];

const BudgetForm = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    period: "monthly" as BudgetPeriod,
    startDate: "",
    endDate: "",
  });
  const [error, setError] = useState<string | null>(null);

  // Helper function to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper function to format date string (YYYY-MM-DD) for display
  const formatDateForDisplay = (dateStr: string): string => {
    const [year, month, day] = dateStr.split("-");
    return `${month}/${day}/${year}`;
  };

  // Helper functions to calculate dates
  const getMonthlyDates = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  };

  const getWeeklyDates = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Adjust to Monday
    const start = new Date(now.getFullYear(), now.getMonth(), diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  };

  // Update dates when period changes
  useEffect(() => {
    if (formData.period === "monthly") {
      const dates = getMonthlyDates();
      setFormData((prev) => ({
        ...prev,
        startDate: dates.startDate,
        endDate: dates.endDate,
      }));
    } else if (formData.period === "weekly") {
      const dates = getWeeklyDates();
      setFormData((prev) => ({
        ...prev,
        startDate: dates.startDate,
        endDate: dates.endDate,
      }));
    }
  }, [formData.period]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formData.name.trim(),
        start_date: formData.startDate,
        end_date: formData.endDate,
        // Monthly and weekly budgets reset each cycle; custom dates don't repeat.
        recurrence: formData.period === "specified" ? null : formData.period,
      };
      const { data } = await api.post("/budgets", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Unable to create budget.");
    },
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (formData.period === "specified") {
      if (!formData.startDate || !formData.endDate) {
        setError("Start and end dates are required.");
        return;
      }
      if (formData.startDate > formData.endDate) {
        setError("End date must be after start date.");
        return;
      }
    } else {
      // For monthly/weekly, dates should already be set, but validate anyway
      if (!formData.startDate || !formData.endDate) {
        setError("Dates could not be calculated. Please try again.");
        return;
      }
    }

    mutation.mutate();
  };

  return (
    <Modal title="Create budget" onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="Name">
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="field"
            placeholder="Budget name"
            maxLength={100}
            autoFocus
          />
        </Field>
        <p className="text-sm text-muted">
          The budget limit is your total monthly income, so it updates when your income does.
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Period</span>
          <Segmented
            label="Period"
            fullWidth
            options={PERIOD_OPTIONS}
            value={formData.period}
            onChange={(period) => setFormData((prev) => ({ ...prev, period }))}
          />
        </div>
        {formData.period === "specified" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date">
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    startDate: e.target.value,
                  }))
                }
                className="field"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    endDate: e.target.value,
                  }))
                }
                className="field"
              />
            </Field>
          </div>
        ) : (
          <div className="rounded-xl bg-canvas px-4 py-3 text-sm">
            <p className="text-muted">
              {formData.period === "monthly"
                ? "Covers the current month and resets each month. Past months stay in Historic View."
                : "Covers the current week and resets each week. Past weeks stay in Historic View."}
            </p>
            <p className="mt-1 font-medium text-ink">
              {formData.startDate && formData.endDate
                ? `${formatDateForDisplay(formData.startDate)} - ${formatDateForDisplay(formData.endDate)}`
                : "Calculating dates..."}
            </p>
          </div>
        )}
        {error && <FormError>{error}</FormError>}
        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
};

export const BudgetsPage: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: fetchBudgets,
    refetchOnMount: true, // Refetch when component mounts
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {data ? `${data.items.length} ${data.items.length === 1 ? "budget" : "budgets"}` : ""}
        </p>
        <Button variant="dark" onClick={() => setShowCreateModal(true)}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          New budget
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : data.items.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-muted">
            You don’t have any budgets yet.
          </p>
        </Card>
      ) : null}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((budget) => (
            <BudgetStatusCard key={budget.id} budget={budget} />
          ))}
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#C9CED6] text-sm font-medium text-muted transition hover:border-accent hover:text-accent"
          >
            <Icon name="plus" size={22} strokeWidth={2} />
            New budget
            <span className="text-xs font-normal">Monthly, weekly or custom dates</span>
          </button>
        </div>
      )}
      {showCreateModal && (
        <BudgetForm onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
};
