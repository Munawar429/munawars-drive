"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { useWeb3 } from "./useWeb3.js";
import { 
  deriveMasterSeedFromSignature, 
  deriveMasterSeedFromEmailAndPassword,
  generateRSAKeyPair,
  exportKey,
  wrapPrivateKey,
  unwrapPrivateKey
} from "../utils/crypto.js";
import { API_URL, BACKEND_URL } from "../utils/config.js";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [masterSeed, setMasterSeed] = useState(null);
  const [rsaPrivateKey, setRsaPrivateKey] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authType, setAuthType] = useState(null); // 'email' or 'wallet'
  const [error, setError] = useState(null);

  const { connectWallet, signer, disconnectWallet: disconnectWeb3, walletAddress } = useWeb3();

  // Axios Authorization header sync
  const setAuthHeader = (jwtToken) => {
    if (jwtToken) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${jwtToken}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  };

  // 4. Terminate session (defined at top to avoid TDZ ReferenceErrors)
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setMasterSeed(null);
    setRsaPrivateKey(null);
    setAuthType(null);
    setIsAuthenticated(false);
    setAuthHeader(null);

    localStorage.removeItem("w3d_token");
    localStorage.removeItem("w3d_user");
    localStorage.removeItem("w3d_authtype");
    sessionStorage.removeItem("w3d_seed");
    localStorage.removeItem("w3d_rsa_private_key");

    disconnectWeb3();
  }, [disconnectWeb3]);

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
      let storedRsaKey = localStorage.getItem("w3d_rsa_private_key");

      if (storedToken && storedUser) {
        try {
          let parsedUser = JSON.parse(storedUser);
          
          // Background validation/regeneration of RSA keys if missing (e.g. user logged in before key exchange integration)
          if (!parsedUser.encryptionPublicKey || !parsedUser.encryptedPrivateKey) {
            if (storedSeed) {
              console.log("🔒 [Vault3 Auth] Session restored but RSA keys are missing from user profile. Generating in background...");
              const keyPair = await generateRSAKeyPair();
              const publicKeyJson = await exportKey(keyPair.publicKey);
              const privateKeyJson = await exportKey(keyPair.privateKey);
              
              const encryptedPrivateKey = await wrapPrivateKey(privateKeyJson, storedSeed);
              
              await axios.post(
                `${API_URL}/auth/save-keys`,
                {
                  encryptionPublicKey: publicKeyJson,
                  encryptedPrivateKey: encryptedPrivateKey
                },
                {
                  headers: { Authorization: `Bearer ${storedToken}` }
                }
              );
              
              localStorage.setItem("w3d_rsa_private_key", privateKeyJson);
              storedRsaKey = privateKeyJson;
              
              parsedUser.encryptionPublicKey = publicKeyJson;
              parsedUser.encryptedPrivateKey = encryptedPrivateKey;
              localStorage.setItem("w3d_user", JSON.stringify(parsedUser));
            } else {
              console.warn("⚠️ [Vault3 Auth] RSA keys missing from profile, but cannot generate without master seed.");
            }
          } else if (!storedRsaKey) {
            // Keys exist in user profile but are missing from localStorage (e.g. refreshed page or duplicate tab)
            if (storedSeed) {
              console.log("🔒 [Vault3 Auth] Session restored. Decrypting RSA Private Key in background...");
              const privateKeyJson = await unwrapPrivateKey(parsedUser.encryptedPrivateKey, storedSeed);
              localStorage.setItem("w3d_rsa_private_key", privateKeyJson);
              storedRsaKey = privateKeyJson;
            } else {
              console.warn("⚠️ [Vault3 Auth] RSA Private Key missing from localStorage and no master seed is available to decrypt it.");
            }
          }

          setToken(storedToken);
          setUser(parsedUser);
          setAuthType(storedAuthType);
          setMasterSeed(storedSeed);
          setRsaPrivateKey(storedRsaKey);
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

  // Helper to initialize RSA OAEP keypair for secure file sharing
  const initializeUserRSAKeys = async (profile, seed, jwtToken) => {
    try {
      let updatedProfile = { ...profile };
      
      // Check if browser already has 'Local RSA Private Key' in localStorage
      let localRsaKey = localStorage.getItem("w3d_rsa_private_key");
      
      if (localRsaKey) {
        console.log("🔑 [Vault3 Auth] Found existing Local RSA Private Key in localStorage.");
        setRsaPrivateKey(localRsaKey);
        
        // If backend profile is missing keys, register this local key
        if (!profile.encryptionPublicKey || !profile.encryptedPrivateKey) {
          if (seed) {
            console.log("📡 [Vault3 Auth] Registering existing local keys to backend registry...");
            const privateJwk = JSON.parse(localRsaKey);
            const { d, p, q, dp, dq, qi, ...publicJwk } = privateJwk;
            const publicKeyJson = JSON.stringify(publicJwk);
            const encryptedPrivateKey = await wrapPrivateKey(localRsaKey, seed);
            
            await axios.post(
              `${API_URL}/auth/save-keys`,
              {
                encryptionPublicKey: publicKeyJson,
                encryptedPrivateKey: encryptedPrivateKey
              },
              {
                headers: { Authorization: `Bearer ${jwtToken}` }
              }
            );
            updatedProfile.encryptionPublicKey = publicKeyJson;
            updatedProfile.encryptedPrivateKey = encryptedPrivateKey;
          }
        }
      } else {
        // If not in localStorage, check if backend has it encrypted
        if (profile.encryptionPublicKey && profile.encryptedPrivateKey) {
          if (seed) {
            try {
              console.log("🔒 [Vault3 Auth] Decrypting existing RSA Private Key using Master Seed...");
              const privateKeyJson = await unwrapPrivateKey(profile.encryptedPrivateKey, seed);
              localStorage.setItem("w3d_rsa_private_key", privateKeyJson);
              setRsaPrivateKey(privateKeyJson);
            } catch (decryptErr) {
              console.warn("⚠️ [Vault3 Auth] Decryption of existing RSA key failed. Generating a new keypair as fallback...", decryptErr);
              const keyPair = await generateRSAKeyPair();
              const publicKeyJson = await exportKey(keyPair.publicKey);
              const privateKeyJson = await exportKey(keyPair.privateKey);
              
              const encryptedPrivateKey = await wrapPrivateKey(privateKeyJson, seed);
              
              await axios.post(
                `${API_URL}/auth/save-keys`,
                {
                  encryptionPublicKey: publicKeyJson,
                  encryptedPrivateKey: encryptedPrivateKey
                },
                {
                  headers: { Authorization: `Bearer ${jwtToken}` }
                }
              );
              
              localStorage.setItem("w3d_rsa_private_key", privateKeyJson);
              setRsaPrivateKey(privateKeyJson);
              updatedProfile.encryptionPublicKey = publicKeyJson;
              updatedProfile.encryptedPrivateKey = encryptedPrivateKey;
            }
          } else {
            console.warn("⚠️ [Vault3 Auth] Private key exists on backend but no master seed is available to decrypt it.");
          }
        } else {
          // Generate new RSA keypair
          if (seed) {
            console.log("🔒 [Vault3 Auth] Generating RSA Keypair for secure file sharing...");
            const keyPair = await generateRSAKeyPair();
            const publicKeyJson = await exportKey(keyPair.publicKey);
            const privateKeyJson = await exportKey(keyPair.privateKey);
            
            console.log("🔒 [Vault3 Auth] Encrypting RSA Private Key using Master Seed...");
            const encryptedPrivateKey = await wrapPrivateKey(privateKeyJson, seed);
            
            console.log("📡 [Vault3 Auth] Registering RSA keys in backend registry...");
            await axios.post(
              `${API_URL}/auth/save-keys`,
              {
                encryptionPublicKey: publicKeyJson,
                encryptedPrivateKey: encryptedPrivateKey
              },
              {
                headers: { Authorization: `Bearer ${jwtToken}` }
              }
            );
            
            localStorage.setItem("w3d_rsa_private_key", privateKeyJson);
            setRsaPrivateKey(privateKeyJson);
            updatedProfile.encryptionPublicKey = publicKeyJson;
            updatedProfile.encryptedPrivateKey = encryptedPrivateKey;
          } else {
            console.warn("⚠️ [Vault3 Auth] Cannot generate new RSA keys without a master seed.");
          }
        }
      }
      
      return updatedProfile;
    } catch (e) {
      console.error("❌ [Vault3 Auth] RSA key initialization failed:", e);
      return profile;
    }
  };

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

      // Initialize RSA Keys
      const updatedProfile = await initializeUserRSAKeys(profile, seed, jwtToken);

      setToken(jwtToken);
      setUser(updatedProfile);
      setAuthType("email");
      setMasterSeed(seed);
      setAuthHeader(jwtToken);
      
      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(updatedProfile));
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
        errMsg = `Connection Refused: Cannot reach the backend Express API at ${BACKEND_URL}. Please ensure the backend server is running.`;
        console.error(`❌ [Vault3 Auth] Connection refused by the API server at ${BACKEND_URL}. Is it offline?`);
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

      // Initialize RSA Keys
      const updatedProfile = await initializeUserRSAKeys(profile, seed, jwtToken);

      setToken(jwtToken);
      setUser(updatedProfile);
      setAuthType("email");
      setMasterSeed(seed);
      setAuthHeader(jwtToken);

      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(updatedProfile));
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
        errMsg = `Connection Refused: Cannot reach the backend Express API at ${BACKEND_URL}. Please ensure the backend server is running.`;
        console.error(`❌ [Vault3 Auth] Connection refused by the API server at ${BACKEND_URL}. Is it offline?`);
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
      console.log("🔌 [Vault3 Auth] Prompting Web3 wallet connection...");
      const connection = await connectWallet();
      if (!connection || connection.error) {
        throw new Error(connection?.error || "Failed to connect Web3 Wallet. Please authorize access in your extension.");
      }

      const { address, signer: web3Signer } = connection;
      console.log("✅ [Vault3 Auth] Web3 Wallet connected. Address:", address);

      // Step B: Fetch cryptographic signature challenge from backend
      console.log(`📡 [Vault3 Auth] Requesting sign challenge for ${address} from backend...`);
      const challengeResponse = await axios.post(`${API_URL}/auth/web3-challenge`, {
        walletAddress: address
      });
      const { challenge } = challengeResponse.data;
      console.log("✅ [Vault3 Auth] Received cryptographic challenge:", challenge);

      // Step C: Sign the unique challenge message via Web3 Wallet
      console.log("🖋️ [Vault3 Auth] Requesting challenge signature...");
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

      // Check if we already have the Local RSA Private Key in localStorage
      let localRsaKey = localStorage.getItem("w3d_rsa_private_key");
      let seed = null;

      // If we don't have the local private key OR if the backend doesn't have the public key,
      // we need to derive the Master Seed by signing a constant message.
      if (!localRsaKey || !profile.encryptionPublicKey || !profile.encryptedPrivateKey) {
        console.log("🔒 [Vault3 Auth] Local RSA Private Key or Backend keys not found. Prompting to derive Master Seed...");
        const seedMessage = `Sign this message to derive your secure Vault3 Master Vault Seed. This signature will protect your local decryption keys.\n\nWallet: ${address.toLowerCase()}`;
        console.log("🖋️ [Vault3 Auth] Requesting seed derivation signature...");
        const seedSignature = await web3Signer.signMessage(seedMessage);
        console.log("✅ [Vault3 Auth] Seed signature generated successfully.");
        
        seed = deriveMasterSeedFromSignature(seedSignature);
        console.log("🔑 [Vault3 Auth] Master Vault Seed derived successfully!");
      }

      // Initialize RSA Keys
      const updatedProfile = await initializeUserRSAKeys(profile, seed, jwtToken);

      setToken(jwtToken);
      setUser(updatedProfile);
      setAuthType("wallet");
      if (seed) {
        setMasterSeed(seed);
        sessionStorage.setItem("w3d_seed", seed);
      }
      setRsaPrivateKey(localStorage.getItem("w3d_rsa_private_key"));
      setAuthHeader(jwtToken);

      localStorage.setItem("w3d_token", jwtToken);
      localStorage.setItem("w3d_user", JSON.stringify(updatedProfile));
      localStorage.setItem("w3d_authtype", "wallet");

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
        errMsg = `Connection Refused: Cannot reach the backend Express API at ${BACKEND_URL}. Please ensure the backend server is running.`;
        console.error(`❌ [Vault3 Auth] Connection refused by the API server at ${BACKEND_URL}. Is it offline?`);
      } else {
        errMsg = err.message;
      }

      setError(errMsg);
      setIsLoading(false);
      throw new Error(errMsg);
    }
  };

  // Watch for Web3 Wallet address change and auto-logout to prevent security issues
  useEffect(() => {
    if (isAuthenticated && authType === "wallet" && walletAddress && user && user.walletAddress) {
      if (walletAddress.toLowerCase() !== user.walletAddress.toLowerCase()) {
        console.log(`🔄 [Vault3 Auth] Wallet address changed from ${user.walletAddress} to ${walletAddress}. Logging out...`);
        logout();
      }
    }
  }, [walletAddress, isAuthenticated, authType, user, logout]);



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
        rsaPrivateKey,
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
