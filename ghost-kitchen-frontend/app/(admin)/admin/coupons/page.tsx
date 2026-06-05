"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { X, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { toRupees } from "@/lib/utils";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FLAT";
  discountValue: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt: string;
  restaurantId: string | null;
}

const BLANK_FORM = {
  code: "",
  description: "",
  discountType: "PERCENTAGE" as "PERCENTAGE" | "FLAT",
  discountValue: "",
  minOrder: "",
  maxUses: "",
  expiresAt: "",
  restaurantId: "",
  isActive: true,
};

export default function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => api.get("/admin/coupons").then((r) => r.data),
  });

  const coupons: Coupon[] = data?.coupons ?? [];

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
    setSlideOpen(true);
  }

  function openEdit(c: Coupon) {
    setEditingId(c.id);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discountType: c.discountType,
      discountValue: c.discountType === "FLAT" ? String(toRupees(c.discountValue)) : String(c.discountValue),
      minOrder: String(toRupees(c.minOrder)),
      maxUses: String(c.maxUses),
      expiresAt: c.expiresAt.split("T")[0],
      restaurantId: c.restaurantId ?? "",
      isActive: c.isActive,
    });
    setSlideOpen(true);
  }

  async function handleSave() {
    if (!form.code || !form.discountValue || !form.minOrder || !form.maxUses || !form.expiresAt) {
      toast.error("Please fill all required fields");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: form.code.toUpperCase(),
        description: form.description || null,
        discountType: form.discountType,
        discountValue: form.discountType === "FLAT"
          ? Math.round(parseFloat(form.discountValue) * 100)
          : parseFloat(form.discountValue),
        minOrder: Math.round(parseFloat(form.minOrder) * 100),
        maxUses: parseInt(form.maxUses),
        expiresAt: form.expiresAt,
        restaurantId: form.restaurantId || null,
        isActive: form.isActive,
      };
      if (editingId) {
        await api.put(`/admin/coupons/${editingId}`, payload);
        toast.success("Coupon updated");
      } else {
        await api.post("/admin/coupons", payload);
        toast.success("Coupon created");
      }
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      setSlideOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Deactivate this coupon?")) return;
    try {
      await api.delete(`/admin/coupons/${id}`);
      toast.success("Coupon deactivated");
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
    } catch {
      toast.error("Failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Promotions</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Coupons</h1>
          <p className="mt-2 text-sm text-text-secondary">Create and manage discount codes.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" /> Create Coupon
        </button>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
      ) : (
        <div className="rounded-[20px] border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#FAFAFA]">
              <tr>
                {["Code", "Type", "Value", "Min Order", "Used/Max", "Expires", "Active", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">No coupons yet.</td>
                </tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-semibold font-mono">{c.code}</td>
                    <td className="px-4 py-3">{c.discountType}</td>
                    <td className="px-4 py-3">
                      {c.discountType === "PERCENTAGE"
                        ? `${c.discountValue}% off`
                        : `₹${toRupees(c.discountValue)} off`}
                    </td>
                    <td className="px-4 py-3">Min ₹{toRupees(c.minOrder)}</td>
                    <td className="px-4 py-3">
                      <span className="text-text-primary font-semibold">{c.usedCount}</span>
                      <span className="text-text-muted">/{c.maxUses}</span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{new Date(c.expiresAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEdit(c)} className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-primary hover:text-brand">
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(c.id)} className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-danger hover:bg-red-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {slideOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSlideOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-white p-6 shadow-[-24px_0_60px_rgba(0,0,0,0.10)] overflow-y-auto"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-text-primary">{editingId ? "Edit Coupon" : "Create Coupon"}</h2>
                <button type="button" onClick={() => setSlideOpen(false)} className="rounded-full border border-border p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">Code *</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-mono focus:border-brand focus:outline-none"
                    placeholder="GHOST20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">Description</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
                    placeholder="20% off your first order"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Type *</label>
                  <div className="flex gap-3">
                    {(["PERCENTAGE", "FLAT"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, discountType: t })}
                        className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${form.discountType === t ? "border-brand bg-brand-light text-brand" : "border-border text-text-secondary"}`}
                      >
                        {t === "PERCENTAGE" ? "%" : "₹"} {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1">
                      Value {form.discountType === "PERCENTAGE" ? "(%)" : "(₹)"} *
                    </label>
                    <input
                      type="number"
                      value={form.discountValue}
                      onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
                      className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Min order ₹ *</label>
                    <input
                      type="number"
                      value={form.minOrder}
                      onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
                      className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold mb-1">Max uses *</label>
                    <input
                      type="number"
                      value={form.maxUses}
                      onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                      className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">Expires *</label>
                    <input
                      type="date"
                      value={form.expiresAt}
                      onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                      className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="accent-brand"
                  />
                  <span className="text-sm font-medium">Active</span>
                </label>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand/90 disabled:bg-gray-300 transition"
                >
                  {saving ? "Saving…" : editingId ? "Save changes" : "Create coupon"}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
