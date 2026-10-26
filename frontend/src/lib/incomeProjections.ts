import type { IncomeFrequency } from "./types";

export type ProjectionView = "weekly" | "monthly" | "yearly";

const PERIODS_PER_YEAR: Record<IncomeFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  yearly: 1,
};

export const computeProjections = (
  amount: number,
  frequency: IncomeFrequency
): Record<ProjectionView, number> => {
  const yearly = amount * PERIODS_PER_YEAR[frequency];
  return {
    weekly: yearly / 52,
    monthly: yearly / 12,
    yearly,
  };
};

export const sumProjections = (
  incomes: { amount: number | string; frequency: IncomeFrequency }[]
): Record<ProjectionView, number> =>
  incomes.reduce(
    (total, inc) => {
      const p = computeProjections(Number(inc.amount), inc.frequency);
      return {
        weekly: total.weekly + p.weekly,
        monthly: total.monthly + p.monthly,
        yearly: total.yearly + p.yearly,
      };
    },
    { weekly: 0, monthly: 0, yearly: 0 }
  );
