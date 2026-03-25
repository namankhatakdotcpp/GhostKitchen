import type {
  Address,
  CategoryOption,
  FeaturedBanner,
  FilterOption,
  LocationOption,
  MenuItem,
  RestaurantFeedCard,
  RestaurantMenuSection,
  TimelineStage,
  TrackedOrder,
} from "@/types";

const PAGE_SIZE = 12;

export const categoryOptions: CategoryOption[] = [
  { label: "Biryani", emoji: "🍛" },
  { label: "Pizza", emoji: "🍕" },
  { label: "Burger", emoji: "🍔" },
  { label: "Chinese", emoji: "🥡" },
  { label: "South Indian", emoji: "🥘" },
  { label: "Desserts", emoji: "🍨" },
  { label: "Healthy", emoji: "🥗" },
  { label: "Rolls", emoji: "🌯" },
];

export const filterOptions: FilterOption[] = [
  "Rating 4.0+",
  "Pure Veg",
  "Offers",
  "Fast Delivery",
  "₹300-₹600",
];

export const featuredBanners: FeaturedBanner[] = [
  {
    id: "late-night",
    title: "Late Night Cravings",
    subtitle: "Flat 50% off on comfort food after 10 PM",
    bgColor: "#FF5200",
  },
  {
    id: "power-lunch",
    title: "Power Lunch Deals",
    subtitle: "Express combos from top kitchens in 30 mins",
    bgColor: "#118A7E",
  },
  {
    id: "weekend-party",
    title: "Weekend House Party",
    subtitle: "Free dessert on orders above ₹699",
    bgColor: "#6C4CE3",
  },
];

export const popularLocations: LocationOption[] = [
  { id: "hauz-khas", label: "Hauz Khas, Delhi", city: "Delhi" },
  { id: "dwarka", label: "Dwarka Sector 12, Delhi", city: "Delhi" },
  { id: "cp", label: "Connaught Place, Delhi", city: "Delhi" },
  { id: "andheri", label: "Andheri West, Mumbai", city: "Mumbai" },
  { id: "powai", label: "Powai, Mumbai", city: "Mumbai" },
  { id: "bandra", label: "Bandra West, Mumbai", city: "Mumbai" },
];

function createAddress(
  id: string,
  label: string,
  line1: string,
  city: string,
  state: string,
  pincode: string,
  lat: number,
  lng: number,
): Address {
  return { id, label, line1, city, state, pincode, lat, lng };
}

export const primaryAddress = createAddress(
  "addr-hauz-khas",
  "Home",
  "27A Green Park Extension",
  "Delhi",
  "Delhi",
  "110016",
  28.5484,
  77.2066,
);

const restaurantAddresses = {
  hauzKhas: createAddress(
    "addr-r-hk",
    "Hauz Khas",
    "12 Market Lane, Hauz Khas Village",
    "Delhi",
    "Delhi",
    "110016",
    28.5494,
    77.2001,
  ),
  bandra: createAddress(
    "addr-r-bw",
    "Bandra West",
    "17 Chapel Road, Bandra West",
    "Mumbai",
    "Maharashtra",
    "400050",
    19.0661,
    72.8336,
  ),
  andheri: createAddress(
    "addr-r-aw",
    "Andheri West",
    "202 Veera Desai Road, Andheri West",
    "Mumbai",
    "Maharashtra",
    "400053",
    19.1361,
    72.8331,
  ),
  cp: createAddress(
    "addr-r-cp",
    "Connaught Place",
    "Inner Circle, Block M, Connaught Place",
    "Delhi",
    "Delhi",
    "110001",
    28.6315,
    77.2167,
  ),
  dwarka: createAddress(
    "addr-r-dw",
    "Dwarka Sector 12",
    "Metro Walk, Sector 12, Dwarka",
    "Delhi",
    "Delhi",
    "110078",
    28.5921,
    77.046,
  ),
  powai: createAddress(
    "addr-r-pw",
    "Powai",
    "Hiranandani Gardens, Powai",
    "Mumbai",
    "Maharashtra",
    "400076",
    19.1176,
    72.906,
  ),
};

