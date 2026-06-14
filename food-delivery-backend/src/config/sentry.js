import * as Sentry from "@sentry/node";
import { env } from "./env.js";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    // RENDER_GIT_COMMIT is injected automatically by Render on every deploy.
    // Set SENTRY_RELEASE in env vars to override (e.g. for manual releases).
    release: process.env.SENTRY_RELEASE || process.env.RENDER_GIT_COMMIT || "unknown",
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.cookies) event.request.cookies = "[filtered]";
      if (event.request?.headers?.cookie) event.request.headers.cookie = "[filtered]";
      if (event.request?.headers?.authorization) event.request.headers.authorization = "[filtered]";
      return event;
    },
  });
}

export function captureException(err, context = {}) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    // Tag requestId so Sentry events can be correlated with Winston log lines
    // and the X-Request-ID header the client received.
    if (context.requestId) scope.setTag("requestId", context.requestId);
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(err);
  });
}

export function setSentryUser(userId, email, role) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser({ id: userId, email, role });
}

export function clearSentryUser() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.setUser(null);
}

export { Sentry };
