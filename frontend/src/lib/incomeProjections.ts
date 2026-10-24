import type { IncomeFrequency } from "./types";

export type ProjectionView = "weekly" | "monthly" | "yearly";

const PERIODS_PER_YEAR: Record<IncomeFrequency, number> = {
  weekly: 52,
  biweekly: 26,
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
