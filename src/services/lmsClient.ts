// Mirrors CQUPTRollcall/Services/LMSClient.swift
//
// CAS login flow:
//   1. GET http://lms.tc.cqupt.edu.cn/login                 → 302 to ids
//   2. GET ids → 200, parse pwdEncryptSalt + execution token
//   3. POST username/encrypted-password/execution            → 302 (or 200 with kickout dialog)
//   4. Follow final redirect to obtain session cookie at lms.tc.cqupt.edu.cn
//
// We use plain fetch + our own CookieJar instead of axios+@react-native-cookies,
// so this works on iOS / Android / Web without native modules.

import { encryptPassword } from './crypto';
import { CookieJar } from './cookieJar';
import { loadSessionCookies, saveSessionCookies } from './sessionStore';
import type { Rollcall, RollcallsResponse } from '../models/rollcall';

const LMS_BASE = 'http://lms.tc.cqupt.edu.cn';
const IDS_BASE = 'https://ids.cqupt.edu.cn';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

export interface StudentRollcallsDetail {
  isNumber: boolean;
  /** Live number sign-in code, '' when none. May be '0' meaning "not active yet". */
  numberCode: string;
  /** How many students in the roster already signed (status === 'on_call'). */
  checkedInCount: number;
}

export class LMSError extends Error {
  constructor(
    message: string,
    public kind: 'login' | 'session' | 'checkin' | 'network',
    public retryable = true,
  ) {
    super(message);
    this.name = 'LMSError';
  }
}

export class LMSClient {
  private jar = new CookieJar();

  constructor(private accountId?: string) {
    if (accountId) this.jar.load(loadSessionCookies(accountId));
  }

  // ------------ Public API ------------

  clearSession(): void {
    this.jar.clear();
    this.persistCookies();
  }

  async getRollcallsIfSessionValid(): Promise<Rollcall[] | null> {
    const res = await this.rawFetch(`${LMS_BASE}/api/radar/rollcalls?api_version=1.1.0`, {
      redirect: 'manual',
    });
    if (res.status !== 200) return null;
    const json = (await res.json()) as RollcallsResponse;
    return json.rollcalls ?? [];
  }

  async login(username: string, password: string): Promise<void> {
    this.clearSession();

    // Step 1/2: use the exact IDS login URL returned by LMS. Rebuilding it can
    // double-wrap the service parameter and make CAS callback flaky.
    const loginURL = await this.getLoginURL();
    const { salt, execution } = await this.getLoginPageParams(loginURL);
    if (!execution) throw new LMSError('无法获取 execution token', 'login');

    // Step 3: POST credentials
    const encPwd = encryptPassword(password, salt);
    const formBody = new URLSearchParams({
      username,
      password: encPwd,
      captcha: '',
      _eventId: 'submit',
      cllt: 'userNameLogin',
      dllt: 'generalLogin',
      lt: '',
      execution,
    }).toString();

    let res = await this.rawFetch(loginURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
      redirect: 'manual',
    });

