"use client";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { getAdminRestaurantsData } from "@/lib/opsData";
import { cn } from "@/lib/utils";
import type { RestaurantManagementRow } from "@/types";

const statuses = ["All", "Active", "Pending", "Suspended"] as const;

export function AdminRestaurantsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("All");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const restaurantsQuery = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: getAdminRestaurantsData,
  });

  const data = useMemo(() => {
    if (!restaurantsQuery.data) {
      return [];
    }

    return restaurantsQuery.data.filter((restaurant) => {
      const matchesQuery =
        restaurant.name.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.owner.toLowerCase().includes(query.toLowerCase()) ||
        restaurant.cuisine.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "All" || restaurant.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, restaurantsQuery.data, status]);

  const columns = useMemo<ColumnDef<RestaurantManagementRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-text-primary">{row.original.name}</div>
            <div className="mt-1 text-xs text-text-secondary">ID {row.original.id}</div>
          </div>
        ),
      },
      { accessorKey: "owner", header: "Owner" },
      { accessorKey: "cuisine", header: "Cuisine" },
      {
        accessorKey: "rating",
        header: "Rating",
        cell: ({ row }) => row.original.rating.toFixed(1),
      },
      { accessorKey: "orders", header: "Orders" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold",
              row.original.status === "Active"
                ? "bg-success/10 text-success"
                : row.original.status === "Pending"
                  ? "bg-warning/10 text-warning"
                  : "bg-danger/10 text-danger",
            )}
          >
            {row.original.status}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: () => (
          <div className="flex flex-wrap gap-2">
            {["View", "Edit", "Suspend", "Delete"].map((action) => (
              <button
                className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-brand/30 hover:text-brand"
                key={action}
                type="button"
              >
                {action}
              </button>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
            Catalog
          </p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Restaurants</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Search, review, and control restaurant accounts across the network.
          </p>
        </div>
        <button
          className="inline-flex items-center gap-2 rounded-pill bg-brand px-4 py-3 text-sm font-semibold text-white"
          onClick={() => setIsPanelOpen(true)}
          type="button"
        >
          <Plus className="h-4 w-4" />
          Add Restaurant
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-md items-center gap-3 rounded-[16px] border border-border bg-white px-4 py-3">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            className="w-full border-0 bg-transparent text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, owner, or cuisine"
            value={query}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((option) => (
            <button
              className={cn(
                "rounded-pill border px-3 py-2 text-sm font-medium transition",
                status === option
                  ? "border-brand bg-brand-light text-brand"
                  : "border-border bg-white text-text-secondary",
              )}
              key={option}
              onClick={() => setStatus(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {restaurantsQuery.isLoading ? (
        <div className="bone-loader h-[520px] rounded-[20px]" />
      ) : restaurantsQuery.isError ? (
        <div className="rounded-[20px] border border-border bg-white p-8 text-center">
          <p className="text-lg font-bold text-text-primary">Could not load restaurants</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          emptyLabel="No restaurants match the current filters."
        />
      )}

      <AnimatePresence>
        {isPanelOpen ? (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-[#1C1C1C]/30"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setIsPanelOpen(false)}
            />
            <motion.aside
              animate={{ x: 0 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-border bg-white p-6 shadow-[-24px_0_60px_rgba(28,28,28,0.12)]"
              exit={{ x: "100%" }}
              initial={{ x: "100%" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                    New restaurant
                  </p>
                  <h2 className="mt-2 text-2xl font-bold text-text-primary">
                    Add restaurant
                  </h2>
                </div>
                <button
                  className="rounded-full border border-border p-2"
                  onClick={() => setIsPanelOpen(false)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-4">
                {["Restaurant name", "Owner email", "Cuisine", "City"].map((label) => (
                  <label className="block" key={label}>
                    <span className="mb-2 block text-sm font-semibold text-text-primary">
                      {label}
                    </span>
                    <input className="h-12 w-full rounded-[14px] border border-border px-4 outline-none focus:border-brand" />
                  </label>
                ))}
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-text-primary">
                    Description
                  </span>
                  <textarea className="min-h-[120px] w-full rounded-[14px] border border-border px-4 py-3 outline-none focus:border-brand" />
                </label>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  className="rounded-pill border border-border px-5 py-3 text-sm font-semibold text-text-primary"
                  onClick={() => setIsPanelOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-pill bg-brand px-5 py-3 text-sm font-semibold text-white"
                  type="button"
                >
                  Save restaurant
                </button>
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
