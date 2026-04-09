import * as orderService from "./order.service.js";

/**
 * Order Controller - HTTP Request Handlers
 * 
 * All routes require authentication (handled by middleware)
 */

/**
 * POST /api/order/create
 * Create a new order from cart
 * 
 * WHY:
 * 1. Converts cart items to order items
 * 2. Calculates total automatically
 * 3. Clears cart after order is created
 * 4. Returns order ready for payment
 */
export const create = async (req, res, next) => {
  try {
    const order = await orderService.createOrder(req.user.id);
    res.status(201).json({
      success: true,
      message: "Order created successfully 🚀",
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/order
 * Get all orders for authenticated user
 * 
 * Returns:
 * - Order history with items
 * - Most recent orders first
 * - Includes reviews if available
 */
export const getUserOrders = async (req, res, next) => {
  try {
    const orders = await orderService.getUserOrders(req.user.id);
    res.json({
      success: true,
      message: "Orders fetched successfully",
      data: orders,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/order/:id
 * Get single order by ID
 * 
 * Verification:
 * - User can only see their own orders
 * - Returns 403 if order doesn't belong to user
 */
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await orderService.getOrderById(id, req.user.id);
    res.json({
      success: true,
      message: "Order fetched successfully",
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/order/:id/status
 * Update order status (Admin/System use)
 * 
 * Body:
 * {
 *   "status": "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED"
 * }
 */
export const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const order = await orderService.updateOrderStatus(id, status);
    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/order/:id/payment-status
 * Update payment status
 * 
 * Body:
 * {
 *   "paymentStatus": "SUCCESS" | "FAILED"
 * }
 */
export const updatePaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        message: "Payment status is required",
      });
    }

    const order = await orderService.updatePaymentStatus(id, paymentStatus);
    res.json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/order/:id
 * Cancel an order
 * 
 * Restrictions:
 * - Can't cancel delivered orders
 * - Can't cancel already cancelled orders
 * - User can only cancel their own orders
 */
export const cancel = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await orderService.cancelOrder(id, req.user.id);
    res.json({
      success: true,
      message: "Order cancelled successfully",
      data: order,
    });
  } catch (err) {
    next(err);
  }
};
