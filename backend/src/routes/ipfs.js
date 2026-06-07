import express from "express";
import multer from "multer";
import axios from "axios";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { protect } from "../middleware/auth.js";
import SharedKey from "../models/SharedKey.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Set up Multer for memory storage (file buffer in memory)
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
 * @desc Upload encrypted file to IPFS (with Pinata proxying) or mock fallback
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
      
      // Native Node FormData (available in modern Node)
      const formData = new FormData();
      const blob = new Blob([buffer], { type: mimetype });
      formData.append("file", blob, originalname);

      // Metadata setting for Pinata
      const pinataMetadata = JSON.stringify({
        name: originalname,
        keyvalues: {
          uploader: req.user.walletAddress || req.user.email,
          uploadedAt: new Date().toISOString()
        }
      });
      formData.append("pinataMetadata", pinataMetadata);

      // Pinata Options
      const pinataOptions = JSON.stringify({
        cidVersion: 0
      });
      formData.append("pinataOptions", pinataOptions);

      // Construct headers
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
    // Generate a cryptographic deterministic hash of file buffer to serve as mock CID
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const mockCid = `QmMock` + hash.substring(0, 40);
    const mockFilePath = path.join(mockIpfsDir, mockCid);

    console.log(`📂 Mock IPFS Mode: Saving file to local storage... CID: ${mockCid}`);
    
    // Save the encrypted buffer to disk
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

  if (!cid) {
    return res.status(400).json({ success: false, message: "IPFS CID is required" });
  }

  // 1. Check if mock local file exists first
  const mockFilePath = path.join(mockIpfsDir, cid);
  if (fs.existsSync(mockFilePath)) {
    console.log(`📥 Serving file '${cid}' from mock local storage...`);
    const fileBuffer = fs.readFileSync(mockFilePath);
    res.setHeader("Content-Type", "application/octet-stream");
    return res.send(fileBuffer);
  }

  // 2. Fetch from real IPFS gateway (via secure redirect or pipe stream)
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
 * @route GET /api/ipfs/share-key/:fileId
 * @desc Fetch the encrypted file key mapped to the authenticated user for a shared file
 */
router.get("/share-key/:fileId", protect, async (req, res) => {
  const { fileId } = req.params;
  const user = req.user;

  try {
    // 1. Try to find by walletAddress
    let sharedRecord = null;
    if (user.walletAddress) {
      sharedRecord = await SharedKey.findOne({
        fileId,
        recipientAddress: user.walletAddress
      });
    }

    // 2. Fallback to search by email if walletAddress record is not found
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

export default router;
