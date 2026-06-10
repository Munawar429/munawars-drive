"use client";

import React, { useState, useRef } from "react";
import { useWeb3 } from "../hooks/useWeb3.js";
import { useAuth } from "../hooks/useAuth.js";
import { encryptFileClientSide, encryptFileClientSideWithRSA } from "../utils/crypto.js";
import { formatBytes } from "../utils/helpers.js";
import axios from "axios";
import { API_URL } from "../utils/config.js";
import { 
  Upload, 
  Lock, 
  Globe, 
  ShieldAlert, 
  CheckCircle2, 
  Coins, 
  Clock,
  Loader2,
  Image as ImageIcon,
  FileText,
  Archive,
  File,
  X,
  Flame,
  Trash2,
  Shield,
  Check
} from "lucide-react";

// Helper to resolve preview icons and colors
const getPreviewIconInfo = (filename) => {
  const ext = filename ? filename.split(".").pop().toLowerCase() : "";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
    return {
      icon: ImageIcon,
      bg: "bg-[#042f2e]",
      color: "text-[#2dd4bf]",
    };
  }
  if (ext === "pdf") {
    return {
      icon: FileText,
      bg: "bg-[#3b0f0f]",
      color: "text-[#f87171]",
    };
  }
  if (["zip", "rar"].includes(ext)) {
    return {
      icon: Archive,
      bg: "bg-[#1e1b4b]",
      color: "text-[#a78bfa]",
    };
  }
  return {
    icon: File,
    bg: "bg-[#0c2a44]",
    color: "text-[#38bdf8]",
  };
};

