"use client";

import { create } from "zustand";
import axiosInstance from "@/lib/api";

/**
 * Order Store - Zustand State Management
 * 
 * Manages:
 * - Order history for authenticated user
 * - Creating orders from cart
 * - Fetching order details
 * - Updating order status (for tracking)
 * - Sharing order data across app
 * 
 * Architecture:
 * - Backend as source of truth (not local state)
 * - Auto-refetch after mutations
 * - Proper error handling with user messages
 */

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: number;
  price: number;
  menuItem?: {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
    restaurantId: string;
  };
}

export interface Order {
  id: string;
  userId: string;
  restaurantId: string;
  totalAmount: number;
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  paymentStatus: "PENDING" | "SUCCESS" | "FAILED";
  orderItems: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

interface OrderState {
  // State
  orders: Order[];
  selectedOrder: Order | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchOrders: () => Promise<void>;
  fetchOrderById: (orderId: string) => Promise<void>;
  createOrder: () => Promise<Order>;
  updateOrderStatus: (orderId: string, status: string) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  updateOrder: (order: Order) => void; // Real-time updates from Socket.IO
  clearError: () => void;
  reset: () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  // Initial State
  orders: [],
  selectedOrder: null,
  isLoading: false,
  error: null,

  /**
   * FETCH ORDERS
   * Get all orders for authenticated user
   * 
   * Usage:
   * ```
   * const { fetchOrders, orders } = useOrderStore();
   * await fetchOrders();
   * ```
   */
  fetchOrders: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.get("/orders");
      set({
        orders: response.data.data || [],
        isLoading: false,
      });
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to fetch orders";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * FETCH SINGLE ORDER
   * Get order details by ID
   * 
   * Verification:
   * - User can only see their own orders
   * - Returns error if unauthorized
   */
  fetchOrderById: async (orderId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.get(`/orders/${orderId}`);
      set({
        selectedOrder: response.data.data,
        isLoading: false,
      });
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to fetch order";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * CREATE ORDER
   * Create order from cart
   * 
   * Flow:
   * 1. POST /orders/create
   * 2. Backend creates order from cart items
   * 3. Backend clears cart
   * 4. Return created order
   * 5. Add to orders list in store
   * 
   * Usage:
   * ```
   * const { createOrder } = useOrderStore();
   * const newOrder = await createOrder();
   * // Order now in orders[] and ready for payment
   * ```
   */
  createOrder: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.post("/orders/create");
      const newOrder = response.data.data;

      // Add new order to the beginning of orders list
      set((state) => ({
        orders: [newOrder, ...state.orders],
        selectedOrder: newOrder,
        isLoading: false,
      }));

      return newOrder;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to create order";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * UPDATE ORDER STATUS
   * Change order status (used for order tracking)
   * 
   * Statuses:
   * - PENDING (initial state)
   * - CONFIRMED (payment received)
   * - PREPARING (kitchen working)
   * - OUT_FOR_DELIVERY (on the way)
   * - DELIVERED (arrived)
   * - CANCELLED
   */
  updateOrderStatus: async (orderId: string, status: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.patch(`/orders/${orderId}/status`, {
        status,
      });
      const updatedOrder = response.data.data;

      // Update in orders list
      set((state) => ({
        orders: state.orders.map((order) =>
          order.id === orderId ? updatedOrder : order
        ),
        selectedOrder:
          state.selectedOrder?.id === orderId
            ? updatedOrder
            : state.selectedOrder,
        isLoading: false,
      }));
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to update order status";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * CANCEL ORDER
   * Cancel an order
   * 
   * Restrictions:
   * - Can't cancel if already delivered
   * - User can only cancel their own orders
   */
  cancelOrder: async (orderId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.delete(`/orders/${orderId}`);
      const cancelledOrder = response.data.data;

      // Update in orders list
      set((state) => ({
        orders: state.orders.map((order) =>
          order.id === orderId ? cancelledOrder : order
        ),
        selectedOrder:
          state.selectedOrder?.id === orderId
            ? cancelledOrder
            : state.selectedOrder,
        isLoading: false,
      }));
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to cancel order";
      set({
        error: message,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * CLEAR ERROR
   * Remove error message from state
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * UPDATE ORDER (REAL-TIME)
   * Update order from Socket.IO event
   * Merges new order data into existing order or adds new order
   */
  updateOrder: (updatedOrder: Order) => {
    set((state) => {
      const exists = state.orders.some((o) => o.id === updatedOrder.id);
      
      return {
        orders: exists
          ? state.orders.map((order) =>
              order.id === updatedOrder.id ? updatedOrder : order
            )
          : [updatedOrder, ...state.orders],
        selectedOrder:
          state.selectedOrder?.id === updatedOrder.id
            ? updatedOrder
            : state.selectedOrder,
      };
    });
  },

  /**
   * RESET
   * Clear all order data (usually on logout)
   */
  reset: () => {
    set({
      orders: [],
      selectedOrder: null,
      isLoading: false,
      error: null,
    });
  },
}));
