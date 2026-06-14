import crypto from "crypto";
import { logger } from "../utils/logger.js";

export const requestTracingMiddleware = (req, res, next) => {
  req.id = crypto.randomUUID();
  req.startTime = Date.now();

  // Forward the ID to the client so it can correlate frontend Sentry events
  // with backend log lines. CORS exposes this header via exposedHeaders config.
  res.set("X-Request-ID", req.id);

  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    // Skip health-check noise at info level
    if (req.path === "/health" && res.statusCode < 400) return;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger.log(level, "http", {
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.get("user-agent"),
      userId: req.user?.id ?? req.user?.userId ?? null,
    });
  });

  next();
};
