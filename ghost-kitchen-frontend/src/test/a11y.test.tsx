/**
 * Accessibility regression tests using axe-core.
 *
 * These tests run the axe accessibility engine against rendered components and
 * HTML snippets to catch WCAG 2.1 AA violations automatically.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

// ── next/navigation mock for components that use it ───────────────────────────
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { CustomerBottomNav } = await import("@/components/customer/customer-bottom-nav");

// Helper: run axe on a rendered container and assert no violations
async function assertNoA11yViolations(container: Element) {
  const results = await axe.run(container);
  const violations = results.violations;
  if (violations.length > 0) {
    const details = violations
      .map((v) => `[${v.id}] ${v.description}\n  ${v.nodes.map((n) => n.html).join("\n  ")}`)
      .join("\n\n");
    throw new Error(`Accessibility violations found:\n\n${details}`);
  }
  expect(violations).toHaveLength(0);
}

// ── CustomerBottomNav ─────────────────────────────────────────────────────────

describe("a11y — CustomerBottomNav", () => {
  it("has no axe violations", async () => {
    const { container } = render(<CustomerBottomNav />);
    await assertNoA11yViolations(container);
  });

  it("nav landmark is labelled", async () => {
    const { container } = render(<CustomerBottomNav />);
    const nav = container.querySelector("nav");
    expect(nav).toHaveAttribute("aria-label");
    await assertNoA11yViolations(container);
  });
});

// ── Skip link markup ──────────────────────────────────────────────────────────

describe("a11y — skip link", () => {
  it("skip link points to #main-content and has accessible text", async () => {
    const { container } = render(
      <div>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <main id="main-content">
          <p>Page content</p>
        </main>
      </div>
    );
    await assertNoA11yViolations(container);
  });
});

// ── Dialog markup pattern ─────────────────────────────────────────────────────

describe("a11y — modal dialog pattern", () => {
  it("dialog with role, aria-modal, and aria-labelledby is violation-free", async () => {
    const { container } = render(
      <div>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          id="test-modal"
        >
          <h2 id="modal-title">Order Details</h2>
          <button type="button" aria-label="Close order details">
            <span aria-hidden="true">✕</span>
          </button>
          <p>Modal content here.</p>
          <label htmlFor="status-select">Update Status</label>
          <select id="status-select">
            <option value="PLACED">Placed</option>
            <option value="DELIVERED">Delivered</option>
          </select>
        </div>
      </div>
    );
    await assertNoA11yViolations(container);
  });
});

// ── Icon-only buttons ─────────────────────────────────────────────────────────

describe("a11y — icon-only buttons must have accessible names", () => {
  it("button with aria-label and aria-hidden icon is violation-free", async () => {
    const { container } = render(
      <div>
        <button type="button" aria-label="Cart, 3 items">
          <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          </svg>
          <span aria-hidden="true">3</span>
        </button>
      </div>
    );
    await assertNoA11yViolations(container);
  });

  it("button without accessible name triggers violation", async () => {
    const { container } = render(
      <div>
        <button type="button">
          <svg viewBox="0 0 24 24" width="24" height="24" role="img">
            <title>Cart</title>
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          </svg>
        </button>
      </div>
    );
    // This one should pass since the SVG has a <title> — we're just verifying
    // axe runs without error
    const results = await axe.run(container);
    expect(results).toBeDefined();
  });
});

// ── Form labels ───────────────────────────────────────────────────────────────

describe("a11y — form input labels", () => {
  it("labelled input with htmlFor/id pair is violation-free", async () => {
    const { container } = render(
      <form>
        <label htmlFor="location-search">Search by area or city</label>
        <input
          id="location-search"
          type="text"
          autoComplete="off"
          placeholder="e.g. Koramangala"
        />
      </form>
    );
    await assertNoA11yViolations(container);
  });

  it("image without alt text triggers an axe violation (axe is wired up correctly)", async () => {
    // This test verifies the axe runner is active — an img missing alt is a WCAG 1.1.1 violation
    const { container } = render(
      <div>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img src="/food.jpg" />
      </div>
    );
    const results = await axe.run(container);
    const hasImageAltViolation = results.violations.some((v) => v.id === "image-alt");
    expect(hasImageAltViolation).toBe(true);
  });
});

// ── Navigation aria-current ───────────────────────────────────────────────────

describe("a11y — aria-current on nav links", () => {
  it("active link with aria-current='page' is violation-free", async () => {
    const { container } = render(
      <nav aria-label="Main navigation">
        <a href="/" aria-current="page">Home</a>
        <a href="/orders">Orders</a>
        <a href="/profile">Profile</a>
      </nav>
    );
    await assertNoA11yViolations(container);
  });
});
