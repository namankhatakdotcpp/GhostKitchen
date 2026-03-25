import { notFound } from "next/navigation";

import { RestaurantMenuPage } from "@/components/customer/restaurant-menu-page";
import { getRestaurantById, getRestaurantMenuById } from "@/lib/mockData";

type RestaurantDetailsPageProps = {
  params: {
    id: string;
  };
};

export default function RestaurantDetailsPage({
  params,
}: RestaurantDetailsPageProps) {
  const restaurant = getRestaurantById(params.id);
  const menu = getRestaurantMenuById(params.id);

  if (!restaurant || !menu.length) {
    notFound();
  }

  return <RestaurantMenuPage menu={menu} restaurant={restaurant} />;
}
