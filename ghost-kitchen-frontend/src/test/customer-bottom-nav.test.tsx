import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Must be hoisted — override setup.ts's next/navigation mock for this file
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Import after vi.mock so the mock is in place
const { usePathname } = await import("next/navigation");
const { CustomerBottomNav } = await import("@/components/customer/customer-bottom-nav");

describe("CustomerBottomNav", () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue("/");
  });

  it("renders a nav element with aria-label 'Main navigation'", () => {
    render(<CustomerBottomNav />);
    expect(screen.getByRole("navigation", { name: /main navigation/i })).toBeInTheDocument();
  });

  it("marks the active Home link with aria-current='page' when on '/'", () => {
    render(<CustomerBottomNav />);
    const homeLink = screen.getByRole("link", { name: /home/i });
    expect(homeLink).toHaveAttribute("aria-current", "page");
  });

  it("does not mark inactive links with aria-current", () => {
    render(<CustomerBottomNav />);
    const ordersLink = screen.getByRole("link", { name: /orders/i });
    expect(ordersLink).not.toHaveAttribute("aria-current");
  });

  it("renders all 5 navigation links", () => {
    render(<CustomerBottomNav />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("marks the Orders link as active when on /orders", () => {
    vi.mocked(usePathname).mockReturnValue("/orders");
    render(<CustomerBottomNav />);
    const ordersLink = screen.getByRole("link", { name: /orders/i });
    expect(ordersLink).toHaveAttribute("aria-current", "page");
    // Home should not be active
    expect(screen.getByRole("link", { name: /home/i })).not.toHaveAttribute("aria-current");
  });

  it("returns null (renders nothing) when on /login", () => {
    vi.mocked(usePathname).mockReturnValue("/login");
    const { container } = render(<CustomerBottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when on /register", () => {
    vi.mocked(usePathname).mockReturnValue("/register");
    const { container } = render(<CustomerBottomNav />);
    expect(container.firstChild).toBeNull();
  });
});
