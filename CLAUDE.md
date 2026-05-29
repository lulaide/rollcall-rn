# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project direction: multi-account centralized mobile client

This repository is being refactored from a single-account CQUPT Rollcall client into a **multi-account centralized check-in client**: one opened phone app can hold up to about 6 authorized LMS accounts, keep each account logged in independently, poll each account's rollcall tasks, and submit QR/number/location check-ins for all ready accounts from the scanner user's phone.

The target is **not** to make the phone a network server for other phones. Other users do not need to open their clients. The scanner user's app directly uses each stored account's own LMS session to call CQUPT LMS APIs.

Current project state before the refactor:

- The app is single-account: one `username/password/studentID/clientID`, one `LMSClient`, one `CookieJar`, one `rollcalls` list, one `Poller`.
- CenterWS exists for peer sharing (`rollcall_success`, `rollcall_tasks`, `rollcall_share`), but the multi-account refactor should not depend on CenterWS for the core path.
- The fastest core path should be: accounts already logged in + rollcalls already refreshed -> scan QR -> concurrently submit check-ins -> display per-account results.

## Branding and naming

The product is renamed to **云小北** (Yunxiaobei). Branding rules:

- **No "CQUPT" / "重邮" / "重庆邮电" wording anywhere in the UI.** The only user-visible branding strings were in `app/login.tsx` (title/subtitle); replace with 云小北 and a neutral tagline.
- App identity is fully renamed to the 云小北 series: `app.json` `name`/`slug`/`scheme`, iOS `bundleIdentifier`, iOS `CFBundleDisplayName`, Android `package`, and `package.json` `name`. CI artifact names and the AltStore `source.json` branding in `.github/workflows/build.yml` follow.
- **Do NOT change CQUPT API hosts.** `lms.tc.cqupt.edu.cn`, `identity.tc.cqupt.edu.cn`, `ids.cqupt.edu.cn`, `cqupt.ishub.top` are real endpoints — renaming them breaks login/rollcall/curriculum. The `cqupt` in these URLs is infrastructure, not branding.
- The `// Mirrors CQUPTRollcall/...Swift` comments are dev annotations (not UI); optional to clean up.
- Logo: a flat cartoon **white cat on a pink/warm background**. App icons must be PNG (non-transparent), generated from hand-authored SVG via a `sharp`-based script into `assets/images/` (`icon.png`, `favicon.png`, `splash-icon.png`, `android-icon-foreground/background/monochrome.png`).

## Common commands

```bash
npm install              # install dependencies for local development
npm run start            # start Expo dev server
npm run web              # start Expo web preview
npm run android          # start Expo for Android device/emulator
npm run ios              # start Expo for iOS simulator (macOS only)
npm run lint             # run Expo ESLint
```

There is no test script configured in `package.json` at the time of writing.

CI/release builds are handled by `.github/workflows/build.yml` on push/PR to `main` and via manual workflow dispatch:

- iOS: `npx expo prebuild --platform ios --clean`, CocoaPods, then unsigned IPA build.
- Android: `npx expo prebuild --platform android --clean`, then `./gradlew assembleRelease -x lint`.
- Web: `npx expo export --platform web`.

CI uses Node 22; Android CI uses Temurin Java 17. Release versions are patched to `1.0.<commit_count>`.

## Current architecture to refactor

### Routing and UI

Routes live under `app/` using Expo Router:

- `app/login.tsx` currently handles one account login.
- `app/(tabs)/index.tsx` currently shows one account's rollcalls and actions.
- `app/(tabs)/settings.tsx` currently edits one account's config and Center settings.
- `app/scanner.tsx` handles global QR scanning and per-rollcall QR scanning.

During the refactor, turn the UI into account management + aggregate dashboard.

#### Agreed UI design baseline

Visual language: keep the iOS 26 Liquid Glass look via `expo-glass-effect` (`src/components/Glass.tsx`), auto-degrading on older systems. State color (red/green/yellow/gray) must be conveyed via a left color bar or icon, NOT a full-card background fill — glass translucency turns large color fills murky and hurts readability.

Navigation:

- Main screen = the **readiness dashboard** (what the user watches before class).
- A large, always-present **scan button** docked at the bottom (sticky bar, glass solid-highlight; degrades to opaque themed button). Scanning is the time-critical action and must be one tap away.
- Account management and settings are secondary pages. Keep the tab bar minimal; the scan entry is a highlighted bottom button, not a tab.

