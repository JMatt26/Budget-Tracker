import type { MetricField } from "../../lib/reports-api";

export type MetricKey = "saved" | "investments" | "expenses" | "net";

export const METRIC_CONFIG: Record<
  MetricKey,
  { label: string; color: string; dot: string; field: MetricField; note: string }
> = {
  saved: {
    label: "Saved",
    color: "text-saved",
    dot: "bg-saved",
    field: "total_income",
    note: "Money logged as income",
  },
  investments: {
    label: "Investments",
    color: "text-invest",
    dot: "bg-invest",
    field: "total_investment",
    note: "Moved into investments",
  },
  expenses: {
    label: "Expenses",
    color: "text-spend",
    dot: "bg-spend",
    field: "total_expense",
    note: "Everything you spent",
  },
  net: {
    label: "Net",
    color: "text-saved",
    dot: "bg-accent",
    field: "net",
    note: "Saved + investments − expenses",
  },
};

export const METRIC_ORDER: MetricKey[] = ["saved", "investments", "expenses", "net"];
