"use client";

import Image from "next/image";
import { useRef } from "react";

// Purely visual for now — no click/filter wiring (explicit decision, see
// Feature 3 in the customer-portal spec: filtering is a separate future
// feature). Hot-linked directly from Unsplash (images.unsplash.com is
// already in next.config.js's remotePatterns) — no download/storage in
// the repo, sized via Unsplash's own URL params for a small circular
// thumbnail instead of shipping a full-resolution image.
const moodCategories = [
  { label: "North Indian", photoId: "1631452180539-96aca7d48617" },
  { label: "Pizzas", photoId: "1513104890138-7c749659a591" },
  { label: "Cakes", photoId: "1578985545062-69928b1d9587" },
  { label: "Burgers", photoId: "1568901346375-23c9450c58cd" },
  { label: "Desserts", photoId: "1551024601-bec78aea704b" },
  { label: "Momos", photoId: "1496116218417-1a781b1c416c" },
  { label: "Chinese", photoId: "1525755662778-989d0524087e" },
] as const;

function moodImageUrl(photoId: string) {
  return `https://images.unsplash.com/photo-${photoId}?w=200&h=200&fit=crop&q=80`;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function MoodCategoryStrip() {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function scrollBy(direction: "left" | "right") {
    scrollRef.current?.scrollBy({ left: direction === "left" ? -220 : 220, behavior: "smooth" });
  }

  return (
    <section className="mt-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text-primary">What&apos;s on your mind?</h2>
        <div className="flex items-center gap-2">
          <button
            aria-label="Scroll left"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-text-secondary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
            onClick={() => scrollBy("left")}
            type="button"
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            aria-label="Scroll right"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-white text-text-secondary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
            onClick={() => scrollBy("right")}
            type="button"
          >
            <ArrowIcon direction="right" />
          </button>
        </div>
      </div>

      <div className="scrollbar-none mt-4 flex gap-5 overflow-x-auto pb-2" ref={scrollRef}>
        {moodCategories.map((category) => (
          <div className="flex shrink-0 flex-col items-center gap-2" key={category.label}>
            <div className="relative h-20 w-20 overflow-hidden rounded-full border border-border">
              <Image
                alt={category.label}
                className="object-cover"
                fill
                sizes="80px"
                src={moodImageUrl(category.photoId)}
              />
            </div>
            <span className="text-xs font-semibold text-text-primary">{category.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
