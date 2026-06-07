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

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState("");

  const fileInputRef = useRef(null);

  const { uploadFileOnChain, estimateGasFees, isConnected, connectWallet, contract, provider, waitTx, networkName, chainId } = useWeb3();
  const { masterSeed, logActivity, user } = useAuth();

  const getTxExplorerUrl = (hash) => {
    if (!hash) return null;
    const networkLower = networkName?.toLowerCase() || "";
    if (chainId === "11155111" || networkLower === "sepolia") {
      return `https://sepolia.etherscan.io/tx/${hash}`;
    }
    return null;
  };

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
    setTxHash(""); // Reset any previous transaction hash
    setIsUploading(true);
    setUploadProgress(10);
    setUploadStep("encrypting");
    
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
      setUploadStep("uploading_ipfs");
      setUploadProgress(40);
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
      setUploadStep("blockchain_tx");
      setUploadProgress(70);
      console.log("⛓️ Broadcasting transaction to blockchain...");

      if (!contract) throw new Error("Smart contract not instantiated");

      console.log("⚡ Fetching premium gas overrides...");
      const overrides = await getGasOverrides();

      const tx = await contract.uploadFile(
        cid,
        file.name,
        file.type || "application/octet-stream",
        file.size,
        encryptedKey || "unencrypted",
        fileIntegrityHash,
        isPublic,
        overrides
      );

      // Set transaction hash immediately to update loader UI
      const dispatchedHash = tx.hash || tx.transactionHash;
      setTxHash(dispatchedHash);
      setUploadProgress(90);
      console.log(`⏳ Waiting for transaction confirmation: ${dispatchedHash}...`);
      const receipt = await waitTx(tx, provider); // Explicit wait with custom polling fallback

      console.log("🎉 File stored on-chain! Transaction confirmed:", receipt.hash || receipt.transactionHash);
      setUploadPhase("success");
      setFile(null); // Clear selected file immediately on success

      // Log activity in backend audit ledger (non-blocking)
      logActivity(
        "FILE_UPLOAD",
        `Uploaded encrypted file ${file.name} to IPFS (${cid}) & recorded on-chain`,
        file.name,
        file.size,
        receipt.hash || receipt.transactionHash
      ).catch(e => console.warn("Activity log error:", e));

      // Trigger callback
      if (onUploadSuccess) {
        onUploadSuccess();
      }

      // Auto-reset upload phase back to idle after 5 seconds
      setTimeout(() => {
        setUploadPhase("idle");
      }, 5000);

    } catch (err) {
      console.error("Upload failure:", err);
      setErrorMessage(err.message || "An unexpected error occurred during upload.");
      setUploadPhase("error");
      
      // Log activity in backend audit ledger (non-blocking)
      logActivity(
        "UPLOAD_FAILED",
        `Failed to upload file ${file?.name || "Unknown"}: ${err.message || 'Unknown error'}`
      ).catch(e => console.warn("Activity log error:", e));
    } finally {
      // Forcefully reset loading indicators and status markers
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStep("");
    }
  };

  return (
    <div className="glass-card max-w-2xl mx-auto p-8 glow-border">
      {/* Upload Header */}
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold text-slate-100 flex items-center justify-center gap-2">
          <Upload className="h-5 w-5 text-cyan-400 animate-pulse" />
          Upload Encrypted Documents
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Zero-knowledge storage. Encrypted natively in your browser before IPFS dispatching.
        </p>
      </div>

      {/* Drag & Drop Box */}
      {uploadPhase === "idle" && (
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerInputClick}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
            dragActive
              ? "border-cyan-400 bg-cyan-500/5 shadow-[inset_0_0_20px_rgba(6,182,212,0.15)]"
              : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/20"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="h-14 w-14 rounded-full bg-slate-950/60 flex items-center justify-center border border-slate-800 text-slate-400 mb-4 hover:scale-105 transition-transform duration-300">
            <Upload className="h-6 w-6 text-cyan-400" />
          </div>
          {file ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-200 truncate max-w-sm">
                {file.name}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {formatBytes(file.size)}
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-300">
                Drag and drop your file here, or <span className="text-cyan-400 hover:underline">browse</span>
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                Supports PDFs, images, code files, and archives up to 100MB
              </p>
            </div>
          )}
        </div>
      )}

      {/* Progressive Phase Loader */}
      {isUploading && (
        <div className="border border-slate-800/80 rounded-2xl p-8 bg-slate-950/45 backdrop-blur-md flex flex-col items-center">
          <Loader2 className="h-10 w-10 text-cyan-400 animate-spin mb-4" />
          
          <div className="progress-container">
            <div className="status-text">
              {uploadStep === "encrypting" && "🔒 Locking Vault (AES-GCM Shielding...)"}
              {uploadStep === "uploading_ipfs" && "🌐 Dispatching to IPFS (Decentralized Pinning...)"}
              {uploadStep === "blockchain_tx" && "⛓️ Syncing Ledger (Blockchain Registration...)"}
            </div>
            
            <div className="progress-bar-background mt-2">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center mt-4 max-w-sm leading-normal">
            {uploadStep === "encrypting" && "Generating random 256-bit AES key to cryptographically seal the file in memory."}
            {uploadStep === "uploading_ipfs" && "Transferring the securely encrypted binary payload to Pinata IPFS nodes."}
            {uploadStep === "blockchain_tx" && "Broadcasting file CID, encrypted keys, and SHA-256 integrity signatures on-chain via MetaMask."}
          </p>

          {txHash && (
            <div className="mt-5 p-3.5 bg-slate-900/50 border border-slate-800/80 rounded-xl text-center w-full max-w-sm">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest block mb-1 font-bold">Transaction Dispatched</span>
              {getTxExplorerUrl(txHash) ? (
                <a 
                  href={getTxExplorerUrl(txHash)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline break-all inline-block hover:scale-102 transition-transform duration-200"
                >
                  {txHash}
                </a>
              ) : (
                <span className="text-xs font-mono text-cyan-400 break-all select-all block">
                  {txHash}
                </span>
              )}
              <span className="text-[10px] text-slate-400 block mt-2 animate-pulse">
                ⏳ Confirming on {networkName || "blockchain"}...
              </span>
            </div>
          )}
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
