"use client";

// Auth state is fully persisted in localStorage via Zustand's persist middleware.
// No server-side session check on every mount — that causes cross-origin cookie
// failures on Vercel→Render to silently log users out.
// Token validity is enforced naturally: API calls with expired cookies get 401,
// the axios interceptor handles refresh, and logout clears state.

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
