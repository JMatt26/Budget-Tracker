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

export const fetchBudgetStatus = async (id: number): Promise<BudgetStatus> => {
  const { data } = await api.get<BudgetStatus>(`/budgets/${id}/status`);
  return data;
};

