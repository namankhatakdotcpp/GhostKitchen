/**
 * Cart Controller
 * 
 * HTTP request handlers for cart operations
 * Receives request → validates → calls service → sends response
 */

import * as cartService from "./cart.service.js";

/**
 * Add item to cart
 * POST /api/cart/add
 */
export const add = async (req, res, next) => {
  try {
    const { menuItemId, quantity } = req.body;

    // Validate input
    if (!menuItemId) {
      return res.status(400).json({
        success: false,
        message: "menuItemId is required",
      });
    }

    const result = await cartService.addToCart(
      req.user.userId,
      menuItemId,
      quantity || 1
    );

    res.status(200).json({
      success: true,
      message: "Added to cart",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's cart
 * GET /api/cart
 */
export const get = async (req, res, next) => {
  try {
    const result = await cartService.getCart(req.user.userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove item from cart
 * DELETE /api/cart/:id
 */
export const remove = async (req, res, next) => {
  try {
    const result = await cartService.removeFromCart(
      req.user.userId,
      req.params.id
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Update item quantity
 * PATCH /api/cart/:id
 */
export const update = async (req, res, next) => {
  try {
    const { quantity } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: "quantity is required",
      });
    }

    const result = await cartService.updateQuantity(
      req.user.userId,
      req.params.id,
      quantity
    );

    res.status(200).json({
      success: true,
      message: "Quantity updated",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clear entire cart
 * DELETE /api/cart
 */
export const clear = async (req, res, next) => {
  try {
    const result = await cartService.clearCart(req.user.userId);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
