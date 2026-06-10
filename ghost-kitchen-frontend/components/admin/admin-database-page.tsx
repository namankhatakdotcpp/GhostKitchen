"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  BookOpen,
  ChefHat,
  CreditCard,
  Pencil,
  Plus,
  Search,
  Shield,
  ShoppingBag,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import toast from "react-hot-toast";

import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Table registry ───────────────────────────────────────────────────────────

const TABLES = [
  { key: "users",       label: "Users",       icon: Users,       readonly: false },
  { key: "restaurants", label: "Restaurants", icon: ChefHat,     readonly: false },
  { key: "menu-items",  label: "Menu Items",  icon: BookOpen,    readonly: false },
  { key: "orders",      label: "Orders",      icon: ShoppingBag, readonly: true  },
  { key: "reviews",     label: "Reviews",     icon: Star,        readonly: false },
  { key: "payments",    label: "Payments",    icon: CreditCard,  readonly: true  },
  { key: "coupons",     label: "Coupons",     icon: Tag,         readonly: false },
  { key: "audit-log",   label: "Audit Log",   icon: Shield,      readonly: true  },
] as const;

type TableKey = (typeof TABLES)[number]["key"];

// ─── Generic helpers ──────────────────────────────────────────────────────────

const inputCls = "w-full rounded-[12px] border border-border bg-[#FAFAFA] px-3 py-2 text-sm outline-none focus:border-brand";
const primaryBtnCls = "flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition";
const secondaryBtnCls = "rounded-full border border-border px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-[#FAFAFA] transition";
const dangerBtnCls = "rounded-full border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/5 transition";

