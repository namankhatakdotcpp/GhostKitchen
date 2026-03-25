import type {
  AdminAlert,
  AdminDashboardData,
  AdminMetric,
  AdminOrderRow,
  DeliveryAssignment,
  DeliveryEarningsSummary,
  DeliveryPaymentHistoryRow,
  RestaurantManagementRow,
  ShopAnalyticsData,
  ShopBoardItem,
  ShopMenuEditorItem,
  TopRestaurantRow,
  TopSellingItem,
  UserManagementRow,
} from "@/types";

function wait(ms = 280) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isoMinutesAgo(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

const metrics: AdminMetric[] = [
  {
    id: "orders",
    label: "Total Orders Today",
    value: "1,284",
    change: "+12.4%",
    trend: "up",
    icon: "ShoppingBag",
    meta: "vs yesterday",
  },
  {
    id: "revenue",
    label: "Total Revenue Today",
    value: "₹4.86L",
    change: "+8.1%",
    trend: "up",
    icon: "Wallet",
    sparkline: [18, 22, 20, 28, 33, 30, 41, 46],
  },
  {
    id: "restaurants",
    label: "Active Restaurants",
    value: "214",
    change: "186 open now",
    trend: "flat",
    icon: "Store",
  },
  {
    id: "agents",
    label: "Active Delivery Agents",
    value: "96",
    change: "54 available • 42 busy",
    trend: "flat",
    icon: "Bike",
  },
];

const recentOrders: AdminOrderRow[] = [
  {
    id: "GK-28410",
    customer: "Aarav Mehta",
    restaurant: "Ghost Biryani House",
    amount: 487,
    status: "PLACED",
    time: "2 mins ago",
    placedAt: isoMinutesAgo(2),
    items: ["Signature Handi Special", "Matka Kulfi"],
    deliveryAddress: "Green Park Extension, Delhi",
  },
  {
    id: "GK-28409",
    customer: "Sara Khan",
    restaurant: "Midnight Pizza",
    amount: 678,
    status: "CONFIRMED",
    time: "5 mins ago",
    placedAt: isoMinutesAgo(5),
    items: ["Signature Handi Special x2"],
    deliveryAddress: "Bandra West, Mumbai",
  },
  {
    id: "GK-28408",
    customer: "Rohan Shah",
    restaurant: "The Burger Lab",
    amount: 529,
    status: "PREPARING",
    time: "11 mins ago",
    placedAt: isoMinutesAgo(11),
    items: ["Lab Smash Burger", "Truffle Fries"],
    deliveryAddress: "Andheri West, Mumbai",
  },
  {
    id: "GK-28407",
    customer: "Neha Verma",
    restaurant: "Idli Street",
    amount: 329,
    status: "DELIVERING",
    time: "14 mins ago",
    placedAt: isoMinutesAgo(14),
    items: ["Paneer Makhani Bowl"],
    deliveryAddress: "Dwarka Sector 12, Delhi",
  },
  {
    id: "GK-28406",
    customer: "Kabir Nanda",
    restaurant: "Wok This Way",
    amount: 612,
    status: "DELIVERED",
    time: "18 mins ago",
    placedAt: isoMinutesAgo(18),
    items: ["Burnt Garlic Rice", "Chilli Chicken"],
    deliveryAddress: "Connaught Place, Delhi",
  },
  {
    id: "GK-28405",
    customer: "Ira Chopra",
    restaurant: "Sugar Rush Desserts",
    amount: 399,
    status: "CANCELLED",
    time: "26 mins ago",
    placedAt: isoMinutesAgo(26),
    items: ["Brownie Box", "Cold Coffee Shake"],
    deliveryAddress: "Powai, Mumbai",
  },
  {
    id: "GK-28404",
    customer: "Aanya Sethi",
    restaurant: "Masala Meter",
    amount: 721,
    status: "PREPARING",
    time: "31 mins ago",
    placedAt: isoMinutesAgo(31),
    items: ["Double Chicken Combo", "Masala Cola Float"],
    deliveryAddress: "Dwarka, Delhi",
  },
  {
    id: "GK-28403",
    customer: "Dev Patel",
    restaurant: "Bombay Thali Project",
    amount: 884,
    status: "CONFIRMED",
    time: "34 mins ago",
    placedAt: isoMinutesAgo(34),
    items: ["Thali for 2 Saver"],
    deliveryAddress: "Bandra, Mumbai",
  },
  {
    id: "GK-28402",
    customer: "Mira Dsouza",
    restaurant: "Crust Corner",
    amount: 563,
    status: "DELIVERING",
    time: "39 mins ago",
    placedAt: isoMinutesAgo(39),
    items: ["Margherita XL", "Garlic Bread"],
    deliveryAddress: "Powai, Mumbai",
  },
  {
    id: "GK-28401",
    customer: "Parth Jain",
    restaurant: "Green Bowl Co.",
    amount: 472,
    status: "PLACED",
    time: "43 mins ago",
    placedAt: isoMinutesAgo(43),
    items: ["Protein Bowl", "Cold Pressed Juice"],
    deliveryAddress: "Hauz Khas, Delhi",
  },
  {
    id: "GK-28400",
    customer: "Anika Bhatia",
    restaurant: "Roomali Roll Club",
    amount: 245,
    status: "DELIVERED",
    time: "49 mins ago",
    placedAt: isoMinutesAgo(49),
    items: ["Roll Combo"],
    deliveryAddress: "Andheri, Mumbai",
  },
  {
    id: "GK-28399",
    customer: "Yash Malhotra",
    restaurant: "Tandoor Theory",
    amount: 1032,
    status: "PREPARING",
    time: "56 mins ago",
    placedAt: isoMinutesAgo(56),
    items: ["Signature Tandoor Combo", "Garlic Butter Naan"],
    deliveryAddress: "CP, Delhi",
  },
];

const topRestaurants: TopRestaurantRow[] = [
  { rank: 1, name: "Ghost Biryani House", orders: 184, revenue: 96450, rating: 4.5 },
  { rank: 2, name: "Midnight Pizza", orders: 162, revenue: 110320, rating: 4.3 },
  { rank: 3, name: "Idli Street", orders: 148, revenue: 48200, rating: 4.6 },
  { rank: 4, name: "Masala Meter", orders: 138, revenue: 78690, rating: 4.6 },
  { rank: 5, name: "The Burger Lab", orders: 127, revenue: 70230, rating: 4.4 },
];

const alerts: AdminAlert[] = [
  {
    id: "stuck-orders",
    title: "4 stuck orders",
    description: "Placed more than 15 minutes ago and still not confirmed.",
    severity: "danger",
    actionLabel: "Escalate",
  },
  {
    id: "offline-restaurants",
    title: "2 offline restaurants with pending orders",
    description: "One kitchen in Bandra and one in Hauz Khas went offline mid-queue.",
    severity: "warning",
    actionLabel: "Contact owners",
  },
];

const restaurantsTable: RestaurantManagementRow[] = [
  { id: "r1", name: "Ghost Biryani House", owner: "Ritesh Kapoor", cuisine: "Biryani", rating: 4.5, orders: 1842, status: "Active" },
  { id: "r2", name: "Midnight Pizza", owner: "Sana Mirza", cuisine: "Pizza", rating: 4.3, orders: 1621, status: "Active" },
  { id: "r3", name: "The Burger Lab", owner: "Aman Dhingra", cuisine: "Burgers", rating: 4.4, orders: 1488, status: "Active" },
  { id: "r4", name: "Wok This Way", owner: "Moksh Goyal", cuisine: "Chinese", rating: 4.2, orders: 932, status: "Pending" },
  { id: "r5", name: "Idli Street", owner: "Priya Nair", cuisine: "South Indian", rating: 4.6, orders: 2018, status: "Active" },
  { id: "r6", name: "Sugar Rush Desserts", owner: "Nikki Ahuja", cuisine: "Desserts", rating: 4.7, orders: 1674, status: "Active" },
  { id: "r7", name: "Green Bowl Co.", owner: "Harsh Vora", cuisine: "Healthy", rating: 4.1, orders: 754, status: "Suspended" },
  { id: "r8", name: "Roomali Roll Club", owner: "Aadil Khan", cuisine: "Rolls", rating: 4.0, orders: 889, status: "Active" },
];

const usersTable: UserManagementRow[] = [
  { id: "u1", name: "Aarav Mehta", email: "aarav@example.com", phone: "+91 98100 00001", role: "Customer", orders: 42, joined: "2025-09-18" },
  { id: "u2", name: "Ritesh Kapoor", email: "ritesh@example.com", phone: "+91 98100 00002", role: "Restaurant Owner", orders: 0, joined: "2025-07-11" },
  { id: "u3", name: "Ravi S.", email: "ravi@example.com", phone: "+91 98100 00003", role: "Delivery Agent", orders: 318, joined: "2025-08-03" },
  { id: "u4", name: "Anika Bhatia", email: "anika@example.com", phone: "+91 98100 00004", role: "Customer", orders: 28, joined: "2025-10-04" },
  { id: "u5", name: "Sana Mirza", email: "sana@example.com", phone: "+91 98100 00005", role: "Restaurant Owner", orders: 0, joined: "2025-06-27" },
  { id: "u6", name: "Karan Bedi", email: "karan@example.com", phone: "+91 98100 00006", role: "Admin", orders: 0, joined: "2025-01-09" },
  { id: "u7", name: "Mira Dsouza", email: "mira@example.com", phone: "+91 98100 00007", role: "Customer", orders: 61, joined: "2025-11-15" },
  { id: "u8", name: "Alok Tiwari", email: "alok@example.com", phone: "+91 98100 00008", role: "Delivery Agent", orders: 241, joined: "2025-05-20" },
];

const liveOrdersBoardSeed: ShopBoardItem[] = [
  {
    id: "SO-8101",
    customerName: "Aarav Mehta",
    itemsSummary: ["1x Signature Handi Special", "1x Matka Kulfi"],
    totalAmount: 487,
    placedAt: isoMinutesAgo(1),
    status: "new",
    autoRejectAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
  },
  {
    id: "SO-8098",
    customerName: "Neha Verma",
    itemsSummary: ["2x Paneer Makhani Bowl", "2x Garlic Butter Naan"],
    totalAmount: 716,
    placedAt: isoMinutesAgo(8),
    status: "preparing",
    prepTimeMinutes: 15,
  },
  {
    id: "SO-8093",
    customerName: "Kabir Nanda",
    itemsSummary: ["1x Tandoori Wings", "1x Masala Cola Float"],
    totalAmount: 418,
    placedAt: isoMinutesAgo(14),
    status: "ready",
    assignedAgentName: "Ravi S.",
  },
  {
    id: "SO-8088",
    customerName: "Sara Khan",
    itemsSummary: ["2x Signature Handi Special"],
    totalAmount: 778,
    placedAt: isoMinutesAgo(34),
    status: "completed",
    assignedAgentName: "Alok Tiwari",
  },
];

const shopMenuSeed: ShopMenuEditorItem[] = [
  { id: "m1", restaurantId: "ghost-biryani-house", name: "Smoked Tandoori Wings", description: "Charred wings with yoghurt chilli glaze.", price: 289, imageUrl: "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=800&q=80", category: "Starters", isVeg: false, isAvailable: true, isBestseller: true, sortOrder: 1 },
  { id: "m2", restaurantId: "ghost-biryani-house", name: "Crispy Chilli Paneer Bites", description: "Sticky paneer cubes tossed in sweet chilli.", price: 249, imageUrl: "https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=800&q=80", category: "Starters", isVeg: true, isAvailable: true, isBestseller: false, sortOrder: 2 },
  { id: "m3", restaurantId: "ghost-biryani-house", name: "Signature Handi Special", description: "Slow-cooked house handi with layered spices.", price: 389, imageUrl: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80", category: "Main Course", isVeg: false, isAvailable: true, isBestseller: true, sortOrder: 1 },
  { id: "m4", restaurantId: "ghost-biryani-house", name: "Paneer Makhani Bowl", description: "Creamy makhani with jeera rice.", price: 329, imageUrl: "https://images.unsplash.com/photo-1631452180539-96aca7d48617?auto=format&fit=crop&w=800&q=80", category: "Main Course", isVeg: true, isAvailable: true, isBestseller: false, sortOrder: 2 },
  { id: "m5", restaurantId: "ghost-biryani-house", name: "Matka Kulfi", description: "Saffron kulfi with pistachio crumble.", price: 119, imageUrl: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80", category: "Desserts", isVeg: true, isAvailable: false, isBestseller: true, sortOrder: 1 },
  { id: "m6", restaurantId: "ghost-biryani-house", name: "Masala Cola Float", description: "Chilled cola with vanilla cream.", price: 129, imageUrl: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=800&q=80", category: "Beverages", isVeg: true, isAvailable: true, isBestseller: false, sortOrder: 1 },
];

const timeline = [
  { label: "Mon", orders: 82, revenue: 28600 },
  { label: "Tue", orders: 95, revenue: 32500 },
  { label: "Wed", orders: 88, revenue: 30200 },
  { label: "Thu", orders: 110, revenue: 38100 },
  { label: "Fri", orders: 129, revenue: 44700 },
  { label: "Sat", orders: 142, revenue: 50300 },
  { label: "Sun", orders: 136, revenue: 48100 },
];

const topItems: TopSellingItem[] = [
  { name: "Signature Handi Special", value: 182 },
  { name: "Smoked Tandoori Wings", value: 141 },
  { name: "Paneer Makhani Bowl", value: 119 },
  { name: "Matka Kulfi", value: 96 },
  { name: "Masala Cola Float", value: 88 },
];

const deliveryAssignmentSeed: DeliveryAssignment = {
  orderId: "GK-28410",
  restaurantName: "Ghost Biryani House",
  pickupAddress: "12 Market Lane, Hauz Khas Village, Delhi",
  dropoffAddress: "27A Green Park Extension, Delhi",
  distanceKm: 4.8,
  estimatedEarnings: 112,
  itemsSummary: ["1x Signature Handi Special", "1x Matka Kulfi"],
  customerName: "Aarav Mehta",
  customerPhone: "+919810000001",
  restaurantPhone: "+919810000011",
  pickupLat: 28.5494,
  pickupLng: 77.2001,
  dropoffLat: 28.5484,
  dropoffLng: 77.2066,
};

const deliveryPaymentHistory: DeliveryPaymentHistoryRow[] = [
  { id: "pay-1", date: "2026-03-22", orderId: "GK-28410", basePay: 84, tip: 28, total: 112 },
  { id: "pay-2", date: "2026-03-22", orderId: "GK-28407", basePay: 76, tip: 12, total: 88 },
  { id: "pay-3", date: "2026-03-21", orderId: "GK-28394", basePay: 92, tip: 0, total: 92 },
  { id: "pay-4", date: "2026-03-20", orderId: "GK-28360", basePay: 81, tip: 20, total: 101 },
];

const deliveryEarningsByRange: Record<
  "Today" | "This week" | "This month",
  DeliveryEarningsSummary
> = {
  Today: {
    totalEarnings: 1120,
    deliveryCount: 11,
    avgPerDelivery: 102,
    tips: 146,
  },
  "This week": {
    totalEarnings: 6280,
    deliveryCount: 63,
    avgPerDelivery: 99,
    tips: 612,
  },
  "This month": {
    totalEarnings: 24110,
    deliveryCount: 244,
    avgPerDelivery: 98,
    tips: 2380,
  },
};

export async function getAdminDashboardData() {
  await wait();
  return {
    metrics,
    recentOrders,
    topRestaurants,
    alerts,
  } satisfies AdminDashboardData;
}

export async function getAdminRestaurantsData() {
  await wait();
  return restaurantsTable;
}

export async function getAdminUsersData() {
  await wait();
  return usersTable;
}

export async function getShopOrdersBoardData() {
  await wait();
  return liveOrdersBoardSeed;
}

export async function getShopMenuData() {
  await wait();
  return shopMenuSeed;
}

export async function getShopAnalyticsData() {
  await wait();
  return {
    keyMetrics: {
      avgOrderValue: 612,
      peakOrderingHour: "8:30 PM",
      repeatCustomerRate: "38%",
    },
    timeline,
    topItems,
  } satisfies ShopAnalyticsData;
}

export async function getDeliveryAssignmentSeed() {
  await wait(120);
  return deliveryAssignmentSeed;
}

export async function getDeliveryEarningsData(
  range: "Today" | "This week" | "This month",
) {
  await wait();
  return {
    summary: deliveryEarningsByRange[range],
    history: deliveryPaymentHistory,
  };
}
