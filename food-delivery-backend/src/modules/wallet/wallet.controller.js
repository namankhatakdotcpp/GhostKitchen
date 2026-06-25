import { getWalletWithHistory, previewRedemption } from "./wallet.service.js";

// GET /api/wallet — balance + recent transaction history
export const getWallet = async (req, res) => {
  try {
    const result = await getWalletWithHistory(req.user.userId);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch wallet" });
  }
};

// POST /api/wallet/redeem-preview — how many points/how much discount would
// actually apply for a given order total, before placing the order. The
// checkout UI uses this to show the real number rather than guessing the cap.
export const redeemPreview = async (req, res) => {
  try {
    const { points, orderTotalPaise } = req.body;
    if (typeof points !== "number" || points < 0) {
      return res.status(400).json({ message: "points must be a non-negative number" });
    }
    if (typeof orderTotalPaise !== "number" || orderTotalPaise < 0) {
      return res.status(400).json({ message: "orderTotalPaise must be a non-negative number" });
    }
    const result = await previewRedemption({ userId: req.user.userId, requestedPoints: points, orderTotalPaise });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ message: "Unable to preview redemption" });
  }
};
