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
  Users,
  Shield
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
    <div className="w-72 bg-[#060f1e] border-r-[0.5px] border-[#1a2a40] p-[20px] px-[12px] flex flex-col h-screen overflow-hidden">
      {/* Brand Header */}
      <div className="flex items-center gap-[12px] pb-[20px] border-b-[0.5px] border-[#1a2a40] mb-[16px]">
        <div className="w-[40px] h-[40px] rounded-[10px] bg-gradient-to-br from-[#0ea5e9] to-[#22d3ee] flex items-center justify-center text-white shrink-0">
          <Shield className="h-[20px] w-[20px]" />
        </div>
        <div>
          <h1 className="text-[16px] font-semibold text-[#e2f0ff] leading-none">
            Munawar's Drive
          </h1>
          <div className="flex items-center gap-[5px] mt-[6px]">
            <span className="h-[5px] w-[5px] rounded-full bg-[#22d3ee] shrink-0" />
            <span className="text-[10px] text-[#22d3ee] font-mono tracking-[0.1em] uppercase font-semibold">
              DECENTRALIZED
            </span>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="overflow-y-auto flex flex-col gap-[4px] px-1">
        {/* Section 1: MAIN */}
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[10px] mb-[5px]">
          MAIN
        </div>
        {renderNavItem("drive")}
        {renderNavItem("shared")}
        {renderNavItem("shares-list")}

        {/* Divider & Section 2: SECURITY */}
        <div className="h-[0.5px] bg-[#1a2a40] my-[10px] mx-[4px]" />
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[10px] mb-[5px]">
          SECURITY
        </div>
        {renderNavItem("verify")}
        {renderNavItem("vault")}

        {/* Divider & Section 3: LOGS */}
        <div className="h-[0.5px] bg-[#1a2a40] my-[10px] mx-[4px]" />
        <div className="text-[10px] font-medium text-[#2e4a66] tracking-[0.1em] uppercase px-[10px] mt-[10px] mb-[5px]">
          LOGS
        </div>
        {renderNavItem("logs")}
      </nav>

      {/* Spacer to push wallet card to bottom */}
      <div className="flex-1" />

      {/* Wallet Card */}
      <div className="bg-[#0a1929] border-[0.5px] border-[#1a2a40] rounded-[12px] p-[14px] mt-[12px] shrink-0">
        <div className="flex items-center gap-[10px] mb-[12px]">
          <div className="w-[36px] h-[36px] rounded-[9px] bg-[#0c2a44] border-[0.5px] border-[#1e4976] flex items-center justify-center shrink-0">
            <Wallet className="h-[17px] w-[17px] text-[#38bdf8]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-[#4a7fa5] tracking-[0.08em] uppercase mb-[3px] font-medium">
              {authType === "wallet" ? "WEB3 WALLET" : "SESSION"}
            </p>
            <p className="text-[13px] font-medium text-[#cee9ff] font-mono truncate">
              {authType === "wallet" 
                ? formatAddress(user?.walletAddress) 
                : user?.email}
            </p>
          </div>
          <div className="flex items-center gap-[5px] shrink-0">
            <span className="h-[6px] w-[6px] rounded-full bg-[#22d3ee] animate-pulse" />
            <span className="text-[11px] text-[#2dd4bf] font-medium">Live</span>
          </div>
        </div>
        
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-[7px] bg-[#1a0a0a] border-[0.5px] border-[#4b1c1c] rounded-[8px] p-[9px] text-[12px] font-medium text-[#f87171] hover:bg-[#2a0f0f] hover:border-[#f87171] transition-all duration-[180ms] cursor-pointer"
        >
          <LogOut className="h-[14px] w-[14px]" />
          <span>Disconnect Vault</span>
        </button>
      </div>
    </div>
  );
}
