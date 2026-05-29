// Multi-account persisted config. Zustand + MMKV/localStorage.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from './storage';

export interface AccountConfig {
  id: string; // stable accountId
  displayName: string;
  username: string;
  password: string;
  studentID: string;
  clientID: string; // per-account deviceId
  enabled: boolean;
}

/** Shape accepted by importAccounts — credentials only, runtime ids regenerated. */
export interface ImportedAccount {
  displayName?: string;
  username?: string;
  password?: string;
  studentID?: string;
}

export interface ConfigState {
  accounts: AccountConfig[];

  // global behaviour (applies to every account)
  autoLocationCheckin: boolean;
  autoNumberCheckin: boolean;
  curriculumPreMinutes: number;
  requestTimeoutMs: number;

  // account CRUD
  addAccount: (input: {
    displayName?: string;
    username: string;
    password: string;
    studentID?: string;
    enabled?: boolean;
  }) => string;
  updateAccount: (id: string, patch: Partial<Omit<AccountConfig, 'id'>>) => void;
  removeAccount: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  reorderAccounts: (orderedIds: string[]) => void;

  // global setters
  setGlobal: (
    patch: Partial<
      Pick<
        ConfigState,
        'autoLocationCheckin' | 'autoNumberCheckin' | 'curriculumPreMinutes' | 'requestTimeoutMs'
      >
    >,
  ) => void;

  // bulk
  importAccounts: (incoming: ImportedAccount[]) => {
    added: number;
    updated: number;
    skipped: number;
  };
  clearAll: () => void;
}

export function uuidLower(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
    (crypto as any).getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i]!.toString(16).padStart(2, '0'));
  return (
    `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
  );
}

export const MAX_ACCOUNTS = 6;

export const useConfig = create<ConfigState>()(
  persist(
    (set, get) => ({
      accounts: [],
      autoLocationCheckin: true,
      autoNumberCheckin: true,
      curriculumPreMinutes: 10,
      requestTimeoutMs: 8000,

      addAccount({ displayName, username, password, studentID, enabled }) {
        const id = uuidLower();
        const account: AccountConfig = {
          id,
          displayName: displayName?.trim() || username,
          username,
          password,
          studentID: studentID ?? '',
          clientID: uuidLower(),
          enabled: enabled ?? true,
        };
        set({ accounts: [...get().accounts, account] });
        return id;
      },

      updateAccount(id, patch) {
        set({
          accounts: get().accounts.map(a => (a.id === id ? { ...a, ...patch } : a)),
        });
      },

      removeAccount(id) {
        set({ accounts: get().accounts.filter(a => a.id !== id) });
      },

      setEnabled(id, enabled) {
        set({
          accounts: get().accounts.map(a => (a.id === id ? { ...a, enabled } : a)),
        });
      },

      reorderAccounts(orderedIds) {
        const byId = new Map(get().accounts.map(a => [a.id, a]));
        const next: AccountConfig[] = [];
        for (const id of orderedIds) {
          const a = byId.get(id);
          if (a) {
            next.push(a);
            byId.delete(id);
          }
        }
        // keep any not mentioned (defensive)
        for (const a of byId.values()) next.push(a);
        set({ accounts: next });
      },

      setGlobal(patch) {
        set(patch);
      },

      importAccounts(incoming) {
        const accounts = [...get().accounts];
        const byStudentID = new Map<string, number>();
        accounts.forEach((a, i) => {
          if (a.studentID) byStudentID.set(a.studentID, i);
        });

        let added = 0;
        let updated = 0;
        let skipped = 0;

        for (const raw of incoming) {
          const studentID = (raw.studentID ?? '').trim();
          const password = (raw.password ?? '').trim();
          const username = (raw.username ?? '').trim();
          // need at least studentID + password to be useful
          if (!studentID || !password) {
            skipped++;
            continue;
          }
          const existingIdx = byStudentID.get(studentID);
          if (existingIdx != null) {
            const prev = accounts[existingIdx]!;
            accounts[existingIdx] = {
              ...prev,
              username: username || prev.username,
              password,
              displayName: raw.displayName?.trim() || prev.displayName,
            };
            updated++;
          } else {
            const account: AccountConfig = {
              id: uuidLower(),
              displayName: raw.displayName?.trim() || username || studentID,
              username: username || studentID,
              password,
              studentID,
              clientID: uuidLower(),
              enabled: true,
            };
            accounts.push(account);
            byStudentID.set(studentID, accounts.length - 1);
            added++;
          }
        }

        set({ accounts });
        return { added, updated, skipped };
      },

      clearAll() {
        set({ accounts: [] });
      },
    }),
    {
      name: 'yunxiaobei-config',
      version: 2,
      storage: createJSONStorage(() => zustandStorage),
      // only persist data, not action functions
      partialize: state => ({
        accounts: state.accounts,
        autoLocationCheckin: state.autoLocationCheckin,
        autoNumberCheckin: state.autoNumberCheckin,
        curriculumPreMinutes: state.curriculumPreMinutes,
        requestTimeoutMs: state.requestTimeoutMs,
      }),
    },
  ),
);

export const enabledAccounts = (c: ConfigState): AccountConfig[] =>
  c.accounts.filter(a => a.enabled);

export const hasAnyAccount = (c: ConfigState): boolean => c.accounts.length > 0;
