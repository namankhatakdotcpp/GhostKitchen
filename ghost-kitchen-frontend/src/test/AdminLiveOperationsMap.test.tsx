import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mock react-leaflet / leaflet so markers render as plain DOM in jsdom ─────────
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tile" />,
  Marker: ({ children, position }: any) => (
    <div data-testid="marker" data-pos={(position as number[]).join(",")}>
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
}));
vi.mock("leaflet", () => ({ default: { divIcon: vi.fn(() => ({})) } }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

// ── Mock the API client ──────────────────────────────────────────────────────────
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

// ── Mock the socket — capture handlers so we can fire events manually ────────────
const handlers: Record<string, (...args: any[]) => void> = {};
vi.mock("@/lib/socket", () => ({
  getSocket: () => ({
    connected: true,
    connect: vi.fn(),
    on: (event: string, handler: (...args: any[]) => void) => { handlers[event] = handler; },
    off: (event: string) => { delete handlers[event]; },
  }),
}));

const { api } = await import("@/lib/api");
const { default: AdminLiveOperationsMap } = await import("@/components/admin/AdminLiveOperationsMap");

const NOW = new Date().toISOString();

const SNAPSHOT = {
  restaurants: [
    { id: "r1", name: "Pizza Place", latitude: 28.61, longitude: 77.2, rating: 4.5, status: "OPEN", activeOrders: 12, todaysOrders: 30 },
  ],
  riders: [
    { id: "d1", name: "Fast Rider", status: "ONLINE", latitude: 28.7, longitude: 77.1, heading: 90, speed: 15, lastSeenAt: NOW, activeDeliveries: 3 },
  ],
  activeOrders: [
    {
      id: "ckorderabc123456", orderNumber: "123456", status: "OUT_FOR_DELIVERY", total: 45000,
      restaurant: { id: "r1", name: "Pizza Place", latitude: 28.61, longitude: 77.2 },
      customer: { id: "c1", name: "Alice" },
      rider: { id: "d1", name: "Fast Rider", latitude: 28.7, longitude: 77.1 },
    },
  ],
};

function renderMap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminLiveOperationsMap />
    </QueryClientProvider>,
  );
}

describe("AdminLiveOperationsMap", () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    vi.mocked(api.get).mockResolvedValue({ data: SNAPSHOT });
  });

  it("renders the map container and tile layer", async () => {
    renderMap();
    expect(await screen.findByTestId("map")).toBeInTheDocument();
    expect(screen.getByTestId("tile")).toBeInTheDocument();
  });

  it("renders a marker for each restaurant, rider and active delivery", async () => {
    renderMap();
    // 1 restaurant + 1 rider + 1 delivery = 3 markers
    await waitFor(() => expect(screen.getAllByTestId("marker")).toHaveLength(3));
  });

  it("renders popups with restaurant and rider details", async () => {
    renderMap();
    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBeGreaterThan(0));
    // Names appear in their own popup and are referenced in the delivery popup.
    expect(screen.getAllByText("Pizza Place").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fast Rider").length).toBeGreaterThan(0);
    expect(screen.getByText(/Order #123456/)).toBeInTheDocument();
  });

  it("updates only the affected rider marker on a socket location event", async () => {
    renderMap();
    await waitFor(() => expect(screen.getAllByTestId("marker").length).toBe(3));

    // Before: no marker sits at the new coordinates.
    expect(screen.queryByText((_, el) => el?.getAttribute("data-pos") === "28.8,77.3")).toBeNull();

    await act(async () => {
      handlers["rider:location:update"]({
        riderId: "d1", latitude: 28.8, longitude: 77.3, heading: 100, speed: 20,
        status: "ONLINE", lastSeenAt: new Date().toISOString(),
      });
    });

    // After: the rider marker moved to the new coordinates.
    await waitFor(() => {
      const moved = screen.getAllByTestId("marker").some((m) => m.getAttribute("data-pos") === "28.8,77.3");
      expect(moved).toBe(true);
    });
  });

  it("shows the live counts in the header", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText("Riders online")).toBeInTheDocument());
    expect(screen.getByText("Restaurants")).toBeInTheDocument();
    expect(screen.getByText("Active deliveries")).toBeInTheDocument();
  });
});
