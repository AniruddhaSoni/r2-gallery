"use client";

import { useEffect } from "react";
import { useObjectStore } from "./useObjectStore";

export function useKeyboardShortcuts() {
  const {
    selectAll,
    clearSelection,
    bulkDelete,
    bulkDownload,
    bulkCopyLinks,
    selectedKeys,
    objects,
  } = useObjectStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd + A - Select All
      if (isMod && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
      }

      // Escape - Clear Selection
      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Delete or Backspace - Delete selected files
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedKeys.length > 0
      ) {
        e.preventDefault();
        const count = selectedKeys.length;
        const confirm = window.confirm(
          `Delete ${count} file${count > 1 ? "s" : ""}?`
        );
        if (confirm) {
          bulkDelete();
        }
        return;
      }

      // Ctrl/Cmd + D - Download selected files
      if (isMod && e.key === "d" && selectedKeys.length > 0) {
        e.preventDefault();
        bulkDownload();
        return;
      }

      // Ctrl/Cmd + C - Copy links of selected files
      if (isMod && e.key === "c" && selectedKeys.length > 0) {
        e.preventDefault();
        bulkCopyLinks();
        return;
      }

      // Ctrl/Cmd + Shift + A - Deselect All
      if (isMod && e.shiftKey && e.key === "A") {
        e.preventDefault();
        clearSelection();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectAll,
    clearSelection,
    bulkDelete,
    bulkDownload,
    bulkCopyLinks,
    selectedKeys,
    objects,
  ]);
}
