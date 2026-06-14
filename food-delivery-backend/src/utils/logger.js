import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "../../logs");

const isProduction = process.env.NODE_ENV === "production";

// Production: pure JSON to stdout so Render's log aggregator can parse structured fields.
// Development: colourised printf for human readability.
const consoleFormat = isProduction
  ? winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : "";
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    );

// In production (Render) stdout/stderr is captured by the platform log aggregator.
// File transports write to the ephemeral Render disk — wiped on every deploy.
const transports = [
  new winston.transports.Console({ format: consoleFormat }),
];

if (!isProduction) {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "ghostkitchen-backend" },
  transports,
});

export default logger;
