// Multi-account runtime orchestration.
// One LMSClient per account, isolated cookies/rollcalls/login state.

import { create } from 'zustand';
import { LMSClient, LMSError } from '../services/lmsClient';
import { deleteSessionCookies } from '../services/sessionStore';
import { MultiAccountPoller } from '../services/poller';
import { extractQRData } from '../services/qrUtil';
import type { Rollcall } from '../models/rollcall';
import type { CurriculumInstance } from '../models/curriculum';
import { isAbsent } from '../models/rollcall';
import { storage } from './storage';
import { useConfig, enabledAccounts, type AccountConfig } from './config';

export interface AccountRuntime {
  id: string;
  isLoggedIn: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  rollcalls: Rollcall[];
  todayCourses: CurriculumInstance[];
  isPolling: boolean;
  lastPollTime: number | null;
}

export interface ScanEntry {
  accountId: string;
  displayName: string;
  courseTitle?: string;
  error?: string;
}

export interface BatchCheckinResult {
  newlySigned: ScanEntry[];
  failed: ScanEntry[];
  alreadySigned: ScanEntry[];
  noTask: ScanEntry[];
  message?: string;
  accountIds?: string[];
}

export interface AppState {
  runtimes: Record<string, AccountRuntime>;
  checkinMessage: string | null;
  lastScanResult: BatchCheckinResult | null;
  servicesStarted: boolean;
  lastServiceStartTime: number | null;

  loginAccount: (id: string) => Promise<void>;
  loginAllEnabled: () => Promise<void>;
  logoutAccount: (id: string) => void;

  refreshAccount: (id: string) => Promise<void>;
  refreshAllEnabled: () => Promise<void>;

  batchCheckinQR: (rawData: string, accountIds?: string[]) => Promise<BatchCheckinResult>;
  batchCheckinNumber: (numberCode: string, accountIds?: string[]) => Promise<BatchCheckinResult>;
  numberCheckinAll: (accountIds?: string[]) => Promise<BatchCheckinResult>;
  radarCheckinAccount: (id: string) => Promise<BatchCheckinResult>;

  // poller-driven, per account
  processNumberTasks: (id: string) => Promise<void>;
  autoLocationCheckin: (id: string, inst: CurriculumInstance) => Promise<void>;
  emitTodayCourses: (id: string, courses: CurriculumInstance[]) => void;
  emitPolling: (id: string, state: boolean, t: number) => void;

  startServices: () => void;
  stopServices: () => void;
  syncRuntimes: () => void;
  clearAllRuntime: () => void;

  setCheckinMessage: (msg: string | null) => void;
  clearScanResult: () => void;
}

// LMSClient instances are not part of serializable state — keep them module-level.
const clients = new Map<string, LMSClient>();
function clientFor(id: string): LMSClient {
  let c = clients.get(id);
  if (!c) {
    c = new LMSClient(id);
    clients.set(id, c);
  }
  return c;
}

let poller: MultiAccountPoller | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const loginCooldownUntil = new Map<string, number>();
const accountCredentialKeys = new Map<string, string>();
const accountCredentialKeysLoaded = new Set<string>();

const errMsg = (e: unknown): string =>
  e instanceof LMSError ? e.message : ((e as Error)?.message ?? '未知错误');

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emptyRuntime(id: string): AccountRuntime {
  return {
    id,
    isLoggedIn: false,
    isLoggingIn: false,
    loginError: null,
    rollcalls: [],
    todayCourses: [],
    isPolling: false,
    lastPollTime: null,
  };
}

function accountById(id: string): AccountConfig | undefined {
  return useConfig.getState().accounts.find(a => a.id === id);
}

function credentialKey(acc: AccountConfig): string {
  return JSON.stringify({
    username: acc.username,
    password: acc.password,
    studentID: acc.studentID,
    clientID: acc.clientID,
  });
}

const credentialStorageKey = (id: string): string => `account_credential_key_${id}`;

