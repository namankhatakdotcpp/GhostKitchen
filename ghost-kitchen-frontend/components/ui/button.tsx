import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = {
  primary:
    "bg-brand text-white hover:bg-brand-dark border-brand shadow-[0_8px_20px_rgba(255,82,0,0.18)]",
  ghost:
    "border-brand bg-white text-brand hover:bg-brand-light",
  subtle:
    "border-border bg-white text-text-primary hover:border-brand/40 hover:text-brand",
} as const;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-pill border px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60",
        buttonVariants[variant],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
