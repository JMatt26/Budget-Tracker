import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Transaction } from "../../lib/types";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { TransactionForm } from "./TransactionForm";
import React from "react";

type Filters = {
    start_date?: string;
    end_date?: string;
    type?: "income" | "expense" | "";
    category_id?: string;
    min_amount?: string;
    max_amount?: string;
  };
  
  type TransactionListResponse = {
    items: Transaction[];
    total: number;
    limit: number;
    offset: number;
  };
  
  const fetchTransactions = async (
    filters: Filters
  ): Promise<TransactionListResponse> => {
    const params: Record<string, string> = {};
  
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params[key] = value;
      }
    });
  
    const { data } = await api.get<TransactionListResponse>(
      "/transactions",
      { params }
    );
    return data;
  };
  
  const formatCurrency = (amount: number) =>
    `$${Number(amount ?? 0).toFixed(2)}`;
  
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };
  
  export const TransactionsPage: React.FC = () => {
    const [filters, setFilters] = useState<Filters>({});
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState<Transaction | null>(null);
  
    const queryClient = useQueryClient();
  
    const {
      data,
      isLoading,
      isError,
      error,
    } = useQuery({
      queryKey: ["transactions", filters],
      queryFn: () => fetchTransactions(filters),
    });
  
    const deleteMutation = useMutation({
      mutationFn: async (id: number) => {
        await api.delete(`/transactions/${id}`);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["transactions"],
        });
      },
    });
  
    const handleFilterChange =
      (field: keyof Filters) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLSelectElement
        >
      ) => {
        const value = e.target.value;
        setFilters((prev) => ({
          ...prev,
          [field]: value || undefined,
        }));
      };
  
    const handleClearFilters = () => {
      setFilters({});
    };
  
    const handleAddClick = () => {
      setEditing(null);
      setShowForm(true);
    };
  
    const handleEditClick = (tx: Transaction) => {
      setEditing(tx);
      setShowForm(true);
    };
  
    const handleCloseForm = () => {
      setShowForm(false);
      setEditing(null);
    };
  
    const items = data?.items ?? [];
    const isDeleting = deleteMutation.isPending;
  
    return (
      <div className="space-y-4">
        {/* Filters */}
        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-100">
              Filters
            </h2>
            <p className="text-xs text-slate-500">
              Refine the list by date range, type, or amount.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Start date
              </label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                value={filters.start_date ?? ""}
                onChange={handleFilterChange("start_date")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                End date
              </label>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                value={filters.end_date ?? ""}
                onChange={handleFilterChange("end_date")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Type
              </label>
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                value={filters.type ?? ""}
                onChange={handleFilterChange("type")}
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
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                value={filters.min_amount ?? ""}
                onChange={handleFilterChange("min_amount")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Max amount
              </label>
              <input
                type="number"
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                value={filters.max_amount ?? ""}
                onChange={handleFilterChange("max_amount")}
              />
            </div>
            <div className="ml-auto">
              <Button
                variant="ghost"
                onClick={handleClearFilters}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
  
        {/* Error state */}
        {isError && (
          <Card>
            <p className="text-sm text-rose-400">
              Failed to load transactions.
            </p>
            {error instanceof Error && (
              <p className="mt-1 text-xs text-slate-500">
                {error.message}
              </p>
            )}
          </Card>
        )}
  
        {/* List */}
        <Card>
          {isLoading ? (
            <p className="text-sm text-slate-400">
              Loading transactions...
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-400">
              No transactions found.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing {items.length}{" "}
                  {items.length === 1
                    ? "transaction"
                    : "transactions"}
                </span>
                {typeof data?.total === "number" && (
                  <span>
                    Total in database: {data.total}
                  </span>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2 text-left">Date</th>
                    <th className="py-2 text-left">
                      Description
                    </th>
                    <th className="py-2 pr-4 text-right">
                      Amount
                    </th>
                    <th className="py-2 pl-4 text-left">Type</th>
                    <th className="py-2 text-left">
                      Category
                    </th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-slate-900/60 last:border-0"
                    >
                      <td className="py-2 text-xs text-slate-300">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2">
                        {tx.description ?? "—"}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right ${
                          tx.type === "income"
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {tx.type === "expense" ? "-" : "+"}
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="py-2 pl-4 capitalize">
                        {tx.type}
                      </td>
                      <td className="py-2">
                        {tx.category?.name ?? "Uncategorized"}
                      </td>
                      <td className="py-2 text-right text-xs">
                        <button
                          className="mr-3 text-sky-400 hover:text-sky-300"
                          onClick={() =>
                            handleEditClick(tx)
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="text-rose-400 hover:text-rose-300"
                          disabled={isDeleting}
                          onClick={() =>
                            deleteMutation.mutate(tx.id)
                          }
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
  
        {/* Modal: create/edit transaction */}
        {showForm && (
          <TransactionForm
            transaction={editing}
            onClose={handleCloseForm}
          />
        )}

        <div className="sticky bottom-4 flex justify-end">
          <Button
            className="shadow-lg shadow-sky-500/20"
            onClick={handleAddClick}
          >
            + Add
          </Button>
        </div>
      </div>
    );
  };
  