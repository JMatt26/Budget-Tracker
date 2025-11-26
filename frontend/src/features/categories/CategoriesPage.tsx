import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import type { Category } from "../../lib/types";

type CategoryListResponse = {
  items: Category[];
  total: number;
  limit: number;
  offset: number;
};

const fetchCategories = async (
  search: string
): Promise<CategoryListResponse> => {
  const params: Record<string, string | number> = {
    limit: 50,
    offset: 0,
  };
  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }
  const { data } = await api.get("/categories", { params });
  return data;
};

type CategoryFormData = {
  name: string;
  type: "income" | "expense" | "investment";
};

const CategoryForm = ({
  category,
  onClose,
  onSuccess,
}: {
  category?: Category;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [formData, setFormData] = useState<CategoryFormData>({
    name: category?.name || "",
    type: category?.type || "expense",
  });
  const [error, setError] = useState<string | null>(null);

  // Update form data when category changes
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        type: category.type || "expense",
      });
    } else {
      setFormData({
        name: "",
        type: "expense",
      });
    }
    setError(null);
  }, [category]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      if (category) {
        const { data: response } = await api.put(`/categories/${category.id}`, data);
        return response;
      } else {
        const { data: response } = await api.post("/categories", data);
        return response;
      }
    },
    onSuccess: () => {
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
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-md">
        <h2 className="mb-4 text-lg font-semibold">
          {category ? "Edit Category" : "Create Category"}
        </h2>

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
              placeholder="Category name"
              maxLength={100}
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Type</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as "income" | "expense" | "investment",
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="investment">Investment</option>
            </select>
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
              {mutation.isPending
                ? "Saving..."
                : category
                ? "Save Changes"
                : "Create"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

const CategoryActions = ({
  category,
  onEdit,
  onDelete,
  onClose,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <Card className="w-full max-w-sm">
        <h2 className="mb-4 text-lg font-semibold">Category Actions</h2>
        <div className="mb-4 rounded-lg bg-slate-800/50 p-3">
          <p className="text-sm font-medium text-slate-200">{category.name}</p>
          {category.type && (
            <p className="mt-1 text-xs text-slate-400 capitalize">
              {category.type}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            className="w-full text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => {
              onClose();
              onDelete();
            }}
          >
            Delete
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
};

export const CategoriesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [actionCategory, setActionCategory] = useState<Category | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["categories", search],
    queryFn: () => fetchCategories(search),
    staleTime: 0, // Always consider data stale to ensure fresh results
    gcTime: 0, // Don't cache results to ensure fresh data on every search
  });

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: number) => {
      await api.delete(`/categories/${categoryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || "Failed to delete category");
    },
  });

  const handleDelete = (category: Category) => {
    if (
      window.confirm(
        `Are you sure you want to delete "${category.name}"? This action cannot be undone.`
      )
    ) {
      deleteMutation.mutate(category.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">Categories</h2>
        <div className="flex flex-1 items-center justify-end gap-2">
          <input
            type="text"
            placeholder="Search categories..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={() => setShowCreateForm(true)}>Create</Button>
        </div>
      </div>

      {isLoading || !data ? (
        <Card className="h-32 animate-pulse bg-slate-900/80" />
      ) : data.items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            No categories found. Create your first category to get started.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((cat) => (
            <Card
              key={cat.id}
              className="cursor-pointer transition hover:border-sky-500/50 hover:bg-slate-900/80"
              onClick={() => setActionCategory(cat)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-medium text-slate-100">{cat.name}</h3>
                  {cat.type && (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                        cat.type === "income"
                          ? "bg-green-500/20 text-green-400"
                          : cat.type === "investment"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {cat.type}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreateForm && (
        <CategoryForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => setShowCreateForm(false)}
        />
      )}

      {editingCategory && (
        <CategoryForm
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={() => setEditingCategory(null)}
        />
      )}

      {actionCategory && (
        <CategoryActions
          category={actionCategory}
          onEdit={() => {
            setEditingCategory(actionCategory);
            setActionCategory(null);
          }}
          onDelete={() => {
            handleDelete(actionCategory);
            setActionCategory(null);
          }}
          onClose={() => setActionCategory(null)}
        />
      )}
    </div>
  );
};
