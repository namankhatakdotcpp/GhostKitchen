import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency amount
 * Input: 1500 -> Output: "1,500"
 */
export function formatCurrency(amount: number): string {
  return (amount / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Format date for display
 * Input: "2026-04-10T12:30:00Z" -> Output: "Apr 10, 12:30 PM"
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid date";
  }
}

/**
 * Format date only (no time)
 * Input: "2026-04-10T12:30:00Z" -> Output: "Apr 10, 2026"
 */
export function formatDateOnly(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Invalid date";
  }
}

/**
 * Format time only
 * Input: "2026-04-10T12:30:00Z" -> Output: "12:30 PM"
 */
export function formatTimeOnly(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid time";
  }
}