export const restaurants: RestaurantFeedCard[] = [
  {
    id: "ghost-biryani-house",
    name: "Ghost Biryani House",
    description: "Dum biryanis, smoky kebabs, and raita bowls built for late-night comfort.",
    cuisines: ["Biryani", "North Indian"],
    rating: 4.5,
    reviewCount: 1820,
    deliveryTime: 28,
    deliveryFee: 39,
    minOrder: 249,
    imageUrl:
      "https://images.unsplash.com/photo-1701579231373-a2d5b769c9ff?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.hauzKhas,
    offer: "50% OFF",
    isNew: false,
    distanceKm: 2.4,
    costForTwo: 600,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["50% OFF up to ₹120", "Free firni on ₹699+", "Late night combo deal"],
    cityLabel: "Delhi",
  },
  {
    id: "midnight-pizza",
    name: "Midnight Pizza",
    description: "Wood-fired slices, garlic knots, and dessert tubs for after-hours cravings.",
    cuisines: ["Pizza", "Italian"],
    rating: 4.3,
    reviewCount: 1462,
    deliveryTime: 25,
    deliveryFee: 0,
    minOrder: 349,
    imageUrl:
      "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.bandra,
    offer: "BUY 1 GET 1",
    isNew: true,
    distanceKm: 3.1,
    costForTwo: 750,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["BOGO on medium pizzas", "₹150 off on ₹999+", "Free choco lava"],
    cityLabel: "Mumbai",
  },
  {
    id: "the-burger-lab",
    name: "The Burger Lab",
    description: "Smash burgers, loaded fries, and thick shakes with a midnight lab aesthetic.",
    cuisines: ["Burger", "Fast Food"],
    rating: 4.4,
    reviewCount: 1206,
    deliveryTime: 22,
    deliveryFee: 29,
    minOrder: 299,
    imageUrl:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.andheri,
    offer: "FREE FRIES",
    distanceKm: 1.8,
    costForTwo: 550,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Free fries with combos", "₹100 off on burgers", "Free shake add-on"],
    cityLabel: "Mumbai",
  },
  {
    id: "wok-this-way",
    name: "Wok This Way",
    description: "Fiery noodles, fried rice, and crunchy starters tossed fast in hot woks.",
    cuisines: ["Chinese", "Asian"],
    rating: 4.2,
    reviewCount: 932,
    deliveryTime: 30,
    deliveryFee: 35,
    minOrder: 259,
    imageUrl:
      "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.cp,
    distanceKm: 2.9,
    costForTwo: 520,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Flat ₹125 off", "Free spring rolls", "Lunch bowl combo"],
    cityLabel: "Delhi",
  },
  {
    id: "idli-street",
    name: "Idli Street",
    description: "Soft idlis, ghee podi dosas, and filter coffee for all-day comfort.",
    cuisines: ["South Indian", "Breakfast"],
    rating: 4.6,
    reviewCount: 2018,
    deliveryTime: 19,
    deliveryFee: 0,
    minOrder: 199,
    imageUrl:
      "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=1200&q=80",
    isVeg: true,
    isOpen: true,
    address: restaurantAddresses.dwarka,
    offer: "20% OFF",
    distanceKm: 1.5,
    costForTwo: 320,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["20% off on family meals", "Free coffee on breakfast combos", "Extra chutney free"],
    cityLabel: "Delhi",
  },
  {
    id: "sugar-rush-desserts",
    name: "Sugar Rush Desserts",
    description: "Brownies, pastry jars, and frozen tubs packed fresh for sweet emergencies.",
    cuisines: ["Desserts", "Bakery"],
    rating: 4.7,
    reviewCount: 1674,
    deliveryTime: 24,
    deliveryFee: 25,
    minOrder: 299,
    imageUrl:
      "https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?auto=format&fit=crop&w=1200&q=80",
    isVeg: true,
    isOpen: true,
    address: restaurantAddresses.powai,
    offer: "FREE BROWNIE",
    distanceKm: 2.2,
    costForTwo: 420,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Free brownie box", "₹99 mini cakes", "Party dessert platter"],
    cityLabel: "Mumbai",
  },
  {
    id: "green-bowl-co",
    name: "Green Bowl Co.",
    description: "High-protein bowls, cold-pressed juices, and clean late lunches.",
    cuisines: ["Healthy", "Salads"],
    rating: 4.1,
    reviewCount: 754,
    deliveryTime: 27,
    deliveryFee: 39,
    minOrder: 389,
    imageUrl:
      "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80",
    isVeg: true,
    isOpen: true,
    address: restaurantAddresses.hauzKhas,
    distanceKm: 2.8,
    costForTwo: 650,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Free detox shot", "Healthy combo saver", "Protein bowl upgrade"],
    cityLabel: "Delhi",
  },
  {
    id: "roomali-roll-club",
    name: "Roomali Roll Club",
    description: "Hot roomali wraps, kebab rolls, and masala fries rolled to travel well.",
    cuisines: ["Rolls", "Street Food"],
    rating: 4.0,
    reviewCount: 889,
    deliveryTime: 18,
    deliveryFee: 19,
    minOrder: 189,
    imageUrl:
      "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.andheri,
    offer: "COMBO @ ₹199",
    distanceKm: 1.1,
    costForTwo: 300,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Roll combo @ ₹199", "Midnight wrap offer", "Free masala fries"],
    cityLabel: "Mumbai",
  },
  {
    id: "bombay-thali-project",
    name: "Bombay Thali Project",
    description: "Big wholesome thalis, comfort gravies, and daily ghar-ka-khana plates.",
    cuisines: ["North Indian", "Thali"],
    rating: 4.4,
    reviewCount: 1424,
    deliveryTime: 31,
    deliveryFee: 45,
    minOrder: 349,
    imageUrl:
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    isVeg: true,
    isOpen: true,
    address: restaurantAddresses.bandra,
    distanceKm: 3.7,
    costForTwo: 700,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Free gulab jamun", "Thali for 2 saver", "Festival combo"],
    cityLabel: "Mumbai",
  },
  {
    id: "tandoor-theory",
    name: "Tandoor Theory",
    description: "Charred kebabs, buttery gravies, and soft breads with smoky edges.",
    cuisines: ["North Indian", "Kebabs"],
    rating: 4.5,
    reviewCount: 1148,
    deliveryTime: 33,
    deliveryFee: 49,
    minOrder: 449,
    imageUrl:
      "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.cp,
    isNew: true,
    distanceKm: 3.4,
    costForTwo: 850,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["Free kebab platter", "₹200 off dinners", "Signature tandoor combo"],
    cityLabel: "Delhi",
  },
  {
    id: "crust-corner",
    name: "Crust Corner",
    description: "Thin crust pizzas, garlic breads, and dessert calzones with extra cheese.",
    cuisines: ["Pizza", "Desserts"],
    rating: 4.2,
    reviewCount: 1001,
    deliveryTime: 26,
    deliveryFee: 35,
    minOrder: 329,
    imageUrl:
      "https://images.unsplash.com/photo-1514326640560-7d063ef2aed5?auto=format&fit=crop&w=1200&q=80",
    isVeg: true,
    isOpen: true,
    address: restaurantAddresses.powai,
    offer: "40% OFF",
    distanceKm: 2.6,
    costForTwo: 590,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["40% off pizzas", "Free dessert dip", "Party pizza combo"],
    cityLabel: "Mumbai",
  },
  {
    id: "masala-meter",
    name: "Masala Meter",
    description: "Big flavor bowls, spicy mains, and combo meals built for hungry groups.",
    cuisines: ["Biryani", "Chinese", "Rolls"],
    rating: 4.6,
    reviewCount: 1894,
    deliveryTime: 29,
    deliveryFee: 0,
    minOrder: 299,
    imageUrl:
      "https://images.unsplash.com/photo-1563379091339-03246963d29d?auto=format&fit=crop&w=1200&q=80",
    isVeg: false,
    isOpen: true,
    address: restaurantAddresses.dwarka,
    offer: "₹125 OFF",
    distanceKm: 1.9,
    costForTwo: 640,
    outletLabel: "Ghost Kitchen • Delivery only",
    offers: ["₹125 off on ₹599+", "Family feast deal", "Double chicken combo"],
    cityLabel: "Delhi",
  },
];

