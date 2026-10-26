export type TransactionType = "income" | "expense" | "investment";

export type PaymentMethod = "Amex" | "Visa" | "Debit" | "Cash";

export const PAYMENT_METHODS: PaymentMethod[] = ["Amex", "Visa", "Debit", "Cash"];

export interface Category {
  id: number;
  name: string;
  type: TransactionType; // or maybe "both" if you support it
  color?: string | null;
  icon?: string | null;
}

export interface Transaction {
  id: number;
  amount: number;
  date: string; // ISO
  description?: string | null;
  type: TransactionType;
  payment_method?: PaymentMethod | null;
  category_id?: number | null;
  category?: Category | null;
  budget_id?: number | null;
  budget?: Budget | null;
  created_at?: string;
}

export type BudgetRecurrence = "weekly" | "monthly";

export interface Budget {
  id: number;
  name: string;
  limit: number;
  start_date: string;
  end_date: string;
  // A recurring budget starts a fresh cycle when this one ends.
  recurrence?: BudgetRecurrence | null;
  series_id?: number | null;
  created_at?: string;
  updated_at?: string;
  category?: Category | null;
}

export interface BudgetStatus {
  budget: Budget;
  period_start: string;
  period_end: string;
  period_limit: number;
  total_expense: number;
  total_investment: number;
  total_income: number;
  remaining: number;
  exceeded: boolean;
}

export interface BudgetCategory {
  id: number;
  budget_id: number;
  category_id: number;
  limit: number;
  category: Category;
  actual_spending: number;
  created_at: string;
  updated_at: string;
}

export interface SummaryResponse {
  total_income: number;
  total_expense: number;
  net: number;
  // optional, depending on your schemas.SummaryResponse
  by_category?: {
    category_id: number | null;
    category_name: string | null;
    income: number;
    expense: number;
  }[];
}

export type IncomeFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "yearly";

export interface Income {
  id: number;
  name: string;
  amount: number;
  frequency: IncomeFrequency;
  created_at?: string;
  updated_at?: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  full_name?: string | null;
}
