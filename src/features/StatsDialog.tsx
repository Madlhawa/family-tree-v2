import { useMemo } from 'react';
import { computeStats } from '../model/stats';
import { displayName } from '../model/people';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Bars({ rows, max, unit = '' }: { rows: { label: string; value: number; extra?: string }[]; max: number; unit?: string }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(90px,30%)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted">{r.label}</span>
          <span className="h-2.5 rounded-full bg-subtle overflow-hidden" aria-hidden>
            <span className="block h-full rounded-full bg-accent" style={{ width: `${max ? (r.value / max) * 100 : 0}%` }} />
          </span>
          <span className="tabular-nums text-right">
            {r.value}
            {unit} {r.extra && <span className="text-muted text-xs">{r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StatsDialog() {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { setDialog, openProfile } = useStore.getState();
  const s = useMemo(() => computeStats(tree), [tree]);
  const home = tree.homeId ? tree.people[tree.homeId] : undefined;
  return (
    <Dialog title="Statistics" onClose={() => setDialog(null)} size="lg">
      <div className="p-5 space-y-7">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="People" value={s.people} />
          <Stat label="Surnames" value={s.surnames} />
          <Stat label="Living" value={s.living} sub={`${s.people - s.living} deceased`} />
          <Stat label="Earliest birth" value={s.earliest?.year ?? '—'} sub={s.earliest && displayName(s.earliest.person, { privacy: publicView })} />
        </div>
        {home && s.completeness.length > 0 && (
          <section>
            <h3 className="font-semibold mb-1">Ancestry completeness</h3>
            <p className="text-sm text-muted mb-3">How many of {displayName(home, { privacy: publicView })}’s ancestors are known in each generation.</p>
            <Bars
              rows={s.completeness.map((c) => ({
                label: c.generation === 1 ? 'Parents' : c.generation === 2 ? 'Grandparents' : `${c.generation - 2 === 1 ? '' : c.generation - 2 + '× '}great-grandparents`,
                value: Math.round((c.found / c.possible) * 100),
                extra: `${c.found}/${c.possible}`,
              }))}
              max={100}
              unit="%"
            />
          </section>
        )}
        <div className="grid sm:grid-cols-2 gap-7">
          <section>
            <h3 className="font-semibold mb-3">Longest lives</h3>
            <ol className="space-y-1.5 text-sm">
              {s.longest.map((l) => (
                <li key={l.person.id} className="flex justify-between gap-2">
                  <button className="text-left hover:underline truncate" onClick={() => openProfile(l.person.id)}>
                    {displayName(l.person, { privacy: publicView })}
                  </button>
                  <span className="tabular-nums text-muted">{l.years} years</span>
                </li>
              ))}
              {!s.longest.length && <li className="text-muted">Add birth and death dates to see this.</li>}
            </ol>
          </section>
          <section>
            <h3 className="font-semibold mb-3">Largest families</h3>
            <ol className="space-y-1.5 text-sm">
              {s.largestFamilies.map((f) => (
                <li key={f.familyId} className="flex justify-between gap-2">
                  <span className="truncate">{publicView ? 'Family' : f.label}</span>
                  <span className="tabular-nums text-muted">{f.children} children</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="font-semibold mb-3">Average lifespan by century of birth</h3>
            <Bars rows={s.lifespanByCentury.map((c) => ({ label: c.century, value: c.avg, extra: `(${c.count})` }))} max={100} unit=" yrs" />
          </section>
          <section>
            <h3 className="font-semibold mb-3">Common names</h3>
            <div className="grid grid-cols-2 gap-4">
              <Bars rows={s.commonGiven.slice(0, 6).map((n) => ({ label: n.name, value: n.count }))} max={s.commonGiven[0]?.count ?? 1} />
              <Bars rows={s.commonSurnames.slice(0, 6).map((n) => ({ label: n.name, value: n.count }))} max={s.commonSurnames[0]?.count ?? 1} />
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}
