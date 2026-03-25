import { useState } from "react";
import RestaurantCard from "../components/RestaurantCard";
import RestaurantMenu from "./RestaurantMenu";

const RESTAURANTS = [
  { id: "r1", name: "Ghost Biryani" },
  { id: "r2", name: "Midnight Pizza" },
];

export default function CustomerHome() {
  const [selectedRestaurant, setSelectedRestaurant] = useState<
    null | { id: string; name: string }
  >(null);

  if (selectedRestaurant) {
    return (
      <RestaurantMenu
        restaurant={selectedRestaurant}
        onBack={() => setSelectedRestaurant(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Restaurants</h2>

      {RESTAURANTS.map((r) => (
        <RestaurantCard
          key={r.id}
          name={r.name}
          onClick={() => setSelectedRestaurant(r)}
        />
      ))}
    </div>
  );
}
