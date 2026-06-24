"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { TrackedOrder } from "@/types";

type DeliveredCelebrationProps = {
  order: TrackedOrder;
};

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={filled ? "h-9 w-9 fill-brand text-brand" : "h-9 w-9 fill-none text-border"}
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 3.5l2.6 5.6 6 .76-4.4 4.2 1.18 6-5.38-3.1-5.38 3.1 1.18-6-4.4-4.2 6-.76L12 3.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDeliveryDuration(createdAt?: string | null, deliveredAt?: string | null): string | null {
  if (!createdAt || !deliveredAt) return null;
  const minutes = Math.round((new Date(deliveredAt).getTime() - new Date(createdAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return String(Math.max(minutes, 1));
}

export function DeliveredCelebration({ order }: DeliveredCelebrationProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState<"prompt" | "submitting" | "submitted" | "skipped">("prompt");
  const [error, setError] = useState<string | null>(null);

  // An order might already have been reviewed (e.g. the customer reopens
  // this page after reviewing once) — check first so the form doesn't
  // re-render and risk a confusing duplicate-submission error.
  useEffect(() => {
    let cancelled = false;
    api
      .get(`/reviews/can-review/${order.id}`)
      .then((res) => {
        if (!cancelled && res.data?.canReview === false) {
          setStage("submitted");
        }
      })
      .catch(() => { /* if the check fails, just show the prompt as normal */ });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  const minutes = formatDeliveryDuration(order.createdAt, order.deliveredAt);

  async function handleSubmitReview() {
    if (rating < 1) return;
    setStage("submitting");
    setError(null);
    try {
      await api.post("/reviews/create", {
        orderId: order.id,
        rating,
        comment: comment.trim() || undefined,
      });
      setStage("submitted");
    } catch (err: any) {
      setError(err?.error ?? "Could not submit your review — please try again.");
      setStage("prompt");
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 overflow-y-auto bg-surface"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-shell flex-col items-center px-4 py-10 md:px-6">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-light text-5xl"
          initial={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          🎉
        </motion.div>

        <motion.h1
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-center text-[28px] font-bold text-text-primary md:text-[34px]"
          initial={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          Thank you for ordering from GhostKitchen!
        </motion.h1>

        {minutes ? (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-3 text-center text-base font-semibold text-brand"
            initial={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.18 }}
          >
            Delivered in {minutes} minute{minutes === "1" ? "" : "s"}
          </motion.p>
        ) : null}

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3, delay: 0.22 }}
        >
          <Link href="/">
            <Button className="h-12 px-8 text-base">Order More</Button>
          </Link>
        </motion.div>

        {/* Review prompt — optional, never blocks the page */}
        {stage !== "submitted" ? (
          <motion.section
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <h2 className="text-center text-lg font-bold text-text-primary">
              How was your order from {order.restaurant?.name ?? "the restaurant"}?
            </h2>

            <div className="mt-4 flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
                  key={value}
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoverRating(value)}
                  onMouseLeave={() => setHoverRating(0)}
                  type="button"
                >
                  <StarIcon filled={value <= (hoverRating || rating)} />
                </button>
              ))}
            </div>

            <textarea
              className="mt-4 w-full resize-none rounded-[18px] border border-border bg-surface px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand"
              maxLength={1000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Tell us more (optional)"
              rows={3}
              value={comment}
            />

            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

            <div className="mt-4 flex items-center gap-3">
              <Button
                className="flex-1"
                disabled={rating < 1 || stage === "submitting"}
                onClick={handleSubmitReview}
              >
                {stage === "submitting" ? "Submitting…" : "Submit Review"}
              </Button>
              <button
                className="text-sm font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
                onClick={() => setStage("skipped")}
                type="button"
              >
                Maybe later
              </button>
            </div>
          </motion.section>
        ) : (
          <motion.p
            animate={{ opacity: 1 }}
            className="mt-8 text-sm font-semibold text-success"
            initial={{ opacity: 0 }}
          >
            Thanks for your feedback!
          </motion.p>
        )}

        <motion.section
          animate={{ opacity: 1 }}
          className="mt-8 w-full max-w-md rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]"
          initial={{ opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.36 }}
        >
          <p className="text-sm font-semibold text-text-primary">Order summary</p>
          <div className="mt-4 space-y-3">
            {(order.items ?? []).map((item: any) => (
              <div className="flex items-start justify-between gap-3" key={item.menuItemId ?? item.id}>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-text-primary">
                    {item.name ?? item.menuItem?.name}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">Qty {item.quantity}</p>
                </div>
                <span className="text-sm font-semibold text-text-primary">
                  ₹{(((item.price ?? 0) * (item.quantity ?? 0)) / 100).toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold text-text-primary">Total</span>
            <span className="font-bold text-text-primary">₹{((order.total ?? 0) / 100).toFixed(0)}</span>
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}
