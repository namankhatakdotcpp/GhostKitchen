import { verifyAccessToken } from "../utils/jwt.js";
import { roleMiddleware } from "./role.middleware.js";

function decodeUser(decoded) {
  return {
    userId: decoded.userId,
    roles: decoded.roles ?? [decoded.role ?? "CUSTOMER"],
    activeRole: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
    role: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
    secondRole: decoded.secondRole ?? null,
    restaurantId: decoded.restaurantId ?? null,
  };
}

export const authenticate = (req, res, next) => {
  try {
    // 1. HttpOnly cookie (primary — browser requests)
    const cookieToken = req.cookies?.access_token;

    // 2. Authorization header (API clients / mobile / server-to-server, and
    // this app's own frontend — it stores tokens in localStorage specifically
    // to survive cross-origin cookie failures between Vercel and Render).
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!cookieToken && !headerToken) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Try both candidates rather than treating "a cookie is present" as
    // exclusive — a stale/garbage access_token cookie (e.g. left over from
    // an earlier session, a JWT_SECRET rotation, or a logout that didn't
    // fully clear) used to permanently shadow a perfectly valid Authorization
    // header: the old code took `token = cookieToken`, found it truthy, and
    // never even looked at the header once that cookie failed verification.
    // That meant every request 401'd with "Invalid token" regardless of how
    // fresh the localStorage-backed Bearer token was — indistinguishable
    // from a real auth failure on the frontend, even right after a fresh
    // login, until the bad cookie expired or was manually cleared.
    let decoded;
    let lastError;
    for (const candidate of [cookieToken, headerToken]) {
      if (!candidate) continue;
      try {
        decoded = verifyAccessToken(candidate);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!decoded) {
      if (lastError?.message.includes("expired")) {
        // Structured code so the frontend interceptor can catch and auto-refresh
        return res.status(401).json({ message: "Token expired", code: "TOKEN_EXPIRED" });
      }
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = decodeUser(decoded);

    next();
  } catch (error) {
    return res.status(401).json({ message: "Authentication failed" });
  }
};

// Like authenticate but never blocks — sets req.user if token is valid, otherwise continues
export const optionalAuthenticate = (req, res, next) => {
  try {
    const cookieToken = req.cookies?.access_token;
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!cookieToken && !headerToken) return next();

    // Same fall-through as authenticate() above — don't let a stale cookie
    // shadow a valid header.
    for (const candidate of [cookieToken, headerToken]) {
      if (!candidate) continue;
      try {
        const decoded = verifyAccessToken(candidate);
        req.user = decodeUser(decoded);
        break;
      } catch {
        // Try the next candidate — invalid/expired here just means "keep looking"
      }
    }
    next();
  } catch {
    next();
  }
};

export const authorize = roleMiddleware;