function createMenuItem(
  restaurantId: string,
  id: string,
  name: string,
  description: string,
  price: number,
  category: string,
  imageUrl: string,
  isVeg: boolean,
  isBestseller = false,
): MenuItem {
  return {
    id,
    restaurantId,
    name,
    description,
    price,
    imageUrl,
    category,
    isVeg,
    isAvailable: true,
    isBestseller,
  };
}

function buildRestaurantMenu(restaurantId: string): RestaurantMenuSection[] {
  return [
    {
      category: "Starters",
      items: [
        createMenuItem(
          restaurantId,
          `${restaurantId}-starter-1`,
          "Smoked Tandoori Wings",
          "Juicy wings marinated overnight with smoky chilli yogurt and charred onions.",
          289,
          "Starters",
          "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=800&q=80",
          false,
          true,
        ),
        createMenuItem(
          restaurantId,
          `${restaurantId}-starter-2`,
          "Crispy Chilli Paneer Bites",
          "Golden-fried cottage cheese tossed in a sticky garlic chilli glaze.",
          249,
          "Starters",
          "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=800&q=80",
          true,
        ),
      ],
    },
    {
      category: "Main Course",
      items: [
        createMenuItem(
          restaurantId,
          `${restaurantId}-main-1`,
          "Signature Handi Special",
          "Slow-cooked house specialty with layered spice, buttery gravy, and fragrant rice.",
          389,
          "Main Course",
          "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
          false,
          true,
        ),
        createMenuItem(
          restaurantId,
          `${restaurantId}-main-2`,
          "Paneer Makhani Bowl",
          "Creamy tomato makhani with soft paneer cubes and a side of jeera rice.",
          329,
          "Main Course",
          "https://images.unsplash.com/photo-1631452180539-96aca7d48617?auto=format&fit=crop&w=800&q=80",
          true,
        ),
      ],
    },
    {
      category: "Breads",
      items: [
        createMenuItem(
          restaurantId,
          `${restaurantId}-bread-1`,
          "Garlic Butter Naan",
          "Soft clay-oven naan brushed generously with garlic butter.",
          79,
          "Breads",
          "https://images.unsplash.com/photo-1613292443284-8d10ef9383df?auto=format&fit=crop&w=800&q=80",
          true,
        ),
        createMenuItem(
          restaurantId,
          `${restaurantId}-bread-2`,
          "Roomali Roti",
          "Thin handspun flatbread folded hot and ready to dip into gravies.",
          49,
          "Breads",
          "https://images.unsplash.com/photo-1601050690117-94f5f6fa5f58?auto=format&fit=crop&w=800&q=80",
          true,
        ),
      ],
    },
    {
      category: "Beverages",
      items: [
        createMenuItem(
          restaurantId,
          `${restaurantId}-beverage-1`,
          "Masala Cola Float",
          "Chilled cola topped with vanilla cream and a touch of masala salt.",
          129,
          "Beverages",
          "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=800&q=80",
          true,
        ),
        createMenuItem(
          restaurantId,
          `${restaurantId}-beverage-2`,
          "Cold Coffee Shake",
          "Thick coffee shake finished with dark chocolate and crushed ice.",
          149,
          "Beverages",
          "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80",
          true,
        ),
      ],
    },
    {
      category: "Desserts",
      items: [
        createMenuItem(
          restaurantId,
          `${restaurantId}-dessert-1`,
          "Matka Kulfi",
          "Slow-set creamy kulfi with pistachio crumble and saffron syrup.",
          119,
          "Desserts",
          "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
          true,
          true,
        ),
        createMenuItem(
          restaurantId,
          `${restaurantId}-dessert-2`,
          "Warm Choco Brownie",
          "Fudgy brownie square with chocolate sauce and roasted nuts.",
          139,
          "Desserts",
          "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
          true,
        ),
      ],
    },
  ];
}

