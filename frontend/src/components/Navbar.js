"use client";

import React from "react";
import { useWeb3 } from "../hooks/useWeb3.js";
import { useAuth } from "../hooks/useAuth.js";
import { formatAddress } from "../utils/helpers.js";
import { ethers } from "ethers";
import { 
  Wallet, 
  Activity, 
  HelpCircle,
  Link2,
  Copy,
  Check
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

  const [copied, setCopied] = React.useState(false);

  const handleCopyAddress = () => {
    const addr = walletAddress || user?.walletAddress;
    if (addr) {
      navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const [ensName, setEnsName] = React.useState("");
  const [ensAvatar, setEnsAvatar] = React.useState("");

  React.useEffect(() => {
    const resolveENS = async () => {
      const address = walletAddress || user?.walletAddress;
      if (!address || typeof window === "undefined" || !window.ethereum) {
        setEnsName("");
        setEnsAvatar("");
        return;
      }
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const name = await provider.lookupAddress(address);
        if (name) {
          setEnsName(name);
          try {
            const avatar = await provider.getAvatar(name);
            if (avatar) {
              setEnsAvatar(avatar);
            } else {
              setEnsAvatar("");
            }
          } catch (avatarErr) {
            console.warn("Failed to fetch ENS avatar:", avatarErr);
            setEnsAvatar("");
          }
        } else {
          setEnsName("");
          setEnsAvatar("");
        }
      } catch (e) {
        console.warn("Reverse ENS resolution failed:", e);
        setEnsName("");
        setEnsAvatar("");
      }
    };
    resolveENS();
  }, [walletAddress, user?.walletAddress]);

  // Default gradient blockie / profile placeholder
  const renderProfilePicture = () => {
    if (ensAvatar) {
      return (
        <img 
          src={ensAvatar} 
          alt="ENS Avatar" 
          className="h-6 w-6 rounded-full object-cover border border-cyan-500/30"
        />
      );
    }
    const addr = walletAddress || user?.walletAddress || "0x0000000000000000000000000000000000000000";
    const colors = [
      "from-cyan-500 to-blue-500",
      "from-indigo-500 to-purple-500",
      "from-blue-500 to-indigo-500",
      "from-cyan-400 to-indigo-600",
      "from-purple-500 to-pink-500"
    ];
    const hash = addr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const colorClass = colors[hash % colors.length];

    return (
      <div className={`h-6 w-6 rounded-full bg-gradient-to-br ${colorClass} border border-white/10`} />
    );
  };

  const getTitle = () => {
    switch (activeTab) {
      case "drive":
        return "Personal Drive";
      case "shared":
        return "Shared Workspace";
      case "shares-list":
        return "Shared Access Management";
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
          <button
            onClick={handleCopyAddress}
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-semibold text-slate-200 shadow-sm transition-all duration-200 cursor-pointer text-left"
            title="Click to copy full wallet address"
          >
            {renderProfilePicture()}
            <span className="font-mono">{ensName || formatAddress(walletAddress || user?.walletAddress)}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
            )}
          </button>
        ) : (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:opacity-90 shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all cursor-pointer ring-pulse-cyan border-none"
          >
            <Wallet className="h-4 w-4" />
            {isConnecting ? "Linking Wallet..." : "Connect Wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
