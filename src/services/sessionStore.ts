import { storage } from '../store/storage';
import type { ParsedCookie } from './cookieJar';

const keyFor = (accountId: string) => `lms_session_cookies_${accountId}`;

export function loadSessionCookies(accountId: string): ParsedCookie[] {
  const raw = storage.getString(keyFor(accountId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ParsedCookie[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSessionCookies(accountId: string, cookies: ParsedCookie[]): void {
  if (cookies.length === 0) {
    storage.delete(keyFor(accountId));
    return;
  }
  storage.set(keyFor(accountId), JSON.stringify(cookies));
}

export function deleteSessionCookies(accountId: string): void {
  storage.delete(keyFor(accountId));
}
