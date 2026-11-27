import { safeUrl, socialUrl } from './urls';

describe('safe links', () => {
  it('only allows http(s)', () => {
    expect(safeUrl('example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('ftp://x.com')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });
  it('builds social URLs safely', () => {
    expect(socialUrl('GitHub', '@octo')).toBe('https://github.com/octo');
    expect(socialUrl('Instagram', 'a/../b')).toBe('https://www.instagram.com/a%2F..%2Fb');
    expect(socialUrl('Mastodon', '@me@mastodon.social')).toBe('https://mastodon.social/@me');
    expect(socialUrl('Other', 'javascript:alert(1)')).toBeNull();
    expect(socialUrl('Other', 'https://my.site')).toBe('https://my.site/');
  });
});
