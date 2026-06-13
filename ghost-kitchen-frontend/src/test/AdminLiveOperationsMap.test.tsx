import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const flyTo = vi.fn();

// ── Mock react-leaflet / cluster / heat so markers render as plain DOM ───────────
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tile" />,
  Marker: ({ children, position }: any) => (
    <div data-testid="marker" data-pos={(position as number[]).join(",")}>
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  Polyline: ({ positions }: any) => <div data-testid="polyline" data-pts={JSON.stringify(positions)} />,
  useMap: () => ({ flyTo, getZoom: () => 12, removeLayer: vi.fn(), addLayer: vi.fn() }),
}));
vi.mock("react-leaflet-cluster", () => ({ default: ({ children }: any) => <div data-testid="cluster">{children}</div> }));
vi.mock("leaflet", () => ({ default: { divIcon: vi.fn(() => ({})) } }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));
vi.mock("leaflet.heat", () => ({}));

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

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
    { id: "r1", name: "Pizza Place", latitude: 28.61, longitude: 77.2, rating: 4.5, status: "OPEN", activeOrders: 3, todaysOrders: 30 },
  ],
  riders: [
    { id: "d1", name: "Fast Rider", status: "ONLINE", latitude: 28.7, longitude: 77.1, heading: 90, speed: 24, lastSeenAt: NOW, activeDeliveries: 1 },
  ],
  activeOrders: [
    {
      id: "ckorderabc123456", orderNumber: "123456", status: "OUT_FOR_DELIVERY", total: 45000,
      estimatedDelivery: new Date(Date.now() + 18 * 60_000).toISOString(),
      restaurant: { id: "r1", name: "Pizza Place", latitude: 28.61, longitude: 77.2 },
      customer: { id: "c1", name: "Alice", latitude: 28.55, longitude: 77.05 },
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

describe("AdminLiveOperationsMap (enhanced)", () => {
  beforeEach(() => {
    for (const k of Object.keys(handlers)) delete handlers[k];
    flyTo.mockClear();
    vi.mocked(api.get).mockResolvedValue({ data: SNAPSHOT });
  });

  it("renders the map and the fleet statistics panel", async () => {
    renderMap();
    expect(await screen.findByTestId("map")).toBeInTheDocument();
    expect(screen.getByText("Riders online")).toBeInTheDocument();
    expect(screen.getByText("Avg ETA")).toBeInTheDocument();
    expect(screen.getByText("Avg speed")).toBeInTheDocument();
  });

  it("computes average speed from rider data", async () => {
    renderMap();
    // "24 km/h" shows in both the stats panel and the rider popup.
    await waitFor(() => expect(screen.getAllByText("24 km/h").length).toBeGreaterThan(0));
  });

  it("renders rider, restaurant and delivery markers", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText(/Last seen:/)).toBeInTheDocument()); // rider popup
    expect(screen.getByText(/Average rating:/)).toBeInTheDocument(); // restaurant popup
    expect(screen.getByText(/Order #123456/)).toBeInTheDocument(); // delivery popup
  });

  it("hides restaurant markers when the Restaurants layer is unchecked", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText(/Average rating:/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Restaurants"));
    await waitFor(() => expect(screen.queryByText(/Average rating:/)).toBeNull());
  });

  it("filters riders out of the map when the search matches nothing", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText(/Last seen:/)).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("Name or rider ID…"), { target: { value: "nobody" } });
    await waitFor(() => expect(screen.queryByText(/Last seen:/)).toBeNull());
  });

  it("draws route polylines and flies to the rider when an order is selected", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText(/Order #123456/)).toBeInTheDocument());

    // The order also appears as a clickable item in the sidebar list.
    const orderButton = screen.getByRole("button", { name: /#123456/ });
    fireEvent.click(orderButton);

    await waitFor(() => expect(screen.getAllByTestId("polyline").length).toBe(2)); // rider→restaurant + rider→customer
    expect(flyTo).toHaveBeenCalled();
  });

  it("updates only the affected rider marker on a socket location event", async () => {
    renderMap();
    await waitFor(() => expect(screen.getByText(/Last seen:/)).toBeInTheDocument());

    await act(async () => {
      handlers["rider:location:update"]({
        riderId: "d1", latitude: 28.8, longitude: 77.3, heading: 100, speed: 20,
        status: "ONLINE", lastSeenAt: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      const moved = screen.getAllByTestId("marker").some((m) => m.getAttribute("data-pos") === "28.8,77.3");
      expect(moved).toBe(true);
    });
  });
});
