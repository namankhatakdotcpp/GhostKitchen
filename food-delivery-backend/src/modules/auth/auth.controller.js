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

// Use this instead of setAuthCookies when you only have a new access token.
// The refresh_token cookie has path "/api/auth/refresh" and is never sent to
// role routes, so calling setAuthCookies there overwrites it with "".
export function setAccessTokenCookie(res, accessToken) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: SAME_SITE,
    maxAge: 15 * 60 * 1000,
    path: "/",
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
// Accepts refresh token from cookie (browser) or request body (cross-origin
// clients). Refresh tokens rotate on every use (auth.service.js deletes the
// old DB row and issues a new one), so the cookie and the client's
// localStorage-tracked token can fall out of sync after a single hiccup —
// e.g. a Set-Cookie that didn't get applied, or a request that raced an
// earlier rotation. Treating the cookie as the *only* candidate (the old
// `cookies?.refresh_token || body?.refreshToken` short-circuit) meant that
// once that happened, the stale cookie permanently shadowed a perfectly
// valid, freshly-rotated token in the body, and every future refresh failed
// with "revoked or expired" even though the client genuinely had a live
// token. Try both candidates and use whichever the rotation table accepts.
export const refresh = async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.refresh_token;
    const bodyToken = req.body?.refreshToken;

    if (!cookieToken && !bodyToken) throw new AppError("Refresh token missing", 401);

    let result;
    let lastError;
    for (const candidate of [cookieToken, bodyToken]) {
      if (!candidate) continue;
      try {
        result = await refreshAccessToken(candidate);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!result) throw lastError ?? new AppError("Refresh token missing", 401);

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
