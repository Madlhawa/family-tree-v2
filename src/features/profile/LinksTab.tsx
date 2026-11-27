import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { isLiving, uid } from '../../model/people';
import type { Person } from '../../model/types';
import { commitWithToast, useStore } from '../../store/store';
import { PLATFORMS, safeUrl, socialUrl } from '../../util/urls';

export function LinksTab({ person }: { person: Person }) {
  const publicView = useStore((s) => s.publicView);
  const toast = useStore((s) => s.toast);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<string>('Facebook');
  const [handle, setHandle] = useState('');
  if (publicView && isLiving(person)) return <p className="text-sm text-muted">Hidden in public view.</p>;

  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    const u = safeUrl(url);
    if (!u) {
      toast({ message: 'Please enter a web address starting with http:// or https://', kind: 'error' });
      return;
    }
    commitWithToast('Added a link', (d) => {
      d.people[person.id].links.push({ id: uid('l'), label: label.trim() || new URL(u).hostname, url: u });
    }, 'Link added');
    setLabel('');
    setUrl('');
  };
  const addSocial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    if (!socialUrl(platform, handle)) {
      toast({ message: platform === 'Other' ? 'For “Other”, paste the full https:// address.' : 'That handle doesn’t look right.', kind: 'error' });
      return;
    }
    commitWithToast('Added a social profile', (d) => {
      d.people[person.id].socials.push({ id: uid('s'), platform, handle: handle.trim() });
    }, 'Profile added');
    setHandle('');
  };
  const remove = (kind: 'links' | 'socials', id: string) =>
    commitWithToast('Removed a link', (d) => {
      const p = d.people[person.id];
      if (kind === 'links') p.links = p.links.filter((x) => x.id !== id);
      else p.socials = p.socials.filter((x) => x.id !== id);
    }, 'Removed');

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Links</h3>
        <ul className="space-y-1.5">
          {person.links.map((l) => {
            const u = safeUrl(l.url);
            return (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                {u ? (
                  <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline inline-flex items-center gap-1 min-w-0 truncate">
                    <ExternalLink size={13} /> {l.label}
                  </a>
                ) : (
                  <span className="text-muted">{l.label} (blocked: unsafe address)</span>
                )}
                <span className="text-xs text-muted truncate hidden sm:inline">{u && new URL(u).hostname}</span>
                <button className="icon-btn h-8 w-8 ml-auto" aria-label={`Remove ${l.label}`} onClick={() => remove('links', l.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
        <form className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2" onSubmit={addLink}>
          <input className="input" placeholder="Label (e.g. Obituary)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Link label" />
          <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Web address" inputMode="url" />
          <button className="btn-secondary" type="submit">
            <Plus size={15} /> Add link
          </button>
        </form>
      </section>
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Social profiles</h3>
        <ul className="space-y-1.5">
          {person.socials.map((s) => {
            const u = socialUrl(s.platform, s.handle);
            return (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 text-muted">{s.platform}</span>
                {u ? (
                  <a href={u} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline truncate">
                    {s.handle}
                  </a>
                ) : (
                  <span>{s.handle}</span>
                )}
                <button className="icon-btn h-8 w-8 ml-auto" aria-label={`Remove ${s.platform}`} onClick={() => remove('socials', s.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
        <form className="grid sm:grid-cols-[auto_1fr_auto] gap-2" onSubmit={addSocial}>
          <select className="input sm:w-40" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input className="input" placeholder={platform === 'Mastodon' ? '@name@server.social' : platform === 'Other' ? 'https://…' : '@handle'} value={handle} onChange={(e) => setHandle(e.target.value)} aria-label="Handle" />
          <button className="btn-secondary" type="submit">
            <Plus size={15} /> Add
          </button>
        </form>
      </section>
    </div>
  );
}
