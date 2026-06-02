import { 
  FileText, 
  Image, 
  Video, 
  FileCode, 
  HelpCircle,
  Archive
} from "lucide-react";

/**
 * Formats bytes into a human-readable file size string.
 */
export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Shortens a blockchain wallet address.
 */
export function formatAddress(address) {
  if (!address) return "";
  return address.slice(0, 6) + "..." + address.slice(-4);
}

/**
 * Beautifully formats a date string.
 */
export function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Resolves file icons, category classifications, and Tailwind badge styles based on MIME type.
 */
export function getFileTypeMetadata(mimeType, fileName = "") {
  const type = mimeType ? mimeType.toLowerCase() : "";
  const ext = fileName ? fileName.split(".").pop().toLowerCase() : "";

  // 1. Images
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
    return {
      category: "Image",
      icon: Image,
      colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      accentColor: "emerald"
    };
  }

  // 2. Videos
  if (type.startsWith("video/") || ["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
    return {
      category: "Video",
      icon: Video,
      colorClass: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      accentColor: "amber"
    };
  }

  // 3. Audio
  if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "aac"].includes(ext)) {
    return {
      category: "Audio",
      icon: Video,
      colorClass: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
      accentColor: "cyan"
    };
  }

  // 4. Documents & PDFs
  if (
    type === "application/pdf" || 
    ext === "pdf" ||
    ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt"].includes(ext)
  ) {
    return {
      category: "Document",
      icon: FileText,
      colorClass: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      accentColor: "blue"
    };
  }

  // 5. Code
  if (
    type.startsWith("text/") ||
    ["json", "xml", "html", "css", "js", "ts", "jsx", "tsx", "sol", "py", "cpp", "go"].includes(ext)
  ) {
    return {
      category: "Code",
      icon: FileCode,
      colorClass: "text-violet-400 bg-violet-500/10 border-violet-500/20",
      accentColor: "violet"
    };
  }

  // 6. Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return {
      category: "Archive",
      icon: Archive,
      colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      accentColor: "rose"
    };
  }

  // 7. Fallback
  return {
    category: "Other",
    icon: HelpCircle,
    colorClass: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    accentColor: "slate"
  };
}
