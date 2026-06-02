import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";
import User from "../models/User.js";
import Activity from "../models/Activity.js";

const router = express.Router();

// In-memory challenge store (valid for 5 minutes)
const challengeCache = new Map();

// Helper to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || "web3_drive_default_developer_secret_key_1298471",
    { expiresIn: "7d" }
  );
};

/**
 * @route POST /api/auth/register
 * @desc Register user with email and password
 */
router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Please provide an email and password" });
  }

  try {
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await User.create({
      email,
      password: hashedPassword
    });

    // Log Activity
    await Activity.create({
      userId: newUser._id || newUser.id,
      action: "USER_REGISTER",
      details: `User registered with email: ${email.toLowerCase()}`
    });

    // Return token
    const token = generateToken(newUser._id || newUser.id);
    return res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser._id || newUser.id,
        email: newUser.email,
        walletAddress: newUser.walletAddress
      }
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during registration" });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Authenticate user with email and password
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Please provide an email and password" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Log Activity
    await Activity.create({
      userId: user._id || user.id,
      action: "USER_LOGIN",
      details: `User logged in with email: ${email.toLowerCase()}`
    });

    const token = generateToken(user._id || user.id);
    return res.json({
      success: true,
      token,
      user: {
        id: user._id || user.id,
        email: user.email,
        walletAddress: user.walletAddress
      }
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

/**
 * @route POST /api/auth/web3-challenge
 * @desc Generate signature challenge for wallet login
 */
router.post("/web3-challenge", (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ success: false, message: "Wallet address is required" });
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const challengeMessage = `Welcome to Decentralized Cloud Storage!\n\nSign this cryptographic challenge to authenticate your wallet.\n\nNonce: ${nonce}\nWallet: ${normalizedAddress}\nTimestamp: ${Date.now()}`;

  // Store in cache
  challengeCache.set(normalizedAddress, {
    nonce,
    message: challengeMessage,
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 mins
  });

  return res.json({
    success: true,
    challenge: challengeMessage
  });
});

/**
 * @route POST /api/auth/web3-verify
 * @desc Verify wallet signature and authenticate user
 */
router.post("/web3-verify", async (req, res) => {
  const { walletAddress, signature } = req.body;

  if (!walletAddress || !signature) {
    return res.status(400).json({ success: false, message: "Wallet address and signature are required" });
  }

  const normalizedAddress = walletAddress.toLowerCase();

  try {
    // 1. Get challenge
    const cached = challengeCache.get(normalizedAddress);
    if (!cached) {
      return res.status(400).json({ success: false, message: "Challenge expired or not found. Please request a new one." });
    }

    if (Date.now() > cached.expiresAt) {
      challengeCache.delete(normalizedAddress);
      return res.status(400).json({ success: false, message: "Challenge expired. Please request a new one." });
    }

    // 2. Recover signer address
    const recoveredAddress = ethers.verifyMessage(cached.message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      return res.status(401).json({ success: false, message: "Signature verification failed" });
    }

    // Challenge verified, delete from cache
    challengeCache.delete(normalizedAddress);

    // 3. Find or create user
    let user = await User.findOne({ walletAddress: normalizedAddress });
    let isNewUser = false;

    if (!user) {
      user = await User.create({
        walletAddress: normalizedAddress
      });
      isNewUser = true;
    }

    // Log Activity
    await Activity.create({
      userId: user._id || user.id,
      walletAddress: normalizedAddress,
      action: isNewUser ? "WALLET_REGISTER" : "WALLET_LOGIN",
      details: `User authenticated wallet: ${normalizedAddress}`
    });

    // 4. Generate JWT
    const token = generateToken(user._id || user.id);

    return res.json({
      success: true,
      token,
      user: {
        id: user._id || user.id,
        email: user.email,
        walletAddress: user.walletAddress
      }
    });
  } catch (error) {
    console.error("Web3 Verify Error:", error.message);
    return res.status(500).json({ success: false, message: "Server error during signature verification" });
  }
});

export default router;
