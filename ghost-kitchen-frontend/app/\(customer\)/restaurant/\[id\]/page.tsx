'use client';

import { RestaurantMenuPage } from "@/components/customer/restaurant-menu-page";

type RestaurantDetailsPageProps = {
  params: {
    id: string;
  };
};

export default function RestaurantDetailsPage({
  params,
}: RestaurantDetailsPageProps) {
  return <RestaurantMenuPage restaurantId={params.id} />;
}
