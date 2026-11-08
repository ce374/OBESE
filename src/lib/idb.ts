// Minimal IndexedDB wrapper providing transactional, robust local persistence.
// Stores: workspaces, nodes, blobs.

import type { BlobRecord, NodeRecord, Workspace } from "./types";

const DB_NAME = "knowledge-db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("workspaces")) {
        db.createObjectStore("workspaces", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("nodes")) {
        const store = db.createObjectStore("nodes", { keyPath: "id" });
        store.createIndex("byWorkspace", "workspaceId", { unique: false });
        store.createIndex("byParent", "parentId", { unique: false });
        store.createIndex("byWorkspaceParent", ["workspaceId", "parentId"], {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "nodeId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>) => Promise<T> | T
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeNames, mode);
        const stores: Record<string, IDBObjectStore> = {};
        const names = Array.isArray(storeNames) ? storeNames : [storeNames];
        for (const n of names) stores[n] = transaction.objectStore(n);
        let result: T;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        Promise.resolve(fn(stores))
          .then((r) => {
            result = r;
          })
          .catch((err) => {
            try {
              transaction.abort();
            } catch {
              /* ignore */
            }
            reject(err);
          });
      })
  );
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Workspaces ----

export async function putWorkspace(ws: Workspace): Promise<void> {
  await tx("workspaces", "readwrite", (s) => {
    s.workspaces.put(ws);
  });
}

export async function getWorkspace(id: string): Promise<Workspace | undefined> {
  return tx("workspaces", "readonly", (s) =>
    reqToPromise(s.workspaces.get(id) as IDBRequest<Workspace | undefined>)
  );
}

export async function getAllWorkspaces(): Promise<Workspace[]> {
  return tx("workspaces", "readonly", (s) =>
    reqToPromise(s.workspaces.getAll() as IDBRequest<Workspace[]>)
  );
}

export async function deleteWorkspace(id: string): Promise<void> {
  // Delete workspace + all its nodes + blobs in one transaction.
  await tx(["workspaces", "nodes", "blobs"], "readwrite", async (s) => {
    s.workspaces.delete(id);
    const allNodes = await reqToPromise(
      s.nodes.index("byWorkspace").getAll(id) as IDBRequest<NodeRecord[]>
    );
    for (const n of allNodes) {
      s.nodes.delete(n.id);
      if (n.assetKind === "image" || n.assetKind === "audio" || n.assetKind === "pdf") {
        s.blobs.delete(n.id);
      }
    }
  });
}

// ---- Nodes ----

export async function putNode(node: NodeRecord): Promise<void> {
  await tx("nodes", "readwrite", (s) => {
    s.nodes.put(node);
  });
}

export async function bulkPutNodes(nodes: NodeRecord[]): Promise<void> {
  await tx("nodes", "readwrite", (s) => {
    for (const n of nodes) s.nodes.put(n);
  });
}

export async function getNode(id: string): Promise<NodeRecord | undefined> {
  return tx("nodes", "readonly", (s) =>
    reqToPromise(s.nodes.get(id) as IDBRequest<NodeRecord | undefined>)
  );
}

export async function getNodesByWorkspace(
  workspaceId: string
): Promise<NodeRecord[]> {
  return tx("nodes", "readonly", (s) =>
    reqToPromise(
      s.nodes.index("byWorkspace").getAll(workspaceId) as IDBRequest<NodeRecord[]>
    )
  );
}

export async function deleteNode(id: string): Promise<void> {
  await tx(["nodes", "blobs"], "readwrite", (s) => {
    s.nodes.delete(id);
    s.blobs.delete(id);
  });
}

// Delete a node and all its descendants (recursively). Returns ids deleted.
export async function deleteNodeRecursive(id: string): Promise<string[]> {
  const deleted: string[] = [];
  await tx(["nodes", "blobs"], "readwrite", async (s) => {
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const children = await reqToPromise(
        s.nodes.index("byParent").getAll(cur) as IDBRequest<NodeRecord[]>
      );
      for (const c of children) stack.push(c.id);
      s.nodes.delete(cur);
      s.blobs.delete(cur);
      deleted.push(cur);
    }
  });
  return deleted;
}

// ---- Blobs ----

export async function putBlob(record: BlobRecord): Promise<void> {
  await tx("blobs", "readwrite", (s) => {
    s.blobs.put(record);
  });
}

export async function getBlob(nodeId: string): Promise<Blob | undefined> {
  const rec = await tx("blobs", "readonly", (s) =>
    reqToPromise(s.blobs.get(nodeId) as IDBRequest<BlobRecord | undefined>)
  );
  return rec?.blob;
}

export async function getAllBlobsForWorkspace(
  workspaceId: string
): Promise<Record<string, Blob>> {
  const nodes = await getNodesByWorkspace(workspaceId);
  const ids = nodes.filter((n) => n.assetKind && hasBlob(n.assetKind)).map((n) => n.id);
  if (!ids.length) return {};
  const out: Record<string, Blob> = {};
  await tx("blobs", "readonly", (s) => {
    return Promise.all(
      ids.map(async (id) => {
        const rec = await reqToPromise(
          s.blobs.get(id) as IDBRequest<BlobRecord | undefined>
        );
        if (rec) out[id] = rec.blob;
      })
    );
  });
  return out;
}

function hasBlob(kind: string): boolean {
  return kind === "image" || kind === "audio" || kind === "pdf";
}

// ---- Diagnostics ----

export async function estimateStorage(): Promise<{ usage: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  }
  return { usage: 0, quota: 0 };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}
