import { api } from "./api";
import type { Income, IncomeFrequency } from "./types";

export type IncomePayload = {
  name: string;
  amount: number;
  frequency: IncomeFrequency;
};

export const fetchIncomes = async (): Promise<Income[]> => {
  const { data } = await api.get<Income[]>("/income/");
  return data;
};

export const createIncome = async (payload: IncomePayload): Promise<Income> => {
  const { data } = await api.post<Income>("/income/", payload);
  return data;
};

export const updateIncome = async (id: number, payload: IncomePayload): Promise<Income> => {
  const { data } = await api.put<Income>(`/income/${id}`, payload);
  return data;
};

export const deleteIncome = async (id: number): Promise<void> => {
  await api.delete(`/income/${id}`);
};
