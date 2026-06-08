"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "../hooks/useAuth.js";
import { useWeb3 } from "../hooks/useWeb3.js";
import Sidebar from "../components/Sidebar.js";
import Navbar from "../components/Navbar.js";
import FileUpload from "../components/FileUpload.js";
import FileCard from "../components/FileCard.js";
import FilePreviewModal from "../components/FilePreviewModal.js";
import ShareModal from "../components/ShareModal.js";
import { computeFileHash } from "../utils/crypto.js";
import { formatBytes, formatDate } from "../utils/helpers.js";
import axios from "axios";
import { API_URL } from "../utils/config.js";
import { 
  Folder, 
  Search, 
  Grid, 
  List, 
  ShieldCheck, 
  ShieldAlert, 
  KeyRound, 
  FileText, 
  HelpCircle,
  Upload,
  UserCheck,
  Lock,
  Loader2,
  HardDrive,
  Copy,
  Eye,
  EyeOff,
  Clock,
  ExternalLink,
  ChevronRight,
  Share2,
  Shield,
  Globe
} from "lucide-react";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("drive");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  
  // Auth Form State
  const [formError, setFormError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // File Lists State
  const [files, setFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Share Modal State
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [selectedFileForShare, setSelectedFileForShare] = useState(null);

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewName, setPreviewName] = useState("");
  const [previewType, setPreviewType] = useState("");

  // Verification State
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyFileId, setVerifyFileId] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null); // { success: bool, owner: str, date: str }
  const [dragActiveVerify, setDragActiveVerify] = useState(false);

  // Vault Key View State
  const [showMasterSeed, setShowMasterSeed] = useState(false);

  // Activity Logs State
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Outbound Shares State
  const [allShares, setAllShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);

  const { 
    isAuthenticated, 
    user, 
    masterSeed, 
    authType, 
    loginWithWallet,
    logout,
    logActivity 
  } = useAuth();

  const { 
    isConnected, 
    connectWallet,
    walletAddress,
    networkName,
    getMyFilesFromChain, 
    getSharedFilesFromChain, 
    verifyFileIntegrityOnChain,
    revokeAccessOnChain,
    contract
  } = useWeb3();

  // Avoid Hydration SSR mismatches
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch all user file listings
  const fetchDashboardData = async () => {
    if (!isAuthenticated) return;
    setLoadingFiles(true);
    try {
      console.log("📡 Fetching drive records from blockchain ledger...");
      
      // Fetch owned files from smart contract on-chain!
      const myFiles = await getMyFilesFromChain();
      setFiles(myFiles);

      // Fetch shared files from smart contract on-chain!
      const sharedWithMe = await getSharedFilesFromChain();
      setSharedFiles(sharedWithMe);
    } catch (e) {
      console.error("Failed to load dashboard files:", e);
    }
    setLoadingFiles(false);
  };

  // Fetch Outbound Shares
  const fetchSharesData = async () => {
    if (!isAuthenticated) return;
    setLoadingShares(true);
    try {
      console.log("📡 Fetching outbound shares from database...");
      const res = await axios.get(`${API_URL}/ipfs/shares`);
      if (res.data && res.data.shares) {
        setAllShares(res.data.shares);
      }
    } catch (e) {
      console.error("Failed to load shares data:", e);
    }
    setLoadingShares(false);
  };

  // Fetch Activity Logs
  const fetchActivityLogs = async () => {
    if (!isAuthenticated) return;
    setLoadingLogs(true);
    try {
      const response = await axios.get(`${API_URL}/activity`);
      setActivityLogs(response.data.logs || []);
    } catch (e) {
      console.warn("Failed to fetch activity logs from API:", e);
    }
    setLoadingLogs(false);
  };

  // Dual-action refresh dashboard to handle blockchain transaction mining latency
  const refreshDashboard = () => {
    console.log("🔄 Refreshing dashboard state immediately...");
    fetchDashboardData();
    fetchActivityLogs();
    fetchSharesData();
    
    // Re-fetch 1.5s later to account for blockchain block mining lag
    setTimeout(() => {
      console.log("🔄 Running post-mining dashboard sync...");
      fetchDashboardData();
      fetchActivityLogs();
      fetchSharesData();
    }, 1500);
  };

  // Trigger data updates on tab switching, auth success, or wallet connection
  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === "drive" || activeTab === "shared") {
        fetchDashboardData();
      } else if (activeTab === "shares-list") {
        fetchSharesData();
      } else if (activeTab === "logs") {
        fetchActivityLogs();
      }
    }
  }, [isAuthenticated, activeTab, isConnected, contract]);

  // Initial Data fetch on auth or wallet connection
  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
      fetchActivityLogs();
      fetchSharesData();
    }
  }, [isAuthenticated, isConnected, contract]);

  // Handle outbound share revocation
  const handleRevokeShare = async (fileId, recipientAddress, ipfsHash, fileName, fileSize) => {
    if (!confirm(`Are you sure you want to revoke access to '${fileName}' for recipient ${recipientAddress}?`)) return;
    
    setLoadingShares(true);
    try {
      console.log(`⛓️ Revoking access to file ${fileName} (CID: ${ipfsHash}) for recipient ${recipientAddress}...`);
      
      // 1. Call on-chain revokeAccessOnChain (using useWeb3's hook)
      await revokeAccessOnChain(ipfsHash, recipientAddress);
      
      // 2. Call backend DELETE /api/ipfs/share-key/:fileId/:recipientAddress
      console.log(`📡 Removing key record from database...`);
      await axios.delete(`${API_URL}/ipfs/share-key/${fileId}/${recipientAddress}`);
      
      // 3. Log security activity
      logActivity(
        "REVOKE_ACCESS",
        `Revoked access to file ${fileName} from wallet: ${recipientAddress}`,
        fileName,
        Number(fileSize)
      );
      
      alert("Access successfully revoked!");
      refreshDashboard();
    } catch (e) {
      console.error("Failed to revoke access:", e);
      alert(`Revocation failed: ${e.message || e}`);
    }
    setLoadingShares(false);
  };

  if (!mounted) return null;

  // --------------------------------------------------
  // AUTHENTICATION AND SIGN-IN LAYOUT
  // --------------------------------------------------
  const handleWalletAuth = async () => {
    setFormError("");
    setAuthLoading(true);
    try {
      await loginWithWallet();
    } catch (err) {
      setFormError(err.message || "Web3 Wallet authorization failed.");
    }
    setAuthLoading(false);
  };

  // --------------------------------------------------
  // INTEGRITY CHECKING VERIFICATION FLOW
  // --------------------------------------------------
  const handleDragVerify = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActiveVerify(true);
    } else if (e.type === "dragleave") {
      setDragActiveVerify(false);
    }
  };

  const handleDropVerify = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveVerify(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setVerifyFile(e.dataTransfer.files[0]);
      setVerifyResult(null);
    }
  };

  const startVerification = async () => {
    if (!verifyFile || !verifyFileId) {
      alert("Please select a file and enter the Blockchain File ID.");
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      // 1. Compute SHA-256 hash in browser
      const fileReader = new FileReader();
      const bufferPromise = new Promise((resolve, reject) => {
        fileReader.onload = () => resolve(fileReader.result);
        fileReader.onerror = reject;
      });
      fileReader.readAsArrayBuffer(verifyFile);
      const fileBuffer = await bufferPromise;

      console.log("🔒 Computing SHA-256 fingerprint in-browser...");
      const fileHash = await computeFileHash(fileBuffer);
      
      // 2. Query Smart Contract
      console.log(`⛓️ Querying smart contract to verify integrity of File ID: ${verifyFileId}...`);
      const [isValid, ownerAddress, timestamp] = await verifyFileIntegrityOnChain(
        Number(verifyFileId),
        fileHash
      );

      setVerifyResult({
        success: isValid,
        owner: ownerAddress,
        date: new Date(Number(timestamp) * 1000).toISOString()
      });

      await logActivity(
        "INTEGRITY_CHECK",
        `Ran blockchain integrity check on file ID ${verifyFileId}. Match: ${isValid ? 'VERIFIED' : 'TAMPERED'}`,
        verifyFile.name,
        verifyFile.size
      );

    } catch (e) {
      console.error("Verification failed:", e);
      alert(`Verification failed: ${e.message}`);
    }
    setIsVerifying(false);
  };

  // Render Landing & Authentication View
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 relative overflow-hidden bg-[#040814]">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes gridPan {
            0% { background-position: 0px 0px; }
            100% { background-position: 40px 40px; }
          }
          @keyframes floatParticle {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
            50% { transform: translateY(-20px) scale(1.05); opacity: 0.6; }
          }
          @keyframes shimmerSweep {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .animate-grid-pan {
            animation: gridPan 25s linear infinite;
          }
          .animate-float-1 {
            animation: floatParticle 9s ease-in-out infinite;
          }
          .animate-float-2 {
            animation: floatParticle 14s ease-in-out infinite;
          }
          .animate-float-3 {
            animation: floatParticle 11s ease-in-out infinite;
          }
          .animate-shimmer-sweep {
            background: linear-gradient(90deg, #2563eb, #06b6d4, #1e40af, #2563eb);
            background-size: 200% auto;
            animation: shimmerSweep 4s linear infinite;
          }
          .hover-pulse-glow:hover {
            box-shadow: 0 0 25px rgba(6, 182, 212, 0.45);
          }
          @keyframes laserStream {
            0% { transform: translateY(-128px); }
            100% { transform: translateY(100vh); }
          }
          .animate-laser-stream {
            animation: laserStream 6s linear infinite;
          }
          @keyframes floatCard {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-8px); }
          }
          .animate-float-card {
            animation: floatCard 6s ease-in-out infinite;
          }
          @keyframes hoverPulseGlow {
            0%, 100% { box-shadow: 0 0 15px rgba(6, 182, 212, 0.4); }
            50% { box-shadow: 0 0 30px rgba(6, 182, 212, 0.8); }
          }
          .animate-hover-pulse:hover {
            animation: hoverPulseGlow 2s ease-in-out infinite;
          }
        `}} />
        
        {/* Minimalist Top Navbar */}
        <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 md:px-12 pointer-events-auto">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 rounded-xl bg-slate-950/80 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Folder className="h-4.5 w-4.5 text-cyan-400 drop-shadow-[0_0_3px_rgba(6,182,212,0.8)]" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-white bg-clip-text text-transparent tracking-tight">
              Munawar's Drive
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-[11px] font-semibold text-slate-400 font-mono tracking-wider">
            <a href="#home" className="hover:text-cyan-400 transition-colors duration-300">Home</a>
            <a href="#features" className="hover:text-cyan-400 transition-colors duration-300">Features</a>
            <a href="#docs" className="hover:text-cyan-400 transition-colors duration-300">Docs</a>
            <a href="#github" className="hover:text-cyan-400 transition-colors duration-300">GitHub</a>
            <a href="#contact" className="hover:text-cyan-400 transition-colors duration-300">Contact</a>
          </nav>
        </header>

        {/* Left Panel (Brand & Value Proposition) */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 pt-28 bg-slate-950 border-r border-white/5 overflow-hidden select-none">
          {/* Animated Background Layers */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(6,182,212,0.1),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.08),transparent_60%)]" />
            <div className="absolute inset-0 grid-bg opacity-15 animate-grid-pan" />
            {/* Floating Ambient Glow Orb */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/20 blur-[120px] animate-float-1" />
          </div>

          {/* Main Proposition Details */}
          <div className="my-auto space-y-6 z-10 max-w-md">
            <div>
              <span className="text-[10px] font-bold text-cyan-400 font-mono tracking-[0.25em] uppercase">
                Next-Gen Storage
              </span>
              <h2 className="text-3xl font-extrabold text-slate-100 tracking-tight mt-2 leading-tight">
                The Secure Decentralized Cloud for Web3
              </h2>
              <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                A high-performance zero-knowledge storage vault secured by smart contracts and client-side cryptography.
              </p>
            </div>

            {/* Visual Asset Container (Holographic Placeholder for 3D Illustration) */}
            <div className="relative aspect-video w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden flex items-center justify-center group/asset hover:border-cyan-500/30 transition-all duration-500 shadow-[0_0_20px_rgba(6,182,212,0.02)] hover:shadow-[0_0_30px_rgba(6,182,212,0.08)]">
              <div className="absolute inset-0 grid-bg opacity-20" />
              <div className="absolute h-20 w-20 rounded-full bg-cyan-500/10 blur-xl group-hover/asset:bg-cyan-500/20 transition-all duration-500" />
              
              {/* Corner Brackets */}
              <div className="absolute top-3 left-3 h-2 w-2 border-t-2 border-l-2 border-cyan-400/40 z-10" />
              <div className="absolute top-3 right-3 h-2 w-2 border-t-2 border-r-2 border-cyan-400/40 z-10" />
              <div className="absolute bottom-3 left-3 h-2 w-2 border-b-2 border-l-2 border-cyan-400/40 z-10" />
              <div className="absolute bottom-3 right-3 h-2 w-2 border-b-2 border-r-2 border-cyan-400/40 z-10" />
              
              <div className="relative w-full h-full p-4 z-0">
                <Image 
                  src="/hero-image.png" 
                  alt="Web3 3D Illustration" 
                  fill 
                  className="object-contain p-4 transition-transform duration-700 group-hover/asset:scale-105" 
                  priority
                />
              </div>
            </div>

            <div className="space-y-6">
              <div className="group flex gap-4 cursor-pointer">
                <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:text-cyan-300 group-hover:border-cyan-500/30 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 transition-colors duration-300 group-hover:text-cyan-300">Zero-Knowledge Storage</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed transition-colors duration-300 group-hover:text-slate-300">
                    Encryption keys are generated dynamically in-browser. Your data is private by default and completely invisible to server operators.
                  </p>
                  <span className="text-[10px] text-cyan-400 font-mono tracking-wide mt-1.5 block opacity-85 group-hover:opacity-100 transition-opacity">
                    ➤ Only YOU can access your data — not even us.
                  </span>
                </div>
              </div>

              <div className="group flex gap-4 cursor-pointer">
                <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:text-cyan-300 group-hover:border-cyan-500/30 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 transition-colors duration-300 group-hover:text-cyan-300">Decentralized Access Control</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed transition-colors duration-300 group-hover:text-slate-300">
                    Permissions are recorded directly on the blockchain, creating a tamper-proof decentralized Access Control List (ACL).
                  </p>
                  <span className="text-[10px] text-cyan-400 font-mono tracking-wide mt-1.5 block opacity-85 group-hover:opacity-100 transition-opacity">
                    ➤ Immutable ACL managed entirely by smart contracts.
                  </span>
                </div>
              </div>

              <div className="group flex gap-4 cursor-pointer">
                <div className="h-10 w-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:text-cyan-300 group-hover:border-cyan-500/30 group-hover:shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200 transition-colors duration-300 group-hover:text-cyan-300">End-to-End Hybrid Encryption</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed transition-colors duration-300 group-hover:text-slate-300">
                    Symmetric AES-GCM and asymmetric RSA-OAEP keys are combined to protect transfers and permission handshakes.
                  </p>
                  <span className="text-[10px] text-cyan-400 font-mono tracking-wide mt-1.5 block opacity-85 group-hover:opacity-100 transition-opacity">
                    ➤ Ultra-secure hybrid keys generated and stored client-side.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Copyright */}
          <div className="text-[10px] text-slate-500 font-mono z-10">
            © 2026 MUNAWAR'S DRIVE • DECENTRALIZED DATA LAYER
          </div>
        </div>

        {/* Animated Vertical Divider / Laser Track */}
        <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/5 hidden lg:block z-20 pointer-events-none overflow-hidden">
          <div className="absolute left-[-0.5px] w-[2px] h-32 bg-gradient-to-b from-transparent via-cyan-500 to-transparent shadow-[0_0_10px_rgba(6,182,212,0.8)] animate-laser-stream" />
        </div>

        {/* Right Panel (The Auth Card) */}
        <div className="relative flex flex-col justify-center items-center p-6 sm:p-12 pt-24 bg-[#060b18] overflow-hidden">
          {/* Animated Background Layers */}
          <div className="absolute inset-0 z-0 pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(6,182,212,0.08),transparent_60%),radial-gradient(circle_at_20%_80%,rgba(99,102,241,0.08),transparent_60%)]" />
            <div className="absolute inset-0 grid-bg opacity-10 animate-grid-pan" />
            {/* Floating Ambient Glow Orb */}
            <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-[120px] animate-float-3" />
          </div>

          {/* Compact Glassmorphic Login Card */}
          <div className="w-full max-w-md relative rounded-3xl border border-white/10 bg-[#0c1020]/75 backdrop-blur-xl p-8 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.6)] glow-border z-10 animate-float-card">
            
            {/* Error banner */}
            {formError && (
              <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
                ⚠️ {formError}
              </div>
            )}

            {/* Web3 Wallet Auth View */}
            <div className="text-center space-y-6">
              {/* Articulated 3D holographic lock */}
              <div className="relative h-20 w-20 flex items-center justify-center mx-auto">
                {/* Rotating Orbit rings */}
                <div className="absolute inset-0 rounded-full border border-dashed border-cyan-500/20 animate-[spin_12s_linear_infinite]" />
                <div className="absolute inset-2 rounded-full border border-dashed border-blue-500/30 animate-[spin_8s_linear_infinite_reverse]" />
                {/* Padlock Glow Shield */}
                <div className="absolute h-14 w-14 rounded-2xl bg-slate-950/80 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.3)] animate-pulse">
                  <Lock className="h-6 w-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-lg font-bold text-slate-100">Sign In with Ethereum</h4>
                <p className="text-xs text-slate-400 leading-normal max-w-xs mx-auto">
                  Connect your Web3 wallet and sign a secure challenge to decrypt your personal storage vault.
                </p>
              </div>

              {/* 3-Step Visual Indicator */}
              <div className="flex items-center justify-between w-full max-w-sm mx-auto pt-2 text-slate-400 font-mono text-[9px] tracking-wider uppercase">
                <div className={`flex flex-col items-center gap-1.5 flex-1 ${!isConnected ? "text-cyan-400 font-bold" : "text-emerald-400/80"}`}>
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center border text-[9px] font-bold transition-all duration-300 ${
                    isConnected 
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                      : "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)] animate-pulse"
                  }`}>
                    {isConnected ? "✓" : "1"}
                  </div>
                  <span>Connect</span>
                </div>
                
                <div className={`h-[1px] w-8 bg-gradient-to-r ${isConnected ? "from-emerald-500/50 to-cyan-500/50" : "from-slate-800 to-slate-800"} shrink-0`} />
                
                <div className={`flex flex-col items-center gap-1.5 flex-1 ${isConnected && !isAuthenticated ? "text-cyan-400 font-bold" : "text-slate-500"}`}>
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center border text-[9px] font-bold transition-all duration-300 ${
                    isConnected && !isAuthenticated 
                      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)] animate-pulse" 
                      : "border-slate-800 bg-slate-900/50 text-slate-500"
                  }`}>
                    2
                  </div>
                  <span>Sign Msg</span>
                </div>
                
                <div className="h-[1px] w-8 bg-slate-800 shrink-0" />
                
                <div className="flex flex-col items-center gap-1.5 flex-1 text-slate-500">
                  <div className="h-6 w-6 rounded-full flex items-center justify-center border border-slate-800 bg-slate-900/50 text-slate-500 text-[9px] font-bold">
                    3
                  </div>
                  <span>Access</span>
                </div>
              </div>

              {/* Connected Wallet State Pill */}
              {isConnected && walletAddress && (
                <div className="flex items-center justify-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md max-w-xs mx-auto">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-300 font-mono">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    Ethereum {networkName || "Sepolia"}
                  </span>
                  <span className="text-slate-700">|</span>
                  <span className="text-[10px] text-cyan-400 font-mono bg-slate-950/40 px-2 py-0.5 rounded border border-cyan-500/10">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={handleWalletAuth}
                disabled={authLoading}
                className="w-full h-12 rounded-xl animate-shimmer-sweep animate-hover-pulse text-white font-bold tracking-wider text-xs uppercase flex items-center justify-center gap-2 hover:scale-105 active:scale-[0.98] transition-all duration-300 border-none cursor-pointer"
              >
                {authLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    Verifying Signature...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Connect Wallet & Unlock Vault
                  </span>
                )}
              </button>

              {/* Trust Badges */}
              <div className="pt-6 border-t border-white/5 grid grid-cols-3 gap-2 text-[9px] font-mono uppercase tracking-wider text-slate-400">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <Lock className="h-4 w-4 text-cyan-400/80" />
                  <span>E2E Encrypted</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 text-center border-x border-white/5">
                  <Shield className="h-4 w-4 text-cyan-400/80" />
                  <span>No Server Access</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <Globe className="h-4 w-4 text-cyan-400/80" />
                  <span>Decentralized (IPFS)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }


  // --------------------------------------------------
  // MAIN DASHBOARD ORCHESTRATION LAYOUT
  // --------------------------------------------------
  
  // Filter and Search File records
  const filteredFiles = (filesList) => {
    return filesList.filter((item) => {
      const matchesSearch = item.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.ipfsHash.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (filterType === "all") return matchesSearch;
      
      const fileType = item.fileType ? item.fileType.toLowerCase() : "";
      if (filterType === "images") return matchesSearch && fileType.startsWith("image/");
      if (filterType === "videos") return matchesSearch && fileType.startsWith("video/");
      if (filterType === "documents") return matchesSearch && (fileType === "application/pdf" || fileType.startsWith("text/"));
      return matchesSearch;
    });
  };



  const handlePreviewTrigger = (buffer, name, type) => {
    setPreviewData(buffer);
    setPreviewName(name);
    setPreviewType(type);
    setIsPreviewOpen(true);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Background grids */}
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />

      {/* Sidebar navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Page Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/10 backdrop-blur-3xl z-10">
        
        {/* Navbar */}
        <Navbar activeTab={activeTab} />

        {/* Viewport content */}
        <main className="flex-1 overflow-y-auto p-8 relative">
          
          {/* 1. MY DRIVE TAB */}
          {activeTab === "drive" && (
            <div className="space-y-8">
              {/* Upload Drop Zone Card */}
              <FileUpload onUploadSuccess={refreshDashboard} />

              {/* Upgraded Dashboard Metrics Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {/* Metric 1: Total Files */}
                <div className="relative rounded-2xl border border-white/5 bg-[#0c1020]/40 backdrop-blur-xl p-5 flex items-center gap-4 hover:border-cyan-500/20 transition-all duration-300 shadow-lg shadow-black/25">
                  <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <FileText className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono tracking-wider text-slate-500 uppercase block">Total Files</span>
                    <span className="text-xl font-extrabold text-slate-200">{files.length}</span>
                  </div>
                </div>

                {/* Metric 2: Storage Capacity */}
                <div className="relative rounded-2xl border border-white/5 bg-[#0c1020]/40 backdrop-blur-xl p-5 flex items-center gap-4 hover:border-cyan-500/20 transition-all duration-300 shadow-lg shadow-black/25">
                  <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <HardDrive className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono tracking-wider text-slate-500 uppercase block">Storage Used</span>
                    <span className="text-xl font-extrabold text-slate-200">
                      {formatBytes(files.reduce((acc, f) => acc + Number(f.fileSize || 0), 0))}
                    </span>
                  </div>
                </div>

                {/* Metric 3: Active Shares */}
                <div className="relative rounded-2xl border border-white/5 bg-[#0c1020]/40 backdrop-blur-xl p-5 flex items-center gap-4 hover:border-cyan-500/20 transition-all duration-300 shadow-lg shadow-black/25">
                  <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold font-mono tracking-wider text-slate-500 uppercase block">Active Shares</span>
                    <span className="text-xl font-extrabold text-slate-200">
                      {files.filter(f => f.isPublic).length + sharedFiles.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Controls bar */}
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-t border-slate-900 pt-6">
                {/* Search Bar & Dropdown Container */}
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search by filename, CID, or tag"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-slate-900/40 border border-slate-800 rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-slate-200 transition-all duration-300"
                    />
                  </div>
                  
                  <div className="relative shrink-0">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="bg-slate-900/50 border border-slate-800 text-slate-300 px-4 py-2 rounded-xl text-sm font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer h-10 w-44"
                    >
                      <option value="all">All File Types</option>
                      <option value="images">Images Only</option>
                      <option value="videos">Videos Only</option>
                      <option value="documents">Documents</option>
                    </select>
                  </div>
                </div>

                {/* Right View Modes */}
                <div className="flex items-center gap-3 shrink-0 w-full md:w-auto justify-end">
                  <div className="flex bg-slate-900 border border-slate-850 p-0.5 rounded-lg">
                    <button 
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-md transition-all ${viewMode === "grid" ? "bg-slate-950 text-cyan-400 border border-slate-800" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-slate-950 text-cyan-400 border border-slate-800" : "text-slate-500 hover:text-slate-300"}`}
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Encryption Transparency Info Panel */}
              <div className="flex flex-wrap items-center gap-4 p-4 rounded-2xl bg-cyan-950/5 border border-cyan-500/10 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
                  <Lock className="h-4 w-4 text-cyan-400/80" />
                  <span className="font-semibold">AES-256 + RSA Hybrid:</span>
                  <span className="text-slate-400">Files are fully encrypted client-side.</span>
                </div>
                <div className="hidden sm:block text-slate-700">|</div>
                <div className="flex items-center gap-2 text-xs text-cyan-300 font-mono">
                  <Globe className="h-4 w-4 text-cyan-400/80" />
                  <span className="font-semibold">Secured on IPFS:</span>
                  <span className="text-slate-400">Decentralized DHT distribution nodes.</span>
                </div>
                <div className="ml-auto group relative cursor-help">
                  <HelpCircle className="h-4.5 w-4.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                  <div className="absolute right-0 bottom-6 w-64 p-3 bg-slate-950/95 border border-cyan-500/20 text-[10px] text-slate-450 rounded-xl shadow-2xl backdrop-blur-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 z-50 leading-relaxed font-mono">
                    <span className="text-cyan-400 font-bold block mb-1">🔒 Zero-Knowledge Decryption</span>
                    Only your connected wallet address holds the unique private key required to decrypt the symmetric file key. No database or administrator can access your data.
                  </div>
                </div>
              </div>

              {/* Grid / List display */}
              {loadingFiles ? (
                // Skeletons
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative rounded-2xl border border-white/5 bg-[#0c1020]/40 h-72 shimmer" />
                  ))}
                </div>
              ) : filteredFiles(files).length > 0 ? (
                viewMode === "grid" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredFiles(files).map((file) => (
                      <FileCard
                        key={Number(file.id)}
                        file={file}
                        onShare={(selectedFile) => {
                          setSelectedFileForShare(selectedFile);
                          setIsShareOpen(true);
                        }}
                        onActionSuccess={refreshDashboard}
                        onPreview={handlePreviewTrigger}
                      />
                    ))}
                  </div>
                ) : (
                  // List View Table
                  <div className="glass-panel rounded-xl overflow-hidden border border-slate-800/80">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="p-4">ID</th>
                          <th className="p-4">Name</th>
                          <th className="p-4">Size</th>
                          <th className="p-4">MIME Type</th>
                          <th className="p-4">IPFS CID</th>
                          <th className="p-4">Upload Date</th>
                          <th className="p-4">Access</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredFiles(files).map((file) => (
                          <tr key={Number(file.id)} className="border-b border-slate-900/60 hover:bg-slate-900/10 transition-all">
                            <td className="p-4 font-mono font-bold text-cyan-400">{Number(file.id)}</td>
                            <td className="p-4 font-bold text-slate-200 truncate max-w-xs">{file.fileName}</td>
                            <td className="p-4 font-mono text-slate-400">{formatBytes(Number(file.fileSize))}</td>
                            <td className="p-4 text-slate-400">{file.fileType}</td>
                            <td className="p-4 font-mono text-slate-500">{file.ipfsHash.slice(0, 15)}...</td>
                            <td className="p-4 text-slate-500">{formatDate(Number(file.timestamp) * 1000)}</td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${file.isPublic ? 'bg-indigo-500/10 text-indigo-400' : 'bg-cyan-500/10 text-cyan-400'}`}>
                                {file.isPublic ? "Public" : "Private"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="text-center py-16 border border-slate-900 rounded-xl bg-slate-950/30">
                  <HardDrive className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Vault is empty</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a document above and upload it to get started.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 2. SHARED WITH ME TAB */}
          {activeTab === "shared" && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/25 border border-slate-800/40 text-xs text-slate-400">
                📁 <b>Shared Workspace Ledger:</b> These are files whose access control lists (ACL) on the smart contract have granted decrypt rights to your connected wallet address.
              </div>

              {loadingFiles ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative rounded-2xl border border-white/5 bg-[#0c1020]/40 h-72 shimmer" />
                  ))}
                </div>
              ) : sharedFiles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {sharedFiles.map((file) => (
                    <FileCard
                      key={Number(file.id)}
                      file={file}
                      isSharedView={true}
                      onPreview={handlePreviewTrigger}
                      onActionSuccess={refreshDashboard}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 border border-slate-900 rounded-xl bg-slate-950/30">
                  <Share2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">No shared documents</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Files shared with your wallet address by other users will appear here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SHARED ACCESS MANAGEMENT TAB */}
          {activeTab === "shares-list" && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-slate-900/25 border border-slate-800/40 text-xs text-slate-400">
                👥 <b>Outbound Shares Control Panel:</b> View all wallets you have shared access with. You can revoke access from any previously shared recipient here.
              </div>

              {loadingShares ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 shimmer rounded-lg" />
                  ))}
                </div>
              ) : allShares.length > 0 ? (
                <div className="glass-panel rounded-xl overflow-hidden border border-slate-800/80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="p-4">File Name</th>
                        <th className="p-4">Shared With</th>
                        <th className="p-4">Date Shared</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const fileMap = {};
                        files.forEach(f => {
                          fileMap[String(f.id)] = f;
                        });

                        const myOutboundShares = allShares.filter(s => fileMap[String(s.fileId)]);

                        if (myOutboundShares.length === 0) {
                          return (
                            <tr>
                              <td colSpan="5" className="p-8 text-center text-slate-500 font-mono">
                                No outbound shares found for your owned files.
                              </td>
                            </tr>
                          );
                        }

                        return myOutboundShares.map((share, idx) => {
                          const file = fileMap[String(share.fileId)];
                          return (
                            <tr key={idx} className="border-b border-slate-900/60 hover:bg-slate-900/10 transition-all">
                              <td className="p-4 font-bold text-slate-200 truncate max-w-xs">
                                {file ? file.fileName : `File ID: ${share.fileId}`}
                              </td>
                              <td className="p-4 font-mono text-slate-350 select-all">
                                {share.recipientAddress}
                              </td>
                              <td className="p-4 text-slate-500">
                                {formatDate(share.timestamp)}
                              </td>
                              <td className="p-4">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400">
                                  Authorized
                                </span>
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => handleRevokeShare(
                                    share.fileId,
                                    share.recipientAddress,
                                    file ? file.ipfsHash : "",
                                    file ? file.fileName : `ID:${share.fileId}`,
                                    file ? file.fileSize : 0
                                  )}
                                  className="text-[10px] font-bold text-rose-400 hover:text-rose-350 hover:bg-rose-500/10 px-3 py-1.5 rounded-xl border border-rose-500/20 hover:border-rose-500/40 cursor-pointer transition-all disabled:opacity-50"
                                >
                                  Revoke Share
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 border border-slate-900 rounded-xl bg-slate-950/30">
                  <Share2 className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">No outbound shares</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Files you share with other wallets will appear here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 3. INTEGRITY CHECKER TAB */}
          {activeTab === "verify" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="glass-card p-6 glow-border space-y-5">
                <div className="text-center">
                  <h3 className="text-base font-bold text-slate-200">On-Chain Document Verification</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Drop a local document. We compute its SHA-256 fingerprint in browser and query the blockchain record.
                  </p>
                </div>

                {/* Drag and Drop Verify */}
                <div
                  onDragEnter={handleDragVerify}
                  onDragOver={handleDragVerify}
                  onDragLeave={handleDragVerify}
                  onDrop={handleDropVerify}
                  onClick={() => document.getElementById('verify-file-input').click()}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${
                    dragActiveVerify
                      ? "border-cyan-400 bg-cyan-500/5 shadow-[inset_0_0_20px_rgba(6,182,212,0.15)]"
                      : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/10"
                  }`}
                >
                  <input
                    id="verify-file-input"
                    type="file"
                    onChange={(e) => {
                      if(e.target.files[0]) {
                        setVerifyFile(e.target.files[0]);
                        setVerifyResult(null);
                      }
                    }}
                    className="hidden"
                  />
                  <ShieldCheck className="h-8 w-8 text-cyan-400 mb-3" />
                  {verifyFile ? (
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-200 truncate max-w-xs">{verifyFile.name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{formatBytes(verifyFile.size)}</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-semibold text-slate-300">
                        Drag & Drop or <span className="text-cyan-400 hover:underline">browse</span> document
                      </p>
                    </div>
                  )}
                </div>

                {/* Index ID Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-500 font-bold uppercase tracking-wider block">
                    Registered Blockchain File ID
                  </label>
                  <input
                    type="number"
                    value={verifyFileId}
                    onChange={(e) => setVerifyFileId(e.target.value)}
                    placeholder="Enter Ledger Index ID (e.g. 1)"
                    className="w-full glass-input"
                  />
                </div>

                {/* Action button */}
                <button
                  onClick={startVerification}
                  disabled={isVerifying || !verifyFile || !verifyFileId}
                  className="w-full glass-btn-primary py-3 font-bold active:scale-[0.98] transition-all cursor-pointer"
                >
                  {isVerifying ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Computing Browser Cryptographic Fingerprint...
                    </span>
                  ) : (
                    "Verify On-Chain Integrity"
                  )}
                </button>
              </div>

              {/* Verification Result Shield */}
              {verifyResult && (
                <div className={`border rounded-xl p-6 flex flex-col items-center text-center backdrop-blur-sm shadow-xl transition-all duration-500 ${
                  verifyResult.success
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-rose-500/20 bg-rose-500/5"
                }`}>
                  {verifyResult.success ? (
                    <>
                      <ShieldCheck className="h-14 w-14 text-emerald-400 mb-3 animate-bounce" />
                      <h4 className="text-base font-bold text-slate-200">VERIFIED GENUINE</h4>
                      <p className="text-xs text-slate-400 mt-2 max-w-sm">
                        This local document perfectly matches the cryptographic fingerprint recorded on the blockchain ledger!
                      </p>
                      
                      <div className="w-full grid grid-cols-2 gap-4 mt-6 text-left border-t border-slate-900/60 pt-4 text-[11px] font-medium text-slate-500">
                        <div>
                          <span>Fingerprint Owner:</span>
                          <p className="font-mono text-slate-300 mt-0.5">{verifyResult.owner.slice(0,10)}...{verifyResult.owner.slice(-6)}</p>
                        </div>
                        <div>
                          <span>Blockchain Registered:</span>
                          <p className="text-slate-300 mt-0.5">{formatDate(verifyResult.date)}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-14 w-14 text-rose-400 mb-3 animate-pulse" />
                      <h4 className="text-base font-bold text-slate-200">TAMPERED / ALTERED</h4>
                      <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
                        <b>Verification Failed!</b> The computed SHA-256 hash of this local file does NOT match the registered blockchain hash for File ID {verifyFileId}. The file has been modified or is a different version!
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4. SECURE KEY VAULT TAB */}
          {activeTab === "vault" && (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Vault Intro */}
              <div className="glass-card p-6 glow-border space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <KeyRound className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-200">Cryptographic Key Ledger</h3>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Vault3 implements **Zero-Knowledge client-side encryption**. Every file is encrypted using a random AES-256 symmetric key. That key is then wrapped using your Master Vault Seed derived from your wallet signature or password hash.
                </p>

                {/* Master Seed Card */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-900 space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      Your Vault 256-Bit Master Seed
                    </label>
                    <button
                      onClick={() => setShowMasterSeed(!showMasterSeed)}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                    >
                      {showMasterSeed ? (
                        <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hide Seed</span>
                      ) : (
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> View Seed</span>
                      )}
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between gap-3 bg-slate-950 p-3 rounded-lg border border-slate-900/60 font-mono text-xs">
                    <span className="truncate flex-1 text-slate-400 select-all max-w-[400px]">
                      {showMasterSeed 
                        ? masterSeed 
                        : "0x••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(masterSeed);
                        alert("Vault Master Seed copied to clipboard!");
                      }}
                      className="h-8 w-8 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                      title="Copy Key"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card p-5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Vault Drive Files</span>
                  <span className="text-2xl font-bold font-mono text-slate-200 mt-2 block">{files.length}</span>
                </div>
                <div className="glass-card p-5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Shared Authorized Keys</span>
                  <span className="text-2xl font-bold font-mono text-slate-200 mt-2 block">{sharedFiles.length}</span>
                </div>
              </div>
            </div>
          )}

          {/* 5. ACTIVITY LEDGER TAB */}
          {activeTab === "logs" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-400 font-medium">
                  📜 <b>Security Logs:</b> Real-time logs of security vault operations and transactions on the ledger.
                </div>
                <button 
                  onClick={fetchActivityLogs}
                  className="glass-btn-secondary px-3 py-1.5 text-[10px]"
                >
                  Refresh Logs
                </button>
              </div>

              {loadingLogs ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 shimmer rounded-lg" />
                  ))}
                </div>
              ) : activityLogs.length > 0 ? (
                <div className="glass-panel rounded-xl overflow-hidden border border-slate-800/80">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-950/80 border-b border-slate-900 text-slate-500 font-bold uppercase tracking-wider">
                        <th className="p-4">Event Type</th>
                        <th className="p-4">Description</th>
                        <th className="p-4">Associated Document</th>
                        <th className="p-4">On-Chain Transaction</th>
                        <th className="p-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLogs.map((log) => {
                        let badgeColor = "bg-slate-800 text-slate-400";
                        if (log.action === "FILE_UPLOAD") badgeColor = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                        if (log.action === "FILE_SHARE") badgeColor = "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
                        if (log.action === "FILE_DELETED") badgeColor = "bg-rose-500/10 text-rose-400 border border-rose-500/20";
                        if (log.action.includes("LOGIN")) badgeColor = "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20";
                        if (log.action === "INTEGRITY_CHECK") badgeColor = "bg-amber-500/10 text-amber-400 border border-amber-500/20";

                        return (
                          <tr key={log._id || log.id} className="border-b border-slate-900/60 hover:bg-slate-900/10 transition-all">
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold ${badgeColor}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="p-4 text-slate-300 font-medium">{log.details}</td>
                            <td className="p-4 text-slate-400 font-mono select-all">
                              {log.fileName ? (
                                <span className="flex items-center gap-1.5">
                                  <FileText className="h-3 w-3 text-slate-500" />
                                  {log.fileName}
                                </span>
                              ) : "-"}
                            </td>
                            <td className="p-4 font-mono text-cyan-400 select-all cursor-pointer">
                              {log.txHash ? (
                                <span className="flex items-center gap-1 group">
                                  {log.txHash.slice(0, 10)}...{log.txHash.slice(-6)}
                                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </span>
                              ) : "-"}
                            </td>
                            <td className="p-4 text-slate-500">{formatDate(log.timestamp)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-16 border border-slate-900 rounded-xl bg-slate-950/30">
                  <Clock className="h-10 w-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-400">Activity Ledger is empty</p>
                </div>
              )}
            </div>
          )}

        </main>
      </div>

      {/* SHARE ACCESS CONTROL MODAL */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => { setIsShareOpen(false); setSelectedFileForShare(null); }}
        file={selectedFileForShare}
        onShareSuccess={refreshDashboard}
      />

      {/* SECURE CLIENT-SIDE SANDBOX PREVIEW MODAL */}
      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => { setIsPreviewOpen(false); setPreviewData(null); }}
        fileData={previewData}
        fileName={previewName}
        fileType={previewType}
      />
    </div>
  );
}
