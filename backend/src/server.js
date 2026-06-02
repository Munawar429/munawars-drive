import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";

// Import Routes
import authRoutes from "./routes/auth.js";
import ipfsRoutes from "./routes/ipfs.js";
import activityRoutes from "./routes/activity.js";

// Load Environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Body Parser Middleware
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Route bindings
app.use("/api/auth", authRoutes);
app.use("/api/ipfs", ipfsRoutes);
app.use("/api/activity", activityRoutes);

// Base Route
app.get("/", (req, res) => {
  res.json({
    name: "Web3 Decentralized Cloud Storage API",
    status: "online",
    version: "1.0.0",
    localTime: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err.stack);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

// Bootstrap Server & DB
const startServer = async () => {
  try {
    // Attempt DB connection
    await connectDB();

    app.listen(PORT, () => {
      console.log("==================================================");
      console.log(`🌐 Server active on: http://localhost:${PORT}`);
      console.log(`🔒 API base endpoint: http://localhost:${PORT}/api`);
      console.log("==================================================");
    });
  } catch (error) {
    console.error(`Fatal Server Bootstrap Error: ${error.message}`);
    process.exit(1);
  }
};

startServer();
