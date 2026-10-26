import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { Transaction } from "../../lib/types";
import { api } from "../../lib/api";
import { Card, Skeleton } from "../../components/ui/Card";
import { Button, IconButton } from "../../components/ui/Button";
import { ChipGroup } from "../../components/ui/Segmented";
import { Icon } from "../../components/ui/Icon";
import { CategoryAvatar, TypeBadge } from "../../components/ui/Progress";
import { useQuickAdd } from "../../components/layout/QuickAdd";
import { categoryColor, dayLabel, formatMoney, formatSignedMoney, TYPE_META } from "../../lib/format";
import React from "react";
import { useNavigate } from "react-router-dom";

type Filters = {
    start_date?: string;
    end_date?: string;
    type?: "income" | "expense" | "investment" | "";
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
    if (!value) return;
    params[key] = value;
  });

  const { data } = await api.get<TransactionListResponse>(
    "/transactions",
    { params }
  );
  return data;
};

const TYPE_FILTERS: { value: "" | "income" | "expense" | "investment"; label: string }[] = [
  { value: "", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investments" },
];

  export const TransactionsPage: React.FC = () => {
    const [filters, setFilters] = useState<Filters>({});
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const navigate = useNavigate();
    const { openTransaction } = useQuickAdd();

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
      mutationFn: async (tx: Transaction) => {
        await api.delete(`/transactions/${tx.id}`);
        return tx; // Return the transaction so we can use its budget_id
      },
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: ["transactions"],
        });
        // Invalidate all budget statuses and categories to ensure all budgets update
        queryClient.invalidateQueries({
          queryKey: ["budget-status"],
        });
        queryClient.invalidateQueries({
          queryKey: ["budget-categories"],
        });
        queryClient.invalidateQueries({
          queryKey: ["budget-transactions"],
        });
        // Also invalidate the budgets list to refresh the cards
        queryClient.invalidateQueries({
          queryKey: ["budgets"],
        });
        queryClient.invalidateQueries({ queryKey: ["summary"] });
        queryClient.invalidateQueries({ queryKey: ["summary-month"] });
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
      openTransaction(null);
    };

    const handleEditClick = (tx: Transaction) => {
      openTransaction(tx);
    };

    const items = data?.items ?? [];
    const deletingId = deleteMutation.isPending ? deleteMutation.variables?.id : null;
    const activeExtraFilters = [
      filters.start_date,
      filters.end_date,
      filters.min_amount,
      filters.max_amount,
    ].filter(Boolean).length;
    const hasAnyFilter = activeExtraFilters > 0 || !!filters.type;

    // Group by calendar day (list is already newest first).
    const groups: { key: string; label: string; net: number; items: Transaction[] }[] = [];
    items.forEach((tx) => {
      const key = tx.date.slice(0, 10);
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = { key, label: dayLabel(tx.date), net: 0, items: [] };
        groups.push(group);
      }
      group.items.push(tx);
      const amt = Number(tx.amount);
      group.net += tx.type === "income" ? amt : -amt;
    });

    return (
      <div className="flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <ChipGroup
            label="Type"
            options={TYPE_FILTERS}
            value={filters.type ?? ""}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, type: value || undefined }))
            }
          />
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[38px] rounded-full"
            aria-expanded={showMoreFilters}
            onClick={() => setShowMoreFilters((v) => !v)}
          >
            <Icon name="filter" size={15} />
            More filters
            {activeExtraFilters > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] text-white">
                {activeExtraFilters}
              </span>
            )}
          </Button>
          {hasAnyFilter && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              Clear
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!isLoading && (
              <span className="text-[13px] text-muted">
                Showing {items.length} {items.length === 1 ? "transaction" : "transactions"}
                {typeof data?.total === "number" && ` · ${data.total} total`}
              </span>
            )}
            <Button variant="dark" onClick={handleAddClick} className="hidden sm:inline-flex">
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Add
            </Button>
          </div>
        </div>

        {showMoreFilters && (
          <Card className="animate-rise p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
                Start date
                <input
                  type="date"
                  className="field"
                  value={filters.start_date ?? ""}
                  onChange={handleFilterChange("start_date")}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
                End date
                <input
                  type="date"
                  className="field"
                  value={filters.end_date ?? ""}
                  onChange={handleFilterChange("end_date")}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
                Min amount
                <input
                  type="number"
                  className="field"
                  placeholder="0.00"
                  value={filters.min_amount ?? ""}
                  onChange={handleFilterChange("min_amount")}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
                Max amount
                <input
                  type="number"
                  className="field"
                  placeholder="Any"
                  value={filters.max_amount ?? ""}
                  onChange={handleFilterChange("max_amount")}
                />
              </label>
            </div>
          </Card>
        )}

        {/* Error state */}
        {isError && (
          <Card>
            <p className="text-sm text-spend">
              Failed to load transactions.
            </p>
            {error instanceof Error && (
              <p className="mt-1 text-xs text-muted">
                {error.message}
              </p>
            )}
          </Card>
        )}

        {/* List */}
        {isLoading ? (
          <Skeleton className="h-80" />
        ) : items.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted">No transactions found.</p>
            <Button onClick={handleAddClick}>
              <Icon name="plus" size={16} />
              Add a transaction
            </Button>
          </Card>
        ) : (
          <Card className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="flex justify-between px-3 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">
                  <span>{group.label}</span>
                  <span>
                    {group.net >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(group.net))}
                  </span>
                </div>
                {group.items.map((tx) => (
                  <div
                    key={tx.id}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:gap-y-0 max-sm:[&>:first-child]:row-span-2 sm:gap-4"
                  >
                    <CategoryAvatar
                      name={tx.description || tx.category?.name}
                      color={categoryColor(tx.category ?? null, tx.id)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col max-sm:row-span-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {tx.description ?? "—"}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        <span>{tx.category?.name ?? "Uncategorized"}</span>
                        <span aria-hidden="true">·</span>
                        {tx.payment_method && (
                          <>
                            <span>{tx.payment_method}</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        {tx.budget ? (
                          <button
                            className="font-medium text-accent hover:text-accent-hover max-sm:text-left"
                            type="button"
                            onClick={() =>
                              navigate(`/budgets/${tx.budget?.id}`)
                            }
                          >
                            {tx.budget.name}
                          </button>
                        ) : (
                          <span>Unscheduled</span>
                        )}
                      </span>
                    </div>
                    <span className="hidden sm:inline-flex">
                      <TypeBadge type={tx.type} />
                    </span>
                    <span
                      className={clsx(
                        "min-w-[88px] text-right text-[15px] font-semibold max-sm:self-end",
                        tx.type === "expense" ? "text-ink" : TYPE_META[tx.type].text
                      )}
                    >
                      {formatSignedMoney(tx.amount, tx.type)}
                    </span>
                    <div className="flex gap-0.5 opacity-100 transition max-sm:-mr-2 max-sm:justify-end sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <IconButton label="Edit transaction" onClick={() => handleEditClick(tx)}>
                        <Icon name="edit" size={16} />
                      </IconButton>
                      <IconButton
                        label={deletingId === tx.id ? "Deleting..." : "Delete transaction"}
                        className="hover:bg-spend-soft hover:text-spend"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(tx)}
                      >
                        <Icon name="trash" size={16} />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </Card>
        )}
      </div>
    );
  };
