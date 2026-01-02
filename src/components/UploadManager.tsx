"use client";

import { useObjectStore } from "@/hooks/useObjectStore";
import { Button } from "./ui/Button";
import { useMemo, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function UploadManager() {
  const {
    uploadOpen,
    uploadTasks,
    cancelAllUploads,
    retryFailed,
    hideUploadPanel,
    fetchObjects,
    isPreparing,
    preparingCount,
  } = useObjectStore();

  // Memoize stats to avoid recalculating on every render
  const stats = useMemo(() => {
    const total = uploadTasks.length;
    let done = 0,
      failed = 0,
      uploading = 0,
      queued = 0;
    let progressSum = 0;

    for (const t of uploadTasks) {
      if (t.status === "done") {
        done++;
        progressSum += 1;
      } else if (t.status === "error") {
        failed++;
        progressSum += 1;
      } else if (t.status === "canceled") {
        progressSum += 1;
      } else if (t.status === "uploading") {
        uploading++;
        progressSum += Math.max(0, Math.min(1, t.progress || 0));
      } else {
        queued++;
      }
    }

    const overall = total ? progressSum / total : 0;
    const isComplete = total > 0 && uploading === 0 && queued === 0;
    return { total, done, failed, uploading, queued, overall, isComplete };
  }, [uploadTasks]);

  const { total, done, failed, uploading, queued, overall, isComplete } = stats;

  // Refetch files periodically while uploading
  useEffect(() => {
    if (uploading > 0) {
      const interval = setInterval(() => {
        fetchObjects();
      }, 3000); // Refresh every 3 seconds while uploading
      return () => clearInterval(interval);
    }
  }, [uploading, fetchObjects]);

  // Auto-close panel when all uploads complete (with a delay to show completion)
  useEffect(() => {
    if (isComplete && failed === 0 && total > 0) {
      const timer = setTimeout(() => {
        hideUploadPanel();
        // Clear completed tasks
        useObjectStore.setState({ uploadTasks: [] });
        fetchObjects();
      }, 2000); // Close after 2 seconds
      return () => clearTimeout(timer);
    }
  }, [isComplete, failed, total, hideUploadPanel, fetchObjects]);

  // Only show the last N tasks to avoid rendering thousands
  const visibleTasks = useMemo(() => {
    // Show recent uploads: prioritize uploading, then recent done/failed
    const uploading = uploadTasks.filter((t) => t.status === "uploading");
    const others = uploadTasks
      .filter((t) => t.status !== "uploading")
      .slice(-10);
    return [...uploading.slice(0, 10), ...others].slice(0, 15);
  }, [uploadTasks]);

  if (!uploadOpen && !isPreparing) return null;

  // Show preparing state
  if (isPreparing) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] rounded-xl bg-white/90 backdrop-blur border border-black/10 shadow-xl">
        <div className="px-4 py-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <div>
            <div className="text-sm font-medium text-gray-800">
              Preparing Upload...
            </div>
            <div className="text-xs text-gray-500">
              Processing {preparingCount.toLocaleString()} files, checking for
              duplicates...
            </div>
          </div>
        </div>
        <div className="px-4 pb-3">
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-pulse w-full" />
          </div>
        </div>
      </div>
    );
  }

  const isInProgress = uploading > 0 || queued > 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,420px)] rounded-xl bg-white/90 backdrop-blur border border-black/10 shadow-xl">
      <div className="px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-800">
            {isComplete && failed === 0 ? "Upload Complete!" : "Uploads"}
          </div>
          <div className="text-xs text-gray-500">
            {done}/{total} done • {uploading} active • {queued} queued{" "}
            {failed > 0 && `• ${failed} failed`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isInProgress && (
            <Button size="sm" variant="outline" onClick={cancelAllUploads}>
              Cancel
            </Button>
          )}
          {failed > 0 && (
            <Button size="sm" variant="secondary" onClick={retryFailed}>
              Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={hideUploadPanel}>
            Hide
          </Button>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(0, Math.min(100, overall * 100))}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-400 text-right">
          {Math.round(overall * 100)}%
        </div>
      </div>
      <div className="max-h-64 overflow-auto px-2 pb-2">
        {visibleTasks.map((t) => (
          <div
            key={t.key}
            className="flex items-center gap-2 px-2 py-1 text-sm"
          >
            <div className="flex-1 truncate text-gray-700" title={t.name}>
              {t.name}
            </div>
            <div
              className={`w-20 text-right text-xs ${
                t.status === "error" ? "text-red-500" : "text-gray-500"
              }`}
            >
              {t.status === "uploading"
                ? `${Math.round(t.progress * 100)}%`
                : t.status}
            </div>
          </div>
        ))}
        {total > visibleTasks.length && (
          <div className="text-xs text-gray-400 text-center py-2">
            + {total - visibleTasks.length} more files
          </div>
        )}
      </div>
    </div>
  );
}
