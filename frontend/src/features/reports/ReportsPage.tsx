import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";


type SummaryTotals = {
  total_income: number | string;
  total_expense: number | string;
  net: number | string;
};

type CategorySummaryItem = {
  category_id: number | null;
  category_name: string | null;
  total_income: number | string;
  total_expense: number | string;
};

type SummaryResponse = {
  start_date: string | null;
  end_date: string | null;
  totals: SummaryTotals;
  by_category?: CategorySummaryItem[] | null;
};

type Filters = {
  start_date?: string;
  end_date?: string;
  type?: "income" | "expense" | "";
  category_id?: string;
  min_amount?: string;
  max_amount?: string;
};

// ---- Helpers ----

const fetchSummary = async (filters: Filters): Promise<SummaryResponse> => {
  const params: Record<string, string> = {
    group_by: "category",
  };
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params[k] = v;
  });

  const { data } = await api.get<SummaryResponse>("/reports/summary", {
    params,
  });
  return data;
};

const toNumber = (value: number | string | null | undefined): number =>
  Number(value ?? 0);

export const ReportsPage: React.FC = () => {
  const [filters, setFilters] = useState<Filters>({});

  const { data, isLoading } = useQuery({
    queryKey: ["summary", filters],
    queryFn: () => fetchSummary(filters),
  });

  const handleFilterChange =
    (field: keyof Filters) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement
      >
    ) => {
      const value = e.target.value;
      setFilters((prev) => ({
        ...prev,
        [field]: value || undefined,
      }));
    };

  const handleClearFilters = () => {
    setFilters({});
  };

  const handleExportCsv = async () => {
    const params: Record<string, string> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params[k] = v;
    });

    const response = await api.get(
      "/reports/transactions/export",
      {
        params,
        responseType: "blob",
      }
    );

    const blob = new Blob([response.data], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "transactions.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const totals = data?.totals;
  const byCategory = data?.by_category ?? [];

  const totalIncome = toNumber(totals?.total_income);
  const totalExpense = toNumber(totals?.total_expense);
  const net = toNumber(totals?.net);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          Reports
        </h2>
        <Button onClick={handleExportCsv}>
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Start date
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={filters.start_date ?? ""}
              onChange={handleFilterChange("start_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              End date
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={filters.end_date ?? ""}
              onChange={handleFilterChange("end_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Type
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={filters.type ?? ""}
              onChange={handleFilterChange("type")}
            >
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Min amount
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={filters.min_amount ?? ""}
              onChange={handleFilterChange("min_amount")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Max amount
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              value={filters.max_amount ?? ""}
              onChange={handleFilterChange("max_amount")}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Totals */}
      {isLoading || !totals ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="h-24 animate-pulse bg-slate-900/80" />
          <Card className="h-24 animate-pulse bg-slate-900/80" />
          <Card className="h-24 animate-pulse bg-slate-900/80" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Income
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-400">
                ${totalIncome.toFixed(2)}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Expenses
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-400">
                ${totalExpense.toFixed(2)}
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Net
              </p>
              <p
                className={`mt-2 text-2xl font-semibold ${
                  net >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${net.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* By category */}
          {byCategory && byCategory.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-medium text-slate-100">
                By category
              </h3>
              <div className="space-y-2 text-sm">
                {byCategory.map((item) => {
                  const income = toNumber(
                    item.total_income
                  );
                  const expense = toNumber(
                    item.total_expense
                  );
                  return (
                    <div
                      key={
                        item.category_id ?? item.category_name ?? Math.random()
                      }
                      className="flex items-center justify-between"
                    >
                      <span>
                        {item.category_name ?? "Uncategorized"}
                      </span>
                      <span className="text-slate-300">
                        +${income.toFixed(2)} / -$
                        {expense.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
