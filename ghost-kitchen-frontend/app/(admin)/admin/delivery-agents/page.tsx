"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Search, Truck, CheckCircle, XCircle } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isAvailable: boolean;
  isOnDuty: boolean;
  isBlocked: boolean;
  isSuspended: boolean;
  vehicleType: string | null;
  vehicleNumber: string | null;
  totalOrders: number;
  deliveredOrders: number;
  createdAt: string;
}

export default function AdminDeliveryAgentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-agents", search, onlineOnly, page],
    queryFn: () =>
      api
        .get("/admin/delivery-agents", {
          params: { search: search || undefined, onlineOnly: onlineOnly || undefined, page, limit: 20 },
        })
        .then((r) => r.data),
    refetchInterval: 15_000,
  });

  const agents: Agent[] = data?.agents ?? [];
  const total: number = data?.total ?? 0;

  const suspendMutation = useMutation({
    mutationFn: ({ id, suspend }: { id: string; suspend: boolean }) =>
      api.patch(`/admin/delivery-agents/${id}/suspend`, { suspend }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["admin-agents"] });
      toast.success(vars.suspend ? "Agent suspended" : "Agent reinstated");
    },
    onError: () => toast.error("Action failed"),
  });

  const onlineCount = agents.filter((a) => a.isAvailable).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Fleet</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Delivery Agents</h1>
        <p className="mt-2 text-sm text-text-secondary">Manage rider availability and performance. Auto-refreshes every 15 s.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total agents", value: total },
          { label: "Online now", value: onlineCount, highlight: true },
          { label: "On duty", value: agents.filter((a) => a.isOnDuty).length },
        ].map((s) => (
          <div key={s.label} className="rounded-[18px] border border-border bg-white p-5">
            <p className="text-sm text-text-muted">{s.label}</p>
            <p className={`mt-2 text-2xl font-bold ${s.highlight ? "text-green-600" : "text-text-primary"}`}>
              {isLoading ? "—" : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or email…"
            className="w-52 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={() => { setOnlineOnly(!onlineOnly); setPage(1); }}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
            onlineOnly
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-border bg-white text-text-secondary hover:border-brand/30"
          }`}
        >
          Online only
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#FAFAFA]">
              <tr>
                {["Agent", "Status", "Vehicle", "Orders", "Delivered", "Joined", "Actions"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted">
                    No delivery agents found.
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{a.name}</p>
                      <p className="text-xs text-text-muted">{a.email}</p>
                      {a.phone && <p className="text-xs text-text-muted">{a.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            a.isAvailable
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${a.isAvailable ? "bg-green-500" : "bg-gray-400"}`} />
                          {a.isAvailable ? "Online" : "Offline"}
                        </span>
                        {a.isSuspended && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            Suspended
                          </span>
                        )}
                        {a.isBlocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                            Blocked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {a.vehicleType ? (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3.5 w-3.5" />
                          {a.vehicleType}
                          {a.vehicleNumber && <span className="text-text-muted">· {a.vehicleNumber}</span>}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{a.totalOrders}</td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-green-700">{a.deliveredOrders}</span>
                      {a.totalOrders > 0 && (
                        <span className="ml-1 text-xs text-text-muted">
                          ({Math.round((a.deliveredOrders / a.totalOrders) * 100)}%)
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                      {new Date(a.createdAt).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      {a.isSuspended ? (
                        <button
                          onClick={() => suspendMutation.mutate({ id: a.id, suspend: false })}
                          disabled={suspendMutation.isPending}
                          className="flex items-center gap-1 rounded-lg border border-green-200 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          <CheckCircle className="h-3 w-3" />
                          Reinstate
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (confirm(`Suspend ${a.name}?`)) suspendMutation.mutate({ id: a.id, suspend: true });
                          }}
                          disabled={suspendMutation.isPending}
                          className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" />
                          Suspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:border-brand/30"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:border-brand/30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
