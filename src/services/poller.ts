// Multi-account poller. A single 30s timer iterates every enabled + logged-in
// account, gating each by that account's OWN curriculum window (course time
// minus curriculumPreMinutes). Per-account discovery pre-fills rollcalls so the
// QR scan hot path is reduced to "submit only".

import {
  CurriculumCacheRaw,
  CurriculumDataRaw,
  CurriculumInstance,
  enrichInstance,
} from '../models/curriculum';
import { storage } from '../store/storage';

const CACHE_TTL_MS = 30 * 60 * 1000;
const cacheKey = (studentID: string) => `curriculum_cache_${studentID}`;

export interface MultiPollerEnv {
  curriculumPreMinutes: number;
  autoLocationCheckin: boolean;
  autoNumberCheckin: boolean;
}

export interface MultiPollerAccount {
  id: string;
  studentID: string;
}

export interface MultiPollerSource {
  /** enabled + logged-in accounts to poll right now */
  listAccounts(): MultiPollerAccount[];
  env(): MultiPollerEnv;
}

export interface MultiPollerHooks {
  refreshAccount(id: string): Promise<void>;
  emitTodayCourses(id: string, courses: CurriculumInstance[]): void;
  emitPolling(id: string, state: boolean, lastPollTime: number): void;
  autoLocationCheckin(id: string, currentInstance: CurriculumInstance): Promise<void>;
  processNumberTasks(id: string): Promise<void>;
}

interface CurriculumCacheEntry {
  instances: CurriculumInstance[];
  lastFetch: number;
}

export class MultiAccountPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private curricula = new Map<string, CurriculumCacheEntry>();

  constructor(
    private source: MultiPollerSource,
    private hooks: MultiPollerHooks,
  ) {}

  start(): void {
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, 30_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  triggerPoll(): void { void this.poll(); }

  // ------------ Internals ------------

  private async poll(): Promise<void> {
    const accounts = this.source.listAccounts();
    const env = this.source.env();

    await Promise.allSettled(
      accounts.map(async acc => {
        await this.fetchCurriculumIfNeeded(acc.studentID);
        if (!this.shouldPoll(acc.studentID, env.curriculumPreMinutes)) return;

        this.hooks.emitPolling(acc.id, true, Date.now());
        try {
          await this.hooks.refreshAccount(acc.id);
        } catch {}
        this.hooks.emitPolling(acc.id, false, Date.now());

        this.emitTodayCourses(acc.id, acc.studentID);

        if (env.autoNumberCheckin) {
          try { await this.hooks.processNumberTasks(acc.id); } catch {}
        }

        if (env.autoLocationCheckin) {
          const inst = this.findCurrentCourse(acc.studentID);
          if (inst) {
            try { await this.hooks.autoLocationCheckin(acc.id, inst); } catch {}
          }
        }
      }),
    );
  }

  private shouldPoll(studentID: string, preMinutes: number): boolean {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const entry = studentID ? this.curricula.get(studentID) : undefined;
    if (!entry) {
      // No curriculum (missing studentID or not fetched yet): fall back to
      // fixed daily windows so discovery still works.
      const windows: [number, number][] = [
        [7 * 60 + 50, 12 * 60],
        [13 * 60 + 50, 18 * 60],
        [18 * 60 + 50, 22 * 60 + 40],
      ];
      return windows.some(([s, e]) => nowMin >= s && nowMin <= e);
    }

    const todayStr = formatDate(now);
    const t = now.getTime();
    for (const inst of entry.instances) {
      if (inst.date !== todayStr) continue;
      if (inst.startMs == null || inst.endMs == null) continue;
      if (t >= inst.startMs - preMinutes * 60_000 && t <= inst.endMs) return true;
    }
    return false;
  }

  private findCurrentCourse(studentID: string): CurriculumInstance | null {
    const entry = studentID ? this.curricula.get(studentID) : undefined;
    if (!entry) return null;
    const now = Date.now();
    const todayStr = formatDate(new Date(now));
    for (const inst of entry.instances) {
      if (inst.date !== todayStr) continue;
      if (inst.startMs == null || inst.endMs == null) continue;
      if (now >= inst.startMs - 15 * 60_000 && now <= inst.endMs) return inst;
    }
    return null;
  }

  private emitTodayCourses(id: string, studentID: string): void {
    const entry = studentID ? this.curricula.get(studentID) : undefined;
    if (!entry) return;
    const todayStr = formatDate(new Date());
    const todayCourses = entry.instances
      .filter(c => c.date === todayStr)
      .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    this.hooks.emitTodayCourses(id, todayCourses);
  }

  // ------------ Curriculum fetch / cache (per studentID) ------------

  private async fetchCurriculumIfNeeded(studentID: string): Promise<void> {
    if (!studentID) return;
    const existing = this.curricula.get(studentID);
    if (!existing) this.loadCurriculumFromCache(studentID);

    const entry = this.curricula.get(studentID);
    if (entry && Date.now() - entry.lastFetch < CACHE_TTL_MS) return;

    const url = `https://cqupt.ishub.top/api/curriculum/${studentID}/curriculum.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as CurriculumDataRaw;
      const instances = data.instances.map(enrichInstance);
      this.curricula.set(studentID, { instances, lastFetch: Date.now() });
      this.saveCurriculumCache(studentID, data);
    } catch {
      // network error — keep cache
    }
  }

  private loadCurriculumFromCache(studentID: string): void {
    const raw = storage.getString(cacheKey(studentID));
    if (!raw) return;
    try {
      const cache = JSON.parse(raw) as CurriculumCacheRaw;
      const instances = cache.data.instances.map(enrichInstance);
      // lastFetch=0 forces a network refresh on next tick but lets us poll now
      this.curricula.set(studentID, { instances, lastFetch: 0 });
    } catch {}
  }

  private saveCurriculumCache(studentID: string, data: CurriculumDataRaw): void {
    const cache: CurriculumCacheRaw = {
      _updated_at: new Date().toISOString(),
      data,
    };
    storage.set(cacheKey(studentID), JSON.stringify(cache));
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
