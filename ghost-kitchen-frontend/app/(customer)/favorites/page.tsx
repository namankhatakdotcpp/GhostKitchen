"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RestaurantCard } from "@/components/customer/restaurant-card";
import { Heart } from "lucide-react";
import Link from "next/link";

interface FavoriteRestaurant {
  id: string;
  name: string;
  cuisines: string[];
  rating: number;
  imageUrl: string;
  isOpen: boolean;
  statusNote: string | null;
  address?: { deliveryFee?: number; deliveryTime?: number; minOrder?: number };
}

export default function FavoritesPage() {
  const { data, isLoading } = useQuery<FavoriteRestaurant[]>({
    queryKey: ["favorites"],
    queryFn: () => api.get("/user/favorites").then((r) => r.data.favorites ?? []),
  });

  const restaurants = data ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Saved</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">My Favorites</h1>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[260px] animate-pulse rounded-[20px] bg-gray-100" />
          ))}
        </div>
      ) : restaurants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50">
            <Heart className="h-8 w-8 text-orange-400" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">No favorites yet</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Tap the heart icon on any restaurant to save it here.
          </p>
          <Link
            href="/"
            className="mt-5 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Explore restaurants
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r, i) => (
            <RestaurantCard
              key={r.id}
              id={r.id}
              name={r.name}
              cuisines={r.cuisines ?? []}
              rating={r.rating}
              deliveryTime={r.address?.deliveryTime ?? 30}
              deliveryFee={r.address?.deliveryFee ?? 0}
              minOrder={r.address?.minOrder ?? 0}
              imageUrl={r.imageUrl}
              isVeg={false}
              isOpen={r.isOpen}
              statusNote={r.statusNote}
              index={i}
              isFavorited={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
