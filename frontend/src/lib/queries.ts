import type { QueryClient } from "@tanstack/react-query";

// Every query that shows transactions or totals worked out from them.
const TRANSACTION_QUERY_KEYS = [
  "transactions",
  "budgets",
  "budget-status",
  "budget-categories",
  "budget-transactions",
  "budget-category-transactions",
  "summary",
  "summary-month",
];

// Call after transactions are added, changed or removed.
export const invalidateTransactionQueries = (queryClient: QueryClient) => {
  for (const key of TRANSACTION_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
};
