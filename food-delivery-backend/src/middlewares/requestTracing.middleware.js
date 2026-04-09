/**
 * Request Tracing Middleware
 * 
 * Assigns unique ID to each request for distributed tracing
 * Useful for debugging production incidents
 * 
 * Usage:
 * - Every log will include req.id
 * - Allows correlating frontend → backend → database
 * - Deploy to ELK/Splunk/DataDog for aggregation
 */

import crypto from "crypto";

export const requestTracingMiddleware = (req, res, next) => {
  // Assign unique ID to request
  req.id = crypto.randomUUID();
  req.startTime = Date.now();

  // Log request incoming
  // (Optional: uncomment for verbose debugging)
  // logger.debug(`[${req.id}] ${req.method} ${req.path}`, {
  //   ip: req.ip,
  //   userAgent: req.get('user-agent'),
  // });

  // Calculate response time when response is sent
  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    // Optionally log response time
    // logger.info(`[${req.id}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });

  next();
};
