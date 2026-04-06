import { notFound } from "next/navigation";

import { RestaurantMenuPage } from "@/components/customer/restaurant-menu-page";

export const dynamic = 'force-dynamic';

type RestaurantDetailsPageProps = {
  params: {
    id: string;
  };
};

export default function RestaurantDetailsPage({
  params,
}: RestaurantDetailsPageProps) {
  if (!params.id) {
    notFound();
  }

  return <RestaurantMenuPage restaurantId={params.id} />;
}
