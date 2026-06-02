"use client";

import React, { useEffect, useState } from "react";
import { X, ZoomIn, Download } from "lucide-react";

export default function FilePreviewModal({ isOpen, onClose, fileData, fileName, fileType }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [textContent, setTextContent] = useState("");

  useEffect(() => {
    if (!isOpen || !fileData) return;

    const isText = fileType.startsWith("text/") || 
                   fileType === "application/json" || 
                   fileType === "application/javascript" || 
                   fileName.endsWith(".sol") || 
                   fileName.endsWith(".py") || 
                   fileName.endsWith(".js") || 
                   fileName.endsWith(".ts");

    if (isText) {
      // Decode arraybuffer to string
      const decoder = new TextDecoder("utf-8");
      const text = decoder.decode(fileData);
      setTextContent(text);
      setObjectUrl("");
    } else {
      // Convert buffer to object URL for images
      const blob = new Blob([fileData], { type: fileType });
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

  const isImage = fileType.startsWith("image/");
  const isText = textContent !== "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-4xl max-h-[85vh] rounded-2xl flex flex-col overflow-hidden glow-border">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-900 bg-slate-950/40 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 truncate max-w-lg">{fileName}</h3>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider">{fileType}</span>
          </div>
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer border border-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Viewport Body */}
        <div className="flex-1 overflow-auto bg-slate-950/80 p-6 flex items-center justify-center min-h-[300px]">
          {isImage && objectUrl && (
            <div className="relative group max-w-full max-h-[60vh] overflow-hidden rounded-xl border border-slate-900 shadow-2xl bg-slate-900/30">
              <img 
                src={objectUrl} 
                alt={fileName} 
                className="max-w-full max-h-[60vh] object-contain block"
              />
            </div>
          )}

          {isText && (
            <pre className="w-full max-h-[60vh] overflow-auto p-5 rounded-xl bg-slate-950 border border-slate-900 text-slate-300 font-mono text-xs leading-relaxed text-left select-text select-all">
              <code>{textContent}</code>
            </pre>
          )}

          {!isImage && !isText && (
            <div className="text-center p-8">
              <ShieldAlert className="h-10 w-10 text-violet-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Preview Unsupported</p>
              <p className="text-xs text-slate-500 mt-1">
                For security reasons, this MIME type must be decrypted and downloaded to view.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/40 flex items-center justify-end gap-3">
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
