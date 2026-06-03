import mongoose from "mongoose";
import { getDbMode } from "../config/db.js";
import { jsonDb } from "../utils/jsonDb.js";

// 1. Mongoose Schema
const SharedKeySchema = new mongoose.Schema(
  {
    fileId: {
      type: String,
      required: true
    },
    recipientAddress: {
      type: String,
      required: true,
      lowercase: true
    },
    encryptedKey: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// Ensure index
SharedKeySchema.index({ fileId: 1, recipientAddress: 1 }, { unique: true });

let MongoSharedKeyModel;
try {
  MongoSharedKeyModel = mongoose.model("SharedKey", SharedKeySchema);
} catch (e) {
  MongoSharedKeyModel = mongoose.models.SharedKey;
}

// 2. Adapter
class SharedKeyAdapter {
  async findOne(query = {}) {
    const normalized = { ...query };
    if (normalized.recipientAddress) {
      normalized.recipientAddress = normalized.recipientAddress.toLowerCase();
    }
    if (normalized.fileId) {
      normalized.fileId = String(normalized.fileId);
    }

    if (getDbMode()) {
      return await MongoSharedKeyModel.findOne(normalized);
    } else {
      return await jsonDb.sharedKeys.findOne(normalized);
    }
  }

  async create(keyData) {
    const data = {
      ...keyData,
      fileId: String(keyData.fileId),
      recipientAddress: keyData.recipientAddress.toLowerCase(),
      timestamp: new Date().toISOString()
    };

    if (getDbMode()) {
      return await MongoSharedKeyModel.create(data);
    } else {
      // Check if already exists in jsonDb, if so update it
      const existing = await jsonDb.sharedKeys.findOne({
        fileId: data.fileId,
        recipientAddress: data.recipientAddress
      });
      if (existing) {
        return await jsonDb.sharedKeys.findByIdAndUpdate(existing._id || existing.id, {
          encryptedKey: data.encryptedKey,
          timestamp: data.timestamp
        });
      }
      return await jsonDb.sharedKeys.create(data);
    }
  }
}

export const SharedKey = new SharedKeyAdapter();
export default SharedKey;
