import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Transaction, Category, Budget } from "../../lib/types";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
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
      date: new Date().toISOString().slice(0, 10),
      type: "expense",
    };


  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const descriptionValue = watch("description") ?? "";
  const descriptionLength = descriptionValue.length;
  const maxLength = 255;
  const isAtMaxLength = descriptionLength >= maxLength;

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
      onClose();
    },
  });

  const onSubmit = async (values: FormValues) => {
    await mutation.mutateAsync(values);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-lg">
        <h2 className="mb-4 text-lg font-semibold">
          {transaction ? "Edit transaction" : "Add transaction"}
        </h2>

        <form
          className="space-y-4"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Date
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                {...register("date")}
              />
              {errors.date && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                {...register("amount", {
                  valueAsNumber: true,
                })}
              />
              {errors.amount && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.amount.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Type
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              {...register("type")}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="investment">Investment</option>
            </select>
            {errors.type && (
              <p className="mt-1 text-xs text-red-400">
                {errors.type.message}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Category
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              {...register("category_id")}
            >
              <option value="">None</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Budget
            </label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
              {...register("budget_id")}
            >
              <option value="">None</option>
              {budgets?.items.map((b: Budget) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">
              Description
            </label>
            <input
              type="text"
              maxLength={maxLength}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              {...register("description")}
            />
            <div className="mt-1 flex justify-end">
              <span
                className={`text-xs ${
                  isAtMaxLength ? "text-red-400" : "text-slate-400"
                }`}
              >
                {descriptionLength}/{maxLength}
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : transaction
                ? "Save changes"
                : "Create"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
