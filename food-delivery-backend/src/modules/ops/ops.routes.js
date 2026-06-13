/**
 * Operations Intelligence routes — admin only.
 * Live fleet alerts, SLA monitoring, rider/restaurant performance, and the
 * Incident Center.
 */
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getAlerts,
  getSla,
  getRiderPerformance,
  getRestaurantPerformance,
  listIncidents,
  createIncident,
  updateIncident,
  acknowledgeIncident,
  resolveIncident,
  getIncidentEvents,
} from "./ops.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize("ADMIN"));

router.get("/alerts", getAlerts);
router.get("/sla", getSla);
router.get("/performance/riders", getRiderPerformance);
router.get("/performance/restaurants", getRestaurantPerformance);

router.get("/incidents", listIncidents);
router.post("/incidents", createIncident);
router.get("/incidents/:id/events", getIncidentEvents);
router.patch("/incidents/:id", updateIncident);
router.post("/incidents/:id/acknowledge", acknowledgeIncident);
router.post("/incidents/:id/resolve", resolveIncident);

export default router;
