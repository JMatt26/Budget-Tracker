export type TransactionType = "income" | "expense" | "investment";

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
  category_id?: number | null;
  category?: Category | null;
  budget_id?: number | null;
  budget?: Budget | null;
  created_at?: string;
}

export interface Budget {
  id: number;
  name: string;
  limit: number;
  start_date: string;
  end_date: string;
  created_at?: string;
  updated_at?: string;
  category?: Category | null;
}

export interface BudgetStatus {
  budget: Budget;
  total_expense: number;
  remaining: number;
  exceeded: boolean;
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

export interface Token {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  email: string;
  full_name?: string | null;
}
