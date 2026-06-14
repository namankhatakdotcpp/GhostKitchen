import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { getKpis, getTrends, getFleet, getRestaurants, getCustomers, getSummary } from "./exec.controller.js";

const router = express.Router();

router.use(authenticate);
router.use(authorize("ADMIN"));

router.get("/kpis",        getKpis);
router.get("/trends",      getTrends);
router.get("/fleet",       getFleet);
router.get("/restaurants", getRestaurants);
router.get("/customers",   getCustomers);
router.get("/summary",     getSummary);

export default router;
