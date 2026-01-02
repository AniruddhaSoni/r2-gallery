"use client";

import { useState } from "react";
import { Toast } from "./ui/Toast";
import { Link2, Download, Trash2, FileIcon, Loader2 } from "lucide-react";
import { useObjectStore } from "@/hooks/useObjectStore";

// Get public bucket URL from env (only NEXT_PUBLIC_ vars are available on client)
const BUCKET_URL = process.env.NEXT_PUBLIC_BUCKET_URL;

interface ItemCardProps {
  object: any;
}

export function ItemCard({ object }: ItemCardProps) {
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { selectedKeys, toggleSelect, deleteOne } = useObjectStore();
  const isSelected = selectedKeys.includes(object.Key);

  const fileName = object.Key?.split("/").pop() || object.Key;
  const fileSize = object.Size ? formatFileSize(object.Size) : "-";

  // Build direct public URL
  const getPublicUrl = () => {
    if (BUCKET_URL) {
      const normalizedBase = BUCKET_URL.replace(/\/$/, "");
      const encodedKey = encodeURIComponent(object.Key).replace(/%2F/g, "/");
      return `${normalizedBase}/${encodedKey}`;
    }
    return null;
  };

  const copyLink = async () => {
    // Try direct public URL first
    const publicUrl = getPublicUrl();
    if (publicUrl) {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    // Fallback to signed URL
    try {
      const res = await fetch("/api/objects/signed-get", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
        },
        body: JSON.stringify({ key: object.Key }),
      });
      const { url: signed } = (await res.json()) as { url?: string };
      if (signed) {
        await navigator.clipboard.writeText(signed);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const downloadFile = async () => {
    if (isDownloading) return;
    setIsDownloading(true);

    const filename = fileName;
    const publicUrl = getPublicUrl();

    try {
      if (publicUrl) {
        // Client-side download from public URL
        const response = await fetch(publicUrl);
        if (!response.ok) throw new Error("fetch-failed");

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      } else {
        // Fallback: use same-origin API endpoint
        const sameOrigin = `/api/download/file?key=${encodeURIComponent(
          object.Key
        )}`;
        const fileResp = await fetch(sameOrigin, {
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
          },
        });
        if (!fileResp.ok) throw new Error("fetch-failed");

        const blob = await fileResp.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch (err) {
      console.error("Download failed:", err);
      // Last resort: open in new tab
      const publicUrl = getPublicUrl();
      if (publicUrl) {
        window.open(publicUrl, "_blank");
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const deleteFile = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteOne(object.Key);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer select-none ${
        isSelected ? "bg-blue-50 ring-1 ring-blue-300" : ""
      }`}
      onClick={() => toggleSelect(object.Key)}
      onContextMenu={(e) => {
        e.preventDefault();
        toggleSelect(object.Key);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleSelect(object.Key);
        }
      }}
    >
      <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium text-gray-800 truncate"
          title={object.Key}
        >
          {fileName}
        </p>
        <p className="text-xs text-gray-500 truncate" title={object.Key}>
          {object.Key}
        </p>
      </div>
      <span className="text-xs text-gray-400 flex-shrink-0 w-20 text-right">
        {fileSize}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyLink();
          }}
          className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
          title="Copy Link"
        >
          <Link2 className="w-4 h-4 text-gray-500" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            downloadFile();
          }}
          className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
          title="Download"
          disabled={isDownloading}
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          ) : (
            <Download className="w-4 h-4 text-gray-500" />
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteFile();
          }}
          className="p-1.5 rounded-md hover:bg-red-100 transition-colors"
          title="Delete"
          disabled={isDeleting}
        >
          <Trash2
            className={`w-4 h-4 ${
              isDeleting ? "text-gray-300" : "text-red-500"
            }`}
          />
        </button>
      </div>
      <Toast message="Link Copied!" show={copied} />
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