const STATUS_COLORS: Record<string, string> = {
  PLACED: "bg-blue-50 text-blue-600",
  CONFIRMED: "bg-brand-light text-brand",
  PREPARING: "bg-warning/10 text-warning",
  OUT_FOR_DELIVERY: "bg-purple-50 text-purple-600",
  DELIVERED: "bg-success/10 text-success",
  CANCELLED: "bg-danger/10 text-danger",
  PENDING: "bg-[#F7F7F7] text-text-muted",
  SUCCESS: "bg-success/10 text-success",
  FAILED: "bg-danger/10 text-danger",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide", STATUS_COLORS[status] ?? "bg-[#F7F7F7] text-text-muted")}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-[20px] bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-bold text-text-primary">Confirm Delete</h3>
        <p className="mb-6 text-sm text-text-secondary">{message}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={secondaryBtnCls}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white hover:bg-danger/90 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Record Modal (generic create / edit) ─────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "checkbox" | "select";
  options?: string[];
  required?: boolean;
};

function RecordModal({
  title,
  fields,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  fields: FieldDef[];
  initial: Record<string, unknown>;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState(false);

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[20px] bg-white p-6 shadow-xl">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full p-1 text-text-muted hover:text-text-primary">
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-4 text-lg font-bold text-text-primary">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-text-muted">{f.label}{f.required ? " *" : ""}</label>
              {f.type === "textarea" ? (
                <textarea
                  className={inputCls}
                  rows={3}
                  required={f.required}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : f.type === "checkbox" ? (
                <label className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={Boolean(form[f.key])}
                    onChange={(e) => set(f.key, e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {f.label}
                </label>
              ) : f.type === "select" ? (
                <select
                  className={inputCls}
                  required={f.required}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type}
                  step={f.type === "number" ? "0.01" : undefined}
                  className={inputCls}
                  required={f.required}
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => set(f.key, f.type === "number" ? e.target.value : e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={secondaryBtnCls}>Cancel</button>
            <button type="submit" disabled={saving} className={primaryBtnCls}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Users View ───────────────────────────────────────────────────────────────

const USER_EDIT_FIELDS: FieldDef[] = [
  { key: "name",  label: "Name",  type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "activeRole", label: "Active Role", type: "select", options: ["CUSTOMER", "RESTAURANT", "DELIVERY", "ADMIN"] },
];

function UsersView({ search }: { search: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-users"],
    queryFn: async () => {
      const { data } = await api.get("/admin/users", { params: { limit: 200 } });
      return data.users ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((u: any) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [data, search]);

  async function handleEdit(row: any, form: Record<string, unknown>) {
    await api.patch(`/admin/users/${row.id}`, form);
    toast.success("User updated");
    qc.invalidateQueries({ queryKey: ["admin-db-users"] });
    setEditing(null);
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-text-primary">{row.original.name}</p>
          <p className="text-xs text-text-muted">{row.original.email}</p>
        </div>
      ),
    },
    { accessorKey: "phone", header: "Phone", cell: ({ row }) => row.original.phone ?? "—" },
    {
      accessorKey: "activeRole",
      header: "Active Role",
      cell: ({ row }) => <StatusPill status={row.original.activeRole} />,
    },
    {
      accessorKey: "roles",
      header: "All Roles",
      cell: ({ row }) => row.original.roles.join(", "),
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => fmt(row.original.createdAt),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => setEditing(row.original)}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-[#FAFAFA] flex items-center gap-1 transition"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      ),
    },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <DataTable columns={columns} data={filtered} emptyLabel="No users found." />
      {editing && (
        <RecordModal
          title={`Edit User — ${editing.name}`}
          fields={USER_EDIT_FIELDS}
          initial={{ name: editing.name, phone: editing.phone ?? "", activeRole: editing.activeRole }}
          onClose={() => setEditing(null)}
          onSave={(form) => handleEdit(editing, form)}
        />
      )}
    </>
  );
}

// ─── Restaurants View ─────────────────────────────────────────────────────────

const RESTAURANT_EDIT_FIELDS: FieldDef[] = [
  { key: "name",        label: "Name",        type: "text" },
  { key: "description", label: "Description", type: "textarea" },
  { key: "isOpen",      label: "Is Open",     type: "checkbox" },
  { key: "suspended",   label: "Suspended",   type: "checkbox" },
];

function RestaurantsView({ search }: { search: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-restaurants"],
    queryFn: async () => {
      const { data } = await api.get("/admin/restaurants", { params: { limit: 200 } });
      return data.restaurants ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((r: any) => !q || r.name.toLowerCase().includes(q));
  }, [data, search]);

  async function handleEdit(row: any, form: Record<string, unknown>) {
    await api.patch(`/admin/restaurants/${row.id}`, form);
    toast.success("Restaurant updated");
    qc.invalidateQueries({ queryKey: ["admin-db-restaurants"] });
    setEditing(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await api.delete(`/admin/restaurants/${confirmDelete.id}`);
    toast.success("Restaurant deleted");
    qc.invalidateQueries({ queryKey: ["admin-db-restaurants"] });
    setConfirmDelete(null);
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-semibold text-text-primary">{row.original.name}</p>
          <p className="text-xs text-text-muted">{row.original.owner?.email ?? "—"}</p>
        </div>
      ),
    },
    { accessorKey: "rating", header: "Rating", cell: ({ row }) => row.original.rating?.toFixed(1) ?? "—" },
    { accessorKey: "_count.orders", header: "Orders", cell: ({ row }) => row.original._count?.orders ?? "—" },
    {
      accessorKey: "isOpen",
      header: "Status",
      cell: ({ row }) => (
        row.original.suspended ? <StatusPill status="CANCELLED" /> :
        row.original.isOpen    ? <StatusPill status="DELIVERED" /> :
                                 <StatusPill status="PENDING" />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(row.original)}
            className="rounded-full border border-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-[#FAFAFA] flex items-center gap-1 transition"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete({ id: row.original.id, name: row.original.name })}
            className={dangerBtnCls + " flex items-center gap-1"}
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      ),
    },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <DataTable columns={columns} data={filtered} emptyLabel="No restaurants found." />
      {editing && (
        <RecordModal
          title={`Edit Restaurant — ${editing.name}`}
          fields={RESTAURANT_EDIT_FIELDS}
          initial={{ name: editing.name, description: editing.description ?? "", isOpen: editing.isOpen, suspended: editing.suspended }}
          onClose={() => setEditing(null)}
          onSave={(form) => handleEdit(editing, form)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`Permanently delete "${confirmDelete.name}"? This will also remove all associated menu items and may affect orders.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ─── Menu Items View ──────────────────────────────────────────────────────────

const MENU_ITEM_FIELDS: FieldDef[] = [
  { key: "restaurantId", label: "Restaurant ID", type: "text", required: true },
  { key: "name",         label: "Name",          type: "text", required: true },
  { key: "description",  label: "Description",   type: "textarea" },
  { key: "price",        label: "Price (₹)",     type: "number", required: true },
  { key: "category",     label: "Category",      type: "text", required: true },
  { key: "imageUrl",     label: "Image URL",     type: "text" },
  { key: "sortOrder",    label: "Sort Order",    type: "number" },
  { key: "isVeg",        label: "Veg",           type: "checkbox" },
  { key: "isAvailable",  label: "Available",     type: "checkbox" },
  { key: "isBestseller", label: "Bestseller",    type: "checkbox" },
];

const MENU_ITEM_EDIT_FIELDS = MENU_ITEM_FIELDS.filter((f) => f.key !== "restaurantId");

function MenuItemsView({ search }: { search: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-menu-items"],
    queryFn: async () => {
      const { data } = await api.get("/admin/menu-items", { params: { limit: 500 } });
      return data.items ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((m: any) => !q || m.name.toLowerCase().includes(q) || m.restaurant?.name?.toLowerCase().includes(q));
  }, [data, search]);

  async function handleCreate(form: Record<string, unknown>) {
    await api.post("/admin/menu-items", form);
    toast.success("Menu item created");
    qc.invalidateQueries({ queryKey: ["admin-db-menu-items"] });
    setCreating(false);
  }

  async function handleEdit(row: any, form: Record<string, unknown>) {
    await api.patch(`/admin/menu-items/${row.id}`, form);
    toast.success("Menu item updated");
    qc.invalidateQueries({ queryKey: ["admin-db-menu-items"] });
    setEditing(null);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await api.delete(`/admin/menu-items/${confirmDelete.id}`);
    toast.success("Menu item deleted");
    qc.invalidateQueries({ queryKey: ["admin-db-menu-items"] });
    setConfirmDelete(null);
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-2">
            <span className={cn("h-3 w-3 rounded-sm border-2 flex-shrink-0", row.original.isVeg ? "border-success" : "border-danger")} />
            <p className="font-semibold text-text-primary">{row.original.name}</p>
          </div>
          <p className="mt-0.5 text-xs text-text-muted pl-5">{row.original.restaurant?.name ?? "—"}</p>
        </div>
      ),
    },
    { accessorKey: "category", header: "Category" },
    { accessorKey: "price",    header: "Price",    cell: ({ row }) => `₹${Number(row.original.price).toFixed(0)}` },
    {
      accessorKey: "isAvailable",
      header: "Available",
      cell: ({ row }) => (
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", row.original.isAvailable ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
          {row.original.isAvailable ? "Yes" : "No"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing(row.original)}
            className="rounded-full border border-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-[#FAFAFA] flex items-center gap-1 transition">
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <button type="button" onClick={() => setConfirmDelete({ id: row.original.id, name: row.original.name })}
            className={dangerBtnCls + " flex items-center gap-1"}>
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        </div>
      ),
    },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setCreating(true)} className={primaryBtnCls}>
          <Plus className="h-4 w-4" /> New Menu Item
        </button>
      </div>
      <DataTable columns={columns} data={filtered} emptyLabel="No menu items found." />
      {creating && (
        <RecordModal
          title="New Menu Item"
          fields={MENU_ITEM_FIELDS}
          initial={{ restaurantId: "", name: "", description: "", price: "", category: "", imageUrl: "", isVeg: false, isAvailable: true, isBestseller: false, sortOrder: 0 }}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}
      {editing && (
        <RecordModal
          title={`Edit — ${editing.name}`}
          fields={MENU_ITEM_EDIT_FIELDS}
          initial={{ name: editing.name, description: editing.description ?? "", price: editing.price, category: editing.category, imageUrl: editing.imageUrl ?? "", isVeg: editing.isVeg, isAvailable: editing.isAvailable, isBestseller: editing.isBestseller, sortOrder: editing.sortOrder }}
          onClose={() => setEditing(null)}
          onSave={(form) => handleEdit(editing, form)}
        />
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`Delete "${confirmDelete.name}"? This cannot be undone and will remove it from all carts.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ─── Orders View (read-only) ──────────────────────────────────────────────────

function OrdersView({ search }: { search: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-orders"],
    queryFn: async () => {
      const { data } = await api.get("/admin/orders");
      return data.data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((o: any) =>
      !q || o.id.toLowerCase().includes(q) || o.customer?.name?.toLowerCase().includes(q) || o.restaurant?.name?.toLowerCase().includes(q),
    );
  }, [data, search]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: "id", header: "Order ID", cell: ({ row }) => <code className="text-xs text-text-muted">{row.original.id.slice(0, 16)}…</code> },
    { accessorKey: "customer.name", header: "Customer", cell: ({ row }) => row.original.customer?.name ?? "—" },
    { accessorKey: "restaurant.name", header: "Restaurant", cell: ({ row }) => row.original.restaurant?.name ?? "—" },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusPill status={row.original.status} /> },
    { accessorKey: "total", header: "Total", cell: ({ row }) => `₹${(row.original.total / 100).toFixed(0)}` },
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => fmt(row.original.createdAt) },
  ], []);

  if (isLoading) return <Skeleton />;
  return <DataTable columns={columns} data={filtered} emptyLabel="No orders found." />;
}

// ─── Reviews View ─────────────────────────────────────────────────────────────

function ReviewsView({ search }: { search: string }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-reviews"],
    queryFn: async () => {
      const { data } = await api.get("/admin/reviews", { params: { limit: 200 } });
      return data.reviews ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((r: any) =>
      !q || r.order?.customer?.name?.toLowerCase().includes(q) || r.order?.restaurant?.name?.toLowerCase().includes(q),
    );
  }, [data, search]);

  async function handleDelete() {
    if (!confirmDelete) return;
    await api.delete(`/admin/reviews/${confirmDelete.id}`);
    toast.success("Review deleted");
    qc.invalidateQueries({ queryKey: ["admin-db-reviews"] });
    setConfirmDelete(null);
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "rating",
      header: "Rating",
      cell: ({ row }) => (
        <span className="flex items-center gap-1 font-semibold text-warning">
          ★ {row.original.rating}
        </span>
      ),
    },
    { accessorKey: "comment", header: "Comment", cell: ({ row }) => row.original.comment ?? <em className="text-text-muted">No comment</em> },
    { accessorKey: "order.customer.name", header: "Customer", cell: ({ row }) => row.original.order?.customer?.name ?? "—" },
    { accessorKey: "order.restaurant.name", header: "Restaurant", cell: ({ row }) => row.original.order?.restaurant?.name ?? "—" },
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => fmt(row.original.createdAt) },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <button type="button" onClick={() => setConfirmDelete({ id: row.original.id })}
          className={dangerBtnCls + " flex items-center gap-1"}>
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      ),
    },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <DataTable columns={columns} data={filtered} emptyLabel="No reviews found." />
      {confirmDelete && (
        <ConfirmModal
          message="Delete this review? This action cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}

// ─── Payments View (read-only) ────────────────────────────────────────────────

function PaymentsView({ search }: { search: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-payments"],
    queryFn: async () => {
      const { data } = await api.get("/admin/payments", { params: { limit: 200 } });
      return data.payments ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((p: any) => !q || p.cfOrderId?.toLowerCase().includes(q) || p.customerName?.toLowerCase().includes(q));
  }, [data, search]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: "cfOrderId", header: "CF Order ID", cell: ({ row }) => <code className="text-xs">{row.original.cfOrderId}</code> },
    { accessorKey: "customerName", header: "Customer", cell: ({ row }) => row.original.customerName ?? "—" },
    { accessorKey: "restaurantName", header: "Restaurant", cell: ({ row }) => row.original.restaurantName ?? "—" },
    { accessorKey: "amount", header: "Amount", cell: ({ row }) => `₹${(row.original.amount / 100).toFixed(0)}` },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusPill status={row.original.status} /> },
    { accessorKey: "createdAt", header: "Date", cell: ({ row }) => fmt(row.original.createdAt) },
  ], []);

  if (isLoading) return <Skeleton />;
  return <DataTable columns={columns} data={filtered} emptyLabel="No payments found." />;
}

// ─── Coupons View ─────────────────────────────────────────────────────────────

const COUPON_CREATE_FIELDS: FieldDef[] = [
  { key: "code",          label: "Code",           type: "text",   required: true },
  { key: "description",   label: "Description",    type: "text" },
  { key: "discountType",  label: "Discount Type",  type: "select", options: ["PERCENTAGE", "FLAT"], required: true },
  { key: "discountValue", label: "Discount Value", type: "number", required: true },
  { key: "minOrder",      label: "Min Order (₹)",  type: "number", required: true },
  { key: "maxUses",       label: "Max Uses",       type: "number", required: true },
  { key: "expiresAt",     label: "Expires At",     type: "text",   required: true },
  { key: "isActive",      label: "Active",         type: "checkbox" },
];

function CouponsView({ search }: { search: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-coupons"],
    queryFn: async () => {
      const { data } = await api.get("/admin/coupons", { params: { limit: 200 } });
      return data.coupons ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((c: any) => !q || c.code?.toLowerCase().includes(q));
  }, [data, search]);

  async function handleCreate(form: Record<string, unknown>) {
    await api.post("/admin/coupons", form);
    toast.success("Coupon created");
    qc.invalidateQueries({ queryKey: ["admin-db-coupons"] });
    setCreating(false);
  }

  async function handleEdit(row: any, form: Record<string, unknown>) {
    await api.put(`/admin/coupons/${row.id}`, form);
    toast.success("Coupon updated");
    qc.invalidateQueries({ queryKey: ["admin-db-coupons"] });
    setEditing(null);
  }

  async function handleDeactivate(id: string) {
    await api.delete(`/admin/coupons/${id}`);
    toast.success("Coupon deactivated");
    qc.invalidateQueries({ queryKey: ["admin-db-coupons"] });
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => <code className="font-bold text-brand">{row.original.code}</code>,
    },
    {
      accessorKey: "discountType",
      header: "Discount",
      cell: ({ row }) => `${row.original.discountType === "PERCENTAGE" ? row.original.discountValue + "%" : "₹" + row.original.discountValue} off`,
    },
    { accessorKey: "usedCount", header: "Uses", cell: ({ row }) => `${row.original.usedCount} / ${row.original.maxUses}` },
    {
      accessorKey: "isActive",
      header: "Active",
      cell: ({ row }) => (
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", row.original.isActive ? "bg-success/10 text-success" : "bg-[#F7F7F7] text-text-muted")}>
          {row.original.isActive ? "Active" : "Inactive"}
        </span>
      ),
    },
    { accessorKey: "expiresAt", header: "Expires", cell: ({ row }) => fmt(row.original.expiresAt) },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setEditing(row.original)}
            className="rounded-full border border-border px-2.5 py-1.5 text-xs font-semibold text-text-secondary hover:bg-[#FAFAFA] flex items-center gap-1 transition">
            <Pencil className="h-3 w-3" /> Edit
          </button>
          {row.original.isActive && (
            <button type="button" onClick={() => handleDeactivate(row.original.id)}
              className={dangerBtnCls}>Deactivate</button>
          )}
        </div>
      ),
    },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setCreating(true)} className={primaryBtnCls}>
          <Plus className="h-4 w-4" /> New Coupon
        </button>
      </div>
      <DataTable columns={columns} data={filtered} emptyLabel="No coupons found." />
      {creating && (
        <RecordModal
          title="New Coupon"
          fields={COUPON_CREATE_FIELDS}
          initial={{ code: "", description: "", discountType: "PERCENTAGE", discountValue: "", minOrder: "", maxUses: "", expiresAt: "", isActive: true }}
          onClose={() => setCreating(false)}
          onSave={handleCreate}
        />
      )}
      {editing && (
        <RecordModal
          title={`Edit Coupon — ${editing.code}`}
          fields={COUPON_CREATE_FIELDS}
          initial={{ code: editing.code, description: editing.description ?? "", discountType: editing.discountType, discountValue: editing.discountValue, minOrder: editing.minOrder, maxUses: editing.maxUses, expiresAt: new Date(editing.expiresAt as string).toISOString().split("T")[0], isActive: editing.isActive }}
          onClose={() => setEditing(null)}
          onSave={(form) => handleEdit(editing, form)}
        />
      )}
    </>
  );
}

