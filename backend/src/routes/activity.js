import express from "express";
import { protect } from "../middleware/auth.js";
import Activity from "../models/Activity.js";

const router = express.Router();

/**
 * @route GET /api/activity
 * @desc Get all activity logs for the authenticated user/wallet
 */
router.get("/", protect, async (req, res) => {
  try {
    const query = {};
    
    if (req.user.walletAddress) {
      query.walletAddress = req.user.walletAddress.toLowerCase();
    } else {
      query.userId = req.user._id || req.user.id;
    }

    const logs = await Activity.find(query);
    return res.json({ success: true, logs });
  } catch (error) {
    console.error("Fetch Activity Logs Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error fetching activity logs" });
  }
});

/**
 * @route POST /api/activity
 * @desc Create a new activity log (called by frontend to log blockchain txs, sharing events, etc.)
 */
router.post("/", protect, async (req, res) => {
  const { action, details, fileName, fileSize, txHash } = req.body;

  if (!action) {
    return res.status(400).json({ success: false, message: "Action is required" });
  }

  try {
    const newLog = await Activity.create({
      userId: req.user._id || req.user.id,
      walletAddress: req.user.walletAddress,
      action,
      details,
      fileName,
      fileSize,
      txHash
    });

    return res.status(201).json({ success: true, log: newLog });
  } catch (error) {
    console.error("Create Activity Log Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error creating activity log" });
  }
});

export default router;
