import { create } from "zustand";

interface ObjectState {
  objects: any[];
  prefixes: string[]; // folder names (CommonPrefixes)
  selectedKeys: string[];
  searchQuery: string;
  gridLimit: number;
  currentPrefix: string; // path we are viewing
  fetchObjects: () => Promise<void>;
  loadMoreObjects: () => Promise<void>;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  toggleSelect: (key: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  bulkDelete: () => Promise<void>;
  deleteOne: (key: string) => Promise<void>;
  bulkDownload: () => Promise<void>;
  bulkCopyLinks: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  setGridLimit: (n: number) => void;
  setCurrentPrefix: (p: string) => void;
  goUp: () => void;
  createFolder: (name: string) => Promise<void>;
  // Upload management
  uploadOpen: boolean;
  uploadTasks: UploadTask[];
  startDnDUpload: (
    entries: { file: File; relativePath: string }[],
    dirPaths: string[]
  ) => Promise<void>;
  addFolderPickerUploads: (
    entries: { file: File; relativePath: string }[]
  ) => Promise<void>;
  cancelAllUploads: () => void;
  retryFailed: () => void;
  hideUploadPanel: () => void;
  // Links modal state
  linksModalOpen: boolean;
  modalLinks: string[];
  showLinksModal: (links: string[]) => void;
  hideLinksModal: () => void;
  // Delete progress
  isDeleting: boolean;
  deleteProgress: { current: number; total: number };
  hideDeleteProgress: () => void;
  // Upload preparing state
  isPreparing: boolean;
  preparingCount: number;
}

export type UploadStatus =
  | "queued"
  | "uploading"
  | "done"
  | "error"
  | "canceled";
export interface UploadTask {
  key: string;
  name: string;
  size: number;
  progress: number; // 0..1
  status: UploadStatus;
  error?: string;
}

export const useObjectStore = create<ObjectState>((set, get) => ({
  objects: [],
  prefixes: [],
  selectedKeys: [],
  searchQuery: "",
  gridLimit: 96,
  currentPrefix: "",
  uploadOpen: false,
  uploadTasks: [],
  isDeleting: false,
  isPreparing: false,
  preparingCount: 0,
  deleteProgress: { current: 0, total: 0 },
  linksModalOpen: false,
  modalLinks: [],
  isLoading: false,
  isLoadingMore: false,
  hasMore: false,

  fetchObjects: async () => {
    const limit = get().gridLimit;
    const prefix = get().currentPrefix;
    set({ isLoading: true, hasMore: false });
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (prefix) q.set("prefix", prefix);
    const res = await fetch(`/api/objects?${q.toString()}`, {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
    });
    const data = (await res.json()) as any;
    set({
      objects: data.Contents || [],
      prefixes: (data.CommonPrefixes || [])
        .map((p: any) => p.Prefix)
        .filter(Boolean),
      isLoading: false,
      hasMore: Boolean(data.IsTruncated && data.NextContinuationToken),
    });
    // Stash continuation token in a module-scoped place via closure
    (useObjectStore as any)._nextToken =
      data.NextContinuationToken || undefined;
  },

  loadMoreObjects: async () => {
    if (get().isLoadingMore || !get().hasMore) return;
    const limit = get().gridLimit;
    const prefix = get().currentPrefix;
    const token = (useObjectStore as any)._nextToken as string | undefined;
    if (!token) return;
    set({ isLoadingMore: true });
    const q = new URLSearchParams();
    q.set("limit", String(limit));
    if (prefix) q.set("prefix", prefix);
    q.set("continuationToken", token);
    const res = await fetch(`/api/objects?${q.toString()}`, {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
    });
    const data = (await res.json()) as any;
    set((state) => ({
      objects: [...(state.objects || []), ...(data.Contents || [])],
      // prefixes only matter from the first page; keep as-is
      isLoadingMore: false,
      hasMore: Boolean(data.IsTruncated && data.NextContinuationToken),
    }));
    (useObjectStore as any)._nextToken =
      data.NextContinuationToken || undefined;
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),
  setGridLimit: (n: number) => {
    set({ gridLimit: n });
    // Refetch with new limit
    setTimeout(() => get().fetchObjects(), 0);
  },
  setCurrentPrefix: (p: string) =>
    set({
      currentPrefix: p.replace(/^\/+|\/+$/g, "")
        ? p.replace(/^\/+|\/+$/g, "") + "/"
        : "",
    }),
  goUp: () => {
    const cur = get().currentPrefix;
    if (!cur) return;
    const parts = cur.replace(/\/+$/, "").split("/");
    parts.pop();
    const parent = parts.join("/");
    set({ currentPrefix: parent ? parent + "/" : "" });
  },

  createFolder: async (name: string) => {
    const parentPrefix = get().currentPrefix;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
      body: JSON.stringify({ parentPrefix, name }),
    });
    if (!res.ok) {
      let message = "Failed to create folder";
      try {
        const err = (await res.json()) as { error?: string };
        if (err?.error) message = err.error;
      } catch {}
      throw new Error(message);
    }
    await get().fetchObjects();
  },

  // Uploads
  startDnDUpload: async (entries, dirPaths) => {
    await enqueueUploads(entries, dirPaths);
  },
  addFolderPickerUploads: async (entries) => {
    await enqueueUploads(entries);
  },
  cancelAllUploads: () => {
    abortAll();
    fileBlobs.clear();
    set((state) => ({
      uploadTasks: state.uploadTasks.map((t) => ({
        ...t,
        status: t.status === "done" ? t.status : "canceled",
      })),
    }));
  },
  retryFailed: () => {
    const tasks = get().uploadTasks;
    const toRetry: UploadTask[] = tasks.map((t) =>
      t.status === "error" || t.status === "canceled"
        ? {
            ...t,
            status: "queued" as UploadStatus,
            progress: 0,
            error: undefined,
          }
        : t
    );
    set({ uploadTasks: toRetry, uploadOpen: true });
    runQueue();
  },
  hideUploadPanel: () => set({ uploadOpen: false }),

  showLinksModal: (links: string[]) =>
    set({ linksModalOpen: true, modalLinks: links }),
  hideLinksModal: () => set({ linksModalOpen: false, modalLinks: [] }),

  toggleSelect: (key: string) => {
    const current = get().selectedKeys;
    const exists = current.includes(key);
    set({
      selectedKeys: exists
        ? current.filter((k) => k !== key)
        : [...current, key],
    });
  },

  clearSelection: () => set({ selectedKeys: [] }),

  selectAll: () => {
    const allKeys = (get().objects || [])
      .map((o: any) => o.Key)
      .filter(Boolean);
    set({ selectedKeys: allKeys });
  },

  bulkDelete: async () => {
    const keys = get().selectedKeys;
    if (keys.length === 0) return;

    const total = keys.length;
    set({ isDeleting: true, deleteProgress: { current: 0, total } });

    // Delete in batches of 100 for better progress feedback
    const BATCH_SIZE = 100;
    let deleted = 0;

    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      const batch = keys.slice(i, i + BATCH_SIZE);
      try {
        await fetch("/api/objects", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
          },
          body: JSON.stringify({ keys: batch }),
        });
        deleted += batch.length;
        set({ deleteProgress: { current: deleted, total } });

        // Remove deleted keys from local objects progressively
        const deletedSet = new Set(batch);
        set((state) => ({
          objects: state.objects.filter((o: any) => !deletedSet.has(o.Key)),
        }));
      } catch (error) {
        console.error("Delete batch failed:", error);
      }
    }

    set({ selectedKeys: [], isDeleting: false });

    // Auto-hide progress after a short delay
    setTimeout(() => {
      set({ deleteProgress: { current: 0, total: 0 } });
    }, 1500);
  },

  deleteOne: async (key: string) => {
    if (!key) return;
    set({ isDeleting: true, deleteProgress: { current: 0, total: 1 } });

    try {
      await fetch("/api/objects", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
        },
        body: JSON.stringify({ keys: [key] }),
      });

      set({ deleteProgress: { current: 1, total: 1 } });
      const remaining = get().objects.filter((o: any) => o.Key !== key);
      const remainingSelected = get().selectedKeys.filter((k) => k !== key);
      set({ objects: remaining, selectedKeys: remainingSelected });
    } finally {
      set({ isDeleting: false });
      setTimeout(() => {
        set({ deleteProgress: { current: 0, total: 0 } });
      }, 1000);
    }
  },

  hideDeleteProgress: () =>
    set({ isDeleting: false, deleteProgress: { current: 0, total: 0 } }),

  bulkDownload: async () => {
    const keys = get().selectedKeys;
    if (keys.length === 0) return;
    const res = await fetch("/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
      body: JSON.stringify({ keys }),
    });
    const { links } = (await res.json()) as { links?: string[] };
    (links || []).forEach((url: string) => {
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  },

  bulkCopyLinks: async () => {
    const keys = get().selectedKeys;
    if (keys.length === 0) return;
    const res = await fetch("/api/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
      body: JSON.stringify({ keys }),
    });
    const { links } = (await res.json()) as { links?: string[] };
    set({ linksModalOpen: true, modalLinks: links || [] });
  },
}));

