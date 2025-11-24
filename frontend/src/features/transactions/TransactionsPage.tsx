import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "../../lib/types";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TransactionForm } from "./TransactionForm";
import React from "react";

interface Filters {
  start_date?: string;
  end_date?: string;
  type?: "income" | "expense" | "";
  category_id?: string;
  min_amount?: string;
  max_amount?: string;
}

const fetchTransactions = async (filters: Filters) => {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params[key] = value;
  });
  const { data } = await api.get<Transaction[]>("/transactions", {
    params,
  });
  return data;
};

export const TransactionsPage = () => {
  const [filters, setFilters] = useState<Filters>({});
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchTransactions(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/transactions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  const onFilterChange =
    (field: keyof Filters) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setFilters((prev) => ({
        ...prev,
        [field]: value || undefined,
      }));
    };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Start date
            </label>
            <input
              type="date"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.start_date ?? ""}
              onChange={onFilterChange("start_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              End date
            </label>
            <input
              type="date"
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.end_date ?? ""}
              onChange={onFilterChange("end_date")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Type
            </label>
            <select
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.type ?? ""}
              onChange={onFilterChange("type")}
            >
              <option value="">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Min amount
            </label>
            <input
              type="number"
              className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.min_amount ?? ""}
              onChange={onFilterChange("min_amount")}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Max amount
            </label>
            <input
              type="number"
              className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              value={filters.max_amount ?? ""}
              onChange={onFilterChange("max_amount")}
            />
          </div>

          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setFilters({})}
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              + Add
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <p className="text-sm text-slate-400">
            Loading transactions...
          </p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-slate-400">
            No transactions found.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 text-left">Date</th>
                <th className="py-2 text-left">Description</th>
                <th className="py-2 text-right">Amount</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-left">Category</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-slate-900/60 last:border-0"
                >
                  <td className="py-2 text-xs text-slate-300">
                    {new Date(tx.date).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    {tx.description ?? "—"}
                  </td>
                  <td
                    className={`py-2 text-right ${
                      tx.type === "income"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {tx.type === "expense" ? "-" : "+"}$
                    {tx.amount.toFixed(2)}
                  </td>
                  <td className="py-2 capitalize">
                    {tx.type}
                  </td>
                  <td className="py-2">
                    {tx.category?.name ?? "Uncategorized"}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      className="mr-3 text-xs text-sky-400 hover:text-sky-300"
                      onClick={() => {
                        setEditing(tx);
                        setShowForm(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs text-rose-400 hover:text-rose-300"
                      onClick={() =>
                        deleteMutation.mutate(tx.id)
                      }
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showForm && (
        <TransactionForm
          transaction={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};
