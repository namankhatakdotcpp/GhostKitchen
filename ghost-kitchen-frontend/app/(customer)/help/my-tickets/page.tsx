"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import api from "@/lib/api";

type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-yellow-100 text-yellow-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

export default function MyTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    api.get("/user/support/tickets")
      .then((r) => setTickets(r.data.tickets ?? []))
      .catch(() => toast.error("Could not load tickets"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1C1C1C]">My support tickets</h1>
        <Link href="/help" className="text-sm font-semibold text-brand hover:underline">+ New ticket</Link>
      </div>

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#686B78] text-sm">No support tickets yet.</p>
          <Link href="/help" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">Submit a ticket</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-white overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                className="w-full px-5 py-4 text-left"
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1C1C1C]">{t.subject}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                <p className="text-xs text-[#686B78] mt-1">{new Date(t.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              </button>
              {expanded === t.id && (
                <div className="px-5 pb-4 space-y-3 border-t border-border">
                  <p className="text-sm text-[#686B78] pt-3 leading-relaxed">{t.description}</p>
                  {t.adminReply && (
                    <div className="rounded-xl bg-orange-50 border border-orange-200 p-3">
                      <p className="text-xs font-semibold text-orange-700 mb-1">Support reply</p>
                      <p className="text-sm text-[#1C1C1C] leading-relaxed">{t.adminReply}</p>
                      <p className="text-xs text-[#686B78] mt-1">{t.repliedAt ? new Date(t.repliedAt).toLocaleDateString("en-IN") : ""}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
