import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/store/authStore", () => ({
  useAuthStore: vi.fn(),
}));

const { useAuthStore } = await import("@/store/authStore");
const { ProtectedRoute } = await import("@/components/auth/ProtectedRoute");

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));

function setAuthState(overrides: {
  isAuthenticated?: boolean;
  hasHydrated?: boolean;
  user?: any | null;
}) {
  vi.mocked(useAuthStore).mockReturnValue({
    isAuthenticated: true,
    hasHydrated: true,
    user: {
      id: "u1",
      email: "t@x.com",
      name: "T",
      roles: ["CUSTOMER"],
      activeRole: "CUSTOMER",
    },
    ...overrides,
  } as any);
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    // default: authenticated CUSTOMER
    setAuthState({});
  });

  it("renders children when authenticated with correct role", () => {
    render(
      <ProtectedRoute requiredRole={["CUSTOMER"]}>
        <div>Protected Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("shows loading spinner when store has not yet hydrated", () => {
    setAuthState({ hasHydrated: false, isAuthenticated: false });

    render(
      <ProtectedRoute requiredRole={["CUSTOMER"]}>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    // Spinner should be visible (div with animate-spin class)
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows spinner and redirects when not authenticated", () => {
    setAuthState({ hasHydrated: true, isAuthenticated: false, user: null });

    render(
      <ProtectedRoute requiredRole={["CUSTOMER"]}>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    // While redirecting, spinner shows instead of children
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining("/login"));
  });

  it("redirects to /unauthorized when role does not match", () => {
    setAuthState({
      isAuthenticated: true,
      hasHydrated: true,
      user: {
        id: "u2",
        email: "r@x.com",
        name: "R",
        roles: ["RESTAURANT"],
        activeRole: "RESTAURANT",
      },
    });

    render(
      <ProtectedRoute requiredRole={["CUSTOMER"]}>
        <div>Customer Only</div>
      </ProtectedRoute>
    );

    expect(mockReplace).toHaveBeenCalledWith("/unauthorized");
  });

  it("blocks a tampered activeRole not present in roles array", () => {
    // activeRole says ADMIN but roles[] only has CUSTOMER — tampered localStorage
    setAuthState({
      isAuthenticated: true,
      hasHydrated: true,
      user: {
        id: "u3",
        email: "hack@x.com",
        name: "H",
        roles: ["CUSTOMER"],
        activeRole: "ADMIN", // tampered
      },
    });

    render(
      <ProtectedRoute requiredRole={["ADMIN"]}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    expect(mockReplace).toHaveBeenCalledWith("/unauthorized");
  });

  it("allows access when no requiredRole is specified", () => {
    render(
      <ProtectedRoute>
        <div>Open Protected</div>
      </ProtectedRoute>
    );
    expect(screen.getByText("Open Protected")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("allows access when user has any of multiple required roles", () => {
    render(
      <ProtectedRoute requiredRole={["CUSTOMER", "ADMIN"]}>
        <div>Multi-role Content</div>
      </ProtectedRoute>
    );
    expect(screen.getByText("Multi-role Content")).toBeInTheDocument();
  });
});
