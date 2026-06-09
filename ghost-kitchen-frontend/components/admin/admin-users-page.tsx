"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Plus, Shield, ShieldOff, Trash2, UserCheck, UserMinus, UserX, X } from "lucide-react";
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
    isSuspended: u.isSuspended ?? false,
    joined: new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  }));
}

const ROLE_OPTIONS = ["CUSTOMER", "RESTAURANT", "DELIVERY", "ADMIN"] as const;

function UserActionModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [selectedRole, setSelectedRole] = useState<string>(user.activeRole);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localUser, setLocalUser] = useState(user);

  async function call(fn: () => Promise<any>) {
    setLoading(true);
    try { await fn(); } catch (e: any) { toast.error(e.error ?? "Failed"); }
    finally { setLoading(false); }
  }

  async function handleBlock() {
    await call(async () => {
      const { data } = await api.patch(`/admin/users/${localUser.id}/block`, { block: !localUser.isBlocked });
      toast.success(localUser.isBlocked ? `${localUser.name} unblocked` : `${localUser.name} blocked`);
      setLocalUser((u: any) => ({ ...u, isBlocked: data.user?.isBlocked ?? !u.isBlocked }));
      onDone();
    });
  }

  async function handleSuspend() {
    await call(async () => {
      const nowSuspended = !localUser.isSuspended;
      await api.patch(`/admin/users/${localUser.id}/suspend`, { suspend: nowSuspended });
      toast.success(nowSuspended ? `${localUser.name} suspended` : `${localUser.name} reinstated`);
      setLocalUser((u: any) => ({ ...u, isSuspended: nowSuspended }));
      onDone();
    });
  }

  async function handleRoleChange() {
    if (selectedRole === localUser.activeRole) return;
    await call(async () => {
      await api.patch(`/admin/users/${localUser.id}/change-role`, { role: selectedRole });
      toast.success(`${localUser.name}'s active role set to ${selectedRole}`);
      setLocalUser((u: any) => ({ ...u, activeRole: selectedRole }));
      onDone();
    });
  }

  async function handleGrantRole(role: string) {
    await call(async () => {
      const { data } = await api.post(`/admin/users/${localUser.id}/grant-role`, { role });
      toast.success(`${role} role granted to ${localUser.name}`);
      setLocalUser((u: any) => ({ ...u, roles: data.user?.roles ?? [...u.roles, role] }));
      onDone();
    });
  }

  async function handleRevokeRole(role: string) {
    await call(async () => {
      const { data } = await api.post(`/admin/users/${localUser.id}/revoke-role`, { role });
      toast.success(`${role} role revoked from ${localUser.name}`);
      setLocalUser((u: any) => ({ ...u, roles: data.user?.roles ?? u.roles.filter((r: string) => r !== role) }));
      onDone();
    });
  }

  async function handleDelete() {
    await call(async () => {
      await api.delete(`/admin/users/${localUser.id}`);
      toast.success(`${localUser.name} deleted`);
      onDone();
    });
  }

  const grantableRoles = ROLE_OPTIONS.filter((r) => !localUser.roles.includes(r));
  const revocableRoles = localUser.roles.filter((r: string) => r !== "ADMIN");

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-bold text-[#111827] text-lg">{localUser.name}</h3>
            <p className="text-sm text-[#6B7280]">{localUser.email}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-[#F5F5F5]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-5">
          {/* Current roles */}
          <div className="rounded-xl bg-[#F9FAFB] p-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Current roles</p>
            <div className="flex flex-wrap gap-1.5">
              {localUser.roles.map((r: string) => (
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

          {/* Account access */}
          <div>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Account access</p>
            <div className="space-y-2">
              <button
                onClick={handleBlock}
                disabled={loading}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                  localUser.isBlocked
                    ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                    : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                )}
              >
                {localUser.isBlocked ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                {localUser.isBlocked ? "Unblock account" : "Block account"}
              </button>
              <button
                onClick={handleSuspend}
                disabled={loading}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition",
                  localUser.isSuspended
                    ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                )}
              >
                <UserMinus className="h-4 w-4" />
                {localUser.isSuspended ? "Reinstate account" : "Suspend account"}
              </button>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Permissions</p>
            <div className="space-y-2">
              {!localUser.roles.includes("ADMIN") && (
                <button
                  onClick={() => handleGrantRole("ADMIN")}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-xl border border-[#FF5200]/30 bg-[#FFF3EE] px-4 py-3 text-sm font-semibold text-[#FF5200] transition hover:bg-[#FFE8DC]"
                >
                  <Shield className="h-4 w-4" />
                  Grant admin access
                </button>
              )}
              {localUser.roles.includes("ADMIN") && (
                <button
                  onClick={() => handleRevokeRole("ADMIN")}
                  disabled={loading}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-100"
                >
                  <ShieldOff className="h-4 w-4" />
                  Revoke admin access
                </button>
              )}
            </div>
          </div>

          {/* Grant roles */}
          {grantableRoles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Grant roles</p>
              <div className="grid grid-cols-2 gap-2">
                {grantableRoles.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleGrantRole(r)}
                    disabled={loading}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#374151] hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 transition disabled:opacity-50"
                  >
                    <Plus className="h-3 w-3" />{r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Revoke roles */}
          {revocableRoles.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Revoke roles</p>
              <div className="grid grid-cols-2 gap-2">
                {revocableRoles.map((r: string) => (
                  <button
                    key={r}
                    onClick={() => handleRevokeRole(r)}
                    disabled={loading}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs font-semibold text-[#374151] hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                  >
                    <UserX className="h-3 w-3" />{r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Switch active role */}
          <div>
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Switch active role</p>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.filter((r) => localUser.roles.includes(r)).map((r) => (
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
            {selectedRole !== localUser.activeRole && (
              <button
                onClick={handleRoleChange}
                disabled={loading}
                className="mt-2 w-full rounded-xl bg-[#FF5200] py-2.5 text-xs font-bold text-white hover:bg-[#E84800] transition disabled:opacity-50"
              >
                Set active role to {selectedRole}
              </button>
            )}
          </div>

          {/* Danger zone */}
          <div className="border-t border-[#F3F4F6] pt-4">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Danger zone</p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={loading}
                className="flex w-full items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 transition"
              >
                <Trash2 className="h-4 w-4" />
                Delete account permanently
              </button>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <p className="text-xs font-semibold text-red-700">This cannot be undone. Delete {localUser.name}?</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-[#E5E7EB] bg-white py-2 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]">Cancel</button>
                  <button onClick={handleDelete} disabled={loading} className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">Yes, delete</button>
                </div>
              </div>
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
              {row.original.isSuspended && (
                <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600">SUSPENDED</span>
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
