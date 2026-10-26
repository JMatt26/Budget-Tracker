import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card, Skeleton } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Field, FormActions, FormError } from "../../components/ui/Field";
import { ChipGroup, Segmented } from "../../components/ui/Segmented";
import { Icon } from "../../components/ui/Icon";
import { CategoryAvatar, TypeBadge } from "../../components/ui/Progress";
import { categoryColor } from "../../lib/format";
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

const TYPE_OPTIONS: { value: CategoryFormData["type"]; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
];

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
    <Modal title={category ? "Edit category" : "Create category"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name">
          <input
            type="text"
            value={formData.name}
            onChange={(e) =>
              setFormData({ ...formData, name: e.target.value })
            }
            className="field"
            placeholder="Category name"
            maxLength={100}
            autoFocus
          />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Type</span>
          <Segmented
            label="Type"
            fullWidth
            options={TYPE_OPTIONS}
            value={formData.type}
            onChange={(type) => setFormData({ ...formData, type })}
          />
        </div>

        {error && <FormError>{error}</FormError>}

        <FormActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending
              ? "Saving..."
              : category
              ? "Save changes"
              : "Create"}
          </Button>
        </FormActions>
      </form>
    </Modal>
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
    <Modal title="Category actions" size="sm" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-canvas p-3">
        <CategoryAvatar name={category.name} color={categoryColor(category)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{category.name}</p>
          {category.type && (
            <p className="mt-0.5 text-xs capitalize text-muted">
              {category.type}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Button
          className="w-full"
          onClick={() => {
            onClose();
            onEdit();
          }}
        >
          <Icon name="edit" size={16} />
          Edit
        </Button>
        <Button
          variant="danger"
          className="w-full"
          onClick={() => {
            onClose();
            onDelete();
          }}
        >
          <Icon name="trash" size={16} />
          Delete
        </Button>
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
};

type TypeFilter = "all" | Category["type"];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "investment", label: "Investment" },
];

export const CategoriesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
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

  const visible = (data?.items ?? []).filter(
    (cat) => typeFilter === "all" || cat.type === typeFilter
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-[42px] w-full max-w-xs items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
          <Icon name="search" size={16} />
          <span className="sr-only">Search categories</span>
          <input
            type="text"
            placeholder="Search categories..."
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <ChipGroup label="Category type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
        <Button variant="dark" className="ml-auto" onClick={() => setShowCreateForm(true)}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          Create
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-muted">
            {data.items.length === 0
              ? "No categories found. Create your first category to get started."
              : "No categories of this type match your search."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className="card-hover flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left"
              onClick={() => setActionCategory(cat)}
            >
              <CategoryAvatar size="lg" name={cat.name} color={categoryColor(cat)} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm font-semibold text-ink">{cat.name}</span>
                {cat.type && (
                  <span>
                    <TypeBadge type={cat.type} />
                  </span>
                )}
              </span>
              <span className="text-muted" aria-hidden="true">
                <Icon name="more" size={18} />
              </span>
            </button>
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
