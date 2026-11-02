import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { PAYMENT_METHODS } from "../../lib/types";
import type { Transaction, Category, Budget, TransactionType } from "../../lib/types";
import { api } from "../../lib/api";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, FormError } from "../../components/ui/Field";
import { Segmented } from "../../components/ui/Segmented";
import { toLocalISODate } from "../../lib/format";
import React from "react";
import { fetchBudgets } from "../../lib/budget-api";
import { CategoryPicker } from "./CategoryPicker";

const schema = z
  .object({
  date: z.string(),
  amount: z.number().positive(),
  description: z.string().optional(),
  type: z.enum(["income", "expense", "investment"]),
  payment_method: z.enum(["Amex", "Visa", "Debit", "Cash"]).optional().or(z.literal("")),
  category_ids: z.array(z.number()),
  budget_id: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined)),
  })
  .refine((v) => v.type !== "expense" || !!v.payment_method, {
    message: "Choose a payment method.",
    path: ["payment_method"],
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
      payment_method: transaction.payment_method ?? "",
      category_ids: transaction.category_ids ?? [],
      budget_id: transaction.budget_id ? String(transaction.budget_id) : undefined,
    }
  : {
      date: toLocalISODate(new Date()),
      type: "expense",
      payment_method: "",
      category_ids: [],
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
  const selectedCategoryIds = watch("category_ids") ?? [];

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // zodResolver applies the transform, so values are already transformed
      const transformedValues = values as FormValuesOutput;

      // Build payload - ensure proper types and convert empty strings to null
      const payload: any = {
        date: transformedValues.date,
        amount: Number(transformedValues.amount),
        type: transformedValues.type,
        payment_method:
          transformedValues.type === "expense" ? transformedValues.payment_method : null,
      };

      // Convert empty description to null (Pydantic expects null, not empty string for optional fields)
      const description = transformedValues.description?.trim();
      payload.description = description && description !== "" ? description : null;

      // Always send the full set ([] clears it)
      payload.category_ids = transformedValues.category_ids;

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

        <CategoryPicker
          categories={categories ?? []}
          type={selectedType}
          value={selectedCategoryIds}
          onChange={(ids) => setValue("category_ids", ids, { shouldDirty: true })}
        />

        {selectedType === "expense" && (
          <Field label="Payment method" error={errors.payment_method?.message}>
            <select className="field" {...register("payment_method")}>
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
