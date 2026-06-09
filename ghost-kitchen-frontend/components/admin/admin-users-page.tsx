"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Shield, ShieldOff, UserCheck, UserX, X } from "lucide-react";
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

async function fetchUsers() {
  const { data } = await api.get("/admin/users", { params: { limit: 100 } });
  return (data.users ?? []).map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? "—",
    role: toDisplayRole(u.activeRole),
    activeRole: u.activeRole,
    roles: u.roles ?? [],
    isBlocked: u.isBlocked ?? false,
    joined: new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  }));
}

const ROLE_OPTIONS = ["CUSTOMER", "RESTAURANT", "DELIVERY", "ADMIN"] as const;

function UserActionModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [selectedRole, setSelectedRole] = useState<string>(user.activeRole);
  const [loading, setLoading] = useState(false);

  async function handleBlock() {
    setLoading(true);
    try {
      await api.patch(`/admin/users/${user.id}/block`, { block: !user.isBlocked });
      toast.success(user.isBlocked ? `${user.name} unblocked` : `${user.name} blocked`);
      onDone();
    } catch (e: any) {
      toast.error(e.error ?? "Failed");
    } finally { setLoading(false); }
  }

  async function handleRoleChange() {
    if (selectedRole === user.activeRole) return;
    setLoading(true);
    try {
      await api.patch(`/admin/users/${user.id}/change-role`, { role: selectedRole });
      toast.success(`${user.name}'s role set to ${selectedRole}`);
      onDone();
    } catch (e: any) {
      toast.error(e.error ?? "Failed");
    } finally { setLoading(false); }
  }

  async function handleMakeAdmin() {
    setLoading(true);
    try {
      await api.patch(`/admin/users/${user.id}/role`, { roles: [...new Set([...user.roles, "ADMIN"])], activeRole: "ADMIN" });
      toast.success(`${user.name} is now an Admin`);
      onDone();
    } catch (e: any) {
      toast.error(e.error ?? "Failed");
    } finally { setLoading(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-[#111827] text-lg">{user.name}</h3>
            <p className="text-sm text-[#6B7280]">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          {/* Current roles */}
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Current roles</p>
            <div className="flex flex-wrap gap-1.5">
              {user.roles.map((r: string) => (
                <span key={r} className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  r === "ADMIN" ? "bg-[#0C0C0E] text-white" :
                  r === "RESTAURANT" ? "bg-teal-100 text-teal-700" :
                  r === "DELIVERY" ? "bg-blue-100 text-blue-700" :
                  "bg-[#F3F4F6] text-[#374151]"
                )}>{r}</span>
              ))}
            </div>
          </div>

          {/* Block/Unblock */}
          <div>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Account access</p>
            <button
              onClick={handleBlock}
              disabled={loading}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                user.isBlocked
                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              )}
            >
              {user.isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
              {user.isBlocked ? "Unblock account" : "Block account"}
            </button>
          </div>

          {/* Grant Admin */}
          {!user.roles.includes("ADMIN") && (
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Permissions</p>
              <button
                onClick={handleMakeAdmin}
                disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl border border-[#FF5200]/30 bg-[#FFF3EE] px-4 py-3 text-sm font-semibold text-[#FF5200] transition hover:bg-[#FFE8DC]"
              >
                <Shield className="h-4 w-4" />
                Grant admin access
              </button>
            </div>
          )}
          {user.roles.includes("ADMIN") && user.activeRole === "ADMIN" && (
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Permissions</p>
              <button
                onClick={async () => {
                  setLoading(true);
                  try {
                    const newRoles = user.roles.filter((r: string) => r !== "ADMIN");
                    await api.patch(`/admin/users/${user.id}/role`, { roles: newRoles.length ? newRoles : ["CUSTOMER"], activeRole: "CUSTOMER" });
                    toast.success(`Admin access revoked from ${user.name}`);
                    onDone();
                  } catch (e: any) { toast.error(e.error ?? "Failed"); }
                  finally { setLoading(false); }
                }}
                disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
              >
                <ShieldOff className="h-4 w-4" />
                Revoke admin access
              </button>
            </div>
          )}

          {/* Set active role */}
          <div>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Switch active role</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.filter((r) => user.roles.includes(r)).map((r) => (
                <button
                  key={r}
                  onClick={() => setSelectedRole(r)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                    selectedRole === r ? "border-[#FF5200] bg-[#FFF3EE] text-[#FF5200]" : "border-[#E5E7EB] text-[#6B7280] hover:border-[#FF5200]"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            {selectedRole !== user.activeRole && (
              <button
                onClick={handleRoleChange}
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-[#FF5200] py-2.5 text-xs font-bold text-white hover:bg-[#E84800] transition disabled:opacity-50"
              >
                Set active role to {selectedRole}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<(typeof roleTabs)[number]>("All");
  const [actionUser, setActionUser] = useState<any | null>(null);

  const { data: allUsers = [], isLoading, isError } = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchUsers,
  });

  const filtered = useMemo(
    () => allUsers.filter((u: any) => roleMatches(activeTab, u.role)),
    [activeTab, allUsers],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    setActionUser(null);
  }

  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            row.original.isBlocked ? "bg-red-100 text-red-600" : "bg-[#FFF3EE] text-[#FF5200]"
          )}>
            {row.original.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-[#111827]">{row.original.name}</span>
              {row.original.isBlocked && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">BLOCKED</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-[#6B7280]">{row.original.email}</div>
          </div>
        </div>
      ),
    },
    { accessorKey: "phone", header: "Phone" },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <span className={cn(
          "rounded-full px-2.5 py-1 text-xs font-semibold",
          row.original.activeRole === "ADMIN"      ? "bg-[#0C0C0E] text-white" :
          row.original.activeRole === "RESTAURANT" ? "bg-teal-100 text-teal-700" :
          row.original.activeRole === "DELIVERY"   ? "bg-blue-100 text-blue-700" :
          "bg-[#F3F4F6] text-[#374151]"
        )}>
          {row.original.role}
        </span>
      ),
    },
    { accessorKey: "joined", header: "Joined" },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setActionUser(row.original)}
          className="rounded-full border border-[#E5E7EB] px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#FF5200] hover:text-[#FF5200] transition"
        >
          Manage
        </button>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">Identity</p>
        <h1 className="mt-2 text-3xl font-bold text-[#111827]">Users</h1>
        <p className="mt-2 text-sm text-[#6B7280]">Browse accounts across customers, owners, riders, and admins.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium transition",
              activeTab === tab ? "border-[#FF5200] bg-[#FFF3EE] text-[#FF5200]" : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#FF5200]"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-[520px] animate-pulse rounded-2xl bg-[#F9FAFB]" />
      ) : isError ? (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
          <p className="text-lg font-bold text-[#111827]">Could not load users</p>
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} emptyLabel="No users match the selected filter." />
      )}

      <AnimatePresence>
        {actionUser && (
          <UserActionModal user={actionUser} onClose={() => setActionUser(null)} onDone={refresh} />
        )}
      </AnimatePresence>
    </div>
  );
}
