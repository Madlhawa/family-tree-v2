import { memo } from 'react';
import { TILE_H, TILE_W, type LayoutNode } from '../layout/layout';
import { displayName, initials, isLiving, surnameHue, yearsLabel } from '../model/people';
import type { Person } from '../model/types';
import { Silhouette } from '../ui/fields';

export type Detail = 'full' | 'medium' | 'dot';

interface Props {
  person: Person;
  node: LayoutNode;
  detail: Detail;
  selected: boolean;
  highlighted: boolean;
  dimmed: boolean;
  isFocus: boolean;
  isHome: boolean;
  hasIssue: boolean;
  privacy: boolean;
  dragging?: boolean;
  dragDx?: number;
}

export const Tile = memo(function Tile({ person, node, detail, selected, highlighted, dimmed, isFocus, isHome, hasIssue, privacy, dragging, dragDx = 0 }: Props) {
  const hue = surnameHue(person.birthSurname || person.surname);
  const name = displayName(person, { privacy });
  const years = yearsLabel(person, { privacy });
  const hidePrivate = privacy && isLiving(person);
  const accent = `hsl(${hue} 55% 55%)`;
  const ring = selected ? 'ring-2 ring-accent' : highlighted ? 'ring-2 ring-warn' : isFocus ? 'ring-1 ring-accent/50' : '';
  const style: React.CSSProperties = {
    left: node.x - TILE_W / 2 + dragDx,
    top: node.y,
    width: TILE_W,
    height: TILE_H,
    opacity: dimmed ? 0.28 : 1,
    zIndex: dragging ? 20 : selected ? 5 : 1,
    transition: dragging ? 'none' : 'opacity 150ms',
  };
  const label = `${name}${years ? ', ' + years : ''}${person.occupation && !hidePrivate ? ', ' + person.occupation : ''}`;

  if (detail === 'dot') {
    return (
      <div className="absolute flex items-center justify-center" style={style} data-person={person.id} role="button" aria-label={label}>
        <div
          className={`rounded-full flex items-center justify-center font-bold text-white ${ring}`}
          style={{ width: 120, height: 120, background: person.placeholder ? 'rgb(var(--muted))' : accent, fontSize: 44 }}
        >
          {person.placeholder ? '?' : hidePrivate ? '•' : initials(person)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`absolute rounded-lg bg-surface border ${person.placeholder ? 'border-dashed border-muted/60' : 'border-line'} shadow-soft ${ring} ${
        dragging ? 'shadow-lift cursor-grabbing' : 'cursor-pointer'
      } select-none overflow-hidden`}
      style={style}
      data-person={person.id}
      role="button"
      tabIndex={-1}
      aria-label={label}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent, opacity: person.placeholder ? 0 : 0.85 }} />
      {hasIssue && !privacy && <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-warn ring-2 ring-surface" title="A data check needs attention" />}
      {isHome && <span className="absolute top-2 left-2 text-[10px] font-semibold text-accent">HOME</span>}
      <div className="flex flex-col items-center px-2.5 pt-4 text-center">
        {person.photo && !hidePrivate ? (
          <img src={person.photo} alt="" draggable={false} className="w-16 h-16 rounded-full object-cover bg-subtle" />
        ) : (
          <Silhouette sex={person.sex} size={64} />
        )}
        <div
          className={`mt-2.5 font-semibold leading-tight text-ink ${detail === 'medium' ? 'text-[17px]' : 'text-[14px]'}`}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {person.placeholder && !person.given ? 'Unknown' : name}
        </div>
        {detail === 'full' && (
          <>
            <div className="mt-1 text-[12.5px] text-muted tabular-nums">{years || (person.placeholder ? 'Add details' : ' ')}</div>
            {person.occupation && !hidePrivate && <div className="mt-0.5 text-[11.5px] text-muted truncate w-full">{person.occupation}</div>}
          </>
        )}
      </div>
      {(node.hiddenUp || node.hiddenDown) && detail === 'full' ? (
        <div className="absolute bottom-1.5 inset-x-0 flex justify-center gap-1">
          {node.hiddenUp ? <span className="text-[10.5px] px-1.5 rounded-full bg-subtle text-muted">+{node.hiddenUp} above</span> : null}
          {node.hiddenDown ? <span className="text-[10.5px] px-1.5 rounded-full bg-subtle text-muted">+{node.hiddenDown} below</span> : null}
        </div>
      ) : null}
    </div>
  );
});
