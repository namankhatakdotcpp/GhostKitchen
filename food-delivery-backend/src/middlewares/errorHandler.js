/**
 * Global Error Handler Middleware
 * 
 * Catches all errors (sync and async) and formats them consistently
 * 
 * WHY centralized error handling:
 * - Consistent error responses across API
 * - Proper status codes
 * - Sensitive error details only in development
 * - Logging for debugging
 */

import AppError from "../utils/AppError.js";

// Async error wrapper for routes
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Global error handling middleware
export const globalErrorHandler = (err, req, res, next) => {
  // Default error
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("❌ Error:", {
      message: err.message,
      status: err.statusCode,
      stack: err.stack,
    });
  }

  // Handle specific error types
  if (err.name === "ValidationError") {
    err.statusCode = 400;
    err.status = "fail";
  }

  if (err.name === "CastError") {
    err.statusCode = 400;
    err.status = "fail";
    err.message = "Invalid ID format";
  }

  if (err.code === "P2002") {
    // Prisma duplicate key error
    err.statusCode = 409;
    err.status = "fail";
    err.message = "Duplicate field value entered";
  }

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    status: err.status,
    message: err.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
