import { Cake, Flower2, Heart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { onThisDay } from '../model/stats';
import { displayName, isLiving } from '../model/people';
import { useStore } from '../store/store';
import { Dialog } from '../ui/Dialog';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function OnThisDayDialog() {
  const tree = useStore((s) => s.tree)!;
  const publicView = useStore((s) => s.publicView);
  const { setDialog, focus } = useStore.getState();
  const now = new Date();
  const [range, setRange] = useState<0 | 30>(0);
  const entries = useMemo(() => onThisDay(tree, now.getMonth() + 1, now.getDate(), range), [tree, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const thisYear = now.getFullYear();
  return (
    <Dialog title="On this day" description={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} onClose={() => setDialog(null)}>
      <div className="px-5 pt-3">
        <div className="seg">
          <button aria-pressed={range === 0} onClick={() => setRange(0)}>
            Today
          </button>
          <button aria-pressed={range === 30} onClick={() => setRange(30)}>
            Next 30 days
          </button>
        </div>
      </div>
      <ul className="p-5 space-y-2">
        {entries.map((e, i) => {
          const people = e.personIds.map((id) => tree.people[id]).filter(Boolean);
          if (publicView && people.some((p) => isLiving(p))) return null;
          const Icon = e.kind === 'birthday' ? Cake : e.kind === 'anniversary' ? Heart : Flower2;
          const years = thisYear - e.year;
          return (
            <li key={i} className="card p-3 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-subtle flex items-center justify-center shrink-0">
                <Icon size={18} className="text-accent" />
              </span>
              <div className="flex-1 min-w-0">
                <button className="font-medium text-left hover:underline" onClick={() => (setDialog(null), focus(people[0].id))}>
                  {people.map((p) => displayName(p)).join(' & ')}
                </button>
                <div className="text-xs text-muted">
                  {e.label} · {e.day} {MONTHS[e.month - 1]} {e.year}
                  {e.kind === 'birthday' ? ` · turns ${years}` : ` · ${years} years ago`}
                </div>
              </div>
            </li>
          );
        })}
        {!entries.length && <li className="text-sm text-muted text-center py-8">Nothing recorded for {range ? 'the next 30 days' : 'today'}. Full dates (day, month and year) show up here.</li>}
      </ul>
    </Dialog>
  );
}
