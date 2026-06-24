"use client";

import { useRef } from "react";

// Purely visual for now — no click/filter wiring (explicit decision, see
// Feature 3 in the customer-portal spec: filtering is a separate future
// feature). Circular emoji placeholders instead of fetched images — no
// real image CDN was wired up, and a broken <img> is worse than a clean
// colored circle with an emoji.
const moodCategories = [
  { label: "North Indian", emoji: "🍛", bg: "bg-brand-light" },
  { label: "Pizzas", emoji: "🍕", bg: "bg-[#FFE8D6]" },
  { label: "Cakes", emoji: "🍰", bg: "bg-[#FDEBEF]" },
  { label: "Burgers", emoji: "🍔", bg: "bg-[#FFF3D6]" },
  { label: "Desserts", emoji: "🍨", bg: "bg-[#F1EBFF]" },
  { label: "Momos", emoji: "🥟", bg: "bg-[#E8F6EE]" },
  { label: "Chinese", emoji: "🥡", bg: "bg-[#FFEAD9]" },
] as const;

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
            <div className={`flex h-20 w-20 items-center justify-center rounded-full text-4xl ${category.bg}`}>
              <span aria-hidden="true">{category.emoji}</span>
            </div>
            <span className="text-xs font-semibold text-text-primary">{category.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
