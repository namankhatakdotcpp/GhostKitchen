import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
  logoutAllDevices,
} from "./auth.service.js";
import AppError from "../../utils/AppError.js";
import { auditLog } from "../../utils/audit.js";

// Use cross-origin cookie settings whenever the frontend is served over HTTPS
// (Vercel production). Avoids relying on NODE_ENV which may not be set on Render.
const isProd = process.env.FRONTEND_URL?.startsWith("https://") ||
               process.env.NODE_ENV === "production";
const SAME_SITE = isProd ? "none" : "lax";

export function setAuthCookies(res, accessToken, refreshToken) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: SAME_SITE,
    maxAge: 15 * 60 * 1000,   // 15 minutes
    path: "/",
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: SAME_SITE,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    path: "/api/auth/refresh",         // only sent to the refresh endpoint
  });
}

function clearAuthCookies(res) {
  const base = { httpOnly: true, secure: isProd, sameSite: SAME_SITE };
  res.clearCookie("access_token", { ...base, path: "/" });
  res.clearCookie("refresh_token", { ...base, path: "/api/auth/refresh" });
}

// POST /api/auth/register
export const register = async (req, res, next) => {
  try {
    const result = await registerUser(req.body);
    const { accessToken, refreshToken } = result.data.tokens;
    setAuthCookies(res, accessToken, refreshToken);
    await auditLog({ userId: result.data.user.id, action: 'USER_REGISTERED', req })
    res.status(201).json({ success: true, data: { user: result.data.user, accessToken, refreshToken } });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body.email, req.body.password);
    const { accessToken, refreshToken } = result.data.tokens;
    setAuthCookies(res, accessToken, refreshToken);
    await auditLog({ userId: result.data.user.id, action: 'USER_LOGIN', req })
    res.status(200).json({ success: true, data: { user: result.data.user, accessToken, refreshToken } });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
export const me = async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.userId);
    res.status(200).json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/refresh
// Accepts refresh token from cookie (browser) or request body (cross-origin clients).
export const refresh = async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!rawRefreshToken) throw new AppError("Refresh token missing", 401);

    const result = await refreshAccessToken(rawRefreshToken);
    const { accessToken, refreshToken } = result.data.tokens;
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json({ success: true, data: { user: result.data.user, accessToken, refreshToken } });
  } catch (error) {
    // Clear stale cookies so the client re-authenticates
    clearAuthCookies(res);
    next(error);
  }
};

// POST /api/auth/logout
export const logout = async (req, res, next) => {
  try {
    const rawRefreshToken = req.cookies?.refresh_token;
    await logoutUser(req.user.userId, rawRefreshToken);
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/logout-all
export const logoutAll = async (req, res, next) => {
  try {
    await logoutAllDevices(req.user.userId);
    clearAuthCookies(res);
    res.status(200).json({ success: true, message: "Logged out from all devices" });
  } catch (error) {
    next(error);
  }
};
