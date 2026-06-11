import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Capture React render errors and hydration mismatches
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Drop noisy browser extension errors
      if (event.exception?.values?.some(
        (v) => v.value?.includes("ResizeObserver loop") || v.value?.includes("Script error")
      )) return null;
      return event;
    },
  });
}