export default function FileUpload({ onUploadSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [isPublic, setIsPublic] = useState(false);
  const [encryptFile, setEncryptFile] = useState(true);
  
  // Upload phases: 'idle' | 'encrypting' | 'uploading_ipfs' | 'blockchain_tx' | 'success' | 'error'
  const [uploadPhase, setUploadPhase] = useState("idle");
  const [estimatedGas, setEstimatedGas] = useState("0.00");
  const [errorMessage, setErrorMessage] = useState("");
  const [txHash, setTxHash] = useState("");

  const fileInputRef = useRef(null);

  const { uploadFileOnChain, estimateGasFees, isConnected, connectWallet } = useWeb3();
  const { masterSeed, logActivity, user } = useAuth();

  // Handle Drag Over
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Handle Drop
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      await handleFileSelection(selectedFile);
    }
  };

  // Handle Input Selection
  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      await handleFileSelection(selectedFile);
    }
  };

  const handleFileSelection = async (selectedFile) => {
    setFile(selectedFile);
    setUploadPhase("idle");
    setErrorMessage("");
    setTxHash("");
    
    // Estimate Gas Fee if contract active
    try {
      const dummyIpfs = "QmdummyHashLength46ForEstimatedGasOnChainTx";
      const dummyEncKey = "0x" + "a".repeat(88); // mock length
      const dummyHash = "sha256".repeat(10); // mock length
      
      const gasEst = await estimateGasFees(
        "uploadFile", 
        dummyIpfs, 
        selectedFile.name, 
        selectedFile.type || "application/octet-stream", 
        selectedFile.size, 
        dummyEncKey, 
        dummyHash, 
        isPublic
      );
      setEstimatedGas(gasEst);
    } catch (e) {
      console.warn("Could not estimate gas fee:", e);
    }
  };

  const triggerInputClick = () => {
    fileInputRef.current.click();
  };

  // Main Upload Flow
  const startUpload = async () => {
    if (!file) return;

    if (!isConnected) {
      // Prompt wallet connection
      await connectWallet();
      return;
    }

    setErrorMessage("");
    
    try {
      // --------------------------------------------------
      // Phase 1: Client-Side Encryption
      // --------------------------------------------------
      setUploadPhase("encrypting");
      
      const fileReader = new FileReader();
      const fileDataPromise = new Promise((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = reject;
      });
      fileReader.readAsArrayBuffer(file);
      
      const fileArrayBuffer = await fileDataPromise;
      
      let uploadBlob = file;
      let encryptedKey = "";
      let fileIntegrityHash = "";

      if (encryptFile) {
        let encryptionResult;
        if (user && user.encryptionPublicKey) {
          console.log("🔒 Encrypting file client-side using Owner's RSA Public Key...");
          encryptionResult = await encryptFileClientSideWithRSA(fileArrayBuffer, user.encryptionPublicKey);
        } else if (masterSeed) {
          console.log("🔒 Encrypting file client-side using Owner's Master Seed...");
          encryptionResult = await encryptFileClientSide(fileArrayBuffer, masterSeed);
        } else {
          throw new Error("Encryption keys not initialized. Please sign in again.");
        }
        
        uploadBlob = encryptionResult.encryptedBlob;
        encryptedKey = encryptionResult.encryptedKeyHex;
        fileIntegrityHash = encryptionResult.fileHash;
      } else {
        // Compute raw hash for unencrypted integrity validation
        const hashBuffer = await window.crypto.subtle.digest("SHA-256", fileArrayBuffer);
        fileIntegrityHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
      }

      // --------------------------------------------------
      // Phase 2: Upload Encrypted Blob to IPFS (via Backend API proxy)
      // --------------------------------------------------
      setUploadPhase("uploading_ipfs");
      console.log("🌐 Uploading to IPFS gateway proxy...");
      
      const formData = new FormData();
      formData.append("file", uploadBlob, file.name);

      const ipfsResponse = await axios.post(`${API_URL}/ipfs/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      const cid = ipfsResponse.data.cid;
      console.log(`✅ IPFS Upload Successful. CID: ${cid}`);

      // --------------------------------------------------
      // Phase 3: Record metadata to Blockchain via Smart Contract
      // --------------------------------------------------
      setUploadPhase("blockchain_tx");
      console.log("⛓️ Broadcasting transaction to blockchain...");

      const receipt = await uploadFileOnChain(
        cid,
        file.name,
        file.type || "application/octet-stream",
        file.size,
        encryptedKey || "unencrypted",
        fileIntegrityHash,
        isPublic
      );

      console.log("🎉 File stored on-chain! Transaction confirmed:", receipt.hash);
      setTxHash(receipt.hash);
      setUploadPhase("success");

      // Log activity in backend audit ledger
      await logActivity(
        "FILE_UPLOAD",
        `Uploaded encrypted file ${file.name} to IPFS (${cid}) & recorded on-chain`,
        file.name,
        file.size,
        receipt.hash
      );

      // Trigger callback
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Reset file selection after a brief delay
      setTimeout(() => {
        setFile(null);
        setUploadPhase("idle");
      }, 5000);

    } catch (err) {
      console.error("Upload failure:", err);
      setErrorMessage(err.message || "An unexpected error occurred during upload.");
      setUploadPhase("error");
      
      await logActivity(
        "UPLOAD_FAILED",
        `Failed to upload file ${file?.name}: ${err.message || 'Unknown error'}`
      );
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8 bg-[#050d1a] border-[0.5px] border-[#1a2a40] rounded-[14px]">
      {/* Drag & Drop Box */}
      {uploadPhase === "idle" && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={file ? undefined : triggerInputClick}
          className={`border-[1.5px] border-dashed rounded-[14px] bg-[#080f1e] p-8 flex flex-col items-center justify-center cursor-pointer transition-colors duration-200 ${
            dragActive
              ? "border-[#38bdf8]"
              : "border-[#1e3a5f] hover:border-[#38bdf8]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Zero-knowledge encrypted badge */}
          <div className="flex items-center gap-2 bg-[#0c2a44] border-[0.5px] border-[#1e4976]/50 rounded-[20px] px-[12px] py-[4px] text-[11px] text-[#38bdf8] mb-5 select-none font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee] shrink-0" />
            <span>Zero-knowledge encrypted before IPFS upload</span>
          </div>

          {file ? (
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="w-full max-w-lg bg-[#0a1929] border-[0.5px] border-[#1e3a5f] rounded-[10px] p-[14px] px-[16px] flex items-center gap-[14px] cursor-default"
            >
              {/* Left side: File type icon box */}
              {(() => {
                const { icon: FileIcon, bg: iconBg, color: iconColor } = getPreviewIconInfo(file.name);
                return (
                  <div className={`w-[44px] h-[44px] rounded-[10px] ${iconBg} ${iconColor} flex items-center justify-center shrink-0`}>
                    <FileIcon className="h-5 w-5" />
                  </div>
                );
              })()}

              {/* Middle: File info & encryption progress bar */}
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <div className="text-[14px] font-medium text-[#cee9ff] truncate" title={file.name}>
                    {file.name}
                  </div>
                  <div className="flex items-center gap-[10px]">
                    <span className="text-[12px] text-[#4a7fa5] font-mono">
                      {formatBytes(file.size)}
                    </span>
                    <span className="text-[10px] px-[8px] py-[2px] bg-[#042f2e] text-[#2dd4bf] border-[0.5px] border-[#0f6e56] rounded-[20px] font-medium">
                      AES-256 Ready
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 mt-0.5">
                  <div className="flex justify-between text-[11px] text-[#4a7fa5]">
                    <span>Encryption preparing...</span>
                    <span>65%</span>
                  </div>
                  <div className="h-[4px] bg-[#0a1929] rounded-[10px] w-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[#0ea5e9] to-[#22d3ee] rounded-[10px]" 
                      style={{ width: "65%" }}
                    />
                  </div>
                </div>
              </div>

              {/* Right side: Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                }}
                className="w-[28px] h-[28px] rounded-full bg-[#1a1025] border-[0.5px] border-[#3b1f4a] text-[#a78bfa] flex items-center justify-center shrink-0 transition-all duration-200 hover:bg-[#251535]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-center flex flex-col items-center">
              <div className="h-[60px] w-[60px] rounded-full bg-[#0c2a44] border-[0.5px] border-[#1e3a5f] flex items-center justify-center text-[#38bdf8] mb-4 hover:scale-105 transition-transform duration-300">
                <Upload className="h-[26px] w-[26px]" />
              </div>
              <h4 className="text-[17px] font-medium text-[#cee9ff] mb-1">
                Upload Encrypted Documents
              </h4>
              <p className="text-[13px] text-[#4a7fa5] mb-5">
                Your file is encrypted locally — never raw on-chain
              </p>
              <button
                type="button"
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-[8px] px-[22px] py-[9px] text-[13px] font-medium transition-colors duration-200 flex items-center gap-2 mb-5 cursor-pointer border-none shadow-md"
              >
                <Upload className="h-3.5 w-3.5" />
                Select File
              </button>
              {/* Chips row */}
              <div className="flex flex-row flex-wrap justify-center gap-2">
                {["PDF", "Images", "ZIP", "Code", "Up to 100MB"].map((chip) => (
                  <span key={chip} className="bg-[#0a1929] border-[0.5px] border-[#1a2a40] rounded-[20px] px-[10px] py-[3px] text-[11px] text-[#4a7fa5] font-medium">
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progressive Phase Loader */}
      {uploadPhase !== "idle" && uploadPhase !== "success" && uploadPhase !== "error" && (
        <div className="border-[0.5px] border-[#1a2a40] rounded-2xl p-8 bg-[#080f1d] flex flex-col items-center">
          <Loader2 className="h-10 w-10 text-cyan-400 animate-spin mb-4" />
          
          <div className="progress-container w-full">
            <div className="status-text text-center text-xs text-[#cee9ff] font-medium">
              {uploadPhase === "encrypting" && "🔒 Locking Vault (AES-GCM Shielding...)"}
              {uploadPhase === "uploading_ipfs" && "🌐 Dispatching to IPFS (Decentralized Pinning...)"}
              {uploadPhase === "blockchain_tx" && "⛓️ Syncing Ledger (Blockchain Registration...)"}
            </div>
            
            <div className="progress-bar-background mt-2 bg-[#0a1929] h-[4px] rounded-[10px] overflow-hidden">
              <div 
                className="progress-bar-fill h-full bg-gradient-to-r from-[#0ea5e9] to-[#22d3ee] transition-all duration-500" 
                style={{
                  width: 
                    uploadPhase === "encrypting" ? "33%" : 
                    uploadPhase === "uploading_ipfs" ? "66%" : "95%"
                }}
              />
            </div>
          </div>

          <p className="text-xs text-[#4a7fa5] text-center mt-4 max-w-sm leading-normal">
            {uploadPhase === "encrypting" && "Generating random 256-bit AES key to cryptographically seal the file in memory."}
            {uploadPhase === "uploading_ipfs" && "Transferring the securely encrypted binary payload to Pinata IPFS nodes."}
            {uploadPhase === "blockchain_tx" && "Broadcasting file CID, encrypted keys, and SHA-256 integrity signatures on-chain via MetaMask."}
          </p>
        </div>
      )}

      {/* Success View */}
      {uploadPhase === "success" && (
        <div className="border-[0.5px] border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-8 flex flex-col items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-3" />
          <h4 className="text-base font-bold text-slate-200">Decentralized Storage Sealed!</h4>
          <p className="text-xs text-slate-400 mt-2 max-w-sm">
            The encrypted file is securely pinned to IPFS, and its cryptographic fingerprint is registered on the blockchain.
          </p>
          {txHash && (
            <div className="mt-4 p-2 bg-slate-950 border-[0.5px] border-slate-800 rounded-lg text-[10px] font-mono text-cyan-400 select-all cursor-pointer">
              Tx: {txHash}
            </div>
          )}
          <button
            onClick={() => setUploadPhase("idle")}
            className="mt-5 bg-[#0a1929] border-[0.5px] border-[#1a2a40] text-[#7ab3d4] hover:bg-[#0d1f33] rounded-[8px] px-5 py-2 text-xs transition-colors duration-200"
          >
            Upload Another File
          </button>
        </div>
      )}

      {/* Error View */}
      {uploadPhase === "error" && (
        <div className="border-[0.5px] border-rose-500/20 bg-rose-500/5 rounded-2xl p-8 flex flex-col items-center text-center">
          <ShieldAlert className="h-12 w-12 text-rose-400 mb-3" />
          <h4 className="text-base font-bold text-slate-200">Registration Failed</h4>
          <p className="text-xs text-rose-450 mt-2 max-w-sm">
            {errorMessage}
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setUploadPhase("idle")}
              className="bg-[#0a1929] border-[0.5px] border-[#1a2a40] text-[#7ab3d4] hover:bg-[#0d1f33] rounded-[8px] px-5 py-2 text-xs transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={startUpload}
              className="bg-[#0ea5e9] text-white hover:bg-[#0284c7] rounded-[8px] px-5 py-2 text-xs font-semibold transition-colors duration-200"
            >
              Retry Upload
            </button>
          </div>
        </div>
      )}

      {/* Settings / Controls */}
      {uploadPhase === "idle" && file && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Visibility Option */}
            <div className="p-[14px] bg-[#080f1d] border-[0.5px] border-[#1a2a40] rounded-[10px]">
              <label className="text-[10px] font-medium text-[#4a7fa5] tracking-[0.08em] uppercase mb-[10px] block">
                LEDGER VISIBILITY
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 flex items-center justify-center gap-[7px] py-[9px] px-[12px] rounded-[8px] text-[13px] font-medium transition-all duration-200 border ${
                    !isPublic
                      ? "bg-[#0c2a44] border-[0.5px] border-[#38bdf8] text-[#38bdf8]"
                      : "bg-[#0a1929] border-[0.5px] border-[#1a2a40] text-[#4a7fa5] hover:text-[#cee9ff]"
                  }`}
                >
                  <Lock className="h-4 w-4 shrink-0" />
                  <span>Private Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 flex items-center justify-center gap-[7px] py-[9px] px-[12px] rounded-[8px] text-[13px] font-medium transition-all duration-200 border ${
                    isPublic
                      ? "bg-[#0c2a44] border-[0.5px] border-[#38bdf8] text-[#38bdf8]"
                      : "bg-[#0a1929] border-[0.5px] border-[#1a2a40] text-[#4a7fa5] hover:text-[#cee9ff]"
                  }`}
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  <span>Public Shared</span>
                </button>
              </div>
            </div>

            {/* Cryptographic Protection Option */}
            <div className="p-[14px] bg-[#080f1d] border-[0.5px] border-[#1a2a40] rounded-[10px] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[13px] font-medium text-[#cee9ff]">
                    Security Lock
                  </span>
                  
                  {/* AES-GCM Secured Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={encryptFile}
                      onChange={(e) => setEncryptFile(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[#0a1929] border-[0.5px] border-[#1a2a40] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-600 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0ea5e9] peer-checked:after:bg-white"></div>
                    <span className="ml-2 text-[13px] text-[#cee9ff] font-medium">
                      AES-GCM Secured
                    </span>
                  </label>
                </div>
                <div className="text-[11px] text-[#4a7fa5] mb-3">
                  Sealed locally before transmission
                </div>
              </div>

              {/* Two checkmark rows */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-[8px]">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#042f2e] text-[#2dd4bf] flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                  <span className="text-[12px] text-[#7ab3d4]">
                    AES-GCM 256-bit encryption
                  </span>
                </div>
                <div className="flex items-center gap-[8px]">
                  <div className="w-[16px] h-[16px] rounded-full bg-[#042f2e] text-[#2dd4bf] flex items-center justify-center shrink-0">
                    <Check className="h-2.5 w-2.5" />
                  </div>
                  <span className="text-[12px] text-[#7ab3d4]">
                    End-to-end zero-knowledge
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Gas Estimate Card */}
          <div className="p-[12px] px-[16px] bg-[#080f1d] border-[0.5px] border-[#1a2a40] rounded-[10px] flex justify-between items-center text-xs">
            <div className="flex items-center gap-[8px] text-[13px] text-[#7ab3d4]">
              <Flame className="h-4 w-4 text-[#f97316] shrink-0" />
              <span>On-Chain Gas Estimation:</span>
            </div>
            <div className="flex items-center gap-[10px]">
              <span className="text-[14px] font-medium text-[#cee9ff] font-mono">
                ~{estimatedGas} ETH
              </span>
              <span className="text-[11px] px-[10px] py-[3px] bg-[#0c2a44] text-[#38bdf8] border-[0.5px] border-[#1e4976] rounded-[20px] font-mono">
                {isPublic ? "upload(public)" : "upload(private)"}
              </span>
            </div>
          </div>

          {/* Trigger Buttons */}
          <div className="grid grid-cols-[1fr_2fr] gap-[10px]">
            <button
              type="button"
              onClick={() => setFile(null)}
              className="bg-[#0a1929] text-[#7ab3d4] border-[0.5px] border-[#1a2a40] rounded-[8px] py-[13px] px-4 text-[14px] flex items-center justify-center gap-2 hover:bg-[#0d1f33] transition-colors duration-200"
            >
              <Trash2 className="h-4 w-4 shrink-0" />
              <span>Clear</span>
            </button>
            <button
              type="button"
              onClick={startUpload}
              className="bg-[#0ea5e9] text-white border-none rounded-[8px] py-[13px] px-4 text-[14px] font-medium flex items-center justify-center gap-[8px] hover:bg-[#0284c7] transition-colors duration-200"
            >
              <Shield className="h-4 w-4 shrink-0" />
              <span>
                {isConnected ? "Secure & Upload File" : "Connect Wallet & Upload Securely"}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
