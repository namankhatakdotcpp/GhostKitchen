/**
 * Authentication Service
 * 
 * Handles core auth logic:
 * - User registration with hashed password
 * - User login with credentials verification
 * - Token generation and storage
 * - Refresh token management
 * - Session validation
 */

import { prisma } from "../../config/prisma.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import {
  generateTokenPair,
  verifyRefreshToken,
  generateAccessToken,
} from "../../utils/jwt.js";
import AppError from "../../utils/AppError.js";

/**
 * Register a new user
 * @param {Object} data - User registration data
 * @returns {Object} User and tokens
 * 
 * WHY store refresh token in DB:
 * - Can invalidate tokens on logout
 * - Can detect compromised tokens
 * - Can refresh from multiple devices
 */
export const registerUser = async (data) => {
  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new AppError("Email already registered", 409);
  }

  // Hash password with bcrypt
  const hashedPassword = await hashPassword(data.password);

  // Create user in database
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      phone: data.phone || null,
      role: data.role || "CUSTOMER",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      createdAt: true,
    },
  });

  // Generate token pair (access + refresh)
  const tokenPair = generateTokenPair({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // Store refresh token in database
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: tokenPair.refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  return {
    success: true,
    message: "User registered successfully",
    data: {
      user,
      tokens: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      },
    },
  };
};

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} User and tokens
 */
export const loginUser = async (email, password) => {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      phone: true,
    },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Verify password
  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Remove password from response
  const { password: _, ...userWithoutPassword } = user;

  // Generate token pair
  const tokenPair = generateTokenPair({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  // Store refresh token in database
  const refreshTokenExpiry = new Date();
  refreshTokenExpiry.setDate(refreshTokenExpiry.getDate() + 7); // 7 days

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: tokenPair.refreshToken,
      expiresAt: refreshTokenExpiry,
    },
  });

  return {
    success: true,
    message: "Login successful",
    data: {
      user: userWithoutPassword,
      tokens: {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
      },
    },
  };
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token from database
 * @returns {Object} New access token
 */
export const refreshAccessToken = async (refreshToken) => {
  // Verify refresh token signature
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new AppError("Invalid refresh token", 401);
  }

  // Check if refresh token exists in database (not revoked)
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!storedToken) {
    throw new AppError("Refresh token not found", 401);
  }

  // Check if token is expired
  if (new Date() > storedToken.expiresAt) {
    throw new AppError("Refresh token expired", 401);
  }

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Generate new access token
  const newAccessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken: newAccessToken,
    },
  };
};

/**
 * Get current user details
 * @param {string} userId - User ID from token
 * @returns {Object} User details
 */
export const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
};

/**
 * Logout user - revoke refresh token
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token to revoke
 * @returns {Object} Success message
 */
export const logoutUser = async (userId, refreshToken) => {
  // Delete the refresh token from database
  await prisma.refreshToken.deleteMany({
    where: {
      userId,
      token: refreshToken,
    },
  });

  return {
    success: true,
    message: "Logged out successfully",
  };
};

/**
 * Logout from all devices - revoke all refresh tokens
 * @param {string} userId - User ID
 * @returns {Object} Success message
 */
export const logoutAllDevices = async (userId) => {
  // Delete all refresh tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });

  return {
    success: true,
    message: "Logged out from all devices",
  };
};

