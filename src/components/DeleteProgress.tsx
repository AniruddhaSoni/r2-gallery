"use client";

import { useObjectStore } from "@/hooks/useObjectStore";
import { Trash2 } from "lucide-react";

export default function DeleteProgress() {
  const { isDeleting, deleteProgress } = useObjectStore();

  if (!isDeleting && deleteProgress.total === 0) return null;

  const { current, total } = deleteProgress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const isComplete = current === total && total > 0;

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[min(92vw,320px)] rounded-xl bg-white/90 backdrop-blur border border-black/10 shadow-xl">
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className={`p-2 rounded-full ${
            isComplete ? "bg-green-100" : "bg-red-100"
          }`}
        >
          <Trash2
            className={`w-4 h-4 ${
              isComplete ? "text-green-600" : "text-red-600"
            }`}
          />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-800">
            {isComplete ? "Delete Complete!" : "Deleting Files..."}
          </div>
          <div className="text-xs text-gray-500">
            {current} / {total} files deleted
          </div>
        </div>
        <div className="text-sm font-medium text-gray-600">{percent}%</div>
      </div>
      <div className="px-4 pb-3">
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-[width] duration-300 ease-out ${
              isComplete ? "bg-green-500" : "bg-red-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