// ---- Upload helpers (module scope, use get()/set()) ----

type Store = ReturnType<typeof useObjectStore.getState>;

const uploadControllers = new Map<string, XMLHttpRequest>();
const fileBlobs = new Map<string, File>();

// Throttled state updates for progress (batched every 100ms)
let pendingProgressUpdates: Map<string, number> = new Map();
let progressUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function flushProgressUpdates() {
  if (pendingProgressUpdates.size === 0) return;
  const updates = new Map(pendingProgressUpdates);
  pendingProgressUpdates.clear();
  progressUpdateTimer = null;

  useObjectStore.setState((s) => ({
    uploadTasks: s.uploadTasks.map((t) => {
      const newProgress = updates.get(t.key);
      return newProgress !== undefined ? { ...t, progress: newProgress } : t;
    }),
  }));
}

function throttledProgressUpdate(key: string, progress: number) {
  pendingProgressUpdates.set(key, progress);
  if (!progressUpdateTimer) {
    progressUpdateTimer = setTimeout(flushProgressUpdates, 100);
  }
}

// Batch status updates
let pendingStatusUpdates: Map<
  string,
  { status: UploadStatus; progress?: number; error?: string }
> = new Map();
let statusUpdateTimer: ReturnType<typeof setTimeout> | null = null;

