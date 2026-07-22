"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import Web3DriveConfig from "../utils/Web3Drive.json";

const Web3Context = createContext(null);
const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || Web3DriveConfig.address;

export const Web3Provider = ({ children }) => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [networkName, setNetworkName] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [contract, setContract] = useState(null);
  const [balance, setBalance] = useState("0");
  const [txPending, setTxPending] = useState(false);
  const [error, setError] = useState(null);

  // Initialize Contract helper
  const getContractInstance = useCallback((currentSigner) => {
    if (!Web3DriveConfig || !contractAddress) {
      console.warn("⚠️ Smart contract ABI or address not found! Deploy the contract first.");
      return null;
    }
    try {
      return new ethers.Contract(
        contractAddress,
        Web3DriveConfig.abi,
        currentSigner
      );
    } catch (e) {
      console.error("Failed to instantiate Web3Drive contract:", e);
      return null;
    }
  }, []);

  // Update Account balance
  const updateBalance = useCallback(async (address, currentProvider) => {
    try {
      if (!currentProvider || !address) return;
      const bal = await currentProvider.getBalance(address);
      setBalance(ethers.formatEther(bal));
    } catch (e) {
      console.error("Error fetching balance:", e);
    }
  }, []);

  // Set up Wallet connection
  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      const msg = "Please install a Web3 wallet (like Rabby Wallet or MetaMask) to interact with Web3 features!";
      setError(msg);
      return { error: msg };
    }

    setIsConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const web3Signer = await browserProvider.getSigner();
      let network = await browserProvider.getNetwork();

      const targetChainId = Number(process.env.NEXT_PUBLIC_TARGET_CHAIN_ID || "11155111");
      const targetChainIdHex = "0x" + targetChainId.toString(16);

      if (Number(network.chainId) !== targetChainId) {
        try {
          console.log(`🌐 Requesting network switch to Chain ID ${targetChainId} (${targetChainIdHex})...`);
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: targetChainIdHex }],
          });
          network = await browserProvider.getNetwork();
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              console.log(`🌐 Adding custom network config for Chain ID ${targetChainId}...`);
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: targetChainIdHex,
                    chainName: targetChainId === 11155111 ? "Sepolia Test Network" : "Custom Network",
                    nativeCurrency: {
                      name: "Ether",
                      symbol: "ETH",
                      decimals: 18,
                    },
                    rpcUrls: [
                      process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || (
                        targetChainId === 11155111 
                          ? "https://ethereum-sepolia-rpc.publicnode.com" 
                          : "http://127.0.0.1:8545"
                      )
                    ],
                    blockExplorerUrls: [
                      targetChainId === 11155111 
                        ? "https://sepolia.etherscan.io" 
                        : ""
                    ].filter(Boolean),
                  },
                ],
              });
              network = await browserProvider.getNetwork();
            } catch (addError) {
              console.error("Failed to add network:", addError);
              throw new Error(`Please manually switch your wallet to Sepolia or target network.`);
            }
          } else {
            console.error("Failed to switch network:", switchError);
            throw new Error(`Please manually switch your wallet to Sepolia or target network.`);
          }
        }
      }

      const userAddress = accounts[0];
      setWalletAddress(userAddress);
      setSigner(web3Signer);
      setProvider(browserProvider);
      setChainId(network.chainId.toString());
      setNetworkName(
        network.chainId.toString() === "11155111" ? "Sepolia" :
        network.name === "unknown" ? "Localhost" : network.name
      );
      setIsConnected(true);

      const contractInst = getContractInstance(web3Signer);
      setContract(contractInst);

      await updateBalance(userAddress, browserProvider);
      setIsConnecting(false);
      return { address: userAddress, signer: web3Signer, provider: browserProvider, error: null };
    } catch (err) {
      console.error("Connection Error:", err);
      const errMsg = err.message || "Failed to connect Web3 Wallet";
      setError(errMsg);
      setIsConnecting(false);
      return { error: errMsg };
    }
  }, [getContractInstance, updateBalance]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
    setNetworkName(null);
    setIsConnected(false);
    setContract(null);
    setBalance("0");
    setError(null);
  }, []);

  // Listen to Account and Chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const web3Signer = await browserProvider.getSigner();
        const userAddress = accounts[0];

        setWalletAddress(userAddress);
        setSigner(web3Signer);
        setProvider(browserProvider);
        
        const contractInst = getContractInstance(web3Signer);
        setContract(contractInst);
        
        await updateBalance(userAddress, browserProvider);
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnectWallet, getContractInstance, updateBalance]);

  // Silent Auto-connect if already authorized
  useEffect(() => {
    const tryAutoConnect = async () => {
      if (typeof window !== "undefined" && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length > 0) {
            await connectWallet();
          }
        } catch (e) {
          console.warn("Auto-connect check failed:", e);
        }
      }
    };
    tryAutoConnect();
  }, [connectWallet]);

  /**
   * Estimates GAS FFM cost in Ethers for contract interaction
   */
  const estimateGasFees = async (methodName, ...args) => {
    if (!contract || !provider) return "0.00";
    try {
      if (!contract[methodName] || !contract[methodName].estimateGas) {
        console.warn(`Method ${methodName} or estimateGas is not available on contract.`);
        return "0.0005";
      }
      const gasEstimate = await contract[methodName].estimateGas(...args);
      const feeData = await provider.getFeeData();
      
      const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("1", "gwei");
      const totalCostWei = gasEstimate * gasPrice;
      
      return ethers.formatEther(totalCostWei);
    } catch (e) {
      console.warn(`Gas estimation failed for method ${methodName}:`, e);
      return "0.0005";
    }
  };

  // Helper to get bytes32 hash of a CID/ID string
  const getCidHash = useCallback((ipfsHash) => {
    const safeString = typeof ipfsHash === "string" ? ipfsHash : String(ipfsHash ?? "");
    return ethers.solidityPackedKeccak256(["string"], [safeString]);
  }, []);

  // 1. Upload File metadata on-chain
  const uploadFileOnChain = async (ipfsHash, fileName, fileType, fileSize, encryptedKey, fileHash, isPublic) => {
    if (!contract) throw new Error("Smart contract is not instantiated");
    setTxPending(true);
    try {
      const tx = await contract.uploadFile(
        ipfsHash,
        fileName,
        fileType,
        fileSize,
        encryptedKey,
        fileHash,
        isPublic
      );
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 2. Share access with a wallet address (legacy/fallback wrapper)
  const shareFileOnChain = async (fileId, targetAddress) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    setTxPending(true);
    try {
      const tx = await contract.shareFile(fileId, targetAddress);
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 3. Grant Access using bytes32 CID Hash (New Flow)
  const grantAccessOnChain = async (ipfsHash, recipientAddress) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    setTxPending(true);
    try {
      const safeString = typeof ipfsHash === "string" ? ipfsHash : String(ipfsHash ?? "");
      const cidHash = getCidHash(safeString);
      console.log(`⛓️ [Web3] Granting access for CID/ID ${safeString} (Hash: ${cidHash}) to recipient ${recipientAddress}`);
      const tx = await contract.grantAccess(cidHash, recipientAddress);
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 4. Revoke Access using bytes32 CID Hash (Works for owner revoke & self-revoke)
  const revokeAccessOnChain = async (ipfsHash, recipientAddress) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    setTxPending(true);
    try {
      const safeString = typeof ipfsHash === "string" ? ipfsHash : String(ipfsHash ?? "");
      const cidHash = getCidHash(safeString);
      console.log(`⛓️ [Web3] Revoking access for CID/ID ${safeString} (Hash: ${cidHash}), Recipient: ${recipientAddress}`);
      
      // Request explicit signature match for the overloaded bytes32 method signature
      const tx = await contract.getFunction("revokeAccess(bytes32,address)")(cidHash, recipientAddress);
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 5. Toggle file visibility
  const toggleVisibilityOnChain = async (fileId, isPublic) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    setTxPending(true);
    try {
      const tx = await contract.toggleVisibility(fileId, isPublic);
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 6. Mark file as deleted on-chain
  const deleteFileOnChain = async (fileId) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    setTxPending(true);
    try {
      const tx = await contract.deleteFile(fileId);
      const receipt = await tx.wait();
      setTxPending(false);
      return receipt;
    } catch (e) {
      setTxPending(false);
      throw e;
    }
  };

  // 7. Fetch owned files
  const getMyFilesFromChain = async () => {
    let activeContract = contract;
    let activeProvider = provider;

    if (!activeContract || !activeProvider) {
      if (typeof window !== "undefined" && window.ethereum) {
        try {
          activeProvider = new ethers.BrowserProvider(window.ethereum);
          const activeSigner = await activeProvider.getSigner();
          activeContract = getContractInstance(activeSigner);
        } catch (e) {
          console.warn("Unable to auto-create provider/contract for getMyFilesFromChain:", e);
          return [];
        }
      } else {
        return [];
      }
    }

    if (!activeContract || !activeProvider) return [];

    try {
      const code = await activeProvider.getCode(contractAddress);
      if (!code || code === "0x" || code === "0x0" || code === "0x00") {
        console.warn("⚠️ Smart contract is not active on this network.");
        return [];
      }
      const rawFiles = await activeContract.getMyFiles();
      return Array.from(rawFiles).map(f => ({
        id: Number(f.id),
        ipfsHash: f.ipfsHash,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: Number(f.fileSize),
        encryptedKey: f.encryptedKey,
        fileHash: f.fileHash,
        owner: f.owner,
        timestamp: Number(f.timestamp),
        isPublic: f.isPublic,
        isDeleted: f.isDeleted
      }));
    } catch (e) {
      console.error("Error fetching files from blockchain:", e);
      return [];
    }
  };

  // 8. Fetch shared files
  const getSharedFilesFromChain = async () => {
    let activeContract = contract;
    let activeProvider = provider;

    if (!activeContract || !activeProvider) {
      if (typeof window !== "undefined" && window.ethereum) {
        try {
          activeProvider = new ethers.BrowserProvider(window.ethereum);
          const activeSigner = await activeProvider.getSigner();
          activeContract = getContractInstance(activeSigner);
        } catch (e) {
          console.warn("Unable to auto-create provider/contract for getSharedFilesFromChain:", e);
          return [];
        }
      } else {
        return [];
      }
    }

    if (!activeContract || !activeProvider) return [];

    try {
      const code = await activeProvider.getCode(contractAddress);
      if (!code || code === "0x" || code === "0x0" || code === "0x00") {
        return [];
      }
      const rawFiles = await activeContract.getSharedWithMe();
      return Array.from(rawFiles).map(f => ({
        id: Number(f.id),
        ipfsHash: f.ipfsHash,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: Number(f.fileSize),
        encryptedKey: f.encryptedKey,
        fileHash: f.fileHash,
        owner: f.owner,
        timestamp: Number(f.timestamp),
        isPublic: f.isPublic,
        isDeleted: f.isDeleted
      }));
    } catch (e) {
      console.error("Error fetching shared files from blockchain:", e);
      return [];
    }
  };

  // 9. Verify File Integrity
  const verifyFileIntegrityOnChain = async (fileId, challengeHash) => {
    if (!contract) throw new Error("Smart contract not instantiated");
    try {
      return await contract.verifyFileIntegrity(fileId, challengeHash);
    } catch (e) {
      console.error("Error checking file integrity:", e);
      throw e;
    }
  };

  return (
    <Web3Context.Provider
      value={{
        walletAddress,
        isConnected,
        isConnecting,
        chainId,
        networkName,
        balance,
        contract,
        txPending,
        error,
        connectWallet,
        disconnectWallet,
        estimateGasFees,
        uploadFileOnChain,
        shareFileOnChain,
        grantAccessOnChain,
        revokeAccessOnChain,
        getCidHash,
        toggleVisibilityOnChain,
        deleteFileOnChain,
        getMyFilesFromChain,
        getSharedFilesFromChain,
        verifyFileIntegrityOnChain,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
};
