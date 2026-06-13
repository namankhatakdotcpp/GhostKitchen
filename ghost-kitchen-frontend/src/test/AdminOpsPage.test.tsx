import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-hot-toast", () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const { api } = await import("@/lib/api");
const { AdminOpsPage } = await import("@/components/admin/admin-ops-page");

const DATA: Record<string, any> = {
  "/ops/alerts": { alerts: [{ type: "RIDER_OFFLINE", severity: "CRITICAL", entityType: "RIDER", entityId: "d1", message: "Ravi offline 12 min" }] },
  "/ops/sla": { measuredOrders: 10, onTime: 8, delayed: 2, onTimeRate: 80, avgLatenessMin: 6, days: 7 },
  "/ops/incidents": { incidents: [{ id: "inc-1", title: "Kitchen fire drill", description: null, severity: "HIGH", status: "OPEN", category: null, createdAt: new Date().toISOString() }] },
  "/ops/performance/riders": { riders: [{ riderId: "d1", name: "Ravi", deliveries: 12, avgDeliveryMin: 28, distanceKm: 40, cancellationRate: 5 }], days: 7 },
  "/ops/performance/restaurants": { restaurants: [{ restaurantId: "r1", name: "Pizza Place", rating: 4.5, revenuePaise: 1250000, orderVolume: 30, deliveredOrders: 27 }], days: 7 },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminOpsPage />
    </QueryClientProvider>,
  );
}

describe("AdminOpsPage", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => Promise.resolve({ data: DATA[url] }));
    vi.mocked(api.post).mockResolvedValue({ data: { incident: {} } });
  });

  it("renders SLA metrics", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("80%")).toBeInTheDocument());
    expect(screen.getByText("On-time rate")).toBeInTheDocument();
  });

  it("renders fleet alerts", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Ravi offline 12 min/)).toBeInTheDocument());
    // "CRITICAL" appears as the alert badge and as a severity <option>.
    expect(screen.getAllByText("CRITICAL").length).toBeGreaterThan(0);
  });

  it("renders the incident list", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen fire drill")).toBeInTheDocument());
  });

  it("renders rider and restaurant performance with rupee revenue", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Ravi")).toBeInTheDocument());
    expect(screen.getByText("Pizza Place")).toBeInTheDocument();
    expect(screen.getByText("₹12,500")).toBeInTheDocument(); // 1,250,000 paise → ₹12,500
  });

  it("creates an incident from the form", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Incident Center")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Incident title"), { target: { value: "Surge in Delhi" } });
    fireEvent.click(screen.getByRole("button", { name: "Create incident" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/ops/incidents", expect.objectContaining({ title: "Surge in Delhi", severity: "MEDIUM" })),
    );
  });

  it("raises an incident from an alert", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/Ravi offline 12 min/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Raise incident" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/ops/incidents", expect.objectContaining({ category: "RIDER_OFFLINE", entityId: "d1", severity: "CRITICAL" })),
    );
  });

  it("resolves an open incident", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Kitchen fire drill")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/ops/incidents/inc-1/resolve"));
  });
});