function flushStatusUpdates() {
  if (pendingStatusUpdates.size === 0) return;
  const updates = new Map(pendingStatusUpdates);
  pendingStatusUpdates.clear();
  statusUpdateTimer = null;

  useObjectStore.setState((s) => ({
    uploadTasks: s.uploadTasks.map((t) => {
      const update = updates.get(t.key);
      return update ? { ...t, ...update } : t;
    }),
  }));
}

function batchStatusUpdate(
  key: string,
  update: { status: UploadStatus; progress?: number; error?: string }
) {
  pendingStatusUpdates.set(key, update);
  if (!statusUpdateTimer) {
    statusUpdateTimer = setTimeout(flushStatusUpdates, 50);
  }
}

async function enqueueUploads(
  entries: { file: File; relativePath: string }[],
  dirPaths?: string[]
) {
  // Show preparing state immediately for user feedback
  useObjectStore.setState({
    isPreparing: true,
    preparingCount: entries.length,
    uploadOpen: true,
  });

  const { currentPrefix } = useObjectStore.getState();
  const normalizedBase = (currentPrefix || "").replace(/^\/+|\/+$/g, "");
  const base = normalizedBase ? normalizedBase + "/" : "";

  // Compute intended keys
  let tasks: UploadTask[] = entries.map(({ file, relativePath }) => {
    const rel = String(relativePath || file.name).replace(/^\/+/, "");
    const key = base + rel.replace(/\\/g, "/");
    return {
      key,
      name: rel,
      size: file.size,
      progress: 0,
      status: "queued" as UploadStatus,
    };
  });

  // Batch collision check (check in chunks of 500 to avoid payload limits)
  const BATCH_SIZE = 500;
  const existsMap: Record<string, boolean> = {};
  const allKeys = tasks.map((t) => t.key);

  for (let i = 0; i < allKeys.length; i += BATCH_SIZE) {
    const batch = allKeys.slice(i, i + BATCH_SIZE);
    const batchResult = await checkExists(batch);
    Object.assign(existsMap, batchResult);
  }

  // Done preparing
  useObjectStore.setState({ isPreparing: false, preparingCount: 0 });

  const collisions = tasks.filter((t) => existsMap[t.key]);
  if (collisions.length) {
    const choice = await promptCollisionChoice(collisions.length, tasks.length);
    if (choice.policy === "skip") {
      tasks = tasks.filter((t) => !existsMap[t.key]);
    } else if (choice.policy === "rename") {
      const used = new Set(tasks.map((t) => t.key));
      tasks = tasks.map((t) => {
        if (!existsMap[t.key]) return t;
        let k = t.key;
        let idx = 1;
        const dot = k.lastIndexOf(".");
        const baseName = dot > 0 ? k.slice(0, dot) : k;
        const ext = dot > 0 ? k.slice(dot) : "";
        do {
          k = `${baseName} (${idx})${ext}`;
          idx++;
        } while (existsMap[k] || used.has(k));
        used.add(k);
        return { ...t, key: k };
      });
    }
    // overwrite -> nothing to change
  }

  if (!tasks.length) {
    useObjectStore.setState({ uploadOpen: false });
    return;
  }

  // Stash original files mapped to final task keys
  const byRel = new Map<string, File>();
  for (const { file, relativePath } of entries) {
    const rel = String(relativePath || file.name)
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");
    byRel.set(rel, file);
  }
  const fileMap = new Map<string, File>();
  for (const t of tasks) {
    const f = byRel.get(String(t.name).replace(/\\/g, "/"));
    if (f) {
      fileMap.set(t.key, f);
      fileBlobs.set(t.key, f); // also cache for retries
    }
  }

  // Add tasks in batches to avoid blocking UI
  const state = useObjectStore.getState();
  useObjectStore.setState({
    uploadTasks: [...state.uploadTasks, ...tasks],
    uploadOpen: true,
  });
  runQueue(fileMap);

  // Create empty directory markers in background (don't await)
  if (Array.isArray(dirPaths) && dirPaths.length) {
    createDirectoryMarkers(
      dirPaths,
      base,
      tasks.map((t) => t.key)
    );
  }
}

