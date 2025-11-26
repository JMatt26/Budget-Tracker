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
  created_at?: string;
}

export interface Budget {
  id: number;
  name: string;
  category_id?: number | null;
  category?: Category | null;
  amount: number;
  period: "monthly" | "weekly" | "yearly" | "custom";
  start_date?: string | null;
  end_date?: string | null;
}

export interface BudgetStatus {
  budget_id: number;
  spent: number;
  remaining: number;
  progress: number; // 0–1
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
