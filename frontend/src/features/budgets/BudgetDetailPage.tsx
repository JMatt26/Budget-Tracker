import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { fetchBudget, fetchBudgetStatus } from "../../lib/budget-api";
import { api } from "../../lib/api";
import type { BudgetStatus, Category, BudgetCategory, Transaction } from "../../lib/types";

const formatCurrency = (value: number | undefined | null) =>
  `$${Number(value ?? 0).toFixed(2)}`;

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await api.get("/categories", {
    params: { limit: 100, offset: 0 },
  });
  return data.items ?? data;
};

type BudgetCategoryFormData = {
  mode: "existing" | "new";
  category_id: string;
  category_name: string;
  category_type: "income" | "expense" | "investment";
  limit: string;
};

const BudgetCategoryForm = ({
  budgetId,
  onClose,
  onSuccess,
}: {
  budgetId: number;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [formData, setFormData] = useState<BudgetCategoryFormData>({
    mode: "existing",
    category_id: "",
    category_name: "",
    category_type: "expense",
    limit: "",
  });
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const mutation = useMutation({
    mutationFn: async (data: BudgetCategoryFormData) => {
      const payload: any = {
        limit: Number(data.limit),
      };
      
      if (data.mode === "existing") {
        payload.category_id = Number(data.category_id);
      } else {
        payload.category_name = data.category_name.trim();
        payload.category_type = data.category_type;
      }
      
      const { data: response } = await api.post(`/budgets/${budgetId}/categories`, payload);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-status", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "An error occurred");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!formData.limit || Number(formData.limit) <= 0) {
      setError("Limit must be greater than 0");
      return;
    }
    
    if (formData.mode === "existing" && !formData.category_id) {
      setError("Please select a category");
      return;
    }
    
    if (formData.mode === "new" && !formData.category_name.trim()) {
      setError("Category name is required");
      return;
    }
    
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">Add Category to Budget</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Mode</label>
            <select
              value={formData.mode}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  mode: e.target.value as "existing" | "new",
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="existing">Use Existing Category</option>
              <option value="new">Create New Category</option>
            </select>
          </div>

          {formData.mode === "existing" ? (
            <div>
              <label className="mb-1 block text-xs text-slate-400">Category</label>
              <select
                value={formData.category_id}
                onChange={(e) =>
                  setFormData({ ...formData, category_id: e.target.value })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              >
                <option value="">Select a category</option>
                {categories?.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.type})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Category Name</label>
                <input
                  type="text"
                  value={formData.category_name}
                  onChange={(e) =>
                    setFormData({ ...formData, category_name: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                  placeholder="Category name"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Category Type</label>
                <select
                  value={formData.category_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      category_type: e.target.value as "income" | "expense" | "investment",
                    })
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="investment">Investment</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs text-slate-400">Max Spending Limit</label>
            <input
              type="number"
              step="0.01"
              value={formData.limit}
              onChange={(e) =>
                setFormData({ ...formData, limit: e.target.value })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="0.00"
              min="0"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding..." : "Add Category"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

type TabKey = "numeric" | "graphs" | "charts";

const tabLabels: Record<TabKey, string> = {
  numeric: "Numeric",
  graphs: "Graphs",
  charts: "Charts",
};

export const BudgetDetailPage: React.FC = () => {
  const params = useParams();
  const budgetId = Number(params.budgetId ?? "");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("numeric");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ["budget", budgetId],
    queryFn: () => fetchBudget(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  const {
    data: status,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: ["budget-status", budgetId],
    queryFn: () => fetchBudgetStatus(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  const {
    data: budgetCategories,
    isLoading: categoriesLoading,
  } = useQuery({
    queryKey: ["budget-categories", budgetId],
    queryFn: async () => {
      const { data } = await api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories`);
      return data;
    },
    enabled: !Number.isNaN(budgetId),
  });

  const queryClient = useQueryClient();

  const deleteCategoryMutation = useMutation({
    mutationFn: async (budgetCategoryId: number) => {
      await api.delete(`/budgets/${budgetId}/categories/${budgetCategoryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-status", budgetId] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to remove category");
    },
  });

  const deleteBudgetMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/budgets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget-status"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      navigate("/budgets");
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to delete budget");
    },
  });

  const loading = budgetLoading || statusLoading || categoriesLoading;

  const numericContent = useMemo(() => {
    const totalExpense = status?.total_expense ?? 0;
    const remaining = status?.remaining ?? 0;
    const limit = budget ? Number(budget.limit ?? 0) : 0;
    const progress = limit ? Math.min(100, (totalExpense / limit) * 100) : 0;
    return (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Limit
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">
              {formatCurrency(limit)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Spent
            </p>
            <p className="mt-2 text-2xl font-semibold text-rose-400">
              {formatCurrency(totalExpense)}
            </p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Remaining
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-400">
              {formatCurrency(remaining)}
            </p>
          </Card>
          <Card className="md:col-span-3">
            <p className="text-xs text-slate-400 uppercase tracking-wide">
              Progress
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </Card>
        </div>

        {/* Budget Categories */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">
              Category Limits
            </h3>
            <Button
              variant="ghost"
              onClick={() => setShowCategoryForm(true)}
              className="text-xs"
            >
              + Add Category
            </Button>
          </div>
          {budgetCategories && budgetCategories.length > 0 ? (
            <div className="space-y-3">
              {budgetCategories.map((bc) => {
                const categoryLimit = Number(bc.limit);
                const actualSpending = Number(bc.actual_spending);
                const categoryProgress = categoryLimit > 0 
                  ? Math.min(100, (actualSpending / categoryLimit) * 100) 
                  : 0;
                const exceeded = actualSpending > categoryLimit;
                
                return (
                  <div
                    key={bc.id}
                    className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 cursor-default"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCategoryId(bc.id);
                            }}
                            className="text-sm font-medium text-slate-100 hover:text-sky-400 transition cursor-pointer"
                          >
                            {bc.category.name}
                          </button>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                              bc.category.type === "income"
                                ? "bg-green-500/20 text-green-400"
                                : bc.category.type === "investment"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {bc.category.type}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="text-slate-400">Limit</p>
                            <p className="mt-1 font-semibold text-slate-200">
                              {formatCurrency(categoryLimit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400">Spent</p>
                            <p
                              className={`mt-1 font-semibold ${
                                exceeded ? "text-rose-400" : "text-slate-200"
                              }`}
                            >
                              {formatCurrency(actualSpending)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              exceeded ? "bg-rose-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${categoryProgress}%` }}
                          />
                        </div>
                        {exceeded && (
                          <p className="mt-1 text-xs text-rose-400">
                            Over budget by {formatCurrency(actualSpending - categoryLimit)}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove "${bc.category.name}" from this budget?`
                            )
                          ) {
                            deleteCategoryMutation.mutate(bc.id);
                          }
                        }}
                        className="ml-2 text-xs text-rose-400 hover:text-rose-300"
                        disabled={deleteCategoryMutation.isPending}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No categories added yet. Click "+ Add Category" to get started.
            </p>
          )}
        </Card>
      </div>
    );
  }, [budget, status, budgetCategories, deleteCategoryMutation]);

  const graphsContent = (
    <Card>
      <p className="text-sm text-slate-100">
        {budget ? budget.name : "Budget"} timeline
      </p>
      <div className="mt-4 space-y-2 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/2 rounded-full bg-emerald-500/60" />
          <span>Projected spending curve</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/3 rounded-full bg-rose-500/60" />
          <span>Actual spend line</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-1/4 rounded-full bg-blue-500/60" />
          <span>Investment savings</span>
        </div>
      </div>
    </Card>
  );

  const chartsContent = (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Expense breakdown
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Pie-chart view coming soon.
        </p>
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Trend
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Chart placeholder; integrate d3 or chart.js later.
        </p>
      </Card>
    </div>
  );

  if (Number.isNaN(budgetId)) {
    return (
      <Card>
        <p className="text-sm text-rose-400">
          Invalid budget selected.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {budget ? budget.name : "Budget details"}
          </h2>
          {budget && (
            <p className="mt-1 text-sm text-slate-400">
              {formatDate(budget.start_date)} - {formatDate(budget.end_date)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowCategoryForm(true)}>
            + Add Category
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/budgets")}
          >
            Back to budgets
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${budget?.name}"? This will remove the budget association from all transactions.`
                )
              ) {
                deleteBudgetMutation.mutate(budgetId);
              }
            }}
            className="text-rose-400 hover:text-rose-300"
            disabled={deleteBudgetMutation.isPending}
          >
            {deleteBudgetMutation.isPending ? "Deleting..." : "Delete Budget"}
          </Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-1 text-sm font-medium transition ${
                tab === activeTab
                  ? "bg-slate-200 text-slate-900"
                  : "bg-slate-800 text-slate-400 hover:bg-slate-900"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </Card>

      {loading || !budget ? (
        <Card className="h-32 animate-pulse bg-slate-900/80" />
      ) : (
        <>
          {activeTab === "numeric" && numericContent}
          {activeTab === "graphs" && graphsContent}
          {activeTab === "charts" && chartsContent}
        </>
      )}

      {showCategoryForm && (
        <BudgetCategoryForm
          budgetId={budgetId}
          onClose={() => setShowCategoryForm(false)}
          onSuccess={() => setShowCategoryForm(false)}
        />
      )}

      {selectedCategoryId && (
        <CategoryTransactionsModal
          budgetId={budgetId}
          budgetCategoryId={selectedCategoryId}
          onClose={() => setSelectedCategoryId(null)}
        />
      )}
    </div>
  );
};

const CategoryTransactionsModal = ({
  budgetId,
  budgetCategoryId,
  onClose,
}: {
  budgetId: number;
  budgetCategoryId: number;
  onClose: () => void;
}) => {
  const { data: transactions, isLoading } = useQuery({
    queryKey: ["budget-category-transactions", budgetId, budgetCategoryId],
    queryFn: async () => {
      const { data } = await api.get<{
        items: Transaction[];
        total: number;
        limit: number;
        offset: number;
      }>(`/budgets/${budgetId}/categories/${budgetCategoryId}/transactions`);
      return data;
    },
  });

  const selectedCategory = useQuery({
    queryKey: ["budget-categories", budgetId],
    queryFn: async () => {
      const { data } = await api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories`);
      return data;
    },
    select: (data) => data?.find((bc) => bc.id === budgetCategoryId),
  });

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Transactions - {selectedCategory.data?.category.name || "Category"}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {selectedCategory.data && (
                <>
                  Limit: {formatCurrency(selectedCategory.data.limit)} | 
                  Spent: {formatCurrency(selectedCategory.data.actual_spending)}
                </>
              )}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-slate-400">Loading transactions...</div>
          ) : transactions && transactions.items.length > 0 ? (
            <div className="space-y-2">
              {transactions.items.map((tx) => (
                <div
                  key={tx.id}
                  className="rounded-lg border border-slate-800 bg-slate-900/50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-100">
                          {tx.description || "No description"}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                            tx.type === "income"
                              ? "bg-green-500/20 text-green-400"
                              : tx.type === "investment"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-red-500/20 text-red-400"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(tx.date).toLocaleDateString()}
                      </p>
                    </div>
                    <p
                      className={`text-sm font-semibold ${
                        tx.type === "income"
                          ? "text-emerald-400"
                          : tx.type === "investment"
                          ? "text-blue-400"
                          : "text-rose-400"
                      }`}
                    >
                      {tx.type === "income" ? "+" : "-"}
                      {formatCurrency(tx.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              No transactions found for this category in this budget.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

