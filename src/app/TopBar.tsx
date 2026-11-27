import {
  BarChart3,
  BookOpen,
  CalendarHeart,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Cloud,
  CloudOff,
  Contrast,
  Eye,
  FileDown,
  FolderTree,
  GitCompareArrows,
  History,
  Keyboard,
  ListPlus,
  Loader2,
  MapPin,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Plus,
  Printer,
  Redo2,
  Search,
  Sparkles,
  Sun,
  TreePine,
  Undo2,
} from 'lucide-react';
import { useMemo } from 'react';
import { runChecks } from '../model/checks';
import { yearRange } from '../model/stats';
import { useStore, type View } from '../store/store';
import { Menu, type MenuGroup } from '../ui/Menu';

const VIEWS: { id: View; label: string; short: string }[] = [
  { id: 'family', label: 'Family', short: 'Family' },
  { id: 'ancestors', label: 'Ancestors', short: 'Up' },
  { id: 'descendants', label: 'Descendants', short: 'Down' },
  { id: 'fan', label: 'Fan chart', short: 'Fan' },
];

export function TopBar({ onTour }: { onTour: () => void }) {
  const tree = useStore((s) => s.tree);
  const trees = useStore((s) => s.trees);
  const view = useStore((s) => s.view);
  const saveStatus = useStore((s) => s.saveStatus);
  const publicView = useStore((s) => s.publicView);
  const theme = useStore((s) => s.theme);
  const timeYear = useStore((s) => s.timeYear);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const st = useStore.getState();
  const issueCount = useMemo(() => (tree ? new Set(runChecks(tree).map((i) => i.personId)).size : 0), [tree]);
  const hasPeople = !!tree && Object.keys(tree.people).length > 0;

  const groups: MenuGroup[] = [
    {
      label: 'Find & add',
      items: [
        { label: 'Search', icon: <Search size={16} />, shortcut: '/', onSelect: () => st.setDialog({ type: 'search' }), disabled: !hasPeople, testId: 'menu-search' },
        { label: 'Quick entry', icon: <ListPlus size={16} />, onSelect: () => st.setDialog({ type: 'quickentry', personId: st.selectedId ?? st.focusId }), disabled: !tree, testId: 'menu-quick' },
        { label: 'Relationship finder', icon: <GitCompareArrows size={16} />, onSelect: () => st.setDialog({ type: 'relationship' }), disabled: !hasPeople, testId: 'menu-relationship' },
      ],
    },
    {
      label: 'Explore',
      items: [
        { label: 'Statistics', icon: <BarChart3 size={16} />, onSelect: () => st.setDialog({ type: 'stats' }), disabled: !hasPeople },
        { label: 'On this day', icon: <CalendarHeart size={16} />, onSelect: () => st.setDialog({ type: 'onthisday' }), disabled: !hasPeople },
        { label: 'Places & map', icon: <MapPin size={16} />, onSelect: () => st.setDialog({ type: 'places' }), disabled: !hasPeople },
        {
          label: 'Time slider',
          icon: <Clock size={16} />,
          checked: timeYear !== null,
          disabled: !hasPeople,
          onSelect: () => {
            if (timeYear !== null) st.setTimeYear(null);
            else {
              const [min, max] = yearRange(tree!);
              st.setTimeYear(Math.round((min + max) / 2));
              if (view === 'fan') st.setView('family');
            }
          },
        },
        { label: 'Stories', icon: <BookOpen size={16} />, onSelect: () => st.setDialog({ type: 'stories' }), disabled: !hasPeople },
        { label: 'Printable report / PDF', icon: <Printer size={16} />, onSelect: () => st.setDialog({ type: 'report' }), disabled: !hasPeople },
      ],
    },
    {
      label: 'Tree',
      items: [
        { label: issueCount ? `Data checks (${issueCount})` : 'Data checks', icon: <ClipboardCheck size={16} />, onSelect: () => st.setDialog({ type: 'checks' }), disabled: !hasPeople },
        { label: 'Undo', icon: <Undo2 size={16} />, shortcut: 'Ctrl+Z', onSelect: st.undo, disabled: !canUndo },
        { label: 'Redo', icon: <Redo2 size={16} />, shortcut: 'Ctrl+Y', onSelect: st.redo, disabled: !canRedo },
        { label: 'History', icon: <History size={16} />, onSelect: () => st.setDialog({ type: 'history' }), disabled: !tree },
        { label: 'Import & export', icon: <FileDown size={16} />, onSelect: () => st.setDialog({ type: 'importexport' }), testId: 'menu-importexport' },
        { label: 'Your trees', icon: <FolderTree size={16} />, onSelect: () => st.setDialog({ type: 'trees' }), testId: 'menu-trees' },
        { label: 'Load demo tree', icon: <Sparkles size={16} />, onSelect: () => void st.createTree('Carter family (demo)', { demo: true }), testId: 'menu-demo' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Public view (hide living)', icon: <Eye size={16} />, checked: publicView, onSelect: () => st.setPublicView(!publicView), testId: 'menu-public' },
        { label: 'Light', icon: <Sun size={16} />, checked: theme === 'light', onSelect: () => st.setTheme('light') },
        { label: 'Dark', icon: <Moon size={16} />, checked: theme === 'dark', onSelect: () => st.setTheme('dark') },
        { label: 'Match device', icon: <Monitor size={16} />, checked: theme === 'system', onSelect: () => st.setTheme('system') },
        { label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, shortcut: '?', onSelect: () => st.setDialog({ type: 'shortcuts' }) },
        { label: 'Show the tour', icon: <Contrast size={16} />, onSelect: onTour, disabled: !hasPeople },
      ],
    },
  ];

  const treeGroups: MenuGroup[] = [
    {
      label: 'Switch tree',
      items: trees.map((t) => ({ label: t.name, checked: t.id === tree?.id, onSelect: () => t.id !== tree?.id && void st.openTree(t.id) })),
    },
    {
      items: [
        {
          label: 'New tree',
          icon: <Plus size={16} />,
          onSelect: () =>
            st.setDialog({ type: 'prompt', title: 'New tree', label: 'Name of the new tree', initial: 'My family', confirmLabel: 'Create tree', onConfirm: (n) => void st.createTree(n || 'My family') }),
        },
        { label: 'Manage trees…', icon: <FolderTree size={16} />, onSelect: () => st.setDialog({ type: 'trees' }) },
      ],
    },
  ];

  return (
    <header className="h-14 shrink-0 flex items-center gap-2 px-2 sm:px-3 bg-surface border-b border-line z-20 no-print pt-[env(safe-area-inset-top)] box-content">
      <div className="flex-1 min-w-0 flex items-center">
        {hasPeople && (
          <>
            <div className="seg hidden sm:inline-flex" role="group" aria-label="View" data-tour="views">
              {VIEWS.map((v) => (
                <button key={v.id} aria-pressed={view === v.id} onClick={() => st.setView(v.id)} className="!px-2 lg:!px-3" data-testid={`view-${v.id}`}>
                  <span className="hidden md:inline">{v.label}</span>
                  <span className="md:hidden">{v.short}</span>
                </button>
              ))}
            </div>
            <select
              className="sm:hidden input h-10 w-auto pr-7 font-medium"
              value={view}
              onChange={(e) => st.setView(e.target.value as View)}
              aria-label="View"
              data-tour="views-mobile"
            >
              {VIEWS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="min-w-0 flex justify-center" data-tour="treename">
        <Menu
          label="Trees"
          align="center"
          width={280}
          groups={treeGroups}
          button={({ toggle, ref, open }) => (
            <button ref={ref} onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="btn-ghost max-w-[44vw] sm:max-w-[260px] lg:max-w-[340px] px-2" data-testid="tree-picker">
              <TreePine size={17} className="text-accent shrink-0 hidden sm:block" />
              <span className="truncate font-semibold">{tree?.name ?? 'Family Tree'}</span>
              <ChevronDown size={15} className="text-muted shrink-0" />
            </button>
          )}
        />
      </div>
      <div className="flex-1 flex items-center justify-end gap-1">
        {tree && (
          <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-muted mr-1" role="status" aria-live="polite" data-testid="save-status">
            {saveStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : saveStatus === 'error' ? <CloudOff size={14} className="text-danger" /> : <Cloud size={14} className="text-ok" />}
            {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Not saved!' : 'Saved on this device'}
          </span>
        )}
        {publicView && <span className="chip text-accent border-accent/40 hidden sm:inline-flex">Public view</span>}
        <Menu
          label="Main menu"
          groups={groups}
          width={300}
          button={({ toggle, ref, open }) => (
            <button ref={ref} onClick={toggle} className="btn-secondary px-3" aria-haspopup="menu" aria-expanded={open} data-tour="menu" data-testid="main-menu">
              <MenuIcon size={17} /> <span className="hidden sm:inline">Menu</span>
            </button>
          )}
        />
      </div>
    </header>
  );
}
