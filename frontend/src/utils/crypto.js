import { ethers } from "ethers";

// Hex parsing helpers
export function hexToBytes(hex) {
  let cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  // Ensure even length
  if (cleanHex.length % 2 !== 0) cleanHex = "0" + cleanHex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives a deterministic 256-bit Master Seed from a MetaMask signature.
 */
export function deriveMasterSeedFromSignature(signature) {
  // Compute SHA-256 hash of signature
  const masterSeedHex = ethers.sha256(ethers.toUtf8Bytes(signature));
  return masterSeedHex; // Hex string (0x...)
}

/**
 * Derives a deterministic 256-bit Master Seed from Email & Password client-side.
 * Uses PBKDF2-like derivation via SHA-256 to ensure robust strength.
 */
export async function deriveMasterSeedFromEmailAndPassword(email, password) {
  const encoder = new TextEncoder();
  const salt = encoder.encode(email.toLowerCase());
  const passphrase = encoder.encode(password);

  // Import key material
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    passphrase,
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Derive 256 bits (32 bytes)
  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    baseKey,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Computes SHA-256 hash of a file for blockchain integrity checking.
 */
export async function computeFileHash(fileArrayBuffer) {
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", fileArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Encrypts an ArrayBuffer locally in-browser using AES-GCM.
 * Prepend IV to the ciphertext buffer for easy over-the-wire packaging.
 * Returns: { encryptedBlob: Blob, encryptedKeyHex: String, fileHash: String }
 */
export async function encryptFileClientSide(fileBuffer, masterSeedHex) {
  // 1. Generate random 256-bit file AES Key
  const fileKeyRaw = window.crypto.getRandomValues(new Uint8Array(32));
  
  // 2. Import file AES key
  const cryptoFileKey = await window.crypto.subtle.importKey(
    "raw",
    fileKeyRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // 3. Encrypt file payload using file AES key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoFileKey,
    fileBuffer
  );

  // 4. Pack IV and Ciphertext together: [IV (12 bytes)] + [Ciphertext (Variable)]
  const packedBuffer = new Uint8Array(12 + ciphertextBuffer.byteLength);
  packedBuffer.set(iv, 0);
  packedBuffer.set(new Uint8Array(ciphertextBuffer), 12);

  // Convert packed buffer to blob for uploading
  const encryptedBlob = new Blob([packedBuffer], { type: "application/octet-stream" });

  // 5. Encrypt the file AES key using the Master Seed (AES-GCM)
  const masterKeyBytes = hexToBytes(masterSeedHex);
  const cryptoMasterKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const keyIv = window.crypto.getRandomValues(new Uint8Array(12));
  const encryptedKeyBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: keyIv },
    cryptoMasterKey,
    fileKeyRaw
  );

  // Pack Key IV and Encrypted Key: [KeyIV (12 bytes)] + [EncryptedKey (32 bytes)]
  const packedKey = new Uint8Array(12 + encryptedKeyBuffer.byteLength);
  packedKey.set(keyIv, 0);
  packedKey.set(new Uint8Array(encryptedKeyBuffer), 12);
  const encryptedKeyHex = bytesToHex(packedKey);

  return {
    encryptedBlob,
    encryptedKeyHex,
    fileHash
  };
}

/**
 * Encrypts an ArrayBuffer locally in-browser using AES-GCM and wraps the key using the owner's RSA Public Key.
 * Prepend IV to the ciphertext buffer for easy over-the-wire packaging.
 * Returns: { encryptedBlob: Blob, encryptedKeyHex: String, fileHash: String }
 */
export async function encryptFileClientSideWithRSA(fileBuffer, publicKeyJwkString) {
  // 1. Generate random 256-bit file AES Key
  const fileKeyRaw = window.crypto.getRandomValues(new Uint8Array(32));
  
  // 2. Import file AES key
  const cryptoFileKey = await window.crypto.subtle.importKey(
    "raw",
    fileKeyRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // 3. Encrypt file payload using file AES key
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoFileKey,
    fileBuffer
  );

  // 4. Pack IV and Ciphertext together: [IV (12 bytes)] + [Ciphertext (Variable)]
  const packedBuffer = new Uint8Array(12 + ciphertextBuffer.byteLength);
  packedBuffer.set(iv, 0);
  packedBuffer.set(new Uint8Array(ciphertextBuffer), 12);

  // Convert packed buffer to blob for uploading
  const encryptedBlob = new Blob([packedBuffer], { type: "application/octet-stream" });

  // 5. Encrypt the file AES key using the owner's Public RSA Key
  const encryptedKeyHex = await encryptFileKeyWithRSA(fileKeyRaw, publicKeyJwkString);

  // 6. Compute SHA-256 of the original unencrypted file
  const fileHash = await computeFileHash(fileBuffer);

  return {
    encryptedBlob,
    encryptedKeyHex,
    fileHash
  };
}

/**
 * Decrypts an encrypted ArrayBuffer locally in-browser using AES-GCM.
 * Extracts the IV prepended to the buffer, decrypts the AES key, and then decrypts the file.
 * Returns: ArrayBuffer of original plaintext file.
 */
export async function decryptFileClientSide(encryptedBuffer, encryptedKeyHex, masterSeedHex) {
  // 1. Decrypt the file AES key using the Master Seed
  const packedKeyBytes = hexToBytes(encryptedKeyHex);
  const keyIv = packedKeyBytes.slice(0, 12);
  const encryptedKeyBytes = packedKeyBytes.slice(12);

  const masterKeyBytes = hexToBytes(masterSeedHex);
  const cryptoMasterKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const fileKeyRaw = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: keyIv },
    cryptoMasterKey,
    encryptedKeyBytes
  );

  // 2. Import decrypted file AES key
  const cryptoFileKey = await window.crypto.subtle.importKey(
    "raw",
    new Uint8Array(fileKeyRaw),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // 3. Unpack file IV and Ciphertext from the encryptedBuffer
  const packedFileBytes = new Uint8Array(encryptedBuffer);
  const fileIv = packedFileBytes.slice(0, 12);
  const ciphertextBytes = packedFileBytes.slice(12);

  // 4. Decrypt file payload
  const plaintextBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fileIv },
    cryptoFileKey,
    ciphertextBytes
  );

  return plaintextBuffer;
}

