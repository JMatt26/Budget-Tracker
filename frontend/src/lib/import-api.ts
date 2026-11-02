import { api } from "./api";
import type {
  ColumnMapping,
  PaymentMethod,
  StatementKind,
  StatementPreview,
  Transaction,
  TransactionType,
} from "./types";

export const previewStatement = async (
  file: File,
  opts: { kind: StatementKind; paymentMethod: PaymentMethod | ""; mapping?: ColumnMapping }
): Promise<StatementPreview> => {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", opts.kind);
  if (opts.paymentMethod) form.append("payment_method", opts.paymentMethod);
  if (opts.mapping) form.append("mapping", JSON.stringify(opts.mapping));
  const { data } = await api.post<StatementPreview>("/imports/statement/preview", form);
  return data;
};

export type NewTransaction = {
  date: string;
  amount: number;
  description: string | null;
  type: TransactionType;
  payment_method: PaymentMethod | null;
  category_ids: number[];
  budget_id: number | null;
};

// All or nothing; a 400's detail starts with "Row N:" (1-based, in the order sent).
export const createTransactionsBulk = async (items: NewTransaction[]): Promise<Transaction[]> => {
  const { data } = await api.post<Transaction[]>("/transactions/bulk", { items });
  return data;
};
