import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { api } = await import("@/lib/api");
const AdminAnalyticsPage = (await import("@/app/(admin)/admin/analytics/page")).default;

const BASE_DELIVERY = {
  totalRiderPayouts: 500000,
  totalRestaurantPayouts: 800000,
  totalAdminRevenue: 200000,
  totalDeliveryFees: 300000,
  avgRiderPayout: 5000,
  avgRestaurantPayout: 8000,
  avgDistanceKm: 4.2,
  cancellationPct: 5,
  avgPrepTimeMin: 12,
  avgAssignmentTimeMin: 3,
  avgDeliveryTimeMin: 28,
  avgOrderValue: 34900,       // paise → ₹349
  repeatCustomerPct: 42,
  onTimePct: 87,
  riderUtilizationPct: 73,
  restaurantUtilizationPct: 60,
};

const BASE_RESPONSE = {
  trend: [{ date: "2026-06-28", orders: 10, revenue: 349000 }],
  statusBreakdown: { DELIVERED: 10 },
  topRestaurants: [],
  summary: { totalOrders: 10, deliveredOrders: 10, totalRevenue: 349000 },
  delivery: BASE_DELIVERY,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAnalyticsPage />
    </QueryClientProvider>,
  );
}

describe("AdminAnalyticsPage — 5 new KPI tiles", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: BASE_RESPONSE });
  });

  it("renders avg order value in rupees (paise ÷ 100)", async () => {
    renderPage();
    // Wait for the value itself — proves isLoading is false and data is rendered
    await waitFor(() => expect(screen.getByText("₹349")).toBeInTheDocument());
    expect(screen.getByText("Avg order value")).toBeInTheDocument();
  });

  it("renders repeat customer percentage", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("42%")).toBeInTheDocument());
    expect(screen.getByText("Repeat customers")).toBeInTheDocument();
  });

  it("renders on-time delivery percentage", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("87%")).toBeInTheDocument());
    expect(screen.getByText("On-time delivery")).toBeInTheDocument();
  });

  it("renders rider utilization percentage", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("73%")).toBeInTheDocument());
    expect(screen.getByText("Rider utilization")).toBeInTheDocument();
  });

  it("renders restaurant utilization percentage", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("60%")).toBeInTheDocument());
    expect(screen.getByText("Restaurant utilization")).toBeInTheDocument();
  });

  it("shows ₹0 and 0% for all 5 tiles when backend returns null or 0", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ...BASE_RESPONSE,
        delivery: {
          ...BASE_DELIVERY,
          avgOrderValue: 0,
          repeatCustomerPct: 0,
          onTimePct: null,
          riderUtilizationPct: null,
          restaurantUtilizationPct: null,
          cancellationPct: 0,
        },
      },
    });
    renderPage();
    // Wait for query to resolve — use waitFor on the value cell itself
    await waitFor(() => {
      const zeroPcts = screen.getAllByText("0%");
      expect(zeroPcts.length).toBeGreaterThanOrEqual(4);
    });
    // null fields render as 0%, not NaN% or undefined
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
    // avgOrderValue=0 → ₹0 (may appear multiple times across tiles, that's fine)
    expect(screen.getAllByText(/₹0/).length).toBeGreaterThanOrEqual(1);
  });

  it("degrades to zero state with no crashes when window has no orders at all", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        trend: [],
        statusBreakdown: {},
        topRestaurants: [],
        summary: { totalOrders: 0, deliveredOrders: 0, totalRevenue: 0 },
        delivery: {
          totalRiderPayouts: 0, totalRestaurantPayouts: 0, totalAdminRevenue: 0, totalDeliveryFees: 0,
          avgRiderPayout: 0, avgRestaurantPayout: 0, avgDistanceKm: 0,
          cancellationPct: 0, avgPrepTimeMin: null, avgAssignmentTimeMin: null, avgDeliveryTimeMin: null,
          avgOrderValue: 0, repeatCustomerPct: 0, onTimePct: null, riderUtilizationPct: null, restaurantUtilizationPct: null,
        },
      },
    });
    renderPage();
    // Wait for query to resolve: all percentage tiles become "0%" instead of "—"
    await waitFor(() => {
      const zeroPcts = screen.getAllByText("0%");
      expect(zeroPcts.length).toBeGreaterThanOrEqual(4);
    });
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getAllByText(/₹0/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows tile labels while loading (data shows — until query resolves)", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText("Avg order value")).toBeInTheDocument();
    expect(screen.getByText("Repeat customers")).toBeInTheDocument();
    expect(screen.getByText("On-time delivery")).toBeInTheDocument();
    expect(screen.getByText("Rider utilization")).toBeInTheDocument();
    expect(screen.getByText("Restaurant utilization")).toBeInTheDocument();
    // All value cells show "—" during load
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it("passes days param to the API when date range changes", async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/analytics?days=7"));
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/admin/analytics?days=30"));
  });
});
