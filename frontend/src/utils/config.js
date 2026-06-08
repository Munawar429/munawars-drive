let backendUrl = "http://localhost:5000";

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    // Dynamically point to the Express backend on port 5000 of the host machine
    backendUrl = `http://${hostname}:5000`;
  }
}

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || backendUrl;
export const API_URL = `${BACKEND_URL}/api`;

console.log(`🌐 [Web3Drive Config] API Endpoint: ${API_URL}`);
