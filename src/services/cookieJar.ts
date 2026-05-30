// Lightweight cross-platform cookie jar for the LMS / IDS CAS flow.
// We don't depend on @react-native-cookies/cookies (no New Arch support).
// Instead we parse Set-Cookie response headers ourselves and inject Cookie
// request headers via axios interceptors.
//
// Domain matching is loose: cookies are stored per registrable suffix
// (cqupt.edu.cn) so they're shared between identity.tc.cqupt.edu.cn,
// lms.tc.cqupt.edu.cn, ids.cqupt.edu.cn — matching iOS URLSession default.

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

const SUFFIX_RE = /([^.]+\.[^.]+)$/;

function registrableSuffix(host: string): string {
  // For our use, *.cqupt.edu.cn → cqupt.edu.cn. Good enough.
  // Handles edu.cn / com.cn TLDs by checking 3 trailing parts.
  const parts = host.split('.');
  if (parts.length >= 3 && (parts[parts.length - 1] === 'cn' && parts[parts.length - 2]?.length <= 3)) {
    return parts.slice(-3).join('.');
  }
  const m = SUFFIX_RE.exec(host);
  return m?.[1] ?? host;
}

export class CookieJar {
  // suffix → name → cookie
  private store = new Map<string, Map<string, ParsedCookie>>();

  /** Parse all Set-Cookie headers and merge into the jar. */
  ingest(setCookieHeaders: string[] | string | undefined, requestHost: string) {
    if (!setCookieHeaders) return;
    const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    const suffix = registrableSuffix(requestHost);
    let bag = this.store.get(suffix);
    if (!bag) {
      bag = new Map();
      this.store.set(suffix, bag);
    }

    for (const raw of arr) {
      const cookie = parseSetCookie(raw, requestHost);
      if (!cookie) continue;
      bag.set(cookie.name, cookie);
    }
  }

  /** Build a Cookie request header value for the given URL host. */
  cookieHeader(host: string): string | null {
    const suffix = registrableSuffix(host);
    const bag = this.store.get(suffix);
    if (!bag || bag.size === 0) return null;

    const out: string[] = [];
    for (const c of bag.values()) {
      // Domain match (loose): allow any subdomain under registrable suffix
      out.push(`${c.name}=${c.value}`);
    }
    return out.join('; ');
  }

  has(name: string, anyHost: string): boolean {
    const bag = this.store.get(registrableSuffix(anyHost));
    return bag?.has(name) ?? false;
  }

  clear() {
    this.store.clear();
  }

  toJSON(): ParsedCookie[] {
    const out: ParsedCookie[] = [];
    for (const bag of this.store.values()) out.push(...bag.values());
    return out;
  }

  load(cookies: ParsedCookie[]) {
    this.store.clear();
    for (const cookie of cookies) {
      if (!cookie.name || !cookie.domain) continue;
      const suffix = registrableSuffix(cookie.domain);
      let bag = this.store.get(suffix);
      if (!bag) {
        bag = new Map();
        this.store.set(suffix, bag);
      }
      bag.set(cookie.name, { ...cookie, path: cookie.path || '/' });
    }
  }

  /** For debugging */
  dump(): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const [suffix, bag] of this.store.entries()) {
      out[suffix] = Array.from(bag.values()).map(c => `${c.name}=${c.value}`);
    }
    return out;
  }
}

function parseSetCookie(raw: string, defaultHost: string): ParsedCookie | null {
  // Set-Cookie format: name=value; Domain=...; Path=...; Expires=...; HttpOnly; Secure
  const parts = raw.split(';').map(s => s.trim());
  const head = parts[0];
  if (!head) return null;
  const eq = head.indexOf('=');
  if (eq < 0) return null;
  const name = head.slice(0, eq).trim();
  const value = head.slice(eq + 1).trim();
  if (!name) return null;

  let domain = defaultHost;
  let path = '/';
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const key = p.slice(0, idx).trim().toLowerCase();
    const val = p.slice(idx + 1).trim();
    if (key === 'domain') domain = val.replace(/^\./, '');
    else if (key === 'path') path = val;
  }

  return { name, value, domain, path };
}
