"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, MessageSquare } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";

type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

const STATUSES = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];
const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState("RESOLVED");
  const [submitting, setSubmitting] = useState(false);

  function load(status?: string) {
    setLoading(true);
    const q = status && status !== "ALL" ? `?status=${status}` : "";
    api.get(`/admin/support/tickets${q}`)
      .then((r) => setTickets(r.data.tickets ?? []))
      .catch(() => toast.error("Could not load tickets"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(filter); }, [filter]);

  async function handleReply() {
    if (!selected || !reply.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/admin/support/tickets/${selected.id}/reply`, { adminReply: reply, status: replyStatus });
      toast.success("Reply sent!");
      setSelected(null);
      setReply("");
      load(filter);
    } catch {
      toast.error("Could not send reply");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1C1C]">Support Tickets</h1>
        <p className="text-sm text-[#686B78] mt-1">Customer support requests</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${filter === s ? "bg-brand text-white" : "border border-border bg-white text-[#686B78] hover:border-brand hover:text-brand"}`}
            type="button"
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Ticket list */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-10 w-10 text-brand/30 mx-auto mb-3" />
              <p className="text-sm text-[#686B78]">No tickets</p>
            </div>
          ) : tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => { setSelected(t); setReply(t.adminReply ?? ""); setReplyStatus(t.status === "OPEN" ? "IN_PROGRESS" : "RESOLVED"); }}
              className={`w-full text-left rounded-2xl border bg-white p-4 transition hover:border-brand ${selected?.id === t.id ? "border-brand shadow-sm" : "border-border"}`}
              type="button"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[#1C1C1C] line-clamp-1">{t.subject}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {t.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-[#686B78] mt-1">{t.user.name} · {t.user.email}</p>
              <p className="text-xs text-[#686B78] mt-0.5">{new Date(t.createdAt).toLocaleDateString("en-IN")}</p>
            </button>
          ))}
        </div>

        {/* Detail + reply */}
        {selected ? (
          <div className="rounded-2xl border border-border bg-white p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between">
              <p className="font-bold text-[#1C1C1C]">{selected.subject}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[selected.status] ?? ""}`}>{selected.status}</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#686B78] mb-1">From: {selected.user.name} ({selected.user.email})</p>
              <p className="text-sm text-[#1C1C1C] leading-relaxed bg-surface rounded-xl p-3">{selected.description}</p>
            </div>
            {selected.adminReply && (
              <div className="bg-orange-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-orange-700 mb-1">Previous reply</p>
                <p className="text-sm text-[#1C1C1C]">{selected.adminReply}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Reply</label>
              <textarea
                value={reply}
                onChange={e => setReply(e.target.value)}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                placeholder="Type your reply…"
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                value={replyStatus}
                onChange={e => setReplyStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {["IN_PROGRESS", "RESOLVED", "CLOSED"].map(s => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
              <button
                onClick={handleReply}
                disabled={submitting || !reply.trim()}
                className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60 transition"
                type="button"
              >
                {submitting ? "Sending…" : "Send reply & update status"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border flex items-center justify-center h-48">
            <p className="text-sm text-[#686B78]">Select a ticket to reply</p>
          </div>
        )}
      </div>
    </div>
  );
}
