import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";

// Import Routes
import authRoutes from "./routes/auth.js";
import ipfsRoutes from "./routes/ipfs.js";
import activityRoutes from "./routes/activity.js";
import contactsRoutes from "./routes/contacts.js";

// Load Environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "https://sevenseas-drive.vercel.app"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      // Allow localhost, 127.0.0.1, or any local IP addresses (192.168.x.x, 10.x.x.x, 172.x.x.x)
      const isLocal = 
        origin.startsWith("http://localhost:") || 
        origin.startsWith("http://127.0.0.1:") || 
        origin.startsWith("http://192.168.") || 
        origin.startsWith("http://10.") || 
        origin.startsWith("http://172.16.") || 
        origin.startsWith("http://172.17.") || 
        origin.startsWith("http://172.18.") || 
        origin.startsWith("http://172.19.") || 
        origin.startsWith("http://172.20.") || 
        origin.startsWith("http://172.21.") || 
        origin.startsWith("http://172.22.") || 
        origin.startsWith("http://172.23.") || 
        origin.startsWith("http://172.24.") || 
        origin.startsWith("http://172.25.") || 
        origin.startsWith("http://172.26.") || 
        origin.startsWith("http://172.27.") || 
        origin.startsWith("http://172.28.") || 
        origin.startsWith("http://172.29.") || 
        origin.startsWith("http://172.30.") || 
        origin.startsWith("http://172.31.") || 
        origin.endsWith(".local");
      
      if (isLocal || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Fallback/development allow-all
      return callback(null, true);
    },
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
app.use("/api/contacts", contactsRoutes);

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
