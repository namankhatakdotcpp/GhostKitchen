"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// Next.js App Router error boundary, scoped to this route only — an
// undefined-property crash here (e.g. the .toFixed bug on a missing
// deliveryAgent.rating) used to bubble all the way up to Next's generic
// "Application error" screen with no context and no way back for the user.
export default function OrderTrackError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Order tracking page crashed", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-shell px-4 py-10 md:px-6 lg:px-8">
      <div className="rounded-[28px] border border-border bg-white p-8 text-center shadow-[0_18px_40px_rgba(28,28,28,0.05)]">
        <h1 className="text-2xl font-bold text-text-primary">Something went wrong</h1>
        <p className="mt-3 text-sm text-text-secondary">
          We hit a snag loading this order&apos;s tracking page. Your order itself
          is unaffected — tap below to try again.
        </p>
        <Button className="mt-6" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
