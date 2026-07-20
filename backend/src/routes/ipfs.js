import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { protect } from "../middleware/auth.js";
import SharedKey from "../models/SharedKey.js";
import { ethers } from "ethers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Read Smart Contract details
const configPath = path.join(__dirname, "../config/Web3Drive.json");
let Web3DriveConfig = { address: "", abi: [] };
if (fs.existsSync(configPath)) {
  try {
    Web3DriveConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("⚠️ Failed to load Web3Drive config in Express:", e.message);
  }
}

// Connect to EVM Node provider (Dynamic auto-selection based on contract address)
let rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;
if (!rpcUrl) {
  const contractAddress = (Web3DriveConfig.address || "").toLowerCase();
  if (contractAddress === "0x5fbdb2315678afecb367f032d93f642f64180aa3" || contractAddress === "") {
    rpcUrl = "http://127.0.0.1:8545";
  } else {
    rpcUrl = "https://ethereum-sepolia-rpc.publicnode.com";
  }
}
console.log(`🔌 [AccessGate] Connecting to Ethereum RPC Node: ${rpcUrl}`);
const provider = new ethers.JsonRpcProvider(rpcUrl);
const contract = new ethers.Contract(
  Web3DriveConfig.address || "0x0000000000000000000000000000000000000000",
  Web3DriveConfig.abi || [],
  provider
);

// Set up Multer for memory storage
const upload = multer({
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max file size
  }
});

// Configure Mock IPFS directory
const mockIpfsDir = path.join(__dirname, "../../data/ipfs_mock");
if (!fs.existsSync(mockIpfsDir)) {
  fs.mkdirSync(mockIpfsDir, { recursive: true });
}

/**
 * @route POST /api/ipfs/upload
 * @desc Upload encrypted file to IPFS or mock fallback
 */
router.post("/upload", protect, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const { buffer, originalname, mimetype, size } = req.file;

  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;
  const pinataJwt = process.env.PINATA_JWT;
  const hasPinataCreds = pinataJwt || (apiKey && apiSecret);

  if (hasPinataCreds) {
    try {
      console.log(`📤 Proxying upload of '${originalname}' (${size} bytes) to Pinata IPFS...`);
      
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimetype });
      formData.append("file", blob, originalname);

      const pinataMetadata = JSON.stringify({
        name: originalname,
        keyvalues: {
          uploader: req.user.walletAddress || req.user.email,
          uploadedAt: new Date().toISOString()
        }
      });
      formData.append("pinataMetadata", pinataMetadata);

      const pinataOptions = JSON.stringify({
        cidVersion: 0
      });
      formData.append("pinataOptions", pinataOptions);

      const headers = {};
      if (pinataJwt) {
        headers["Authorization"] = `Bearer ${pinataJwt}`;
      } else {
        headers["pinata_api_key"] = apiKey;
        headers["pinata_secret_api_key"] = apiSecret;
      }

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        }
      );

      const cid = pinataResponse.data.IpfsHash;
      console.log(`✅ File pinned on IPFS successfully! CID: ${cid}`);

      return res.json({
        success: true,
        cid,
        storage: "pinata",
        message: "File successfully pinned to IPFS via Pinata"
      });
    } catch (error) {
      console.error("❌ Pinata API Upload Error:", error.response?.data || error.message);
      console.log("⚠️ Upload proxy to Pinata failed. Falling back to local IPFS simulation...");
    }
  }

  // FALLBACK: Local Mock IPFS Simulation
  try {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const mockCid = `QmMock` + hash.substring(0, 40);
    const mockFilePath = path.join(mockIpfsDir, mockCid);

    console.log(`📂 Mock IPFS Mode: Saving file to local storage... CID: ${mockCid}`);
    fs.writeFileSync(mockFilePath, buffer);

    return res.json({
      success: true,
      cid: mockCid,
      storage: "local-fallback",
      message: "Uploaded to local mock storage (Pinata credentials were empty or failed)"
    });
  } catch (error) {
    console.error("Local Storage Fallback Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to upload file to local mock storage" });
  }
});

