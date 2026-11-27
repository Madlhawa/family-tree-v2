import type { TreeData, TreeMeta } from '../model/types';

/**
 * Storage interface. The app only talks to this, so a cloud backend
 * (e.g. Supabase) can be added later next to the IndexedDB one.
 */
export interface TreeRepository {
  listTrees(): Promise<TreeMeta[]>;
  loadTree(id: string): Promise<TreeData | undefined>;
  saveTree(tree: TreeData): Promise<void>;
  deleteTree(id: string): Promise<void>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;
}

export function metaOf(tree: TreeData): TreeMeta {
  return { id: tree.id, name: tree.name, peopleCount: Object.keys(tree.people).length, updatedAt: tree.updatedAt };
}