/**
 * Generates a 2048-bit RSA-OAEP keypair for secure file sharing.
 */
export async function generateRSAKeyPair() {
  return await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a crypto key to its JWK JSON string format.
 */
export async function exportKey(key) {
  const jwk = await window.crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
}

/**
 * Imports a Public RSA key from a JWK JSON string.
 */
export async function importPublicKey(jwkString) {
  if (!jwkString) {
    throw new Error("Invalid or corrupted public key found for the recipient. They may need to re-register their account.");
  }
  try {
    let cleanJwk = jwkString;
    if (typeof cleanJwk === "string") {
      cleanJwk = cleanJwk.trim();
      cleanJwk = JSON.parse(cleanJwk);
    } else {
      cleanJwk = { ...cleanJwk };
    }

    if (!cleanJwk || typeof cleanJwk !== "object" || !cleanJwk.kty || cleanJwk.kty !== "RSA") {
      throw new Error("Invalid RSA public key structure.");
    }

    if (cleanJwk.key_ops) {
      cleanJwk.key_ops = ["encrypt"];
    }

    return await window.crypto.subtle.importKey(
      "jwk",
      cleanJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["encrypt"]
    );
  } catch (e) {
    console.error("Web Crypto API importPublicKey error:", e);
    throw new Error("Invalid or corrupted public key found for the recipient. They may need to re-register their account.");
  }
}

/**
 * Imports a Private RSA key from a JWK JSON string.
 */
export async function importPrivateKey(jwkString) {
  if (!jwkString) {
    throw new Error("Local RSA Private Key not found in browser storage. Please log in again.");
  }
  try {
    let cleanJwk = jwkString;
    if (typeof cleanJwk === "string") {
      cleanJwk = cleanJwk.trim();
      cleanJwk = JSON.parse(cleanJwk);
    } else {
      cleanJwk = { ...cleanJwk };
    }

    if (!cleanJwk || typeof cleanJwk !== "object" || !cleanJwk.kty || cleanJwk.kty !== "RSA") {
      throw new Error("Invalid RSA private key structure.");
    }

    if (cleanJwk.key_ops) {
      cleanJwk.key_ops = ["decrypt"];
    }

    return await window.crypto.subtle.importKey(
      "jwk",
      cleanJwk,
      { name: "RSA-OAEP", hash: "SHA-256" },
      true,
      ["decrypt"]
    );
  } catch (e) {
    console.error("Web Crypto API importPrivateKey error:", e);
    throw new Error("Local RSA Private Key is corrupted or invalid. Please log in again.");
  }
}

/**
 * Wraps (encrypts) the RSA private key string using the user's masterSeed.
 */
export async function wrapPrivateKey(privateKeyJson, masterSeedHex) {
  const encoder = new TextEncoder();
  const rawData = encoder.encode(privateKeyJson);

  const masterKeyBytes = hexToBytes(masterSeedHex);
  const cryptoMasterKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoMasterKey,
    rawData
  );

  const packed = new Uint8Array(12 + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), 12);
  return bytesToHex(packed);
}

