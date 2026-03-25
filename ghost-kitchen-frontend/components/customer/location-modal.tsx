"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { popularLocations } from "@/lib/mockData";
import { useUserStore } from "@/store/userStore";
import type { LocationOption } from "@/types";

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 21s6-5.33 6-11a6 6 0 1 0-12 0c0 5.67 6 11 6 11Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" fill="currentColor" r="2.25" />
    </svg>
  );
}

export function LocationModal() {
  const { isLocationModalOpen, closeLocationModal, setLocation } = useUserStore();
  const [query, setQuery] = useState("");

  const matchingLocations = popularLocations.filter((location) =>
    location.label.toLowerCase().includes(query.toLowerCase()),
  );

  function handleSelect(location: LocationOption) {
    setLocation(location);
    setQuery("");
  }

  return (
    <AnimatePresence>
      {isLocationModalOpen ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1C]/50 p-4"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={closeLocationModal}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-lg rounded-[28px] border border-border bg-white p-5 shadow-[0_24px_80px_rgba(28,28,28,0.18)]"
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            onClick={(event) => event.stopPropagation()}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
                  Delivery area
                </p>
                <h2 className="mt-2 text-2xl font-bold text-text-primary">
                  Choose your location
                </h2>
              </div>
              <button
                aria-label="Close location selector"
                className="rounded-full border border-border p-2 text-text-secondary transition hover:border-brand/40 hover:text-brand"
                onClick={closeLocationModal}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-3 focus-within:border-brand focus-within:bg-white focus-within:shadow-focus">
              <div className="flex items-center gap-3 text-text-secondary">
                <PinIcon />
                <input
                  className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by area or city"
                  value={query}
                />
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {matchingLocations.map((location) => (
                <button
                  className="flex w-full items-center justify-between rounded-2xl border border-border px-4 py-3 text-left transition hover:border-brand/30 hover:bg-brand-light"
                  key={location.id}
                  onClick={() => handleSelect(location)}
                  type="button"
                >
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {location.label}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary">
                      Fast delivery available
                    </p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    {location.city}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
