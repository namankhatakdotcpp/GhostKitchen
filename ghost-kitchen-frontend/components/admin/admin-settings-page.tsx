"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Bell, Globe, Lock, Shield, Store, Truck, CheckCircle, Calendar, Clock, X } from "lucide-react";

import { useAuthStore } from "@/store/authStore";
import { useConfigStore } from "@/store/configStore";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-4 border-b border-[#F3F4F6] last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#111827]">{label}</p>
        {description && <p className="mt-0.5 text-xs text-[#6B7280]">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50",
        enabled ? "bg-[#FF5200]" : "bg-[#D1D5DB]"
      )}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", enabled ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

function NumInput({ value, onChange, min, max, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; disabled?: boolean }) {
  return (
    <input type="number" min={min} max={max} value={value}
      onChange={(e) => onChange(+e.target.value)}
      disabled={disabled}
      className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none disabled:opacity-50" />
  );
}

const SECTIONS = [
  { id: "platform",      label: "Platform",           icon: Globe },
  { id: "orders",        label: "Orders & Delivery",  icon: Truck },
  { id: "restaurants",   label: "Restaurants",        icon: Store },
  { id: "security",      label: "Security",           icon: Shield },
  { id: "notifications", label: "Notifications",      icon: Bell },
  { id: "access",        label: "Access Control",     icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

async function fetchSettings() {
  const { data } = await api.get("/admin/settings");
  return data.settings;
}

async function saveSettings(body: Record<string, unknown>) {
  const { data } = await api.patch("/admin/settings", body);
  return data.settings;
}

export function AdminSettingsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setGlobalConfig = useConfigStore((s) => s.setConfig);
  const [active, setActive] = useState<SectionId>("platform");
  const [scheduleDate, setScheduleDate] = useState("");
  const [durationMin, setDurationMin] = useState<number | "custom">(60);
  const [customEndDate, setCustomEndDate] = useState("");

  const { data: remote, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: fetchSettings,
  });

  // Local working copy — initialised from remote once loaded
  const [local, setLocal] = useState<Record<string, any>>({});
  useEffect(() => {
    if (remote) setLocal(remote);
  }, [remote]);

  const mutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["admin-settings"], saved);
      setLocal(saved);
      // Propagate to the in-app config store so maintenance mode etc. takes effect immediately
      setGlobalConfig(saved);
      toast.success("Settings saved", { icon: "✓" });
    },
    onError: (e: any) => toast.error(e.error ?? "Failed to save settings"),
  });

  function set(key: string, value: any) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    mutation.mutate(local);
  }

  function handleScheduleMaintenance() {
    if (!scheduleDate) return;
    const startMs = new Date(scheduleDate).getTime();
    const scheduledAt = new Date(scheduleDate).toISOString();
    const endsAt =
      durationMin !== "custom"
        ? new Date(startMs + durationMin * 60_000).toISOString()
        : customEndDate
        ? new Date(customEndDate).toISOString()
        : null;
    mutation.mutate({ maintenanceScheduledAt: scheduledAt, maintenanceEndsAt: endsAt });
  }

  function handleCancelScheduled() {
    mutation.mutate({ maintenanceScheduledAt: null, maintenanceEndsAt: null });
  }

  function handleSetImmediateEnd(value: string) {
    set("maintenanceEndsAt", value ? new Date(value).toISOString() : null);
  }

  function isoToLocal(iso: string | null | undefined) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const saving = mutation.isPending;
  const dirty = remote ? JSON.stringify(local) !== JSON.stringify(remote) : false;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">Configuration</p>
          <h1 className="mt-2 text-3xl font-bold text-[#111827]">Settings</h1>
        </div>
        <div className="h-[400px] animate-pulse rounded-2xl bg-[#F9FAFB]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">Configuration</p>
          <h1 className="mt-2 text-3xl font-bold text-[#111827]">Settings</h1>
          <p className="mt-2 text-sm text-[#6B7280]">Manage platform-wide configuration, policies, and operational defaults.</p>
        </div>
        {local.maintenanceMode && (
          <div className="flex items-center gap-2 rounded-full bg-yellow-100 border border-yellow-300 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="text-xs font-bold text-yellow-700">MAINTENANCE MODE ON</span>
          </div>
        )}
      </div>

      <div className="flex gap-6">
        <aside className="w-48 shrink-0">
          <nav className="space-y-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActive(id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active === id ? "bg-[#FFF3EE] text-[#FF5200]" : "text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">

            {active === "platform" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Platform</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Global switches that affect all users and restaurants. Changes take effect immediately.</p>

                <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-xs font-semibold text-yellow-800">⚠️ Maintenance mode blocks all non-admin API calls (cached for 30s on server). Admins always bypass. Notifies all users on activation.</p>
                </div>

                {/* Upcoming scheduled window */}
                {local.maintenanceScheduledAt && !local.maintenanceMode && (
                  <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-blue-800">Maintenance scheduled</p>
                        <p className="text-xs text-blue-700 mt-0.5">
                          Starts: {new Date(local.maintenanceScheduledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                        </p>
                        {local.maintenanceEndsAt && (
                          <p className="text-xs text-blue-700">
                            Ends: {new Date(local.maintenanceEndsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelScheduled}
                      disabled={saving}
                      className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                )}

                {/* Immediate maintenance toggle */}
                <SettingRow label="Maintenance mode" description="Takes the platform offline for all non-admin users now">
                  <Toggle enabled={local.maintenanceMode ?? false} onToggle={() => { set("maintenanceMode", !local.maintenanceMode); if (local.maintenanceMode) { set("maintenanceEndsAt", null); } }} />
                </SettingRow>

                {/* Active maintenance config */}
                {local.maintenanceMode && (
                  <>
                    <SettingRow label="Reason" description="Shown to users on the maintenance page">
                      <input
                        type="text"
                        value={local.maintenanceReason ?? ""}
                        onChange={(e) => set("maintenanceReason", e.target.value || null)}
                        placeholder="e.g. Scheduled upgrade — back in 2 hours"
                        className="w-72 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#FF5200] focus:outline-none"
                      />
                    </SettingRow>
                    <SettingRow label="Expected end time" description="Optional — shows a countdown on the maintenance page">
                      <input
                        type="datetime-local"
                        value={isoToLocal(local.maintenanceEndsAt)}
                        onChange={(e) => handleSetImmediateEnd(e.target.value)}
                        className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#FF5200] focus:outline-none"
                      />
                    </SettingRow>
                  </>
                )}

                {/* Schedule future maintenance */}
                {!local.maintenanceMode && (
                  <div className="mt-5 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-[#6B7280]" />
                      <p className="text-sm font-bold text-[#374151]">Schedule maintenance</p>
                    </div>
                    <p className="text-xs text-[#9CA3AF]">Set a future start time and duration. The platform will activate maintenance automatically and notify all users.</p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-[#374151] mb-1 block">Start date &amp; time</label>
                        <input
                          type="datetime-local"
                          value={scheduleDate}
                          min={isoToLocal(new Date().toISOString())}
                          onChange={(e) => setScheduleDate(e.target.value)}
                          className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#FF5200] focus:outline-none bg-white w-full"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[#374151] mb-1 block">Duration</label>
                        <div className="flex flex-wrap gap-2">
                          {([30, 60, 120, 240] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setDurationMin(m)}
                              className={cn(
                                "rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                                durationMin === m ? "border-[#FF5200] bg-[#FFF3EE] text-[#FF5200]" : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#FF5200]"
                              )}
                            >
                              {m < 60 ? `${m}m` : `${m / 60}h`}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setDurationMin("custom")}
                            className={cn(
                              "rounded-xl border px-3 py-1.5 text-xs font-bold transition",
                              durationMin === "custom" ? "border-[#FF5200] bg-[#FFF3EE] text-[#FF5200]" : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#FF5200]"
                            )}
                          >
                            Custom
                          </button>
                        </div>
                        {durationMin === "custom" && (
                          <div className="mt-2">
                            <label className="text-xs font-semibold text-[#374151] mb-1 block">End date &amp; time</label>
                            <input
                              type="datetime-local"
                              value={customEndDate}
                              min={scheduleDate || isoToLocal(new Date().toISOString())}
                              onChange={(e) => setCustomEndDate(e.target.value)}
                              className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#FF5200] focus:outline-none bg-white w-full"
                            />
                          </div>
                        )}
                        {durationMin !== "custom" && scheduleDate && (
                          <p className="mt-1.5 text-xs text-[#9CA3AF]">
                            Ends at {new Date(new Date(scheduleDate).getTime() + durationMin * 60_000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-[#374151] mb-1 block">Reason (optional)</label>
                        <input
                          type="text"
                          value={local.maintenanceReason ?? ""}
                          onChange={(e) => set("maintenanceReason", e.target.value || null)}
                          placeholder="e.g. Database migration"
                          className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#FF5200] focus:outline-none bg-white"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleScheduleMaintenance}
                        disabled={!scheduleDate || saving}
                        className="w-full rounded-xl bg-[#111827] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#374151] transition disabled:opacity-40"
                      >
                        {saving ? "Saving…" : "Schedule maintenance"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-5 pt-5 border-t border-[#F3F4F6] space-y-0">
                  <SettingRow label="New restaurant registrations" description="Allow new restaurant owners to register on the platform">
                    <Toggle enabled={local.newRestaurantReg ?? true} onToggle={() => set("newRestaurantReg", !local.newRestaurantReg)} />
                  </SettingRow>
                  <SettingRow label="Rider registrations" description="Allow new delivery agents to sign up">
                    <Toggle enabled={local.riderRegistrations ?? true} onToggle={() => set("riderRegistrations", !local.riderRegistrations)} />
                  </SettingRow>
                </div>
              </div>
            )}

            {active === "orders" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Orders & Delivery</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Defaults for order flow and delivery logistics. Saved values are enforced server-side on every order.</p>
                <SettingRow label="Cash on delivery" description="Allow COD as a payment method — enforced on checkout and in the backend">
                  <Toggle enabled={local.cashOnDelivery ?? true} onToggle={() => set("cashOnDelivery", !local.cashOnDelivery)} />
                </SettingRow>
                {(local.cashOnDelivery ?? true) && (
                  <SettingRow label="Minimum order for COD (₹)" description="Orders below this amount cannot use COD">
                    <NumInput value={local.codMinOrder ?? 0} onChange={(v) => set("codMinOrder", v)} min={0} />
                  </SettingRow>
                )}
                <SettingRow label="Max delivery radius (km)" description="Restaurants cannot set a delivery radius beyond this limit">
                  <NumInput value={local.maxDeliveryRadius ?? 20} onChange={(v) => set("maxDeliveryRadius", v)} min={1} max={200} />
                </SettingRow>
                <SettingRow label="Default delivery fee (₹)" description="Pre-filled delivery fee when a restaurant registers">
                  <NumInput value={Math.round((local.defaultDeliveryFee ?? 3000) / 100)} onChange={(v) => set("defaultDeliveryFee", v * 100)} min={0} />
                </SettingRow>
              </div>
            )}

            {active === "restaurants" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Restaurants</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Controls around restaurant onboarding, approval, and content limits. All enforced server-side.</p>
                <SettingRow label="Require admin approval" description="New restaurants go live only after you approve them — they appear as pending until approved">
                  <Toggle enabled={local.requireApproval ?? false} onToggle={() => set("requireApproval", !local.requireApproval)} />
                </SettingRow>
                <SettingRow label="Allow branch restaurants" description="Existing owners can open additional branches in other cities">
                  <Toggle enabled={local.allowBranches ?? true} onToggle={() => set("allowBranches", !local.allowBranches)} />
                </SettingRow>
                <SettingRow label="Max menu items per restaurant" description="Hard cap — new items are rejected once this limit is reached">
                  <NumInput value={local.maxMenuItems ?? 200} onChange={(v) => set("maxMenuItems", v)} min={10} max={2000} />
                </SettingRow>
              </div>
            )}

            {active === "security" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Security</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Authentication and session policies. Blocked/suspended users cannot log in.</p>
                <SettingRow label="Require email verification" description="New accounts must verify email before they can place orders (coming soon)">
                  <Toggle enabled={local.requireEmailVerify ?? false} onToggle={() => set("requireEmailVerify", !local.requireEmailVerify)} disabled />
                </SettingRow>
                <SettingRow label="Signed in as">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#111827]">{user?.name ?? "—"}</p>
                    <p className="text-xs text-[#6B7280]">{user?.email}</p>
                  </div>
                </SettingRow>
                <SettingRow label="Blocked users" description="Users with isBlocked=true cannot log in and see a block message">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-semibold text-green-700">Enforced on login</span>
                  </div>
                </SettingRow>
                <SettingRow label="Suspended users" description="Users with isSuspended=true cannot log in and see a suspension message">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-semibold text-green-700">Enforced on login</span>
                  </div>
                </SettingRow>
              </div>
            )}

            {active === "notifications" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Notifications</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">In-app notifications are live. Email digest requires an email service integration (not configured).</p>
                <SettingRow label="Auto-confirm orders" description="Automatically confirm orders 2 minutes after placement (requires background job)">
                  <Toggle enabled={local.autoConfirmOrders ?? false} onToggle={() => set("autoConfirmOrders", !local.autoConfirmOrders)} disabled />
                </SettingRow>
                <SettingRow label="In-app order notifications" description="Real-time socket notifications to customers when order status changes">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-semibold text-green-700">Always on</span>
                  </div>
                </SettingRow>
                <SettingRow label="In-app rider notifications" description="Riders receive socket notifications when orders are assigned">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-xs font-semibold text-green-700">Always on</span>
                  </div>
                </SettingRow>
              </div>
            )}

            {active === "access" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Access Control</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Role definitions. Manage individual accounts from the Users page.</p>
                <div className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6] mb-5">
                  {[
                    { role: "ADMIN",      desc: "Full platform access — users, settings, restaurants, orders, DB", color: "bg-[#0C0C0E] text-white" },
                    { role: "RESTAURANT", desc: "Restaurant dashboard — menu management, order processing", color: "bg-teal-100 text-teal-700" },
                    { role: "DELIVERY",   desc: "Rider dashboard — accept orders, update delivery status", color: "bg-blue-100 text-blue-700" },
                    { role: "CUSTOMER",   desc: "Consumer app — browse restaurants, cart, order, review", color: "bg-[#F3F4F6] text-[#374151]" },
                  ].map(({ role, desc, color }) => (
                    <div key={role} className="flex items-center gap-3 p-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold shrink-0", color)}>{role}</span>
                      <p className="text-sm text-[#6B7280]">{desc}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-[#F9FAFB] p-4 space-y-2">
                  <p className="text-xs font-bold text-[#374151]">Enforcement summary</p>
                  {[
                    "Maintenance mode → 503 on all non-admin API calls",
                    "isBlocked / isSuspended → login rejected immediately",
                    "newRestaurantReg=off → register-restaurant returns 403",
                    "riderRegistrations=off → register-rider returns 403",
                    "requireApproval=on → new restaurants not visible until approved",
                    "allowBranches=off → branch creation returns 403",
                    "maxMenuItems → new menu items rejected once limit reached",
                    "maxDeliveryRadius → restaurant creation blocked above limit",
                  ].map((line) => (
                    <div key={line} className="flex items-start gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-[#6B7280]">{line}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              {dirty && !saving && (
                <p className="text-xs text-amber-600 font-semibold">Unsaved changes</p>
              )}
              {saving && <p className="text-xs text-[#9CA3AF]">Saving…</p>}
              {!dirty && !saving && <span />}
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="rounded-xl bg-[#FF5200] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#E84800] transition disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
