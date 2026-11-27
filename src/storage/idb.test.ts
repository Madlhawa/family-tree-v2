import { IDBFactory } from 'fake-indexeddb';
import { emptyTree } from '../model/people';
import { IndexedDbRepository } from './idb';

describe('IndexedDbRepository', () => {
  it('saves, lists, loads and deletes several trees', async () => {
    const repo = new IndexedDbRepository(new IDBFactory());
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
});
