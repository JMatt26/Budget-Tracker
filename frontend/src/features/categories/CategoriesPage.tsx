import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";

type Category = {
  id: number;
  name: string;
  // guessing you might have this; harmless if it’s missing
  type?: "income" | "expense";
};

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
  if (search) {
    params.search = search;
  }
  const { data } = await api.get("/categories", { params });
  return data;
};

export const CategoriesPage: React.FC = () => {
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["categories", search],
    queryFn: () => fetchCategories(search),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-100">
          Categories
        </h2>
        <div className="flex flex-1 items-center justify-end gap-2">
          <input
            type="text"
            placeholder="Search categories..."
            className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="ghost" onClick={() => refetch()}>
            Search
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <Card className="h-32 animate-pulse bg-slate-900/80" />
      ) : data.items.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">
            No categories found. You can create them via the API or
            future UI.
          </p>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 text-left">Name</th>
                <th className="py-2 text-left">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-b border-slate-900/60 last:border-0"
                >
                  <td className="py-2 text-slate-100">
                    {cat.name}
                  </td>
                  <td className="py-2 text-slate-300">
                    {cat.type ? (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-300">
                        {cat.type}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
