import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
        Welcome back
      </p>
      <h1 className="mt-3 text-3xl font-bold text-text-primary">Login</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Sign in with your GhostKitchen account to continue ordering.
      </p>

      <form className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-text-primary">
            Email
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-border px-4 text-sm outline-none transition focus:border-brand focus:shadow-focus"
            placeholder="you@example.com"
            type="email"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-text-primary">
            Password
          </span>
          <input
            className="h-12 w-full rounded-2xl border border-border px-4 text-sm outline-none transition focus:border-brand focus:shadow-focus"
            placeholder="Enter your password"
            type="password"
          />
        </label>

        <Button className="h-12 w-full">Continue</Button>
      </form>

      <p className="mt-6 text-sm text-text-secondary">
        New here?{" "}
        <Link className="font-semibold text-brand" href="/register">
          Create an account
        </Link>
      </p>
    </div>
  );
}
