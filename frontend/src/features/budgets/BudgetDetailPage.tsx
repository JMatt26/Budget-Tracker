import React, { useMemo, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Card, Skeleton } from "../../components/ui/Card";
import { Button, IconButton } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, FormActions, FormError } from "../../components/ui/Field";
import { Segmented, Tabs } from "../../components/ui/Segmented";
import { Icon } from "../../components/ui/Icon";
import {
  CategoryAvatar,
  ProgressBar,
  BreakdownRing,
  TONE_TEXT,
  TypeBadge,
  budgetTone,
} from "../../components/ui/Progress";
import {
  fetchBudget,
  fetchBudgetStatus,
  fetchBudgetTargets,
  fetchExpenseBreakdown,
  updateBudgetTargets,
  type BudgetTargets,
} from "../../lib/budget-api";
import {
  CategoryLimitsCard,
  ExpenseBreakdownCard,
  MetricTargetCard,
  MetricTiles,
  SpendingTimelineCard,
  toBreakdownRows,
  type LimitRow,
  type MetricPoint,
  type MetricTile,
  type TimelinePoint,
} from "./BudgetCharts";
import {
  TARGET_METRICS,
  buildDailySeries,
  shortDayLabel,
  splitActualProjected,
  type TargetMetric,
} from "./projection";
import { api } from "../../lib/api";
import { categoryColor, formatMoney, formatSignedMoney, TYPE_META } from "../../lib/format";
import { PAYMENT_METHODS } from "../../lib/types";
import type { Category, BudgetCategory, Transaction, Budget, PaymentMethod } from "../../lib/types";

const formatCurrency = formatMoney;

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "";
  // Date-only strings parse as UTC midnight, which shows the previous day
  // west of UTC; read them as local dates instead.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type WeekSegment = {
  start: string;
  end: string;
};

// Splits a budget's date range into 7-day chunks. The final chunk is
// shorter than 7 days whenever the range isn't an exact multiple of a week.
const computeWeekSegments = (startStr: string, endStr: string): WeekSegment[] => {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  const segments: WeekSegment[] = [];

  let cursor = new Date(start);
  while (cursor <= end) {
    const segmentEnd = new Date(cursor);
    segmentEnd.setDate(segmentEnd.getDate() + 6);
    if (segmentEnd > end) {
      segmentEnd.setTime(end.getTime());
    }
    segments.push({
      start: formatLocalDate(cursor),
      end: formatLocalDate(segmentEnd),
    });
    cursor = new Date(segmentEnd);
    cursor.setDate(cursor.getDate() + 1);
  }

  return segments;
};

// Finds the week that contains today, falling back to the nearest edge
// (first week if the budget hasn't started yet, last week if it's over).
const findCurrentWeekIndex = (segments: WeekSegment[]): number => {
  if (segments.length === 0) return 0;
  const todayStr = formatLocalDate(new Date());
  const index = segments.findIndex(
    (seg) => todayStr >= seg.start && todayStr <= seg.end
  );
  if (index !== -1) return index;
  return todayStr < segments[0].start ? 0 : segments.length - 1;
};

const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await api.get("/categories", {
    params: { limit: 100, offset: 0 },
  });
  return data.items ?? data;
};

const TYPE_OPTIONS: { value: "income" | "expense" | "investment"; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
];

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
    <Modal title="Add category to budget" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Segmented
          label="Mode"
          fullWidth
          options={[
            { value: "existing", label: "Use existing" },
            { value: "new", label: "Create new" },
          ]}
          value={formData.mode}
          onChange={(mode) => setFormData({ ...formData, mode })}
        />

        {formData.mode === "existing" ? (
          <Field label="Category">
            <select
              value={formData.category_id}
              onChange={(e) =>
                setFormData({ ...formData, category_id: e.target.value })
              }
              className="field"
            >
              <option value="">Select a category</option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.type})
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <>
            <Field label="Category name">
              <input
                type="text"
                value={formData.category_name}
                onChange={(e) =>
                  setFormData({ ...formData, category_name: e.target.value })
                }
                className="field"
                placeholder="Category name"
                maxLength={100}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-muted">Category type</span>
              <Segmented
                label="Category type"
                fullWidth
                options={TYPE_OPTIONS}
                value={formData.category_type}
                onChange={(category_type) => setFormData({ ...formData, category_type })}
              />
            </div>
          </>
        )}

        <Field label="Max spending limit">
          <input
            type="number"
            step="0.01"
            value={formData.limit}
            onChange={(e) =>
              setFormData({ ...formData, limit: e.target.value })
            }
            className="field"
            placeholder="0.00"
            min="0"
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add category"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
};

