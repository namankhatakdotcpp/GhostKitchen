/**
 * Cart Service
 * 
 * Business logic for cart operations:
 * - Add item to cart (or increase quantity if exists)
 * - Get user's cart
 * - Remove item from cart
 * - Update item quantity
 * 
 * WHY business logic in service:
 * - Controllers only handle HTTP
 * - Services handle business rules
 * - Easy to reuse in other contexts
 * - Easy to test
 */

import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";

/**
 * Add item to cart
 * If item already in cart, increase quantity
 * Otherwise create new cart item
 */
export const addToCart = async (userId, menuItemId, quantity = 1) => {
  if (quantity < 1) {
    throw new AppError("Quantity must be at least 1", 400);
  }

  // Verify menu item exists
  const menuItem = await prisma.menuItem.findUnique({
    where: { id: menuItemId },
    select: { id: true, name: true, price: true, restaurantId: true },
  });

  if (!menuItem) {
    throw new AppError("Menu item not found", 404);
  }

  // Check if item already in cart
  const existing = await prisma.cartItem.findUnique({
    where: {
      userId_menuItemId: { userId, menuItemId },
    },
  });

  if (existing) {
    // Update quantity if already exists
    return await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
      include: { menuItem: true },
    });
  }

  // Create new cart item
  return await prisma.cartItem.create({
    data: { userId, menuItemId, quantity },
    include: { menuItem: true },
  });
};

/**
 * Get user's cart with menu item details
 */
export const getCart = async (userId) => {
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      menuItem: {
        include: { restaurant: true },
      },
    },
  });

  // Calculate totals
  const cartTotal = cartItems.reduce((sum, item) => {
    return sum + Number(item.menuItem.price) * item.quantity;
  }, 0);

  return {
    items: cartItems,
    total: cartTotal,
    itemCount: cartItems.length,
  };
};

/**
 * Remove item from cart
 */
export const removeFromCart = async (userId, cartItemId) => {
  // Verify item belongs to user
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, userId },
  });

  if (!item) {
    throw new AppError("Item not found in cart", 404);
  }

  // Delete the item
  await prisma.cartItem.delete({
    where: { id: cartItemId },
  });

  return { success: true, message: "Removed from cart" };
};

/**
 * Update item quantity
 */
export const updateQuantity = async (userId, cartItemId, quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError("Invalid quantity. Must be a positive integer", 400);
  }

  // Verify item belongs to user
  const item = await prisma.cartItem.findFirst({
    where: { id: cartItemId, userId },
  });

  if (!item) {
    throw new AppError("Item not found in cart", 404);
  }

  // Update quantity
  return await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity },
    include: { menuItem: true },
  });
};

/**
 * Clear entire cart for user
 */
export const clearCart = async (userId) => {
  await prisma.cartItem.deleteMany({
    where: { userId },
  });

  return { success: true, message: "Cart cleared" };
};