async function createDirectoryMarkers(
  dirPaths: string[],
  base: string,
  fileKeys: string[]
) {
  for (const dir of dirPaths) {
    const rel = String(dir).replace(/^\/+|\/+$/g, "");
    if (!rel) continue;
    const full = base + rel + "/";
    const hasFile = fileKeys.some((k) => k.startsWith(full));
    if (!hasFile) {
      const parent = rel.includes("/") ? rel.replace(/\/+[^/]+$/, "/") : "";
      const name = rel.split("/").filter(Boolean).slice(-1)[0];
      try {
        await fetch("/api/folders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
          },
          body: JSON.stringify({ parentPrefix: base + parent, name }),
        });
      } catch {}
    }
  }
}

async function checkExists(keys: string[]): Promise<Record<string, boolean>> {
  if (keys.length === 0) return {};
  try {
    const res = await fetch("/api/objects/exists", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`,
      },
      body: JSON.stringify({ keys }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { exists?: Record<string, boolean> };
    return data?.exists || {};
  } catch {
    return {};
  }
}

async function promptCollisionChoice(
  collisionCount: number,
  totalCount: number
): Promise<{ policy: "overwrite" | "skip" | "rename" }> {
  const msg = `${collisionCount} of ${totalCount} files already exist. Type one of: overwrite, skip, rename`;
  // eslint-disable-next-line no-alert
  let input = window.prompt(msg) || "";
  input = input.toLowerCase();
  if (input.startsWith("s")) return { policy: "skip" };
  if (input.startsWith("r")) return { policy: "rename" };
  return { policy: "overwrite" };
}

function runQueue(fileMap?: Map<string, File>) {
  // Increased concurrency for bulk uploads
  const concurrency = 10;
  let active = 0;
  let completedSinceLastRefresh = 0;
  const REFRESH_BATCH_SIZE = 50; // Refresh grid every 50 completed uploads

  const pump = () => {
    const { uploadTasks } = useObjectStore.getState();
    const hasWork = uploadTasks.some(
      (t) => t.status === "queued" || t.status === "uploading"
    );

    if (!hasWork) {
      // Flush any pending updates
      flushProgressUpdates();
      flushStatusUpdates();
      // Done - refresh the grid to show new files
      const { fetchObjects } = useObjectStore.getState();
      fetchObjects();
      return;
    }

    while (active < concurrency) {
      const next = useObjectStore
        .getState()
        .uploadTasks.find((t) => t.status === "queued");
      if (!next) break;

      const file = fileMap?.get(next.key) || fileBlobs.get(next.key);
      if (!file) {
        batchStatusUpdate(next.key, { status: "error", error: "Missing file" });
        continue;
      }

      active++;
      // Mark uploading immediately
      batchStatusUpdate(next.key, { status: "uploading" });

      uploadOne(file, next.key)
        .then(() => {
          batchStatusUpdate(next.key, { status: "done", progress: 1 });
          // Free memory for completed files
          fileBlobs.delete(next.key);
          fileMap?.delete(next.key);

          completedSinceLastRefresh++;
          // Periodic refresh for long uploads
          if (completedSinceLastRefresh >= REFRESH_BATCH_SIZE) {
            completedSinceLastRefresh = 0;
            useObjectStore.getState().fetchObjects();
          }
        })
        .catch((e: any) => {
          const currentTask = useObjectStore
            .getState()
            .uploadTasks.find((t) => t.key === next.key);
          batchStatusUpdate(next.key, {
            status: currentTask?.status === "canceled" ? "canceled" : "error",
            error: e?.message || "Upload failed",
          });
        })
        .finally(() => {
          active--;
          // Use setImmediate pattern to avoid call stack overflow with many files
          setTimeout(pump, 0);
        });
    }
  };
  pump();
}

function uploadOne(file: File, key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("key", key);
    const xhr = new XMLHttpRequest();
    uploadControllers.set(key, xhr);
    xhr.open("POST", "/api/uploads/direct");
    xhr.setRequestHeader(
      "Authorization",
      `Bearer ${process.env.NEXT_PUBLIC_APP_PASSWORD}`
    );

    // Throttled progress updates
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const prog = evt.loaded / Math.max(1, evt.total);
      throttledProgressUpdate(key, prog);
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        uploadControllers.delete(key);
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => {
      uploadControllers.delete(key);
      reject(new Error("Network error"));
    };
    xhr.onabort = () => {
      uploadControllers.delete(key);
      batchStatusUpdate(key, { status: "canceled" });
      reject(new Error("aborted"));
    };
    xhr.send(form);
  });
}

function abortAll() {
  uploadControllers.forEach((xhr) => {
    try {
      xhr.abort();
    } catch {}
  });
  uploadControllers.clear();
}
