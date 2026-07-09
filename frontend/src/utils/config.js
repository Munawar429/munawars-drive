let backendUrl = "http://localhost:5001";

if (typeof window !== "undefined") {
  const hostname = window.location.hostname;
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    // Dynamically point to the Express backend on port 5001 of the host machine
    backendUrl = `http://${hostname}:5001`;
  }
}

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || backendUrl;
export const API_URL = `${BACKEND_URL}/api`;

console.log(`🌐 [Web3Drive Config] API Endpoint: ${API_URL}`);