/**
 * @route GET /api/ipfs/download/:cid
 * @desc Retrieve / download file by CID. Resolves from Pinata gateway OR local storage
 */
router.get("/download/:cid", protect, async (req, res) => {
  const { cid } = req.params;
  const user = req.user;

  if (!cid) {
    return res.status(400).json({ success: false, message: "IPFS CID is required" });
  }

  // 1. Enforce On-Chain Access Gate Check (Step 2 - Access Gate)
  if (user && user.walletAddress) {
    try {
      // Check if the contract exists at the target address
      const code = await provider.getCode(contract.target);
      const isContractActive = code && code !== "0x" && code !== "0x0" && code !== "0x00";

      if (isContractActive) {
        // Hash the string CID into bytes32 to check on-chain permissions
        const cidHash = ethers.solidityPackedKeccak256(["string"], [cid]);
        const userAddr = user.walletAddress.toLowerCase();
        console.log(`🔐 [AccessGate] Querying contract access for CID ${cid} (Hash: ${cidHash}), Wallet: ${userAddr}`);
        
        const hasAccess = await contract.hasAccess(cidHash, userAddr);
        let allowed = hasAccess;

        if (!allowed) {
          try {
            const fileOwner = await contract.fileOwners(cidHash);
            if (fileOwner && fileOwner.toLowerCase() === userAddr) {
              console.log(`ℹ️ [AccessGate] Fallback: Access authorized for file owner: ${userAddr}`);
              allowed = true;
            }
          } catch (ownerErr) {
            console.warn(`⚠️ [AccessGate] Fallback owner check failed: ${ownerErr.message}`);
          }
        }

        if (!allowed) {
          console.warn(`❌ [AccessGate] Unauthorized download attempt blocked for wallet: ${userAddr}`);
          return res.status(403).json({
            success: false,
            message: "Access Denied — This file is no longer accessible to you"
          });
        }
        console.log(`✅ [AccessGate] Access authorized successfully for wallet: ${userAddr}`);
      } else {
        console.warn("⚠️ [AccessGate] Web3Drive smart contract is not deployed on this network yet. Skipping check.");
      }
    } catch (contractErr) {
      console.error("❌ [AccessGate] Error querying contract for access control validation:", contractErr.message);
      return res.status(403).json({
        success: false,
        message: "Access Denied — Permissions checking failed"
      });
    }
  } else {
    console.warn("⚠️ [AccessGate] Missing wallet address in JWT authentication payload.");
    return res.status(403).json({
      success: false,
      message: "Access Denied — Wallet address missing in session"
    });
  }

  // 2. Fetch mock local file if it exists
  const mockFilePath = path.join(mockIpfsDir, cid);
  if (fs.existsSync(mockFilePath)) {
    console.log(`📥 Serving file '${cid}' from mock local storage...`);
    const fileBuffer = fs.readFileSync(mockFilePath);
    res.setHeader("Content-Type", "application/octet-stream");
    return res.send(fileBuffer);
  }

  // 3. Fetch from real IPFS gateway (via secure redirect or pipe stream)
  const gateways = [
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`
  ];

  console.log(`🌐 Fetching real IPFS file '${cid}' via public gateways...`);
  
  for (const url of gateways) {
    try {
      const response = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
      console.log(`✅ Successfully fetched '${cid}' from gateway: ${url}`);
      res.setHeader("Content-Type", "application/octet-stream");
      return res.send(Buffer.from(response.data));
    } catch (err) {
      console.warn(`⚠️ Failed to fetch CID from gateway: ${url} - ${err.message}`);
    }
  }

  return res.status(404).json({
    success: false,
    message: "IPFS resource could not be found or fetched from available gateways"
  });
});

/**
 * @route POST /api/ipfs/share-key
 * @desc Save encrypted file key for a shared recipient user
 */
router.post("/share-key", protect, async (req, res) => {
  const { fileId, recipientAddress, encryptedKey } = req.body;

  if (!fileId || !recipientAddress || !encryptedKey) {
    return res.status(400).json({ success: false, message: "Missing required key-sharing payload parameters" });
  }

  try {
    const sharedRecord = await SharedKey.create({
      fileId,
      recipientAddress,
      encryptedKey
    });

    console.log(`🔐 Cryptographic file key securely registered for shared recipient: ${recipientAddress} (File ID: ${fileId})`);
    return res.json({ success: true, message: "Cryptographic key registered successfully for recipient" });
  } catch (error) {
    console.error("Save shared key error:", error.message);
    return res.status(500).json({ success: false, message: "Server error saving shared key" });
  }
});

/**
 * @route GET /api/ipfs/shares
 * @desc Retrieve all shared records database entries for the Shared Access Management panel
 */
router.get("/shares", protect, async (req, res) => {
  try {
    const shares = await SharedKey.find();
    return res.json({
      success: true,
      shares: shares.map(s => ({
        fileId: s.fileId,
        recipientAddress: s.recipientAddress,
        timestamp: s.timestamp || s.createdAt
      }))
    });
  } catch (error) {
    console.error("Get all shares error:", error.message);
    return res.status(500).json({ success: false, message: "Server error retrieving shares ledger" });
  }
});

/**
 * @route GET /api/ipfs/shares/:fileId
 * @desc Get all recipient addresses for a file
 */
router.get("/shares/:fileId", protect, async (req, res) => {
  const { fileId } = req.params;

  try {
    const shares = await SharedKey.find({ fileId });
    return res.json({
      success: true,
      fileId,
      shares: shares.map(s => ({
        recipientAddress: s.recipientAddress,
        timestamp: s.timestamp || s.createdAt
      }))
    });
  } catch (error) {
    console.error("Get file shares error:", error.message);
    return res.status(500).json({ success: false, message: "Server error retrieving shares" });
  }
});

/**
 * @route GET /api/ipfs/share-key/:fileId
 * @desc Fetch the encrypted file key mapped to the authenticated user for a shared file
 */
router.get("/share-key/:fileId", protect, async (req, res) => {
  const { fileId } = req.params;
  const user = req.user;

  try {
    let sharedRecord = null;
    if (user.walletAddress) {
      sharedRecord = await SharedKey.findOne({
        fileId,
        recipientAddress: user.walletAddress
      });
    }

    if (!sharedRecord && user.email) {
      sharedRecord = await SharedKey.findOne({
        fileId,
        recipientAddress: user.email
      });
    }

    if (!sharedRecord) {
      return res.status(404).json({
        success: false,
        message: "No shared decryption key found for this user and file."
      });
    }

    return res.json({
      success: true,
      fileId,
      encryptedKey: sharedRecord.encryptedKey
    });
  } catch (error) {
    console.error("Get shared key error:", error.message);
    return res.status(500).json({ success: false, message: "Server error retrieving shared key" });
  }
});

/**
 * @route DELETE /api/ipfs/share-key/:fileId/:recipientAddress
 * @desc Revoke/delete a shared key record for a recipient from the database
 */
router.delete("/share-key/:fileId/:recipientAddress", protect, async (req, res) => {
  const { fileId, recipientAddress } = req.params;

  if (!fileId || !recipientAddress) {
    return res.status(400).json({ success: false, message: "Missing required route parameters" });
  }

  try {
    const deleted = await SharedKey.deleteOne({
      fileId: String(fileId),
      recipientAddress: { $regex: new RegExp(`^${recipientAddress}$`, "i") }
    });

    console.log(`🗑️ Cryptographic key deleted from database for: ${recipientAddress} (File ID: ${fileId})`);
    return res.json({ success: true, message: "Shared key record successfully deleted" });
  } catch (error) {
    console.error("Delete shared key error:", error.message);
    return res.status(500).json({ success: false, message: "Server error deleting shared key" });
  }
});

export default router;
