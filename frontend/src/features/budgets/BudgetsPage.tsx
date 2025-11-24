import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

type Budget = {
  id: number;
  name: string;
  // your backend uses "limit" in BudgetStatus calculations
  limit: number;
  start_date?: string | null;
  end_date?: string | null;
  // optional category relationship
  category?: {
    id: number;
    name: string;
  } | null;
};

type BudgetListResponse = {
  items: Budget[];
  total: number;
  limit: number;
  offset: number;
};

type BudgetStatus = {
  budget: Budget;
  total_expense: number;
  remaining: number;
  exceeded: boolean;
};

const fetchBudgets = async (): Promise<BudgetListResponse> => {
  const { data } = await api.get("/budgets", {
    params: { limit: 50, offset: 0 },
  });
  return data;
};

const fetchBudgetStatus = async (
  id: number
): Promise<BudgetStatus> => {
  const { data } = await api.get(`/budgets/${id}/status`);
  return data;
};

const BudgetStatusCard = ({ budget }: { budget: Budget }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["budget-status", budget.id],
    queryFn: () => fetchBudgetStatus(budget.id),
  });

  const limit = budget.limit ?? 0;
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

export const BudgetsPage: React.FC = () => {
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
        <Button
          variant="ghost"
          disabled
          className="cursor-not-allowed opacity-60"
          title="Budget creation UI coming soon"
        >
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
    </div>
  );
};
