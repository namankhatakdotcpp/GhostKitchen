import * as Sentry from "@sentry/node";
import { env } from "./env.js";

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Don't send PII by default
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip cookie values and auth headers before sending to Sentry
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
