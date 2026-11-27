import type { TreeData, TreeMeta } from '../model/types';
import { isSealed, open, seal, type Sealed, type VaultHeader } from '../security/crypto';
import type { Kv, WriteOp } from './idb';
import { metaOf, type TreeRepository } from './repository';

/** Settings that must be readable before unlocking. Nothing personal goes here. */
export const PLAIN_SETTINGS = new Set(['theme', 'vault', 'lockout']);

const aad = {
  tree: (id: string) => `tree:${id}`,
  meta: (id: string) => `meta:${id}`,
  setting: (k: string) => `setting:${k}`,
};

export class LockedError extends Error {
  constructor() {
    super('The app is locked');
  }
}

/**
 * Repository that encrypts every tree, tree summary and setting with the vault's data key.
 * Plain (pre-encryption) records are still readable so old data can be migrated.
 */
export class EncryptedRepository implements TreeRepository {
  constructor(
    private kv: Kv,
    private key: CryptoKey | null = null,
  ) {}

  get unlocked() {
    return !!this.key;
  }

  private k(): CryptoKey {
    if (!this.key) throw new LockedError();
    return this.key;
  }

  async listTrees(): Promise<TreeMeta[]> {
    const k = this.k();
    const rows = await this.kv.entries('meta');
    const metas = await Promise.all(rows.map(([id, v]) => (isSealed(v) ? open<TreeMeta>(k, v, aad.meta(id)) : (v as TreeMeta))));
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadTree(id: string): Promise<TreeData | undefined> {
    const k = this.k();
    const v = await this.kv.get('trees', id);
    if (!v) return undefined;
    return isSealed(v) ? open<TreeData>(k, v, aad.tree(id)) : (v as TreeData);
  }

  async saveTree(tree: TreeData): Promise<void> {
    const k = this.k();
    const [t, m] = await Promise.all([seal(k, tree, aad.tree(tree.id)), seal(k, metaOf(tree), aad.meta(tree.id))]);
    await this.kv.write([
      { store: 'trees', key: tree.id, value: t },
      { store: 'meta', key: tree.id, value: m },
    ]);
  }

  async deleteTree(id: string): Promise<void> {
    await this.kv.write([
      { store: 'trees', key: id, delete: true },
      { store: 'meta', key: id, delete: true },
    ]);
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    const v = await this.kv.get('settings', key);
    if (PLAIN_SETTINGS.has(key) || v === undefined) return v as T | undefined;
    return isSealed(v) ? open<T>(this.k(), v, aad.setting(key)) : (v as T);
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    const stored = PLAIN_SETTINGS.has(key) ? value : await seal(this.k(), value, aad.setting(key));
    await this.kv.write([{ store: 'settings', key, value: stored }]);
  }

  /** Encrypt any records still stored in plain form (data from before the password was set). */
  async encryptLegacy(): Promise<number> {
    const k = this.k();
    const ops: WriteOp[] = [];
    for (const [id, v] of await this.kv.entries('trees')) {
      if (!isSealed(v)) {
        const tree = v as TreeData;
        ops.push({ store: 'trees', key: id, value: await seal(k, tree, aad.tree(id)) });
        ops.push({ store: 'meta', key: id, value: await seal(k, metaOf(tree), aad.meta(id)) });
      }
    }
    for (const [id, v] of await this.kv.entries('meta')) {
      if (!isSealed(v) && !ops.some((o) => o.store === 'meta' && o.key === id)) ops.push({ store: 'meta', key: id, value: await seal(k, v, aad.meta(id)) });
    }
    for (const [key, v] of await this.kv.entries('settings')) {
      if (!PLAIN_SETTINGS.has(key) && !isSealed(v)) ops.push({ store: 'settings', key, value: await seal(k, v, aad.setting(key)) });
    }
    await this.kv.write(ops);
    return ops.filter((o) => o.store === 'trees').length;
  }
}

export async function readVaultHeader(kv: Kv): Promise<VaultHeader | undefined> {
  const v = (await kv.get('settings', 'vault')) as VaultHeader | undefined;
  return v && v.v === 1 && v.password && v.recovery ? v : undefined;
}

export async function writeVaultHeader(kv: Kv, header: VaultHeader): Promise<void> {
  await kv.write([{ store: 'settings', key: 'vault', value: header }]);
}

/** Count trees saved before encryption was turned on (to tell the user they'll be protected). */
export async function countPlainTrees(kv: Kv): Promise<number> {
  return (await kv.entries('trees')).filter(([, v]) => !isSealed(v)).length;
}

export type { Sealed };
