"use client";

import { useEffect, useState } from "react";
import { Gift, Plus } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";

type GiftCard = {
  id: string;
  code: string;
  originalValuePaise: number;
  remainingValuePaise: number;
  expiresAt: string | null;
  createdAt: string;
  purchasedBy: { name: string; email: string } | null;
  redeemedBy: { name: string; email: string } | null;
};

export default function AdminGiftCardsPage() {
  const [cards, setCards] = useState<GiftCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [valuePaise, setValuePaise] = useState(50000);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    api.get("/admin/gift-cards")
      .then((r) => setCards(r.data.cards ?? []))
      .catch(() => toast.error("Could not load gift cards"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreating(true);
    try {
      await api.post("/admin/gift-cards", {
        valuePaise,
        expiresAt: expiresAt || null,
      });
      toast.success("Gift card created!");
      setShowForm(false);
      load();
    } catch {
      toast.error("Could not create gift card");
    } finally {
      setCreating(false);
    }
  }

  const r = (p: number) => (p / 100).toFixed(0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1C1C1C]">Gift Cards</h1>
          <p className="text-sm text-[#686B78] mt-1">Create and manage gift cards for customers</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand/90 transition"
          type="button"
        >
          <Plus className="h-4 w-4" />
          Create gift card
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 space-y-4">
          <h2 className="font-bold text-[#1C1C1C]">New gift card</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Value (₹)</label>
              <input
                type="number"
                min={10}
                value={valuePaise / 100}
                onChange={e => setValuePaise(Math.round(Number(e.target.value) * 100))}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Expires at (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60 transition"
              type="button"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-[#686B78] hover:underline" type="button">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12">
          <Gift className="h-10 w-10 text-brand/30 mx-auto mb-3" />
          <p className="text-sm text-[#686B78]">No gift cards yet. Create one above.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#FAFAFA] text-[#686B78]">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Code</th>
                <th className="px-5 py-3 text-right font-medium">Value</th>
                <th className="px-5 py-3 text-right font-medium">Remaining</th>
                <th className="px-5 py-3 text-left font-medium">Redeemed by</th>
                <th className="px-5 py-3 text-left font-medium">Expires</th>
                <th className="px-5 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {cards.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 font-mono font-bold text-brand">{c.code}</td>
                  <td className="px-5 py-3 text-right">₹{r(c.originalValuePaise)}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={c.remainingValuePaise <= 0 ? "text-gray-400" : "text-green-700 font-semibold"}>
                      ₹{r(c.remainingValuePaise)}
                    </span>
                  </td>
                  <td className="px-5 py-3">{c.redeemedBy ? c.redeemedBy.name : <span className="text-gray-400">—</span>}</td>
                  <td className="px-5 py-3">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("en-IN") : <span className="text-gray-400">Never</span>}</td>
                  <td className="px-5 py-3 text-[#686B78]">{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
