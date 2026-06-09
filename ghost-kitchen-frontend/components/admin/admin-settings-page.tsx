"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Bell, Globe, Lock, Shield, Store, Truck } from "lucide-react";

import { useAuthStore } from "@/store/authStore";
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

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        enabled ? "bg-[#FF5200]" : "bg-[#D1D5DB]"
      )}
    >
      <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", enabled ? "translate-x-6" : "translate-x-1")} />
    </button>
  );
}

const SECTIONS = [
  { id: "platform", label: "Platform", icon: Globe },
  { id: "orders",   label: "Orders & Delivery", icon: Truck },
  { id: "restaurants", label: "Restaurants", icon: Store },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "access",   label: "Access Control", icon: Lock },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function AdminSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [active, setActive] = useState<SectionId>("platform");

  // Platform toggles
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [newRegistrations, setNewRegistrations] = useState(true);
  const [riderRegistrations, setRiderRegistrations] = useState(true);

  // Orders
  const [autoConfirm, setAutoConfirm]     = useState(false);
  const [cashOnDelivery, setCashOnDelivery] = useState(true);
  const [codMin, setCodMin]               = useState(0);
  const [maxDeliveryRadius, setMaxDeliveryRadius] = useState(20);
  const [defaultDeliveryFee, setDefaultDeliveryFee] = useState(30);

  // Restaurants
  const [requireApproval, setRequireApproval]   = useState(false);
  const [allowBranches, setAllowBranches]       = useState(true);
  const [maxMenuItems, setMaxMenuItems]         = useState(200);

  // Security
  const [requireEmailVerify, setRequireEmailVerify] = useState(false);
  const [sessionTimeout, setSessionTimeout]         = useState(15);

  // Notifications
  const [emailAlerts, setEmailAlerts]   = useState(true);
  const [orderAlerts, setOrderAlerts]   = useState(true);
  const [agentAlerts, setAgentAlerts]   = useState(true);

  function saveSection() {
    toast.success("Settings saved", { icon: "✓" });
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">Configuration</p>
        <h1 className="mt-2 text-3xl font-bold text-[#111827]">Settings</h1>
        <p className="mt-2 text-sm text-[#6B7280]">Manage platform-wide configuration, policies, and operational defaults.</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
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

        {/* Content */}
        <div className="flex-1">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">

            {active === "platform" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Platform</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Global switches that affect all users and restaurants.</p>
                <SettingRow label="Maintenance mode" description="Takes the platform offline for all non-admin users">
                  <Toggle enabled={maintenanceMode} onToggle={() => { setMaintenanceMode(!maintenanceMode); toast(maintenanceMode ? "Maintenance mode off" : "⚠️ Maintenance mode ON"); }} />
                </SettingRow>
                <SettingRow label="New restaurant registrations" description="Allow new restaurant owners to sign up">
                  <Toggle enabled={newRegistrations} onToggle={() => setNewRegistrations(!newRegistrations)} />
                </SettingRow>
                <SettingRow label="Rider registrations" description="Allow new delivery agents to sign up">
                  <Toggle enabled={riderRegistrations} onToggle={() => setRiderRegistrations(!riderRegistrations)} />
                </SettingRow>
              </div>
            )}

            {active === "orders" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Orders & Delivery</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Defaults for order flow and delivery logistics.</p>
                <SettingRow label="Auto-confirm orders" description="Automatically confirm placed orders after 2 minutes">
                  <Toggle enabled={autoConfirm} onToggle={() => setAutoConfirm(!autoConfirm)} />
                </SettingRow>
                <SettingRow label="Cash on delivery" description="Allow COD as a payment method">
                  <Toggle enabled={cashOnDelivery} onToggle={() => setCashOnDelivery(!cashOnDelivery)} />
                </SettingRow>
                {cashOnDelivery && (
                  <SettingRow label="Minimum order for COD (₹)" description="Orders below this amount cannot use COD">
                    <input type="number" min={0} value={codMin} onChange={(e) => setCodMin(+e.target.value)}
                      className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none" />
                  </SettingRow>
                )}
                <SettingRow label="Max delivery radius (km)" description="Restaurants cannot exceed this delivery radius">
                  <input type="number" min={1} max={100} value={maxDeliveryRadius} onChange={(e) => setMaxDeliveryRadius(+e.target.value)}
                    className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none" />
                </SettingRow>
                <SettingRow label="Default delivery fee (₹)" description="Suggested delivery fee for new restaurants">
                  <input type="number" min={0} value={defaultDeliveryFee} onChange={(e) => setDefaultDeliveryFee(+e.target.value)}
                    className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none" />
                </SettingRow>
              </div>
            )}

            {active === "restaurants" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Restaurants</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Controls around restaurant onboarding and content limits.</p>
                <SettingRow label="Require admin approval" description="New restaurants go live only after manual review">
                  <Toggle enabled={requireApproval} onToggle={() => setRequireApproval(!requireApproval)} />
                </SettingRow>
                <SettingRow label="Allow branch restaurants" description="Existing owners can open branches in other cities">
                  <Toggle enabled={allowBranches} onToggle={() => setAllowBranches(!allowBranches)} />
                </SettingRow>
                <SettingRow label="Max menu items per restaurant" description="Hard limit on menu items a restaurant can list">
                  <input type="number" min={10} max={1000} value={maxMenuItems} onChange={(e) => setMaxMenuItems(+e.target.value)}
                    className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none" />
                </SettingRow>
              </div>
            )}

            {active === "security" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Security</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Authentication and session policies.</p>
                <SettingRow label="Require email verification" description="New accounts must verify email before ordering">
                  <Toggle enabled={requireEmailVerify} onToggle={() => setRequireEmailVerify(!requireEmailVerify)} />
                </SettingRow>
                <SettingRow label="Access token lifetime (min)" description="How long a session token stays valid">
                  <input type="number" min={5} max={120} value={sessionTimeout} onChange={(e) => setSessionTimeout(+e.target.value)}
                    className="w-24 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm text-right focus:border-[#FF5200] focus:outline-none" />
                </SettingRow>
                <SettingRow label="Signed in as">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[#111827]">{user?.name ?? "—"}</p>
                    <p className="text-xs text-[#6B7280]">{user?.email}</p>
                  </div>
                </SettingRow>
              </div>
            )}

            {active === "notifications" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Notifications</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Alert preferences for the operations team.</p>
                <SettingRow label="Email digest" description="Daily summary of platform metrics to admin email">
                  <Toggle enabled={emailAlerts} onToggle={() => setEmailAlerts(!emailAlerts)} />
                </SettingRow>
                <SettingRow label="Unconfirmed order alerts" description="Alert when orders are unconfirmed for >15 min">
                  <Toggle enabled={orderAlerts} onToggle={() => setOrderAlerts(!orderAlerts)} />
                </SettingRow>
                <SettingRow label="No-agent alerts" description="Alert when an order has no assigned delivery agent">
                  <Toggle enabled={agentAlerts} onToggle={() => setAgentAlerts(!agentAlerts)} />
                </SettingRow>
              </div>
            )}

            {active === "access" && (
              <div>
                <h2 className="text-base font-bold text-[#111827] mb-1">Access Control</h2>
                <p className="text-xs text-[#9CA3AF] mb-5">Role and permission management. Use the Users page to manage individual accounts.</p>
                <div className="rounded-xl border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
                  {[
                    { role: "ADMIN", desc: "Full platform access — orders, users, settings, DB", color: "bg-[#0C0C0E] text-white" },
                    { role: "RESTAURANT", desc: "Restaurant dashboard — menu, orders for their outlet", color: "bg-teal-100 text-teal-700" },
                    { role: "DELIVERY", desc: "Rider dashboard — accept and complete deliveries", color: "bg-blue-100 text-blue-700" },
                    { role: "CUSTOMER", desc: "Consumer app — browse, cart, order, review", color: "bg-[#F3F4F6] text-[#374151]" },
                  ].map(({ role, desc, color }) => (
                    <div key={role} className="flex items-center gap-3 p-4">
                      <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold shrink-0", color)}>{role}</span>
                      <p className="text-sm text-[#6B7280]">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={saveSection}
                className="rounded-xl bg-[#FF5200] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#E84800] transition"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