type BudgetTransactionFormData = {
  date: string;
  amount: string;
  type: "income" | "expense" | "investment";
  category_id: string;
  description: string;
  payment_method: PaymentMethod | "";
};

const BudgetTransactionForm = ({
  budgetId,
  onClose,
}: {
  budgetId: number;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<BudgetTransactionFormData>({
    date: formatLocalDate(new Date()),
    amount: "",
    type: "expense",
    category_id: "",
    description: "",
    payment_method: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const mutation = useMutation({
    mutationFn: async (data: BudgetTransactionFormData) => {
      const payload: any = {
        date: data.date,
        amount: Number(data.amount),
        type: data.type,
        payment_method: data.type === "expense" ? data.payment_method : null,
        description: data.description.trim() || null,
        category_id: data.category_id ? Number(data.category_id) : null,
        budget_id: budgetId,
      };
      const { data: response } = await api.post("/transactions", payload);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-transactions", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-status", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-categories", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["summary-month"] });
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Failed to add transaction");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.date) {
      setError("Date is required");
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    if (formData.type === "expense" && !formData.payment_method) {
      setError("Choose a payment method");
      return;
    }

    mutation.mutate(formData);
  };

  return (
    <Modal variant="sheet" title="Add transaction to budget" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex min-h-full flex-col gap-5">
        <Segmented
          label="Type"
          fullWidth
          options={TYPE_OPTIONS}
          value={formData.type}
          onChange={(type) => setFormData({ ...formData, type })}
        />

        {formData.type === "expense" && (
          <Field label="Payment method">
            <select
              value={formData.payment_method}
              onChange={(e) =>
                setFormData({ ...formData, payment_method: e.target.value as PaymentMethod | "" })
              }
              className="field"
            >
              <option value="">Select…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              value={formData.date}
              onChange={(e) =>
                setFormData({ ...formData, date: e.target.value })
              }
              className="field"
            />
          </Field>
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={formData.amount}
              onChange={(e) =>
                setFormData({ ...formData, amount: e.target.value })
              }
              className="field"
              placeholder="0.00"
              autoFocus
            />
          </Field>
        </div>

        <Field label="Category">
          <select
            value={formData.category_id}
            onChange={(e) =>
              setFormData({ ...formData, category_id: e.target.value })
            }
            className="field"
          >
            <option value="">None</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description">
          <input
            type="text"
            maxLength={255}
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            className="field"
            placeholder="Optional"
          />
        </Field>

        {error && <FormError>{error}</FormError>}

        <div className="mt-auto flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-[2]" disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

type TabKey = "numeric" | "targets" | "graphs" | "charts";

const tabLabels: Record<TabKey, string> = {
  numeric: "Overview",
  targets: "Targets",
  graphs: "Graphs",
  charts: "Charts",
};

// The targets endpoint returns decimals as strings; null means no target.
const targetValue = (targets: BudgetTargets | undefined, metric: TargetMetric): number | null => {
  const key = metric === "spent" ? "spending" : metric;
  const raw = targets?.[key];
  return raw == null ? null : Number(raw);
};

export const BudgetDetailPage: React.FC = () => {
  const params = useParams();
  const budgetId = Number(params.budgetId ?? "");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("numeric");
  const [numericSubTab, setNumericSubTab] = useState<"categories" | "transactions">("categories");
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showEditBudgetForm, setShowEditBudgetForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "amount" | "category">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [periodView, setPeriodView] = useState<"monthly" | "weekly">("monthly");
  const [weekIndex, setWeekIndex] = useState<number | null>(null);
  const [graphMetric, setGraphMetric] = useState<TargetMetric>("spent");
  const [showTargetsForm, setShowTargetsForm] = useState(false);

  const { data: budget, isLoading: budgetLoading } = useQuery({
    queryKey: ["budget", budgetId],
    queryFn: () => fetchBudget(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  const weekSegments = useMemo(() => {
    if (!budget) return [];
    return computeWeekSegments(
      budget.start_date.slice(0, 10),
      budget.end_date.slice(0, 10)
    );
  }, [budget]);

  // Default to whichever week contains today the first time weekly data
  // becomes available (e.g. "it is the third week of the month").
  useEffect(() => {
    if (weekSegments.length > 0 && weekIndex === null) {
      setWeekIndex(findCurrentWeekIndex(weekSegments));
    }
  }, [weekSegments, weekIndex]);

  const selectedWeek =
    periodView === "weekly" && weekIndex !== null
      ? weekSegments[weekIndex] ?? null
      : null;

  const {
    data: status,
    isLoading: statusLoading,
  } = useQuery({
    queryKey: [
      "budget-status",
      budgetId,
      selectedWeek?.start ?? null,
      selectedWeek?.end ?? null,
    ],
    queryFn: () =>
      fetchBudgetStatus(
        budgetId,
        selectedWeek
          ? { start_date: selectedWeek.start, end_date: selectedWeek.end }
          : undefined
      ),
    enabled:
      !Number.isNaN(budgetId) && (periodView === "monthly" || !!selectedWeek),
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

  const {
    data: budgetTransactions,
    isLoading: transactionsLoading,
  } = useQuery({
    queryKey: ["budget-transactions", budgetId],
    queryFn: async () => {
      if (!budget) return { items: [], total: 0 };
      const { data } = await api.get<{
        items: Transaction[];
        total: number;
        limit: number;
        offset: number;
      }>("/transactions", {
        params: {
          budget_id: budgetId,
          limit: 1000, // Get all transactions for the budget
        },
      });
      return data;
    },
    enabled: !Number.isNaN(budgetId) && !!budget,
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

  const sortedTransactions = useMemo(
    () =>
      [...(budgetTransactions?.items || [])].sort((a, b) => {
        let comparison = 0;
        if (sortBy === "date") {
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
        } else if (sortBy === "amount") {
          comparison = Number(a.amount) - Number(b.amount);
        } else if (sortBy === "category") {
          const aCategory = a.category?.name || "Uncategorized";
          const bCategory = b.category?.name || "Uncategorized";
          comparison = aCategory.localeCompare(bCategory);
        }
        return sortOrder === "asc" ? comparison : -comparison;
      }),
    [budgetTransactions, sortBy, sortOrder]
  );

  const periodControls = (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        label="Budget period"
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "weekly", label: "Weekly" },
        ]}
        value={periodView}
        onChange={setPeriodView}
      />
      {periodView === "weekly" && selectedWeek && weekIndex !== null && (
        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
          <IconButton
            label="Previous week"
            onClick={() => setWeekIndex(Math.max(0, weekIndex - 1))}
            disabled={weekIndex === 0}
          >
            <Icon name="chevronLeft" size={16} />
          </IconButton>
          <span className="min-w-[200px] text-center text-[13px] font-medium text-ink">
            Week {weekIndex + 1} of {weekSegments.length} ·{" "}
            <span className="font-normal text-muted">
              {formatDate(selectedWeek.start)} – {formatDate(selectedWeek.end)}
            </span>
          </span>
          <IconButton
            label="Next week"
            onClick={() =>
              setWeekIndex(
                Math.min(weekSegments.length - 1, weekIndex + 1)
              )
            }
            disabled={weekIndex === weekSegments.length - 1}
          >
            <Icon name="chevronRight" size={16} />
          </IconButton>
        </div>
      )}
    </div>
  );

  const renderNumeric = () => {
    const totalExpense = Number(status?.total_expense ?? 0);
    const totalInvested = Number(status?.total_investment ?? 0);
    const totalEarned = Number(status?.total_income ?? 0);
    const totalSaved = totalEarned - totalExpense - totalInvested;
    const remaining = Number(status?.remaining ?? 0);
    const limit = status
      ? Number(status.period_limit ?? 0)
      : budget
      ? Number(budget.limit ?? 0)
      : 0;
    const progress = limit ? (totalExpense / limit) * 100 : 0;
    const tone = status?.exceeded ? "over" : budgetTone(totalExpense, limit);
    const stats = [
      { label: "Limit", value: formatCurrency(limit), color: "text-ink" },
      { label: "Spent", value: formatCurrency(totalExpense), color: "text-spend" },
      { label: "Invested", value: formatCurrency(totalInvested), color: "text-invest" },
      { label: "Earned", value: formatCurrency(totalEarned), color: "text-saved" },
      {
        label: "Saved",
        value: formatCurrency(totalSaved),
        color: totalSaved < 0 ? "text-spend" : "text-saved",
      },
      {
        label: "Remaining",
        value: formatCurrency(remaining),
        color: remaining < 0 ? "text-spend" : "text-ink",
      },
    ];

    return (
      <div className="flex flex-col gap-5">
        {periodControls}

        <Card className="flex flex-wrap items-center gap-8 sm:p-7">
          <BreakdownRing
            label="Share of spent, invested and saved"
            segments={[
              { label: "Spent", value: totalExpense, color: "#C2410C" },
              { label: "Invested", value: totalInvested, color: "#6741D9" },
              { label: "Saved", value: totalSaved, color: "#0E7A6B" },
            ]}
          />
          <div className="grid min-w-[260px] flex-1 grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            {stats.map((s) => (
              <div key={s.label} className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-muted">{s.label}</span>
                <span className={clsx("truncate text-base font-semibold tracking-tight", s.color)}>
                  {s.value}
                </span>
              </div>
            ))}
            <div className="col-span-full flex flex-col gap-2">
              <ProgressBar value={progress} tone={tone} />
              {status?.exceeded && (
                <span className="text-xs text-spend">You've exceeded this budget for this period.</span>
              )}
            </div>
          </div>
        </Card>

        {/* Sub-tabs for Categories and Transactions */}
        <Card>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <Tabs
              label="Budget detail"
              options={[
                { value: "categories", label: "Category limits" },
                { value: "transactions", label: "Transactions" },
              ]}
              value={numericSubTab}
              onChange={setNumericSubTab}
            />
            {numericSubTab === "categories" ? (
              <Button variant="secondary" size="sm" onClick={() => setShowCategoryForm(true)}>
                <Icon name="plus" size={15} />
                Add category
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "date" | "amount" | "category")}
                  className="field-sm"
                  aria-label="Sort transactions"
                >
                  <option value="date">Sort by Date</option>
                  <option value="amount">Sort by Amount</option>
                  <option value="category">Sort by Category</option>
                </select>
                <IconButton
                  label={sortOrder === "asc" ? "Ascending" : "Descending"}
                  className="border border-line"
                  onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                >
                  <Icon name={sortOrder === "asc" ? "sortAsc" : "sortDesc"} size={16} />
                </IconButton>
                <Button variant="secondary" size="sm" onClick={() => setShowTransactionForm(true)}>
                  <Icon name="plus" size={15} />
                  Add transaction
                </Button>
              </div>
            )}
          </div>

          {numericSubTab === "categories" ? (
            budgetCategories && budgetCategories.length > 0 ? (
              <div className="flex flex-col">
                {budgetCategories.map((bc) => {
                  const categoryLimit = Number(bc.limit);
                  const actualSpending = Number(bc.actual_spending);
                  const categoryProgress = categoryLimit > 0
                    ? (actualSpending / categoryLimit) * 100
                    : 0;
                  const exceeded = actualSpending > categoryLimit;
                  const catTone = budgetTone(actualSpending, categoryLimit);

                  return (
                    <div
                      key={bc.id}
                      className="group -mx-3 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-xl px-3 py-3.5 transition hover:bg-canvas sm:grid-cols-[minmax(150px,1.4fr)_minmax(100px,2fr)_auto_auto]"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId(bc.id)}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                        title="View transactions in this category"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: categoryColor(bc.category) }}
                        />
                        <span className="truncate text-sm font-medium text-ink group-hover:text-accent">
                          {bc.category.name}
                        </span>
                        <span className="hidden xl:inline-flex">
                          <TypeBadge type={bc.category.type} />
                        </span>
                      </button>
                      <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                        <ProgressBar value={categoryProgress} tone={catTone} />
                      </div>
                      <div className="row-start-1 flex flex-col items-end text-[13px] sm:row-start-auto">
                        <span className="font-semibold text-ink">
                          {formatCurrency(actualSpending)}{" "}
                          <span className="font-normal text-muted">/ {formatCurrency(categoryLimit)}</span>
                        </span>
                        <span className={clsx("text-xs", TONE_TEXT[catTone])}>
                          {exceeded
                            ? `Over budget by ${formatCurrency(actualSpending - categoryLimit)}`
                            : `${formatCurrency(categoryLimit - actualSpending)} left`}
                        </span>
                      </div>
                      <div className="col-start-2 row-start-3 flex justify-end gap-0.5 sm:col-start-auto sm:row-start-auto">
                        <IconButton
                          label={`Edit ${bc.category.name} limit`}
                          onClick={() => setEditingCategoryId(bc.id)}
                        >
                          <Icon name="edit" size={16} />
                        </IconButton>
                        <IconButton
                          label={`Remove ${bc.category.name}`}
                          className="hover:bg-spend-soft hover:text-spend"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${bc.category.name}" from this budget?`
                              )
                            ) {
                              deleteCategoryMutation.mutate(bc.id);
                            }
                          }}
                          disabled={deleteCategoryMutation.isPending}
                        >
                          <Icon name="trash" size={16} />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted">
                No categories added yet. Click "Add category" to get started.
              </p>
            )
          ) : transactionsLoading ? (
            <div className="py-8 text-center text-sm text-muted">
              Loading transactions...
            </div>
          ) : sortedTransactions.length > 0 ? (
            <div className="flex flex-col">
              {sortedTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0"
                >
                  <CategoryAvatar
                    size="sm"
                    name={tx.description || tx.category?.name}
                    color={categoryColor(tx.category ?? null, tx.id)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-ink">
                      {tx.description || "—"}
                    </span>
                    <span className="text-xs text-muted">
                      {tx.category?.name || "Uncategorized"} ·{" "}
                      {formatDate(tx.date)}
                    </span>
                  </span>
                  <span className="hidden sm:inline-flex">
                    <TypeBadge type={tx.type} />
                  </span>
                  <span
                    className={clsx(
                      "min-w-[88px] text-right text-sm font-semibold",
                      tx.type === "expense" ? "text-ink" : TYPE_META[tx.type].text
                    )}
                  >
                    {formatSignedMoney(tx.amount, tx.type)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              No transactions found for this budget.
            </p>
          )}
        </Card>
      </div>
    );
  };

  const periodEnabled =
    !Number.isNaN(budgetId) && (periodView === "monthly" || !!selectedWeek);
  const periodParams = selectedWeek
    ? { start_date: selectedWeek.start, end_date: selectedWeek.end }
    : undefined;

  // Keyed under "budget-status" / "budget-categories" so the existing
  // invalidations after a transaction change refresh these too.
  const { data: breakdown } = useQuery({
    queryKey: ["budget-status", budgetId, "breakdown", selectedWeek?.start ?? null, selectedWeek?.end ?? null],
    queryFn: () => fetchExpenseBreakdown(budgetId, periodParams),
    enabled: periodEnabled && activeTab === "charts",
  });

  const { data: periodCategories } = useQuery({
    queryKey: ["budget-categories", budgetId, "period", selectedWeek?.start ?? null, selectedWeek?.end ?? null],
    queryFn: async () => {
      const { data } = await api.get<BudgetCategory[]>(`/budgets/${budgetId}/categories`, {
        params: periodParams,
      });
      return data;
    },
    enabled: periodEnabled && activeTab === "charts",
  });

  const periodLabel = selectedWeek
    ? `${formatDate(selectedWeek.start)} – ${formatDate(selectedWeek.end)}`
    : budget
    ? `${formatDate(budget.start_date)} – ${formatDate(budget.end_date)}`
    : "";

  const breakdownRows = useMemo(
    () => toBreakdownRows(breakdown?.items ?? []),
    [breakdown]
  );

  const limitRows = useMemo<LimitRow[]>(() => {
    if (!budget || !periodCategories) return [];
    // Category limits are for the whole budget; a week gets its share of it.
    const dayMs = 86_400_000;
    const totalDays =
      Math.round(
        (new Date(`${budget.end_date.slice(0, 10)}T00:00:00`).getTime() -
          new Date(`${budget.start_date.slice(0, 10)}T00:00:00`).getTime()) /
          dayMs
      ) + 1;
    const periodDays = selectedWeek
      ? Math.round(
          (new Date(`${selectedWeek.end}T00:00:00`).getTime() -
            new Date(`${selectedWeek.start}T00:00:00`).getTime()) /
            dayMs
        ) + 1
      : totalDays;
    const scale = totalDays > 0 ? periodDays / totalDays : 1;
    return periodCategories
      .map((bc) => ({
        key: String(bc.id),
        name: bc.category.name,
        color: categoryColor(bc.category),
        spent: Number(bc.actual_spending),
        limit: Number(bc.limit) * scale,
      }))
      .sort((a, b) => b.spent / (b.limit || 1) - a.spent / (a.limit || 1));
  }, [budget, periodCategories, selectedWeek]);

  // Share of the whole budget the selected period covers, used to prorate
  // whole-budget targets down to a week.
  const periodShare = useMemo(() => {
    if (!budget || !selectedWeek) return 1;
    const days = (a: string, b: string) =>
      Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000) + 1;
    const total = days(budget.start_date.slice(0, 10), budget.end_date.slice(0, 10));
    return total > 0 ? days(selectedWeek.start, selectedWeek.end) / total : 1;
  }, [budget, selectedWeek]);

  const { data: targets } = useQuery({
    queryKey: ["budget-targets", budgetId],
    queryFn: () => fetchBudgetTargets(budgetId),
    enabled: !Number.isNaN(budgetId),
  });

  // Targets are for the whole budget, so the Targets tab always compares
  // against the full period regardless of the weekly toggle.
  const { data: monthlyStatus } = useQuery({
    queryKey: ["budget-status", budgetId, null, null],
    queryFn: () => fetchBudgetStatus(budgetId),
    enabled: !Number.isNaN(budgetId) && activeTab === "targets",
  });

  const periodSeries = useMemo(() => {
    const startStr = status?.period_start ?? budget?.start_date.slice(0, 10);
    const endStr = status?.period_end ?? budget?.end_date.slice(0, 10);
    if (!startStr || !endStr) return null;
    return buildDailySeries(
      budgetTransactions?.items ?? [],
      startStr,
      endStr,
      Number(status?.period_limit ?? 0)
    );
  }, [status, budget, budgetTransactions]);

  const monthlySeries = useMemo(() => {
    if (!budget) return null;
    return buildDailySeries(
      budgetTransactions?.items ?? [],
      budget.start_date.slice(0, 10),
      budget.end_date.slice(0, 10),
      Number(monthlyStatus?.period_limit ?? budget.limit ?? 0)
    );
  }, [budget, budgetTransactions, monthlyStatus]);

  const timelinePoints = useMemo<TimelinePoint[]>(() => {
    if (!periodSeries) return [];
    const periodLimit = Number(status?.period_limit ?? 0);
    const n = periodSeries.days.length;
    return periodSeries.days.map((day, i) => {
      const spent = splitActualProjected(periodSeries, "spent", i);
      const invested = splitActualProjected(periodSeries, "invested", i);
      return {
        date: day,
        label: shortDayLabel(day),
        spent: spent.actual,
        invested: invested.actual,
        spentProjected: spent.projected,
        investedProjected: invested.projected,
        pace: Math.round(((periodLimit * (i + 1)) / n) * 100) / 100,
      };
    });
  }, [periodSeries, status]);

  const lastIndex = (periodSeries?.days.length ?? 0) - 1;
  const currentIndex = periodSeries ? Math.min(periodSeries.todayIndex, lastIndex) : -1;

  const metricTiles = useMemo<MetricTile[]>(
    () =>
      TARGET_METRICS.map((m) => {
        const target = targetValue(targets, m.key);
        const values = periodSeries?.values[m.key] ?? [];
        return {
          key: m.key,
          label: m.label,
          color: m.color,
          actual: currentIndex >= 0 ? values[currentIndex] ?? 0 : 0,
          projected: values[lastIndex] ?? 0,
          target: target == null ? null : target * periodShare,
        };
      }),
    [targets, periodSeries, currentIndex, lastIndex, periodShare]
  );

  const metricPoints = useMemo<MetricPoint[]>(() => {
    if (!periodSeries) return [];
    const target = targetValue(targets, graphMetric);
    const periodTarget = target == null ? null : target * periodShare;
    const n = periodSeries.days.length;
    return periodSeries.days.map((day, i) => ({
      date: day,
      label: shortDayLabel(day),
      ...splitActualProjected(periodSeries, graphMetric, i),
      target: periodTarget == null ? null : Math.round(((periodTarget * (i + 1)) / n) * 100) / 100,
    }));
  }, [periodSeries, targets, graphMetric, periodShare]);

  const selectedMetric = TARGET_METRICS.find((m) => m.key === graphMetric)!;
  const selectedTile = metricTiles.find((t) => t.key === graphMetric);

  const graphsContent = (
    <div className="flex flex-col gap-5">
      {periodControls}
      <SpendingTimelineCard
        title="Spending timeline"
        subtitle={`Running total, ${periodLabel}`}
        points={timelinePoints}
      />
      <MetricTiles
        tiles={metricTiles}
        selected={graphMetric}
        onSelect={(key) => setGraphMetric(key as TargetMetric)}
      />
      <MetricTargetCard
        key={graphMetric}
        points={metricPoints}
        label={selectedMetric.label}
        color={selectedMetric.color}
        target={selectedTile?.target ?? null}
        subtitle={`Running total, ${periodLabel}${selectedWeek ? " · target shown as this week's share" : ""}`}
      />
    </div>
  );

  const renderTargets = () => {
    const current: Record<TargetMetric, number> = {
      spent: Number(monthlyStatus?.total_expense ?? 0),
      invested: Number(monthlyStatus?.total_investment ?? 0),
      saved:
        Number(monthlyStatus?.total_income ?? 0) -
        Number(monthlyStatus?.total_expense ?? 0) -
        Number(monthlyStatus?.total_investment ?? 0),
    };
    const monthlyLast = (monthlySeries?.days.length ?? 0) - 1;
    const periodOver = !!monthlySeries && monthlySeries.todayIndex >= monthlyLast;

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Current totals vs your goals for {budget ? `${formatDate(budget.start_date)} – ${formatDate(budget.end_date)}` : "this budget"}.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setShowTargetsForm(true)}>
            <Icon name="edit" size={15} />
            Edit targets
          </Button>
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          {TARGET_METRICS.map((m) => {
            const target = targetValue(targets, m.key);
            const actual = current[m.key];
            const projected = monthlySeries?.values[m.key][monthlyLast] ?? actual;
            const pct = target && target > 0 ? (actual / target) * 100 : 0;
            const tone = m.kind === "ceiling" && target != null ? budgetTone(actual, target) : "ok";
            const diff = target == null ? 0 : target - actual;
            const statusText =
              target == null
                ? "No target set"
                : m.kind === "ceiling"
                ? diff < 0
                  ? `Over target by ${formatCurrency(-diff)}`
                  : `${formatCurrency(diff)} left under target`
                : diff <= 0
                ? "Goal reached"
                : `${formatCurrency(diff)} to go`;
            const projectedOff =
              target != null &&
              (m.kind === "ceiling" ? projected > target : projected < target);

            return (
              <Card key={m.key} className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                  <h3 className="text-sm font-semibold text-ink">{m.label}</h3>
                  <span className="ml-auto text-xs text-muted">
                    {m.kind === "ceiling" ? "Spend at most" : "Reach at least"}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-ink">
                    {formatCurrency(actual)}
                  </span>
                  <span className="text-sm text-muted">
                    / {target == null ? "—" : formatCurrency(target)}
                  </span>
                </div>
                {target != null ? (
                  <>
                    <ProgressBar
                      value={pct}
                      tone={tone}
                      barClassName={
                        m.key === "invested" ? "bg-invest" : m.key === "saved" ? "bg-saved" : undefined
                      }
                    />
                    <div className="flex flex-col gap-1 text-xs">
                      <span
                        className={clsx(
                          m.kind === "ceiling"
                            ? TONE_TEXT[tone]
                            : diff <= 0
                            ? "text-saved"
                            : "text-muted"
                        )}
                      >
                        {statusText} · {Math.round(pct)}%
                      </span>
                      {!periodOver && (
                        <span className={projectedOff ? "text-warn" : "text-muted"}>
                          On pace for {formatCurrency(projected)} by {formatDate(budget?.end_date)}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTargetsForm(true)}
                    className="self-start text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    Set a {m.label.toLowerCase()} target
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  const chartsContent = (
    <div className="flex flex-col gap-5">
      {periodControls}
      <div className="grid items-start gap-5 2xl:grid-cols-2">
        <ExpenseBreakdownCard rows={breakdownRows} subtitle={periodLabel} />
        <CategoryLimitsCard rows={limitRows} subtitle={selectedWeek ? "Limits shown as this week's share" : periodLabel} />
      </div>
    </div>
  );

  if (Number.isNaN(budgetId)) {
    return (
      <Card>
        <p className="text-sm text-spend">
          Invalid budget selected.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => navigate("/budgets")}
          >
            <Icon name="chevronLeft" size={16} />
            Back to budgets
          </Button>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              {budget ? budget.name : "Budget details"}
            </h2>
            {budget && (
              <p className="mt-0.5 text-sm text-muted">
                {formatDate(budget.start_date)} – {formatDate(budget.end_date)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowCategoryForm(true)}>
            <Icon name="plus" size={16} />
            Add category
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowEditBudgetForm(true)}
          >
            <Icon name="edit" size={16} />
            Edit budget
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (
                window.confirm(
                  `Are you sure you want to delete "${budget?.name}"? This will remove the budget association from all transactions.`
                )
              ) {
                deleteBudgetMutation.mutate(budgetId);
              }
            }}
            disabled={deleteBudgetMutation.isPending}
          >
            <Icon name="trash" size={16} />
            {deleteBudgetMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>

      <Tabs
        label="Budget views"
        options={(Object.keys(tabLabels) as TabKey[]).map((tab) => ({
          value: tab,
          label: tabLabels[tab],
        }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      {loading || !budget ? (
        <Skeleton className="h-64" />
      ) : (
        <div key={activeTab} className="animate-rise">
          {activeTab === "numeric" && renderNumeric()}
          {activeTab === "targets" && renderTargets()}
          {activeTab === "graphs" && graphsContent}
          {activeTab === "charts" && chartsContent}
        </div>
      )}

      {showCategoryForm && (
        <BudgetCategoryForm
          budgetId={budgetId}
          onClose={() => setShowCategoryForm(false)}
          onSuccess={() => setShowCategoryForm(false)}
        />
      )}

      {showTransactionForm && (
        <BudgetTransactionForm
          budgetId={budgetId}
          onClose={() => setShowTransactionForm(false)}
        />
      )}

      {selectedCategoryId && (
        <CategoryTransactionsModal
          budgetId={budgetId}
          budgetCategoryId={selectedCategoryId}
          onClose={() => setSelectedCategoryId(null)}
        />
      )}

      {showTargetsForm && (
        <EditTargetsForm
          budgetId={budgetId}
          targets={targets}
          onClose={() => setShowTargetsForm(false)}
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
    <Modal title="Edit budget" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className="field"
            placeholder="Budget name"
            maxLength={100}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) =>
                setFormData({ ...formData, startDate: e.target.value })
              }
              className="field"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) =>
                setFormData({ ...formData, endDate: e.target.value })
              }
              className="field"
            />
          </Field>
        </div>
        {error && <FormError>{error}</FormError>}
        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save changes"}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
};

const EditTargetsForm = ({
  budgetId,
  targets,
  onClose,
}: {
  budgetId: number;
  targets: BudgetTargets | undefined;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();
  const initial = (metric: TargetMetric) => {
    const value = targetValue(targets, metric);
    return value == null ? "" : String(value);
  };
  const [values, setValues] = useState<Record<TargetMetric, string>>({
    spent: initial("spent"),
    invested: initial("invested"),
    saved: initial("saved"),
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      // A blank field clears that target.
      const parse = (v: string) => (v.trim() === "" ? null : Number(v));
      return updateBudgetTargets(budgetId, {
        spending: parse(values.spent),
        invested: parse(values.invested),
        saved: parse(values.saved),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["budget-targets", budgetId], data);
      onClose();
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || "Failed to save targets");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (Object.values(values).some((v) => v.trim() !== "" && !(Number(v) >= 0))) {
      setError("Targets must be 0 or more");
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal title="Edit targets" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {TARGET_METRICS.map((m, i) => (
          <Field
            key={m.key}
            label={m.kind === "ceiling" ? `${m.label} — spend at most` : `${m.label} — reach at least`}
            hint={i === TARGET_METRICS.length - 1 ? "Goals cover the whole budget period. Leave blank for no target." : undefined}
          >
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={values[m.key]}
              onChange={(e) => setValues({ ...values, [m.key]: e.target.value })}
              className="field"
              placeholder="No target"
              autoFocus={i === 0}
            />
          </Field>
        ))}
        {error && <FormError>{error}</FormError>}
        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save targets"}
          </Button>
        </FormActions>
      </form>
    </Modal>
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
    <Modal title={`Edit limit · ${budgetCategory.category.name}`} size="sm" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Category limit"
          hint={`Current spending: ${formatCurrency(budgetCategory.actual_spending)}`}
        >
          <input
            type="number"
            step="0.01"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="field"
            placeholder="0.00"
            min="0"
            autoFocus
          />
        </Field>
        {error && <FormError>{error}</FormError>}
        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </FormActions>
      </form>
    </Modal>
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
    <Modal
      size="lg"
      title={`Transactions · ${selectedCategory.data?.category.name || "Category"}`}
      subtitle={
        selectedCategory.data && (
          <>
            Limit: {formatCurrency(selectedCategory.data.limit)} · Spent:{" "}
            {formatCurrency(selectedCategory.data.actual_spending)}
          </>
        )
      }
      onClose={onClose}
    >
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted">Loading transactions...</div>
      ) : transactions && transactions.items.length > 0 ? (
        <div className="flex flex-col">
          {transactions.items.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">
                    {tx.description || "No description"}
                  </p>
                  <TypeBadge type={tx.type} />
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {formatDate(tx.date)}
                </p>
              </div>
              <p
                className={clsx(
                  "text-sm font-semibold",
                  tx.type === "expense" ? "text-ink" : TYPE_META[tx.type].text
                )}
              >
                {formatSignedMoney(tx.amount, tx.type)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted">
          No transactions found for this category in this budget.
        </div>
      )}
    </Modal>
  );
};
