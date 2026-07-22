"use client";

import React, { useState, useEffect } from "react";
import axios from "axios";
import { ethers } from "ethers";
import { UserPlus, Trash2, Copy, Check, Search, BookUser, ShieldCheck, AlertCircle } from "lucide-react";
import { API_URL } from "../utils/config.js";
import { useAuth } from "../hooks/useAuth.js";

export default function Contacts({ onSelectContactForShare }) {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const { isAuthenticated } = useAuth();

  const fetchContacts = async () => {
    if (!isAuthenticated) return;
    setFetching(true);
    try {
      const res = await axios.get(`${API_URL}/contacts`);
      if (res.data && res.data.contacts) {
        setContacts(res.data.contacts);
      }
    } catch (err) {
      console.error("Failed to fetch contacts:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [isAuthenticated]);

  const handleAddContact = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = name.trim();
    let trimmedAddress = address.trim();

    if (!trimmedName || !trimmedAddress) {
      setErrorMessage("Please enter both a contact name and wallet address.");
      return;
    }

    setLoading(true);

    try {
      // 1. Resolve ENS if needed
      if (trimmedAddress.toLowerCase().endsWith(".eth")) {
        try {
          const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
          const resolved = await provider.resolveName(trimmedAddress);
          if (resolved) {
            trimmedAddress = resolved;
          } else {
            setErrorMessage("Could not resolve ENS domain name.");
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn("ENS resolution failed:", e);
        }
      }

      // 2. Strict validation of target address
      if (!ethers.isAddress(trimmedAddress)) {
        setErrorMessage("Invalid Ethereum wallet address. Address must start with 0x and be 42 characters long.");
        setLoading(false);
        return;
      }

      // 3. API Call
      const res = await axios.post(`${API_URL}/contacts`, {
        name: trimmedName,
        address: trimmedAddress.toLowerCase()
      });

      if (res.data && res.data.success) {
        setSuccessMessage(`Contact '${trimmedName}' added successfully!`);
        setName("");
        setAddress("");
        if (res.data.contacts) {
          setContacts(res.data.contacts);
        } else {
          fetchContacts();
        }
      }
    } catch (err) {
      console.error("Add contact error:", err);
      setErrorMessage(err.response?.data?.message || "Failed to save contact. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContact = async (id, contactName) => {
    if (!confirm(`Are you sure you want to remove '${contactName}' from your address book?`)) return;
    
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const res = await axios.delete(`${API_URL}/contacts/${id}`);
      if (res.data && res.data.success) {
        setSuccessMessage(`Contact '${contactName}' removed.`);
        if (res.data.contacts) {
          setContacts(res.data.contacts);
        } else {
          fetchContacts();
        }
      }
    } catch (err) {
      console.error("Delete contact error:", err);
      setErrorMessage("Failed to delete contact.");
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredContacts = contacts.filter((c) => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="p-6 bg-[#0a1929] border border-[#1a2a40] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <BookUser className="h-5 w-5 text-cyan-400" />
            Address Book & Contacts
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Store frequently used recipient wallet addresses for rapid, zero-friction file sharing.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-cyan-950/40 border border-cyan-500/20 px-3 py-1.5 rounded-xl text-xs text-cyan-300">
          <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
          <span>Encrypted Client-Side Key Exchange</span>
        </div>
      </div>

      {/* Add New Contact Form */}
      <div className="bg-[#0a1929] border border-[#1a2a40] rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-cyan-400" />
          Add New Contact
        </h3>

        {errorMessage && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-4">
            <label className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider mb-1.5">
              Contact Name
            </label>
            <input
              type="text"
              placeholder="e.g. Ali / Work Partner"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#080f1e] border border-[#1e3a5f] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          <div className="sm:col-span-6">
            <label className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider mb-1.5">
              Wallet Address or ENS
            </label>
            <input
              type="text"
              placeholder="0x... or name.eth"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#080f1e] border border-[#1e3a5f] rounded-xl text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>

          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-xl transition-all duration-200 shadow-md shadow-cyan-950 flex items-center justify-center gap-2 cursor-pointer h-10"
            >
              {loading ? (
                <span>Saving...</span>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>Save</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Saved Contacts List */}
      <div className="bg-[#0a1929] border border-[#1a2a40] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Saved Contacts ({contacts.length})
          </h3>

          {/* Search Contacts */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[#080f1e] border border-[#1e3a5f] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
            />
          </div>
        </div>

        {fetching ? (
          <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
            Loading your address book...
          </div>
        ) : filteredContacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredContacts.map((c) => (
              <div
                key={c.id}
                className="bg-[#080f1e] border border-[#1a2a40] hover:border-cyan-500/40 p-4 rounded-xl flex items-center justify-between gap-4 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3 truncate">
                  {/* Contact Avatar Circle */}
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-cyan-950 border border-cyan-500/30 flex items-center justify-center font-bold text-sm text-cyan-300 uppercase">
                    {c.name.slice(0, 2)}
                  </div>
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-slate-100 truncate" title={c.name}>
                      {c.name}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate" title={c.address}>
                      {c.address.slice(0, 8)}...{c.address.slice(-6)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(c.address, c.id)}
                    className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/60 rounded-lg transition-colors"
                    title="Copy Address"
                  >
                    {copiedId === c.id ? <Check className="h-4 w-4 text-teal-400" /> : <Copy className="h-4 w-4" />}
                  </button>

                  <button
                    onClick={() => handleDeleteContact(c.id, c.name)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/60 rounded-lg transition-colors"
                    title="Delete Contact"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 border border-slate-800/60 border-dashed rounded-xl text-center">
            <BookUser className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-400">
              {searchQuery ? "No contacts match your search." : "No saved contacts yet."}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {searchQuery ? "Try searching by another name or address." : "Add frequently used wallet addresses above to save them."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
