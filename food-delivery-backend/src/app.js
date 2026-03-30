import cors from "cors";
import express from "express";
import authRoutes from "./modules/auth/auth.routes.js";
import orderRoutes from "./modules/orders/orders.routes.js";
import restaurantRoutes from "./modules/restaurant/restaurant.routes.js";
import paymentRoutes from "./modules/payment/payment.routes.js";

const app = express();

// middleware to read JSON body
app.use(cors());
app.use(express.json());

// health check
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

// auth routes
app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

export default app;
