import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const protect = async (req, res, next) => {
  let token;

  // Check for token in headers
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "web3_drive_default_developer_secret_key_1298471");

      // Get user from database (either email or wallet-based)
      const user = await User.findById(decoded.id);

      if (!user) {
        return res.status(401).json({ success: false, message: "Not authorized: User not found" });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error("JWT Verification Error:", error.message);
      return res.status(401).json({ success: false, message: "Not authorized: Token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized: No token provided" });
  }
};
