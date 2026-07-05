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
    <header className="h-20 border-b border-[#1a2a40] bg-[#060f1e] flex items-center justify-between px-8 z-10">
      {/* Title */}
      <div className="flex items-center gap-3">
        {/* Brand Icon (Shield-Lock SVG) */}
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <rect x="9" y="11" width="6" height="4" rx="1"/>
          <path d="M10 11V9a2 2 0 0 1 4 0v2"/>
        </svg>
        <div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight leading-none mb-1">
            SevenSeas Drive
          </h2>
          <p className="text-xs text-[#4a7fa5] font-medium">
            Decentralized · Zero-knowledge · IPFS
          </p>
        </div>
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-4">
        {/* Network status pill badge next to wallet address */}
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-[20px] bg-[#0a1929] border border-[#1e3a5f] text-[11px] font-bold text-[#38bdf8] select-none">
            Sepolia Testnet
          </div>
        )}

        {/* Balance indicator */}
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0a1929] border border-[#1a2a40] text-xs font-semibold text-slate-350">
            <span className="text-slate-500 font-medium">Balance:</span>
            <span className="font-mono text-[#38bdf8]">{parseFloat(balance).toFixed(4)} ETH</span>
          </div>
        )}

        {/* Wallet Connector */}
        {authType === "wallet" || isConnected ? (
          <button
            onClick={handleCopyAddress}
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#0a1929] hover:bg-[#0d1f33] border border-[#1a2a40] hover:border-[#38bdf8]/40 text-sm font-semibold text-slate-200 shadow-sm transition-all duration-200 cursor-pointer text-left"
            title="Click to copy full wallet address"
          >
            {renderProfilePicture()}
            <span className="h-2 w-2 rounded-full bg-[#22d3ee] shadow-[0_0_8px_#22d3ee] shrink-0 animate-pulse" />
            <span className="font-mono text-slate-305">{ensName || formatAddress(walletAddress || user?.walletAddress)}</span>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-450 animate-pulse" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[#4a7fa5] hover:text-[#22d3ee] transition-colors" />
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
