import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Transaction, Category } from "../../lib/types";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import React from "react";

const schema = z.object({
  date: z.string(),
  amount: z.number().positive(),
  description: z.string().optional(),
  type: z.enum(["income", "expense"]),
  category_id: z
    .string()
    .optional()
    .transform((val) => (val ? Number(val) : undefined)),
});

type FormValues = z.infer<typeof schema>;

const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await api.get("/categories", {
    params: { limit: 100, offset: 0 },
  });
  // adjust based on schemas.CategoryListResponse shape
  return data.items ?? data; // if your response wraps items
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

  const defaultValues: Partial<FormValues> = transaction
  ? {
      date: transaction.date.slice(0, 10),
      amount: transaction.amount,
      description: transaction.description ?? "",
      type: transaction.type,
      category_id: transaction.category_id ?? undefined, // ✅ number or undefined
    }
  : {
      date: new Date().toISOString().slice(0, 10),
      type: "expense",
    };


  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        amount: Number(values.amount),
      };
      if (transaction) {
        const { data } = await api.patch(
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
              {...register("category_id", {
                setValueAs: (v) => (v === "" ? undefined : Number(v)),
              })}
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
              Description
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
              {...register("description")}
            />
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
