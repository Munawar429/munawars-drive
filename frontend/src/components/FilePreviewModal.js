"use client";

import React, { useEffect, useState } from "react";
import { X, ZoomIn, Download, ShieldAlert } from "lucide-react";

export default function FilePreviewModal({ isOpen, onClose, fileData, fileName, fileType }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    if (!isOpen || !fileData) return;

    const type = fileType || "";
    const name = fileName || "";

    const isText = type.startsWith("text/") || 
                   type === "application/json" || 
                   type === "application/javascript" || 
                   name.endsWith(".sol") || 
                   name.endsWith(".py") || 
                   name.endsWith(".js") || 
                   name.endsWith(".ts");

    if (isText) {
      // Decode arraybuffer to string
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(fileData);
      setTextContent(text);
      setObjectUrl("");
    } else {
      // Convert buffer to object URL for images
      const blob = new Blob([fileData], { type: type });
      const url = window.URL.createObjectURL(blob);
      setObjectUrl(url);
      setTextContent("");
    }

    return () => {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [isOpen, fileData, fileType, fileName]);

  if (!isOpen) return null;

  const isImage = fileType && fileType.startsWith("image/");
  const isText = textContent !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050d1a]/85 backdrop-blur-sm">
      <div className="bg-[#0a1929] border border-[#1a2a40] w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl shadow-cyan-950/20">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#1a2a40] bg-[#080f1e] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100 truncate max-w-lg">{fileName}</h3>
            <span className="text-[10px] text-[#4a7fa5] font-mono tracking-wider">{fileType}</span>
          </div>
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-[#0a1929] hover:bg-[#080f1e] text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer border border-[#1a2a40] hover:border-[#38bdf8]/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Viewport Body */}
        <div className="flex-1 overflow-auto bg-[#050d1a] p-6 flex items-center justify-center min-h-[300px]">
          {isImage && objectUrl && (
            <div className="relative group max-w-full max-h-[60vh] overflow-hidden rounded-xl border border-[#1a2a40] shadow-2xl bg-[#080f1e]/40">
              <img 
                src={objectUrl} 
                alt={fileName} 
                className="max-w-full max-h-[60vh] object-contain block"
              />
            </div>
          )}

          {isText && (
            <pre className="w-full max-h-[60vh] overflow-auto p-5 rounded-xl bg-[#080f1e] border border-[#1a2a40] text-slate-350 font-mono text-xs leading-relaxed text-left select-text select-all custom-scrollbar">
              <code>{textContent}</code>
            </pre>
          )}

          {!isImage && !isText && (
            <div className="text-center p-8">
              <ShieldAlert className="h-10 w-10 text-[#22d3ee] mx-auto mb-3 animate-pulse" />
              <p className="text-sm font-semibold text-slate-200">Preview Unsupported</p>
              <p className="text-xs text-[#4a7fa5] mt-1">
                For security reasons, this MIME type must be decrypted and downloaded to view.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#1a2a40] bg-[#080f1e] flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="glass-btn-secondary px-5 py-2 text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