const restaurantMenus = Object.fromEntries(
  restaurants.map((restaurant) => [restaurant.id, buildRestaurantMenu(restaurant.id)]),
) as Record<string, RestaurantMenuSection[]>;

function isoMinutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function createTimeline(
  statusTimestamps: Partial<Record<TrackedOrder["status"], string>>,
): TimelineStage[] {
  return [
    {
      status: "PLACED",
      label: "Order Placed",
      subText: "Your payment went through and the kitchen has your order.",
      timestamp: statusTimestamps.PLACED ?? null,
    },
    {
      status: "CONFIRMED",
      label: "Restaurant Confirmed",
      subText: "The kitchen accepted your order and is prepping your station.",
      timestamp: statusTimestamps.CONFIRMED ?? null,
    },
    {
      status: "PREPARING",
      label: "Being Prepared",
      subText: "Your food is on the line. Fresh batch in progress.",
      timestamp: statusTimestamps.PREPARING ?? null,
    },
    {
      status: "OUT_FOR_DELIVERY",
      label: "Out for Delivery",
      subText: "Your rider has picked up the order and is heading your way.",
      timestamp: statusTimestamps.OUT_FOR_DELIVERY ?? null,
    },
    {
      status: "DELIVERED",
      label: "Delivered",
      subText: "Order completed. Time to eat.",
      timestamp: statusTimestamps.DELIVERED ?? null,
    },
  ];
}

