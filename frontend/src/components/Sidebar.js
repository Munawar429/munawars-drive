"use client";

import React from "react";
import { 
  Folder, 
  Share2, 
  ShieldCheck, 
  KeyRound, 
  Activity, 
  LogOut, 
  Wallet,
  HardDrive
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { formatAddress } from "../utils/helpers.js";

export default function Sidebar({ activeTab, setActiveTab }) {
  const { logout, user, authType } = useAuth();

  const menuItems = [
    { id: "drive", label: "My Drive", icon: HardDrive },
    { id: "shared", label: "Shared with Me", icon: Share2 },
    { id: "verify", label: "Integrity Checker", icon: ShieldCheck },
    { id: "vault", label: "Secure Key Vault", icon: KeyRound },
    { id: "logs", label: "Activity Audit Logs", icon: Activity },
  ];

  return (
    <div className="w-72 border-r border-slate-800/80 bg-slate-950/40 backdrop-blur-xl flex flex-col h-screen overflow-hidden">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-900 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
          <Folder className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-300 to-white bg-clip-text text-transparent">
            Munawar's Drive
          </h1>
          <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">
            Decentralized
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-medium text-sm transition-all duration-300 ${
                isActive
                  ? "bg-gradient-to-r from-cyan-500/10 to-blue-600/5 text-cyan-300 border border-cyan-400/20 shadow-md shadow-cyan-500/5"
                  : "text-slate-400 border border-transparent hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer Profile */}
      <div className="p-4 border-t border-slate-900 bg-slate-950/20">
        <div className="p-3.5 rounded-xl bg-slate-900/30 border border-slate-800/40 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700/50">
              {authType === "wallet" ? (
                <Wallet className="h-4 w-4 text-cyan-400" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 font-medium truncate uppercase tracking-wider">
                {authType === "wallet" ? "Web3 Wallet" : "Authenticated Session"}
              </p>
              <p className="text-sm font-semibold text-slate-300 truncate font-mono">
                {authType === "wallet" 
                  ? formatAddress(user?.walletAddress) 
                  : user?.email}
              </p>
            </div>
          </div>
          
          <button
            onClick={logout}
            className="w-full mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 text-xs font-semibold py-2 transition-all duration-300 cursor-pointer"
          >
            <LogOut className="h-3 w-3" />
            Disconnect Vault
          </button>
        </div>
      </div>
    </div>
  );
}
