"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { RestaurantCard } from "@/components/customer/RestaurantCard";
import { Button } from "@/components/ui/button";
import {
  categoryOptions,
  featuredBanners,
  filterOptions,
  popularLocations,
} from "@/lib/mockData";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/userStore";
import type { FilterOption } from "@/types";

function SearchIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4.2-4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7h16M7 12h10M10 17h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
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

export function CustomerHomePage() {
  const { location, setLocation, openLocationModal } = useUserStore();
  const [category, setCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [bannerInput, setBannerInput] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterOption[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["restaurants", category, activeFilters, searchTerm, location?.label],
    queryFn: ({ pageParam = 1 }) =>
      api.get('/restaurants', {
        params: {
          search: searchTerm || undefined,
          cuisine: category !== null ? category : undefined,
          page: pageParam,
          limit: 12,
        }
      }).then(r => {
        console.log("🔥 API RESPONSE - Full Response:", r);
        console.log("🔥 API RESPONSE - r.data:", r.data);
        return r.data;
      }),
    getNextPageParam: (lastPage) => lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
  });

  useEffect(() => {
    const observerTarget = loadMoreRef.current;

    if (!observerTarget) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;

        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "120px" },
    );

    observer.observe(observerTarget);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const restaurantPages = data?.pages ?? [];
  const restaurants = restaurantPages.flatMap((page) => page.restaurants ?? []);
  const restaurantCount = restaurantPages[0]?.total ?? 0;

  function toggleFilter(filter: FilterOption) {
    setActiveFilters((currentFilters) =>
      currentFilters.includes(filter)
        ? currentFilters.filter((currentFilter) => currentFilter !== filter)
        : [...currentFilters, filter],
    );
  }

  function handleLocationSubmit() {
    const input = bannerInput.trim();

    if (!input) {
      openLocationModal();
      return;
    }

    setLocation({
      id: `manual-${input.toLowerCase().replace(/\s+/g, "-")}`,
      label: input,
      city: input.toLowerCase().includes("mumbai") ? "Mumbai" : "Delhi",
    });
  }

  return (
    <div className="mx-auto w-full max-w-shell px-4 py-4 md:px-6 lg:px-8">
      {!location ? (
        <section className="overflow-hidden rounded-[28px] bg-brand px-5 py-5 text-white md:px-8 md:py-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">
            Fast delivery starts here
          </p>
          <div className="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="max-w-[420px]">
              <h1 className="text-[28px] font-bold leading-tight md:text-[36px]">
                Where should we deliver?
              </h1>
              <p className="mt-2 text-sm text-white/85">
                Set your area once and browse the best late-night kitchens, biryani drops,
                pizza spots, and sweet picks nearby.
              </p>
            </div>
            <div className="w-full max-w-[520px]">
              <div className="flex flex-col gap-3 rounded-[24px] bg-white p-3 md:flex-row">
                <div className="flex flex-1 items-center gap-3 rounded-[18px] border border-border px-4 py-3 text-text-secondary">
                  <SearchIcon />
                  <input
                    className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    onChange={(event) => setBannerInput(event.target.value)}
                    placeholder="Search for your address"
                    value={bannerInput}
                  />
                </div>
                <Button className="h-[52px] px-6" onClick={handleLocationSubmit}>
                  Search
                </Button>
              </div>
              <button
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-white underline-offset-4 transition hover:underline"
                onClick={() => setLocation(popularLocations[0])}
                type="button"
              >
                <PinIcon />
                Use current location
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[24px] border border-border bg-white p-3 shadow-[0_10px_30px_rgba(28,28,28,0.04)] md:p-4">
          <div className="flex items-center gap-3 rounded-[18px] border border-border bg-white px-4 py-3 text-text-secondary transition focus-within:border-brand focus-within:shadow-focus">
            <SearchIcon />
            <input
              className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search for restaurants or dishes..."
              value={searchTerm}
            />
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-secondary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
              type="button"
            >
              <FilterIcon />
            </button>
          </div>
        </section>
      )}

      <section className="mt-5">
        <motion.div
          className="scrollbar-none flex gap-3 overflow-x-auto pb-2"
          initial="hidden"
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: 0.06,
              },
            },
          }}
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
        >
          {categoryOptions.map((option) => {
            const isActive = category === option.label;

            return (
              <motion.button
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-pill border px-4 py-2.5 text-sm font-semibold transition",
                  isActive
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-white text-text-primary hover:border-brand/30 hover:bg-brand-light",
                )}
                key={option.label}
                layout
                onClick={() =>
                  setCategory((currentCategory) =>
                    currentCategory === option.label ? null : option.label,
                  )
                }
                type="button"
                variants={{
                  hidden: { opacity: 0, y: 12 },
                  show: { opacity: 1, y: 0 },
                }}
              >
                <span aria-hidden="true">{option.emoji}</span>
                <span>{option.label}</span>
              </motion.button>
            );
          })}
        </motion.div>
      </section>

      <section className="mt-5">
        <div className="scrollbar-none flex gap-2 overflow-x-auto pb-2">
          {filterOptions.map((filter) => {
            const isActive = activeFilters.includes(filter);

            return (
              <motion.button
                className={cn(
                  "shrink-0 rounded-pill border px-3.5 py-2 text-[13px] font-semibold transition",
                  isActive
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-white text-text-secondary hover:border-brand/30 hover:text-brand",
                )}
                key={filter}
                layout
                onClick={() => toggleFilter(filter)}
                type="button"
              >
                {filter}
              </motion.button>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="scrollbar-none flex gap-4 overflow-x-auto pb-2">
          {featuredBanners.map((banner) => (
            <div
              className="relative h-[160px] min-w-[300px] overflow-hidden rounded-[24px] border border-border p-5 text-white"
              key={banner.id}
              style={{ backgroundColor: banner.bgColor }}
            >
              <div className="flex h-full max-w-[220px] flex-col justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
                    Featured
                  </p>
                  <h2 className="mt-3 text-2xl font-bold leading-tight">
                    {banner.title}
                  </h2>
                </div>
                <p className="text-sm text-white/90">{banner.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[28px] font-bold text-text-primary">All Restaurants</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Handpicked kitchens around {location?.label ?? "you"}
            </p>
          </div>
          <span className="inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-text-primary">
            {restaurantCount}
          </span>
        </div>

        <motion.div
          className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-3"
          layout
        >
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 rounded-[24px] bg-gray-200 animate-pulse" />
            ))
          ) : (
            restaurants?.filter(Boolean).map((restaurant, index) => (
              <RestaurantCard
                cuisines={restaurant?.cuisines || []}
                deliveryFee={restaurant?.address?.deliveryFee || 0}
                deliveryTime={restaurant?.address?.deliveryTime || 30}
                id={restaurant?.id || "unknown"}
                imageUrl={restaurant?.imageUrl || "/fallback.jpg"}
                index={index}
                isNew={false}
                isVeg={false}
                key={restaurant?.id || index}
                minOrder={restaurant?.address?.minOrder || 0}
                name={restaurant?.name || "Unknown Restaurant"}
                rating={restaurant?.rating || 0}
              />
            ))
          )}
        </motion.div>

        {!restaurants.length && !isLoading ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-border bg-white p-8 text-center">
            <h3 className="text-lg font-bold text-text-primary">
              No restaurants found
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              Try adjusting your search or location.
            </p>
          </div>
        ) : null}

        <div className="flex justify-center">
          <div className="h-10 w-full" ref={loadMoreRef} />
        </div>

        {(isFetching || isFetchingNextPage) && restaurants.length ? (
          <p className="text-center text-sm font-medium text-text-secondary">
            Loading more kitchens...
          </p>
        ) : null}
      </section>
    </div>
  );
}
