import type { TreeData, TreeMeta } from '../model/types';
import { metaOf, type TreeRepository } from './repository';

const DB_NAME = 'family-tree';
const DB_VERSION = 1;

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

export class IndexedDbRepository implements TreeRepository {
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

  async listTrees(): Promise<TreeMeta[]> {
    const db = await this.db();
    const tx = db.transaction('meta', 'readonly');
    const all = await req(tx.objectStore('meta').getAll() as IDBRequest<TreeMeta[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadTree(id: string): Promise<TreeData | undefined> {
    const db = await this.db();
    const tx = db.transaction('trees', 'readonly');
    return (await req(tx.objectStore('trees').get(id))) as TreeData | undefined;
  }

  async saveTree(tree: TreeData): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['trees', 'meta'], 'readwrite');
    tx.objectStore('trees').put(tree);
    tx.objectStore('meta').put(metaOf(tree));
    await txDone(tx);
  }

  async deleteTree(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(['trees', 'meta'], 'readwrite');
    tx.objectStore('trees').delete(id);
    tx.objectStore('meta').delete(id);
    await txDone(tx);
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const db = await this.db();
    const tx = db.transaction('settings', 'readonly');
    return (await req(tx.objectStore('settings').get(key))) as T | undefined;
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, key);
    await txDone(tx);
  }
}

/** In-memory fallback (private windows without IndexedDB, tests). */
export class MemoryRepository implements TreeRepository {
  trees = new Map<string, TreeData>();
  settings = new Map<string, unknown>();
  async listTrees() {
    return [...this.trees.values()].map(metaOf).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async loadTree(id: string) {
    const t = this.trees.get(id);
    return t ? structuredClone(t) : undefined;
  }
  async saveTree(tree: TreeData) {
    this.trees.set(tree.id, structuredClone(tree));
  }
  async deleteTree(id: string) {
    this.trees.delete(id);
  }
  async getSetting<T>(key: string) {
    return this.settings.get(key) as T | undefined;
  }
  async setSetting<T>(key: string, value: T) {
    this.settings.set(key, value);
  }
}

export function createRepository(): TreeRepository {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbRepository();
  } catch {
    /* fall through */
  }
  return new MemoryRepository();
}
