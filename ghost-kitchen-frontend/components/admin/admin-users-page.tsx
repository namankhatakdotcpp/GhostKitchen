"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { UserManagementRow } from "@/types";

const roleTabs = ["All", "Customers", "Restaurant Owners", "Delivery Agents", "Admins"] as const;

function toDisplayRole(activeRole: string): UserManagementRow["role"] {
  if (activeRole === "ADMIN")       return "Admin";
  if (activeRole === "RESTAURANT")  return "Restaurant Owner";
  if (activeRole === "DELIVERY")    return "Delivery Agent";
  return "Customer";
}

function roleMatches(tab: (typeof roleTabs)[number], role: UserManagementRow["role"]) {
  if (tab === "All")               return true;
  if (tab === "Customers")         return role === "Customer";
  if (tab === "Restaurant Owners") return role === "Restaurant Owner";
  if (tab === "Delivery Agents")   return role === "Delivery Agent";
  return role === "Admin";
}

async function fetchUsers(): Promise<UserManagementRow[]> {
  const { data } = await api.get("/admin/users", { params: { limit: 100 } });
  return (data.users ?? []).map((u: any): UserManagementRow => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "—",
    role: toDisplayRole(u.activeRole),
    orders: 0,
    joined: new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  }));
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof roleTabs)[number]>("All");

  const { data: allUsers = [], isLoading, isError } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });

  const filtered = useMemo(
    () => allUsers.filter((u) => roleMatches(activeTab, u.role)),
    [activeTab, allUsers],
  );

  async function handleMakeAdmin(id: string, name: string) {
    if (!confirm(`Promote ${name} to Admin?`)) return;
    try {
      await api.patch(`/admin/users/${id}/role`, {
        roles: ["CUSTOMER", "ADMIN"],
        activeRole: "ADMIN",
      });
      toast.success(`${name} is now an Admin`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Failed");
    }
  }

  const columns = useMemo<ColumnDef<UserManagementRow>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <div className="font-semibold text-text-primary">{row.original.name}</div>
          <div className="mt-0.5 text-xs text-text-secondary">{row.original.email}</div>
        </div>
      ),
    },
    { accessorKey: "phone",  header: "Phone" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className="rounded-full bg-[#F7F7F7] px-2.5 py-1 text-xs font-semibold text-text-primary">
          {row.original.role}
        </span>
      ),
    },
    { accessorKey: "joined", header: "Joined" },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-2">
          {row.original.role !== "Admin" && (
            <button
              type="button"
              onClick={() => handleMakeAdmin(row.original.id, row.original.name)}
              className="rounded-full border border-brand/30 px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-light transition"
            >
              Make Admin
            </button>
          )}
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Identity</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Users</h1>
        <p className="mt-2 text-sm text-text-secondary">Browse accounts across customers, owners, riders, and admins.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium transition",
              activeTab === tab ? "border-brand bg-brand-light text-brand" : "border-border bg-white text-text-secondary"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="bone-loader h-[520px] rounded-[20px]" />
      ) : isError ? (
        <div className="rounded-[20px] border border-border bg-white p-8 text-center">
          <p className="text-lg font-bold text-text-primary">Could not load users</p>
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} emptyLabel="No users match the selected filter." />
      )}
    </div>
  );
}