/**
 * Unwraps (decrypts) the RSA private key using the user's masterSeed.
 */
export async function unwrapPrivateKey(wrappedHex, masterSeedHex) {
  const packed = hexToBytes(wrappedHex);
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const masterKeyBytes = hexToBytes(masterSeedHex);
  const cryptoMasterKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoMasterKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Decrypts a file AES key using the owner's master seed.
 * Extracts the file AES raw bytes directly.
 */
export async function extractFileKeyBytes(encryptedKeyHex, masterSeedHex) {
  const packedKeyBytes = hexToBytes(encryptedKeyHex);
  const keyIv = packedKeyBytes.slice(0, 12);
  const encryptedKeyBytes = packedKeyBytes.slice(12);

  const masterKeyBytes = hexToBytes(masterSeedHex);
  const cryptoMasterKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const fileKeyRaw = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: keyIv },
    cryptoMasterKey,
    encryptedKeyBytes
  );

  return new Uint8Array(fileKeyRaw);
}

/**
 * Encrypts a raw file key with a recipient's public RSA key.
 */
export async function encryptFileKeyWithRSA(fileKeyRawBytes, recipientPublicKeyJwkString) {
  try {
    const publicKey = await importPublicKey(recipientPublicKeyJwkString);
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      fileKeyRawBytes
    );
    return bytesToHex(new Uint8Array(encrypted));
  } catch (e) {
    console.error("Web Crypto API encryptFileKeyWithRSA error:", e);
    if (e.message && e.message.includes("Invalid or corrupted public key")) {
      throw e;
    }
    throw new Error("Invalid or corrupted public key found for the recipient. They may need to re-register their account.");
  }
}

/**
 * Decrypts an encrypted file key using the recipient's private RSA key.
 */
export async function decryptFileKeyWithRSA(encryptedFileKeyHex, myPrivateKeyJwkString) {
  try {
    const privateKey = await importPrivateKey(myPrivateKeyJwkString);
    const encryptedBytes = hexToBytes(encryptedFileKeyHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedBytes
    );
    return new Uint8Array(decrypted);
  } catch (e) {
    console.error("Web Crypto API decryptFileKeyWithRSA error:", e);
    if (e.message && e.message.includes("Local RSA Private Key")) {
      throw e;
    }
    throw new Error("Failed to decrypt file key using RSA private key. The key may be corrupted.");
  }
}

/**
 * Helper function to extract exact smart contract revert reason or Web3 error string from Ethers.js (v6) error objects.
 */
