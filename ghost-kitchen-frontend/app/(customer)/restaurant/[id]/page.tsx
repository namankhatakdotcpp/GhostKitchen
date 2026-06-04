"use client";

import { RestaurantMenuPage } from "@/components/customer/restaurant-menu-page";

type Props = { params: { id: string } };

export default function RestaurantDetailsPage({ params }: Props) {
  if (!params?.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-secondary">Restaurant not found.</p>
      </div>
    );
  }

  return <RestaurantMenuPage restaurantId={params.id} />;
}
