"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useWeb3 } from "./useWeb3.js";
import { 
  deriveMasterSeedFromSignature, 
  deriveMasterSeedFromEmailAndPassword 
} from "../utils/crypto.js";

const AuthContext = createContext(null);
const API_URL = "http://localhost:5000/api";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [masterSeed, setMasterSeed] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authType, setAuthType] = useState(null); // 'email' or 'wallet'
  const [error, setError] = useState(null);

  const { connectWallet, signer, disconnectWallet: disconnectWeb3 } = useWeb3();

  // Axios Authorization header sync
  const setAuthHeader = (jwtToken) => {
    if (jwtToken) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${jwtToken}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // Restore session on bootstrap
  useEffect(() => {
    const restoreSession = async () => {
      setError(null);
      const storedToken = localStorage.getItem("w3d_token");
      const storedUser = localStorage.getItem("w3d_user");
      const storedAuthType = localStorage.getItem("w3d_authtype");
      
      // We store the encrypted master seed in sessionStorage for security
      // (survives tab refreshes, deleted when browser tab is closed).
      const storedSeed = sessionStorage.getItem("w3d_seed");

      if (storedToken && storedUser && storedSeed) {
        try {
          const parsedUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          setAuthType(storedAuthType);
          setMasterSeed(storedSeed);
          setAuthHeader(storedToken);
          setIsAuthenticated(true);
        } catch (e) {
          console.error("Session restore failed:", e);
          logout();
        }
      }
      setIsLoading(false);
    };
    restoreSession();
  }, []);

  // 1. Email/Password Signup
  const registerWithEmail = async (email, password) => {
    setError(null);
    setIsLoading(true);
    console.log(`🚀 [Vault3 Auth] Attempting signup for email: ${email.toLowerCase()}`);
    
    try {
      console.log(`📡 [Vault3 Auth] Sending POST request to ${API_URL}/auth/register...`);
      const response = await axios.post(`${API_URL}/auth/register`, { email, password });
      console.log("✅ [Vault3 Auth] Register API response received:", response.data);
      
      const { token: jwtToken, user: profile } = response.data;

      // Derive master seed client-side deterministically
      console.log("🔒 [Vault3 Auth] Deriving Master Seed client-side using PBKDF2 (100,000 rounds)...");
      const seed = await deriveMasterSeedFromEmailAndPassword(email, password);
      console.log("🔑 [Vault3 Auth] Master Seed derived successfully!");

      setToken(jwtToken);
      setUser(profile);
      setAuthType("email");
      setMasterSeed(seed);
      setAuthHeader(jwtToken);
      
      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(profile));
      localStorage.setItem("w3d_authtype", "email");
      sessionStorage.setItem("w3d_seed", seed);

      setIsAuthenticated(true);
      setIsLoading(false);
      return profile;
    } catch (err) {
      console.error("❌ [Vault3 Auth] Registration failed with error:", err);
      
      let errMsg = "Failed to register";
      if (err.response) {
        // The server responded with a status code that falls out of the range of 2xx
        errMsg = err.response.data?.message || `Server responded with status ${err.response.status}`;
        console.error(`❌ [Vault3 Auth] Backend returned status code ${err.response.status}:`, err.response.data);
      } else if (err.request) {
        // The request was made but no response was received (e.g. backend down)
        errMsg = "Connection Refused: Cannot reach the backend Express API at http://localhost:5000. Please ensure the backend server is running ('npm start' in the backend/ directory).";
        console.error("❌ [Vault3 Auth] Connection refused by the API server at http://localhost:5000. Is it offline?");
      } else {
        errMsg = err.message;
      }
      
      setError(errMsg);
      setIsLoading(false);
      throw new Error(errMsg);
    }
  };

  // 2. Email/Password Signin
  const loginWithEmail = async (email, password) => {
    setError(null);
    setIsLoading(true);
    console.log(`🚀 [Vault3 Auth] Attempting sign-in for email: ${email.toLowerCase()}`);
    
    try {
      console.log(`📡 [Vault3 Auth] Sending POST request to ${API_URL}/auth/login...`);
      const response = await axios.post(`${API_URL}/auth/login`, { email, password });
      console.log("✅ [Vault3 Auth] Login API response received:", response.data);
      
      const { token: jwtToken, user: profile } = response.data;

      // Derive master seed client-side deterministically
      console.log("🔒 [Vault3 Auth] Deriving Master Seed client-side using PBKDF2 (100,000 rounds)...");
      const seed = await deriveMasterSeedFromEmailAndPassword(email, password);
      console.log("🔑 [Vault3 Auth] Master Seed derived successfully!");

      setToken(jwtToken);
      setUser(profile);
      setAuthType("email");
      setMasterSeed(seed);
      setAuthHeader(jwtToken);

      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(profile));
      localStorage.setItem("w3d_authtype", "email");
      sessionStorage.setItem("w3d_seed", seed);

      setIsAuthenticated(true);
      setIsLoading(false);
      return profile;
    } catch (err) {
      console.error("❌ [Vault3 Auth] Login failed with error:", err);
      
      let errMsg = "Failed to login";
      if (err.response) {
        errMsg = err.response.data?.message || `Server responded with status ${err.response.status}`;
        console.error(`❌ [Vault3 Auth] Backend returned status code ${err.response.status}:`, err.response.data);
      } else if (err.request) {
        errMsg = "Connection Refused: Cannot reach the backend Express API at http://localhost:5000. Please ensure the backend server is running ('npm start' in the backend/ directory).";
        console.error("❌ [Vault3 Auth] Connection refused by the API server at http://localhost:5000. Is it offline?");
      } else {
        errMsg = err.message;
      }

      setError(errMsg);
      setIsLoading(false);
      throw new Error(errMsg);
    }
  };

  // 3. Web3 Wallet Signin (MetaMask Challenge-Response)
  const loginWithWallet = async () => {
    setError(null);
    setIsLoading(true);
    console.log("🚀 [Vault3 Auth] Initiating Web3 wallet login sequence...");
    
    try {
      // Step A: Connect wallet first via the useWeb3 context
      console.log("🦊 [Vault3 Auth] Prompting MetaMask connection...");
      const connection = await connectWallet();
      if (!connection) {
        throw new Error("Failed to connect MetaMask. Please authorize access in your extension.");
      }

      const { address, signer: web3Signer } = connection;
      console.log("✅ [Vault3 Auth] MetaMask connected. Address:", address);

      // Step B: Fetch cryptographic signature challenge from backend
      console.log(`📡 [Vault3 Auth] Requesting sign challenge for ${address} from backend...`);
      const challengeResponse = await axios.post(`${API_URL}/auth/web3-challenge`, {
        walletAddress: address
      });
      const { challenge } = challengeResponse.data;
      console.log("✅ [Vault3 Auth] Received cryptographic challenge:", challenge);

      // Step C: Sign the unique challenge message via MetaMask
      console.log("🦊 [Vault3 Auth] Requesting MetaMask challenge signature...");
      const signature = await web3Signer.signMessage(challenge);
      console.log("✅ [Vault3 Auth] Signature generated successfully:", signature);

      // Step D: Validate signature on backend
      console.log("📡 [Vault3 Auth] Dispatching signature verification request to backend...");
      const verifyResponse = await axios.post(`${API_URL}/auth/web3-verify`, {
        walletAddress: address,
        signature
      });
      console.log("✅ [Vault3 Auth] Backend validation response:", verifyResponse.data);
      
      const { token: jwtToken, user: profile } = verifyResponse.data;

      // Step E: Derive Master Vault Seed deterministically from MetaMask signature
      console.log("🔒 [Vault3 Auth] Deriving Master Seed client-side from unique MetaMask signature...");
      const seed = deriveMasterSeedFromSignature(signature);
      console.log("🔑 [Vault3 Auth] Master Vault Seed derived successfully!");

      setToken(jwtToken);
      setUser(profile);
      setAuthType("wallet");
      setMasterSeed(seed);
      setAuthHeader(jwtToken);

      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(profile));
      localStorage.setItem("w3d_authtype", "wallet");
      sessionStorage.setItem("w3d_seed", seed);

      setIsAuthenticated(true);
      setIsLoading(false);
      return profile;
    } catch (err) {
      console.error("❌ [Vault3 Auth] Wallet sign-in failed with error:", err);
      
      let errMsg = "Failed wallet authentication";
      if (err.response) {
        errMsg = err.response.data?.message || `Server responded with status ${err.response.status}`;
        console.error(`❌ [Vault3 Auth] Backend returned status code ${err.response.status}:`, err.response.data);
      } else if (err.request) {
        errMsg = "Connection Refused: Cannot reach the backend Express API at http://localhost:5000. Please ensure the backend server is running ('npm start' in the backend/ directory).";
        console.error("❌ [Vault3 Auth] Connection refused by the API server at http://localhost:5000. Is it offline?");
      } else {
        errMsg = err.message;
      }

      setError(errMsg);
      setIsLoading(false);
      throw new Error(errMsg);
    }
  };

  // 4. Terminate session
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setMasterSeed(null);
    setAuthType(null);
    setIsAuthenticated(false);
    setAuthHeader(null);

    localStorage.removeItem("w3d_token");
    localStorage.removeItem("w3d_user");
    localStorage.removeItem("w3d_authtype");
    sessionStorage.removeItem("w3d_seed");

    disconnectWeb3();
  }, [disconnectWeb3]);

  // Log custom operations via Express Activity Audit Log
  const logActivity = async (action, details, fileName = "", fileSize = 0, txHash = "") => {
    if (!token) return;
    try {
      await axios.post(`${API_URL}/activity`, {
        action,
        details,
        fileName,
        fileSize,
        txHash
      });
    } catch (e) {
      console.warn("Failed to log activity to backend:", e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        masterSeed,
        isAuthenticated,
        isLoading,
        authType,
        error,
        registerWithEmail,
        loginWithEmail,
        loginWithWallet,
        logout,
        logActivity
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