export const trackedOrders: TrackedOrder[] = [
  {
    id: "gk-order-1024",
    customerId: "demo-customer",
    restaurantId: "ghost-biryani-house",
    restaurant: restaurants[0],
    items: [
      {
        menuItem: restaurantMenus["ghost-biryani-house"][1].items[0],
        quantity: 1,
        price: 389,
      },
      {
        menuItem: restaurantMenus["ghost-biryani-house"][4].items[0],
        quantity: 1,
        price: 119,
      },
    ],
    status: "OUT_FOR_DELIVERY",
    subtotal: 508,
    deliveryFee: 39,
    discount: 60,
    total: 487,
    deliveryAddress: primaryAddress,
    createdAt: isoMinutesFromNow(-24),
    estimatedDelivery: isoMinutesFromNow(18),
    deliveryAgent: {
      id: "agent-ravi",
      name: "Ravi S.",
      phone: "+919810001234",
      rating: 4.8,
      vehicleNumber: "DL 3S CT 4481",
    },
    timeline: createTimeline({
      PLACED: isoMinutesFromNow(-24),
      CONFIRMED: isoMinutesFromNow(-21),
      PREPARING: isoMinutesFromNow(-16),
      OUT_FOR_DELIVERY: isoMinutesFromNow(-4),
    }),
    restaurantTypeEmoji: "🍛",
    agentLocation: {
      lat: 28.5468,
      lng: 77.2109,
    },
  },
  {
    id: "gk-order-1025",
    customerId: "demo-customer",
    restaurantId: "midnight-pizza",
    restaurant: restaurants[1],
    items: [
      {
        menuItem: restaurantMenus["midnight-pizza"][1].items[0],
        quantity: 2,
        price: 389,
      },
    ],
    status: "PREPARING",
    subtotal: 778,
    deliveryFee: 0,
    discount: 100,
    total: 678,
    deliveryAddress: primaryAddress,
    createdAt: isoMinutesFromNow(-14),
    estimatedDelivery: isoMinutesFromNow(22),
    timeline: createTimeline({
      PLACED: isoMinutesFromNow(-14),
      CONFIRMED: isoMinutesFromNow(-10),
      PREPARING: isoMinutesFromNow(-6),
    }),
    restaurantTypeEmoji: "🍕",
  },
  {
    id: "gk-order-1001",
    customerId: "demo-customer",
    restaurantId: "idli-street",
    restaurant: restaurants[4],
    items: [
      {
        menuItem: restaurantMenus["idli-street"][1].items[1],
        quantity: 1,
        price: 329,
      },
    ],
    status: "DELIVERED",
    subtotal: 329,
    deliveryFee: 0,
    discount: 0,
    total: 329,
    deliveryAddress: primaryAddress,
    createdAt: isoMinutesFromNow(-88),
    estimatedDelivery: isoMinutesFromNow(-52),
    deliveredAt: isoMinutesFromNow(-54),
    timeline: createTimeline({
      PLACED: isoMinutesFromNow(-88),
      CONFIRMED: isoMinutesFromNow(-84),
      PREPARING: isoMinutesFromNow(-75),
      OUT_FOR_DELIVERY: isoMinutesFromNow(-63),
      DELIVERED: isoMinutesFromNow(-54),
    }),
    restaurantTypeEmoji: "🥘",
  },
];

