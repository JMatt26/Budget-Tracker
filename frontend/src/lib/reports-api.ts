import { api } from "./api";
import { toLocalISODate } from "./format";

export type SummaryTotals = {
  total_income?: number | string;
  total_expense?: number | string;
  total_investment?: number | string;
  net?: number | string;
};

export type SummaryCategory = {
  category_id: number | null;
  category_name: string | null;
  income?: number | string;
  expense?: number | string;
  total_income?: number | string;
  total_investment?: number | string;
  total_expense?: number | string;
};

// The summary endpoint has returned two shapes over time: totals at the top
// level (legacy) or nested under `totals`. Callers read both.
export type AnySummary = SummaryTotals & {
  start_date?: string | null;
  end_date?: string | null;
  totals?: SummaryTotals;
  by_category?: SummaryCategory[] | null;
};

export const getCurrentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
};

export const getCurrentMonthLocalRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toLocalISODate(start), end: toLocalISODate(end), days: end.getDate() };
};

export const fetchMonthSummary = async (): Promise<AnySummary> => {
  const { start, end } = getCurrentMonthRange();
  const { data } = await api.get("/reports/summary", {
    params: { start_date: start, end_date: end },
  });
  return data;
};

export type MetricField = "total_income" | "total_investment" | "total_expense" | "net";

// Reads one metric from either summary shape, deriving net when missing.
export const readMetric = (summary: AnySummary | undefined, field: MetricField): number => {
  if (!summary) return 0;
  const totals: SummaryTotals = summary.totals ?? summary;
  if (field === "net") {
    return Number(
      totals.net ??
        Number(totals.total_income ?? 0) +
          Number(totals.total_investment ?? 0) -
          Number(totals.total_expense ?? 0)
    );
  }
  return Number(totals[field] ?? 0);
};
