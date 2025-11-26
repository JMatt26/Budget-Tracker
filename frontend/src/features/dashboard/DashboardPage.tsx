import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";

type LegacySummary = {
  total_income?: number;
  total_expense?: number;
  net?: number;
  by_category?: {
    category_id: number | null;
    category_name: string | null;
    income?: number;
    expense?: number;
    total_income?: number;
    total_expense?: number;
  }[];
};

type NewSummary = {
  start_date: string | null;
  end_date: string | null;
  totals: {
    total_income?: number;
    total_expense?: number;
    total_investment?: number;
    net?: number;
  };
  by_category?: {
    category_id: number | null;
    category_name: string | null;
    total_income?: number;
    total_expense?: number;
  }[];
};

type AnySummary = LegacySummary | NewSummary;

const fetchSummary = async (): Promise<AnySummary> => {
  const { data } = await api.get("/reports/summary");
  return data;
};

export const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="h-24 animate-pulse bg-slate-900/80" />
        <Card className="h-24 animate-pulse bg-slate-900/80" />
        <Card className="h-24 animate-pulse bg-slate-900/80" />
      </div>
    );
  }

  // 👇 Handle both shapes: legacy and new (with .totals)
  const summaryWithTotals = data as NewSummary;
  const legacySummary = data as LegacySummary;

  const total_income_raw =
    summaryWithTotals.totals?.total_income ??
    legacySummary.total_income ??
    0;

  const total_investment_raw =
    summaryWithTotals.totals?.total_investment ?? 0;

  const total_expense_raw =
    summaryWithTotals.totals?.total_expense ??
    legacySummary.total_expense ??
    0;

  const net_raw =
    summaryWithTotals.totals?.net ??
    legacySummary.net ??
    (total_income_raw + total_investment_raw - total_expense_raw);

  // 👇 Safely convert to numbers so .toFixed never explodes
  const total_income = Number(total_income_raw ?? 0);
  const total_investment = Number(total_investment_raw ?? 0);
  const total_expense = Number(total_expense_raw ?? 0);
  const net = Number(net_raw ?? 0);

  const byCategory = (data as any).by_category ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Income
          </p>
          <p className="mt-2 text-2xl font-semibold text-emerald-400">
            ${total_income.toFixed(2)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Investments
          </p>
          <p className="mt-2 text-2xl font-semibold text-blue-400">
            ${total_investment.toFixed(2)}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Expenses
          </p>
          <p className="mt-2 text-2xl font-semibold text-rose-400">
            ${total_expense.toFixed(2)}
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

      {byCategory && byCategory.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium text-slate-100">
            By category
          </h2>
          <div className="space-y-2 text-sm">
            {byCategory.map((cat: any) => (
              <div
                key={cat.category_id ?? cat.category_name}
                className="flex items-center justify-between"
              >
                <span>{cat.category_name ?? "Uncategorized"}</span>
                <span className="text-slate-300">
                  +$
                  {Number(
                    cat.total_income ?? cat.income ?? 0
                  ).toFixed(2)}{" "}
                  &nbsp; / &nbsp; -$
                  {Number(
                    cat.total_expense ?? cat.expense ?? 0
                  ).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
