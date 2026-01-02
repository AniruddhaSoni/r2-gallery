"use client";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Upload, FolderPlus, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useObjectStore } from "@/hooks/useObjectStore";
import { Button } from "./ui/Button";
import { filesFromDirectoryInput } from "@/lib/dnd";
import { signOut } from "next-auth/react";

export function Header() {
  const {
    searchQuery,
    setSearchQuery,
    currentPrefix,
    createFolder,
    addFolderPickerUploads,
  } = useObjectStore();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 180);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on click outside or Escape
  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node | null;
      const inPopover = popoverRef.current?.contains(target as Node) ?? false;
      const inTrigger = triggerRef.current?.contains(target as Node) ?? false;
      if (!inPopover && !inTrigger) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-md border-b border-black/5">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-gray-800">
              LRN Management
            </h1>
            <div
              className="text-sm text-gray-500 truncate"
              title={currentPrefix || "/"}
            >
              {currentPrefix || "/"}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              aria-label="Upload files"
              onChange={async (e) => {
                const filesList = e.target.files;
                if (!filesList || filesList.length === 0) return;
                const files = Array.from(filesList);
                try {
                  // Use the tracked upload system for progress display
                  const entries = files.map((file) => ({
                    file,
                    relativePath: file.name,
                  }));
                  await addFolderPickerUploads(entries);
                } finally {
                  // Reset the input so selecting the same files again will retrigger change
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-ignore - Chromium specific folder selection
              webkitdirectory=""
              className="hidden"
              aria-label="Upload folder"
              onChange={async (e) => {
                const list = e.target.files;
                if (!list || list.length === 0) return;
                try {
                  const entries = filesFromDirectoryInput(list);
                  await addFolderPickerUploads(entries);
                } finally {
                  if (folderInputRef.current) folderInputRef.current.value = "";
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={async () => {
                const name = window.prompt("New folder name");
                if (!name) return;
                try {
                  await createFolder(name);
                } catch (e) {
                  console.error(e);
                }
              }}
              className="group gap-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              title="Create Folder"
            >
              <FolderPlus className="w-4 h-4" /> New Folder
            </Button>
            <Button
              variant="secondary"
              onClick={() => folderInputRef.current?.click()}
              className="group gap-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
              title="Upload Folder"
            >
              <Upload className="w-4 h-4" /> Upload Folder
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="group gap-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <Upload className="w-4 h-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
              Upload
            </Button>
            <div>
              <button
                aria-label="Open search"
                onClick={() => setOpen((v) => !v)}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
                ref={triggerRef}
              >
                <Search className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            <button
              aria-label="Logout"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 rounded-full bg-gray-100 hover:bg-red-100 transition"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-gray-600 hover:text-red-600" />
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-2 flex justify-end"
              ref={popoverRef}
            >
              <div className="flex items-center gap-2 bg-white shadow-md border border-black/5 rounded-full pl-3 pr-2 py-1">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  ref={inputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={(e) => {
                    // Close if focus moved outside of popover
                    const next = e.relatedTarget as Node | null;
                    const inPopover =
                      popoverRef.current?.contains(next as Node) ?? false;
                    const inTrigger =
                      triggerRef.current?.contains(next as Node) ?? false;
                    if (!inPopover && !inTrigger) setOpen(false);
                  }}
                  placeholder="Search..."
                  className="w-56 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Global modal is rendered in Page using store state now */}
    </header>
  );
}
