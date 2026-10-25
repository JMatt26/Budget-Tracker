import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { computeProjections, type ProjectionView } from "../../lib/incomeProjections";

type MetricKey = "saved" | "investments" | "expenses" | "net";

const METRIC_CONFIG: Record<
  MetricKey,
  { label: string; color: string; field: "total_income" | "total_investment" | "total_expense" | "net" }
> = {
  saved: { label: "Saved", color: "text-emerald-400", field: "total_income" },
  investments: { label: "Investments", color: "text-blue-400", field: "total_investment" },
  expenses: { label: "Expenses", color: "text-rose-400", field: "total_expense" },
  net: { label: "Net", color: "text-emerald-400", field: "net" },
};

const VIEW_LABELS: Record<ProjectionView, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
};

const fetchMonthSummary = async () => {
  const { start, end } = getCurrentMonthRange();
  const { data } = await api.get("/reports/summary", {
    params: { start_date: start, end_date: end },
  });
  return data;
};

export const MetricProjectionPage = () => {
  const { metric } = useParams<{ metric: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<ProjectionView>("monthly");

  const config = METRIC_CONFIG[metric as MetricKey];

  const { data, isLoading } = useQuery({
    queryKey: ["summary-month"],
    queryFn: fetchMonthSummary,
    enabled: !!config,
  });

  if (!config) {
    return (
      <Card>
        <p className="text-sm text-rose-400">Unknown projection metric.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/")}>
          Back to dashboard
        </Button>
      </Card>
    );
  }

  if (isLoading || !data) {
    return <Card className="h-40 animate-pulse bg-slate-900/80" />;
  }

  const totals = data.totals ?? data;
  const monthlyAmount =
    config.field === "net"
      ? Number(
          totals.net ??
            Number(totals.total_income ?? 0) +
              Number(totals.total_investment ?? 0) -
              Number(totals.total_expense ?? 0)
        )
      : Number(totals[config.field] ?? 0);

  const projections = computeProjections(monthlyAmount, "monthly");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">
          {config.label} projections
        </h2>
        <Button variant="ghost" onClick={() => navigate("/")}>
          Back to dashboard
        </Button>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Based on this month's activity
          </p>
          <div className="flex gap-1 rounded-lg bg-slate-800/80 p-1">
            {(Object.keys(VIEW_LABELS) as ProjectionView[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={[
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  view === key
                    ? "bg-sky-500 text-white"
                    : "text-slate-300 hover:bg-slate-700/80 hover:text-white",
                ].join(" ")}
              >
                {VIEW_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        <p className={`text-4xl font-semibold ${config.color}`}>
          ${projections[view].toFixed(2)}
          <span className="ml-1 text-sm font-normal text-slate-400">
            / {view.replace("ly", "")}
          </span>
        </p>
      </Card>
    </div>
  );
};