    let redirectURL: string | null = null;
    if (res.status === 302) {
      const loc = res.headers.get('Location');
      redirectURL = loc ? absolutize(loc, loginURL) : null;
    } else if (res.status === 200) {
      const body = await res.text();
      if (body.includes('踢出会话') || body.includes('kickout')) {
        const exec2 = extractExecution(body);
        if (exec2) {
          const formBody2 = new URLSearchParams({
            execution: exec2,
            _eventId: 'continue',
          }).toString();
          const res2 = await this.rawFetch(loginURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formBody2,
            redirect: 'manual',
          });
          if (res2.status === 302) {
            const loc = res2.headers.get('Location');
            redirectURL = loc ? absolutize(loc, loginURL) : null;
          } else if (res2.status === 200) {
            const body2 = await res2.text();
            const blockingError = classifyLoginBlock(body2);
            if (blockingError) throw new LMSError(blockingError, 'login', false);
          }
        }
      } else {
        const blockingError = classifyLoginBlock(body);
        if (blockingError) throw new LMSError(blockingError, 'login', false);
      }
    }

    // Step 4: manually follow every callback hop so we can collect Set-Cookie from
    // intermediate 30x responses on platforms where fetch auto-follow hides them.
    if (redirectURL) {
      await this.followRedirects(redirectURL);
    }

    await this.assertSessionReady();
  }

  async getRollcalls(reLoginIfNeeded: () => Promise<void>): Promise<Rollcall[]> {
    const url = `${LMS_BASE}/api/radar/rollcalls?api_version=1.1.0`;
    let res = await this.rawFetch(url);
    if (res.status === 302 || res.status === 401) {
      await reLoginIfNeeded();
      res = await this.rawFetch(url);
      if (res.status !== 200) return [];
    }
    if (res.status !== 200) {
      throw new LMSError(`getRollcalls HTTP ${res.status}`, 'network');
    }
    const json = (await res.json()) as RollcallsResponse;
    return json.rollcalls ?? [];
  }

  /**
   * Fetch a single rollcall's student-side detail to obtain the live number
   * sign-in code. Mirrors the Go edge client's GetStudentRollcalls.
   *   GET /api/rollcall/{id}/student_rollcalls
   * `number_code` may come back as a string OR an int, so it is coerced to a
   * trimmed string (a previous Go build crashed assuming int).
   */
  async getStudentRollcalls(
    rollcallID: number,
    reLoginIfNeeded: () => Promise<void>,
  ): Promise<StudentRollcallsDetail | null> {
    const url = `${LMS_BASE}/api/rollcall/${rollcallID}/student_rollcalls`;
    let res = await this.rawFetch(url);
    if (res.status === 302 || res.status === 401) {
      await reLoginIfNeeded();
      res = await this.rawFetch(url);
      if (res.status !== 200) return null;
    }
    if (res.status !== 200) {
      throw new LMSError(`getStudentRollcalls HTTP ${res.status}`, 'network');
    }

    let raw: unknown = null;
    try { raw = await res.json(); } catch { return null; }

    const obj = (raw ?? {}) as Record<string, unknown>;
    const roster = Array.isArray(obj.student_rollcalls)
      ? (obj.student_rollcalls as { status?: string }[])
      : [];
    const checkedInCount = roster.filter(r => r?.status === 'on_call').length;

    return {
      isNumber: obj.is_number === true,
      numberCode: findNumberCode(raw) ?? '',
      checkedInCount,
    };
  }

  /** type: "qr" | "number" | "radar" */
  async doCheckin(
    rollcallID: number,
    type: 'qr' | 'number' | 'radar',
    payload: Record<string, unknown>,
    deviceId: string,
    timeoutMs?: number,
  ): Promise<void> {
    let endpoint: string;
    switch (type) {
      case 'qr':     endpoint = `${LMS_BASE}/api/rollcall/${rollcallID}/answer_qr_rollcall`; break;
      case 'number': endpoint = `${LMS_BASE}/api/rollcall/${rollcallID}/answer_number_rollcall`; break;
      case 'radar':  endpoint = `${LMS_BASE}/api/rollcall/${rollcallID}/answer`; break;
      default: throw new LMSError('未知签到类型', 'checkin');
    }

    const body = { ...payload, deviceId };
    const res = await this.rawFetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs,
    });

    let json: any = null;
    try { json = await res.json(); } catch {}

    if (res.status === 200 && json?.status === 'on_call') {
      return;
    }

    const errorMsg =
      (json && (json.error_code || json.message)) || `请求失败 (${res.status})`;
    throw new LMSError(errorMsg, 'checkin');
  }

  // ------------ Internals ------------

  /** Wraps fetch to: inject our Cookie jar, capture Set-Cookie, set UA. */
  private async rawFetch(
    url: string,
    init: RequestInit & { redirect?: 'follow' | 'manual'; timeoutMs?: number } = {},
  ): Promise<Response> {
    const u = new URL(url);
    const cookieHeader = this.jar.cookieHeader(u.host);

    const headers = new Headers(init.headers ?? {});
    headers.set('User-Agent', UA);
    if (cookieHeader) headers.set('Cookie', cookieHeader);

    const { timeoutMs, ...fetchInit } = init;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let signal: AbortSignal | undefined;
    if (timeoutMs && timeoutMs > 0) {
      const controller = new AbortController();
      signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
      const res = await fetch(url, { ...fetchInit, headers, signal });

      // Capture all Set-Cookie. RN/iOS exposes them via headers.get('set-cookie')
      // (combined with comma) — but we want each one. Try a few accessors.
      const sc = collectSetCookie(res);
      if (sc.length > 0) {
        this.jar.ingest(sc, u.host);
        this.persistCookies();
      }
      return res;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async getLoginURL(): Promise<string> {
    let currentURL = `${LMS_BASE}/login`;
    for (let i = 0; i < 5; i++) {
      const res = await this.rawFetch(currentURL, { redirect: 'manual' });
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get('Location');
      if (!loc) break;
      currentURL = absolutize(loc, currentURL);
      if (currentURL.includes('/authserver/login')) break;
    }
    return currentURL;
  }

  private async followRedirects(url: string): Promise<Response | null> {
    let currentURL = url;
    let last: Response | null = null;
    for (let i = 0; i < 8; i++) {
      const res = await this.rawFetch(currentURL, { method: 'GET', redirect: 'manual' });
      last = res;
      if (res.status < 300 || res.status >= 400) return res;
      const loc = res.headers.get('Location');
      if (!loc) return res;
      currentURL = absolutize(loc, currentURL);
    }
    return last;
  }

  private persistCookies(): void {
    if (this.accountId) saveSessionCookies(this.accountId, this.jar.toJSON());
  }

  private async assertSessionReady(): Promise<void> {
    const res = await this.rawFetch(`${LMS_BASE}/api/radar/rollcalls?api_version=1.1.0`, {
      redirect: 'manual',
    });
    if (res.status === 200) return;
    throw new LMSError(`登录会话验证失败 (${res.status})`, 'login');
  }

  private async getLoginPageParams(loginURL: string): Promise<{ salt: string; execution: string }> {
    const res = await this.rawFetch(loginURL);
    const html = await res.text();
    const blockingError = classifyLoginBlock(html);
    if (blockingError) throw new LMSError(blockingError, 'login', false);
    return {
      salt: extractValueByID(html, 'pwdEncryptSalt') ?? '',
      execution: extractExecution(html) ?? '',
    };
  }
}

// ------------ Helpers ------------

/**
 * Recursively search a decoded JSON value for a `number_code` field and return
 * it as a trimmed string, regardless of whether the server sent a string or an
 * int. Mirrors the Go findNumberCode (depth-limited).
 */
function findNumberCode(data: unknown, depth = 0, maxDepth = 10): string | null {
  if (depth > maxDepth || data == null) return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const code = findNumberCode(item, depth + 1, maxDepth);
      if (code) return code;
    }
    return null;
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const direct = obj.number_code;
    if (direct != null) return String(direct).trim();
    for (const key of Object.keys(obj)) {
      const code = findNumberCode(obj[key], depth + 1, maxDepth);
      if (code) return code;
    }
  }
  return null;
}

