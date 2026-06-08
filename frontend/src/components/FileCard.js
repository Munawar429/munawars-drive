"use client";

import React, { useState } from "react";
import { formatBytes, formatDate, getFileTypeMetadata, formatAddress } from "../utils/helpers.js";
import { useAuth } from "../hooks/useAuth.js";
import { useWeb3 } from "../hooks/useWeb3.js";
import { decryptFileClientSide, decryptFileKeyWithRSA } from "../utils/crypto.js";
import axios from "axios";
import { API_URL } from "../utils/config.js";
import { 
  Download, 
  Share2, 
  Trash2, 
  Lock, 
  Globe, 
  Eye, 
  ShieldAlert,
  Loader2,
  ExternalLink,
  ChevronDown,
  Copy
} from "lucide-react";

export default function FileCard({ file, isSharedView = false, onActionSuccess, onShare, onPreview }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");

  const { masterSeed, logActivity } = useAuth();
  const { deleteFileOnChain, toggleVisibilityOnChain, walletAddress } = useWeb3();

  // Extract variables safely from the Solidity struct
  const fileId = Number(file.id);
  const ipfsHash = file.ipfsHash;
  const fileName = file.fileName;
  const fileType = file.fileType;
  const fileSize = Number(file.fileSize);
  const encryptedKey = file.encryptedKey;
  const fileHash = file.fileHash;
  const owner = file.owner;
  const timestamp = Number(file.timestamp) * 1000; // block timestamp is in seconds
  const isPublic = file.isPublic;

  const { category, icon: FileIcon, colorClass } = getFileTypeMetadata(fileType, fileName);

  // 1. Decrypted Download Flow
  const handleDownload = async () => {
    setIsProcessing(true);
    setDownloadProgress("Fetching IPFS...");
    
    try {
      console.log(`📥 Downloading file '${fileName}' (${ipfsHash}) from IPFS...`);
      
      // Hit Express API proxy endpoint to retrieve raw encrypted buffer
      const response = await axios.get(`${API_URL}/ipfs/download/${ipfsHash}`, {
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setDownloadProgress(`Fetching: ${percentCompleted}%`);
        }
      });

      const encryptedBuffer = response.data;
      let finalBuffer = encryptedBuffer;

      // Decrypt if file has encrypted key
      if (encryptedKey && encryptedKey !== "unencrypted") {
        setDownloadProgress("Decrypting locally...");
        
        const isOwner = walletAddress && owner && (owner.toLowerCase() === walletAddress.toLowerCase());
        
        if (isOwner) {
          const isRsaEncrypted = encryptedKey.length > 200;
          if (isRsaEncrypted) {
            console.log("🔒 Decrypting file client-side using Owner's RSA Private Key...");
            const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
            if (!rsaPrivateKeyJson) {
              throw new Error("Local RSA Private Key not found. Please log in again.");
            }
            
            const decryptedFileKeyRaw = await decryptFileKeyWithRSA(encryptedKey, rsaPrivateKeyJson);
            const packedFileBytes = new Uint8Array(encryptedBuffer);
            const fileIv = packedFileBytes.slice(0, 12);
            const ciphertextBytes = packedFileBytes.slice(12);

            const cryptoFileKey = await window.crypto.subtle.importKey(
              "raw",
              decryptedFileKeyRaw,
              { name: "AES-GCM" },
              false,
              ["decrypt"]
            );

            finalBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: fileIv },
              cryptoFileKey,
              ciphertextBytes
            );
          } else {
            console.log("🔒 Decrypting file client-side using Owner's Web Crypto AES-GCM...");
            if (!masterSeed) {
              throw new Error("Vault Master Seed not found. Please log in again.");
            }
            finalBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
          }
        } else {
          console.log("🔒 Decrypting shared file client-side using Asymmetric RSA Key Exchange...");
          
          // 1. Fetch shared key from backend
          let sharedKeyHex = null;
          try {
            const keyResponse = await axios.get(`${API_URL}/ipfs/share-key/${fileId}`);
            sharedKeyHex = keyResponse.data.encryptedKey;
          } catch (keyErr) {
            throw new Error(keyErr.response?.data?.message || "Failed to fetch shared decryption key from backend.");
          }
          
          // 2. Fetch RSA private key from localStorage
          const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
          if (!rsaPrivateKeyJson) {
            throw new Error("Local RSA Private Key not found in vault session. Please reload or log in again.");
          }
          
          // 3. Decrypt file key using RSA
          const decryptedFileKeyRaw = await decryptFileKeyWithRSA(sharedKeyHex, rsaPrivateKeyJson);
          
          // 4. Decrypt file payload using the decrypted symmetric key
          const packedFileBytes = new Uint8Array(encryptedBuffer);
          const fileIv = packedFileBytes.slice(0, 12);
          const ciphertextBytes = packedFileBytes.slice(12);

          const cryptoFileKey = await window.crypto.subtle.importKey(
            "raw",
            decryptedFileKeyRaw,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
          );

          finalBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fileIv },
            cryptoFileKey,
            ciphertextBytes
          );
        }
      }

      setDownloadProgress("Assembling Blob...");
      console.log("📂 Initiating native browser download trigger...");

      // Trigger standard browser download
      const blob = new Blob([finalBuffer], { type: fileType || "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadProgress("");
      setIsProcessing(false);

      await logActivity(
        "FILE_DOWNLOAD",
        `Successfully downloaded and decrypted file: ${fileName}`,
        fileName,
        fileSize
      );
    } catch (e) {
      console.error("Download/Decryption Error:", e);
      alert(`Download Failed: ${e.message}`);
      setDownloadProgress("");
      setIsProcessing(false);

      await logActivity(
        "DOWNLOAD_FAILED",
        `Failed to download/decrypt file ${fileName}: ${e.message}`
      );
    }
  };

  // 2. Client-Side Decrypted Preview Flow
  const handlePreview = async () => {
    setIsProcessing(true);
    setDownloadProgress("Loading Preview...");
    
    try {
      // Fetch buffer
      const response = await axios.get(`${API_URL}/ipfs/download/${ipfsHash}`, {
        responseType: "arraybuffer"
      });

      const encryptedBuffer = response.data;
      let finalBuffer = encryptedBuffer;

      // Decrypt if file encrypted
      if (encryptedKey && encryptedKey !== "unencrypted") {
        setDownloadProgress("Decrypting preview...");
        
        const isOwner = walletAddress && owner && (owner.toLowerCase() === walletAddress.toLowerCase());
        
        if (isOwner) {
          const isRsaEncrypted = encryptedKey.length > 200;
          if (isRsaEncrypted) {
            console.log("🔒 Decrypting file client-side using Owner's RSA Private Key...");
            const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
            if (!rsaPrivateKeyJson) {
              throw new Error("Local RSA Private Key not found. Please log in again.");
            }
            
            const decryptedFileKeyRaw = await decryptFileKeyWithRSA(encryptedKey, rsaPrivateKeyJson);
            const packedFileBytes = new Uint8Array(encryptedBuffer);
            const fileIv = packedFileBytes.slice(0, 12);
            const ciphertextBytes = packedFileBytes.slice(12);

            const cryptoFileKey = await window.crypto.subtle.importKey(
              "raw",
              decryptedFileKeyRaw,
              { name: "AES-GCM" },
              false,
              ["decrypt"]
            );

            finalBuffer = await window.crypto.subtle.decrypt(
              { name: "AES-GCM", iv: fileIv },
              cryptoFileKey,
              ciphertextBytes
            );
          } else {
            console.log("🔒 Decrypting file client-side using Owner's Web Crypto AES-GCM...");
            if (!masterSeed) throw new Error("Vault Master Seed missing.");
            finalBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
          }
        } else {
          console.log("🔒 Decrypting shared file client-side using Asymmetric RSA Key Exchange...");
          
          // 1. Fetch shared key from backend
          let sharedKeyHex = null;
          try {
            const keyResponse = await axios.get(`${API_URL}/ipfs/share-key/${fileId}`);
            sharedKeyHex = keyResponse.data.encryptedKey;
          } catch (keyErr) {
            throw new Error(keyErr.response?.data?.message || "Failed to fetch shared decryption key.");
          }
          
          // 2. Fetch RSA private key from localStorage
          const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
          if (!rsaPrivateKeyJson) {
            throw new Error("Local RSA Private Key not found. Please log in again.");
          }
          
          // 3. Decrypt key via RSA
          const decryptedFileKeyRaw = await decryptFileKeyWithRSA(sharedKeyHex, rsaPrivateKeyJson);
          
          // 4. Decrypt file payload
          const packedFileBytes = new Uint8Array(encryptedBuffer);
          const fileIv = packedFileBytes.slice(0, 12);
          const ciphertextBytes = packedFileBytes.slice(12);

          const cryptoFileKey = await window.crypto.subtle.importKey(
            "raw",
            decryptedFileKeyRaw,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
          );

          finalBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fileIv },
            cryptoFileKey,
            ciphertextBytes
          );
        }
      }

      // Pass decrypted object to parent preview modal
      if (onPreview) {
        onPreview(finalBuffer, fileName, fileType);
      }

      setDownloadProgress("");
      setIsProcessing(false);
    } catch (e) {
      console.error("Preview failure:", e);
      alert(`Could not preview file: ${e.message}`);
      setDownloadProgress("");
      setIsProcessing(false);
    }
  };

  // 3. Toggle visibility public <-> private
  const handleToggleVisibility = async () => {
    setIsProcessing(true);
    try {
      console.log(`⛓️ Toggling visbility on blockchain for file ID: ${fileId}...`);
      await toggleVisibilityOnChain(fileId, !isPublic);
      
      await logActivity(
        "VISIBILITY_TOGGLE",
        `Toggled visibility of file ${fileName} to ${!isPublic ? 'Public' : 'Private'}`,
        fileName,
        fileSize
      );

      if (onActionSuccess) onActionSuccess();
    } catch (e) {
      console.error("Failed to toggle visibility:", e);
      alert("Blockchain transaction failed. Check MetaMask.");
    }
    setIsProcessing(false);
  };

  // 4. Delete file
  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete '${fileName}' on the blockchain? This is permanent.`)) return;
    
    setIsProcessing(true);
    try {
      console.log(`⛓️ Deleting file record on blockchain, file ID: ${fileId}...`);
      await deleteFileOnChain(fileId);
      
      await logActivity(
        "FILE_DELETED",
        `Marked file ${fileName} as deleted on-chain`,
        fileName,
        fileSize
      );

      if (onActionSuccess) onActionSuccess();
    } catch (e) {
      console.error("Failed to delete file:", e);
      alert("Failed to delete file on blockchain.");
    }
    setIsProcessing(false);
  };

  return (
    <div className="relative group flex flex-col justify-between h-72 rounded-2xl border border-white/10 bg-[#0c1020]/80 backdrop-blur-lg p-5 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:border-cyan-500/35 select-none">
      {/* Floating Badges */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-1.5">
        <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-300 shadow-sm" title="Blockchain File ID">
          ID: {fileId}
        </span>
        {encryptedKey && encryptedKey !== "unencrypted" ? (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
            <Lock className="h-2.5 w-2.5" />
            {encryptedKey.length > 200 ? "RSA" : "AES-GCM"}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-slate-400 font-mono">
            Plain
          </span>
        )}
      </div>
      
      <div className="absolute top-4 right-4 z-20">
        {isPublic ? (
          <button 
            onClick={(e) => { e.stopPropagation(); handleToggleVisibility(); }}
            disabled={isProcessing}
            className="h-6 w-6 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.1)] transition-colors hover:bg-indigo-500/20 cursor-pointer" 
            title="Public (click to make Private)"
          >
            <Globe className="h-3 w-3" />
          </button>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); handleToggleVisibility(); }}
            disabled={isProcessing}
            className="h-6 w-6 rounded-full bg-slate-950/80 border border-slate-800 text-slate-500 flex items-center justify-center hover:text-cyan-400 hover:border-cyan-500/30 transition-colors cursor-pointer" 
            title="Private (click to make Public)"
          >
            <Lock className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Card Content - Centered */}
      <div className="mt-8 flex flex-col items-center">
        {/* Large File Type Icon with glowing holographic background */}
        <div className="relative h-16 w-16 rounded-2xl flex items-center justify-center border border-slate-700 bg-slate-950/60 shadow-lg mb-3 transition-all duration-300 group-hover:scale-105 group-hover:border-cyan-500/50 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.25)]">
          <FileIcon className="h-8 w-8 text-cyan-400 group-hover:text-cyan-300 transition-colors" />
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
        </div>
        
        <h4 className="text-sm font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors text-center w-full max-w-[200px] truncate" title={fileName}>
          {fileName}
        </h4>
        
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-400 font-mono">
            {formatBytes(fileSize)}
          </span>
          <span className="text-[10px] text-slate-600 font-mono">•</span>
          <span className="text-[10px] text-slate-500 font-mono">
            {formatDate(timestamp)}
          </span>
        </div>
      </div>

      {/* Upgraded Footer Actions Section */}
      <div className="relative mt-4 h-12 flex items-center justify-between">
        {/* Default View (Truncated IPFS CID & Sepolia Network Badge) - Always Visible */}
        <div className="absolute inset-0 flex items-center justify-between transition-all duration-300 pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(ipfsHash);
              alert("IPFS CID copied to clipboard!");
            }}
            className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-900 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-400 rounded-lg px-2.5 py-1 text-[10px] font-mono transition-all duration-300"
            title="Click to copy IPFS CID"
          >
            <span>{ipfsHash.slice(0, 6)}...{ipfsHash.slice(-4)}</span>
            <Copy className="h-3 w-3 text-slate-500" />
          </button>
          
          <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-slate-500 bg-slate-950/40 px-2 py-1 rounded-md border border-white/5 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_5px_rgba(6,182,212,0.8)] animate-pulse" />
            Ethereum
          </span>
        </div>

        {/* Hover View Actions (Reveals directly above the copy bar on card hover) */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 translate-y-4 pointer-events-none group-hover:opacity-100 group-hover:-translate-y-12 group-hover:pointer-events-auto transition-all duration-300">
          {/* Decrypt & Preview Button */}
          {["Image", "Document", "Code"].includes(category) && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePreview(); }}
              disabled={isProcessing}
              className="h-9 px-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-400 flex items-center justify-center gap-1 text-xs font-semibold transition-all duration-300 cursor-pointer"
              title="Decrypt & Preview"
            >
              {isProcessing && downloadProgress.includes("preview") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              <span>Preview</span>
            </button>
          )}

          {/* Decrypt & Download Button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            disabled={isProcessing}
            className="h-9 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white flex items-center justify-center gap-1 text-xs font-bold transition-all duration-300 cursor-pointer shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 active:scale-95 border-none"
            title="Decrypt & Download"
          >
            {isProcessing && downloadProgress.includes("Fetching") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <Download className="h-3.5 w-3.5 text-white" />
            )}
            <span>Download</span>
          </button>

          {/* Share Control */}
          {!isSharedView && (
            <button
              onClick={(e) => { e.stopPropagation(); onShare && onShare(file); }}
              className="h-9 w-9 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-violet-500/50 hover:bg-violet-500/10 text-slate-300 hover:text-violet-400 flex items-center justify-center transition-all duration-300 cursor-pointer"
              title="Share Key Access"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Delete Control */}
          {!isSharedView && (
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={isProcessing}
              className="h-9 w-9 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-all duration-300 cursor-pointer"
              title="Delete File"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
