import "./globals.css";
import { Web3Provider } from "../hooks/useWeb3.js";
import { AuthProvider } from "../hooks/useAuth.js";

export const metadata = {
  title: "Munawar's Drive - Blockchain-Based Decentralized Storage",
  description: "Securely upload, store, encrypt, share, and verify files using blockchain and IPFS.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          body {
            font-family: 'Outfit', sans-serif !important;
          }
        `}</style>
      </head>
      <body>
        <Web3Provider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
