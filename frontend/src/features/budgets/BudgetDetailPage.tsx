import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { fetchBudget, fetchBudgetStatus } from "../../lib/budget-api";
import type { BudgetStatus } from "../../lib/types";

const formatCurrency = (value: number | undefined | null) =>
  `$${Number(value ?? 0).toFixed(2)}`;

type TabKey = "numeric" | "graphs" | "charts";

const tabLabels: Record<TabKey, string> = {
  numeric: "Numeric",
  graphs: "Graphs",
  charts: "Charts",
};

export const BudgetDetailPage: React.FC = () => {
  const params = useParams();
  const budgetId = Number(params.budgetId ?? "");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("numeric");

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ["budget", budgetId],
    queryFn: () => fetchBudget(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  const {
    data: status,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: ["budget-status", budgetId],
    queryFn: () => fetchBudgetStatus(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  const loading = budgetLoading || statusLoading;

  const numericContent = useMemo(() => {
    const totalExpense = status?.total_expense ?? 0;
    const remaining = status?.remaining ?? 0;
    const limit = budget ? Number(budget.limit ?? 0) : 0;
    const progress = limit ? Math.min(100, (totalExpense / limit) * 100) : 0;
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Limit
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">
            {formatCurrency(limit)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Spent
          </p>
          <p className="mt-2 text-2xl font-semibold text-rose-400">
            {formatCurrency(totalExpense)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Remaining
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            {formatCurrency(remaining)}
          </p>
        </Card>
        <Card className="md:col-span-3">
          <p className="text-xs text-slate-400 uppercase tracking-wide">
            Progress
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </Card>
      </div>
    );
  }, [budget, status]);

  const graphsContent = (
    <Card>
      <p className="text-sm text-slate-100">
        {budget ? budget.name : "Budget"} timeline
      </p>
      <div className="mt-4 space-y-2 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/2 rounded-full bg-emerald-500/60" />
          <span>Projected spending curve</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/3 rounded-full bg-rose-500/60" />
          <span>Actual spend line</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/4 rounded-full bg-blue-500/60" />
          <span>Investment savings</span>
        </div>
      </div>
    </Card>
  );

  const chartsContent = (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Expense breakdown
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Pie-chart view coming soon.
        </p>
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Trend
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Chart placeholder; integrate d3 or chart.js later.
        </p>
      </Card>
    </div>
  );

  if (Number.isNaN(budgetId)) {
    return (
      <Card>
        <p className="text-sm text-rose-400">
          Invalid budget selected.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {budget ? budget.name : "Budget details"}
          </h2>
          {budget && (
            <p className="text-xs text-slate-400">
              {budget.start_date} → {budget.end_date}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          onClick={() => navigate("/budgets")}
        >
          Back to budgets
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                tab === activeTab
                  ? "bg-slate-200 text-slate-900"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-900"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </Card>

      {loading || !budget ? (
        <Card className="h-32 animate-pulse bg-slate-900/80" />
      ) : (
        <>
          {activeTab === "numeric" && numericContent}
          {activeTab === "graphs" && graphsContent}
          {activeTab === "charts" && chartsContent}
        </>
      )}
    </div>
  );
};

