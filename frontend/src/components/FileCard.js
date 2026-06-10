"use client";

import React, { useState } from "react";
import { formatBytes, formatDate, formatAddress } from "../utils/helpers.js";
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
  Loader2,
  ExternalLink,
  LogOut,
  Image as ImageIcon,
  Video,
  FileText,
  Archive,
  File
} from "lucide-react";

// Helper to resolve files, icons, gradients, glows, and badges based on file extension & MIME type
const getFileTypeStyle = (name, type) => {
  const mime = type ? type.toLowerCase() : "";
  const ext = name ? name.split(".").pop().toLowerCase() : "";

  // 1. Images
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return {
      icon: ImageIcon,
      gradient: "bg-[#042f2e] border-[#0f6e56]/80 text-[#2dd4bf]",
      glow: "hover:border-[#2dd4bf]/40 hover:shadow-2xl hover:shadow-emerald-500/5",
      badgeBg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
      previewable: true
    };
  }
  // 2. Videos
  if (mime.startsWith("video/") || ["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
    return {
      icon: Video,
      gradient: "bg-[#1e1b4b] border-[#312e81]/80 text-[#a78bfa]",
      glow: "hover:border-[#a78bfa]/40 hover:shadow-2xl hover:shadow-purple-500/5",
      badgeBg: "bg-purple-500/10 border-purple-500/30 text-purple-400",
      previewable: true
    };
  }
  // 3. PDFs (Explicit style)
  if (mime === "application/pdf" || ext === "pdf") {
    return {
      icon: FileText,
      gradient: "bg-[#3b0f0f] border-[#7f1d1d]/80 text-[#f87171]",
      glow: "hover:border-[#f87171]/40 hover:shadow-2xl hover:shadow-red-500/5",
      badgeBg: "bg-red-500/10 border-red-500/30 text-red-400",
      previewable: true
    };
  }
  // 4. Documents & General Text
  if (
    mime.startsWith("text/") || 
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt"].includes(ext)
  ) {
    return {
      icon: FileText,
      gradient: "bg-[#0c2a44] border-[#1e3a5f]/80 text-[#38bdf8]",
      glow: "hover:border-[#38bdf8]/40 hover:shadow-2xl hover:shadow-cyan-500/5",
      badgeBg: "bg-blue-500/10 border-blue-500/30 text-blue-400",
      previewable: true
    };
  }
  // 5. Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return {
      icon: Archive,
      gradient: "bg-[#3f200c] border-[#78350f]/80 text-[#fb923c]",
      glow: "hover:border-[#fb923c]/40 hover:shadow-2xl hover:shadow-orange-500/5",
      badgeBg: "bg-orange-500/10 border-orange-500/30 text-orange-400",
      previewable: false
    };
  }
  // 6. Default Fallback
  return {
    icon: File,
    gradient: "bg-[#0a1929] border-[#1a2a40]/80 text-slate-400",
    glow: "hover:border-slate-500/40 hover:shadow-2xl hover:shadow-black/5",
    badgeBg: "bg-slate-500/10 border-slate-500/30 text-slate-400",
    previewable: false
  };
};

