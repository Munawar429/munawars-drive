"use client";

import React, { useState, useEffect } from "react";
import { useWeb3 } from "../hooks/useWeb3.js";
import { useAuth } from "../hooks/useAuth.js";
import { X, Send, Coins, ShieldCheck, Loader2 } from "lucide-react";

export default function ShareModal({ isOpen, onClose, file, onShareSuccess }) {
  const [targetAddress, setTargetAddress] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState("0.00");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const { shareFileOnChain, estimateGasFees } = useWeb3();
  const { logActivity } = useAuth();

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
    setErrorMessage("");
    setSuccessMessage("");
  }, [isOpen, file, estimateGasFees]);

  if (!isOpen || !file) return null;

  const handleShare = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    // Validate address format
    if (!targetAddress.startsWith("0x") || targetAddress.length !== 42) {
      setErrorMessage("Please enter a valid 42-character Ethereum wallet address (0x...)");
      return;
    }

    setIsProcessing(true);

    try {
      console.log(`⛓️ Registering share permission on-chain: File ${file.fileName} -> Wallet ${targetAddress}...`);
      
      const receipt = await shareFileOnChain(Number(file.id), targetAddress.toLowerCase());
      
      console.log("🎉 Share transaction confirmed:", receipt.hash);
      setSuccessMessage(`Access successfully granted to: ${targetAddress.slice(0,6)}...${targetAddress.slice(-4)}`);
      
      // Log event
      await logActivity(
        "FILE_SHARE",
        `Shared file ${file.fileName} with wallet: ${targetAddress.toLowerCase()}`,
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
                Target Wallet Address
              </label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                placeholder="0x..."
                className="w-full glass-input"
                disabled={isProcessing}
                required
              />
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