type RestaurantQuery = {
  pageParam?: number;
  limit?: number;
  category?: string | null;
  filters?: FilterOption[];
  search?: string;
  location?: string | null;
};

type RestaurantsPage = {
  items: RestaurantFeedCard[];
  nextPage: number | undefined;
  total: number;
};

function matchesCategory(restaurant: RestaurantFeedCard, category?: string | null) {
  if (!category) {
    return true;
  }

  return restaurant.cuisines.some((cuisine) =>
    cuisine.toLowerCase().includes(category.toLowerCase()),
  );
}

function matchesFilters(restaurant: RestaurantFeedCard, filters: FilterOption[]) {
  return filters.every((filter) => {
    switch (filter) {
      case "Rating 4.0+":
        return restaurant.rating >= 4;
      case "Pure Veg":
        return restaurant.isVeg;
      case "Offers":
        return Boolean(restaurant.offer);
      case "Fast Delivery":
        return restaurant.deliveryTime <= 30;
      case "₹300-₹600":
        return restaurant.minOrder >= 300 && restaurant.minOrder <= 600;
      default:
        return true;
    }
  });
}

function matchesSearch(restaurant: RestaurantFeedCard, search: string) {
  if (!search.trim()) {
    return true;
  }

  const normalizedSearch = search.toLowerCase();

  return (
    restaurant.name.toLowerCase().includes(normalizedSearch) ||
    restaurant.address.label.toLowerCase().includes(normalizedSearch) ||
    restaurant.cuisines.some((cuisine) =>
      cuisine.toLowerCase().includes(normalizedSearch),
    )
  );
}

function matchesLocation(restaurant: RestaurantFeedCard, location?: string | null) {
  if (!location) {
    return true;
  }

  const normalizedLocation = location.toLowerCase();

  return (
    restaurant.address.label.toLowerCase().includes(normalizedLocation) ||
    restaurant.address.city.toLowerCase().includes(normalizedLocation)
  );
}

export async function getRestaurantsPage({
  pageParam = 0,
  limit = PAGE_SIZE,
  category = null,
  filters = [],
  search = "",
  location = null,
}: RestaurantQuery): Promise<RestaurantsPage> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const filteredRestaurants = restaurants.filter(
    (restaurant) =>
      matchesCategory(restaurant, category) &&
      matchesFilters(restaurant, filters) &&
      matchesSearch(restaurant, search) &&
      matchesLocation(restaurant, location),
  );

  const start = pageParam * limit;
  const end = start + limit;
  const items = filteredRestaurants.slice(start, end);

  return {
    items,
    nextPage: end < filteredRestaurants.length ? pageParam + 1 : undefined,
    total: filteredRestaurants.length,
  };
}

export function getRestaurantById(id: string) {
  return restaurants.find((restaurant) => restaurant.id === id) ?? null;
}

export function getRestaurantMenuById(id: string) {
  return restaurantMenus[id] ?? [];
}

export function getOrderById(id: string) {
  return trackedOrders.find((order) => order.id === id) ?? null;
}

export function getOrders() {
  return trackedOrders;
}
