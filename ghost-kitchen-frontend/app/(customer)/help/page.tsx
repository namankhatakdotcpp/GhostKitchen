"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, TicketIcon } from "lucide-react";
import Link from "next/link";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const FAQ = [
  { q: "How long does delivery take?", a: "Average delivery is 30–45 minutes depending on your location and restaurant distance. The estimated time is shown on the order tracking page." },
  { q: "Can I cancel my order?", a: "You can cancel your order before the restaurant confirms it. Once confirmed, cancellation is not possible. Contact support if you need help." },
  { q: "What payment methods are accepted?", a: "We accept online payment (UPI, credit/debit cards, netbanking) and Cash on Delivery (COD) for eligible orders." },
  { q: "How do I use a coupon code?", a: "Enter your coupon code at checkout in the 'Coupon code' field and click Apply. Discount will be deducted from your order total." },
  { q: "How do I earn and redeem wallet points?", a: "You earn points on every delivered order. Points can be redeemed as a discount at checkout (COD orders)." },
  { q: "What is the referral program?", a: "Share your unique referral code with friends. When they place their first order, you both earn ₹50 in wallet credits." },
  { q: "How do gift cards work?", a: "Enter your gift card code at checkout. The balance is automatically deducted from your order total." },
  { q: "My order hasn't arrived — what do I do?", a: "Check the tracking page for your order status. If the rider is significantly delayed, contact support below." },
  { q: "Can I schedule an order for later?", a: "Yes! At checkout, toggle 'Schedule for later' and pick a date and time at least 30 minutes from now." },
  { q: "How do I report a missing item?", a: "Please submit a support ticket below with your order ID and the missing item details. We'll investigate and resolve it quickly." },
];

export default function HelpPage() {
  const { isAuthenticated } = useAuthStore();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [orderId, setOrderId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) { toast.error("Please fill all required fields"); return; }
    setSubmitting(true);
    try {
      await api.post("/user/support/tickets", { subject, description, orderId: orderId || undefined });
      setSubmitted(true);
      toast.success("Ticket submitted! We'll get back to you soon.");
    } catch {
      toast.error("Could not submit ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1C1C]">Help Center</h1>
        <p className="text-sm text-[#686B78] mt-1">Find answers to common questions or contact us</p>
      </div>

      {/* FAQ */}
      <section>
        <h2 className="text-base font-bold text-[#1C1C1C] mb-4">Frequently asked questions</h2>
        <div className="rounded-2xl border border-border bg-white overflow-hidden divide-y divide-border">
          {FAQ.map((item, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface transition"
                type="button"
              >
                <span className="text-sm font-medium text-[#1C1C1C] pr-4">{item.q}</span>
                {openIdx === i ? (
                  <ChevronUp className="h-4 w-4 text-[#686B78] shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#686B78] shrink-0" />
                )}
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-[#686B78] leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Support ticket */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#1C1C1C]">Contact support</h2>
          {isAuthenticated && (
            <Link href="/help/my-tickets" className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
              <TicketIcon className="h-3.5 w-3.5" />
              My tickets
            </Link>
          )}
        </div>

        {!isAuthenticated ? (
          <div className="rounded-2xl border border-border bg-white p-6 text-center">
            <MessageSquare className="h-10 w-10 text-brand/40 mx-auto mb-3" />
            <p className="text-sm text-[#686B78]">Please <Link href="/login" className="text-brand font-semibold hover:underline">sign in</Link> to submit a support ticket.</p>
          </div>
        ) : submitted ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
            <p className="text-lg font-bold text-green-700">Ticket submitted!</p>
            <p className="text-sm text-green-600 mt-1">We'll reply within 24 hours. Check <Link href="/help/my-tickets" className="underline">My tickets</Link> for updates.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-white p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Subject *</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Wrong item delivered"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Order ID (optional)</label>
              <input
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                placeholder="e.g. abc123"
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#686B78] mb-1">Description *</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Please describe your issue in detail..."
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand/90 disabled:opacity-60 transition"
            >
              {submitting ? "Submitting…" : "Submit ticket"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