Dashboard (vertical glass card list, one card per account, ~6 max so no scrolling needed):

- Each card shows: login/session status, current pending-task count (split by source QR/number/radar), last poll time, and errors.
- Status colors: green = has `absent` tasks, ready to scan; yellow = logged in but no current task; red = login/session error (with a retry affordance); gray = disabled.
- The user must be able to judge readiness at a glance from color alone, without opening per-account detail during the scan window.

Scan result (glass sheet from the bottom, four buckets — see Multi-scan incremental signing under Batch check-in rules):

- newly-signed this scan / still-failed this scan / already-signed (skipped) / no-matching-task (skipped).
- The "still-failed" bucket is prominent and carries a **"scan again"** button, because a dynamic QR refreshes every ~15s and the user will usually re-scan.

#### Account management page

- List of accounts: per-row enable/disable toggle, drag-to-reorder, edit, delete (max ~6).
- A `⋯` / batch menu with three actions: **copy all accounts** (Base64 text to clipboard), **import from clipboard** (merge by studentID), **clear all data**.
- Edit page fields: studentID, unified-auth username, password (masked, `secureTextEntry`), display name.
- Delete requires a second confirmation and must also clear that account's cookies/session/rollcalls runtime data.
- Per-account logout lives here (not in settings).

Import/export of accounts:

- Transport is **clipboard text**, not QR. Add `expo-clipboard`.
- Payload is the accounts array `{studentID, username, password, displayName}` serialized to JSON, then **Base64-encoded** (encode as UTF-8 first — display names may be Chinese; use `crypto-js` Base64 or `Buffer.from(json,'utf8').toString('base64')`). Base64 is obfuscation only, NOT encryption — the user explicitly accepted this and declined a passphrase.
- Import: try Base64-decode first, fall back to parsing raw JSON (so a hand-written JSON also imports). Validate each entry has at least studentID + password; skip and report invalid entries instead of failing silently.
- Import strategy is **merge by studentID** (update existing, add new) so importing on a new phone does not wipe accounts already entered there.

#### Settings page (global / app-level only)

After the refactor the settings page holds only global config; all account-specific fields move to account management.

- Account: a single entry row ("账号管理 · 已启用 N/6") linking to the account management page.
- 签到设置 (global): `课前轮询` stepper (`curriculumPreMinutes`), `自动定位签到` toggle, and a new `请求超时` stepper for the QR hot path (bounds `Promise.allSettled` batch submissions, ~5–10s).
- 关于: only the Liquid Glass enabled/degraded status. **Remove version number and original-project link.**
- Bottom: a red **"清除全部数据"** danger button (double-confirm) that wipes all accounts + all sessions/cookies/rollcalls. This satisfies the security requirement for a clear local-data wipe.
- **Remove all CenterWS/Center UI entirely** (server URL, connection status, "暂停接收共享签到").

Behavior toggles such as `自动定位签到` are **global (one toggle applies to all accounts)**, not per-account. The account edit page only holds the account's own credential fields.

### Config and runtime state

Current files:

- `src/store/config.ts`: persisted single-account config.
- `src/store/appState.ts`: singleton runtime orchestration with `const lms = new LMSClient()`, one `CenterWSClient`, one `Poller`, and one `rollcalls` array.
- `src/store/storage.ts`: MMKV/localStorage abstraction.

Refactor target:

- Persist an `accounts` array instead of single `username/password/studentID/clientID` fields.
- Each account needs its own stable `accountId`, display name, username, password, studentID, enabled flag, and device/client ID.
- Runtime state must keep each account isolated: one `LMSClient` instance per enabled account, separate cookies, separate rollcalls, separate login errors, separate last poll/check-in result.
- Avoid module-level singletons that assume only one account. Prefer an account manager/runtime map keyed by account ID.

Suggested runtime shape:

```ts
interface AccountConfig {
  id: string;
  displayName: string;
  username: string;
  password: string;
  studentID: string;
  clientID: string;
  enabled: boolean;
}

interface AccountRuntime {
  config: AccountConfig;
  lms: LMSClient;
  isLoggedIn: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  rollcalls: Rollcall[];
  todayCourses: CurriculumInstance[];
  lastPollTime: number | null;
  lastCheckinResult?: BatchCheckinResult;
}
```