// ─── Audit Log View (read-only) ───────────────────────────────────────────────

function AuditLogView({ search }: { search: string }) {
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-db-audit-log"],
    queryFn: async () => {
      const { data } = await api.get("/admin/audit-log", { params: { limit: 200 } });
      return data.entries ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.filter((e: any) =>
      !q || e.action?.toLowerCase().includes(q) || e.entityType?.toLowerCase().includes(q) || e.userId?.toLowerCase().includes(q),
    );
  }, [data, search]);

  async function handleExportCsv() {
    setExporting(true);
    try {
      const response = await api.get("/admin/audit-log/export", {
        params: { format: "csv" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${Date.now()}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-text-primary">{row.original.action}</span>,
    },
    {
      accessorKey: "entityType",
      header: "Entity",
      cell: ({ row }) => (
        <span className="text-xs text-text-secondary">
          {row.original.entityType ?? "—"}{row.original.entityId ? ` (${row.original.entityId.slice(0, 8)}…)` : ""}
        </span>
      ),
    },
    {
      accessorKey: "userId",
      header: "User ID",
      cell: ({ row }) => <code className="text-xs text-text-muted">{row.original.userId?.slice(0, 12) ?? "—"}…</code>,
    },
    { accessorKey: "ipAddress", header: "IP",     cell: ({ row }) => row.original.ipAddress ?? "—" },
    { accessorKey: "createdAt", header: "Time",   cell: ({ row }) => new Date(row.original.createdAt).toLocaleString("en-IN") },
  ], []);

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={handleExportCsv} disabled={exporting} className={primaryBtnCls}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <DataTable columns={columns} data={filtered} emptyLabel="No audit log entries." />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => <div key={i} className="bone-loader h-14 rounded-[12px]" />)}
    </div>
  );
}