function absolutize(loc: string, base: string): string {
  try {
    return new URL(loc, base).toString();
  } catch {
    return loc;
  }
}

function classifyLoginBlock(html: string): string | null {
  const text = stripHtml(html).replace(/\s+/g, ' ');
  if (/验证码|captcha|请输入验证码|图形码/i.test(text)) {
    return '统一认证需要图形验证码，请等待或用浏览器完成验证后再试';
  }
  if (/锁定|封禁|冻结|限制|10\s*分钟|十分钟|稍后再试|过于频繁/i.test(text)) {
    return '统一认证已限制登录，请等待 10 分钟后再试';
  }
  if (/密码错误|账号或密码错误|用户名或密码错误|认证失败|登录失败|密码有误/i.test(text)) {
    return '账号或密码错误，请先检查账号密码，已停止自动重试';
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function collectSetCookie(res: Response): string[] {
  // RN's fetch returns Set-Cookie joined by comma in some platforms — comma is
  // also valid inside Expires=Thu, 01 Jan ... So splitting on comma is unsafe.
  // We try multiple paths.
  const out: string[] = [];

  // 1. Modern Headers#getSetCookie() (Node 18+, available on web Response in 2026)
  const anyHeaders = res.headers as any;
  if (typeof anyHeaders.getSetCookie === 'function') {
    const arr = anyHeaders.getSetCookie();
    if (Array.isArray(arr)) {
      for (const c of arr) out.push(c);
      return out;
    }
  }

  // 2. raw header (RN sometimes returns array)
  const single = res.headers.get('set-cookie');
  if (typeof single === 'string' && single.length > 0) {
    out.push(...splitSetCookieHeader(single));
  }

  return out;
}

function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=\s*[^;,=\s]+=)/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function extractValueByID(html: string, id: string): string | null {
  const re = new RegExp(`id="${escapeRe(id)}"[^>]*value="([^"]*)"`);
  return re.exec(html)?.[1] ?? null;
}

export function extractExecution(html: string): string | null {
  return /name="execution"[^>]*value="([^"]*)"/.exec(html)?.[1] ?? null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