## LMS/CAS and check-in APIs

`src/services/lmsClient.ts` implements CQUPT LMS/CAS login using plain `fetch` and `src/services/cookieJar.ts`. This class already stores cookies inside each `LMSClient` instance, so it can be reused for multi-account by creating one instance per account.

Login flow:

1. `GET http://lms.tc.cqupt.edu.cn/login`
2. follow to `https://ids.cqupt.edu.cn/authserver/login?service=...`
3. parse `pwdEncryptSalt` and `execution`
4. POST username and encrypted password
5. follow redirect back to LMS and capture the session cookie

Rollcall/check-in APIs:

```text
GET http://lms.tc.cqupt.edu.cn/api/radar/rollcalls?api_version=1.1.0
PUT http://lms.tc.cqupt.edu.cn/api/rollcall/{id}/answer_qr_rollcall       body: { data, deviceId }
PUT http://lms.tc.cqupt.edu.cn/api/rollcall/{id}/answer_number_rollcall   body: { numberCode, deviceId }
PUT http://lms.tc.cqupt.edu.cn/api/rollcall/{id}/answer                   body: { lat, lon, deviceId }
```

Important login stability note: the existing code treats `jar.has('session', LMS_BASE)` as login success. The user has observed first login sometimes reports `未获取到 session cookie` and the second attempt succeeds. During the refactor, prefer validating login/session by calling `getRollcalls()` or another LMS API after redirects rather than relying only on a cookie name.

## Polling and readiness

`src/services/poller.ts` is currently single-account and polls every 30 seconds based on curriculum windows. Curriculum comes from:

```text
https://cqupt.ishub.top/api/curriculum/{studentID}/curriculum.json
```

For the multi-account client, use a single **`MultiAccountPoller`**: one timer that iterates all enabled, logged-in accounts and calls each account's own `LMSClient.getRollcalls()`. It lives in the app runtime layer (account manager / `appState`), not in any UI page; the UI only subscribes to the state it produces.

Why polling exists (purpose): the dynamic QR is valid for only ~15s, so task discovery must happen **before** the scan. Polling pre-fills each account's `rollcalls` (with `source`/`status`) so that at scan time the batch logic instantly knows which accounts have `source === 'qr' && status === 'absent'` and the hot path is reduced to "submit only". Polling is a low-frequency (~30s) background discovery task and is completely separate from the time-critical scan-submit path.

Where polling results are consumed: (1) the dashboard, for each card's current-task count and last-poll time; (2) batch check-in, to decide who to submit for and who to skip.

When to poll (do not poll 24/7): gate polling by each account's own curriculum window (course time ± `curriculumPreMinutes`). Because accounts do not share a curriculum, the "should I poll now" decision must be made **per account against that account's own schedule**, not by one global switch. The `课前轮询` setting is the global lead-time applied to every account's window.

Load is negligible and there is no central server: 6 accounts at 30s ≈ 0.2 req/s total against LMS, only inside class windows. The earlier "15s pressure" concern is about scan-submit, not polling.

The QR path is time-sensitive: a dynamic QR can be valid for about 15 seconds, so scanning must not trigger login or slow discovery work. The app should encourage/require this flow:

```text
open app before class
  -> login/refresh all enabled accounts
  -> poll until each ready account has current rollcalls
  -> scan QR
  -> submit only for accounts that already have source=qr && status=absent
  -> show success/failed/skipped per account
```

If an account has not refreshed tasks yet, mark it as `skipped: not_ready` or perform only a very short bounded refresh before submitting.

## Batch check-in rules

Do not assume all 6 accounts share the same curriculum. Batch operations must use each account's own rollcalls and current course data.

QR batch:

- Extract QR data once with `src/services/qrUtil.ts`.
- For each enabled ready account, find its own `source === 'qr' && status === 'absent'` tasks.
- Submit concurrently with that account's own `LMSClient` and `clientID`.
- Accounts with no matching QR task should be `skipped`, not failed.
- If different courses simultaneously have QR tasks, display enough context for the user and let LMS mismatch failures be isolated per account.

Number batch:

- Digital sign-in codes **are** fetched from the authorized student endpoint `GET /api/rollcall/{id}/student_rollcalls` (per-rollcall, not a global list). `LMSClient.getStudentRollcalls` parses `number_code` plus a `checkedInCount` (roster entries with `status === 'on_call'`).
- **`number_code` may be a string OR an int** — the Go build crashed assuming int (`cannot unmarshal string into ... number_code of type int`). Parse it type-tolerantly: recursively locate the field and coerce with `String(v).trim()`, never assuming a type. Submit the code as a string.
- When global `autoNumberCheckin` is on, the poller auto-submits for each `source === 'number' && status === 'absent'` task whose code passes the gate `isNumber && numberCode !== '' && numberCode !== '0'` (`'0'` means the code is not active yet — skip).
- **Manual fallback is kept**: when auto-fetch yields no usable code, the dashboard shows a manual entry. Enter the number once, then submit to all accounts with `source === 'number' && status === 'absent'` tasks.
- The dashboard shows `已签 N 人` from `checkedInCount` to confirm a code has taken effect.

Location/radar batch:

- Do not reuse one location for all accounts when schedules differ.
- For each account, use that account's curriculum/current course location and `src/services/locationData.ts` mapping to derive `{ lat, lon }`.
- Submit only to that account's `source === 'radar' && status === 'absent'` tasks.

Multi-scan incremental signing (QR):

- A dynamic QR is valid for ~15s and then refreshes to a new code. The expected user behavior is to scan again (possibly several times) after expiry until all accounts are signed.
- Every scan must re-evaluate each account's own `source === 'qr' && status === 'absent'` set. Accounts already signed on a previous scan must be skipped on subsequent scans.
- On a successful PUT, optimistically set that account's rollcall `status` to `'on_call'` immediately (do not wait on a network refresh), then refresh rollcalls asynchronously. This keeps the hot path short and guarantees the account is excluded from the next scan even if the async refresh has not completed.
- A newly refreshed QR code and the previously expired one do not conflict: always submit the currently scanned code for whichever accounts are still `absent`. Old success is preserved; only still-absent accounts are retried.
- Display per-scan results in four buckets: newly-signed this scan / still-failed this scan / already-signed (skipped) / no-matching-task (skipped).

Concurrency:

- Use `Promise.allSettled` for batch check-ins so one account failure does not block others.
- Keep the QR hot path short. Prefer returning/displaying initial PUT results immediately, then refresh rollcalls asynchronously.
- Consider short request timeouts for QR batch submissions if adding timeout support.

## CenterWS removed

The user has decided **not to use any server**. CenterWS is removed entirely in the refactor — there is no peer sharing and no central/edge server in the core path. The opened phone already holds every account session needed for direct LMS calls.

Refactor cleanup:

- Remove `src/services/centerWS.ts` and all imports/usages (e.g. `centerConnected`, `sendRollcallSuccess`, `centerServerURL`, `pauseSharedRollcall`) from `appState`, `config`, and the UI.
- Remove all Center/server UI from the settings page (URL, connection status, "暂停接收共享签到").
- Do not reintroduce a server dependency for QR/number/location batch signing.

## Scanner and native module

`app/scanner.tsx` uses the custom scanner module under `modules/expo-data-scanner`. The multi-account QR flow should preserve the scanner behavior but route successful scans into a batch QR action rather than a single-account `checkinQR` call.

Android camera permission is declared in `app.json`; iOS camera permission and HTTP exceptions for LMS hosts are also configured there. The app uses React Native New Architecture.

## Development constraints and testing expectations

- This is primarily a TypeScript/RN state-management refactor; avoid Android/iOS native changes unless scanner behavior or permissions require them.
- The user's likely local environment is Windows with 16GB RAM and no full Android development setup. Favor changes that can be linted locally and built/tested via GitHub Actions APK artifacts on a real Android phone.
- Expo Go may not fully support this project because of native dependencies such as `react-native-mmkv` and `modules/expo-data-scanner`; prefer real APK/dev builds for scanner testing.
- Always run `npm run lint` after meaningful TypeScript changes when possible.

## Security and authorization constraints

This app will store multiple authorized LMS credentials/sessions on one phone. Keep account data isolated by account ID and do not expose passwords in UI after entry. Provide a clear way to remove accounts and clear local data. Only build flows for accounts that the scanner user is authorized to manage.
