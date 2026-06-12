"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { RestaurantCard } from "@/components/customer/restaurant-card";
import { Search, SlidersHorizontal, X } from "lucide-react";

const CUISINES = ["Indian", "Chinese", "Pizza", "Burger", "Biryani", "South Indian", "North Indian", "Desserts", "Beverages", "Fast Food"];

interface Filters {
  isVeg: boolean;
  isOpen: boolean;
  minRating: string;
  cuisine: string;
  maxDeliveryTime: string;
}

const DEFAULT_FILTERS: Filters = { isVeg: false, isOpen: false, minRating: "", cuisine: "", maxDeliveryTime: "" };

function FilterPanel({ filters, onChange, onClose }: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<Filters>(filters);
  const hasFilters = local.isVeg || local.isOpen || !!local.minRating || !!local.cuisine || !!local.maxDeliveryTime;

  function apply() { onChange(local); onClose(); }
  function reset() { const f = DEFAULT_FILTERS; setLocal(f); onChange(f); onClose(); }

  return (
    <div className="rounded-[20px] border border-border bg-white p-5 shadow-md space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-text-primary">Filters</p>
        <button onClick={onClose}><X className="h-4 w-4 text-text-muted" /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 hover:border-brand/30">
          <input type="checkbox" checked={local.isVeg} onChange={(e) => setLocal({ ...local, isVeg: e.target.checked })} className="accent-green-500" />
          <span className="text-sm font-medium">Pure Veg</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border p-3 hover:border-brand/30">
          <input type="checkbox" checked={local.isOpen} onChange={(e) => setLocal({ ...local, isOpen: e.target.checked })} className="accent-brand" />
          <span className="text-sm font-medium">Open Now</span>
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Min Rating</p>
        <div className="flex gap-2 flex-wrap">
          {["", "3", "3.5", "4", "4.5"].map((r) => (
            <button key={r} onClick={() => setLocal({ ...local, minRating: r })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${local.minRating === r ? "border-brand bg-brand text-white" : "border-border bg-white text-text-secondary hover:border-brand/30"}`}>
              {r ? `${r}+` : "Any"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Max Delivery Time</p>
        <div className="flex gap-2 flex-wrap">
          {["", "20", "30", "45"].map((t) => (
            <button key={t} onClick={() => setLocal({ ...local, maxDeliveryTime: t })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${local.maxDeliveryTime === t ? "border-brand bg-brand text-white" : "border-border bg-white text-text-secondary hover:border-brand/30"}`}>
              {t ? `≤${t} min` : "Any"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Cuisine</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setLocal({ ...local, cuisine: "" })}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${!local.cuisine ? "border-brand bg-brand text-white" : "border-border bg-white text-text-secondary hover:border-brand/30"}`}>
            All
          </button>
          {CUISINES.map((c) => (
            <button key={c} onClick={() => setLocal({ ...local, cuisine: local.cuisine === c ? "" : c })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${local.cuisine === c ? "border-brand bg-brand text-white" : "border-border bg-white text-text-secondary hover:border-brand/30"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={apply} className="flex-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90">
          Apply
        </button>
        {hasFilters && (
          <button onClick={reset} className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text-secondary hover:border-brand/30">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function SearchResults({ q, filters }: { q: string; filters: Filters }) {
  const hasQuery = q.trim().length > 0 || filters.isVeg || filters.isOpen || !!filters.minRating || !!filters.cuisine || !!filters.maxDeliveryTime;

  const { data, isLoading } = useQuery({
    queryKey: ["search", q, filters],
    queryFn: () =>
      api.get("/restaurants", {
        params: {
          search: q || undefined,
          limit: 24,
          isVeg: filters.isVeg ? "true" : undefined,
          isOpen: filters.isOpen ? "true" : undefined,
          minRating: filters.minRating || undefined,
          cuisine: filters.cuisine || undefined,
        },
      }).then((r) => r.data?.data ?? r.data),
    enabled: hasQuery,
  });

  const allRestaurants = data?.restaurants ?? [];
  const restaurants = allRestaurants.filter((r: any) => {
    if (!filters.maxDeliveryTime) return true;
    return (r.address?.deliveryTime ?? 30) <= Number(filters.maxDeliveryTime);
  });

  if (!hasQuery) {
    return (
      <div className="flex flex-col items-center py-20 text-center text-text-muted">
        <Search className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">Search for restaurants or cuisines, or use filters above.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-[260px] animate-pulse rounded-[20px] bg-gray-100" />
        ))}
      </div>
    );
  }

  if (!restaurants.length) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-white p-10 text-center">
        <p className="font-semibold text-text-primary">No results{q ? ` for “${q}”` : ""}</p>
        <p className="mt-1 text-sm text-text-secondary">Try different keywords or adjust filters.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-secondary">
        {restaurants.length} result{restaurants.length !== 1 ? "s" : ""}{q ? ` for “${q}”` : ""}
      </p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {restaurants.map((r: any, i: number) => (
          <RestaurantCard
            key={r.id}
            id={r.id}
            name={r.name}
            cuisines={r.cuisines ?? []}
            rating={r.rating ?? 0}
            deliveryTime={r.address?.deliveryTime ?? 30}
            deliveryFee={r.address?.deliveryFee ?? 0}
            minOrder={r.address?.minOrder ?? 0}
            imageUrl={r.imageUrl ?? ""}
            isVeg={false}
            isOpen={r.isOpen ?? true}
            statusNote={r.statusNote ?? null}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [input, setInput] = useState(searchParams?.get("q") ?? "");
  const [q, setQ] = useState(searchParams?.get("q") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setQ(input);
      const params = new URLSearchParams(window.location.search);
      if (input.trim()) params.set("q", input.trim());
      else params.delete("q");
      router.replace(`/search?${params.toString()}`, { scroll: false });
    }, 400);
    return () => clearTimeout(handler);
  }, [input, router]);

  const activeFilterCount = [filters.isVeg, filters.isOpen, filters.minRating, filters.cuisine, filters.maxDeliveryTime].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-[18px] border border-border bg-white px-4 py-3 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <Search className="h-5 w-5 shrink-0 text-text-muted" />
          <input
            autoFocus
            className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search restaurants, cuisines, or dishes..."
            value={input}
          />
          {input && (
            <button onClick={() => { setInput(""); setQ(""); }} className="text-xs font-semibold text-text-muted hover:text-text-primary">
              Clear
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border transition ${showFilters || activeFilterCount > 0 ? "border-brand bg-brand text-white" : "border-border bg-white text-text-secondary hover:border-brand/30"}`}
        >
          <SlidersHorizontal className="h-5 w-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div ref={filterRef} className="mb-4">
          <FilterPanel filters={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />
        </div>
      )}

      {activeFilterCount > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {filters.isVeg && (
            <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              Pure Veg <button onClick={() => setFilters({ ...filters, isVeg: false })}><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.isOpen && (
            <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Open Now <button onClick={() => setFilters({ ...filters, isOpen: false })}><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.minRating && (
            <span className="flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
              {filters.minRating}+ stars <button onClick={() => setFilters({ ...filters, minRating: "" })}><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.cuisine && (
            <span className="flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
              {filters.cuisine} <button onClick={() => setFilters({ ...filters, cuisine: "" })}><X className="h-3 w-3" /></button>
            </span>
          )}
          {filters.maxDeliveryTime && (
            <span className="flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              &le;{filters.maxDeliveryTime} min <button onClick={() => setFilters({ ...filters, maxDeliveryTime: "" })}><X className="h-3 w-3" /></button>
            </span>
          )}
        </div>
      )}

      <SearchResults q={q} filters={filters} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6 h-12 animate-pulse rounded-[18px] bg-gray-100" />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
