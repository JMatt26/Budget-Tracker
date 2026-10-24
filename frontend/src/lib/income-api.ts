import { api } from "./api";
import type { Income, IncomeFrequency } from "./types";

export const fetchIncome = async (): Promise<Income | null> => {
  const { data } = await api.get<Income | null>("/income/");
  return data;
};

export const upsertIncome = async (payload: {
  amount: number;
  frequency: IncomeFrequency;
}): Promise<Income> => {
  const { data } = await api.put<Income>("/income/", payload);
  return data;
};
