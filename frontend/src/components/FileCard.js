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
  ChevronDown
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
          console.log("🔒 Decrypting file client-side using Owner's Web Crypto AES-GCM...");
          if (!masterSeed) {
            throw new Error("Vault Master Seed not found. Please log in again.");
          }
          finalBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
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
          
          // 2. Fetch RSA private key from sessionStorage
          const rsaPrivateKeyJson = sessionStorage.getItem("w3d_rsa_private_key");
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
          console.log("🔒 Decrypting file client-side using Owner's Web Crypto AES-GCM...");
          if (!masterSeed) throw new Error("Vault Master Seed missing.");
          finalBuffer = await decryptFileClientSide(encryptedBuffer, encryptedKey, masterSeed);
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
          
          // 2. Fetch RSA private key
          const rsaPrivateKeyJson = sessionStorage.getItem("w3d_rsa_private_key");
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
    <div className="glass-card glass-card-hover relative group flex flex-col justify-between h-64 overflow-hidden select-none p-5 text-center">
      {/* Floating Badges */}
      <div className="absolute top-3.5 left-3.5 z-20">
        {encryptedKey && encryptedKey !== "unencrypted" ? (
          <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Lock className="h-2.5 w-2.5" />
            AES-GCM
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 font-mono">
            Plain
          </span>
        )}
      </div>
      
      <div className="absolute top-3.5 right-3.5 z-20">
        {isPublic ? (
          <span className="h-5 w-5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center" title="Publicly accessible">
            <Globe className="h-2.5 w-2.5" />
          </span>
        ) : (
          <span className="h-5 w-5 rounded bg-slate-800 border border-slate-700 text-slate-500 flex items-center justify-center" title="Private">
            <Lock className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      {/* Card Content - Centered */}
      <div className="mt-4 flex flex-col items-center">
        {/* Large File Type Icon (glowing cyan effect) */}
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center border border-slate-800/80 bg-slate-950/40 shadow-md mb-2.5 transition-transform duration-300 group-hover:scale-105">
          <FileIcon className="h-7 w-7 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.55)]" />
        </div>
        
        <h4 className="text-sm font-bold text-slate-200 truncate w-full max-w-[170px] group-hover:text-cyan-300 transition-colors text-center" title={fileName}>
          {fileName}
        </h4>
        <span className="text-[10px] text-slate-400 font-mono text-center mt-0.5 block">
          {formatBytes(fileSize)}
        </span>

        {/* IPFS Hash Badge */}
        <span className="bg-slate-950/45 border border-slate-800/70 rounded-lg px-2.5 py-0.5 text-slate-500 text-[9px] font-mono text-center select-all cursor-pointer mt-2 block w-fit max-w-[150px] truncate hover:text-slate-400 transition-colors" title={ipfsHash}>
          {ipfsHash.slice(0, 8)}...{ipfsHash.slice(-6)}
        </span>
      </div>

      {/* Footer Controls & Download */}
      <div className="mt-3 flex flex-col gap-2">
        {/* Quick actions bar (Share, Toggle visibility, Delete, Preview) */}
        <div className="flex items-center justify-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
          {/* Preview button */}
          {["Image", "Document", "Code"].includes(category) && (
            <button
              onClick={handlePreview}
              disabled={isProcessing}
              className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 hover:bg-slate-900 text-slate-400 hover:text-cyan-400 flex items-center justify-center transition-all cursor-pointer"
              title="Decrypt & Preview"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Share Control */}
          {!isSharedView && (
            <button
              onClick={() => onShare && onShare(file)}
              className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 hover:bg-slate-900 text-slate-400 hover:text-indigo-400 flex items-center justify-center transition-all cursor-pointer"
              title="Share Key Access"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Visibility Toggle */}
          {!isSharedView && (
            <button
              onClick={handleToggleVisibility}
              disabled={isProcessing}
              className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 hover:bg-slate-900 text-slate-400 hover:text-amber-400 flex items-center justify-center transition-all cursor-pointer"
              title={isPublic ? "Make Private" : "Make Public"}
            >
              {isPublic ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Globe className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Delete Control */}
          {!isSharedView && (
            <button
              onClick={handleDelete}
              disabled={isProcessing}
              className="h-7 w-7 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-400/40 hover:bg-slate-900 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-all cursor-pointer"
              title="Delete record"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Shifting Gradient Decrypt & Download button */}
        <button
          onClick={handleDownload}
          disabled={isProcessing}
          className="w-full h-8.5 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-600 hover:opacity-90 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow shadow-cyan-500/10 cursor-pointer border-none transition-all active:scale-[0.98]"
        >
          {isProcessing && downloadProgress ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
              <span className="truncate max-w-[120px]">{downloadProgress}</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 text-white" />
              <span>Decrypt & Download</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
