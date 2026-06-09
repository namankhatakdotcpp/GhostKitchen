"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { RestaurantDetailDrawer } from "@/components/admin/restaurant-detail-drawer";
import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const statuses = ["All", "Active", "Pending Approval", "Suspended"] as const;

async function fetchRestaurants() {
  const { data } = await api.get("/admin/restaurants", { params: { limit: 100 } });
  return (data.restaurants ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    owner: r.owner?.name ?? r.owner?.email ?? "—",
    cuisine: Array.isArray(r.cuisines) ? r.cuisines.slice(0, 2).join(", ") : "—",
    rating: r.rating ?? 0,
    orders: r._count?.orders ?? 0,
    suspended: r.suspended ?? false,
    isApproved: r.isApproved ?? true,
    status: r.suspended ? "Suspended" : !r.isApproved ? "Pending Approval" : r.isOpen ? "Active" : "Closed",
  }));
}

export function AdminRestaurantsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["admin-restaurants"],
    queryFn: fetchRestaurants,
  });

  const filtered = useMemo(() =>
    data.filter((r: any) => {
      const q = query.toLowerCase();
      const matchQuery = !q || r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q);
      const matchStatus = status === "All" || r.status === status;
      return matchQuery && matchStatus;
    }),
  [data, query, status]);

  async function handleSuspend(id: string, currentlySuspended: boolean) {
    const action = currentlySuspended ? "Unsuspend" : "Suspend";
    if (!confirm(`${action} this restaurant?`)) return;
    try {
      await api.patch(`/admin/restaurants/${id}/suspend`);
      toast.success(`Restaurant ${action.toLowerCase()}ed`);
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
    } catch {
      toast.error(`Failed to ${action.toLowerCase()}`);
    }
  }

  async function handleApprove(id: string, currentlyApproved: boolean) {
    try {
      await api.patch(`/admin/restaurants/${id}/approve`, { approve: !currentlyApproved });
      toast.success(currentlyApproved ? "Restaurant unapproved" : "Restaurant approved — now live");
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] });
    } catch {
      toast.error("Failed to update approval");
    }
  }

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-text-primary">{row.original.name}</div>
          <div className="mt-0.5 text-xs text-text-secondary">{row.original.cuisine}</div>
        </div>
      ),
    },
    { accessorKey: "owner",  header: "Owner" },
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
        <span className={cn(
          "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
          row.original.status === "Active"           ? "bg-success/10 text-success" :
          row.original.status === "Suspended"        ? "bg-danger/10 text-danger"  :
          row.original.status === "Pending Approval" ? "bg-yellow-100 text-yellow-700" :
                                                       "bg-[#F3F4F6] text-[#6B7280]"
        )}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedId(row.original.id)}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-[#FAFAFA] transition"
          >
            View
          </button>
          {!row.original.isApproved && (
            <button
              type="button"
              onClick={() => handleApprove(row.original.id, row.original.isApproved)}
              className="rounded-full border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 transition"
            >
              Approve
            </button>
          )}
          {row.original.isApproved && (
            <button
              type="button"
              onClick={() => handleApprove(row.original.id, row.original.isApproved)}
              className="rounded-full border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#6B7280] hover:bg-[#F9FAFB] transition"
            >
              Unapprove
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSuspend(row.original.id, row.original.suspended)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              row.original.suspended
                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-danger/30 text-danger hover:bg-danger/5"
            )}
          >
            {row.original.suspended ? "Unsuspend" : "Suspend"}
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Catalog</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Restaurants</h1>
        <p className="mt-2 text-sm text-text-secondary">Search, review, and control restaurant accounts.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-full max-w-md items-center gap-3 rounded-[16px] border border-border bg-white px-4 py-3">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            className="w-full border-0 bg-transparent text-sm outline-none"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or owner"
            value={query}
          />
        </div>
        <div className="flex gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium transition",
                status === s ? "border-brand bg-brand-light text-brand" : "border-border bg-white text-text-secondary"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="bone-loader h-[520px] rounded-[20px]" />
      ) : isError ? (
        <div className="rounded-[20px] border border-border bg-white p-8 text-center">
          <p className="text-lg font-bold text-text-primary">Could not load restaurants</p>
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} emptyLabel="No restaurants match the current filters." />
      )}

      {selectedId && (
        <RestaurantDetailDrawer
          restaurantId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
