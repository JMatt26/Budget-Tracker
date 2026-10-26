import type { Transaction } from "../../lib/types";

export type TargetMetric = "spent" | "invested" | "saved";

export const TARGET_METRICS: {
  key: TargetMetric;
  label: string;
  color: string;
  // Spending is a ceiling to stay under; investing and saving are goals to reach.
  kind: "ceiling" | "goal";
}[] = [
  { key: "spent", label: "Spent", color: "#C2410C", kind: "ceiling" },
  { key: "invested", label: "Invested", color: "#6741D9", kind: "goal" },
  { key: "saved", label: "Saved", color: "#0E7A6B", kind: "goal" },
];

export const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const round = (n: number) => Math.round(n * 100) / 100;

export type DailySeries = {
  days: string[]; // YYYY-MM-DD, every day of the period
  // Index of the last day on or before today; -1 if the period hasn't started.
  todayIndex: number;
  // Running totals; entries after todayIndex are projections.
  values: Record<TargetMetric, number[]>;
};

// Running totals of spent/invested/saved for each day of a period. Days after
// today are projected: spending and investing continue at their average daily
// rate so far, and income ramps up to what's expected for the period (or what
// has already been earned, if more).
export const buildDailySeries = (
  transactions: Transaction[],
  startStr: string,
  endStr: string,
  expectedIncome: number,
  todayStr: string = toLocalDateString(new Date())
): DailySeries => {
  const days: string[] = [];
  for (let d = new Date(`${startStr}T00:00:00`); toLocalDateString(d) <= endStr; d.setDate(d.getDate() + 1)) {
    days.push(toLocalDateString(d));
  }

  const byDay: Record<string, { spent: number; invested: number; earned: number }> = {};
  for (const tx of transactions) {
    const day = tx.date.slice(0, 10);
    if (day < startStr || day > endStr) continue;
    const entry = (byDay[day] ??= { spent: 0, invested: 0, earned: 0 });
    const amount = Number(tx.amount);
    if (tx.type === "expense") entry.spent += amount;
    if (tx.type === "investment") entry.invested += amount;
    if (tx.type === "income") entry.earned += amount;
  }

  let todayIndex = -1;
  days.forEach((day, i) => {
    if (day <= todayStr) todayIndex = i;
  });

  const spent: number[] = [];
  const invested: number[] = [];
  const earned: number[] = [];
  let s = 0;
  let inv = 0;
  let e = 0;
  for (let i = 0; i <= todayIndex; i++) {
    const entry = byDay[days[i]];
    s += entry?.spent ?? 0;
    inv += entry?.invested ?? 0;
    e += entry?.earned ?? 0;
    spent.push(s);
    invested.push(inv);
    earned.push(e);
  }

  const elapsed = todayIndex + 1;
  const remainingDays = days.length - elapsed;
  const spentRate = elapsed > 0 ? s / elapsed : 0;
  const investedRate = elapsed > 0 ? inv / elapsed : 0;
  const earnedTarget = Math.max(e, expectedIncome);
  for (let i = elapsed; i < days.length; i++) {
    const ahead = i - todayIndex;
    spent.push(s + spentRate * ahead);
    invested.push(inv + investedRate * ahead);
    earned.push(e + ((earnedTarget - e) * ahead) / remainingDays);
  }

  return {
    days,
    todayIndex,
    values: {
      spent: spent.map(round),
      invested: invested.map(round),
      saved: earned.map((v, i) => round(v - spent[i] - invested[i])),
    },
  };
};

export const shortDayLabel = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// Splits a running total into an actual part (through today) and a projected
// part (from today on, so the two lines meet).
export const splitActualProjected = (series: DailySeries, metric: TargetMetric, i: number) => {
  const value = series.values[metric][i];
  return {
    actual: i <= series.todayIndex ? value : null,
    projected: i >= series.todayIndex && series.todayIndex < series.days.length - 1 ? value : null,
  };
};
