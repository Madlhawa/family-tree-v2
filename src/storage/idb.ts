/**
 * Low-level key/value storage. Records in `trees` and `meta` carry their own `id`;
 * `settings` uses explicit keys. Higher layers (see encrypted.ts) decide what goes in.
 */

export type StoreName = 'trees' | 'meta' | 'settings';

export type WriteOp = { store: StoreName; key: string; value: unknown } | { store: StoreName; key: string; delete: true };

export interface Kv {
  get(store: StoreName, key: string): Promise<unknown>;
  /** All [key, value] pairs in a store. */
  entries(store: StoreName): Promise<[string, unknown][]>;
  /** Apply several writes atomically. */
  write(ops: WriteOp[]): Promise<void>;
  /** Remove everything. */
  clear(): Promise<void>;
}

const DB_NAME = 'family-tree';
const DB_VERSION = 1;
const STORES: StoreName[] = ['trees', 'meta', 'settings'];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class IndexedDbKv implements Kv {
  private dbp: Promise<IDBDatabase> | null = null;

  constructor(private factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const open = this.factory.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('trees')) db.createObjectStore('trees', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return this.dbp;
  }

  async get(store: StoreName, key: string) {
    const db = await this.db();
    return req(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async entries(store: StoreName): Promise<[string, unknown][]> {
    const db = await this.db();
    const os = db.transaction(store, 'readonly').objectStore(store);
    const [keys, values] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
    return keys.map((k, i) => [String(k), values[i]]);
  }

  async write(ops: WriteOp[]) {
    if (!ops.length) return;
    const db = await this.db();
    const tx = db.transaction([...new Set(ops.map((o) => o.store))], 'readwrite');
    for (const o of ops) {
      const os = tx.objectStore(o.store);
      if ('delete' in o) os.delete(o.key);
      else if (o.store === 'settings') os.put(o.value, o.key);
      else os.put({ ...(o.value as object), id: o.key });
    }
    await txDone(tx);
  }

  async clear() {
    const db = await this.db();
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    await txDone(tx);
  }
}

/** In-memory fallback (private windows without IndexedDB, tests). */
export class MemoryKv implements Kv {
  data: Record<StoreName, Map<string, unknown>> = { trees: new Map(), meta: new Map(), settings: new Map() };
  async get(store: StoreName, key: string) {
    const v = this.data[store].get(key);
    return v === undefined ? undefined : structuredClone(v);
  }
  async entries(store: StoreName): Promise<[string, unknown][]> {
    return [...this.data[store].entries()].map(([k, v]) => [k, structuredClone(v)]);
  }
  async write(ops: WriteOp[]) {
    for (const o of ops) {
      if ('delete' in o) this.data[o.store].delete(o.key);
      else this.data[o.store].set(o.key, structuredClone(o.store === 'settings' ? o.value : { ...(o.value as object), id: o.key }));
    }
  }
  async clear() {
    for (const s of STORES) this.data[s].clear();
  }
}

export function createKv(): Kv {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbKv();
  } catch {
    /* fall through */
  }
  return new MemoryKv();
}
