"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { api } from "@/lib/api";
import { RestaurantCard } from "@/components/customer/restaurant-card";
import { Search } from "lucide-react";

function SearchResults({ q }: { q: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["search", q],
    queryFn: () =>
      api
        .get("/restaurants", { params: { search: q, limit: 24 } })
        .then((r) => r.data?.data ?? r.data),
    enabled: q.trim().length > 0,
  });

  const restaurants = data?.restaurants ?? [];

  if (!q.trim()) {
    return (
      <div className="flex flex-col items-center py-20 text-center text-text-muted">
        <Search className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm">Search for restaurants or cuisines above.</p>
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
        <p className="font-semibold text-text-primary">No results for &ldquo;{q}&rdquo;</p>
        <p className="mt-1 text-sm text-text-secondary">Try a different cuisine or restaurant name.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-text-secondary">
        {data?.total ?? restaurants.length} result{(data?.total ?? restaurants.length) !== 1 ? "s" : ""} for &ldquo;{q}&rdquo;
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center gap-3 rounded-[18px] border border-border bg-white px-4 py-3 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
        <Search className="h-5 w-5 shrink-0 text-text-muted" />
        <input
          autoFocus
          className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search restaurants, cuisines, or dishes..."
          value={input}
        />
        {input && (
          <button
            onClick={() => { setInput(""); setQ(""); }}
            className="text-xs font-semibold text-text-muted hover:text-text-primary"
          >
            Clear
          </button>
        )}
      </div>

      <SearchResults q={q} />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="h-12 animate-pulse rounded-[18px] bg-gray-100 mb-6" />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
