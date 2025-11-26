import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import type { Budget, BudgetStatus } from "../../lib/types";
import { fetchBudgets, fetchBudgetStatus } from "../../lib/budget-api";

const BudgetStatusCard = ({ budget }: { budget: Budget }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["budget-status", budget.id],
    queryFn: () => fetchBudgetStatus(budget.id),
  });

  const limit = Number(budget.limit ?? 0);
  const spent = data?.total_expense ?? 0;
  const remaining = data?.remaining ?? 0;
  const exceeded = data?.exceeded ?? false;
  const progress =
    limit > 0 ? Math.min(100, (Number(spent) / Number(limit)) * 100) : 0;

  return (
    <Card className="space-y-3">
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
          You’ve exceeded this budget.
        </p>
      )}
    </Card>
  );
};

const BudgetForm = ({ onClose }: { onClose: () => void }) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    limit: "",
    startDate: "",
    endDate: "",
  });
  const [error, setError] = useState<string | null>(null);

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
    if (!formData.startDate || !formData.endDate) {
      setError("Start and end dates are required.");
      return;
    }
    if (formData.startDate > formData.endDate) {
      setError("End date must be after start date.");
      return;
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
