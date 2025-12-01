import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { fetchBudget, fetchBudgetStatus } from "../../lib/budget-api";
import { api } from "../../lib/api";
import type { BudgetStatus, Category, BudgetCategory, Transaction, Budget } from "../../lib/types";

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
  const [showEditBudgetForm, setShowEditBudgetForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);

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

  const updateBudgetCategoryMutation = useMutation({
    mutationFn: async ({ id, limit }: { id: number; limit: number }) => {
      const { data } = await api.put(`/budgets/${budgetId}/categories/${id}`, { limit });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-categories", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-status", budgetId] });
      setEditingCategoryId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to update category limit");
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
                      <div className="ml-2 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategoryId(bc.id);
                          }}
                          className="text-xs text-sky-400 hover:text-sky-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              window.confirm(
                                `Remove "${bc.category.name}" from this budget?`
                              )
                            ) {
                              deleteCategoryMutation.mutate(bc.id);
                            }
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300"
                          disabled={deleteCategoryMutation.isPending}
                        >
                          Remove
                        </button>
                      </div>
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

  const chartsContent = useMemo(() => {
    // Prepare data for pie chart - expense breakdown by category
    const categorizedSpending = budgetCategories
      ?.filter((bc) => Number(bc.actual_spending) > 0) // Only show categories with spending
      .map((bc) => ({
        name: bc.category.name,
        value: Number(bc.actual_spending),
        limit: Number(bc.limit),
        percentage: status?.total_expense 
          ? ((Number(bc.actual_spending) / Number(status.total_expense)) * 100).toFixed(1)
          : "0",
      })) || [];

    // Calculate uncategorized spending (transactions linked to budget but without a category)
    const totalCategorizedSpending = categorizedSpending.reduce(
      (sum, item) => sum + item.value,
      0
    );
    const totalExpense = Number(status?.total_expense || 0);
    const uncategorizedSpending = totalExpense - totalCategorizedSpending;

    // Build chart data including uncategorized if it exists
    const chartData = [...categorizedSpending];
    if (uncategorizedSpending > 0) {
      chartData.push({
        name: "Uncategorized",
        value: uncategorizedSpending,
        limit: 0, // No limit for uncategorized
        percentage: status?.total_expense
          ? ((uncategorizedSpending / totalExpense) * 100).toFixed(1)
          : "0",
      });
    }

    // Color palette for the pie chart
    const COLORS = [
      "#ef4444", // red-500
      "#f97316", // orange-500
      "#eab308", // yellow-500
      "#22c55e", // emerald-500
      "#06b6d4", // cyan-500
      "#3b82f6", // blue-500
      "#8b5cf6", // violet-500
      "#ec4899", // pink-500
      "#f43f5e", // rose-500
      "#14b8a6", // teal-500
    ];

    const CustomTooltip = ({ active, payload }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0];
        return (
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 shadow-lg">
            <p className="text-sm font-semibold text-slate-100">{data.name}</p>
            <p className="text-xs text-slate-300 mt-1">
              Spent: {formatCurrency(data.value)}
            </p>
            {data.payload.limit > 0 && (
              <p className="text-xs text-slate-300">
                Limit: {formatCurrency(data.payload.limit)}
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              {data.payload.percentage}% of total
            </p>
          </div>
        );
      }
      return null;
    };


    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <p className="mb-4 text-xs uppercase tracking-wide text-slate-400">
            Expense breakdown by category
          </p>
          {chartData.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: "12px" }}
                    formatter={(value, entry: any) => (
                      <span className="text-slate-300">
                        {value}: {formatCurrency(entry.payload.value)}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                No spending data available yet. Add categories and transactions to see the breakdown.
              </p>
            </div>
          )}
        </Card>
        <Card>
          <p className="mb-4 text-xs uppercase tracking-wide text-slate-400">
            Category Spending vs Limits
          </p>
          {budgetCategories && budgetCategories.length > 0 ? (
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={budgetCategories.map((bc) => ({
                    name: bc.category.name.length > 15 
                      ? bc.category.name.substring(0, 15) + "..." 
                      : bc.category.name,
                    limit: Number(bc.limit),
                    spent: Number(bc.actual_spending),
                    fullName: bc.category.name, // Keep full name for tooltip
                  }))}
                  margin={{ top: 5, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1e293b",
                      border: "1px solid #475569",
                      borderRadius: "8px",
                    }}
                    formatter={(value: number, name: string, props: any) => [
                      formatCurrency(value),
                      name === "limit" ? "Limit" : "Spent",
                    ]}
                    labelFormatter={(label, payload) => 
                      payload && payload[0] ? payload[0].payload.fullName : label
                    }
                  />
                  {/* Background bar for limit (shaded, rendered first so it's behind) */}
                  <Bar
                    dataKey="limit"
                    fill="#3b82f6"
                    opacity={0.25}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                  {/* Foreground bar for spent (brighter, rendered second so it overlays on top) */}
                  <Bar
                    dataKey="spent"
                    fill="#60a5fa"
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-slate-400">
                No categories added yet. Add categories to see spending vs limits.
              </p>
            </div>
          )}
        </Card>
      </div>
    );
  }, [budgetCategories, status]);

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
            onClick={() => setShowEditBudgetForm(true)}
          >
            Edit Budget
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

      {showEditBudgetForm && budget && (
        <EditBudgetForm
          budget={budget}
          onClose={() => setShowEditBudgetForm(false)}
        />
      )}

      {editingCategoryId && budgetCategories && (
        <EditCategoryLimitForm
          budgetCategory={budgetCategories.find((bc) => bc.id === editingCategoryId)!}
          onClose={() => setEditingCategoryId(null)}
          onSave={(limit) => {
            updateBudgetCategoryMutation.mutate({ id: editingCategoryId, limit });
          }}
          isLoading={updateBudgetCategoryMutation.isPending}
        />
      )}
    </div>
  );
};

