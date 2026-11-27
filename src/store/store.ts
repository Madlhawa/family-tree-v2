import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { buildDemoTree } from '../demo/demo';
import { emptyTree, uid } from '../model/people';
import type { TreeData, TreeMeta } from '../model/types';
import { createRepository } from '../storage/idb';
import { metaOf, type TreeRepository } from '../storage/repository';

export type View = 'family' | 'ancestors' | 'descendants' | 'fan';
export type Theme = 'system' | 'light' | 'dark';

export type DialogState =
  | { type: 'search' }
  | { type: 'relationship'; a?: string; b?: string }
  | { type: 'checks' }
  | { type: 'merge'; a: string; b: string }
  | { type: 'stats' }
  | { type: 'onthisday' }
  | { type: 'places' }
  | { type: 'report' }
  | { type: 'stories' }
  | { type: 'importexport'; tab?: 'import' | 'export' }
  | { type: 'trees' }
  | { type: 'history' }
  | { type: 'quickentry'; personId?: string }
  | { type: 'shortcuts' }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }
  | { type: 'prompt'; title: string; label: string; initial?: string; confirmLabel: string; onConfirm: (v: string) => void };

export interface Toast {
  id: string;
  message: string;
  kind?: 'info' | 'success' | 'error';
  undo?: boolean;
  action?: { label: string; run: () => void };
  timeout?: number;
}

export interface LogEntry {
  at: number;
  label: string;
}

export interface AddFormState {
  anchorId: string;
  rel: 'parent' | 'child' | 'spouse' | 'sibling';
  /** screen position of the button that opened it */
  x: number;
  y: number;
}

interface State {
  repo: TreeRepository;
  ready: boolean;
  trees: TreeMeta[];
  tree: TreeData | null;
  past: TreeData[];
  future: TreeData[];
  log: LogEntry[];
  saveStatus: 'saved' | 'saving' | 'error';

  view: View;
  focusId?: string;
  selectedId?: string;
  profile?: { id: string; tab: ProfileTab };
  collapsedUp: Record<string, true>;
  collapsedDown: Record<string, true>;
  publicView: boolean;
  theme: Theme;
  highlight: string[];
  dialog: DialogState | null;
  addForm: AddFormState | null;
  toasts: Toast[];
  fly: { id: string; nonce: number } | null;
  fitNonce: number;
  timeYear: number | null;
  story: { id: string; step: number } | null;
  tourSeen: boolean;
  changesSinceBackup: number;
  lastBackupAt: number;
  backupReminded: boolean;
}

export type ProfileTab = 'about' | 'family' | 'timeline' | 'media' | 'links';

interface Actions {
  init(): Promise<void>;
  commit<R>(label: string, recipe: (d: Draft<TreeData>) => R): R;
  undo(): void;
  redo(): void;
  createTree(name: string, opts?: { demo?: boolean }): Promise<void>;
  openTree(id: string): Promise<void>;
  importTree(tree: TreeData, label?: string): Promise<void>;
  duplicateTree(id: string): Promise<void>;
  deleteTree(id: string): Promise<void>;
  renameTree(name: string): void;
  setView(v: View): void;
  focus(id: string, opts?: { fly?: boolean }): void;
  select(id?: string): void;
  openProfile(id: string, tab?: ProfileTab): void;
  closeProfile(): void;
  toggleCollapse(id: string, dir: 'up' | 'down'): void;
  setDialog(d: DialogState | null): void;
  setAddForm(f: AddFormState | null): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  setTheme(t: Theme): void;
  setPublicView(v: boolean): void;
  setHighlight(ids: string[]): void;
  fitView(): void;
  setTimeYear(y: number | null): void;
  setStory(s: State['story']): void;
  markTourSeen(): void;
  markBackedUp(): void;
}

export type Store = State & Actions;

