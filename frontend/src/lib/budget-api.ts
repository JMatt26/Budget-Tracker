import { api } from "./api";
import type { Budget, BudgetStatus } from "./types";

export type BudgetListResponse = {
  items: Budget[];
  total: number;
  limit: number;
  offset: number;
};

export const fetchBudgets = async (): Promise<BudgetListResponse> => {
  const { data } = await api.get<BudgetListResponse>("/budgets", {
    params: { limit: 50, offset: 0 },
  });
  return data;
};

export const fetchBudget = async (id: number): Promise<Budget> => {
  const { data } = await api.get<Budget>(`/budgets/${id}`);
  return data;
};

export const fetchBudgetStatus = async (
  id: number,
  period?: { start_date: string; end_date: string }
): Promise<BudgetStatus> => {
  const { data } = await api.get<BudgetStatus>(`/budgets/${id}/status`, {
    params: period,
  });
  return data;
};


export type ExpenseBreakdownItem = {
  category_id: number | null;
  category_name: string;
  total: number | string;
  limit: number | string | null;
};

export type ExpenseBreakdown = {
  period_start: string;
  period_end: string;
  total_expense: number | string;
  items: ExpenseBreakdownItem[];
};

export const fetchExpenseBreakdown = async (
  id: number,
  period?: { start_date: string; end_date: string }
): Promise<ExpenseBreakdown> => {
  const { data } = await api.get<ExpenseBreakdown>(`/budgets/${id}/expense-breakdown`, {
    params: period,
  });
  return data;
};

// Goals for the whole budget period; null means no goal set.
export type BudgetTargets = {
  budget_id: number;
  spending: number | string | null;
  invested: number | string | null;
  saved: number | string | null;
};

export type BudgetTargetsUpdate = {
  spending?: number | null;
  invested?: number | null;
  saved?: number | null;
};

export const fetchBudgetTargets = async (id: number): Promise<BudgetTargets> => {
  const { data } = await api.get<BudgetTargets>(`/budgets/${id}/targets`);
  return data;
};

export const updateBudgetTargets = async (
  id: number,
  targets: BudgetTargetsUpdate
): Promise<BudgetTargets> => {
  const { data } = await api.put<BudgetTargets>(`/budgets/${id}/targets`, targets);
  return data;
};
