"use client";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { getAdminUsersData } from "@/lib/opsData";
import { cn } from "@/lib/utils";
import type { UserManagementRow } from "@/types";

const roleTabs = [
  "All",
  "Customers",
  "Restaurant Owners",
  "Delivery Agents",
  "Admins",
] as const;

function roleMatches(tab: (typeof roleTabs)[number], role: UserManagementRow["role"]) {
  if (tab === "All") return true;
  if (tab === "Customers") return role === "Customer";
  if (tab === "Restaurant Owners") return role === "Restaurant Owner";
  if (tab === "Delivery Agents") return role === "Delivery Agent";
  return role === "Admin";
}

export function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<(typeof roleTabs)[number]>("All");

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: getAdminUsersData,
  });

  const data = useMemo(
    () =>
      (usersQuery.data ?? []).filter((user) => roleMatches(activeTab, user.role)),
    [activeTab, usersQuery.data],
  );

  const columns = useMemo<ColumnDef<UserManagementRow>[]>(
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
      { accessorKey: "email", header: "Email" },
      { accessorKey: "phone", header: "Phone" },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <span className="rounded-pill bg-[#F7F7F7] px-2.5 py-1 text-xs font-semibold text-text-primary">
            {row.original.role}
          </span>
        ),
      },
      { accessorKey: "orders", header: "Orders" },
      { accessorKey: "joined", header: "Joined" },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: () => (
          <div className="flex gap-2">
            {["View", "Edit"].map((action) => (
              <button
                className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-text-primary"
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
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
          Identity
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Users</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Browse accounts across customers, owners, riders, and admins.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleTabs.map((tab) => (
          <button
            className={cn(
              "rounded-pill border px-3 py-2 text-sm font-medium transition",
              activeTab === tab
                ? "border-brand bg-brand-light text-brand"
                : "border-border bg-white text-text-secondary",
            )}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {usersQuery.isLoading ? (
        <div className="bone-loader h-[520px] rounded-[20px]" />
      ) : usersQuery.isError ? (
        <div className="rounded-[20px] border border-border bg-white p-8 text-center">
          <p className="text-lg font-bold text-text-primary">Could not load users</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data}
          emptyLabel="No users match the selected role filter."
        />
      )}
    </div>
  );
}
