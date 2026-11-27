import { ChevronRight, Globe2, MapPin } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { displayName } from '../model/people';
import { placesOf } from '../model/stats';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';

const PlacesMap = lazy(() => import('./PlacesMap'));

export type GeoCache = Record<string, { lat: number; lon: number } | null>;

const TYPE_WORD: Record<string, string> = { birth: 'born', death: 'died', marriage: 'married', burial: 'buried', residence: 'lived', baptism: 'baptised', migration: 'moved' };

export function PlacesDialog() {
  const tree = useStore((s) => s.tree)!;
  const repo = useStore((s) => s.repo);
  const publicView = useStore((s) => s.publicView);
  const { setDialog, focus, toast } = useStore.getState();
  const places = useMemo(() => placesOf(tree), [tree]);
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [geo, setGeo] = useState<GeoCache>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    void repo.getSetting<GeoCache>('geocache').then((g) => g && setGeo(g));
  }, [repo]);

  const geocode = async () => {
    const todo = places.filter((p) => !(p.key in geo));
    const next = { ...geo };
    setProgress({ done: 0, total: todo.length });
    for (let i = 0; i < todo.length; i++) {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(todo[i].name)}`, { headers: { Accept: 'application/json' } });
        const j = (await r.json()) as { lat: string; lon: string }[];
        next[todo[i].key] = j[0] ? { lat: +j[0].lat, lon: +j[0].lon } : null;
      } catch {
        toast({ message: 'Could not reach the map service. Try again later.', kind: 'error' });
        break;
      }
      setProgress({ done: i + 1, total: todo.length });
      setGeo({ ...next });
      await new Promise((res) => setTimeout(res, 1100)); // be polite: 1 request per second
    }
    await repo.setSetting('geocache', next);
    setProgress(null);
  };

  const located = places.filter((p) => geo[p.key]);
  return (
    <Dialog title="Places" description={`${places.length} places in this tree`} onClose={() => setDialog(null)} size="lg">
      <div className="px-5 pt-3 flex flex-wrap items-center gap-2">
        <div className="seg">
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            List
          </button>
          <button aria-pressed={mode === 'map'} onClick={() => setMode('map')}>
            Map
          </button>
        </div>
        {mode === 'map' && (
          <span className="text-xs text-muted">
            {located.length} of {places.length} places on the map.
          </span>
        )}
      </div>
      {mode === 'list' ? (
        <ul className="p-5 divide-y divide-line">
          {places.map((pl) => (
            <li key={pl.key}>
              <button className="w-full flex items-center gap-3 py-2.5 text-left" onClick={() => setOpen(open === pl.key ? null : pl.key)} aria-expanded={open === pl.key}>
                <MapPin size={16} className="text-muted shrink-0" />
                <span className="flex-1 text-sm font-medium">{pl.name}</span>
                <span className="text-xs text-muted">{pl.events.length}</span>
                <ChevronRight size={16} className={`text-muted transition-transform ${open === pl.key ? 'rotate-90' : ''}`} />
              </button>
              {open === pl.key && (
                <ul className="pl-7 pb-3 space-y-1">
                  {pl.events.map((e, i) => (
                    <li key={i} className="text-sm">
                      <button className="hover:underline" onClick={() => (setDialog(null), focus(e.personId))}>
                        {displayName(tree.people[e.personId], { privacy: publicView })}
                      </button>{' '}
                      <span className="text-muted">
                        {TYPE_WORD[e.type] ?? e.type}
                        {e.year ? ` ${e.year}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {!places.length && <li className="py-8 text-center text-sm text-muted">Add places to births, marriages and other events to see them here.</li>}
        </ul>
      ) : (
        <div className="p-5 space-y-3">
          {places.some((p) => !(p.key in geo)) && (
            <div className="rounded-lg bg-subtle p-3 text-sm flex flex-wrap items-center gap-3">
              <Globe2 size={18} className="text-muted" />
              <span className="flex-1 min-w-[200px]">
                To show places on the map, their names are looked up with OpenStreetMap’s free Nominatim service. Only place names are sent — no people.
              </span>
              <button className="btn-primary" onClick={geocode} disabled={!!progress}>
                {progress ? `Looking up ${progress.done}/${progress.total}…` : 'Find places on map'}
              </button>
            </div>
          )}
          <Suspense fallback={<div className="h-[420px] rounded-lg bg-subtle animate-pulse" />}>
            <PlacesMap places={located.map((p) => ({ ...p, ...geo[p.key]! }))} tree={tree} privacy={publicView} />
          </Suspense>
        </div>
      )}
    </Dialog>
  );
}
