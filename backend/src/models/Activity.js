import mongoose from "mongoose";
import { getDbMode } from "../config/db.js";
import { jsonDb } from "../utils/jsonDb.js";

// 1. Mongoose Schema
const ActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: String
    },
    walletAddress: {
      type: String,
      lowercase: true
    },
    action: {
      type: String,
      required: true
    },
    details: {
      type: String
    },
    fileName: String,
    fileSize: Number,
    txHash: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

let MongoActivityModel;
try {
  MongoActivityModel = mongoose.model("Activity", ActivitySchema);
} catch (e) {
  MongoActivityModel = mongoose.models.Activity;
}

// 2. Adapter
class ActivityAdapter {
  async find(query = {}) {
    const normalizedQuery = { ...query };
    if (normalizedQuery.walletAddress) {
      normalizedQuery.walletAddress = normalizedQuery.walletAddress.toLowerCase();
    }

    if (getDbMode()) {
      return await MongoActivityModel.find(normalizedQuery).sort({ timestamp: -1 });
    } else {
      const records = await jsonDb.activities.find(normalizedQuery);
      // Sort desc by timestamp
      return records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
  }

  async create(activityData) {
    const data = {
      ...activityData,
      timestamp: activityData.timestamp || new Date().toISOString()
    };
    if (data.walletAddress) {
      data.walletAddress = data.walletAddress.toLowerCase();
    }

    if (getDbMode()) {
      return await MongoActivityModel.create(data);
    } else {
      return await jsonDb.activities.create(data);
    }
  }
}

export const Activity = new ActivityAdapter();
export default Activity;
