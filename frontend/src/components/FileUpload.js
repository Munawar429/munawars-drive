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
  Loader2
} from "lucide-react";

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
    <div className="glass-card max-w-2xl mx-auto p-8 glow-border">
      {/* Drag & Drop Box */}
      {uploadPhase === "idle" && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerInputClick}
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
          <div className="flex items-center gap-2 bg-[#0c2a44] border border-[#1e4976]/50 rounded-[20px] px-[12px] py-[4px] text-[11px] text-[#38bdf8] mb-5 select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee] shrink-0" />
            <span>Zero-knowledge encrypted before IPFS upload</span>
          </div>

          <div className="h-[60px] w-[60px] rounded-full bg-[#0c2a44] border border-[#1e3a5f] flex items-center justify-center text-[#38bdf8] mb-4 hover:scale-105 transition-transform duration-300">
            <Upload className="h-[26px] w-[26px]" />
          </div>

          {file ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-[#cee9ff] truncate max-w-sm">
                {file.name}
              </p>
              <p className="text-xs text-[#4a7fa5] mt-1 font-mono">
                {formatBytes(file.size)}
              </p>
            </div>
          ) : (
            <div className="text-center flex flex-col items-center">
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
                  <span key={chip} className="bg-[#0a1929] border border-[#1a2a40] rounded-[20px] px-[10px] py-[3px] text-[11px] text-[#4a7fa5] font-medium">
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
        <div className="border border-slate-800/80 rounded-2xl p-8 bg-slate-950/45 backdrop-blur-md flex flex-col items-center">
          <Loader2 className="h-10 w-10 text-cyan-400 animate-spin mb-4" />
          
          <div className="progress-container">
            <div className="status-text">
              {uploadPhase === "encrypting" && "🔒 Locking Vault (AES-GCM Shielding...)"}
              {uploadPhase === "uploading_ipfs" && "🌐 Dispatching to IPFS (Decentralized Pinning...)"}
              {uploadPhase === "blockchain_tx" && "⛓️ Syncing Ledger (Blockchain Registration...)"}
            </div>
            
            <div className="progress-bar-background mt-2">
              <div 
                className="progress-bar-fill" 
                style={{
                  width: 
                    uploadPhase === "encrypting" ? "33%" : 
                    uploadPhase === "uploading_ipfs" ? "66%" : "95%"
                }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center mt-4 max-w-sm leading-normal">
            {uploadPhase === "encrypting" && "Generating random 256-bit AES key to cryptographically seal the file in memory."}
            {uploadPhase === "uploading_ipfs" && "Transferring the securely encrypted binary payload to Pinata IPFS nodes."}
            {uploadPhase === "blockchain_tx" && "Broadcasting file CID, encrypted keys, and SHA-256 integrity signatures on-chain via MetaMask."}
          </p>
        </div>
      )}

      {/* Success View */}
      {uploadPhase === "success" && (
        <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-8 flex flex-col items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-3" />
          <h4 className="text-base font-bold text-slate-200">Decentralized Storage Sealed!</h4>
          <p className="text-xs text-slate-400 mt-2 max-w-sm">
            The encrypted file is securely pinned to IPFS, and its cryptographic fingerprint is registered on the blockchain.
          </p>
          {txHash && (
            <div className="mt-4 p-2 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-mono text-cyan-400 select-all cursor-pointer">
              Tx: {txHash}
            </div>
          )}
          <button
            onClick={() => setUploadPhase("idle")}
            className="mt-5 glass-btn-secondary px-5 py-2 text-xs"
          >
            Upload Another File
          </button>
        </div>
      )}

      {/* Error View */}
      {uploadPhase === "error" && (
        <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-8 flex flex-col items-center text-center">
          <ShieldAlert className="h-12 w-12 text-rose-400 mb-3" />
          <h4 className="text-base font-bold text-slate-200">Registration Failed</h4>
          <p className="text-xs text-rose-400 mt-2 max-w-sm">
            {errorMessage}
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setUploadPhase("idle")}
              className="glass-btn-secondary px-5 py-2 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={startUpload}
              className="glass-btn-primary px-5 py-2 text-xs"
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
            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/40">
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-2">
                Ledger Visibility
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsPublic(false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    !isPublic
                      ? "bg-slate-950 border-cyan-500/40 text-cyan-400 shadow-sm shadow-cyan-500/10"
                      : "bg-transparent border-slate-800 text-slate-500 hover:text-slate-350"
                  }`}
                >
                  <Lock className="h-3 w-3" />
                  Private Drive
                </button>
                <button
                  type="button"
                  onClick={() => setIsPublic(true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    isPublic
                      ? "bg-slate-950 border-cyan-500/40 text-cyan-400 shadow-sm shadow-cyan-500/10"
                      : "bg-transparent border-slate-800 text-slate-500 hover:text-slate-350"
                  }`}
                >
                  <Globe className="h-3 w-3" />
                  Public Shared
                </button>
              </div>
            </div>

            {/* Cryptographic Protection Option */}
            <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800/40 flex flex-col justify-between">
              <div>
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
                  Security Lock
                </label>
                <span className="text-[10px] text-slate-400 leading-tight block">
                  Seal document locally in browser prior to transmission.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer mt-2.5">
                <input
                  type="checkbox"
                  checked={encryptFile}
                  onChange={(e) => setEncryptFile(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-950 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-600 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-slate-100"></div>
                <span className="ml-2 text-xs font-semibold text-slate-300">
                  {encryptFile ? "AES-GCM Secured" : "Plaintext (No Encryption)"}
                </span>
              </label>
            </div>
          </div>

          {/* Gas Estimate Card */}
          <div className="p-4 rounded-xl bg-slate-900/20 border border-slate-800/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-400 font-medium">
              <Coins className="h-4 w-4 text-cyan-400 animate-pulse" />
              <span>On-Chain Gas Estimation:</span>
            </div>
            <div className="font-mono text-slate-300 font-semibold flex items-center gap-1.5">
              <span>~{estimatedGas} ETH</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-500 font-mono">
                {isPublic ? "upload(public)" : "upload(private)"}
              </span>
            </div>
          </div>

          {/* Trigger Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setFile(null)}
              className="flex-1 glass-btn-secondary py-3 text-sm"
            >
              Clear
            </button>
            <button
              onClick={startUpload}
              className="flex-1 glass-btn-primary py-3 text-sm font-bold shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              {isConnected ? "Secure & Upload File" : "Connect Wallet to Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
