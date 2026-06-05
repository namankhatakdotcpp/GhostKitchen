/**
 * Admin Controller
 * 
 * Request handlers for admin operations
 * Routes admin API requests to service layer
 */

import * as adminService from "./admin.service.js";
import { logger } from "../../utils/logger.js";

/**
 * GET /admin/orders
 * Fetch all orders with optional filters
 */
export const getAllOrders = async (req, res, next) => {
  try {
    const { status, startDate, endDate, restaurantId, userId } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (restaurantId) filters.restaurantId = restaurantId;
    if (userId) filters.userId = userId;

    const orders = await adminService.getAllOrders(filters);

    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/orders/:id
 * Fetch single order details
 */
export const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const order = await adminService.getOrderById(id);

    res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /admin/orders/:id/status
 * Update order status
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const order = await adminService.updateOrderStatus(id, status, reason);

    res.json({
      success: true,
      data: order,
      message: "Order status updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /admin/orders/:id/cancel
 * Cancel order (admin override)
 */
export const cancelOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await adminService.cancelOrder(
      id,
      reason || "Admin cancelled"
    );

    res.json({
      success: true,
      data: order,
      message: "Order cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /admin/stats
 * Admin dashboard statistics
 */
export const getAdminStats = async (req, res, next) => {
  try {
    const stats = await adminService.getAdminStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const result = await adminService.getUsers(req.query)
    res.json({ success: true, ...result })
  } catch (error) { next(error) }
};

export const getRestaurants = async (req, res, next) => {
  try {
    const result = await adminService.getRestaurants(req.query)
    res.json({ success: true, ...result })
  } catch (error) { next(error) }
};

/**
 * POST /admin/orders/:id/assign-delivery
 * Assign delivery partner to order
 */
export const getAdminPayments = async (req, res, next) => {
  try {
    const result = await adminService.getAdminPayments(req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getAdminCoupons = async (req, res, next) => {
  try {
    const result = await adminService.getAdminCoupons(req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const createAdminCoupon = async (req, res, next) => {
  try {
    const coupon = await adminService.createAdminCoupon(req.body);
    res.json({ success: true, coupon });
  } catch (error) { next(error); }
};

export const updateAdminCoupon = async (req, res, next) => {
  try {
    const coupon = await adminService.updateAdminCoupon(req.params.id, req.body);
    res.json({ success: true, coupon });
  } catch (error) { next(error); }
};

export const deleteAdminCoupon = async (req, res, next) => {
  try {
    await adminService.deleteAdminCoupon(req.params.id);
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const updateUserRole = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot modify your own role" });
    }
    const user = await adminService.updateUserRole(req.params.id, req.body);
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const suspendRestaurant = async (req, res, next) => {
  try {
    const restaurant = await adminService.suspendRestaurant(req.params.id);
    res.json({ success: true, restaurant });
  } catch (error) { next(error); }
};

export const assignDeliveryPartner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deliveryUserId } = req.body;

    if (!deliveryUserId) {
      return res.status(400).json({
        success: false,
        message: "Delivery user ID is required",
      });
    }

    const order = await adminService.assignDeliveryPartner(id, deliveryUserId);

    res.json({
      success: true,
      data: order,
      message: "Delivery partner assigned successfully",
    });
  } catch (error) {
    next(error);
  }
};
