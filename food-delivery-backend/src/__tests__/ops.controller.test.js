/**
 * Ops controller tests — verify each handler delegates to the service and the
 * response/`next` wiring is correct.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../modules/ops/ops.service.js", () => ({
  getFleetAlerts: vi.fn(),
  getSlaSummary: vi.fn(),
  getRiderPerformance: vi.fn(),
  getRestaurantPerformance: vi.fn(),
  listIncidents: vi.fn(),
  createIncident: vi.fn(),
  updateIncident: vi.fn(),
  resolveIncident: vi.fn(),
}));

const ctrl = await import("../modules/ops/ops.controller.js");
const svc = await import("../modules/ops/ops.service.js");

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => vi.clearAllMocks());

describe("ops.controller", () => {
  it("getAlerts returns alerts", async () => {
    svc.getFleetAlerts.mockResolvedValue([{ type: "RIDER_OFFLINE" }]);
    const res = mockRes();
    await ctrl.getAlerts({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ alerts: [{ type: "RIDER_OFFLINE" }] });
  });

  it("getSla passes the days query through", async () => {
    svc.getSlaSummary.mockResolvedValue({ onTimeRate: 90 });
    const res = mockRes();
    await ctrl.getSla({ query: { days: "14" } }, res, vi.fn());
    expect(svc.getSlaSummary).toHaveBeenCalledWith({ days: "14" });
    expect(res.json).toHaveBeenCalledWith({ onTimeRate: 90 });
  });

  it("getRiderPerformance delegates", async () => {
    svc.getRiderPerformance.mockResolvedValue({ riders: [] });
    const res = mockRes();
    await ctrl.getRiderPerformance({ query: {} }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ riders: [] });
  });

  it("getRestaurantPerformance delegates", async () => {
    svc.getRestaurantPerformance.mockResolvedValue({ restaurants: [] });
    const res = mockRes();
    await ctrl.getRestaurantPerformance({ query: {} }, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ restaurants: [] });
  });

  it("listIncidents delegates with query filters", async () => {
    svc.listIncidents.mockResolvedValue({ incidents: [], total: 0 });
    const res = mockRes();
    await ctrl.listIncidents({ query: { status: "OPEN", page: "1", limit: "10" } }, res, vi.fn());
    expect(svc.listIncidents).toHaveBeenCalledWith({ status: "OPEN", page: "1", limit: "10" });
  });

  it("createIncident uses the authenticated user id and returns 201", async () => {
    svc.createIncident.mockResolvedValue({ id: "inc-1" });
    const res = mockRes();
    await ctrl.createIncident({ body: { title: "X", severity: "HIGH" }, user: { userId: "admin-1" } }, res, vi.fn());
    expect(svc.createIncident).toHaveBeenCalledWith(expect.objectContaining({ title: "X", severity: "HIGH", createdById: "admin-1" }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ incident: { id: "inc-1" } });
  });

  it("updateIncident delegates severity/status", async () => {
    svc.updateIncident.mockResolvedValue({ id: "inc-1", severity: "CRITICAL" });
    const res = mockRes();
    await ctrl.updateIncident({ params: { id: "inc-1" }, body: { severity: "CRITICAL" } }, res, vi.fn());
    expect(svc.updateIncident).toHaveBeenCalledWith("inc-1", { severity: "CRITICAL", status: undefined });
  });

  it("resolveIncident uses the authenticated user id", async () => {
    svc.resolveIncident.mockResolvedValue({ id: "inc-1", status: "RESOLVED" });
    const res = mockRes();
    await ctrl.resolveIncident({ params: { id: "inc-1" }, user: { userId: "admin-2" } }, res, vi.fn());
    expect(svc.resolveIncident).toHaveBeenCalledWith("inc-1", "admin-2");
  });

  it("forwards service errors to next", async () => {
    const err = new Error("boom");
    svc.getFleetAlerts.mockRejectedValue(err);
    const next = vi.fn();
    await ctrl.getAlerts({}, mockRes(), next);
    expect(next).toHaveBeenCalledWith(err);
  });
});
