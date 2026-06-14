/**
 * Admin Controller
 * 
 * Request handlers for admin operations
 * Routes admin API requests to service layer
 */

import * as adminService from "./admin.service.js";
import { getSiteConfig, updateSiteConfig, broadcastMaintenanceNotification } from "../config/config.service.js";
import { auditLog } from "../../utils/audit.js";
import { logger } from "../../utils/logger.js";
import { sendRestaurantApprovedEmail } from "../../services/email.service.js";

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
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_ORDER_STATUS", entityType: "Order", entityId: id, meta: { status, reason }, req }); } catch { /* non-fatal */ }

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

    const order = await adminService.cancelOrder(id, reason || "Admin cancelled");
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_CANCEL_ORDER", entityType: "Order", entityId: id, meta: { reason }, req }); } catch { /* non-fatal */ }

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
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_CREATE_COUPON", entityType: "Coupon", entityId: coupon.id, meta: { code: coupon.code }, req }); } catch { /* non-fatal */ }
    res.json({ success: true, coupon });
  } catch (error) { next(error); }
};

export const updateAdminCoupon = async (req, res, next) => {
  try {
    const coupon = await adminService.updateAdminCoupon(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_COUPON", entityType: "Coupon", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, coupon });
  } catch (error) { next(error); }
};

export const deleteAdminCoupon = async (req, res, next) => {
  try {
    await adminService.deleteAdminCoupon(req.params.id);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_DELETE_COUPON", entityType: "Coupon", entityId: req.params.id, req }); } catch { /* non-fatal */ }
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const updateUserRole = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot modify your own role" });
    }
    const user = await adminService.updateUserRole(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_USER_ROLE", entityType: "User", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const suspendRestaurant = async (req, res, next) => {
  try {
    const restaurant = await adminService.suspendRestaurant(req.params.id);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_SUSPEND_RESTAURANT", entityType: "Restaurant", entityId: req.params.id, req }); } catch { /* non-fatal */ }
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
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_ASSIGN_DELIVERY", entityType: "Order", entityId: id, meta: { deliveryUserId }, req }); } catch { /* non-fatal */ }

    res.json({
      success: true,
      data: order,
      message: "Delivery partner assigned successfully",
    });
  } catch (error) {
    next(error);
  }
};

// ─── Restaurant Detail & Update ───────────────────────────────────────────────

export const getRestaurantDetail = async (req, res, next) => {
  try {
    const restaurant = await adminService.getRestaurantDetail(req.params.id);
    res.json({ success: true, data: restaurant });
  } catch (error) { next(error); }
};

export const updateRestaurant = async (req, res, next) => {
  try {
    const restaurant = await adminService.updateRestaurant(req.params.id, req.body);
    await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_RESTAURANT", entityType: "Restaurant", entityId: req.params.id, meta: req.body, req });
    res.json({ success: true, data: restaurant });
  } catch (error) { next(error); }
};

// ─── Menu Items ───────────────────────────────────────────────────────────────

export const getMenuItems = async (req, res, next) => {
  try {
    const result = await adminService.getMenuItems(req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const createMenuItem = async (req, res, next) => {
  try {
    const item = await adminService.createMenuItem(req.body);
    await auditLog({ userId: req.user.userId, action: "ADMIN_CREATE_MENU_ITEM", entityType: "MenuItem", entityId: item.id, meta: { restaurantId: item.restaurantId, name: item.name }, req });
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
};

export const updateMenuItem = async (req, res, next) => {
  try {
    const item = await adminService.updateMenuItem(req.params.id, req.body);
    await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_MENU_ITEM", entityType: "MenuItem", entityId: req.params.id, meta: req.body, req });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};

export const deleteMenuItem = async (req, res, next) => {
  try {
    await adminService.deleteMenuItem(req.params.id);
    await auditLog({ userId: req.user.userId, action: "ADMIN_DELETE_MENU_ITEM", entityType: "MenuItem", entityId: req.params.id, req });
    res.json({ success: true });
  } catch (error) { next(error); }
};

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const getReviews = async (req, res, next) => {
  try {
    const result = await adminService.getReviews(req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const deleteReview = async (req, res, next) => {
  try {
    await adminService.deleteReview(req.params.id);
    await auditLog({ userId: req.user.userId, action: "ADMIN_DELETE_REVIEW", entityType: "Review", entityId: req.params.id, req });
    res.json({ success: true });
  } catch (error) { next(error); }
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const getAuditLogEntries = async (req, res, next) => {
  try {
    const result = await adminService.getAuditLog(req.query);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

// ─── User update ─────────────────────────────────────────────────────────────

export const updateUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot modify your own account via admin" });
    }
    const user = await adminService.updateUser(req.params.id, req.body);
    try {
      await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_USER", entityType: "User", entityId: req.params.id, meta: req.body, req });
    } catch (auditErr) {
      logger.warn("Admin updateUser audit log failed (non-fatal)", { error: auditErr.message });
    }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const blockUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot block your own account" });
    }
    const user = await adminService.blockUser(req.params.id, req.body);
    try {
      await auditLog({ userId: req.user.userId, action: "ADMIN_BLOCK_USER", entityType: "User", entityId: req.params.id, meta: req.body, req });
    } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const changeUserRole = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot change your own role via admin" });
    }
    const user = await adminService.changeUserRole(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_CHANGE_ROLE", entityType: "User", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const grantRole = async (req, res, next) => {
  try {
    const user = await adminService.grantRole(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_GRANT_ROLE", entityType: "User", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const revokeRole = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot revoke your own roles via admin" });
    }
    const user = await adminService.revokeRole(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_REVOKE_ROLE", entityType: "User", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account via admin" });
    }
    await adminService.deleteUserById(req.params.id);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_DELETE_USER", entityType: "User", entityId: req.params.id, req }); } catch { /* non-fatal */ }
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const getSettings = async (req, res, next) => {
  try {
    const config = await getSiteConfig();
    res.json({ success: true, settings: config });
  } catch (error) { next(error); }
};

export const updateSettings = async (req, res, next) => {
  try {
    const prev = await getSiteConfig();
    const config = await updateSiteConfig(req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_UPDATE_SETTINGS", entityType: "SiteConfig", entityId: "singleton", meta: req.body, req }); } catch { /* non-fatal */ }

    const justEnabled = !prev.maintenanceMode && config.maintenanceMode;
    const justScheduled = !prev.maintenanceScheduledAt && config.maintenanceScheduledAt;
    if (justEnabled || justScheduled) {
      // fire-and-forget — don't block the response
      broadcastMaintenanceNotification(config).catch(() => {});
    }

    res.json({ success: true, settings: config });
  } catch (error) { next(error); }
};

export const approveRestaurant = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approve = true } = req.body;
    const restaurant = await adminService.setRestaurantApproval(id, approve);
    try { await auditLog({ userId: req.user.userId, action: approve ? "ADMIN_APPROVE_RESTAURANT" : "ADMIN_UNAPPROVE_RESTAURANT", entityType: "Restaurant", entityId: id, req }); } catch { /* non-fatal */ }

    if (approve && restaurant?.owner?.email) {
      sendRestaurantApprovedEmail({
        to: restaurant.owner.email,
        name: restaurant.owner.name,
        restaurantName: restaurant.name,
      }).catch(() => {});
    }

    res.json({ success: true, restaurant });
  } catch (error) { next(error); }
};

export const suspendUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ success: false, message: "Cannot suspend your own account" });
    }
    const user = await adminService.suspendUser(req.params.id, req.body);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_SUSPEND_USER", entityType: "User", entityId: req.params.id, meta: req.body, req }); } catch { /* non-fatal */ }
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

export const deleteRestaurant = async (req, res, next) => {
  try {
    await adminService.deleteRestaurantById(req.params.id);
    try { await auditLog({ userId: req.user.userId, action: "ADMIN_DELETE_RESTAURANT", entityType: "Restaurant", entityId: req.params.id, req }); } catch { /* non-fatal */ }
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const exportAuditLog = async (req, res, next) => {
  try {
    const { userId, action, format = "json" } = req.query;
    const entries = await adminService.getAuditLogAll({ userId, action });
    if (format === "csv") {
      const csv = adminService.auditLogToCsv(entries);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit-log-${Date.now()}.csv"`);
      return res.send(csv);
    }
    res.json({ success: true, entries });
  } catch (error) { next(error); }
};

export const getAnalytics = async (req, res, next) => {
  try {
    const { days = 7 } = req.query;
    const data = await adminService.getAnalytics({ days: Number(days) });
    res.json(data);
  } catch (error) { next(error); }
};

export const getDeliveryAgents = async (req, res, next) => {
  try {
    const { page, limit, search, onlineOnly } = req.query;
    const data = await adminService.getDeliveryAgents({ page, limit, search, onlineOnly });
    res.json(data);
  } catch (error) { next(error); }
};

export const toggleAgentSuspend = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { suspend } = req.body;
    const user = await adminService.suspendUser(id, { suspend });
    try { await auditLog({ userId: req.user.userId, action: suspend ? "ADMIN_SUSPEND_AGENT" : "ADMIN_UNSUSPEND_AGENT", entityType: "User", entityId: id, req }); } catch { /* non-fatal */ }
    res.json({ user });
  } catch (error) { next(error); }
};

/**
 * GET /admin/live-map
 * Snapshot for the live operations map: restaurants, riders, active deliveries.
 */
export const getLiveMap = async (req, res, next) => {
  try {
    const data = await adminService.getLiveMapData();
    res.json(data);
  } catch (error) { next(error); }
};