const MAX_HISTORY = 100;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>()((set, get) => {
  const scheduleSave = () => {
    set({ saveStatus: 'saving' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = undefined;
      const { tree, repo } = get();
      if (!tree) return;
      try {
        await repo.saveTree(tree);
        // a newer edit may have started another save meanwhile
        if (!saveTimer) set({ saveStatus: 'saved', trees: upsertMeta(get().trees, metaOf(tree)) });
      } catch (e) {
        console.error(e);
        set({ saveStatus: 'error' });
      }
    }, 350);
  };

  const flushSave = async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      const { tree, repo } = get();
      if (tree) await repo.saveTree(tree);
    }
  };

  const loadInto = (tree: TreeData | null) => {
    set({
      tree,
      past: [],
      future: [],
      log: [],
      focusId: tree?.homeId,
      selectedId: undefined,
      profile: undefined,
      collapsedUp: {},
      collapsedDown: {},
      highlight: [],
      addForm: null,
      story: null,
      timeYear: null,
      fly: null,
      fitNonce: get().fitNonce + 1,
    });
  };

  const maybeRemindBackup = () => {
    const s = get();
    if (s.backupReminded) return;
    const days = (Date.now() - s.lastBackupAt) / 86400000;
    if (s.changesSinceBackup >= 25 && (s.lastBackupAt === 0 || days > 7)) {
      set({ backupReminded: true });
      get().toast({
        message: 'Your tree lives only on this device. Download a backup now and then.',
        action: { label: 'Back up', run: () => get().setDialog({ type: 'importexport', tab: 'export' }) },
        timeout: 12000,
      });
    }
  };

  return {
    repo: createRepository(),
    ready: false,
    trees: [],
    tree: null,
    past: [],
    future: [],
    log: [],
    saveStatus: 'saved',
    view: 'family',
    collapsedUp: {},
    collapsedDown: {},
    publicView: false,
    theme: 'system',
    highlight: [],
    dialog: null,
    addForm: null,
    toasts: [],
    fly: null,
    fitNonce: 0,
    timeYear: null,
    story: null,
    tourSeen: false,
    changesSinceBackup: 0,
    lastBackupAt: 0,
    backupReminded: false,

    async init() {
      const { repo } = get();
      // Never lose the last edit when the tab is hidden, closed or reloaded.
      const flushNow = () => {
        if (saveTimer) void flushSave().then(() => set({ saveStatus: 'saved' }));
      };
      window.addEventListener('pagehide', flushNow);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow());
      window.addEventListener('beforeunload', flushNow);
      try {
        const [trees, lastId, theme, tourSeen, backup] = await Promise.all([
          repo.listTrees(),
          repo.getSetting<string>('lastTreeId'),
          repo.getSetting<Theme>('theme'),
          repo.getSetting<boolean>('tourSeen'),
          repo.getSetting<{ changes: number; at: number }>('backup'),
        ]);
        set({ trees, theme: theme ?? 'system', tourSeen: !!tourSeen, changesSinceBackup: backup?.changes ?? 0, lastBackupAt: backup?.at ?? 0 });
        const id = lastId && trees.some((t) => t.id === lastId) ? lastId : trees[0]?.id;
        const tree = id ? await repo.loadTree(id) : undefined;
        loadInto(tree ?? null);
      } catch (e) {
        console.error(e);
      }
      set({ ready: true });
    },

    commit(label, recipe) {
      const { tree } = get();
      if (!tree) throw new Error('No tree open');
      let result: ReturnType<typeof recipe> | undefined;
      const next = produce(tree, (d) => {
        result = recipe(d);
        d.updatedAt = Date.now();
      });
      if (next !== tree) {
        const changes = get().changesSinceBackup + 1;
        set({
          tree: next,
          past: [...get().past.slice(-MAX_HISTORY + 1), tree],
          future: [],
          log: [...get().log, { at: Date.now(), label }].slice(-300),
          changesSinceBackup: changes,
        });
        if (!next.people[get().focusId ?? ''] && next.homeId) set({ focusId: next.homeId });
        if (!get().focusId && next.homeId) set({ focusId: next.homeId });
        scheduleSave();
        void get().repo.setSetting('backup', { changes, at: get().lastBackupAt });
        maybeRemindBackup();
      }
      return result as ReturnType<typeof recipe>;
    },

    undo() {
      const { past, tree, future, log } = get();
      if (!past.length || !tree) return;
      const prev = past[past.length - 1];
      const last = log[log.length - 1];
      set({
        tree: prev,
        past: past.slice(0, -1),
        future: [tree, ...future],
        log: [...log, { at: Date.now(), label: `Undid: ${last?.label ?? 'change'}` }],
      });
      if (!prev.people[get().focusId ?? '']) set({ focusId: prev.homeId });
      if (get().profile && !prev.people[get().profile!.id]) set({ profile: undefined });
      scheduleSave();
    },

    redo() {
      const { past, tree, future, log } = get();
      if (!future.length || !tree) return;
      const next = future[0];
      set({ tree: next, past: [...past, tree], future: future.slice(1), log: [...log, { at: Date.now(), label: 'Redid a change' }] });
      scheduleSave();
    },

    async createTree(name, opts) {
      await flushSave();
      const tree = opts?.demo ? buildDemoTree() : emptyTree(name);
      if (opts?.demo) {
        tree.id = uid('t');
        if (name) tree.name = name;
      }
      await get().repo.saveTree(tree);
      await get().repo.setSetting('lastTreeId', tree.id);
      set({ trees: upsertMeta(get().trees, metaOf(tree)) });
      loadInto(tree);
    },

    async openTree(id) {
      await flushSave();
      const tree = await get().repo.loadTree(id);
      if (!tree) return;
      await get().repo.setSetting('lastTreeId', id);
      loadInto(tree);
    },

    async importTree(tree, label) {
      await flushSave();
      tree.id = uid('t');
      tree.updatedAt = Date.now();
      await get().repo.saveTree(tree);
      await get().repo.setSetting('lastTreeId', tree.id);
      set({ trees: upsertMeta(get().trees, metaOf(tree)) });
      loadInto(tree);
      if (label) set({ log: [{ at: Date.now(), label }] });
    },

    async duplicateTree(id) {
      await flushSave();
      const src = await get().repo.loadTree(id);
      if (!src) return;
      const copy: TreeData = { ...structuredClone(src), id: uid('t'), name: `${src.name} (copy)`, updatedAt: Date.now() };
      await get().repo.saveTree(copy);
      set({ trees: upsertMeta(get().trees, metaOf(copy)) });
      get().toast({ message: `Created “${copy.name}”`, kind: 'success' });
    },

    async deleteTree(id) {
      await get().repo.deleteTree(id);
      const trees = get().trees.filter((t) => t.id !== id);
      set({ trees });
      if (get().tree?.id === id) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        if (trees[0]) await get().openTree(trees[0].id);
        else loadInto(null);
      }
    },

    renameTree(name) {
      get().commit('Renamed the tree', (d) => {
        d.name = name;
      });
    },

    setView(view) {
      set({ view, fitNonce: get().fitNonce + 1 });
    },
    focus(id, opts) {
      set({ focusId: id, selectedId: id });
      if (opts?.fly !== false) set({ fly: { id, nonce: Date.now() } });
    },
    select(id) {
      set({ selectedId: id });
    },
    openProfile(id, tab = 'about') {
      set({ profile: { id, tab }, selectedId: id, addForm: null });
    },
    closeProfile() {
      set({ profile: undefined });
    },
    toggleCollapse(id, dir) {
      const key = dir === 'up' ? 'collapsedUp' : 'collapsedDown';
      const cur = { ...get()[key] };
      if (cur[id]) delete cur[id];
      else cur[id] = true;
      set({ [key]: cur } as Partial<State>);
    },
    setDialog(dialog) {
      set({ dialog, addForm: null });
    },
    setAddForm(addForm) {
      set({ addForm });
    },
    toast(t) {
      const id = uid('toast');
      set({ toasts: [...get().toasts.slice(-3), { ...t, id }] });
      setTimeout(() => get().dismissToast(id), t.timeout ?? (t.undo ? 7000 : 4000));
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },
    setTheme(theme) {
      set({ theme });
      void get().repo.setSetting('theme', theme);
    },
    setPublicView(publicView) {
      set({ publicView });
    },
    setHighlight(highlight) {
      set({ highlight });
    },
    fitView() {
      set({ fitNonce: get().fitNonce + 1 });
    },
    setTimeYear(timeYear) {
      set({ timeYear });
    },
    setStory(story) {
      set({ story });
    },
    markTourSeen() {
      set({ tourSeen: true });
      void get().repo.setSetting('tourSeen', true);
    },
    markBackedUp() {
      set({ changesSinceBackup: 0, lastBackupAt: Date.now() });
      void get().repo.setSetting('backup', { changes: 0, at: Date.now() });
    },
  };
});

function upsertMeta(list: TreeMeta[], m: TreeMeta): TreeMeta[] {
  return [m, ...list.filter((x) => x.id !== m.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Commit with a friendly toast that offers Undo. */
export function commitWithToast<R>(label: string, recipe: (d: Draft<TreeData>) => R, message = label): R {
  const s = useStore.getState();
  const r = s.commit(label, recipe);
  s.toast({ message, undo: true, kind: 'success' });
  return r;
}
