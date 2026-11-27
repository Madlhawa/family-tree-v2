import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { FanChart } from '../canvas/FanChart';
import { TreeCanvas } from '../canvas/TreeCanvas';
import { AddPersonForm } from '../features/AddPersonForm';
import { ChecksDialog, MergeDialog } from '../features/ChecksDialog';
import { ImportExportDialog } from '../features/ImportExportDialog';
import { OnThisDayDialog } from '../features/OnThisDayDialog';
import { ProfileDialog } from '../features/profile/ProfileDialog';
import { RelationshipDialog } from '../features/RelationshipDialog';
import { SearchDialog } from '../features/SearchDialog';
import { ConfirmDialog, HistoryDialog, PromptDialog, QuickEntryDialog, ShortcutsDialog } from '../features/SmallDialogs';
import { StatsDialog } from '../features/StatsDialog';
import { StoriesDialog, StoryPlayer } from '../features/Stories';
import { TimeSlider } from '../features/TimeSlider';
import { TreesDialog } from '../features/TreesDialog';
import { computeLayout } from '../layout/layout';
import { useStore } from '../store/store';
import { Toasts } from '../ui/Toasts';
import { NextSteps, Onboarding } from './Onboarding';
import { TopBar } from './TopBar';
import { Tour } from './Tour';
import { useShortcuts } from './useShortcuts';

const PlacesDialog = lazy(() => import('../features/PlacesDialog').then((m) => ({ default: m.PlacesDialog })));
const ReportView = lazy(() => import('../features/ReportView').then((m) => ({ default: m.ReportView })));

function useTheme() {
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1d23' : '#ffffff');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  const ready = useStore((s) => s.ready);
  const tree = useStore((s) => s.tree);
  const view = useStore((s) => s.view);
  const focusId = useStore((s) => s.focusId);
  const collapsedUp = useStore((s) => s.collapsedUp);
  const collapsedDown = useStore((s) => s.collapsedDown);
  const dialog = useStore((s) => s.dialog);
  const profile = useStore((s) => s.profile);
  const addForm = useStore((s) => s.addForm);
  const story = useStore((s) => s.story);
  const timeYear = useStore((s) => s.timeYear);
  const tourSeen = useStore((s) => s.tourSeen);
  const [tour, setTour] = useState(false);
  useTheme();

  useEffect(() => {
    void useStore.getState().init();
  }, []);

  const hasPeople = !!tree && Object.keys(tree.people).length > 0;
  const focus = tree && focusId && tree.people[focusId] ? focusId : tree?.homeId && tree.people[tree.homeId] ? tree.homeId : tree ? Object.keys(tree.people)[0] : undefined;

  const layout = useMemo(() => {
    if (!tree || !focus || view === 'fan') return null;
    return computeLayout(tree, {
      view,
      focusId: focus,
      collapsedUp: new Set(Object.keys(collapsedUp)),
      collapsedDown: new Set(Object.keys(collapsedDown)),
    });
  }, [tree, focus, view, collapsedUp, collapsedDown]);

  useShortcuts(layout);

  // Show the tour once, the first time someone has a few people
  useEffect(() => {
    if (!tourSeen && tree && Object.keys(tree.people).length >= 3 && !dialog && !profile) {
      const t = setTimeout(() => setTour(true), 800);
      return () => clearTimeout(t);
    }
  }, [tourSeen, tree, dialog, profile]);

  useEffect(() => {
    if (focus && focus !== focusId) useStore.setState({ focusId: focus });
  }, [focus, focusId]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-muted" role="status">
        Loading your family tree…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[70] focus:top-2 focus:left-2 btn-primary">
        Skip to tree
      </a>
      <TopBar onTour={() => setTour(true)} />
      <main id="main" className="relative flex-1 min-h-0" tabIndex={-1}>
        {!hasPeople ? (
          <Onboarding />
        ) : view === 'fan' ? (
          <FanChart />
        ) : (
          layout && (
            <>
              <TreeCanvas layout={layout} />
              {timeYear !== null && <TimeSlider />}
              {timeYear === null && !story && <NextSteps />}
            </>
          )
        )}
      </main>
      {addForm && tree?.people[addForm.anchorId] && <AddPersonForm key={addForm.anchorId + addForm.rel} />}
      {profile && tree?.people[profile.id] && <ProfileDialog />}
      {story && tree && <StoryPlayer />}
      {dialog && (
        <Suspense fallback={null}>
          <DialogHost />
        </Suspense>
      )}
      {tour && hasPeople && (
        <Tour
          onDone={() => {
            setTour(false);
            useStore.getState().markTourSeen();
          }}
        />
      )}
      <Toasts />
    </div>
  );
}

function DialogHost() {
  const d = useStore((s) => s.dialog)!;
  const tree = useStore((s) => s.tree);
  switch (d.type) {
    case 'search':
      return tree ? <SearchDialog /> : null;
    case 'relationship':
      return tree ? <RelationshipDialog a={d.a} b={d.b} /> : null;
    case 'checks':
      return tree ? <ChecksDialog /> : null;
    case 'merge':
      return tree ? <MergeDialog a={d.a} b={d.b} /> : null;
    case 'stats':
      return tree ? <StatsDialog /> : null;
    case 'onthisday':
      return tree ? <OnThisDayDialog /> : null;
    case 'places':
      return tree ? <PlacesDialog /> : null;
    case 'report':
      return tree ? <ReportView /> : null;
    case 'stories':
      return tree ? <StoriesDialog /> : null;
    case 'importexport':
      return <ImportExportDialog tab={d.tab} />;
    case 'trees':
      return <TreesDialog />;
    case 'history':
      return <HistoryDialog />;
    case 'quickentry':
      return tree ? <QuickEntryDialog personId={d.personId} /> : null;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'confirm':
      return <ConfirmDialog d={d} />;
    case 'prompt':
      return <PromptDialog d={d} />;
  }
}
