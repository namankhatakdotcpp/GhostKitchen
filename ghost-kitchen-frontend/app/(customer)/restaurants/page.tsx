"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import SearchBar from "@/components/customer/SearchBar";
import { RestaurantCard } from "@/components/customer/restaurant-card";

interface Restaurant {
  id: string;
  name: string;
  cuisines: string[];
  rating: number;
  imageUrl: string;
  deliveryTime?: number;
  deliveryFee?: number;
  minOrder?: number;
  isNew?: boolean;
}

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [filteredRestaurants, setFilteredRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      setLoading(true);
      const response = await api.get("/restaurants");
      const data = response.data?.data?.restaurants || response.data?.data || response.data;
      const restaurantsList = Array.isArray(data) ? data : (data.restaurants || []);
      setRestaurants(restaurantsList);
      setFilteredRestaurants(restaurantsList);
    } catch (error) {
      console.error("Failed to fetch restaurants:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!query.trim()) {
      setFilteredRestaurants(restaurants);
    } else {
      const filtered = restaurants.filter((r) =>
        r.name.toLowerCase().includes(query.toLowerCase()) ||
        r.cuisines.some((c) => c.toLowerCase().includes(query.toLowerCase()))
      );
      setFilteredRestaurants(filtered);
    }
  }, [query, restaurants]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Explore Restaurants</h1>
          <p className="text-gray-600 mt-2">Order from your favorite restaurants</p>
        </div>

        {/* Search */}
        <SearchBar query={query} setQuery={setQuery} />

        {/* Results */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading restaurants...</p>
          </div>
        ) : filteredRestaurants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No restaurants found. Try a different search.</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Showing {filteredRestaurants.length} restaurant{filteredRestaurants.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredRestaurants.map((restaurant, idx) => (
                <RestaurantCard
                  key={restaurant.id}
                  id={restaurant.id}
                  name={restaurant.name}
                  cuisines={restaurant.cuisines}
                  rating={restaurant.rating || 4.5}
                  deliveryTime={restaurant.deliveryTime || 25}
                  deliveryFee={restaurant.deliveryFee || 40}
                  minOrder={restaurant.minOrder || 299}
                  imageUrl={restaurant.imageUrl}
                  isVeg={false}
                  index={idx}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
