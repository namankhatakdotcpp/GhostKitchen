import * as execService from "./exec.service.js";

export const getKpis = async (req, res, next) => {
  try {
    res.json(await execService.getExecutiveKpis());
  } catch (err) { next(err); }
};

export const getTrends = async (req, res, next) => {
  try {
    res.json(await execService.getTrends({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const getFleet = async (req, res, next) => {
  try {
    res.json(await execService.getFleetUtilization());
  } catch (err) { next(err); }
};

export const getRestaurants = async (req, res, next) => {
  try {
    res.json(await execService.getRestaurantIntelligence({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const getCustomers = async (req, res, next) => {
  try {
    res.json(await execService.getCustomerIntelligence({ days: req.query.days }));
  } catch (err) { next(err); }
};

export const getSummary = async (req, res, next) => {
  try {
    res.json(await execService.getExecutiveSummary({ period: req.query.period }));
  } catch (err) { next(err); }
};
