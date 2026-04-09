/**
 * Custom AppError class for consistent error handling
 * Extends Error to provide status code and proper error information
 * 
 * WHY: Centralized error handling ensures consistent API responses
 * All errors can be caught and formatted uniformly
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
