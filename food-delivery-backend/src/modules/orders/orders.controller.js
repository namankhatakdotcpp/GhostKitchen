import {
  createOrder,
  getOrderById,
  listOrders,
} from "./orders.service.js";
import { validateCreateOrder } from "./orders.validation.js";
import { emitOrderAssignedToAgent, emitOrderNew } from "../../socket/socket.server.js";

export const getOrders = async (req, res) => {
  try {
    const orders = await listOrders(req.user?.userId);
    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
};

export const getOrder = async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.json({ order });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch order" });
  }
};

export const placeOrder = async (req, res) => {
  try {
    const validationError = validateCreateOrder(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const order = await createOrder(req.body, req.user.userId);

    emitOrderNew({
      restaurantId: order.restaurantId,
      order,
    });

    if (order.agentId) {
      emitOrderAssignedToAgent({
        agentId: order.agentId,
        order,
        pickup: order.restaurant?.address,
        dropoff: order.deliveryAddress,
        earnings: Math.max(Math.round(Number(order.deliveryFee) + 40), 50),
      });
    }

    return res.status(201).json({ order });
  } catch (error) {
    // Handle specific validation errors
    if (
      error.message?.includes("Invalid items") ||
      error.message?.includes("Invalid coupon") ||
      error.message?.includes("Coupon") ||
      error.message?.includes("Not found")
    ) {
      return res.status(400).json({ message: error.message });
    }

    console.error("Order creation error:", error);
    return res.status(500).json({ message: "Unable to place order" });
  }
};