export function extractContractErrorReason(err, defaultFallback = "Transaction failed. Please check your wallet balance and network connection.") {
  if (!err) return defaultFallback;

  // Catch Web Crypto API DOMExceptions (e.g. OperationError, DataError)
  const errName = err?.name || "";
  const errMessage = err?.message || String(err);

  if (
    errName === "OperationError" ||
    errName === "DataError" ||
    errMessage === "OperationError" ||
    errMessage.includes("OperationError") ||
    errMessage.includes("DOMException")
  ) {
    if (errMessage.includes("Invalid or corrupted public key")) {
      return errMessage;
    }
    return "Invalid or corrupted public key found for the recipient. They may need to re-register their account.";
  }

  // 1. Direct string error handling
  if (typeof err === "string") {
    if (err.trim() && !err.trim().startsWith("{") && err.length < 300) {
      return err;
    }
  }

  // 2. Plain JavaScript Error instance thrown by application logic (e.g. new Error("..."))
  if (err instanceof Error || (err.message && !err.code && !err.info && !err.data)) {
    const msg = err.message || String(err);
    if (msg && typeof msg === "string" && !msg.trim().startsWith("{") && !msg.includes("coalesce error") && msg.length < 300) {
      return msg;
    }
  }

  const shortMsg = err?.shortMessage || "";
  
  // Safe stringification for non-Error object properties
  let errString = "";
  try {
    errString = (err && typeof err === "object" && !(err instanceof Error)) ? JSON.stringify(err) : String(err);
  } catch (e) {
    errString = String(err);
  }

  // 3. Detect local Ethers parameter validation errors (like INVALID_ARGUMENT, invalid address, etc.)
  if (err.code === "INVALID_ARGUMENT" || errMessage.includes("INVALID_ARGUMENT") || errMessage.includes("invalid address")) {
    if (errMessage.includes("address")) {
      return "Invalid Ethereum address. Please verify the recipient address.";
    }
    return err.shortMessage || err.reason || "Invalid argument provided. Please check input values.";
  }

  // 4. Check if user cancelled / rejected the transaction in MetaMask/wallet
  const isUserRejected =
    err.code === "ACTION_REJECTED" ||
    err.code === 4001 ||
    err.info?.error?.code === 4001 ||
    errMessage.includes("ACTION_REJECTED") ||
    errMessage.includes("user rejected") ||
    errMessage.includes("User denied") ||
    errMessage.includes("user cancel") ||
    errMessage.includes("4001") ||
    shortMsg.includes("ACTION_REJECTED") ||
    shortMsg.includes("user rejected") ||
    errString.includes("ACTION_REJECTED") ||
    errString.includes("4001");

  if (isUserRejected) {
    return "Transaction cancelled by user. Please approve the MetaMask prompt to complete the upload.";
  }

  // 5. Insufficient gas / funds / network connection errors
  const isGasOrNetworkError =
    err.code === "INSUFFICIENT_FUNDS" ||
    errMessage.includes("INSUFFICIENT_FUNDS") ||
    errMessage.includes("insufficient funds") ||
    errMessage.includes("exceeds allowance") ||
    errMessage.includes("out of gas") ||
    shortMsg.includes("insufficient funds") ||
    errString.includes("INSUFFICIENT_FUNDS");

  if (isGasOrNetworkError) {
    return "Transaction failed. Please check your wallet balance and network connection.";
  }

  // 6. RPC rate limit
  if (errMessage.includes("429") || errMessage.includes("Too many request") || errMessage.includes("drpc") || errString.includes("429")) {
    return "Network congestion: The Sepolia RPC node is currently busy. Please try again.";
  }

  // 7. Direct Ethers v6 contract revert reason property
  if (err.reason && typeof err.reason === "string") {
    let cleanReason = err.reason.replace(/^execution reverted:\s*/i, "").trim();
    if (cleanReason && !cleanReason.startsWith("0x")) return cleanReason;
  }

  // 8. Ethers v6 shortMessage property
  if (err.shortMessage && typeof err.shortMessage === "string") {
    let cleanShort = err.shortMessage.replace(/^execution reverted:\s*/i, "").trim();
    const match = cleanShort.match(/execution reverted(?::\s*"?([^"]+)"?)?/i);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted && !extracted.startsWith("0x")) return extracted;
    }
    if (cleanShort && !cleanShort.includes("could not coalesce") && !cleanShort.startsWith("{") && cleanShort.length < 300) {
      return cleanShort;
    }
  }

  // 9. Ethers error info or response error message (e.g. err.info.error.message)
  const nestedMsg = err.info?.error?.message || err.error?.message || err.data?.message;
  if (nestedMsg && typeof nestedMsg === "string") {
    const match = nestedMsg.match(/execution reverted:\s*([^"'{}\n]+)/i) || nestedMsg.match(/revert:\s*([^"'{}\n]+)/i);
    if (match && match[1]) {
      const extracted = match[1].trim();
      if (extracted && !extracted.startsWith("0x")) return extracted;
    }
  }

  // 10. String message regex extraction
  const match = errMessage.match(/execution reverted:\s*"?([^"'{}\n]+)"?/i) || errMessage.match(/revert:\s*"?([^"'{}\n]+)"?/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    if (extracted && !extracted.startsWith("0x")) {
      return extracted;
    }
  }

  // 11. Clean message fallback
  if (errMessage && typeof errMessage === "string" && !errMessage.trim().startsWith("{") && !errMessage.includes("coalesce error") && errMessage.length < 300) {
    return errMessage;
  }

  return defaultFallback;
}
