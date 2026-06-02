"use client";

import React from "react";
import { useWeb3 } from "../hooks/useWeb3.js";
import { useAuth } from "../hooks/useAuth.js";
import { formatAddress } from "../utils/helpers.js";
import { 
  Wallet, 
  Activity, 
  HelpCircle,
  Link2
} from "lucide-react";

export default function Navbar({ activeTab }) {
  const { 
    walletAddress, 
    isConnected, 
    isConnecting, 
    balance, 
    networkName, 
    connectWallet 
  } = useWeb3();
  
  const { authType, user } = useAuth();

  const getTitle = () => {
    switch (activeTab) {
      case "drive":
        return "Personal Drive";
      case "shared":
        return "Shared Workspace";
      case "verify":
        return "Integrity Verification Vault";
      case "vault":
        return "Secure Cryptographic Key Vault";
      case "logs":
        return "Security Audit Ledger";
      default:
        return "Dashboard";
    }
  };

  return (
    <header className="h-20 border-b border-slate-900 bg-slate-950/20 backdrop-blur-md flex items-center justify-between px-8 z-10">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 tracking-tight">
          {getTitle()}
        </h2>
        <p className="text-xs text-slate-400 font-medium">
          Decentralized file indexing & end-to-end cryptographic shielding.
        </p>
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-4">
        {/* Network status */}
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-800 text-xs font-semibold text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 ring-2 ring-cyan-400/20 animate-pulse" />
            <span className="font-mono text-slate-300">{networkName}</span>
          </div>
        )}

        {/* Balance indicator */}
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/50 border border-slate-800 text-xs font-semibold text-slate-300">
            <span className="text-slate-500 font-medium">Balance:</span>
            <span className="font-mono text-cyan-400">{parseFloat(balance).toFixed(4)} ETH</span>
          </div>
        )}

        {/* Wallet Connector */}
        {authType === "wallet" || isConnected ? (
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm font-semibold text-slate-200 shadow-sm">
            <Wallet className="h-4 w-4 text-cyan-400" />
            <span className="font-mono">{formatAddress(walletAddress || user?.walletAddress)}</span>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:opacity-90 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer ring-pulse-cyan border-none"
          >
            <Wallet className="h-4 w-4" />
            {isConnecting ? "Linking Wallet..." : "Connect MetaMask"}
          </button>
        )}
      </div>
    </header>
  );
}
