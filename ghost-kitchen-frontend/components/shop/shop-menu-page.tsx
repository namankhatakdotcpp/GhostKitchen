"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Star, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────
interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number | string;
  category: string;
  imageUrl: string;
  isVeg: boolean;
  isAvailable: boolean;
  isBestseller: boolean;
  sortOrder: number;
}

const itemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().default(""),
  price: z.coerce.number().min(1, "Price must be > 0"),
  category: z.string().min(1, "Category is required"),
  isVeg: z.boolean(),
  imageUrl: z.string().default(""),
  isBestseller: z.boolean(),
  sortOrder: z.coerce.number().default(0),
});
type ItemForm = z.infer<typeof itemSchema>;

const BLANK_FORM: ItemForm = { name: "", description: "", price: 0, category: "", isVeg: true, imageUrl: "", isBestseller: false, sortOrder: 0 };

// ─── Helpers ──────────────────────────────────────────────────
const toRupees = (p: number | string) => Number(p);

// ─── Sub-components ───────────────────────────────────────────
function AvailabilitySwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-success" : "bg-gray-200"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

function MenuItemCard({
  item, onEdit, onDelete, onToggleAvailable, onToggleBestseller,
}: {
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailable: (id: string) => void;
  onToggleBestseller: (id: string) => void;
}) {
  const price = toRupees(item.price);
  return (
    <div className={cn("rounded-[18px] border bg-white p-4 shadow-[0_8px_20px_rgba(28,28,28,0.05)] transition", !item.isAvailable && "opacity-60")}>
      <div className="grid grid-cols-[72px_1fr] gap-3">
        <div className="relative h-[72px] w-[72px] overflow-hidden rounded-[12px] border border-border">
          {item.imageUrl ? (
            <Image alt={item.name} className="object-cover" fill sizes="72px" src={item.imageUrl} unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center bg-gray-100 text-2xl">🍽️</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded-full border-[1.5px] ${item.isVeg ? "border-green-500 bg-green-500" : "border-red-500 bg-red-500"}`} />
                <p className="line-clamp-1 text-sm font-semibold text-text-primary">{item.name}</p>
              </div>
              <p className="mt-1 text-sm font-bold text-[#FF5200]">₹{price}</p>
              <span className="mt-1 inline-block rounded-full bg-[#F5F5F5] px-2 py-0.5 text-[10px] font-medium text-[#686B78]">{item.category}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => onToggleBestseller(item.id)}
                className={cn("rounded-full p-1.5 transition", item.isBestseller ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400")}>
                <Star className="h-4 w-4" fill={item.isBestseller ? "currentColor" : "none"} />
              </button>
              <button type="button" onClick={() => onEdit(item)}
                className="rounded-full bg-[#F5F5F5] p-1.5 text-text-secondary transition hover:bg-brand-light hover:text-brand">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L5 13 2 14l1-3 8.5-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button type="button" onClick={() => onDelete(item.id)}
                className="rounded-full bg-red-50 p-1.5 text-red-500 transition hover:bg-red-100">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-text-muted">{item.isAvailable ? "Visible" : "Hidden"}</span>
            <AvailabilitySwitch checked={item.isAvailable} onChange={() => onToggleAvailable(item.id)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add/Edit Sheet ───────────────────────────────────────────
function ItemSheet({
  open, initial, restaurantId, categories, onClose, onSaved,
}: {
  open: boolean;
  initial: MenuItem | null;
  restaurantId: string;
  categories: string[];
  onClose: () => void;
  onSaved: (item: MenuItem) => void;
}) {
  const [form, setForm] = useState<ItemForm>(BLANK_FORM);
  const [newCategory, setNewCategory] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial ? { name: initial.name, description: initial.description, price: toRupees(initial.price), category: initial.category, isVeg: initial.isVeg, imageUrl: initial.imageUrl, isBestseller: initial.isBestseller, sortOrder: initial.sortOrder } : BLANK_FORM);
      setErrors({});
    }
  }, [open, initial]);

  async function handleSave() {
    const parsed = itemSchema.safeParse(form);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const err of parsed.error.errors) e[err.path[0] as string] = err.message;
      setErrors(e);
      return;
    }
    setSaving(true);
    try {
      const payload = { ...parsed.data, price: parsed.data.price, category: newCategory || parsed.data.category };
      let saved: MenuItem;
      if (initial) {
        const res = await api.put(`/restaurants/${restaurantId}/menu/${initial.id}`, payload);
        saved = res.data.menuItem ?? { ...initial, ...payload };
      } else {
        const res = await api.post(`/restaurants/${restaurantId}/menu`, payload);
        saved = res.data.menuItem;
      }
      onSaved(saved);
      onClose();
      toast.success(initial ? "Item updated" : "Item added");
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const allCategories = Array.from(new Set([...categories, newCategory].filter(Boolean)));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-[28px] bg-white px-5 py-6"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary">{initial ? "Edit item" : "Add new item"}</h2>
              <button type="button" onClick={onClose} className="rounded-full border border-border p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none" />
                  {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full resize-none rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Price ₹ *</label>
                  <input type="number" min={1} value={form.price} onChange={e => setForm({ ...form, price: +e.target.value })} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none" />
                  {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Sort order</label>
                  <input type="number" min={0} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: +e.target.value })} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Category</label>
                <div className="flex gap-2">
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm bg-white focus:border-brand focus:outline-none">
                    <option value="">Select category</option>
                    {allCategories.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="New category" className="w-36 rounded-xl border border-border px-3 py-2.5 text-sm focus:border-brand focus:outline-none" />
                </div>
                {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setForm({ ...form, isVeg: true })}
                  className={cn("flex-1 rounded-xl border py-3 text-sm font-semibold transition", form.isVeg ? "border-green-500 bg-green-50 text-green-700" : "border-border text-text-secondary")}>
                  🟢 Veg
                </button>
                <button type="button" onClick={() => setForm({ ...form, isVeg: false })}
                  className={cn("flex-1 rounded-xl border py-3 text-sm font-semibold transition", !form.isVeg ? "border-red-500 bg-red-50 text-red-700" : "border-border text-text-secondary")}>
                  🔴 Non-veg
                </button>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Item photo URL</label>
                <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none" placeholder="https://…" />
                {form.imageUrl && (
                  <div className="mt-2 relative h-28 overflow-hidden rounded-xl border border-border">
                    <Image src={form.imageUrl} alt="preview" fill className="object-cover" unoptimized />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isBestseller} onChange={e => setForm({ ...form, isBestseller: e.target.checked })} className="accent-brand" />
                <span className="text-sm">Mark as bestseller ⭐</span>
              </label>
              <Button className="w-full rounded-xl h-12" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : initial ? "Save changes" : "Add item"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export function ShopMenuPage() {
  const queryClient = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Fetch my restaurant
  const restaurantQuery = useQuery({
    queryKey: ["my-restaurant"],
    queryFn: () => api.get("/restaurants/mine").then(r => r.data?.data ?? r.data),
  });
  const restaurantId: string | null = restaurantQuery.data?.id ?? null;

  // Fetch menu grouped by category
  const menuQuery = useQuery<MenuItem[]>({
    queryKey: ["shop-menu-full", restaurantId],
    queryFn: async () => {
      const byCategory: Record<string, any[]> = await api
        .get(`/restaurants/${restaurantId}/menu`)
        .then(r => r.data);
      return Object.entries(byCategory).flatMap(([cat, items]) =>
        items.map((item: any): MenuItem => ({
          id: item.id,
          restaurantId: restaurantId!,
          name: item.name,
          description: item.description ?? "",
          price: Number(item.price),
          category: cat,
          imageUrl: item.imageUrl ?? "",
          isVeg: item.isVeg ?? false,
          isAvailable: item.isAvailable ?? true,
          isBestseller: item.isBestseller ?? false,
          sortOrder: item.sortOrder ?? 0,
        }))
      );
    },
    enabled: !!restaurantId,
  });

  const items: MenuItem[] = menuQuery.data ?? [];
  const categories = useMemo(() => Array.from(new Set(items.map(i => i.category))), [items]);

  const filteredItems = useMemo(() =>
    activeCategory === "All" ? items : items.filter(i => i.category === activeCategory),
    [items, activeCategory]
  );

  const isOpen: boolean = restaurantQuery.data?.isOpen ?? true;

  async function handleToggleOpen() {
    if (!restaurantId) return;
    try {
      await api.patch(`/restaurants/${restaurantId}/status`);
      queryClient.invalidateQueries({ queryKey: ["my-restaurant"] });
      toast.success(isOpen ? "Restaurant closed" : "Restaurant opened");
    } catch { toast.error("Failed to update status"); }
  }

  async function handleToggleAvailable(itemId: string) {
    if (!restaurantId) return;
    try {
      await api.patch(`/restaurants/${restaurantId}/menu/${itemId}/toggle`);
      queryClient.setQueryData<MenuItem[]>(["shop-menu-full", restaurantId], prev =>
        prev?.map(i => i.id === itemId ? { ...i, isAvailable: !i.isAvailable } : i)
      );
    } catch { toast.error("Failed to update availability"); }
  }

  async function handleToggleBestseller(itemId: string) {
    if (!restaurantId) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    try {
      await api.put(`/restaurants/${restaurantId}/menu/${itemId}`, { isBestseller: !item.isBestseller });
      queryClient.setQueryData<MenuItem[]>(["shop-menu-full", restaurantId], prev =>
        prev?.map(i => i.id === itemId ? { ...i, isBestseller: !i.isBestseller } : i)
      );
    } catch { toast.error("Failed"); }
  }

  async function handleDelete(itemId: string) {
    if (!restaurantId) return;
    try {
      await api.delete(`/restaurants/${restaurantId}/menu/${itemId}`);
      queryClient.setQueryData<MenuItem[]>(["shop-menu-full", restaurantId], prev =>
        prev?.filter(i => i.id !== itemId)
      );
      setDeleteConfirmId(null);
      toast.success("Item deleted");
    } catch { toast.error("Delete failed"); }
  }

  function handleSaved(saved: MenuItem) {
    queryClient.setQueryData<MenuItem[]>(["shop-menu-full", restaurantId], prev => {
      if (!prev) return [saved];
      const idx = prev.findIndex(i => i.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      return prev.map(i => i.id === saved.id ? saved : i);
    });
  }

  if (menuQuery.isLoading || restaurantQuery.isLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="w-64 border-r border-border p-4 space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-100" />)}
        </div>
        <div className="flex-1 p-6 grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-32 animate-pulse rounded-[18px] bg-gray-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      {/* LEFT — Category panel */}
      <aside className="w-64 shrink-0 border-r border-border bg-[#FAFAFA] flex flex-col">
        <div className="border-b border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Categories</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {["All", ...categories].map(cat => {
            const count = cat === "All" ? items.length : items.filter(i => i.category === cat).length;
            return (
              <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                className={cn("flex w-full items-center justify-between px-4 py-2.5 text-sm transition", activeCategory === cat ? "bg-brand-light font-semibold text-brand" : "text-text-secondary hover:bg-white hover:text-text-primary")}>
                <span>{cat}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", activeCategory === cat ? "bg-brand text-white" : "bg-border text-text-muted")}>{count}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <input value={newCategoryInput} onChange={e => setNewCategoryInput(e.target.value)} placeholder="+ Add category" className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none" />
        </div>
      </aside>

      {/* RIGHT — Items grid */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white px-6 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-text-primary">Menu</h1>
            <span className="text-sm text-text-secondary">{filteredItems.length} items{activeCategory !== "All" ? ` in ${activeCategory}` : ""}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Open/Closed toggle */}
            <button type="button" onClick={handleToggleOpen}
              className={cn("flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition", isOpen ? "border-success bg-success/10 text-success" : "border-red-300 bg-red-50 text-red-600")}>
              <span className={cn("h-2 w-2 rounded-full", isOpen ? "bg-success" : "bg-red-500")} />
              Restaurant is {isOpen ? "OPEN" : "CLOSED"}
            </button>
            <Button onClick={() => { setEditingItem(null); setSheetOpen(true); }} className="h-9 gap-1.5 rounded-xl text-sm">
              <Plus className="h-4 w-4" /> Add item
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="p-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-border py-16 text-center">
              <p className="text-lg font-semibold text-text-primary">No items here yet</p>
              <p className="mt-2 text-sm text-text-secondary">Click &quot;Add item&quot; to add your first dish</p>
              <Button className="mt-5" onClick={() => { setEditingItem(null); setSheetOpen(true); }}>Add first item</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {filteredItems.map(item => (
                <MenuItemCard key={item.id} item={item}
                  onEdit={(i) => { setEditingItem(i); setSheetOpen(true); }}
                  onDelete={(id) => setDeleteConfirmId(id)}
                  onToggleAvailable={handleToggleAvailable}
                  onToggleBestseller={handleToggleBestseller}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add/Edit sheet */}
      <ItemSheet
        open={sheetOpen}
        initial={editingItem}
        restaurantId={restaurantId ?? ""}
        categories={categories}
        onClose={() => { setSheetOpen(false); setEditingItem(null); }}
        onSaved={handleSaved}
      />

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirmId && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDeleteConfirmId(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
              <h3 className="text-lg font-bold">Delete item?</h3>
              <p className="mt-2 text-sm text-text-secondary">This action cannot be undone.</p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold" type="button">Cancel</button>
                <button onClick={() => handleDelete(deleteConfirmId)} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white" type="button">Delete</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
