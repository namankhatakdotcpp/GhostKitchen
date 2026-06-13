"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, ShieldCheck, Clock, Bike, Store } from "lucide-react";

import { api } from "@/lib/api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Alert {
  type: string;
  severity: Severity;
  entityType: string;
  entityId: string;
  message: string;
}
interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  category: string | null;
  createdBy?: { name: string } | null;
  createdAt: string;
}
interface Sla {
  measuredOrders: number;
  onTime: number;
  delayed: number;
  onTimeRate: number | null;
  avgLatenessMin: number;
}
interface RiderPerf {
  riderId: string; name: string; deliveries: number; avgDeliveryMin: number | null; distanceKm: number; cancellationRate: number;
}
interface RestaurantPerf {
  restaurantId: string; name: string; rating: number; revenuePaise: number; orderVolume: number; deliveredOrders: number;
}

const SEVERITY_STYLES: Record<Severity, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[severity]}`}>{severity}</span>;
}

export function AdminOpsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", severity: "MEDIUM" as Severity });

  const alertsQ = useQuery<{ alerts: Alert[] }>({
    queryKey: ["ops-alerts"],
    queryFn: () => api.get("/ops/alerts").then((r) => r.data),
    refetchInterval: 30_000,
  });
  const slaQ = useQuery<Sla & { days: number }>({
    queryKey: ["ops-sla"],
    queryFn: () => api.get("/ops/sla").then((r) => r.data),
    refetchInterval: 60_000,
  });
  const incidentsQ = useQuery<{ incidents: Incident[] }>({
    queryKey: ["ops-incidents"],
    queryFn: () => api.get("/ops/incidents").then((r) => r.data),
  });
  const ridersQ = useQuery<{ riders: RiderPerf[] }>({
    queryKey: ["ops-riders"],
    queryFn: () => api.get("/ops/performance/riders").then((r) => r.data),
  });
  const restaurantsQ = useQuery<{ restaurants: RestaurantPerf[] }>({
    queryKey: ["ops-restaurants"],
    queryFn: () => api.get("/ops/performance/restaurants").then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: { title: string; description?: string; severity: Severity; category?: string; entityType?: string; entityId?: string }) =>
      api.post("/ops/incidents", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-incidents"] });
      setForm({ title: "", description: "", severity: "MEDIUM" });
      toast.success("Incident created");
    },
    onError: () => toast.error("Could not create incident"),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ops/incidents/${id}/resolve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-incidents"] });
      toast.success("Incident resolved");
    },
    onError: () => toast.error("Could not resolve incident"),
  });

  const alerts = alertsQ.data?.alerts ?? [];
  const sla = slaQ.data;
  const incidents = incidentsQ.data?.incidents ?? [];
  const riders = ridersQ.data?.riders ?? [];
  const restaurants = restaurantsQ.data?.restaurants ?? [];

  const raiseFromAlert = (a: Alert) =>
    createMutation.mutate({
      title: a.message,
      severity: a.severity,
      category: a.type,
      entityType: a.entityType,
      entityId: a.entityId,
    });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Operations</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Operations Intelligence</h1>
        <p className="mt-1 text-sm text-text-secondary">Live fleet alerts, SLA monitoring, incidents and performance. Alerts refresh every 30s.</p>
      </div>

      {/* SLA summary */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "On-time rate", value: sla?.onTimeRate != null ? `${sla.onTimeRate}%` : "—", icon: ShieldCheck, highlight: true },
          { label: "Delayed orders", value: sla?.delayed ?? "—", icon: Clock },
          { label: "Avg lateness", value: sla ? `${sla.avgLatenessMin}m` : "—", icon: Clock },
          { label: "Measured orders", value: sla?.measuredOrders ?? "—", icon: ShieldCheck },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-white px-4 py-3">
            <p className="text-xs text-text-muted">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.highlight ? "text-green-600" : "text-text-primary"}`}>
              {slaQ.isLoading ? "—" : s.value}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fleet alerts */}
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Fleet alerts ({alerts.length})
          </h2>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto" aria-label="Fleet alerts">
            {alerts.length === 0 ? (
              <li className="py-8 text-center text-sm text-text-muted">No active alerts. Fleet is healthy.</li>
            ) : (
              alerts.map((a, i) => (
                <li key={`${a.type}-${a.entityId}-${i}`} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <SeverityBadge severity={a.severity} />
                    <p className="mt-1 text-sm text-text-secondary">{a.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => raiseFromAlert(a)}
                    disabled={createMutation.isPending}
                    className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary hover:border-brand/40 disabled:opacity-50"
                  >
                    Raise incident
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Incident center */}
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-text-primary">Incident Center</h2>
          <form
            className="mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title.trim()) { toast.error("Title is required"); return; }
              createMutation.mutate({ title: form.title, description: form.description || undefined, severity: form.severity });
            }}
          >
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Incident title"
              aria-label="Incident title"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <div className="flex gap-2">
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))}
                aria-label="Severity"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              >
                {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as Severity[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex-1 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Create incident
              </button>
            </div>
          </form>

          <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto" aria-label="Incidents">
            {incidents.length === 0 ? (
              <li className="py-6 text-center text-sm text-text-muted">No incidents.</li>
            ) : (
              incidents.map((inc) => (
                <li key={inc.id} className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={inc.severity} />
                      <span className={`text-[10px] font-bold ${inc.status === "RESOLVED" ? "text-green-600" : "text-text-muted"}`}>{inc.status}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-text-primary">{inc.title}</p>
                  </div>
                  {inc.status !== "RESOLVED" && (
                    <button
                      type="button"
                      onClick={() => resolveMutation.mutate(inc.id)}
                      disabled={resolveMutation.isPending}
                      className="shrink-0 rounded-lg border border-green-200 px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Rider performance */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary"><Bike className="h-5 w-5" /> Rider performance (7 days)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>{["Rider", "Deliveries", "Avg time", "Distance", "Cancel rate"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-text-muted">No data.</td></tr>
              ) : (
                riders.map((r) => (
                  <tr key={r.riderId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                    <td className="px-3 py-2">{r.deliveries}</td>
                    <td className="px-3 py-2">{r.avgDeliveryMin != null ? `${r.avgDeliveryMin}m` : "—"}</td>
                    <td className="px-3 py-2">{r.distanceKm} km</td>
                    <td className="px-3 py-2">{r.cancellationRate}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Restaurant performance */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary"><Store className="h-5 w-5" /> Restaurant performance (7 days)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>{["Restaurant", "Revenue", "Orders", "Delivered", "Rating"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {restaurants.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-text-muted">No data.</td></tr>
              ) : (
                restaurants.map((r) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                    <td className="px-3 py-2 font-semibold">{rupees(r.revenuePaise)}</td>
                    <td className="px-3 py-2">{r.orderVolume}</td>
                    <td className="px-3 py-2">{r.deliveredOrders}</td>
                    <td className="px-3 py-2">{r.rating.toFixed(1)} ★</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
