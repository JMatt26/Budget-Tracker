import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import type { Transaction, Category, Budget, TransactionType } from "../../lib/types";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, FormError } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { categoryColor, toLocalISODate } from "../../lib/format";
import React from "react";
import { fetchBudgets } from "../../lib/budget-api";

const schema = z.object({
  date: z.string(),
  amount: z.number().positive(),
  description: z.string().optional(),
  type: z.enum(["income", "expense", "investment"]),
  category_id: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined)),
  budget_id: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined)),
});

type FormValues = z.input<typeof schema>;
type FormValuesOutput = z.infer<typeof schema>;

const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await api.get("/categories", {
    params: { limit: 100, offset: 0 },
  });
  return data.items ?? data;
};

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
];

const AMOUNT_COLOR: Record<TransactionType, string> = {
  expense: "text-ink",
  income: "text-saved",
  investment: "text-invest",
};

export const TransactionForm = ({
  transaction,
  onClose,
}: {
  transaction: Transaction | null;
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
  const { data: budgets } = useQuery({
    queryKey: ["budgets", "for-form"],
    queryFn: fetchBudgets,
  });

  const defaultValues: Partial<FormValues> = transaction
  ? {
      date: transaction.date.slice(0, 10),
      amount: transaction.amount,
      description: transaction.description ?? "",
      type: transaction.type,
      category_id: transaction.category_id ? String(transaction.category_id) : undefined,
      budget_id: transaction.budget_id ? String(transaction.budget_id) : undefined,
    }
  : {
      date: toLocalISODate(new Date()),
      type: "expense",
    };


  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    watch,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // The budget <select> renders before its options arrive, so the browser
  // drops the default value. Re-apply it once the budgets have loaded.
  React.useEffect(() => {
    if (budgets && transaction?.budget_id) {
      setValue("budget_id", String(transaction.budget_id));
    }
  }, [budgets, transaction, setValue]);

  const descriptionValue = watch("description") ?? "";
  const descriptionLength = descriptionValue.length;
  const maxLength = 255;
  const isAtMaxLength = descriptionLength >= maxLength;

  const selectedType = (watch("type") ?? "expense") as TransactionType;
  const selectedCategoryId = watch("category_id") ?? "";

  // Show categories that match the chosen type first, plus whichever
  // category is already selected so editing never hides it.
  const visibleCategories = (categories ?? []).filter(
    (c) => c.type === selectedType || String(c.id) === selectedCategoryId
  );
  const otherCategories = (categories ?? []).filter(
    (c) => !visibleCategories.includes(c)
  );
  const [showAllCategories, setShowAllCategories] = React.useState(false);
  const chipCategories = showAllCategories
    ? [...visibleCategories, ...otherCategories]
    : visibleCategories;

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // zodResolver applies the transform, so values are already transformed
      const transformedValues = values as FormValuesOutput;

      // Build payload - ensure proper types and convert empty strings to null
      const payload: any = {
        date: transformedValues.date,
        amount: Number(transformedValues.amount),
        type: transformedValues.type,
      };

      // Convert empty description to null (Pydantic expects null, not empty string for optional fields)
      const description = transformedValues.description?.trim();
      payload.description = description && description !== "" ? description : null;

      // For updates, always include category_id (even if null) to allow clearing the category
      // For creates, only include if it has a value
      if (transaction) {
        payload.category_id = transformedValues.category_id ?? null;
      } else if (transformedValues.category_id !== undefined) {
        payload.category_id = transformedValues.category_id;
      }

      // Always send budget_id (null clears it)
      payload.budget_id = transformedValues.budget_id ?? null;

      if (transaction) {
        const { data } = await api.put(
          `/transactions/${transaction.id}`,
          payload
        );
        return data;
      }
      const { data } = await api.post("/transactions", payload);
      return data;
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
      // Dashboard and report totals
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["summary-month"] });
      onClose();
    },
  });

  const onSubmit = async (values: FormValues) => {
    await mutation.mutateAsync(values);
  };

  return (
    <Modal
      variant="sheet"
      title={transaction ? "Edit transaction" : "Add transaction"}
      onClose={onClose}
    >
      <form className="flex min-h-full flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register("type")} />
        <input type="hidden" {...register("category_id")} />

        <Segmented
          label="Type"
          fullWidth
          options={TYPE_OPTIONS}
          value={selectedType}
          onChange={(v) => setValue("type", v, { shouldDirty: true, shouldValidate: true })}
        />
        {errors.type && <p className="-mt-4 text-xs text-spend">{errors.type.message}</p>}

        <label className="flex flex-col items-center gap-1 py-2">
          <span className="text-[13px] font-medium text-muted">Amount</span>
          <span
            className={clsx(
              "flex items-baseline justify-center text-5xl font-semibold tracking-tight",
              AMOUNT_COLOR[selectedType]
            )}
          >
            {selectedType === "income" ? "+" : ""}$
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              autoFocus={!transaction}
              className="w-48 border-0 bg-transparent p-0 text-5xl font-semibold tracking-tight placeholder:text-line focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              {...register("amount", {
                valueAsNumber: true,
              })}
            />
          </span>
          {errors.amount && (
            <span className="text-xs text-spend">{errors.amount.message}</span>
          )}
        </label>

        <div className="flex flex-col gap-2.5">
          <span className="text-[13px] font-medium text-muted">Category</span>
          <div className="flex flex-wrap gap-2">
            <CategoryChip
              label="None"
              color="#98A2B3"
              active={!selectedCategoryId}
              onClick={() => setValue("category_id", "", { shouldDirty: true })}
            />
            {chipCategories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                color={categoryColor(c)}
                active={String(c.id) === selectedCategoryId}
                onClick={() =>
                  setValue("category_id", String(c.id), { shouldDirty: true })
                }
              />
            ))}
            {otherCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCategories((v) => !v)}
                className="min-h-[38px] rounded-full px-3 text-[13px] font-medium text-accent hover:bg-accent-soft"
              >
                {showAllCategories ? "Show fewer" : `+${otherCategories.length} more`}
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.date?.message}>
            <input type="date" className="field" {...register("date")} />
          </Field>
          <Field label="Budget">
            <select className="field" {...register("budget_id")}>
              <option value="">None</option>
              {budgets?.items.map((b: Budget) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label={
            <span className="flex justify-between">
              <span>Description</span>
              <span className={isAtMaxLength ? "text-spend" : "font-normal text-muted"}>
                {descriptionLength}/{maxLength}
              </span>
            </span>
          }
        >
          <input
            type="text"
            maxLength={maxLength}
            placeholder="What was it for? (optional)"
            className="field"
            {...register("description")}
          />
        </Field>

        {mutation.isError && (
          <FormError>
            {(mutation.error as any)?.response?.data?.detail
              ? String((mutation.error as any).response.data.detail)
              : "Unable to save transaction."}
          </FormError>
        )}

        <div className="mt-auto flex gap-2 pt-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="lg" className="flex-[2]" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving..."
              : transaction
              ? "Save changes"
              : "Save transaction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

const CategoryChip = ({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={clsx(
      "flex min-h-[38px] items-center gap-2 rounded-full border-[1.5px] px-3.5 text-[13px] font-medium text-ink transition",
      active ? "" : "border-line bg-surface hover:border-ink/25"
    )}
    style={active ? { borderColor: color, backgroundColor: `${color}14` } : undefined}
  >
    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    {label}
  </button>
);
