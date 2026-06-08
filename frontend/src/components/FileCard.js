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
  LogOut
} from "lucide-react";

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

  const { logActivity, masterSeed } = useAuth();
  const { 
    deleteFileOnChain, 
    toggleVisibilityOnChain, 
    revokeAccessOnChain, 
    walletAddress 
  } = useWeb3();

  // 1. Decrypted Download Flow
  const handleDownload = async () => {
    setDownloadProgress("Fetching IPFS...");
    setIsProcessing(true);
    try {
      console.log(`📥 Downloading file '${fileName}' (${ipfsHash}) from IPFS...`);
      
      const response = await axios.get(`${API_URL}/ipfs/download/${ipfsHash}`, {
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setDownloadProgress(`Fetching: ${percentCompleted}%`);
        }
      });

      setDownloadProgress("Decrypting locally...");
      const encryptedBuffer = response.data;
      let plaintextBuffer;

      const isRsaEncrypted = encryptedKey.length > 200;

      if (isRsaEncrypted) {
        const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
        if (!rsaPrivateKeyJson) {
          throw new Error("Local RSA Private Key not found in browser storage. Please log in again.");
        }
        const fileKeyBytes = await decryptFileKeyWithRSA(encryptedKey, rsaPrivateKeyJson);
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
        plaintextBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
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

      const isRsaEncrypted = encryptedKey.length > 200;

      if (isRsaEncrypted) {
        const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
        if (!rsaPrivateKeyJson) {
          throw new Error("Local RSA Private Key not found. Please log in again.");
        }
        const fileKeyBytes = await decryptFileKeyWithRSA(encryptedKey, rsaPrivateKeyJson);
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
        plaintextBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
      }

      const blob = new Blob([plaintextBuffer], { type: fileType });
      const objectURL = window.URL.createObjectURL(blob);
      onPreview({
        fileName,
        fileType,
        objectURL
      });
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

      console.log(`📡 Cleaning up shared key record for ${walletAddress}...`);
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

  const fileMeta = getFileTypeMetadata(fileName, fileType);
  const FileIcon = fileMeta.icon;

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
            AES Shielded
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
            <Globe className="h-2.5 w-2.5" />
            Public
          </span>
        )}
      </div>

      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={(e) => { e.stopPropagation(); !isSharedView && handleToggleVisibility(); }}
          className={`h-6.5 px-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
            isSharedView
              ? "bg-slate-950/40 border-slate-900 text-slate-500 cursor-not-allowed"
              : isPublic
              ? "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-400 cursor-pointer"
              : "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 cursor-pointer"
          }`}
          disabled={isSharedView || isProcessing}
          title={isSharedView ? "Shared file visibility cannot be modified" : "Click to change visibility"}
        >
          {isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          <span>{isPublic ? "Public" : "Private"}</span>
        </button>
      </div>

      {/* Main File Icon & Title */}
      <div className="flex-1 flex flex-col items-center justify-center mt-6">
        <div className={`p-4.5 rounded-2xl bg-gradient-to-tr ${fileMeta.color} shadow-lg shadow-cyan-500/5`}>
          <FileIcon className="h-10 w-10 text-white" />
        </div>
        <h4 className="mt-3.5 text-sm font-bold text-slate-100 max-w-[200px] truncate text-center" title={fileName}>
          {fileName}
        </h4>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500 font-mono">
          <span>{formatBytes(fileSize)}</span>
          <span className="text-slate-700">•</span>
          <span>{formatDate(timestamp)}</span>
        </div>
      </div>

      {/* Action Overlay & Metadata Controls */}
      <div className="border-t border-slate-900/60 pt-4 mt-2 overflow-hidden relative min-h-11">
        
        {/* State A: Copy Bar (Resting) */}
        <div className="flex items-center justify-between transition-all duration-300 group-hover:translate-y-12">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-[10px] text-slate-500 font-mono">
              CID: {ipfsHash ? `${ipfsHash.slice(0, 6)}...${ipfsHash.slice(-6)}` : "None"}
            </span>
          </div>
          <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded bg-slate-950/80 border border-slate-900 text-slate-500">
            Etherscan Index
          </span>
        </div>

        {/* State B: Buttons Overlay (Group Hover) */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 transition-all duration-300 translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 bg-[#0c1020]/95">
          
          {/* Preview Button */}
          {fileMeta.previewable && (
            <button
              onClick={(e) => { e.stopPropagation(); handlePreviewTrigger(); }}
              disabled={isProcessing}
              className="h-9 w-9 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-slate-355 hover:text-cyan-400 flex items-center justify-center transition-all duration-300 cursor-pointer"
              title="Quick Preview Decrypted"
            >
              {isProcessing && downloadProgress.includes("Preview") ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
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

          {/* Leave Share Control (Recipient Self-Revoke) */}
          {isSharedView && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSelfRevoke(); }}
              disabled={isProcessing}
              className="h-9 px-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/50 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 flex items-center justify-center gap-1.5 text-xs font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 border-none"
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
    </div>
  );
}
