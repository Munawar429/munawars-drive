/**
 * Application Configuration
 * Resolves the backend URL dynamically from environment variables.
 */

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";
export const API_URL = `${BACKEND_URL}/api`;

console.log(`🌐 [Web3Drive Config] API Endpoint: ${API_URL}`);
