import * as opsService from "./ops.service.js";

export const getAlerts = async (req, res, next) => {
  try {
    res.json({ alerts: await opsService.getFleetAlerts() });
  } catch (err) { next(err); }
};

export const getSla = async (req, res, next) => {
  try {
    res.json(await opsService.getSlaSummary({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const getRiderPerformance = async (req, res, next) => {
  try {
    res.json(await opsService.getRiderPerformance({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const getRestaurantPerformance = async (req, res, next) => {
  try {
    res.json(await opsService.getRestaurantPerformance({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const listIncidents = async (req, res, next) => {
  try {
    res.json(await opsService.listIncidents({ status: req.query.status, page: req.query.page, limit: req.query.limit }));
  } catch (err) { next(err); }
};

export const createIncident = async (req, res, next) => {
  try {
    const { title, description, severity, category, entityType, entityId } = req.body;
    const incident = await opsService.createIncident({
      title, description, severity, category, entityType, entityId,
      createdById: req.user.userId,
    });
    res.status(201).json({ incident });
  } catch (err) { next(err); }
};

export const updateIncident = async (req, res, next) => {
  try {
    const incident = await opsService.updateIncident(req.params.id, { severity: req.body.severity, status: req.body.status });
    res.json({ incident });
  } catch (err) { next(err); }
};

export const resolveIncident = async (req, res, next) => {
  try {
    const incident = await opsService.resolveIncident(req.params.id, req.user.userId);
    res.json({ incident });
  } catch (err) { next(err); }
};
