import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "../../logs");

/**
 * Winston Logger Configuration
 * 
 * Handles:
 * - Console output (development)
 * - File logging (production)
 * - Error tracking and rotation
 * 
 * Log Levels:
 * - error: Critical errors
 * - warn: Warnings
 * - info: General information
 * - debug: Detailed debug info
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "ghostkitchen-backend" },
  transports: [
    // Console output for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, ...meta }) => {
            let metaStr = "";
            if (Object.keys(meta).length > 0) {
              metaStr = JSON.stringify(meta);
            }
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          }
        )
      ),
    }),

    // Error logs
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // Combined logs
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

/**
 * HTTP Request Logger (Morgan-style)
 * Use in middleware: app.use(logger.httpLogger())
 */
export const httpLogger = (req, res, next) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? "warn" : "info";

    logger.log(level, `${req.method} ${req.path}`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
};

export default logger;
