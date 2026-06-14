"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, ShieldCheck, Clock, Bike, Store, Trophy, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { api } from "@/lib/api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Trend = "UP" | "DOWN" | "STABLE";

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
  escalationCount?: number;
  createdBy?: { name: string } | null;
  createdAt: string;
}
interface IncidentEvent {
  id: string;
  type: string;
  message: string | null;
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
  riderId: string;
  name: string;
  rank: number;
  deliveries: number;
  avgDeliveryMin: number | null;
  distanceKm: number;
  cancellationRate: number;
  onTimeRate: number | null;
  activeHours: number;
  score: number;
  grade: string;
  trend: Trend;
}
interface RestaurantPerf {
  restaurantId: string;
  name: string;
  rank: number;
  rating: number;
  revenuePaise: number;
  orderVolume: number;
  deliveredOrders: number;
  cancellationRate: number;
  avgPrepMin: number | null;
  score: number;
  healthGrade: string;
  trend: Trend;
}

// ── Style maps ─────────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<Severity, string> = {
  LOW: "bg-gray-100 text-gray-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const GRADE_STYLES: Record<string, string> = {
  Elite: "bg-purple-100 text-purple-700",
  Good: "bg-green-100 text-green-700",
  Average: "bg-amber-100 text-amber-700",
  "Needs Improvement": "bg-red-100 text-red-700",
  Excellent: "bg-purple-100 text-purple-700",
  Poor: "bg-red-100 text-red-700",
};

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

// ── Sub-components ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[severity]}`}>{severity}</span>;
}

