"use client";

import React, { useState, useEffect } from "react";
import { useWeb3 } from "../hooks/useWeb3.js";
import { useAuth } from "../hooks/useAuth.js";
import { X, Send, Coins, ShieldCheck, Loader2 } from "lucide-react";
import axios from "axios";
import { API_URL } from "../utils/config.js";
import { extractFileKeyBytes, encryptFileKeyWithRSA, decryptFileKeyWithRSA } from "../utils/crypto.js";
import { ethers } from "ethers";

export default function ShareModal({ isOpen, onClose, file, onShareSuccess }) {
  const [targetAddress, setTargetAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0.00");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [resolvedAddress, setResolvedAddress] = useState("");
  const [isResolvingEns, setIsResolvingEns] = useState(false);

  const { shareFileOnChain, estimateGasFees } = useWeb3();
  const { logActivity, masterSeed, user } = useAuth();

  useEffect(() => {
    if (!isOpen || !file) return;
    
    // Estimate share gas fees
    const estimateShareGas = async () => {
      try {
        const dummyAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // standard dummy signer address
        const est = await estimateGasFees("shareFile", Number(file.id), dummyAddress);
        setEstimatedGas(est);
      } catch (e) {
        console.warn("Could not estimate share gas fees:", e);
      }
    };
    estimateShareGas();
    
    // Reset state
    setTargetAddress("");
    setResolvedAddress("");
    setIsResolvingEns(false);
    setErrorMessage("");
    setSuccessMessage("");
  }, [isOpen, file, estimateGasFees]);

  // Resolve ENS name if targetAddress matches the pattern
  useEffect(() => {
    const resolveInput = async () => {
      setErrorMessage("");
      setResolvedAddress("");
      
      const input = targetAddress.trim();
      if (!input) return;

      if (input.toLowerCase().endsWith(".eth")) {
        setIsResolvingEns(true);
        try {
          if (typeof window !== "undefined" && window.ethereum) {
            const provider = new ethers.BrowserProvider(window.ethereum);
            console.log(`🔍 [ENS] Resolving ENS name: ${input}...`);
            const address = await provider.resolveName(input);
            if (address) {
              setResolvedAddress(address);
              console.log(`✅ [ENS] Resolved ${input} to: ${address}`);
            } else {
              setErrorMessage("Invalid ENS name or address.");
            }
          } else {
            setErrorMessage("Ethereum provider not found.");
          }
        } catch (e) {
          console.error("ENS Resolution Error:", e);
          setErrorMessage("Failed to resolve ENS name.");
        }
        setIsResolvingEns(false);
      } else if (input.startsWith("0x") && input.length === 42) {
        // Direct address
        setResolvedAddress(input);
      }
    };

    const timer = setTimeout(() => {
      resolveInput();
    }, 500);

    return () => clearTimeout(timer);
  }, [targetAddress]);

  if (!isOpen || !file) return null;

  const handleShare = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (isResolvingEns) {
      setErrorMessage("Please wait for ENS resolution to complete.");
      return;
    }

    if (!resolvedAddress) {
      setErrorMessage("Invalid ENS name or address.");
      return;
    }

    const normalizedTarget = resolvedAddress.toLowerCase().trim();
    const ownerAddress = user?.walletAddress?.toLowerCase();

    // Prevent sharing with oneself
    if (ownerAddress && normalizedTarget === ownerAddress) {
      setErrorMessage("You cannot share a file with your own wallet address.");
      return;
    }

    setIsProcessing(true);

    try {
      // 1. Fetch recipient public encryption key from backend registry
      console.log(`📡 [KeyExchange] Fetching public key for recipient: ${normalizedTarget}...`);
      let recipientPubKey = null;
      try {
        const pkResponse = await axios.get(`${API_URL}/auth/public-key/${normalizedTarget}`);
        recipientPubKey = pkResponse.data.publicKey;
      } catch (err) {
        throw new Error(err.response?.data?.message || "Recipient has not registered their encryption key yet. Tell them to sign in to Munawar's Drive at least once!");
      }

      // 2. Decrypt symmetric file key locally using owner's keys
      console.log("🔒 [KeyExchange] Extracting raw symmetric key of the file...");
      let rawFileKey;
      const isRsaEncrypted = file.encryptedKey.length > 200;
      
      if (isRsaEncrypted) {
        const rsaPrivateKeyJson = localStorage.getItem("w3d_rsa_private_key");
        if (!rsaPrivateKeyJson) {
          throw new Error("Local RSA Private Key not found in browser storage. Please log in again.");
        }
        rawFileKey = await decryptFileKeyWithRSA(file.encryptedKey, rsaPrivateKeyJson);
      } else {
        if (!masterSeed) {
          throw new Error("Owner's Master Seed not found. Please log in again.");
        }
        rawFileKey = await extractFileKeyBytes(file.encryptedKey, masterSeed);
      }

      // 3. Encrypt the file key using recipient's public key (RSA-OAEP)
      console.log("🔒 [KeyExchange] Encrypting file key with recipient's public RSA key...");
      const recipientEncryptedKey = await encryptFileKeyWithRSA(rawFileKey, recipientPubKey);

      // 4. Register the encrypted key mapping in the backend database
      console.log("📡 [KeyExchange] Registering encrypted key mapping in database...");
      await axios.post(`${API_URL}/ipfs/share-key`, {
        fileId: Number(file.id),
        recipientAddress: normalizedTarget,
        encryptedKey: recipientEncryptedKey
      });

      // 5. Fire blockchain transaction to record the permission in the on-chain ACL
      console.log(`⛓️ [KeyExchange] Registering share permission on-chain: File ${file.fileName} -> Wallet ${normalizedTarget}...`);
      const receipt = await shareFileOnChain(Number(file.id), normalizedTarget);
      
      console.log("🎉 Share transaction confirmed:", receipt.hash);
      setSuccessMessage(`Access successfully granted to: ${targetAddress.slice(0,6)}...${targetAddress.slice(-4)}`);
      
      // Log event
      await logActivity(
        "FILE_SHARE",
        `Shared file ${file.fileName} with wallet: ${normalizedTarget}`,
        file.fileName,
        Number(file.fileSize),
        receipt.hash
      );

      if (onShareSuccess) {
        onShareSuccess();
      }

      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (err) {
      console.error("Failed to share file:", err);
      setErrorMessage(err.message || "On-chain transaction failed. Ensure the address is correct and is not yourself.");
    }
    
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-md rounded-2xl overflow-hidden glow-border p-6">
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-100">Share Access Control</h3>
            <p className="text-xs text-slate-500 mt-0.5">Authorize specific wallets to decrypt this private file.</p>
          </div>
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer border border-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Success View */}
        {successMessage ? (
          <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-xl p-6 flex flex-col items-center text-center my-4">
            <ShieldCheck className="h-10 w-10 text-emerald-400 mb-2" />
            <h4 className="text-sm font-bold text-slate-200">Vault Access Authorized!</h4>
            <p className="text-xs text-slate-400 mt-2">
              {successMessage}
            </p>
          </div>
        ) : (
          <form onSubmit={handleShare} className="space-y-4">
            {/* Target Input */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">
                Target Wallet Address or ENS Name
              </label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="0x... or name.eth"
                className="w-full glass-input font-mono"
                disabled={isProcessing}
                required
              />
              {isResolvingEns && (
                <div className="text-[10px] text-cyan-400 font-mono flex items-center gap-1.5 animate-pulse mt-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Resolving ENS name...</span>
                </div>
              )}
              {!isResolvingEns && resolvedAddress && targetAddress.toLowerCase().endsWith(".eth") && (
                <div className="text-[10px] text-emerald-400 font-mono mt-1 bg-slate-950/60 p-2 rounded border border-emerald-500/10 truncate">
                  🟢 Resolved: {resolvedAddress}
                </div>
              )}
            </div>

            {/* Warning description */}
            <p className="text-[11px] text-slate-500 leading-normal bg-slate-950/40 p-3 rounded-lg border border-slate-900">
              💡 <b>Decentralized Security Note:</b> This operation records the access permissions on the blockchain. The shared user will download the encrypted document from IPFS and decrypt it client-side.
            </p>

            {/* Gas fee cost estimation */}
            <div className="p-3.5 rounded-lg bg-slate-900/30 border border-slate-800/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-400 font-medium">
                <Coins className="h-3.5 w-3.5 text-violet-400 animate-pulse" />
                <span>Gas Estimation:</span>
              </div>
              <span className="font-mono text-slate-300 font-semibold">~{estimatedGas} ETH</span>
            </div>

            {/* Error notifications */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs leading-normal">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex gap-3 border-t border-slate-900/60 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 glass-btn-secondary py-2.5 text-xs"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing}
                className="flex-1 glass-btn-primary py-2.5 text-xs font-bold shadow-lg shadow-violet-600/10 cursor-pointer"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Broadcasting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <Send className="h-3 w-3" />
                    Confirm Share
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
