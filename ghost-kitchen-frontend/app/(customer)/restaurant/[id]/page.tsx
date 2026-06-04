import { headers } from "next/headers";

import { RestaurantMenuPage } from "@/components/customer/restaurant-menu-page";

// Force dynamic rendering — never cache restaurant pages
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: { id: string } };

export default function RestaurantDetailsPage({ params }: Props) {
  // Read headers to force dynamic rendering on every request (prevents CDN caching)
  headers();

  if (!params.id) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-text-secondary">Restaurant not found.</p>
      </div>
    );
  }

  return <RestaurantMenuPage restaurantId={params.id} />;
}
