import { useId, type ReactNode } from 'react';
import { dateHint } from '../model/dates';
import { displayName, initials, isLiving, surnameHue } from '../model/people';
import type { Person, Sex } from '../model/types';

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  type = 'text',
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  type?: string;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-autofocus={autoFocus || undefined}
        data-testid={testId}
      />
    </Field>
  );
}

export function DateField({ label, value, onChange, testId }: { label: string; value: string; onChange: (v: string) => void; testId?: string }) {
  const id = useId();
  const hint = dateHint(value);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        <p className={`text-xs mt-1 min-h-[16px] ${hint && !hint.ok ? 'text-warn' : 'text-muted'}`} aria-live="polite" id={`${id}-hint`}>
          {hint?.text ?? ''}
        </p>
      }
    >
      <input
        id={id}
        className="input"
        value={value}
        placeholder="e.g. 1902, 12 Mar 1902, c. 1850"
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-hint`}
        data-testid={testId}
      />
    </Field>
  );
}

const SEXES: { v: Sex; label: string }[] = [
  { v: 'male', label: 'Male' },
  { v: 'female', label: 'Female' },
  { v: 'unknown', label: 'Unknown' },
];

export function SexToggle({ value, onChange, includeOther }: { value: Sex; onChange: (s: Sex) => void; includeOther?: boolean }) {
  const opts = includeOther ? [...SEXES, { v: 'other' as Sex, label: 'Other' }] : SEXES;
  return (
    <div className="seg w-full" role="radiogroup" aria-label="Sex">
      {opts.map((o) => (
        <button
          type="button"
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          aria-pressed={value === o.v}
          className="flex-1"
          onClick={() => onChange(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ person, size = 40, privacy }: { person: Person; size?: number; privacy?: boolean }) {
  const hidePhoto = privacy && isLiving(person);
  const hue = surnameHue(person.birthSurname || person.surname);
  if (person.photo && !hidePhoto)
    return <img src={person.photo} alt="" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return (
    <span
      className="rounded-full shrink-0 inline-flex items-center justify-center font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `hsl(${hue} 60% 92%)`,
        color: `hsl(${hue} 45% 32%)`,
      }}
      aria-hidden
    >
      {person.placeholder ? '?' : initials(person)}
    </span>
  );
}

export function PersonChip({ person, onClick, privacy, sub }: { person: Person; onClick?: () => void; privacy?: boolean; sub?: string }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-3 py-1 text-sm max-w-full ${onClick ? 'hover:bg-subtle' : ''}`}
    >
      <Avatar person={person} size={26} privacy={privacy} />
      <span className="truncate">{displayName(person, { privacy })}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </Comp>
  );
}

export function Silhouette({ sex, size = 64 }: { sex: Sex; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="32" fill="rgb(var(--subtle))" />
      <circle cx="32" cy="25" r="11" fill="rgb(var(--line))" />
      <path d={sex === 'female' ? 'M12 56c2-12 10-18 20-18s18 6 20 18z' : 'M11 57c2-12 10-19 21-19s19 7 21 19z'} fill="rgb(var(--line))" />
    </svg>
  );
}