export const useAppState = create<AppState>((set, get) => {
  const patchRuntime = (id: string, patch: Partial<AccountRuntime>) => {
    set(state => {
      const prev = state.runtimes[id] ?? emptyRuntime(id);
      return { runtimes: { ...state.runtimes, [id]: { ...prev, ...patch } } };
    });
  };

  const getRuntime = (id: string): AccountRuntime => get().runtimes[id] ?? emptyRuntime(id);

  const disposeAccountRuntime = (id: string, options?: { deleteCookies?: boolean; removeRuntime?: boolean }) => {
    loginCooldownUntil.delete(id);
    clients.get(id)?.clearSession();
    clients.delete(id);
    accountCredentialKeys.delete(id);
    accountCredentialKeysLoaded.delete(id);
    storage.delete(credentialStorageKey(id));
    if (options?.deleteCookies) deleteSessionCookies(id);
    set(state => {
      if (options?.removeRuntime) {
        const { [id]: _removed, ...next } = state.runtimes;
        return { runtimes: next };
      }
      return { runtimes: { ...state.runtimes, [id]: emptyRuntime(id) } };
    });
  };

  const invalidateSessionIfCredentialsChanged = (acc: AccountConfig) => {
    const nextKey = credentialKey(acc);
    if (!accountCredentialKeysLoaded.has(acc.id)) {
      const persistedKey = storage.getString(credentialStorageKey(acc.id));
      if (persistedKey) accountCredentialKeys.set(acc.id, persistedKey);
      accountCredentialKeysLoaded.add(acc.id);
    }
    const prevKey = accountCredentialKeys.get(acc.id);
    if (prevKey === nextKey) return;
    if (prevKey != null) {
      disposeAccountRuntime(acc.id, { deleteCookies: true });
    } else {
      clients.delete(acc.id);
      deleteSessionCookies(acc.id);
    }
    accountCredentialKeys.set(acc.id, nextKey);
    accountCredentialKeysLoaded.add(acc.id);
    storage.set(credentialStorageKey(acc.id), nextKey);
  };

  const handleNonRetryableLogin = (id: string, e: unknown) => {
    if (!(e instanceof LMSError) || e.retryable) return false;
    loginCooldownUntil.set(id, Date.now() + 10 * 60_000);
    patchRuntime(id, { isLoggedIn: false, isLoggingIn: false, loginError: errMsg(e) });
    return true;
  };

  const reLogin = (id: string) => async () => {
    const acc = accountById(id);
    if (!acc) return;
    const cooldownUntil = loginCooldownUntil.get(id) ?? 0;
    if (Date.now() < cooldownUntil) {
      throw new LMSError('统一认证临时限制登录，请稍后再试', 'login', false);
    }
    invalidateSessionIfCredentialsChanged(acc);
    try {
      await clientFor(id).login(acc.username, acc.password);
    } catch (e) {
      handleNonRetryableLogin(id, e);
      throw e;
    }
  };

  /** Optimistically mark a task on_call in the runtime, then async refresh. */
  const markSigned = (id: string, rollcallID: number) => {
    const rt = getRuntime(id);
    patchRuntime(id, {
      rollcalls: rt.rollcalls.map(r =>
        r.rollcall_id === rollcallID ? { ...r, status: 'on_call' } : r,
      ),
    });
  };

  return {
    runtimes: {},
    checkinMessage: null,
    lastScanResult: null,
    servicesStarted: false,
    lastServiceStartTime: null,

    setCheckinMessage(msg) {
      set({ checkinMessage: msg });
      if (toastTimer) clearTimeout(toastTimer);
      if (msg) toastTimer = setTimeout(() => set({ checkinMessage: null }), 2500);
    },

    clearScanResult() {
      set({ lastScanResult: null });
    },

    /** Ensure a runtime entry exists for every configured account. */
    syncRuntimes() {
      const accounts = useConfig.getState().accounts;
      const accountIds = new Set(accounts.map(a => a.id));
      for (const id of Array.from(clients.keys())) {
        if (!accountIds.has(id)) {
          clients.delete(id);
          loginCooldownUntil.delete(id);
          accountCredentialKeys.delete(id);
          accountCredentialKeysLoaded.delete(id);
          storage.delete(credentialStorageKey(id));
        }
      }
      for (const id of Array.from(loginCooldownUntil.keys())) {
        if (!accountIds.has(id)) loginCooldownUntil.delete(id);
      }
      for (const id of Array.from(accountCredentialKeys.keys())) {
        if (!accountIds.has(id)) {
          accountCredentialKeys.delete(id);
          accountCredentialKeysLoaded.delete(id);
          storage.delete(credentialStorageKey(id));
        }
      }
      set(state => {
        const next: Record<string, AccountRuntime> = {};
        for (const a of accounts) {
          next[a.id] = state.runtimes[a.id] ?? emptyRuntime(a.id);
        }
        return { runtimes: next };
      });
    },

    async loginAccount(id) {
      const acc = accountById(id);
      if (!acc) return;
      invalidateSessionIfCredentialsChanged(acc);
      const cooldownUntil = loginCooldownUntil.get(id) ?? 0;
      if (Date.now() < cooldownUntil) {
        patchRuntime(id, { isLoggedIn: false, isLoggingIn: false, loginError: '统一认证临时限制登录，请稍后再试' });
        return;
      }

      const client = clientFor(id);
      patchRuntime(id, { isLoggingIn: true, loginError: null });

      const attempt = async () => {
        await client.login(acc.username, acc.password);
        return client.getRollcalls(reLogin(id));
      };

      try {
        const cached = await client.getRollcallsIfSessionValid();
        if (cached) {
          loginCooldownUntil.delete(id);
          patchRuntime(id, { isLoggedIn: true, isLoggingIn: false, rollcalls: cached, loginError: null });
          return;
        }
      } catch {
        client.clearSession();
      }

      try {
        const list = await attempt();
        loginCooldownUntil.delete(id);
        patchRuntime(id, { isLoggedIn: true, isLoggingIn: false, rollcalls: list, loginError: null });
      } catch (e) {
        if (handleNonRetryableLogin(id, e)) return;
        try {
          const list = await attempt();
          loginCooldownUntil.delete(id);
          patchRuntime(id, { isLoggedIn: true, isLoggingIn: false, rollcalls: list, loginError: null });
        } catch (e2) {
          handleNonRetryableLogin(id, e2);
          patchRuntime(id, { isLoggedIn: false, isLoggingIn: false, loginError: errMsg(e2) });
        }
      }
    },

    async loginAllEnabled() {
      const accounts = enabledAccounts(useConfig.getState());
      await Promise.allSettled(accounts.map(a => get().loginAccount(a.id)));
    },

    logoutAccount(id) {
      disposeAccountRuntime(id, { deleteCookies: true });
    },

    async refreshAccount(id) {
      const rt = getRuntime(id);
      if (!rt.isLoggedIn) return;
      try {
        const list = await clientFor(id).getRollcalls(reLogin(id));
        // preserve previously enriched number fields for tasks still present
        const prevById = new Map(rt.rollcalls.map(r => [r.rollcall_id, r]));
        const merged = list.map(r => {
          const prev = prevById.get(r.rollcall_id);
          return prev
            ? { ...r, numberCode: prev.numberCode, checkedInCount: prev.checkedInCount }
            : r;
        });
        patchRuntime(id, { rollcalls: merged, lastPollTime: Date.now() });
      } catch {
        // keep existing on transient failure
      }
    },

    async refreshAllEnabled() {
      const accounts = enabledAccounts(useConfig.getState());
      await Promise.allSettled(accounts.map(a => get().refreshAccount(a.id)));
    },

    async batchCheckinQR(rawData, accountIds) {
      const result: BatchCheckinResult = {
        newlySigned: [],
        failed: [],
        alreadySigned: [],
        noTask: [],
      };

      const extracted = extractQRData(rawData);
      if (!extracted) {
        result.message = '无效或过期的二维码';
        get().setCheckinMessage(result.message);
        set({ lastScanResult: result });
        return result;
      }

      const cfg = useConfig.getState();
      const timeout = cfg.requestTimeoutMs;
      const waitMs = Math.max(timeout + 1000, 6000);
      let accounts = enabledAccounts(cfg);
      if (accountIds) accounts = accounts.filter(a => accountIds.includes(a.id));
      result.accountIds = accountIds;

      type QRBucket = Exclude<keyof BatchCheckinResult, 'message' | 'accountIds'>;
      type QRAccountResult = { bucket: QRBucket; entry: ScanEntry };
      const completed = new Map<string, QRAccountResult>();

      const perAccount = accounts.map(acc => (async (): Promise<void> => {
        const rt = getRuntime(acc.id);
        const entry: ScanEntry = { accountId: acc.id, displayName: acc.displayName };
        if (!rt.isLoggedIn) {
          completed.set(acc.id, { bucket: 'failed', entry: { ...entry, error: '未登录' } });
          return;
        }

        const qrAll = rt.rollcalls.filter(r => r.source === 'qr');
        const absent = qrAll.filter(isAbsent);
        if (qrAll.length === 0) {
          completed.set(acc.id, { bucket: 'noTask', entry });
          return;
        }
        if (absent.length === 0) {
          completed.set(acc.id, { bucket: 'alreadySigned', entry });
          return;
        }

        entry.courseTitle = absent[0]!.course_title;
        let firstError: string | null = null;
        let signedAny = false;
        for (const task of absent) {
          try {
            await clientFor(acc.id).doCheckin(task.rollcall_id, 'qr', { data: extracted }, acc.clientID, timeout);
            markSigned(acc.id, task.rollcall_id);
            signedAny = true;
          } catch (e) {
            if (!firstError) firstError = errMsg(e);
          }
        }
        if (signedAny) void get().refreshAccount(acc.id);
        if (signedAny) {
          completed.set(acc.id, { bucket: 'newlySigned', entry });
          if (firstError) {
            completed.set(`${acc.id}:failed`, {
              bucket: 'failed',
              entry: { ...entry, error: firstError },
            });
          }
        } else {
          completed.set(acc.id, { bucket: 'failed', entry: { ...entry, error: firstError ?? '签到超时' } });
        }
      })());

      await Promise.race([
        Promise.allSettled(perAccount),
        wait(waitMs),
      ]);

      for (const acc of accounts) {
        const item = completed.get(acc.id) ?? {
          bucket: 'failed' as const,
          entry: { accountId: acc.id, displayName: acc.displayName, error: '签到超时' },
        };
        result[item.bucket].push(item.entry);
        const partialFailure = completed.get(`${acc.id}:failed`);
        if (partialFailure) result.failed.push(partialFailure.entry);
      }

      const n = result.newlySigned.length;
      get().setCheckinMessage(n > 0 ? `新签到 ${n} 个账号` : '无新签到');
      set({ lastScanResult: result });
      return result;
    },

    async batchCheckinNumber(numberCode, accountIds) {
      const result: BatchCheckinResult = {
        newlySigned: [],
        failed: [],
        alreadySigned: [],
        noTask: [],
      };
      const code = numberCode.trim();
      if (!code) {
        get().setCheckinMessage('请输入签到码');
        return result;
      }

      const cfg = useConfig.getState();
      const timeout = cfg.requestTimeoutMs;
      let accounts = enabledAccounts(cfg);
      if (accountIds) accounts = accounts.filter(a => accountIds.includes(a.id));

      await Promise.allSettled(
        accounts.map(async acc => {
          const rt = getRuntime(acc.id);
          const entry: ScanEntry = { accountId: acc.id, displayName: acc.displayName };
          if (!rt.isLoggedIn) {
            result.failed.push({ ...entry, error: '未登录' });
            return;
          }
          const numAll = rt.rollcalls.filter(r => r.source === 'number');
          const absent = numAll.filter(isAbsent);
          if (numAll.length === 0) {
            result.noTask.push(entry);
            return;
          }
          if (absent.length === 0) {
            result.alreadySigned.push(entry);
            return;
          }
          entry.courseTitle = absent[0]!.course_title;
          let firstError: string | null = null;
          let signedAny = false;
          for (const task of absent) {
            try {
              await clientFor(acc.id).doCheckin(task.rollcall_id, 'number', { numberCode: code }, acc.clientID, timeout);
              markSigned(acc.id, task.rollcall_id);
              signedAny = true;
            } catch (e) {
              if (!firstError) firstError = errMsg(e);
            }
          }
          if (signedAny) result.newlySigned.push(entry);
          if (firstError) result.failed.push({ ...entry, error: firstError });
          if (!signedAny && !firstError) result.failed.push({ ...entry, error: '签到失败' });
          void get().refreshAccount(acc.id);
        }),
      );

      const n = result.newlySigned.length;
      get().setCheckinMessage(n > 0 ? `数字签到 ${n} 个账号` : '数字签到无新签到');
      set({ lastScanResult: result });
      return result;
    },

    async numberCheckinAll(accountIds) {
      const result: BatchCheckinResult = {
        newlySigned: [],
        failed: [],
        alreadySigned: [],
        noTask: [],
      };
      const cfg = useConfig.getState();
      const timeout = cfg.requestTimeoutMs;
      let accounts = enabledAccounts(cfg);
      if (accountIds) accounts = accounts.filter(a => accountIds.includes(a.id));

      await Promise.allSettled(
        accounts.map(async acc => {
          const rt = getRuntime(acc.id);
          const entry: ScanEntry = { accountId: acc.id, displayName: acc.displayName };
          if (!rt.isLoggedIn) {
            result.failed.push({ ...entry, error: '未登录' });
            return;
          }
          const numAll = rt.rollcalls.filter(r => r.source === 'number');
          const absent = numAll.filter(isAbsent);
          if (numAll.length === 0) {
            result.noTask.push(entry);
            return;
          }
          if (absent.length === 0) {
            result.alreadySigned.push(entry);
            return;
          }
          entry.courseTitle = absent[0]!.course_title;
          const client = clientFor(acc.id);
          let firstError: string | null = null;
          let signedAny = false;
          for (const task of absent) {
            // fetch the live code for this rollcall, fall back to any enriched value
            let code = task.numberCode ?? '';
            try {
              const detail = await client.getStudentRollcalls(task.rollcall_id, reLogin(acc.id));
              if (detail) code = detail.numberCode;
            } catch {}
            if (code === '' || code === '0') {
              if (!firstError) firstError = '签到码未生效';
              continue;
            }
            try {
              await client.doCheckin(task.rollcall_id, 'number', { numberCode: code }, acc.clientID, timeout);
              markSigned(acc.id, task.rollcall_id);
              signedAny = true;
            } catch (e) {
              if (!firstError) firstError = errMsg(e);
            }
          }
          if (signedAny) result.newlySigned.push(entry);
          if (firstError) result.failed.push({ ...entry, error: firstError });
          if (!signedAny && !firstError) result.failed.push({ ...entry, error: '签到失败' });
          void get().refreshAccount(acc.id);
        }),
      );

      const n = result.newlySigned.length;
      get().setCheckinMessage(n > 0 ? `数字签到 ${n} 个账号` : '数字签到无新签到');
      set({ lastScanResult: result });
      return result;
    },

    async radarCheckinAccount(id) {
      const result: BatchCheckinResult = {
        newlySigned: [],
        failed: [],
        alreadySigned: [],
        noTask: [],
      };
      const acc = accountById(id);
      const rt = getRuntime(id);
      const entry: ScanEntry = { accountId: id, displayName: acc?.displayName ?? id };
      if (!acc || !rt.isLoggedIn) {
        result.failed.push({ ...entry, error: '未登录' });
        get().setCheckinMessage('定位签到失败：未登录');
        set({ lastScanResult: result });
        return result;
      }

      const radarAll = rt.rollcalls.filter(r => r.source === 'radar');
      const absent = radarAll.filter(isAbsent);
      if (radarAll.length === 0) {
        result.noTask.push(entry);
        get().setCheckinMessage('没有定位签到任务');
        set({ lastScanResult: result });
        return result;
      }
      if (absent.length === 0) {
        result.alreadySigned.push(entry);
        get().setCheckinMessage('定位任务已签过');
        set({ lastScanResult: result });
        return result;
      }

      const { isInstanceNow } = await import('../models/curriculum');
      const { getCoords } = await import('../services/locationData');
      const currentInst = rt.todayCourses.find(c => isInstanceNow(c));
      const cfg = useConfig.getState();
      let firstError: string | null = null;
      let signedAny = false;
      for (const task of absent) {
        const inst = rt.todayCourses.find(c => c.course === task.course_title) ?? currentInst;
        const coords = inst ? getCoords(inst.location) : null;
        if (!coords) {
          if (!firstError) firstError = `无法定位课程位置：${task.course_title}`;
          continue;
        }
        entry.courseTitle = task.course_title;
        try {
          await clientFor(id).doCheckin(task.rollcall_id, 'radar', { lat: coords.lat, lon: coords.lon }, acc.clientID, cfg.requestTimeoutMs);
          markSigned(id, task.rollcall_id);
          signedAny = true;
        } catch (e) {
          if (!firstError) firstError = errMsg(e);
        }
      }
      if (signedAny) result.newlySigned.push(entry);
      if (firstError) result.failed.push({ ...entry, error: firstError });
      if (!signedAny && !firstError) result.failed.push({ ...entry, error: '签到失败' });
      void get().refreshAccount(id);

      get().setCheckinMessage(signedAny ? `定位签到成功 (${acc.displayName})` : '定位签到失败');
      set({ lastScanResult: result });
      return result;
    },

    async processNumberTasks(id) {
      const rt = getRuntime(id);
      if (!rt.isLoggedIn) return;
      const cfg = useConfig.getState();
      const acc = accountById(id);
      if (!acc) return;

      const numberTasks = rt.rollcalls.filter(r => r.source === 'number' && isAbsent(r));
      if (numberTasks.length === 0) return;

      const client = clientFor(id);
      for (const task of numberTasks) {
        let detail;
        try {
          detail = await client.getStudentRollcalls(task.rollcall_id, reLogin(id));
        } catch {
          continue;
        }
        if (!detail) continue;

        // enrich for display (manual-entry UI shows checkedInCount / code)
        patchRuntime(id, {
          rollcalls: getRuntime(id).rollcalls.map(r =>
            r.rollcall_id === task.rollcall_id
              ? { ...r, numberCode: detail!.numberCode, checkedInCount: detail!.checkedInCount }
              : r,
          ),
        });

        const code = detail.numberCode;
        const codeIsUsable = detail.isNumber && code !== '' && code !== '0';
        const codeLooksPublished = detail.checkedInCount > 0;
        if (cfg.autoNumberCheckin && codeIsUsable && codeLooksPublished) {
          try {
            await client.doCheckin(task.rollcall_id, 'number', { numberCode: code }, acc.clientID, cfg.requestTimeoutMs);
            markSigned(id, task.rollcall_id);
            get().setCheckinMessage(`自动数字签到成功 (${acc.displayName})`);
            void get().refreshAccount(id);
          } catch {
            // leave absent — manual fallback remains available
          }
        }
      }
    },

    async autoLocationCheckin(id, inst) {
      const rt = getRuntime(id);
      if (!rt.isLoggedIn) return;
      const acc = accountById(id);
      if (!acc) return;
      const radarTasks = rt.rollcalls.filter(r => r.source === 'radar' && isAbsent(r));
      if (radarTasks.length === 0) return;

      const { getCoords } = await import('../services/locationData');
      const coords = getCoords(inst.location);
      if (!coords) return;

      const cfg = useConfig.getState();
      for (const task of radarTasks) {
        try {
          await clientFor(id).doCheckin(task.rollcall_id, 'radar', { lat: coords.lat, lon: coords.lon }, acc.clientID, cfg.requestTimeoutMs);
          markSigned(id, task.rollcall_id);
          void get().refreshAccount(id);
        } catch {
          // ignore
        }
      }
    },

    emitTodayCourses(id, courses) {
      patchRuntime(id, { todayCourses: courses });
    },

    emitPolling(id, state, t) {
      patchRuntime(id, { isPolling: state, lastPollTime: t });
    },

    clearAllRuntime() {
      for (const client of clients.values()) client.clearSession();
      clients.clear();
      loginCooldownUntil.clear();
      for (const id of accountCredentialKeys.keys()) storage.delete(credentialStorageKey(id));
      accountCredentialKeys.clear();
      accountCredentialKeysLoaded.clear();
      if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      set({ runtimes: {}, checkinMessage: null, lastScanResult: null });
    },

    startServices() {
      get().syncRuntimes();
      if (poller) {
        set({ servicesStarted: true, lastServiceStartTime: Date.now() });
        poller.triggerPoll();
        return;
      }
      poller = new MultiAccountPoller(
        {
          listAccounts: () =>
            enabledAccounts(useConfig.getState()).map(a => ({
              id: a.id,
              studentID: a.studentID,
              isLoggedIn: !!get().runtimes[a.id]?.isLoggedIn,
            })),
          env: () => {
            const c = useConfig.getState();
            return {
              curriculumPreMinutes: c.curriculumPreMinutes,
              autoLocationCheckin: c.autoLocationCheckin,
              autoNumberCheckin: c.autoNumberCheckin,
            };
          },
        },
        {
          refreshAccount: id => get().refreshAccount(id),
          emitTodayCourses: (id, courses) => get().emitTodayCourses(id, courses),
          emitPolling: (id, state, t) => get().emitPolling(id, state, t),
          autoLocationCheckin: (id, inst) => get().autoLocationCheckin(id, inst),
          processNumberTasks: id => get().processNumberTasks(id),
        },
      );
      poller.start();
      set({ servicesStarted: true, lastServiceStartTime: Date.now() });
    },

    stopServices() {
      poller?.stop();
      poller = null;
      set({ servicesStarted: false });
    },
  };
});
