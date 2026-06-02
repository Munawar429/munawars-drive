# Vault3: Blockchain-Based Decentralized Storage System

Vault3 is a production-ready, high-fidelity decentralized cloud storage platform. It enables users to securely upload, store, share, and verify files using Ethereum-compatible block ledger indexers (Solidity smart contracts) and IPFS (Pinata).

The system is designed with a **Zero-Knowledge client-side encryption architecture** where files are encrypted directly in the user's browser (AES-GCM) prior to transmission, protecting intellectual property and file integrity.

---

## 🧩 Key Architectural Strengths

1. **Client-Side Cryptographic Shielding**: A 256-bit symmetric file AES key is generated for every upload. This key is wrapped in the browser using a Master Vault Seed derived from the user's signature (MetaMask ECDSA) or account credentials (PBKDF2). Plaintext keys are never stored on any database or sent to the backend/IPFS nodes.
2. **Double Database Adaptability**: The backend server is capable of connecting to standard MongoDB (Mongoose) for large production scopes, but automatically loads a 100% platform-independent Local JSON database file fallback for developer evaluation.
3. **Hidden Credentials Upload Proxy**: Files are uploaded to Pinata IPFS using a secure backend Express proxy route, preventing API key exposure in client bundles.
4. **On-Chain Access Controls**: Authorizing wallet access is managed decentralized entirely via our Solidity smart contract.
5. **Interactive Integrity Checker**: Cryptographic SHA-256 integrity checkers query the smart contract in real-time, flashing verified/tampered banners.

---

## 📂 Repository Structure

```
my-final-project/
├── smart-contract/          # Solidity Hardhat environment
│   ├── contracts/
│   │   └── Web3Drive.sol    # Core smart contract
│   ├── scripts/
│   │   └── deploy.js        # Address-syncing deployer
│   ├── test/
│   │   └── Web3Drive.test.js# Chai unit test suite
│   └── hardhat.config.js    # Multi-network loader (Localhost, Sepolia, Amoy)
├── backend/                 # Express Node.js API
│   ├── src/
│   │   ├── config/          # Dual DB wrappers & Contract bindings
│   │   ├── middleware/      # JWT guards
│   │   ├── models/          # Adapters (User & Activity)
│   │   ├── routes/          # Wallet verify, IPFS uploads & audit logs
│   │   └── server.js        # Entrypoint
│   └── .env                 # Server configuration
├── frontend/                # Next.js 14 App Router
│   ├── src/
│   │   ├── app/             # Responsive viewports & Auth page layouts
│   │   ├── components/      # Glassmorphic Sidebar, Upload cards & modals
│   │   ├── hooks/           # Web3 estimateGas and Auth session hooks
│   │   └── utils/           # Web Crypto API client-side encryptors
│   └── package.json
└── README.md
```

---

## ⚙️ Quick Start Setup Guide (Step-by-Step)

Follow these steps to spin up the local development suite:

### 1. Prerequisite Installations
Ensure you have **Node.js (v18+)** and **MetaMask browser extension** active.

### 2. Configure Smart Contract & Local Blockchain
Open a terminal in the `smart-contract/` folder:
```bash
cd smart-contract
# Start a local Ethereum blockchain node (port 8545)
npx hardhat node
```
Open a second terminal in the `smart-contract/` folder:
```bash
cd smart-contract
# Deploy the Web3Drive contract locally & auto-sync ABI/Address configurations
npx hardhat run scripts/deploy.js --network localhost
```
*Tip: This automatically writes contract metadata and ABIs to `frontend/src/utils/Web3Drive.json` and `backend/src/config/Web3Drive.json`!*

### 3. Spin Up Backend API Service
Open a third terminal in the `backend/` folder:
```bash
cd backend
# Starts Express server on http://localhost:5000 (Uses Local JSON database by default)
npm start
```
*Note: If you have MongoDB installed, simply populate the `MONGO_URI` field inside `backend/.env` to switch to a production MongoDB cluster automatically.*

### 4. Boot Frontend Client
Open a fourth terminal in the `frontend/` folder:
```bash
cd frontend
# Launch Next.js dev server on http://localhost:3000
npm run dev
```

---

## 🧪 Running Automated Unit Tests
To verify Solidity smart contract compilers and test suites, run this command in `smart-contract/`:
```bash
cd smart-contract
npx hardhat test
```
*Result: Executes 9 robust test cases verifying uploads, public/private lists, access ACLs, visibility toggles, deletions, and SHA-256 integrity matching.*

---

## 🔑 Real-World Production Setup (Vercel & Testnet Deployment)

When you are ready to deploy to a production staging environment:

### 1. Smart Contract Testnet Deployment
Configure your `.env` parameters inside `smart-contract/.env`:
```env
PRIVATE_KEY=your_metamask_wallet_private_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_alchemy_api_key
AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/your_alchemy_api_key
```
Deploy the contract to the desired network:
```bash
# Sepolia Testnet
npx hardhat run scripts/deploy.js --network sepolia

# Polygon Amoy Testnet
npx hardhat run scripts/deploy.js --network amoy
```
The deploy script will automatically output the new deployed address and synchronize configurations across backend and frontend clients.

### 2. IPFS Setup (Pinata Cloud)
To enable real-world decentralized storage:
1. Register a free account at [Pinata Cloud](https://pinata.cloud/).
2. Generate an API Key or JWT token.
3. Configure your API keys in `backend/.env`:
```env
PINATA_API_KEY=your_key_here
PINATA_API_SECRET=your_secret_here
PINATA_JWT=your_jwt_bearer_token_here
```
Once keys are supplied, the backend Express proxy automatically switches from Local Mock caching to real IPFS Pinning!

### 3. MetaMask Client Setup
1. Open MetaMask.
2. If testing locally, connect your wallet to `Localhost: 8545` (Chain ID: 1337).
3. Import one of the pre-funded private keys printed by `npx hardhat node` into MetaMask to perform immediate transactions with zero gas costs!
4. If testing on Sepolia/Amoy testnet, switch MetaMask to Sepolia or Amoy, and grab testnet gas tokens from public faucets.
