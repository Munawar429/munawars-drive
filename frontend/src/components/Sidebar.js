"use client";

import React, { useState, useEffect } from "react";
import { 
  Folder, 
  Share2, 
  ShieldCheck, 
  KeyRound, 
  Activity, 
  LogOut, 
  Wallet,
  HardDrive,
  Users
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { useWeb3 } from "../hooks/useWeb3.js";
import { formatAddress } from "../utils/helpers.js";

export default function Sidebar({ activeTab, setActiveTab }) {
  const { logout, user, authType } = useAuth();
  const { getMyFilesFromChain, getSharedFilesFromChain, isConnected } = useWeb3();

  const [filesCount, setFilesCount] = useState(0);
  const [sharedFilesCount, setSharedFilesCount] = useState(0);
  const [storageUsed, setStorageUsed] = useState(null); // in bytes

  useEffect(() => {
    const fetchCountsAndStorage = async () => {
      if (!isConnected) return;
      try {
        const myFiles = await getMyFilesFromChain();
        const myFilesCount = myFiles ? myFiles.length : 0;
        setFilesCount(myFilesCount);

        const sharedWithMe = await getSharedFilesFromChain();
        setSharedFilesCount(sharedWithMe ? sharedWithMe.length : 0);

        let totalSize = 0;
        if (myFiles) {
          myFiles.forEach((f) => {
            totalSize += Number(f.fileSize || 0);
          });
        }
        setStorageUsed(totalSize);
      } catch (e) {
        console.warn("Failed to fetch count details for sidebar:", e);
      }
    };

    fetchCountsAndStorage();
  }, [isConnected, getMyFilesFromChain, getSharedFilesFromChain]);

  const formatGB = (bytes) => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb.toFixed(2);
  };

  const totalStorage = 5 * 1024 * 1024 * 1024; // 5 GB
  const usedPercent = storageUsed !== null 
    ? Math.min(100, Math.round((storageUsed / totalStorage) * 100))
    : 36; // fallback 36% (representing 1.8 GB)

  const menuItems = [
    { id: "drive", label: "My Drive", icon: HardDrive },
    { id: "shared", label: "Shared with Me", icon: Share2 },
    { id: "shares-list", label: "Shared Access", icon: Users },
    { id: "verify", label: "Integrity Checker", icon: ShieldCheck },
    { id: "vault", label: "Secure Key Vault", icon: KeyRound },
    { id: "logs", label: "Activity Audit Logs", icon: Activity },
  ];

  const renderBadge = (id) => {
    if (id === "drive") {
      return (
        <span className="text-[10px] py-[2px] px-[7px] rounded-[20px] font-medium bg-[#0c2a44] text-[#38bdf8] border-[0.5px] border-[#1e4976] transition-colors duration-200">
          {filesCount}
        </span>
      );
    }
    if (id === "shared") {
      return (
        <span className="text-[10px] py-[2px] px-[7px] rounded-[20px] font-medium bg-[#042f2e] text-[#2dd4bf] border-[0.5px] border-[#0f6e56] transition-colors duration-200">
          {sharedFilesCount}
        </span>
      );
    }
    if (id === "verify") {
      return (
        <span className="text-[10px] py-[2px] px-[7px] rounded-[20px] font-medium bg-[#1e1b4b] text-[#a78bfa] border-[0.5px] border-[#3730a3] transition-colors duration-200">
          New
        </span>
      );
    }
    return null;
  };

  const renderNavItem = (id) => {
    const item = menuItems.find((x) => x.id === id);
    if (!item) return null;
    const Icon = item.icon;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`w-full group relative flex items-center gap-[11px] p-[10px] px-[12px] rounded-[9px] border-[0.5px] transition-all duration-[180ms] cursor-pointer ${
          isActive
            ? "bg-[#0c2a44] border-[#1e4976] before:absolute before:left-0 before:top-[20%] before:bottom-[20%] before:w-[3px] before:bg-[#0ea5e9] before:rounded-[0_3px_3px_0] before:content-['']"
            : "border-transparent hover:bg-[#0a1929] hover:border-[#1a2a40]"
        }`}
      >
        <div
          className={`w-[32px] h-[32px] rounded-[8px] flex items-center justify-center text-[15px] shrink-0 transition-all duration-[180ms] ${
            isActive
              ? "bg-[#0ea5e9] text-white"
              : "bg-[#0a1929] text-[#4a7fa5] group-hover:bg-[#0d1f33] group-hover:text-[#7ab3d4]"
          }`}
        >
          <Icon className="h-[16px] w-[16px]" />
        </div>
        <span
          className={`text-[13.5px] font-medium flex-1 text-left transition-colors duration-[180ms] ${
            isActive
              ? "text-[#cee9ff]"
              : "text-[#4a7fa5] group-hover:text-[#7ab3d4]"
          }`}
        >
          {item.label}
        </span>
        {renderBadge(item.id)}
      </button>
    );
  };

  return (
    <div className="w-72 bg-[#060f1e] border-r-[0.5px] border-[#1a2a40] p-[20px] px-[12px] flex flex-col gap-[4px] h-screen overflow-hidden">
      {/* Brand Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-[#0c2a44] border-[0.5px] border-[#1e3a5f] flex items-center justify-center shadow-lg shadow-[#0ea5e9]/10">
          <Folder className="h-5 w-5 text-[#22d3ee]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Munawar's Drive
          </h1>
          <span className="text-[10px] text-[#22d3ee] font-mono tracking-widest uppercase">
            Decentralized
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto flex flex-col gap-[4px] px-1 py-4">
        {/* Section 1: MAIN */}
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[8px] mb-[6px]">
          MAIN
        </div>
        {renderNavItem("drive")}
        {renderNavItem("shared")}
        {renderNavItem("shares-list")}

        {/* Divider & Section 2: SECURITY */}
        <div className="h-[0.5px] bg-[#1a2a40] my-[10px] mx-[4px]" />
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[8px] mb-[6px]">
          SECURITY
        </div>
        {renderNavItem("verify")}
        {renderNavItem("vault")}

        {/* Divider & Section 3: LOGS */}
        <div className="h-[0.5px] bg-[#1a2a40] my-[10px] mx-[4px]" />
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[8px] mb-[6px]">
          LOGS
        </div>
        {renderNavItem("logs")}
      </nav>

      {/* Footer Profile */}
      <div className="pt-4 border-t-[0.5px] border-[#1a2a40] bg-[#060f1e]/40 shrink-0">
        <div className="p-3.5 rounded-xl bg-[#0a1929] border-[0.5px] border-[#1a2a40]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0c2a44] border-[0.5px] border-[#1e3a5f] flex items-center justify-center shrink-0">
              {authType === "wallet" ? (
                <Wallet className="h-4 w-4 text-[#38bdf8]" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#4a7fa5] font-medium truncate uppercase tracking-wider">
                {authType === "wallet" ? "Web3 Wallet" : "Authenticated Session"}
              </p>
              <p className="text-sm font-semibold text-slate-350 truncate font-mono">
                {authType === "wallet" 
                  ? formatAddress(user?.walletAddress) 
                  : user?.email}
              </p>
            </div>
          </div>
          
          <button
            onClick={logout}
            className="w-full mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 border-[0.5px] border-rose-500/20 hover:border-rose-500/30 text-rose-400 text-xs font-semibold py-2 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            Disconnect Vault
          </button>
        </div>
      </div>
    </div>
  );
}