function GradeBadge({ grade }: { grade: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-700"}`}>
      {grade}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 90 ? "text-purple-700" : score >= 75 ? "text-green-700" : score >= 60 ? "text-amber-700" : "text-red-700";
  return <span className={`font-bold tabular-nums ${color}`}>{score}</span>;
}

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend === "UP") return <span className="flex items-center gap-0.5 text-xs font-semibold text-green-600"><TrendingUp className="h-3 w-3" />UP</span>;
  if (trend === "DOWN") return <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500"><TrendingDown className="h-3 w-3" />DOWN</span>;
  return <span className="flex items-center gap-0.5 text-xs font-semibold text-text-muted"><Minus className="h-3 w-3" />—</span>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function AdminOpsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", severity: "MEDIUM" as Severity });
  const [timelineId, setTimelineId] = useState<string | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<"top" | "bottom">("top");

  // ── Queries ────────────────────────────────────────────────────────────────

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
  const ridersQ = useQuery<{ riders: RiderPerf[]; days: number }>({
    queryKey: ["ops-riders"],
    queryFn: () => api.get("/ops/performance/riders").then((r) => r.data),
  });
  const restaurantsQ = useQuery<{ restaurants: RestaurantPerf[]; days: number }>({
    queryKey: ["ops-restaurants"],
    queryFn: () => api.get("/ops/performance/restaurants").then((r) => r.data),
  });
  const riderLbQ = useQuery<{ riders: RiderPerf[]; total: number; order: string }>({
    queryKey: ["ops-leaderboard-riders", leaderboardTab],
    queryFn: () => api.get(`/ops/leaderboards/riders?order=${leaderboardTab}&limit=10`).then((r) => r.data),
  });
  const restaurantLbQ = useQuery<{ restaurants: RestaurantPerf[]; total: number; order: string }>({
    queryKey: ["ops-leaderboard-restaurants", leaderboardTab],
    queryFn: () => api.get(`/ops/leaderboards/restaurants?order=${leaderboardTab}&limit=10`).then((r) => r.data),
  });

  const timelineQ = useQuery<{ events: IncidentEvent[] }>({
    queryKey: ["ops-incident-events", timelineId],
    queryFn: () => api.get(`/ops/incidents/${timelineId}/events`).then((r) => r.data),
    enabled: timelineId !== null,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ops-incidents"] }); toast.success("Incident resolved"); },
    onError: () => toast.error("Could not resolve incident"),
  });

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.post(`/ops/incidents/${id}/acknowledge`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ops-incidents"] }); toast.success("Incident acknowledged"); },
    onError: () => toast.error("Could not acknowledge incident"),
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const alerts = alertsQ.data?.alerts ?? [];
  const sla = slaQ.data;
  const incidents = incidentsQ.data?.incidents ?? [];
  const riders = ridersQ.data?.riders ?? [];
  const restaurants = restaurantsQ.data?.restaurants ?? [];

  const raiseFromAlert = (a: Alert) =>
    createMutation.mutate({ title: a.message, severity: a.severity, category: a.type, entityType: a.entityType, entityId: a.entityId });

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

      {/* Alerts + Incident center */}
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
                <li key={inc.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={inc.severity} />
                        <span className={`text-[10px] font-bold ${inc.status === "RESOLVED" ? "text-green-600" : "text-text-muted"}`}>{inc.status}</span>
                        {(inc.escalationCount ?? 0) > 0 && (
                          <span className="rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-red-600">↑{inc.escalationCount}</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-text-primary">{inc.title}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {inc.status === "OPEN" && (
                        <button type="button" onClick={() => ackMutation.mutate(inc.id)} disabled={ackMutation.isPending}
                          className="rounded-lg border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                          Acknowledge
                        </button>
                      )}
                      {inc.status !== "RESOLVED" && (
                        <button type="button" onClick={() => resolveMutation.mutate(inc.id)} disabled={resolveMutation.isPending}
                          className="rounded-lg border border-green-200 px-2 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50">
                          Resolve
                        </button>
                      )}
                      <button type="button" onClick={() => setTimelineId((cur) => (cur === inc.id ? null : inc.id))}
                        className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-text-secondary hover:border-brand/40">
                        {timelineId === inc.id ? "Hide" : "Timeline"}
                      </button>
                    </div>
                  </div>
                  {timelineId === inc.id && (
                    <ol className="mt-2 space-y-1 border-t border-border pt-2" aria-label="Incident timeline">
                      {timelineQ.isLoading ? (
                        <li className="text-xs text-text-muted">Loading timeline…</li>
                      ) : (timelineQ.data?.events ?? []).length === 0 ? (
                        <li className="text-xs text-text-muted">No events.</li>
                      ) : (
                        (timelineQ.data?.events ?? []).map((ev) => (
                          <li key={ev.id} className="flex gap-2 text-xs">
                            <span className="font-mono text-text-muted">{new Date(ev.createdAt).toLocaleTimeString("en-IN")}</span>
                            <span className="font-semibold text-text-secondary">{ev.type}</span>
                            <span className="text-text-muted">{ev.message}</span>
                          </li>
                        ))
                      )}
                    </ol>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Leaderboards */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            <Trophy className="h-5 w-5 text-amber-500" /> Leaderboards (7 days)
          </h2>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {(["top", "bottom"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setLeaderboardTab(t)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${leaderboardTab === t ? "bg-brand text-white" : "text-text-secondary hover:text-text-primary"}`}
              >
                {t === "top" ? "Top performers" : "Needs attention"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {/* Rider leaderboard */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Riders</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Rider</th>
                  <th className="px-2 py-1">Score</th>
                  <th className="px-2 py-1">Grade</th>
                  <th className="px-2 py-1">Trend</th>
                  <th className="px-2 py-1">Deliveries</th>
                </tr>
              </thead>
              <tbody>
                {riderLbQ.isLoading ? (
                  <tr><td colSpan={6} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (riderLbQ.data?.riders ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="py-4 text-center text-xs text-text-muted">No data.</td></tr>
                ) : (
                  (riderLbQ.data?.riders ?? []).map((r, i) => (
                    <tr key={r.riderId} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-text-primary">{r.name}</td>
                      <td className="px-2 py-1.5"><ScorePill score={r.score} /></td>
                      <td className="px-2 py-1.5"><GradeBadge grade={r.grade} /></td>
                      <td className="px-2 py-1.5"><TrendBadge trend={r.trend} /></td>
                      <td className="px-2 py-1.5 text-text-secondary">{r.deliveries}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Restaurant leaderboard */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Restaurants</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-1">#</th>
                  <th className="px-2 py-1">Restaurant</th>
                  <th className="px-2 py-1">Score</th>
                  <th className="px-2 py-1">Grade</th>
                  <th className="px-2 py-1">Trend</th>
                  <th className="px-2 py-1">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {restaurantLbQ.isLoading ? (
                  <tr><td colSpan={6} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (restaurantLbQ.data?.restaurants ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="py-4 text-center text-xs text-text-muted">No data.</td></tr>
                ) : (
                  (restaurantLbQ.data?.restaurants ?? []).map((r, i) => (
                    <tr key={r.restaurantId} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-text-primary">{r.name}</td>
                      <td className="px-2 py-1.5"><ScorePill score={r.score} /></td>
                      <td className="px-2 py-1.5"><GradeBadge grade={r.healthGrade} /></td>
                      <td className="px-2 py-1.5"><TrendBadge trend={r.trend} /></td>
                      <td className="px-2 py-1.5 font-semibold text-text-primary">{rupees(r.revenuePaise)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Rider performance full table */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Bike className="h-5 w-5" /> Rider performance (7 days)
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                {["#", "Rider", "Score", "Grade", "Trend", "Deliveries", "On-time", "Avg time", "Active hrs", "Cancel rate"].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riders.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-text-muted">No data.</td></tr>
              ) : (
                riders.map((r) => (
                  <tr key={r.riderId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs font-mono text-text-muted">{r.rank}</td>
                    <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                    <td className="px-3 py-2"><ScorePill score={r.score} /></td>
                    <td className="px-3 py-2"><GradeBadge grade={r.grade} /></td>
                    <td className="px-3 py-2"><TrendBadge trend={r.trend} /></td>
                    <td className="px-3 py-2">{r.deliveries}</td>
                    <td className="px-3 py-2">{r.onTimeRate != null ? `${r.onTimeRate}%` : "—"}</td>
                    <td className="px-3 py-2">{r.avgDeliveryMin != null ? `${r.avgDeliveryMin}m` : "—"}</td>
                    <td className="px-3 py-2">{r.activeHours}h</td>
                    <td className="px-3 py-2">{r.cancellationRate}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Restaurant performance full table */}
      <section className="rounded-2xl border border-border bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
          <Store className="h-5 w-5" /> Restaurant performance (7 days)
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                {["#", "Restaurant", "Score", "Grade", "Trend", "Revenue", "Orders", "Cancel rate", "Avg prep", "Rating"].map((h) => (
                  <th key={h} className="px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restaurants.length === 0 ? (
                <tr><td colSpan={10} className="py-6 text-center text-text-muted">No data.</td></tr>
              ) : (
                restaurants.map((r) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-xs font-mono text-text-muted">{r.rank}</td>
                    <td className="px-3 py-2 font-medium text-text-primary">{r.name}</td>
                    <td className="px-3 py-2"><ScorePill score={r.score} /></td>
                    <td className="px-3 py-2"><GradeBadge grade={r.healthGrade} /></td>
                    <td className="px-3 py-2"><TrendBadge trend={r.trend} /></td>
                    <td className="px-3 py-2 font-semibold">{rupees(r.revenuePaise)}</td>
                    <td className="px-3 py-2">{r.orderVolume}</td>
                    <td className="px-3 py-2">{r.cancellationRate}%</td>
                    <td className="px-3 py-2">{r.avgPrepMin != null ? `${r.avgPrepMin}m` : "—"}</td>
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
