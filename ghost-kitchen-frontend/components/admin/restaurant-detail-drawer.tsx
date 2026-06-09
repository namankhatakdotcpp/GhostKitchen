"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChefHat,
  MapPin,
  Package,
  Star,
  User,
  X,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OwnerInfo {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

interface MenuItemRow {
  id: string;
  name: string;
  description: string;
  price: string | number;
  category: string;
  imageUrl: string;
  isVeg: boolean;
  isAvailable: boolean;
  isBestseller: boolean;
  sortOrder: number;
}

interface OrderRow {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  customer: { name: string; email: string };
  agent: { name: string; phone: string } | null;
}

interface RestaurantDetail {
  id: string;
  name: string;
  description: string;
  cuisines: string[];
  rating: number;
  reviewCount: number;
  imageUrl: string;
  address: Record<string, string>;
  isOpen: boolean;
  suspended: boolean;
  owner: OwnerInfo;
  menuItems: MenuItemRow[];
  orders: OrderRow[];
  _count: { orders: number; menuItems: number };
  createdAt: string;
}

// ─── Menu Item Form Modal ─────────────────────────────────────────────────────

const EMPTY_ITEM = {
  name: "", description: "", price: "", category: "",
  imageUrl: "", isVeg: false, isAvailable: true, isBestseller: false, sortOrder: 0,
};

function MenuItemModal({
  restaurantId,
  item,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  item: MenuItemRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    item
      ? { name: item.name, description: item.description, price: String(item.price),
          category: item.category, imageUrl: item.imageUrl, isVeg: item.isVeg,
          isAvailable: item.isAvailable, isBestseller: item.isBestseller, sortOrder: item.sortOrder }
      : EMPTY_ITEM,
  );
  const [saving, setSaving] = useState(false);

  function set(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (item) {
        await api.patch(`/admin/menu-items/${item.id}`, form);
        toast.success("Menu item updated");
      } else {
        await api.post("/admin/menu-items", { ...form, restaurantId });
        toast.success("Menu item created");
      }
      onSaved();
      onClose();
    } catch {
      toast.error("Failed to save menu item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg rounded-[20px] bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-text-muted hover:text-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-lg font-bold text-text-primary">
          {item ? "Edit Menu Item" : "New Menu Item"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-text-muted">Name *</label>
              <input required className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Paneer Tikka" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-text-muted">Description</label>
              <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-text-muted">Price (₹) *</label>
              <input required type="number" step="0.01" className={inputCls} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="299" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-text-muted">Category *</label>
              <input required className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Starters" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-text-muted">Image URL</label>
              <input className={inputCls} value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-text-muted">Sort Order</label>
              <input type="number" className={inputCls} value={form.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
            </div>
            <div className="flex items-end gap-4 pb-1">
              {(["isVeg", "isAvailable", "isBestseller"] as const).map((key) => (
                <label key={key} className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <input type="checkbox" checked={form[key] as boolean} onChange={(e) => set(key, e.target.checked)} className="h-4 w-4 rounded border-border" />
                  {key === "isVeg" ? "Veg" : key === "isAvailable" ? "Available" : "Bestseller"}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtnCls}>Cancel</button>
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              {saving ? "Saving…" : item ? "Save Changes" : "Create Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

const TABS = ["Overview", "Menu Items", "Orders", "Reviews"] as const;
type Tab = (typeof TABS)[number];

const inputCls = "w-full rounded-[12px] border border-border bg-[#FAFAFA] px-3 py-2 text-sm outline-none focus:border-brand";
const primaryBtnCls = "rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition";
const secondaryBtnCls = "rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-[#FAFAFA] transition";

export function RestaurantDetailDrawer({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Overview");
  const [menuModal, setMenuModal] = useState<{ item: MenuItemRow | null } | null>(null);

  const { data, isLoading, isError } = useQuery<RestaurantDetail>({
    queryKey: ["admin-restaurant-detail", restaurantId],
    queryFn: async () => {
      const { data } = await api.get(`/admin/restaurants/${restaurantId}`);
      return data.data;
    },
    enabled: !!restaurantId,
  });

  async function handleDeleteMenuItem(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/menu-items/${id}`);
      toast.success("Menu item deleted");
      qc.invalidateQueries({ queryKey: ["admin-restaurant-detail", restaurantId] });
    } catch {
      toast.error("Failed to delete menu item");
    }
  }

  function handleMenuSaved() {
    qc.invalidateQueries({ queryKey: ["admin-restaurant-detail", restaurantId] });
    qc.invalidateQueries({ queryKey: ["admin-restaurants"] });
  }

  const addressStr = useMemo(() => {
    if (!data?.address) return "—";
    const a = data.address as Record<string, string>;
    return [a.line1, a.area, a.city, a.state].filter(Boolean).join(", ");
  }, [data?.address]);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            {isLoading ? (
              <div className="bone-loader h-6 w-48 rounded-lg" />
            ) : (
              <>
                <h2 className="text-xl font-bold text-text-primary">{data?.name}</h2>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {data?.suspended ? (
                    <span className="text-danger font-semibold">Suspended</span>
                  ) : data?.isOpen ? (
                    <span className="text-success font-semibold">Open</span>
                  ) : (
                    <span className="text-warning font-semibold">Closed</span>
                  )}
                  {" · "}
                  <span className="flex-inline items-center gap-1">
                    <Star className="inline h-3.5 w-3.5 text-warning" /> {data?.rating.toFixed(1)}
                    {" "}({data?._count.orders} orders · {data?._count.menuItems} items)
                  </span>
                </p>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-text-muted hover:bg-[#F7F7F7] hover:text-text-primary transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border px-6 pt-3">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-t-lg px-4 py-2 text-sm font-medium transition",
                tab === t
                  ? "border-b-2 border-brand text-brand"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bone-loader h-12 rounded-[12px]" />
              ))}
            </div>
          ) : isError || !data ? (
            <div className="py-12 text-center text-sm text-text-secondary">Failed to load restaurant data.</div>
          ) : (
            <>
              {/* ── Overview ── */}
              {tab === "Overview" && (
                <div className="space-y-5">
                  <DetailSection icon={ChefHat} label="Description">
                    <p className="text-sm text-text-secondary">{data.description || "—"}</p>
                  </DetailSection>
                  <DetailSection icon={User} label="Owner">
                    <p className="text-sm font-semibold text-text-primary">{data.owner.name}</p>
                    <p className="text-xs text-text-secondary">{data.owner.email}</p>
                    {data.owner.phone && <p className="text-xs text-text-secondary">{data.owner.phone}</p>}
                  </DetailSection>
                  <DetailSection icon={MapPin} label="Address">
                    <p className="text-sm text-text-secondary">{addressStr}</p>
                  </DetailSection>
                  <DetailSection icon={Package} label="Cuisines">
                    <div className="flex flex-wrap gap-2">
                      {data.cuisines.map((c) => (
                        <span key={c} className="rounded-full bg-[#F7F7F7] px-2.5 py-1 text-xs font-medium text-text-secondary">{c}</span>
                      ))}
                    </div>
                  </DetailSection>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Total Orders", value: data._count.orders },
                      { label: "Menu Items", value: data._count.menuItems },
                      { label: "Rating", value: data.rating.toFixed(1) },
                    ].map((s) => (
                      <div key={s.label} className="rounded-[16px] border border-border bg-[#FAFAFA] p-4 text-center">
                        <p className="text-2xl font-bold text-text-primary">{s.value}</p>
                        <p className="mt-0.5 text-xs text-text-muted">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">
                    Restaurant ID: <code className="rounded bg-[#F7F7F7] px-1.5 py-0.5 text-xs">{data.id}</code>
                    {" · "}Registered: {new Date(data.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
              )}

              {/* ── Menu Items ── */}
              {tab === "Menu Items" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-text-secondary">{data.menuItems.length} items</p>
                    <button
                      type="button"
                      onClick={() => setMenuModal({ item: null })}
                      className={primaryBtnCls + " flex items-center gap-1.5"}
                    >
                      <Plus className="h-4 w-4" />
                      Add Item
                    </button>
                  </div>
                  {data.menuItems.length === 0 ? (
                    <div className="rounded-[16px] border border-border bg-[#FAFAFA] py-10 text-center text-sm text-text-muted">No menu items yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {data.menuItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between rounded-[14px] border border-border bg-white px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-block h-3 w-3 flex-shrink-0 rounded-sm border-2",
                                  item.isVeg ? "border-success" : "border-danger",
                                )}
                              />
                              <p className="truncate font-semibold text-text-primary">{item.name}</p>
                              {item.isBestseller && (
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">★ Bestseller</span>
                              )}
                              {!item.isAvailable && (
                                <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger">Unavailable</span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-text-muted">{item.category} · ₹{Number(item.price).toFixed(0)}</p>
                          </div>
                          <div className="ml-4 flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setMenuModal({ item })}
                              className="rounded-full border border-border p-1.5 text-text-muted hover:border-brand/30 hover:text-brand transition"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMenuItem(item.id, item.name)}
                              className="rounded-full border border-border p-1.5 text-text-muted hover:border-danger/30 hover:text-danger transition"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Orders ── */}
              {tab === "Orders" && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-text-secondary">Last {data.orders.length} orders</p>
                  {data.orders.length === 0 ? (
                    <div className="rounded-[16px] border border-border bg-[#FAFAFA] py-10 text-center text-sm text-text-muted">No orders yet.</div>
                  ) : (
                    data.orders.map((order) => (
                      <div key={order.id} className="rounded-[14px] border border-border bg-white px-4 py-3">
                        <div className="flex items-center justify-between">
                          <code className="text-xs text-text-muted">{order.id.slice(0, 16)}…</code>
                          <StatusPill status={order.status} />
                        </div>
                        <div className="mt-1.5 flex items-center gap-4 text-xs text-text-secondary">
                          <span>Customer: <strong>{order.customer.name}</strong></span>
                          {order.agent && <span>Agent: <strong>{order.agent.name}</strong></span>}
                          <span className="ml-auto font-semibold text-text-primary">₹{(order.total / 100).toFixed(0)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-text-muted">
                          {new Date(order.createdAt).toLocaleString("en-IN")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── Reviews ── */}
              {tab === "Reviews" && (
                <div className="rounded-[16px] border border-border bg-[#FAFAFA] py-10 text-center text-sm text-text-muted">
                  Reviews are attached to individual orders. Use the Database → Reviews table to browse all reviews.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Menu Item Modal */}
      {menuModal && data && (
        <MenuItemModal
          restaurantId={data.id}
          item={menuModal.item}
          onClose={() => setMenuModal(null)}
          onSaved={handleMenuSaved}
        />
      )}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function DetailSection({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-[#FAFAFA] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-muted" />
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</p>
      </div>
      {children}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PLACED:           "bg-blue-50 text-blue-600",
  CONFIRMED:        "bg-brand-light text-brand",
  PREPARING:        "bg-warning/10 text-warning",
  OUT_FOR_DELIVERY: "bg-purple-50 text-purple-600",
  DELIVERED:        "bg-success/10 text-success",
  CANCELLED:        "bg-danger/10 text-danger",
  PENDING:          "bg-[#F7F7F7] text-text-muted",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider", STATUS_COLORS[status] ?? "bg-[#F7F7F7] text-text-muted")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