export default function FileCard({ file, isSharedView = false, onActionSuccess, onShare, onPreview }) {
  const { 
    id: fileId, 
    ipfsHash, 
    fileName, 
    fileType, 
    fileSize, 
    encryptedKey, 
    fileHash, 
    owner, 
    timestamp, 
    isPublic 
  } = file;

  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [copied, setCopied] = useState(false);

  const { logActivity, masterSeed } = useAuth();
  const { 
    deleteFileOnChain, 
    toggleVisibilityOnChain, 
    revokeAccessOnChain, 
    walletAddress 
  } = useWeb3();

  // Correcting Unix timestamp bug (seconds to milliseconds check)
  const correctedTimestamp = Number(timestamp) < 9999999999 ? Number(timestamp) * 1000 : Number(timestamp);

  // 1. Decrypted Download Flow
  const handleDownload = async () => {
    setDownloadPercent(0);
    setDownloadProgress("Fetching IPFS...");
    setIsProcessing(true);
    try {
      console.log(`📥 Downloading file '${fileName}' (${ipfsHash}) from IPFS...`);
      
      const response = await axios.get(`${API_URL}/ipfs/download/${ipfsHash}`, {
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setDownloadPercent(percentCompleted);
            setDownloadProgress(`Fetching: ${percentCompleted}%`);
          } else {
            setDownloadProgress("Fetching...");
          }
        }
      });

      setDownloadProgress("Decrypting locally...");
      setDownloadPercent(100);
      const encryptedBuffer = response.data;
      let plaintextBuffer;

      // Resolve current key (fetch recipient's key from db if shared and encrypted)
      let currentKey = encryptedKey;
      if (isSharedView && encryptedKey && encryptedKey !== "unencrypted") {
        try {
          const keyRes = await axios.get(`${API_URL}/ipfs/share-key/${fileId}`);
          if (keyRes.data && keyRes.data.encryptedKey) {
            currentKey = keyRes.data.encryptedKey;
          }
        } catch (err) {
          console.warn("Failed to fetch shared key from database, falling back to blockchain key:", err);
        }
      }

      if (!currentKey || currentKey === "unencrypted") {
        plaintextBuffer = encryptedBuffer;
      } else {
        const isRsaEncrypted = currentKey.length > 200;

        if (isRsaEncrypted) {
          const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
          if (!rsaPrivateKeyJson) {
            throw new Error("Local RSA Private Key not found in browser storage. Please log in again.");
          }
          const fileKeyBytes = await decryptFileKeyWithRSA(currentKey, rsaPrivateKeyJson);
          const packedFileBytes = new Uint8Array(encryptedBuffer);
          const fileIv = packedFileBytes.slice(0, 12);
          const ciphertextBytes = packedFileBytes.slice(12);

          const cryptoFileKey = await window.crypto.subtle.importKey(
            "raw",
            fileKeyBytes,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
          );

          plaintextBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fileIv },
            cryptoFileKey,
            ciphertextBytes
          );
        } else {
          if (!masterSeed) {
            throw new Error("Owner's Master Seed not found. Please log in again.");
          }
          plaintextBuffer = await decryptFileClientSide(encryptedBuffer, currentKey, masterSeed);
        }
      }

      setDownloadProgress("Assembling Blob...");
      console.log("📂 Initiating native browser download trigger...");
      const blob = new Blob([plaintextBuffer], { type: fileType });
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadProgress("");
      setDownloadPercent(0);

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
      setDownloadPercent(0);
      
      await logActivity(
        "DOWNLOAD_FAILED",
        `Failed to download/decrypt file ${fileName}: ${e.message}`,
        fileName,
        fileSize
      );
    }
    setIsProcessing(false);
  };

  // 2. Local Preview Loading
  const handlePreviewTrigger = async () => {
    if (!onPreview) return;
    setDownloadProgress("Loading Preview...");
    setIsProcessing(true);
    try {
      const response = await axios.get(`${API_URL}/ipfs/download/${ipfsHash}`, {
        responseType: "arraybuffer"
      });

      setDownloadProgress("Decrypting preview...");
      const encryptedBuffer = response.data;
      let plaintextBuffer;

      // Resolve current key (fetch recipient's key from db if shared and encrypted)
      let currentKey = encryptedKey;
      if (isSharedView && encryptedKey && encryptedKey !== "unencrypted") {
        try {
          const keyRes = await axios.get(`${API_URL}/ipfs/share-key/${fileId}`);
          if (keyRes.data && keyRes.data.encryptedKey) {
            currentKey = keyRes.data.encryptedKey;
          }
        } catch (err) {
          console.warn("Failed to fetch shared key from database, falling back to blockchain key:", err);
        }
      }

      if (!currentKey || currentKey === "unencrypted") {
        plaintextBuffer = encryptedBuffer;
      } else {
        const isRsaEncrypted = currentKey.length > 200;

        if (isRsaEncrypted) {
          const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
          if (!rsaPrivateKeyJson) {
            throw new Error("Local RSA Private Key not found. Please log in again.");
          }
          const fileKeyBytes = await decryptFileKeyWithRSA(currentKey, rsaPrivateKeyJson);
          const packedFileBytes = new Uint8Array(encryptedBuffer);
          const fileIv = packedFileBytes.slice(0, 12);
          const ciphertextBytes = packedFileBytes.slice(12);

          const cryptoFileKey = await window.crypto.subtle.importKey(
            "raw",
            fileKeyBytes,
            { name: "AES-GCM" },
            false,
            ["decrypt"]
          );

          plaintextBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fileIv },
            cryptoFileKey,
            ciphertextBytes
          );
        } else {
          if (!masterSeed) {
            throw new Error("Owner's Master Seed not found. Please log in again.");
          }
          plaintextBuffer = await decryptFileClientSide(encryptedBuffer, currentKey, masterSeed);
        }
      }

      onPreview(plaintextBuffer, fileName, fileType);
      setDownloadProgress("");
    } catch (e) {
      console.error("Preview Decryption Error:", e);
      alert(`Preview Decryption Failed: ${e.message}`);
      setDownloadProgress("");
    }
    setIsProcessing(false);
  };

  // 3. Toggle Visibility
  const handleToggleVisibility = async () => {
    setIsProcessing(true);
    try {
      const newIsPublic = !isPublic;
      console.log(`⛓️ Toggling file visibility on-chain for ID ${fileId} to: ${newIsPublic ? "Public" : "Private"}`);
      await toggleVisibilityOnChain(fileId, newIsPublic);
      
      await logActivity(
        "FILE_VISIBILITY",
        `Toggled visibility of file ${fileName} to ${newIsPublic ? "PUBLIC" : "PRIVATE"}`,
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

  // 5. Self-Revoke Access (Leave Share)
  const handleSelfRevoke = async () => {
    if (!confirm(`Are you sure you want to remove your own access to '${fileName}'? You will no longer be able to open or download this file.`)) return;

    setIsProcessing(true);
    setDownloadProgress("Revoking...");
    try {
      console.log(`⛓️ Voluntarily revoking own access to file CID: ${ipfsHash}...`);
      await revokeAccessOnChain(ipfsHash, walletAddress);

      console.log(`📡 Cleaning up shared key record. Target File ID: ${fileId}, Recipient Address: ${walletAddress}`);
      console.log(`Calling DELETE: ${API_URL}/ipfs/share-key/${fileId}/${walletAddress}`);
      await axios.delete(`${API_URL}/ipfs/share-key/${fileId}/${walletAddress}`);

      await logActivity(
        "SELF_REVOKE",
        `Voluntarily surrendered access to file ${fileName}`,
        fileName,
        fileSize
      );

      alert("Access voluntarily revoked successfully!");
      if (onActionSuccess) onActionSuccess();
    } catch (e) {
      console.error("Failed to revoke own access:", e);
      alert(`Failed to remove access: ${e.message || e}`);
    }
    setDownloadProgress("");
    setIsProcessing(false);
  };

  // 6. Copy CID to Clipboard
  const handleCopyCID = (e) => {
    e.stopPropagation();
    if (!ipfsHash) return;
    navigator.clipboard.writeText(ipfsHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Resolve visual styling variables
  const fileStyle = getFileTypeStyle(fileName, fileType);
  const FileIcon = fileStyle.icon;
  const ext = fileName ? fileName.split(".").pop().toUpperCase() : "FILE";

  const getDownloadButtonText = () => {
    if (isProcessing) {
      if (downloadProgress.includes("Fetching") && downloadPercent > 0) {
        return `${downloadPercent}%`;
      }
      if (downloadProgress.includes("Decrypting")) {
        return "Decrypting...";
      }
      if (downloadProgress.includes("Assembling")) {
        return "Saving...";
      }
      return "Processing...";
    }
    return "Download";
  };

  return (
    <div className={`relative group flex flex-col justify-between min-h-[20rem] h-auto rounded-2xl border border-[#1a2a40] bg-[#0a1929] p-6 transition-all duration-200 hover:border-[#38bdf8]/40 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#22d3ee]/5 select-none overflow-hidden`}>
      
      {/* Floating Badges (Combined in single Flex Row to prevent overlap) */}
      <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap items-center gap-1.5">
        <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded-full bg-[#050d1a] border border-[#1a2a40] text-slate-350 shadow-sm whitespace-nowrap" title="Blockchain File ID">
          ID: {fileId}
        </span>
        {encryptedKey && encryptedKey !== "unencrypted" ? (
          <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0c2a44] border border-[#1e4976] text-[#38bdf8] shadow-[0_0_10px_rgba(6,182,212,0.05)] whitespace-nowrap">
            <Lock className="h-2.5 w-2.5" />
            AES Shielded
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#042f2e] border border-[#0f6e56] text-[#2dd4bf] shadow-[0_0_10px_rgba(16,185,129,0.05)] whitespace-nowrap">
            <Globe className="h-2.5 w-2.5" />
            Public
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); !isSharedView && handleToggleVisibility(); }}
          className={`h-5 px-2 rounded-lg border text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 transition-all duration-200 whitespace-nowrap ${
            isSharedView
              ? "bg-[#050d1a]/40 border-[#1a2a40]/60 text-slate-500 cursor-not-allowed"
              : isPublic
              ? "bg-[#042f2e] hover:bg-[#053d3c] border-[#0f6e56] text-[#2dd4bf] cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.05)]"
              : "bg-[#0c2a44] hover:bg-[#0f3555] border-[#1e4976] text-[#38bdf8] cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.05)]"
          }`}
          disabled={isSharedView || isProcessing}
          title={isSharedView ? "Shared file visibility cannot be modified" : "Click to change visibility"}
        >
          {isPublic ? <Globe className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
          <span>{isPublic ? "Public" : "Private"}</span>
        </button>
      </div>

      {/* Main File Icon & Title */}
      <div className="flex-1 flex flex-col items-center justify-center mt-10">
        <div className={`h-20 w-20 rounded-full ${fileStyle.gradient} flex items-center justify-center border relative transition-all duration-200 group-hover:scale-105 shadow-inner`}>
          {FileIcon === File ? (
            <span className="text-sm font-black font-mono tracking-wider text-slate-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              .{ext.slice(0, 4)}
            </span>
          ) : (
            <FileIcon className="h-9 w-9 text-slate-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
          )}
        </div>
        <h4 className="mt-4 text-base font-bold text-slate-100 max-w-full truncate text-center group-hover:text-[#22d3ee] transition-colors duration-200" title={fileName}>
          {fileName}
        </h4>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-xs text-[#4a7fa5] font-mono text-center max-w-full">
          <span className="whitespace-nowrap">{formatBytes(fileSize)}</span>
          <span className="text-slate-700">•</span>
          <span className="text-center">{formatDate(correctedTimestamp)}</span>
        </div>
      </div>

      {/* Action Overlay & Metadata Controls */}
      <div className="border-t border-[#1a2a40] pt-4 mt-4 overflow-hidden relative min-h-12">
        
        {/* State A: Copy Bar (Resting) */}
        <div className="flex items-center justify-between gap-2 transition-all duration-200 group-hover:translate-y-12">
          {/* Clickable Owner Address Chip (opens Etherscan) */}
          <a
            href={`https://sepolia.etherscan.io/address/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#050d1a] border border-[#1a2a40] hover:border-[#1e3a5f] hover:bg-[#0c2a44]/30 text-[10px] text-slate-400 hover:text-slate-200 transition-all font-mono"
            title={`View owner wallet ${owner} on Etherscan`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#22d3ee] animate-pulse" />
            <span>Owner: {owner ? `${owner.slice(0, 6)}...${owner.slice(-4)}` : "Unknown"}</span>
            <ExternalLink className="h-2.5 w-2.5 opacity-55" />
          </a>

          {/* Clickable CID Copy Chip */}
          <button
            onClick={handleCopyCID}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-all ${
              copied
                ? "bg-[#042f2e] border-[#0f6e56] text-[#2dd4bf]"
                : "bg-[#050d1a] border-[#1a2a40] hover:border-[#1e3a5f] hover:bg-[#0c2a44]/30 text-slate-400 hover:text-slate-200"
            }`}
            title="Click to copy full IPFS CID"
          >
            <span>{copied ? "Copied!" : `CID: ${ipfsHash ? `${ipfsHash.slice(0, 5)}...${ipfsHash.slice(-4)}` : "None"}`}</span>
          </button>
        </div>

        {/* State B: Buttons Overlay (Group Hover with Staggered Entrance Animations) */}
        <div className="absolute inset-0 flex items-center justify-center gap-1.5 transition-all duration-200 translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 bg-[#0a1929] z-30">
          
          {/* Preview Button */}
          {fileStyle.previewable && onPreview && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePreviewTrigger(); }}
              disabled={isProcessing}
              className="h-8 w-8 rounded-lg bg-[#050d1a] border border-[#1a2a40] hover:border-[#38bdf8] hover:bg-[#0c2a44] text-[#4a7fa5] hover:text-[#38bdf8] flex items-center justify-center transition-all duration-200 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 cursor-pointer"
              style={{ transitionDelay: "0ms" }}
              title="Quick Preview Decrypted"
            >
              {isProcessing && downloadProgress.includes("Preview") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38bdf8]" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Decrypt & Download Button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleDownload(); }}
            disabled={isProcessing}
            className="h-8 px-3 rounded-lg bg-[#0ea5e9] hover:bg-[#0284c7] text-white flex items-center justify-center gap-1.5 text-[11px] font-bold transition-all duration-200 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 cursor-pointer active:scale-95 border-none shadow-sm shadow-[#0ea5e9]/10"
            style={{ transitionDelay: "50ms" }}
            title="Decrypt & Download"
          >
            {isProcessing && downloadProgress.includes("Fetching") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <Download className="h-3.5 w-3.5 text-white" />
            )}
            <span>{getDownloadButtonText()}</span>
          </button>

          {/* Share Control */}
          {!isSharedView && onShare && (
            <button
              onClick={(e) => { e.stopPropagation(); onShare(file); }}
              className="h-8 w-8 rounded-lg bg-[#050d1a] border border-[#1a2a40] hover:border-[#a78bfa] hover:bg-[#1e1b4b] text-[#4a7fa5] hover:text-[#a78bfa] flex items-center justify-center transition-all duration-200 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 cursor-pointer"
              style={{ transitionDelay: "100ms" }}
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
              className="h-8 w-8 rounded-lg bg-[#050d1a] border border-[#1a2a40] hover:border-rose-500 hover:bg-[#3b0f0f] text-[#4a7fa5] hover:text-rose-400 flex items-center justify-center transition-all duration-200 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 cursor-pointer"
              style={{ transitionDelay: "150ms" }}
              title="Delete File"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Leave Share Control (Recipient Self-Revoke) */}
          {isSharedView && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSelfRevoke(); }}
              disabled={isProcessing}
              className="h-8 px-3 rounded-lg bg-[#050d1a] border border-[#1a2a40] hover:border-rose-500 hover:bg-[#3b0f0f] text-rose-400 hover:text-rose-350 flex items-center justify-center gap-1.5 text-[11px] font-bold transition-all duration-200 transform translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 cursor-pointer disabled:opacity-50 border-none"
              style={{ transitionDelay: "150ms" }}
              title="Remove My Access"
            >
              {isProcessing && downloadProgress.includes("Revoking") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-400" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              <span>Leave</span>
            </button>
          )}
        </div>
      </div>

      {/* Download Progress Indicator (bottom border bar) */}
      {isProcessing && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#050d1a] rounded-b-2xl overflow-hidden z-20">
          <div 
            className={`h-full bg-gradient-to-r from-[#0ea5e9] to-[#22d3ee] transition-all duration-200 ease-out ${
              downloadPercent === 0 ? "w-full animate-pulse" : ""
            }`}
            style={{ width: downloadPercent > 0 ? `${downloadPercent}%` : "100%" }}
          />
        </div>
      )}
    </div>
  );
}