const EditBudgetForm = ({
  budget,
  onClose,
}: {
  budget: Budget;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: budget.name,
    limit: String(budget.limit),
    startDate: budget.start_date.slice(0, 10),
    endDate: budget.end_date.slice(0, 10),
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (formData.name.trim() !== budget.name) {
        payload.name = formData.name.trim();
      }
      if (Number(formData.limit) !== Number(budget.limit)) {
        payload.limit = Number(formData.limit);
      }
      if (formData.startDate !== budget.start_date.slice(0, 10)) {
        payload.start_date = formData.startDate;
      }
      if (formData.endDate !== budget.end_date.slice(0, 10)) {
        payload.end_date = formData.endDate;
      }
      const { data } = await api.put(`/budgets/${budget.id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", budget.id] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["budget-status", budget.id] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Failed to update budget");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.limit || Number(formData.limit) <= 0) {
      setError("Limit must be greater than 0");
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      setError("Start and end dates are required");
      return;
    }
    if (formData.startDate > formData.endDate) {
      setError("End date must be after start date");
      return;
    }

    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">Edit Budget</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="Budget name"
              maxLength={100}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Limit</label>
            <input
              type="number"
              step="0.01"
              value={formData.limit}
              onChange={(e) =>
                setFormData({ ...formData, limit: e.target.value })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              min="0"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Start date
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                End date
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) =>
                  setFormData({ ...formData, endDate: e.target.value })
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
            </div>
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
              {mutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const EditCategoryLimitForm = ({
  budgetCategory,
  onClose,
  onSave,
  isLoading,
}: {
  budgetCategory: BudgetCategory;
  onClose: () => void;
  onSave: (limit: number) => void;
  isLoading: boolean;
}) => {
  const [limit, setLimit] = useState(String(budgetCategory.limit));
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const limitNum = Number(limit);
    if (!limit || limitNum <= 0) {
      setError("Limit must be greater than 0");
      return;
    }

    onSave(limitNum);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">
          Edit Limit - {budgetCategory.category.name}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Category Limit
            </label>
            <input
              type="number"
              step="0.01"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              placeholder="0.00"
              min="0"
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-500">
              Current spending: {formatCurrency(budgetCategory.actual_spending)}
            </p>
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Card>
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

