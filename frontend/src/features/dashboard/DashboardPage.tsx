import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { api } from "../../lib/api";
import { Card, CardHeader, Skeleton } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Segmented";
import { ProgressBar, budgetTone, TONE_TEXT, CategoryAvatar } from "../../components/ui/Progress";
import { fetchIncome } from "../../lib/income-api";
import { fetchBudgets, fetchBudgetStatus } from "../../lib/budget-api";
import {
  fetchMonthSummary,
  getCurrentMonthLocalRange,
  readMetric,
  type AnySummary,
} from "../../lib/reports-api";
import { computeProjections } from "../../lib/incomeProjections";
import {
  categoryColor,
  describeBudgetPeriod,
  formatMoney,
  formatSignedMoney,
  paletteColor,
  TYPE_META,
} from "../../lib/format";
import type { Budget, Transaction } from "../../lib/types";
import { IncomeProjections } from "../income/IncomeProjections";
import { METRIC_CONFIG, METRIC_ORDER, type MetricKey } from "./metrics";

type TransactionListResponse = { items: Transaction[]; total: number };

const fetchSummary = async (): Promise<AnySummary> => {
  const { data } = await api.get("/reports/summary", {
    params: { group_by: "category" },
  });
  return data;
};

const fetchTransactions = async (params: Record<string, string | number>) => {
  const { data } = await api.get<TransactionListResponse>("/transactions", { params });
  return data;
};

type Period = "weekly" | "monthly" | "yearly" | "all";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
  { value: "yearly", label: "Year" },
  { value: "all", label: "All time" },
];

const PERIOD_SUFFIX: Record<Period, string> = {
  weekly: "/ week",
  monthly: "this month",
  yearly: "/ year",
  all: "all time",
};

