import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

type SummaryTotals = {
  total_income: number;
  total_expense: number;
  net: number;
};

type CategorySummaryItem = {
  category_id: number | null;
  category_name: string | null;
  total_income: number;
  total_expense: number;
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

const fetchSummary = async (
  filters: Filters
): Promise<SummaryResponse> => {
  const params: Record<string, string> = {
    group_by: "category",
  };
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params[k] = v;
  });

  const { data } = await api.get("/reports/summary", {
    params,
  });
  return data;
};

export const ReportsPage: React.FC = () => {
  const [filters, setFilters] = useState<Filters>({});

  const { data, isLoading } = useQuery({
    queryKey: ["summary", filters],
    queryFn: () => fetchSummary(filters),
  });

  const onFilterChange =
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

  return (
    <div className="space-y-4">
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
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.start_date ?? ""}
              onChange={onFilterChange("start_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              End date
            </label>
            <input
              type="date"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.end_date ?? ""}
              onChange={onFilterChange("end_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Type
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.type ?? ""}
              onChange={onFilterChange("type")}
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
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.min_amount ?? ""}
              onChange={onFilterChange("min_amount")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Max amount
            </label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.max_amount ?? ""}
              onChange={onFilterChange("max_amount")}
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setFilters({})}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Totals */}
      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="h-24 animate-pulse bg-slate-900/80" />
          <Card className="h-24 animate-pulse bg-slate-900/80" />
          <Card className="h-24 animate-pulse bg-slate-900/80" />
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Income
                </p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">
                  ${totals.total_income.toFixed(2)}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Expenses
                </p>
                <p className="mt-2 text-2xl font-semibold text-rose-400">
                  ${totals.total_expense.toFixed(2)}
                </p>
              </Card>
              <Card>
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Net
                </p>
                <p
                  className={`mt-2 text-2xl font-semibold ${
                    totals.net >= 0
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  ${totals.net.toFixed(2)}
                </p>
              </Card>
            </div>
          )}

          {/* By category */}
          {data.by_category && data.by_category.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-medium text-slate-100">
                By category
              </h3>
              <div className="space-y-2 text-sm">
                {data.by_category.map((item) => (
                  <div
                    key={item.category_id ?? item.category_name}
                    className="flex items-center justify-between"
                  >
                    <span>
                      {item.category_name ?? "Uncategorized"}
                    </span>
                    <span className="text-slate-300">
                      +$
                      {item.total_income.toFixed(2)} / -$
                      {item.total_expense.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
