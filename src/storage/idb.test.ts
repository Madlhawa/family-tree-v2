import { IDBFactory } from 'fake-indexeddb';
import { emptyTree, newPerson } from '../model/people';
import { createVault, isSealed } from '../security/crypto';
import { EncryptedRepository, LockedError, readVaultHeader, writeVaultHeader } from './encrypted';
import { IndexedDbKv } from './idb';

const FAST = 1000;

async function setup() {
  const kv = new IndexedDbKv(new IDBFactory());
  const v = await createVault('correct horse battery', FAST);
  return { kv, key: v.key, repo: new EncryptedRepository(kv, v.key) };
}

describe('EncryptedRepository on IndexedDB', () => {
  it('saves, lists, loads and deletes several trees', async () => {
    const { repo } = await setup();
    const a = emptyTree('A');
    const b = emptyTree('B');
    b.updatedAt = a.updatedAt + 10;
    await repo.saveTree(a);
    await repo.saveTree(b);
    expect((await repo.listTrees()).map((m) => m.name)).toEqual(['B', 'A']);
    expect((await repo.loadTree(a.id))?.name).toBe('A');
    await repo.deleteTree(a.id);
    expect((await repo.listTrees()).map((m) => m.name)).toEqual(['B']);
    await repo.setSetting('x', { y: 1 });
    expect(await repo.getSetting('x')).toEqual({ y: 1 });
  });

  it('stores nothing readable: names never appear in the database', async () => {
    const { kv, repo } = await setup();
    const t = emptyTree('Secret Family');
    t.people.p1 = newPerson({ id: 'p1', given: 'Hidden', surname: 'Person' });
    await repo.saveTree(t);
    await repo.setSetting('lastTreeId', t.id);
    const dump = JSON.stringify([await kv.entries('trees'), await kv.entries('meta'), await kv.entries('settings')]);
    expect(dump).not.toMatch(/Secret|Hidden|Person/);
    for (const [, v] of await kv.entries('trees')) expect(isSealed(v)).toBe(true);
  });

  it('refuses to read or write trees without the key, but keeps the theme readable', async () => {
    const { kv, repo } = await setup();
    await repo.saveTree(emptyTree('A'));
    await repo.setSetting('theme', 'dark');
    const locked = new EncryptedRepository(kv);
    await expect(locked.listTrees()).rejects.toBeInstanceOf(LockedError);
    await expect(locked.saveTree(emptyTree('B'))).rejects.toBeInstanceOf(LockedError);
    expect(await locked.getSetting('theme')).toBe('dark');
  });

  it('a different key cannot open the data', async () => {
    const { kv, repo } = await setup();
    const t = emptyTree('A');
    await repo.saveTree(t);
    const other = await createVault('another long password', FAST);
    await expect(new EncryptedRepository(kv, other.key).loadTree(t.id)).rejects.toThrow();
  });

  it('detects records that were swapped between trees', async () => {
    const { kv, repo } = await setup();
    const a = emptyTree('A');
    const b = emptyTree('B');
    await repo.saveTree(a);
    await repo.saveTree(b);
    const aRec = await kv.get('trees', a.id);
    await kv.write([{ store: 'trees', key: b.id, value: aRec }]);
    await expect(repo.loadTree(b.id)).rejects.toThrow();
  });

  it('encrypts data saved before a password existed', async () => {
    const kv = new IndexedDbKv(new IDBFactory());
    const old = emptyTree('Old Tree');
    await kv.write([
      { store: 'trees', key: old.id, value: old },
      { store: 'meta', key: old.id, value: { id: old.id, name: old.name, peopleCount: 0, updatedAt: old.updatedAt } },
      { store: 'settings', key: 'lastTreeId', value: old.id },
      { store: 'settings', key: 'theme', value: 'light' },
    ]);
    const v = await createVault('correct horse battery', FAST);
    await writeVaultHeader(kv, v.header);
    const repo = new EncryptedRepository(kv, v.key);
    expect(await repo.encryptLegacy()).toBe(1);
    const dump = JSON.stringify([await kv.entries('trees'), await kv.entries('meta'), await kv.entries('settings')]);
    expect(dump).not.toContain('Old Tree');
    expect((await repo.loadTree(old.id))?.name).toBe('Old Tree');
    expect(await repo.getSetting('lastTreeId')).toBe(old.id);
    expect(await repo.getSetting('theme')).toBe('light');
    expect((await readVaultHeader(kv))?.v).toBe(1);
  });
});
