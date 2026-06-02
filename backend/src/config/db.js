import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isMongoConnected = false;

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  
  if (!mongoUri) {
    console.log("--------------------------------------------------");
    console.log("⚠️  MONGO_URI not detected in environment variable.");
    console.log("🚀 Running in Zero-Setup Mode: using Local JSON File Database!");
    console.log("📍 DB Files location: backend/data/");
    console.log("--------------------------------------------------");
    return false;
  }

  try {
    const conn = await mongoose.connect(mongoUri);
    isMongoConnected = true;
    console.log(`📡 MongoDB Connected Successfully: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    console.log("⚙️  Falling back to Local JSON File Database...");
    return false;
  }
};

export const getDbMode = () => isMongoConnected;
