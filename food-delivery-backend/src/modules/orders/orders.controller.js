import {
  assignDeliveryAgent,
  createOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
} from "./orders.service.js";
import { validateCreateOrder, validateStatusUpdate } from "./orders.validation.js";
import { emitOrderAssignedToAgent, emitOrderNew, emitOrderStatusUpdated } from "../../socket/socket.server.js";

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

export const updateOrderStatusHTTP = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { status: newStatus } = req.body;
    const io = req.app.locals.io;

    // Fetch current order to get existing status
    const currentOrder = await getOrderById(orderId);

    if (!currentOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Validate status transition based on user role
    const validationError = validateStatusUpdate(
      req.body,
      currentOrder.status,
      req.user.role
    );

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    // Update order status
    const updatedOrder = await updateOrderStatus({
      orderId,
      status: newStatus,
      agentId: req.user.role === "DELIVERY" ? req.user.userId : undefined,
    });

    // If status changed to CONFIRMED, assign delivery agent
    if (newStatus === "CONFIRMED" && io) {
      const assignedAgent = await assignDeliveryAgent(orderId, io);
      if (!assignedAgent) {
        console.warn(`No agents available for order ${orderId}`);
      }
    }

    // Emit socket event to notify all parties
    if (io) {
      emitOrderStatusUpdated({
        orderId,
        status: newStatus,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("Order status update error:", error);
    return res.status(500).json({ message: "Unable to update order status" });
  }
};
