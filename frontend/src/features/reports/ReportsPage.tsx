import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../../lib/api";
import { Card, CardHeader, Skeleton } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { Icon } from "../../components/ui/Icon";
import { formatMoney, paletteColor, categoryColor } from "../../lib/format";


type SummaryTotals = {
  total_income: number | string;
  total_investment: number | string;
  total_expense: number | string;
  net: number | string;
};

type CategorySummaryItem = {
  category_id: number | null;
  category_name: string | null;
  total_income: number | string;
  total_investment: number | string;
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
  type?: "income" | "expense" | "investment" | "";
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

const TYPE_OPTIONS: { value: "" | "income" | "expense" | "investment"; label: string }[] = [
  { value: "", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "investment", label: "Investment" },
];

export const ReportsPage: React.FC = () => {
  const [filters, setFilters] = useState<Filters>({});
  const [exporting, setExporting] = useState(false);

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

    setExporting(true);
    try {
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
    } finally {
      setExporting(false);
    }
  };

  const totals = data?.totals;
  const byCategory = data?.by_category ?? [];

  const totalIncome = toNumber(totals?.total_income);
  const totalInvestment = toNumber(totals?.total_investment);
  const totalExpense = toNumber(totals?.total_expense);
  const net = toNumber(totals?.net);

  const tiles = [
    { label: "Income", value: totalIncome, color: "text-saved", dot: "bg-saved" },
    { label: "Investments", value: totalInvestment, color: "text-invest", dot: "bg-invest" },
    { label: "Expenses", value: totalExpense, color: "text-spend", dot: "bg-spend" },
    { label: "Net", value: net, color: net >= 0 ? "text-saved" : "text-spend", dot: "bg-accent" },
  ];

  const maxCategoryValue = Math.max(
    1,
    ...byCategory.map((item) =>
      Math.max(toNumber(item.total_income), toNumber(item.total_investment), toNumber(item.total_expense))
    )
  );
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            Start date
            <input
              type="date"
              className="field"
              value={filters.start_date ?? ""}
              onChange={handleFilterChange("start_date")}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
            End date
            <input
              type="date"
              className="field"
              value={filters.end_date ?? ""}
              onChange={handleFilterChange("end_date")}
            />
          </label>
          <label className="flex w-28 flex-col gap-1.5 text-[13px] font-medium text-muted">
            Min amount
            <input
              type="number"
              className="field"
              placeholder="0.00"
              value={filters.min_amount ?? ""}
              onChange={handleFilterChange("min_amount")}
            />
          </label>
          <label className="flex w-28 flex-col gap-1.5 text-[13px] font-medium text-muted">
            Max amount
            <input
              type="number"
              className="field"
              placeholder="Any"
              value={filters.max_amount ?? ""}
              onChange={handleFilterChange("max_amount")}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted">Type</span>
            <Segmented
              label="Type"
              options={TYPE_OPTIONS}
              value={filters.type ?? ""}
              onChange={(value) => setFilters((prev) => ({ ...prev, type: value || undefined }))}
            />
          </div>
          <div className="ml-auto flex gap-2">
            {hasFilters && (
              <Button variant="ghost" onClick={handleClearFilters}>
                Clear
              </Button>
            )}
            <Button variant="dark" onClick={handleExportCsv} disabled={exporting}>
              <Icon name="download" size={16} />
              {exporting ? "Exporting..." : "Export CSV"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Totals */}
      {isLoading || !totals ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {tiles.map((t) => (
              <Card key={t.label} className="p-4 sm:p-5">
                <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <span className={clsx("h-2 w-2 rounded-full", t.dot)} />
                  {t.label}
                </p>
                <p className={clsx("mt-2 text-2xl font-semibold tracking-tight", t.color)}>
                  {formatMoney(t.value)}
                </p>
              </Card>
            ))}
          </div>

          {/* By category */}
          {byCategory && byCategory.length > 0 && (
            <Card>
              <CardHeader title="By category" subtitle="Money in, invested and spent in the selected range" />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="py-3 font-medium">Category</th>
                      <th className="py-3 text-right font-medium">Income</th>
                      <th className="py-3 text-right font-medium">Invested</th>
                      <th className="py-3 text-right font-medium">Spent</th>
                      <th className="w-[28%] py-3 pl-6 font-medium">Spending</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((item, i) => {
                      const income = toNumber(item.total_income);
                      const investment = toNumber(item.total_investment);
                      const expense = toNumber(item.total_expense);
                      const color =
                        item.category_id != null
                          ? categoryColor({ id: item.category_id, color: null })
                          : paletteColor(i);
                      return (
                        <tr
                          key={
                            item.category_id ?? item.category_name ?? Math.random()
                          }
                          className="border-t border-line-soft"
                        >
                          <td className="py-3">
                            <span className="inline-flex items-center gap-2.5 text-ink">
                              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
                              {item.category_name ?? "Uncategorized"}
                            </span>
                          </td>
                          <td className="py-3 text-right text-saved">+{formatMoney(income)}</td>
                          <td className="py-3 text-right text-invest">+{formatMoney(investment)}</td>
                          <td className="py-3 text-right font-medium text-ink">−{formatMoney(expense)}</td>
                          <td className="py-3 pl-6">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-line-soft">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(expense / maxCategoryValue) * 100}%`,
                                  backgroundColor: color,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
