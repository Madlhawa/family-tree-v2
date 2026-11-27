/** Only allow http(s) links. Returns a normalised URL or null. */
export function safeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const PLATFORMS = ['Facebook', 'Instagram', 'X', 'LinkedIn', 'GitHub', 'TikTok', 'YouTube', 'Mastodon', 'Other'] as const;

/** Build a profile URL from a handle. Unknown platforms only accept a full http(s) URL. */
export function socialUrl(platform: string, handle: string): string | null {
  const raw = handle.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return safeUrl(raw);
  const h = encodeURIComponent(raw.replace(/^@/, ''));
  switch (platform.toLowerCase()) {
    case 'facebook':
      return `https://www.facebook.com/${h}`;
    case 'instagram':
      return `https://www.instagram.com/${h}`;
    case 'x':
    case 'twitter':
      return `https://x.com/${h}`;
    case 'linkedin':
      return `https://www.linkedin.com/in/${h}`;
    case 'github':
      return `https://github.com/${h}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`;
    case 'youtube':
      return `https://www.youtube.com/@${h}`;
    case 'mastodon': {
      const m = raw.replace(/^@/, '').match(/^([\w.-]+)@([\w.-]+\.[a-z]{2,})$/i);
      return m ? `https://${m[2]}/@${encodeURIComponent(m[1])}` : null;
    }
    default:
      return null;
  }
}