export function AdminDatabasePage() {
  const [activeTable, setActiveTable] = useState<TableKey>("users");
  const [search, setSearch] = useState("");

  const activeConfig = TABLES.find((t) => t.key === activeTable)!;

  function handleTableChange(key: TableKey) {
    setActiveTable(key);
    setSearch("");
  }

  function renderTable() {
    switch (activeTable) {
      case "users":       return <UsersView search={search} />;
      case "restaurants": return <RestaurantsView search={search} />;
      case "menu-items":  return <MenuItemsView search={search} />;
      case "orders":      return <OrdersView search={search} />;
      case "reviews":     return <ReviewsView search={search} />;
      case "payments":    return <PaymentsView search={search} />;
      case "coupons":     return <CouponsView search={search} />;
      case "audit-log":   return <AuditLogView search={search} />;
    }
  }

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-48 flex-shrink-0">
        <div className="sticky top-6 rounded-[20px] border border-border bg-white p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">Tables</p>
          <nav className="space-y-0.5">
            {TABLES.map(({ key, label, icon: Icon, readonly }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleTableChange(key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-sm font-medium transition",
                  activeTable === key
                    ? "bg-brand-light text-brand"
                    : "text-text-secondary hover:bg-[#FAFAFA] hover:text-text-primary",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                {readonly && (
                  <span className="rounded text-[9px] font-bold uppercase text-text-muted">R</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Database</p>
          <h1 className="mt-1 text-3xl font-bold text-text-primary">{activeConfig.label}</h1>
          {activeConfig.readonly && (
            <p className="mt-1 text-xs text-text-muted">Read-only — modifications to this table are not permitted.</p>
          )}
        </div>

        {/* Search */}
        <div className="mb-4 flex w-full max-w-sm items-center gap-3 rounded-[16px] border border-border bg-white px-4 py-3">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            className="w-full border-0 bg-transparent text-sm outline-none"
            placeholder={`Search ${activeConfig.label.toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="text-text-muted hover:text-text-primary">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {renderTable()}
      </div>
    </div>
  );
}
