export type UserRole = "customer" | "shopkeeper" | "admin" | "delivery";

export interface Address {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  addresses: Address[];
}

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  cuisines: string[];
  rating: number;
  reviewCount: number;
  deliveryTime: number;
  deliveryFee: number;
  minOrder: number;
  imageUrl: string;
  isVeg: boolean;
  isOpen: boolean;
  address: Address;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  isVeg: boolean;
  isAvailable: boolean;
  isBestseller: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
}

export interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  price: number;
}

export type OrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "PREPARING"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  rating: number;
  vehicleNumber: string;
}

export interface Order {
  id: string;
  userId?: string;
  customerId?: string;
  restaurantId: string;
  restaurant?: Restaurant;
  items?: OrderItem[];
  orderItems: OrderItem[];
  status: OrderStatus;
  totalAmount?: number;
  total?: number;
  deliveryFee?: number;
  paymentStatus?: "PENDING" | "SUCCESS" | "FAILED";
  deliveryAddress?: Address;
  createdAt: string;
  updatedAt?: string;
  deliveryAgent?: DeliveryAgent;
  subtotal?: number;
  discount?: number;
  estimatedDelivery?: string;
  deliveredAt?: string | null;
  user?: User;
}

export interface FeaturedBanner {
  id: string;
  title: string;
  subtitle: string;
  bgColor: string;
}

export interface CategoryOption {
  label: string;
  emoji: string;
}

export type FilterOption =
  | "Rating 4.0+"
  | "Pure Veg"
  | "Offers"
  | "Fast Delivery"
  | "₹300-₹600";

export interface LocationOption {
  id: string;
  label: string;
  city: "Delhi" | "Mumbai";
}

export interface RestaurantFeedCard extends Restaurant {
  offer?: string;
  isNew?: boolean;
  distanceKm: number;
  costForTwo: number;
  outletLabel: string;
  offers: string[];
  cityLabel: "Delhi" | "Mumbai";
}

export interface RestaurantMenuSection {
  category: string;
  items: MenuItem[];
}

export interface TimelineStage {
  status: OrderStatus;
  label: string;
  subText: string;
  timestamp: string | null;
}

export interface AgentLocation {
  lat: number;
  lng: number;
}

export interface TrackedOrder extends Order {
  timeline: TimelineStage[];
  restaurantTypeEmoji: string;
  agentLocation?: AgentLocation;
}

export interface RestaurantListResponse {
  restaurants: RestaurantFeedCard[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RestaurantDetailResponse {
  restaurant: RestaurantFeedCard;
  menu: RestaurantMenuSection[];
}

export interface RestaurantMenuResponse {
  restaurantId: string;
  menu: RestaurantMenuSection[];
}

export interface OrdersListResponse {
  orders: TrackedOrder[];
}

export interface OrderResponse {
  order: TrackedOrder;
}

export interface CartResponse {
  restaurant: RestaurantFeedCard | null;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export interface ApiErrorPayload {
  error: string;
  code: number;
}

export interface CreateOrderRequest {
  restaurantId: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
  }>;
  addressId: string;
  couponCode?: string;
}

export interface CartSyncRequest {
  restaurantId: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
  }>;
}

export type AdminOrderStatus =
  | "PLACED"
  | "CONFIRMED"
  | "PREPARING"
  | "DELIVERING"
  | "DELIVERED"
  | "CANCELLED";

export interface AdminMetric {
  id: string;
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "flat";
  icon: string;
  sparkline?: number[];
  meta?: string;
}

export interface AdminOrderRow {
  id: string;
  customer: string;
  restaurant: string;
  amount: number;
  status: AdminOrderStatus;
  time: string;
  placedAt: string;
  items: string[];
  deliveryAddress: string;
}

export interface TopRestaurantRow {
  rank: number;
  name: string;
  orders: number;
  revenue: number;
  rating: number;
}

export interface AdminAlert {
  id: string;
  title: string;
  description: string;
  severity: "danger" | "warning";
  actionLabel: string;
}

export interface RestaurantManagementRow {
  id: string;
  name: string;
  owner: string;
  cuisine: string;
  rating: number;
  orders: number;
  status: "Active" | "Pending" | "Suspended";
}

export interface UserManagementRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "Customer" | "Restaurant Owner" | "Delivery Agent" | "Admin";
  orders: number;
  joined: string;
}

export interface AdminDashboardData {
  metrics: AdminMetric[];
  recentOrders: AdminOrderRow[];
  topRestaurants: TopRestaurantRow[];
  alerts: AdminAlert[];
}

export interface ShopBoardItem {
  id: string;
  customerName: string;
  itemsSummary: string[];
  totalAmount: number;
  placedAt: string;
  status: "new" | "preparing" | "ready" | "completed";
  prepTimeMinutes?: number;
  assignedAgentName?: string;
  autoRejectAt?: string;
}

export interface ShopMenuEditorItem extends MenuItem {
  sortOrder: number;
}

export interface ShopAnalyticsPoint {
  label: string;
  orders: number;
  revenue: number;
}

export interface TopSellingItem {
  name: string;
  value: number;
}

export interface ShopAnalyticsData {
  keyMetrics: {
    avgOrderValue: number;
    peakOrderingHour: string;
    repeatCustomerRate: string;
  };
  timeline: ShopAnalyticsPoint[];
  topItems: TopSellingItem[];
}

export interface DeliveryAssignment {
  orderId: string;
  restaurantName: string;
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  estimatedEarnings: number;
  itemsSummary: string[];
  customerName: string;
  customerPhone: string;
  restaurantPhone: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}

export interface DeliveryEarningsSummary {
  totalEarnings: number;
  deliveryCount: number;
  avgPerDelivery: number;
  tips: number;
}

export interface DeliveryPaymentHistoryRow {
  id: string;
  date: string;
  orderId: string;
  basePay: number;
  tip: number;
  total: number;
}

declare module "next-auth" {
  interface User {
    id: string;
    role: string;
    accessToken: string;
  }
  interface Session {
    accessToken: string;
    user: {
      id: string;
      role: string;
      email: string;
      name: string | null;
      image: string | null;
    };
  }
}

// JWT augmentation commented out as next-auth/jwt may not be available
// declare module "next-auth/jwt" {
//   interface JWT {
//     id: string;
//     role: string;
//     accessToken: string;
//   }
// }
