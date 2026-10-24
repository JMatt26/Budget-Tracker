import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import type { Budget, BudgetStatus } from "../../lib/types";
import { fetchBudgets, fetchBudgetStatus } from "../../lib/budget-api";

const BudgetStatusCard = ({ budget }: { budget: Budget }) => {
  const navigate = useNavigate();
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
  const spent = data?.total_expense ?? 0;
  const remaining = data?.remaining ?? 0;
  const exceeded = data?.exceeded ?? false;
  const progress =
    limit > 0 ? Math.min(100, (Number(spent) / Number(limit)) * 100) : 0;

  return (
    <Card 
      className="space-y-3 cursor-pointer transition hover:border-sky-500/50 hover:bg-slate-900/80"
      onClick={() => navigate(`/budgets/${budget.id}`)}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {budget.name}
          </h3>
          {budget.category && (
            <p className="text-xs text-slate-400">
              Category: {budget.category.name}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Limit: ${limit.toFixed(2)}
          </p>
        </div>
        {isLoading ? (
          <span className="text-xs text-slate-400">
            Calculating...
          </span>
        ) : (
          <div className="text-right">
            <p className="text-xs text-slate-400">Spent</p>
            <p className="text-sm font-semibold text-rose-300">
              ${Number(spent).toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Remaining{" "}
              <span
                className={
                  exceeded ? "text-rose-400" : "text-emerald-400"
                }
              >
                $
                {Number(remaining).toFixed(2)}
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${
            exceeded ? "bg-rose-500" : "bg-emerald-500"
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {exceeded && (
        <p className="text-xs text-rose-400">
          You've exceeded this budget.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (
              window.confirm(
                `Are you sure you want to delete "${budget.name}"? This will remove the budget association from all transactions.`
              )
            ) {
              deleteBudgetMutation.mutate(budget.id);
            }
          }}
          className="text-xs text-rose-400 hover:text-rose-300 transition"
          disabled={deleteBudgetMutation.isPending}
        >
          {deleteBudgetMutation.isPending ? "Deleting..." : "Delete"}
        </button>
      </div>
    </Card>
  );
};

const BudgetForm = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    limit: "",
    period: "monthly" as "monthly" | "weekly" | "specified",
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
        limit: Number(formData.limit),
        start_date: formData.startDate,
        end_date: formData.endDate,
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
    if (!formData.limit || Number(formData.limit) <= 0) {
      setError("Limit must be greater than 0.");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">
          Create budget
        </h2>
        <form
          className="space-y-4"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="Budget name"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Limit
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.limit}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, limit: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              min="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Period
            </label>
            <select
              value={formData.period}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  period: e.target.value as "monthly" | "weekly" | "specified",
                }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="specified">Specified Date</option>
            </select>
          </div>
          {formData.period === "specified" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Start date
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      startDate: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  End date
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      endDate: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-400">
              <p className="text-xs">
                {formData.period === "monthly"
                  ? "This budget will cover the current month"
                  : "This budget will cover the current week"}
              </p>
              <p className="mt-1 text-xs">
                {formData.startDate && formData.endDate
                  ? `${formatDateForDisplay(formData.startDate)} - ${formatDateForDisplay(formData.endDate)}`
                  : "Calculating dates..."}
              </p>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Budgets
        </h2>
        <Button onClick={() => setShowCreateModal(true)}>
          + New budget
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="h-32 animate-pulse bg-slate-900/80" />
          <Card className="h-32 animate-pulse bg-slate-900/80" />
          <Card className="h-32 animate-pulse bg-slate-900/80" />
        </div>
      ) : data.items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            You don’t have any budgets yet.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((budget) => (
            <BudgetStatusCard key={budget.id} budget={budget} />
          ))}
        </div>
      )}
      {showCreateModal && (
        <BudgetForm onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
};