export const DashboardPage = () => {
  const [period, setPeriod] = useState<Period>("monthly");
  const [metric, setMetric] = useState<MetricKey>("net");

  const { data, isLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: fetchSummary,
  });

  const { data: monthSummary, isLoading: monthLoading } = useQuery({
    queryKey: ["summary-month"],
    queryFn: fetchMonthSummary,
  });

  const { data: income } = useQuery({
    queryKey: ["income"],
    queryFn: fetchIncome,
  });

  if (isLoading || monthLoading || !data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-64" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  // All-time totals come from the summary; week/month/year are projected
  // from this month's activity, matching the projections pages.
  const valueFor = (key: MetricKey) => {
    const field = METRIC_CONFIG[key].field;
    if (period === "all") return readMetric(data, field);
    return computeProjections(readMetric(monthSummary, field), "monthly")[period];
  };

  const selected = METRIC_CONFIG[metric];
  const heroValue = valueFor(metric);
  const heroColor =
    metric === "net" ? (heroValue >= 0 ? "text-saved" : "text-spend") : selected.color;
  const heroLabel =
    period === "all"
      ? `${selected.label} · all time`
      : period === "monthly"
      ? `${selected.label} · this month`
      : `${selected.label} · projected at this month's pace`;

  const byCategory = data.by_category ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <Card className="flex flex-col gap-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted">{heroLabel}</span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={clsx("text-4xl font-semibold tracking-tight sm:text-5xl", heroColor)}>
                {formatMoney(heroValue)}
              </span>
              <span className="text-[15px] text-muted">{PERIOD_SUFFIX[period]}</span>
            </div>
            <span className="text-[13px] text-muted">
              {selected.note} ·{" "}
              <Link
                to={`/projections/${metric}`}
                className="font-medium text-accent hover:text-accent-hover"
              >
                Open projections
              </Link>
            </span>
          </div>
          <Segmented label="Period" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METRIC_ORDER.map((key) => {
            const cfg = METRIC_CONFIG[key];
            const active = key === metric;
            const value = valueFor(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setMetric(key)}
                className={clsx(
                  "card-hover flex flex-col gap-2.5 rounded-2xl border-[1.5px] p-4 text-left",
                  active ? "border-accent bg-accent-soft/50" : "border-line bg-surface"
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
                  <span className={clsx("h-2 w-2 rounded-full", cfg.dot)} />
                  {cfg.label}
                </span>
                <span
                  className={clsx(
                    "text-xl font-semibold tracking-tight",
                    key === "net" && value < 0 ? "text-spend" : "text-ink"
                  )}
                >
                  {formatMoney(value)}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <SpendingPace monthExpense={readMetric(monthSummary, "total_expense")} />
        <IncomeProjections income={income ?? null} showEditLink title="Earnings" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BudgetsSummary />
        <RecentActivity />
      </div>

      {byCategory.length > 0 && (
        <CategoryBreakdown
          rows={byCategory.map((cat, i) => ({
            key: String(cat.category_id ?? cat.category_name ?? i),
            name: cat.category_name ?? "Uncategorized",
            income: Number(cat.total_income ?? cat.income ?? 0),
            investment: Number(cat.total_investment ?? 0),
            expense: Number(cat.total_expense ?? cat.expense ?? 0),
            color:
              cat.category_id != null
                ? categoryColor({ id: cat.category_id, color: null })
                : paletteColor(i),
          }))}
        />
      )}
    </div>
  );
};

// Cumulative spending through the current month, with a dashed line that
// projects the current daily pace to month end.
const SpendingPace = ({ monthExpense }: { monthExpense: number }) => {
  const range = getCurrentMonthLocalRange();
  const { data, isLoading } = useQuery({
    queryKey: ["transactions", "dashboard-month-expenses", range.start, range.end],
    queryFn: () =>
      fetchTransactions({
        start_date: range.start,
        end_date: range.end,
        type: "expense",
        limit: 1000,
      }),
  });

  const chart = useMemo(() => {
    const W = 600;
    const H = 170;
    const daily = new Array(range.days).fill(0);
    (data?.items ?? []).forEach((tx) => {
      const day = Number(tx.date.slice(8, 10));
      if (day >= 1 && day <= range.days) daily[day - 1] += Number(tx.amount);
    });
    const today = new Date().getDate();
    let cum = 0;
    const cumulative = daily.slice(0, today).map((d) => (cum += d));
    const spent = cum;
    const projected = today > 0 ? (spent / today) * range.days : 0;
    const max = Math.max(projected, spent, 1) * 1.08;
    const x = (i: number) => (range.days <= 1 ? 0 : (i / (range.days - 1)) * W);
    const y = (v: number) => H - 6 - (v / max) * (H - 12);
    const pts = cumulative.map((v, i) => `${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
    const line = pts.length ? `M${pts.join(" L")}` : "";
    const area = pts.length
      ? `${line} L${x(cumulative.length - 1).toFixed(1)} ${H} L0 ${H} Z`
      : "";
    const last = cumulative.length - 1;
    const projection =
      last >= 0 ? `M${x(last).toFixed(1)} ${y(spent).toFixed(1)} L${W} ${y(projected).toFixed(1)}` : "";
    return { W, H, line, area, projection, spent, projected, daysLeft: range.days - today };
  }, [data, range.days]);

  return (
    <Card className="flex flex-col gap-4">
      <CardHeader
        className="mb-0"
        title="Spending pace"
        subtitle={`${formatMoney(monthExpense)} spent · ${chart.daysLeft} ${
          chart.daysLeft === 1 ? "day" : "days"
        } left this month`}
      />
      {isLoading ? (
        <Skeleton className="h-[170px]" />
      ) : (
        <svg
          viewBox={`0 0 ${chart.W} ${chart.H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Cumulative spending this month, ${formatMoney(chart.spent)}, projected ${formatMoney(chart.projected)} by month end`}
          className="block h-[170px] w-full"
        >
          {[0.33, 0.66].map((f) => (
            <line key={f} x1="0" x2={chart.W} y1={chart.H * f} y2={chart.H * f} stroke="#F0F2F5" />
          ))}
          <line x1="0" x2={chart.W} y1={chart.H - 1} y2={chart.H - 1} stroke="#E4E7EC" />
          <path d={chart.area} fill="#3451D1" fillOpacity="0.08" />
          <path
            d={chart.projection}
            fill="none"
            stroke="#98A2B3"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={chart.line}
            fill="none"
            stroke="#3451D1"
            strokeWidth="2.5"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded bg-accent" />
          Spent so far
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed border-[#98A2B3]" />
          At this pace: {formatMoney(chart.projected)}
        </span>
      </div>
    </Card>
  );
};

const BudgetRow = ({ budget }: { budget: Budget }) => {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["budget-status", budget.id],
    queryFn: () => fetchBudgetStatus(budget.id),
  });
  const limit = Number(budget.limit ?? 0);
  const spent = Number(data?.total_expense ?? 0);
  const tone = budgetTone(spent, limit);
  const progress = limit > 0 ? (spent / limit) * 100 : 0;

  return (
    <button
      type="button"
      onClick={() => navigate(`/budgets/${budget.id}`)}
      className="-mx-3 flex flex-col gap-2 rounded-xl px-3 py-3 text-left transition hover:bg-canvas"
    >
      <span className="flex w-full justify-between gap-3 text-sm">
        <span className="font-medium text-ink">{budget.name}</span>
        <span className={clsx("font-medium", TONE_TEXT[tone])}>
          {data
            ? data.exceeded
              ? `${formatMoney(Math.abs(Number(data.remaining)))} over`
              : `${formatMoney(data.remaining)} left`
            : "…"}
        </span>
      </span>
      <ProgressBar value={progress} tone={tone} />
      <span className="text-xs text-muted">
        {formatMoney(spent)} of {formatMoney(limit)} ·{" "}
        {describeBudgetPeriod(budget.start_date, budget.end_date)}
      </span>
    </button>
  );
};

const BudgetsSummary = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["budgets"],
    queryFn: fetchBudgets,
  });
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Budgets"
        action={
          <Link to="/budgets" className="text-[13px] font-medium text-accent hover:text-accent-hover">
            See all
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          No budgets yet.{" "}
          <Link to="/budgets" className="font-medium text-accent">
            Create one
          </Link>
        </p>
      ) : (
        <div className="flex flex-col">
          {items.slice(0, 4).map((b) => (
            <BudgetRow key={b.id} budget={b} />
          ))}
        </div>
      )}
    </Card>
  );
};

const RecentActivity = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: () => fetchTransactions({ limit: 6, offset: 0 }),
  });
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader
        title="Recent activity"
        action={
          <Link
            to="/transactions"
            className="text-[13px] font-medium text-accent hover:text-accent-hover"
          >
            View all
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No transactions yet. Press N to add one.</p>
      ) : (
        <div className="flex flex-col">
          {items.map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-2.5">
              <CategoryAvatar
                size="sm"
                name={tx.description || tx.category?.name}
                color={categoryColor(tx.category ?? null, tx.id)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ink">
                  {tx.description || tx.category?.name || "Untitled"}
                </span>
                <span className="truncate text-xs text-muted">
                  {tx.category?.name ?? "Uncategorized"} ·{" "}
                  {new Date(`${tx.date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
              <span
                className={clsx(
                  "text-sm font-semibold",
                  tx.type === "expense" ? "text-ink" : TYPE_META[tx.type].text
                )}
              >
                {formatSignedMoney(tx.amount, tx.type)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

const CategoryBreakdown = ({
  rows,
}: {
  rows: {
    key: string;
    name: string;
    income: number;
    investment: number;
    expense: number;
    color: string;
  }[];
}) => {
  const totalExpense = rows.reduce((s, r) => s + r.expense, 0);
  const spending = rows.filter((r) => r.expense > 0).sort((a, b) => b.expense - a.expense);

  return (
    <Card>
      <CardHeader title="By category" subtitle="All-time money in and out per category" />
      {spending.length > 0 && totalExpense > 0 && (
        <div className="mb-5 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
          {spending.map((r) => (
            <span
              key={r.key}
              title={`${r.name}: ${formatMoney(r.expense)}`}
              style={{ width: `${(r.expense / totalExpense) * 100}%`, backgroundColor: r.color }}
            />
          ))}
        </div>
      )}
      <div className="grid gap-x-8 sm:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-2.5 border-b border-line-soft py-2.5 text-sm"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: r.color }} />
            <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
            {r.income > 0 && <span className="text-saved">+{formatMoney(r.income)}</span>}
            {r.investment > 0 && <span className="text-invest">{formatMoney(r.investment)}</span>}
            {(r.expense > 0 || (r.income === 0 && r.investment === 0)) && (
              <span className="font-medium text-ink">−{formatMoney(r.expense)}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};
