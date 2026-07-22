import mongoose from "mongoose";
import { getDbMode } from "../config/db.js";
import { jsonDb } from "../utils/jsonDb.js";

// 1. Mongoose Schema Definition (for MongoDB mode)
const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true
    },
    password: {
      type: String
    },
    walletAddress: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true
    },
    encryptionPublicKey: {
      type: String // Used optionally for advanced RSA key sharing
    },
    encryptedPrivateKey: {
      type: String // Wrapped RSA private key (encrypted with user's masterSeed)
    },
    addressBook: [
      {
        id: { type: String },
        name: { type: String, required: true },
        address: { type: String, required: true, lowercase: true },
        createdAt: { type: String }
      }
    ]
  },
  { timestamps: true }
);

let MongoUserModel;
try {
  MongoUserModel = mongoose.model("User", UserSchema);
} catch (e) {
  MongoUserModel = mongoose.models.User;
}

// 2. Dual DB Unified Adapter
class UserAdapter {
  async findOne(query) {
    // Normalise query parameters (e.g. lowercase walletAddress)
    const normalizedQuery = { ...query };
    if (normalizedQuery.walletAddress) {
      normalizedQuery.walletAddress = normalizedQuery.walletAddress.toLowerCase();
    }
    if (normalizedQuery.email) {
      normalizedQuery.email = normalizedQuery.email.toLowerCase();
    }

    if (getDbMode()) {
      return await MongoUserModel.findOne(normalizedQuery);
    } else {
      return await jsonDb.users.findOne(normalizedQuery);
    }
  }

  async findById(id) {
    if (getDbMode()) {
      return await MongoUserModel.findById(id);
    } else {
      return await jsonDb.users.findById(id);
    }
  }

  async create(userData) {
    const data = { ...userData };
    if (data.walletAddress) {
      data.walletAddress = data.walletAddress.toLowerCase();
    }
    if (data.email) {
      data.email = data.email.toLowerCase();
    }

    if (getDbMode()) {
      return await MongoUserModel.create(data);
    } else {
      return await jsonDb.users.create(data);
    }
  }

  async findByIdAndUpdate(id, updateData) {
    if (getDbMode()) {
      return await MongoUserModel.findByIdAndUpdate(id, updateData, { new: true });
    } else {
      return await jsonDb.users.findByIdAndUpdate(id, updateData);
    }
  }
}

export const User = new UserAdapter();
export default User;
