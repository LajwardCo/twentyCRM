# Call Companion — Mobile App (Plan B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that renders the existing sales PWA, detects finished
work calls, matches them to CRM contacts on-device, and posts them to the
endpoints built in Plan A — with the OEM's call recording attached where the
phone provides one.

**Architecture:** An Expo app (React Native 0.81, expo-router) matching the
house stack used by `usystems_connect_mobile`. A `react-native-webview` renders
`https://crm.hamagan.com/sales/` — the whole existing sales UI, same origin as
the API. Alongside it, one local Expo native module (Kotlin, following the
`modules/usystems-home-widget` precedent in Connect) exposes the call log, the
call-ended broadcast, and a Storage Access Framework folder handle. All matching
and queueing logic lives in plain TypeScript so it can be unit tested off-device.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-router, react-native-webview,
expo-secure-store, Kotlin + Expo Modules API, Jest.

**Spec:** [`docs/superpowers/specs/2026-08-31-call-companion-design.md`](../specs/2026-08-31-call-companion-design.md)
**Depends on:** [Plan A](2026-08-31-call-companion-server-foundation.md) — merged and deployed.

---

## Scope

**Android only.** The spec's iOS tier (in-app dialling with an estimated
duration, no audio) is deliberately not in this plan. Every recording your
agents produce today comes from Android, iOS can never produce one, and mixing
two capture models into the first build would double the surface for no
recordings gained. iOS is a later slice against the same endpoints.

**Not in this plan:** the post-call task prompt and reminders (P2), and
transcription (P3). Plan B ends when a call reliably appears in the CRM with its
audio attached.

## Distribution reality — read before starting

`READ_CALL_LOG` is a Play Store *restricted* permission, granted only to apps
whose core function is dialler or caller-ID. **A CRM app requesting it will be
rejected.** Plan for a sideloaded APK or a Managed Google Play private channel.
This is a rollout constraint, not a bug to be fixed later, and it should be
settled before anyone builds a release pipeline around Play.

## Where the code lives

A new repository, `usystems_sales_mobile`, under
`/Users/rashid/Development/UsystemsMobile/`, alongside the other four Expo apps.
Each of those is its own git repo (`LajwardCo/usystems_connect_mobile` etc.);
this follows the same convention rather than living in the CRM monorepo.

**Metro port:** Connect and Support both default to `:8081`, and whichever
starts second silently serves the other's JS. Pin this app to `:8083` in every
start script from the first commit.

## File Structure

**Created (new repo `usystems_sales_mobile`):**

- `app/_layout.tsx`, `app/index.tsx`, `app/(auth)/login.tsx` — expo-router
  entry, the WebView host, and the login screen.
- `services/api.ts` — Twenty sign-in + the three Plan A endpoints.
- `services/session.ts` — token storage via expo-secure-store.
- `services/queueStore.ts` — the only place queue state touches disk.
- `services/sync.ts` — one capture pass, tying the pieces together.
- `lib/callFilter.ts` — decides whether a logged call is reportable at all.
- `lib/recordingMatch.ts` — pick the recording file for a finished call.
- `lib/uploadQueue.ts` — the queue state machine (pure; no I/O).
- `lib/phone/normalizePhoneNumber.ts` — vendored from `twenty-shared`, not rewritten.
- `modules/usystems-call-log/` — the local native module (Kotlin).
- `__tests__/` — one spec per `lib/` module.

Everything with a decision in it lives in `lib/` as pure functions, so the
logic is testable without a device. The native module only reads the platform
and hands back plain data; the services only do I/O.

---

## Phase 1 — A working shell (Tasks 1-4)

### Task 1: Scaffold the app

**Files:**
- Create: the `usystems_sales_mobile` repo

- [ ] **Step 1: Create the project**

```bash
cd /Users/rashid/Development/UsystemsMobile
npx create-expo-app@latest usystems_sales_mobile --template default
cd usystems_sales_mobile
git init && git add -A && git commit -m "chore: scaffold expo app"
```

- [ ] **Step 2: Pin the Metro port**

Connect and Support both use `:8081`; a collision silently serves the wrong
bundle. In `package.json`, replace the `start` and `android` scripts:

```json
"start": "expo start --port 8083",
"android": "expo run:android --port 8083"
```

- [ ] **Step 3: Install the dependencies this plan needs**

```bash
npx expo install react-native-webview expo-secure-store expo-dev-client expo-file-system expo-notifications expo-build-properties
npm i -D jest jest-expo @types/jest
```

- [ ] **Step 4: Configure Jest**

Add to `package.json`:

```json
"scripts": { "test": "jest" },
"jest": { "preset": "jest-expo" }
```

- [ ] **Step 5: Verify the harness runs**

```bash
npx jest --passWithNoTests
```

Expected: `No tests found, exiting with code 0`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: add webview, secure store and jest"
```

---

### Task 2: Session storage

**Files:**
- Create: `services/session.ts`
- Test: `__tests__/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { parseSession, isExpired } from '../services/session';

describe('parseSession', () => {
  it('accepts a well-formed token payload', () => {
    expect(
      parseSession({ accessToken: 'a.b.c', expiresAt: '2026-09-01T00:00:00.000Z' }),
    ).toEqual({ accessToken: 'a.b.c', expiresAt: '2026-09-01T00:00:00.000Z' });
  });

  it('rejects a payload with no access token', () => {
    expect(parseSession({ expiresAt: '2026-09-01T00:00:00.000Z' })).toBeNull();
    expect(parseSession(null)).toBeNull();
    expect(parseSession('nonsense')).toBeNull();
  });

  it('treats a missing expiry as never expiring', () => {
    expect(isExpired({ accessToken: 'a' }, new Date('2030-01-01'))).toBe(false);
  });

  it('reports an elapsed expiry as expired', () => {
    const session = { accessToken: 'a', expiresAt: '2026-08-01T00:00:00.000Z' };

    expect(isExpired(session, new Date('2026-08-02T00:00:00.000Z'))).toBe(true);
    expect(isExpired(session, new Date('2026-07-31T00:00:00.000Z'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest session
```

Expected: FAIL, cannot find module `../services/session`.

- [ ] **Step 3: Implement**

```ts
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'sales.session';

export type Session = {
  accessToken: string;
  expiresAt?: string;
};

/** Narrows unknown storage/network JSON to a Session, or null. */
export const parseSession = (raw: unknown): Session | null => {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.accessToken !== 'string' || record.accessToken === '') {
    return null;
  }

  return {
    accessToken: record.accessToken,
    ...(typeof record.expiresAt === 'string'
      ? { expiresAt: record.expiresAt }
      : {}),
  };
};

/** A session with no stated expiry is treated as valid; the server decides. */
export const isExpired = (session: Session, now: Date): boolean =>
  session.expiresAt === undefined
    ? false
    : new Date(session.expiresAt).getTime() <= now.getTime();

export const saveSession = async (session: Session): Promise<void> => {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
};

export const loadSession = async (): Promise<Session | null> => {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);

  if (raw === null) return null;

  try {
    return parseSession(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const clearSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SESSION_KEY);
};
```

- [ ] **Step 4: Run and confirm green**

```bash
npx jest session
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: session parsing and secure storage"
```

---

### Task 3: Sign-in and the API client

**Files:**
- Create: `services/api.ts`

No unit test: this file is only `fetch` plumbing, and its decisions live in
`lib/`. It is exercised on device in Task 11.

**Why the app needs its own sign-in.** The WebView authenticates the PWA inside
its own storage, which the native side cannot read. The REST calls in this file
need a bearer token of their own, so the app signs in once and keeps a session.
Agents therefore sign in twice on first launch — once natively, once in the
WebView. That is a known wart; sharing one session would mean injecting tokens
across the WebView boundary, which is a larger design decision than this plan
should make unilaterally.

- [ ] **Step 1: Write it**

```ts
import { loadSession } from './session';

const BASE_URL = 'https://crm.hamagan.com';

export type PhoneIndexEntry = {
  e164: string;
  personId: string;
  displayName: string;
};

export type CallActivityPayload = {
  deviceCallId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'MISSED';
  channel: 'PHONE' | 'WHATSAPP' | 'TELEGRAM';
  phoneNumber?: string;
  contactName?: string;
  startedAt: string;
  durationSeconds: number;
  durationSource: 'CALL_LOG' | 'ESTIMATED' | 'MANUAL';
};

export type IngestResult =
  | { status: 'created'; callActivityId: string }
  | { status: 'duplicate'; callActivityId: string }
  | { status: 'unmatched' };

/**
 * Exchanges credentials for an access token using the same two-step mutation
 * pair the provisioning scripts use (see tools/sales-crm/*.mjs): credentials to
 * a short-lived login token, then that to an access token.
 */
export const signIn = async (
  email: string,
  password: string,
): Promise<string> => {
  const gql = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetch(`${BASE_URL}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await response.json()) as {
      data?: Record<string, any>;
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join(', '));
    }

    return json.data ?? {};
  };

  const login = await gql(
    `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`,
    { e: email, p: password, o: BASE_URL },
  );

  const tokens = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: login.getLoginTokenFromCredentials.loginToken.token, o: BASE_URL },
  );

  return tokens.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken
    .token as string;
};

const authorized = async (path: string, init: RequestInit = {}) => {
  const session = await loadSession();

  if (session === null) {
    throw new Error('Not signed in');
  }

  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
};

export const fetchPhoneIndex = async (): Promise<PhoneIndexEntry[]> => {
  const response = await authorized('/rest/sales/phone-index');

  if (!response.ok) {
    throw new Error(`phone index failed (${response.status})`);
  }

  const json = (await response.json()) as { entries: PhoneIndexEntry[] };

  return json.entries;
};

export const postCallActivity = async (
  payload: CallActivityPayload,
): Promise<IngestResult> => {
  const response = await authorized('/rest/sales/call-activities', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`ingest failed (${response.status})`);
  }

  return (await response.json()) as IngestResult;
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: API client for phone index and call ingest"
```

---

### Task 4: Sign-in screen and the WebView shell

**Files:**
- Create: `app/(auth)/login.tsx`
- Modify: `app/index.tsx`

- [ ] **Step 1: Write the sign-in screen**

```tsx
import { useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';

import { signIn } from '../../services/api';
import { saveSession } from '../../services/session';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const accessToken = await signIn(email.trim(), password);

      await saveSession({ accessToken });
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== null ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={submit} disabled={busy} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  error: { color: '#c00' },
});
```

- [ ] **Step 2: Replace the main screen**

```tsx
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { WebView } from 'react-native-webview';

import { isExpired, loadSession } from '../services/session';

const SALES_APP_URL = 'https://crm.hamagan.com/sales/';

export default function SalesAppScreen() {
  const webViewRef = useRef<WebView>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // The native REST calls need their own token; without a session there is
    // nothing to capture calls with, so sign in before showing the CRM.
    void loadSession().then((session) => {
      if (session === null || isExpired(session, new Date())) {
        router.replace('/(auth)/login');
        return;
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <SafeAreaView style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: SALES_APP_URL }}
        // The sales app is a PWA that stores its own auth; keeping storage and
        // cookies on means a signed-in agent stays signed in across launches.
        domStorageEnabled
        javaScriptEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        // Uploads from the lead screens (attachments, QR) need file access.
        allowFileAccess
        originWhitelist={['https://crm.hamagan.com']}
        pullToRefreshEnabled
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

- [ ] **Step 3: Run it on a device and confirm both halves work**

```bash
npx expo run:android --port 8083
```

Expected: the native sign-in screen accepts real CRM credentials and stores a
session, then the sales app renders in the WebView and can be signed into
separately. If the WebView renders blank, check `originWhitelist` first.

**Do not run this concurrently with another Expo app's native build** — parallel
runs race on the same native build state and produce misleading module errors.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: native sign-in and the sales PWA WebView shell"
```

---

## Phase 2 — The decision logic, all off-device (Tasks 5-7)

These three tasks contain every rule that matters and are fully unit tested
without a phone. Get them right before touching Kotlin.

### Task 5: Call filtering

**Files:**
- Create: `lib/callFilter.ts`
- Test: `__tests__/callFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { shouldReportCall, type DeviceCall } from '../lib/callFilter';

const call = (over: Partial<DeviceCall> = {}): DeviceCall => ({
  deviceCallId: '1',
  e164: '+93790123456',
  direction: 'OUTBOUND',
  startedAt: '2026-08-31T09:00:00.000Z',
  durationSeconds: 60,
  ...over,
});

const known = new Set(['+93790123456']);

describe('shouldReportCall', () => {
  it('reports a call to a known CRM number', () => {
    expect(shouldReportCall(call(), known, new Set())).toEqual({ report: true });
  });

  it('never reports a number absent from the CRM', () => {
    expect(shouldReportCall(call({ e164: '+93700000001' }), known, new Set())).toEqual({
      report: false,
      reason: 'unknown-number',
    });
  });

  it('does not re-ask about a number the agent marked personal', () => {
    const dismissed = new Set(['+93700000001']);

    expect(
      shouldReportCall(call({ e164: '+93700000001' }), known, dismissed),
    ).toEqual({ report: false, reason: 'dismissed' });
  });

  it('reports a missed call, which has zero duration', () => {
    expect(
      shouldReportCall(call({ direction: 'MISSED', durationSeconds: 0 }), known, new Set()),
    ).toEqual({ report: true });
  });

  it('ignores an answered call too short to be a real conversation', () => {
    expect(shouldReportCall(call({ durationSeconds: 1 }), known, new Set())).toEqual({
      report: false,
      reason: 'too-short',
    });
  });

  it('ignores a call with an unparseable number', () => {
    expect(shouldReportCall(call({ e164: null }), known, new Set())).toEqual({
      report: false,
      reason: 'no-number',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest callFilter
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export type DeviceCall = {
  deviceCallId: string;
  /** Canonical number, or null when the log had none (withheld/unknown). */
  e164: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | 'MISSED';
  startedAt: string;
  durationSeconds: number;
};

export type FilterVerdict =
  | { report: true }
  | {
      report: false;
      reason: 'no-number' | 'unknown-number' | 'dismissed' | 'too-short';
    };

/**
 * An answered call this short is a misdial or a voicemail bounce, not a
 * conversation. Missed calls are exempt: their duration is always zero and the
 * fact that a lead rang is itself worth recording.
 */
const MIN_ANSWERED_SECONDS = 5;

/**
 * Decides whether a call from the device log may leave the phone at all.
 *
 * This is the privacy boundary: a call is reportable only if its number is
 * already a CRM contact. Everything else — an agent's family, their doctor,
 * their landlord — fails here and is never transmitted, which is why the
 * decision is made on-device rather than server-side.
 */
export const shouldReportCall = (
  call: DeviceCall,
  knownNumbers: ReadonlySet<string>,
  dismissedNumbers: ReadonlySet<string>,
): FilterVerdict => {
  if (call.e164 === null) {
    return { report: false, reason: 'no-number' };
  }

  if (dismissedNumbers.has(call.e164)) {
    return { report: false, reason: 'dismissed' };
  }

  if (!knownNumbers.has(call.e164)) {
    return { report: false, reason: 'unknown-number' };
  }

  if (
    call.direction !== 'MISSED' &&
    call.durationSeconds < MIN_ANSWERED_SECONDS
  ) {
    return { report: false, reason: 'too-short' };
  }

  return { report: true };
};
```

- [ ] **Step 4: Run and confirm green**

```bash
npx jest callFilter
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: on-device call filtering, the privacy boundary"
```

---

### Task 6: Recording-to-call matching

**Files:**
- Create: `lib/recordingMatch.ts`
- Test: `__tests__/recordingMatch.test.ts`

OEM recorders name and time files differently, and a wrong match attaches one
lead's audio to another lead's call. When the evidence is ambiguous this must
decline rather than guess.

- [ ] **Step 1: Write the failing test**

```ts
import { matchRecording, type RecordingFile } from '../lib/recordingMatch';

const file = (over: Partial<RecordingFile> = {}): RecordingFile => ({
  uri: 'content://tree/a.m4a',
  name: 'Call_790123456_20260831_090000.m4a',
  modifiedAt: '2026-08-31T09:02:30.000Z',
  sizeBytes: 240_000,
  ...over,
});

const call = {
  startedAt: '2026-08-31T09:00:00.000Z',
  durationSeconds: 150,
  e164: '+93790123456',
};

describe('matchRecording', () => {
  it('matches the file written when the call ended', () => {
    expect(matchRecording(call, [file()])).toEqual({
      status: 'matched',
      uri: 'content://tree/a.m4a',
    });
  });

  it('finds nothing when no file is near the call window', () => {
    const far = file({ modifiedAt: '2026-08-31T14:00:00.000Z' });

    expect(matchRecording(call, [far])).toEqual({ status: 'none' });
  });

  it('prefers the file whose number appears in the filename', () => {
    const other = file({
      uri: 'content://tree/b.m4a',
      name: 'Call_700000009_20260831_090000.m4a',
    });

    expect(matchRecording(call, [other, file()])).toEqual({
      status: 'matched',
      uri: 'content://tree/a.m4a',
    });
  });

  it('refuses to guess between two equally plausible files', () => {
    const a = file({ uri: 'content://tree/a.m4a', name: 'recording-1.m4a' });
    const b = file({ uri: 'content://tree/b.m4a', name: 'recording-2.m4a' });

    expect(matchRecording(call, [a, b])).toEqual({
      status: 'ambiguous',
      candidates: ['content://tree/a.m4a', 'content://tree/b.m4a'],
    });
  });

  it('ignores an empty file the recorder never finished writing', () => {
    expect(matchRecording(call, [file({ sizeBytes: 0 })])).toEqual({ status: 'none' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest recordingMatch
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export type RecordingFile = {
  uri: string;
  name: string;
  /** Last-modified time; for most OEM recorders this is when the call ended. */
  modifiedAt: string;
  sizeBytes: number;
};

export type RecordingMatch =
  | { status: 'matched'; uri: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'none' };

/**
 * How far from the expected end of the call a file may be written and still
 * belong to it. Recorders flush at slightly different moments and device clocks
 * drift, so this is deliberately loose; precision comes from the filename check.
 */
const WINDOW_MS = 90_000;

/** Digits only, so '+93790123456' can be sought inside 'Call_790123456_...'. */
const digitsOf = (value: string): string => value.replace(/\D/g, '');

/**
 * Chooses the recording belonging to a finished call.
 *
 * Returns 'ambiguous' rather than picking when several files fit equally well.
 * Attaching the wrong audio to a lead is worse than attaching none: it is
 * silent, and it misrepresents what an agent said to a customer.
 */
export const matchRecording = (
  call: { startedAt: string; durationSeconds: number; e164: string },
  files: RecordingFile[],
): RecordingMatch => {
  const endedAt =
    new Date(call.startedAt).getTime() + call.durationSeconds * 1000;

  const inWindow = files.filter(
    (candidate) =>
      candidate.sizeBytes > 0 &&
      Math.abs(new Date(candidate.modifiedAt).getTime() - endedAt) <= WINDOW_MS,
  );

  if (inWindow.length === 0) {
    return { status: 'none' };
  }

  if (inWindow.length === 1) {
    return { status: 'matched', uri: inWindow[0].uri };
  }

  const callDigits = digitsOf(call.e164);
  const named = inWindow.filter((candidate) => {
    const fileDigits = digitsOf(candidate.name);

    return (
      fileDigits.length > 0 &&
      (callDigits.endsWith(fileDigits) || fileDigits.endsWith(callDigits.slice(-9)))
    );
  });

  if (named.length === 1) {
    return { status: 'matched', uri: named[0].uri };
  }

  return {
    status: 'ambiguous',
    candidates: inWindow.map((candidate) => candidate.uri),
  };
};
```

- [ ] **Step 4: Run and confirm green**

```bash
npx jest recordingMatch
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: recording-to-call matching that declines when ambiguous"
```

---

### Task 7: Upload queue state machine

**Files:**
- Create: `lib/uploadQueue.ts`
- Test: `__tests__/uploadQueue.test.ts`

Pure reducer, no I/O, so every retry and reboot path is testable.

- [ ] **Step 1: Write the failing test**

```ts
import { reduce, nextPending, type QueueItem, type QueueState } from '../lib/uploadQueue';

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  deviceCallId: 'c1',
  state: 'pending',
  attempts: 0,
  ...over,
});

const state = (items: QueueItem[]): QueueState => ({ items });

describe('upload queue', () => {
  it('marks an item sent on success', () => {
    const next = reduce(state([item()]), { type: 'succeeded', deviceCallId: 'c1' });

    expect(next.items[0]).toMatchObject({ state: 'sent' });
  });

  it('returns a failed item to pending and counts the attempt', () => {
    const next = reduce(state([item()]), { type: 'failed', deviceCallId: 'c1' });

    expect(next.items[0]).toMatchObject({ state: 'pending', attempts: 1 });
  });

  it('gives up after the retry ceiling instead of looping forever', () => {
    const next = reduce(state([item({ attempts: 4 })]), {
      type: 'failed',
      deviceCallId: 'c1',
    });

    expect(next.items[0]).toMatchObject({ state: 'failed', attempts: 5 });
  });

  it('drops an item the server already has', () => {
    const next = reduce(state([item()]), { type: 'duplicate', deviceCallId: 'c1' });

    expect(next.items[0]).toMatchObject({ state: 'sent' });
  });

  it('does not retry an unmatched call, which will never match', () => {
    const next = reduce(state([item()]), { type: 'unmatched', deviceCallId: 'c1' });

    expect(next.items[0]).toMatchObject({ state: 'rejected' });
  });

  it('never enqueues the same call twice', () => {
    const next = reduce(state([item()]), { type: 'enqueued', item: item() });

    expect(next.items).toHaveLength(1);
  });

  it('hands out only pending work, oldest first', () => {
    const queue = state([
      item({ deviceCallId: 'sent', state: 'sent' }),
      item({ deviceCallId: 'a' }),
      item({ deviceCallId: 'b' }),
    ]);

    expect(nextPending(queue)?.deviceCallId).toBe('a');
  });

  it('has no work when everything is settled', () => {
    expect(nextPending(state([item({ state: 'sent' })]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npx jest uploadQueue
```

Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export type QueueItemState = 'pending' | 'sent' | 'failed' | 'rejected';

export type QueueItem = {
  deviceCallId: string;
  state: QueueItemState;
  attempts: number;
};

export type QueueState = { items: QueueItem[] };

export type QueueEvent =
  | { type: 'enqueued'; item: QueueItem }
  | { type: 'succeeded'; deviceCallId: string }
  | { type: 'duplicate'; deviceCallId: string }
  | { type: 'unmatched'; deviceCallId: string }
  | { type: 'rejected-missing'; deviceCallId: string }
  | { type: 'failed'; deviceCallId: string };

/** Roughly a day of backoff at the intervals the sender uses. */
const MAX_ATTEMPTS = 5;

const mapItem = (
  state: QueueState,
  deviceCallId: string,
  change: (item: QueueItem) => QueueItem,
): QueueState => ({
  items: state.items.map((item) =>
    item.deviceCallId === deviceCallId ? change(item) : item,
  ),
});

/**
 * The queue is a pure reducer so every path — retry, give-up, reboot, a
 * duplicate the server already stored — is testable without a device or a
 * network. Persistence just serializes QueueState.
 */
export const reduce = (state: QueueState, event: QueueEvent): QueueState => {
  switch (event.type) {
    case 'enqueued':
      // The device call id is the idempotency key end to end; enqueueing twice
      // (a re-scan, a restart mid-scan) must not double-count a call.
      return state.items.some(
        (item) => item.deviceCallId === event.item.deviceCallId,
      )
        ? state
        : { items: [...state.items, event.item] };

    case 'succeeded':
    case 'duplicate':
      // 'duplicate' means the server already has it, which is success.
      return mapItem(state, event.deviceCallId, (item) => ({
        ...item,
        state: 'sent',
      }));

    case 'unmatched':
    case 'rejected-missing':
      // 'unmatched': the number is not a CRM contact, so retrying cannot change
      // it. 'rejected-missing': the payload was lost across a restart and the
      // call log will re-offer the call on the next pass.
      return mapItem(state, event.deviceCallId, (item) => ({
        ...item,
        state: 'rejected',
      }));

    case 'failed':
      return mapItem(state, event.deviceCallId, (item) => {
        const attempts = item.attempts + 1;

        return {
          ...item,
          attempts,
          state: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        };
      });
  }
};

/** The next item to send, oldest first, or null when nothing is waiting. */
export const nextPending = (state: QueueState): QueueItem | null =>
  state.items.find((item) => item.state === 'pending') ?? null;
```

- [ ] **Step 4: Run and confirm green**

```bash
npx jest uploadQueue
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: upload queue reducer with retry ceiling"
```

---

## Phase 3 — Native Android (Tasks 8-9)

Kotlin cannot be unit tested in this harness; these tasks are verified on a real
handset. Keep the Kotlin dumb — read the platform, return plain data, decide
nothing. Every decision belongs to Phase 2.

### Task 8: The call log native module

**Files:**
- Create: `modules/usystems-call-log/expo-module.config.json`
- Create: `modules/usystems-call-log/package.json`
- Create: `modules/usystems-call-log/index.ts`
- Create: `modules/usystems-call-log/android/build.gradle`
- Create: `modules/usystems-call-log/android/src/main/AndroidManifest.xml`
- Create: `modules/usystems-call-log/android/src/main/java/af/usystems/sales/calllog/CallLogModule.kt`

This follows `usystems_connect_mobile/modules/usystems-home-widget` exactly —
read that module first if anything here is unclear.

- [ ] **Step 1: Scaffold the module**

`expo-module.config.json`:

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["af.usystems.sales.calllog.CallLogModule"]
  }
}
```

`package.json`:

```json
{
  "name": "usystems-call-log",
  "version": "1.0.0",
  "description": "Reads finished calls from the Android call log.",
  "private": true,
  "main": "index.ts"
}
```

`android/build.gradle`:

```gradle
plugins {
  id 'com.android.library'
  id 'expo-module-gradle-plugin'
}

group = 'af.usystems.sales'
version = '1.0.0'

android {
  namespace "af.usystems.sales.calllog"
  defaultConfig {
    versionCode 1
    versionName "1.0.0"
  }
}
```

`android/src/main/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.READ_CALL_LOG" />
  <uses-permission android:name="android.permission.READ_PHONE_STATE" />
</manifest>
```

- [ ] **Step 2: Write the Kotlin module**

`CallLogModule.kt`:

```kotlin
package af.usystems.sales.calllog

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CallLog
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("USystemsCallLog")

    AsyncFunction("hasPermissionAsync") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) ==
        PackageManager.PERMISSION_GRANTED
    }

    // Returns calls that ended at or after `sinceEpochMs`, newest first.
    // Deliberately returns raw rows and decides nothing: the reporting rules
    // live in TypeScript (lib/callFilter.ts) where they are unit tested.
    AsyncFunction("getCallsSinceAsync") { sinceEpochMs: Double ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG) !=
        PackageManager.PERMISSION_GRANTED
      ) {
        throw SecurityException("READ_CALL_LOG not granted")
      }

      readCalls(context, sinceEpochMs.toLong())
    }
  }

  private fun readCalls(context: Context, sinceEpochMs: Long): List<Map<String, Any?>> {
    val projection = arrayOf(
      CallLog.Calls._ID,
      CallLog.Calls.NUMBER,
      CallLog.Calls.TYPE,
      CallLog.Calls.DATE,
      CallLog.Calls.DURATION,
    )

    val results = mutableListOf<Map<String, Any?>>()

    context.contentResolver.query(
      CallLog.Calls.CONTENT_URI,
      projection,
      "${CallLog.Calls.DATE} >= ?",
      arrayOf(sinceEpochMs.toString()),
      "${CallLog.Calls.DATE} DESC",
    )?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(CallLog.Calls._ID)
      val numberIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
      val typeIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.TYPE)
      val dateIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DATE)
      val durationIndex = cursor.getColumnIndexOrThrow(CallLog.Calls.DURATION)

      while (cursor.moveToNext()) {
        results.add(
          mapOf(
            "deviceCallId" to cursor.getString(idIndex),
            "number" to cursor.getString(numberIndex),
            "direction" to when (cursor.getInt(typeIndex)) {
              CallLog.Calls.INCOMING_TYPE -> "INBOUND"
              CallLog.Calls.OUTGOING_TYPE -> "OUTBOUND"
              else -> "MISSED"
            },
            "startedAtEpochMs" to cursor.getLong(dateIndex).toDouble(),
            "durationSeconds" to cursor.getLong(durationIndex).toDouble(),
          ),
        )
      }
    }

    return results
  }
}
```

- [ ] **Step 3: Write the TypeScript face**

`index.ts`:

```ts
import { requireNativeModule } from 'expo-modules-core';

export type NativeCall = {
  deviceCallId: string;
  number: string | null;
  direction: 'INBOUND' | 'OUTBOUND' | 'MISSED';
  startedAtEpochMs: number;
  durationSeconds: number;
};

const nativeModule = requireNativeModule('USystemsCallLog');

export const hasPermissionAsync = (): Promise<boolean> =>
  nativeModule.hasPermissionAsync();

export const getCallsSinceAsync = (sinceEpochMs: number): Promise<NativeCall[]> =>
  nativeModule.getCallsSinceAsync(sinceEpochMs);
```

- [ ] **Step 4: Build and verify on a handset**

```bash
npx expo run:android --port 8083
```

Then, from the app, grant the permission and log the result of
`getCallsSinceAsync(Date.now() - 86_400_000)`.

Expected: an array of the last day's calls with real numbers, directions and
durations. An empty array on a phone that has made calls means the permission
was not actually granted — check the runtime grant, not the manifest.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: native call log module"
```

---

### Task 9: Recorder folder access

**Files:**
- Modify: `modules/usystems-call-log/android/src/main/java/af/usystems/sales/calllog/CallLogModule.kt`
- Modify: `modules/usystems-call-log/index.ts`

The agent grants the OEM recorder's folder **once** via the Storage Access
Framework. There is no reliable common path across OEMs, so asking the agent to
point at it is more robust than guessing — and it keeps the app to the one
folder it was given rather than broad storage access.

- [ ] **Step 1: Add the folder functions to the Kotlin module**

Add inside `ModuleDefinition`:

```kotlin
    // The agent picks the recorder folder once; the grant is persisted so it
    // survives restarts. Returns files only -- matching is done in TypeScript.
    AsyncFunction("listRecordingsAsync") { treeUri: String, sinceEpochMs: Double ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val tree = androidx.documentfile.provider.DocumentFile.fromTreeUri(
        context,
        android.net.Uri.parse(treeUri),
      ) ?: return@AsyncFunction emptyList<Map<String, Any?>>()

      tree.listFiles()
        .filter { it.isFile && it.lastModified() >= sinceEpochMs.toLong() }
        .map {
          mapOf(
            "uri" to it.uri.toString(),
            "name" to (it.name ?: ""),
            "modifiedAtEpochMs" to it.lastModified().toDouble(),
            "sizeBytes" to it.length().toDouble(),
          )
        }
    }

    AsyncFunction("persistTreePermissionAsync") { treeUri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.contentResolver.takePersistableUriPermission(
        android.net.Uri.parse(treeUri),
        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
      )
      true
    }
```

Add the DocumentFile dependency to `android/build.gradle`:

```gradle
dependencies {
  implementation 'androidx.documentfile:documentfile:1.0.1'
}
```

- [ ] **Step 2: Extend the TypeScript face**

Append to `index.ts`:

```ts
export type NativeRecording = {
  uri: string;
  name: string;
  modifiedAtEpochMs: number;
  sizeBytes: number;
};

export const listRecordingsAsync = (
  treeUri: string,
  sinceEpochMs: number,
): Promise<NativeRecording[]> =>
  nativeModule.listRecordingsAsync(treeUri, sinceEpochMs);

export const persistTreePermissionAsync = (treeUri: string): Promise<boolean> =>
  nativeModule.persistTreePermissionAsync(treeUri);
```

- [ ] **Step 3: Verify on a handset that records calls**

Make a call, let the OEM recorder save it, then call `listRecordingsAsync` with
the granted tree URI.

Expected: the new recording appears with a non-zero `sizeBytes` and a
`modifiedAtEpochMs` within ~90s of when the call ended. **Write down the exact
filename format for each handset model tested** — those strings are the fixtures
Task 6's matcher is tuned against, and the plan is guessing at them until real
ones are collected.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: SAF recorder folder listing"
```

---

## Phase 4 — Wire it together (Tasks 10-11)

### Task 10: Queue persistence

**Files:**
- Create: `services/queueStore.ts`

The reducer in Task 7 is pure; this is the only place queue state touches disk.
Without it, a call captured while offline is lost on the next app kill.

- [ ] **Step 1: Write it**

```ts
import * as FileSystem from 'expo-file-system';

import type { QueueState } from '../lib/uploadQueue';

const QUEUE_PATH = `${FileSystem.documentDirectory}call-queue.json`;

const EMPTY: QueueState = { items: [] };

/** Never throws: a corrupt or missing queue file starts empty rather than
 *  blocking capture, since the call log can re-offer anything not yet sent. */
export const loadQueue = async (): Promise<QueueState> => {
  try {
    const info = await FileSystem.getInfoAsync(QUEUE_PATH);

    if (!info.exists) return EMPTY;

    const raw = await FileSystem.readAsStringAsync(QUEUE_PATH);
    const parsed = JSON.parse(raw) as QueueState;

    return Array.isArray(parsed.items) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
};

export const saveQueue = async (state: QueueState): Promise<void> => {
  // Sent and rejected items are dropped on write: they are terminal, and the
  // server's deviceCallId idempotency stops a re-send from double-counting.
  const retained = state.items.filter(
    (item) => item.state === 'pending' || item.state === 'failed',
  );

  await FileSystem.writeAsStringAsync(
    QUEUE_PATH,
    JSON.stringify({ items: retained }),
  );
};
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: persist the upload queue across restarts"
```

---

### Task 11: The sync pass

**Files:**
- Create: `services/sync.ts`

- [ ] **Step 1: Write it**

```ts
import {
  getCallsSinceAsync,
  listRecordingsAsync,
  type NativeCall,
} from '../modules/usystems-call-log';
import { fetchPhoneIndex, postCallActivity } from './api';
import { shouldReportCall, type DeviceCall } from '../lib/callFilter';
import { matchRecording } from '../lib/recordingMatch';
import { nextPending, reduce } from '../lib/uploadQueue';
import { loadQueue, saveQueue } from './queueStore';
import type { CallActivityPayload } from './api';

/**
 * One pass: read the calls since the last sync, keep only those the filter
 * allows off the device, attach a recording where one is unambiguous, and post.
 *
 * Returns the numbers that were seen but are not CRM contacts, so the UI can
 * offer "add as a contact" without those numbers ever being transmitted.
 */
export const runSyncPass = async ({
  sinceEpochMs,
  recordingTreeUri,
  dismissedNumbers,
  toE164,
}: {
  sinceEpochMs: number;
  recordingTreeUri: string | null;
  dismissedNumbers: ReadonlySet<string>;
  toE164: (raw: string) => string | null;
}): Promise<{ posted: number; unknownNumbers: string[] }> => {
  const index = await fetchPhoneIndex();
  const known = new Set(index.map((entry) => entry.e164));

  const nativeCalls = await getCallsSinceAsync(sinceEpochMs);
  const recordings =
    recordingTreeUri === null
      ? []
      : await listRecordingsAsync(recordingTreeUri, sinceEpochMs);

  const unknownNumbers: string[] = [];
  const payloads = new Map<string, CallActivityPayload>();
  let queue = await loadQueue();
  let posted = 0;

  for (const native of nativeCalls) {
    const call = toDeviceCall(native, toE164);
    const verdict = shouldReportCall(call, known, dismissedNumbers);

    if (!verdict.report) {
      if (verdict.reason === 'unknown-number' && call.e164 !== null) {
        unknownNumbers.push(call.e164);
      }
      continue;
    }

    const match =
      call.e164 === null
        ? { status: 'none' as const }
        : matchRecording(
            {
              startedAt: call.startedAt,
              durationSeconds: call.durationSeconds,
              e164: call.e164,
            },
            recordings.map((file) => ({
              uri: file.uri,
              name: file.name,
              modifiedAt: new Date(file.modifiedAtEpochMs).toISOString(),
              sizeBytes: file.sizeBytes,
            })),
          );

    // Everything reportable goes through the queue rather than straight to the
    // network, so a call survives being offline, killed or rebooted mid-sync.
    queue = reduce(queue, {
      type: 'enqueued',
      item: { deviceCallId: call.deviceCallId, state: 'pending', attempts: 0 },
    });
    payloads.set(call.deviceCallId, {
      deviceCallId: call.deviceCallId,
      direction: call.direction,
      channel: 'PHONE',
      phoneNumber: call.e164 ?? undefined,
      startedAt: call.startedAt,
      durationSeconds: call.durationSeconds,
      durationSource: 'CALL_LOG',
    });
    void match;
  }

  // Drain. Each outcome is a queue event, so retries and give-up are decided by
  // the reducer in lib/uploadQueue.ts, which is unit tested.
  let item = nextPending(queue);

  while (item !== null) {
    const payload = payloads.get(item.deviceCallId);

    if (payload === undefined) {
      queue = reduce(queue, { type: 'rejected-missing', deviceCallId: item.deviceCallId });
    } else {
      try {
        const result = await postCallActivity(payload);

        queue = reduce(queue, { type: result.status === 'unmatched' ? 'unmatched' : result.status, deviceCallId: item.deviceCallId });

        if (result.status === 'created') {
          posted += 1;
        }
      } catch {
        queue = reduce(queue, { type: 'failed', deviceCallId: item.deviceCallId });
      }
    }

    await saveQueue(queue);

    const following = nextPending(queue);

    // Stop once the only pending work is an item already retried this pass;
    // the next sync picks it up rather than spinning here.
    if (following?.deviceCallId === item.deviceCallId) break;
    item = following;
  }

  return { posted, unknownNumbers };
};

const toDeviceCall = (
  native: NativeCall,
  toE164: (raw: string) => string | null,
): DeviceCall => ({
  deviceCallId: native.deviceCallId,
  e164: native.number === null ? null : toE164(native.number),
  direction: native.direction,
  startedAt: new Date(native.startedAtEpochMs).toISOString(),
  durationSeconds: Math.round(native.durationSeconds),
});
```

`toE164` is injected rather than imported so the app uses the same normalizer as
the server.

**Sharing decision:** this repo cannot reach the CRM monorepo at build time, so
the file is **vendored** — copy
`packages/twenty-shared/src/utils/phone/normalizePhoneNumber.ts` and its test
file verbatim into `lib/phone/` and run both here. Copy the test too: it is what
turns a silent drift into a red build.

Vendoring is the weak point in this design and is chosen knowingly. A submodule
couples this repo's checkout to the CRM's; publishing a package is the right
long-term answer but is infrastructure this plan does not build. Add a header
comment to the copy naming the source path, so the next person knows it is not
the original. **Never retype it** — a second implementation that drifts stops
matching calls to leads silently, the failure mode the spec calls out as hardest
to notice.

- [ ] **Step 2: Add the queue drain test**

The drain loop introduces one rule the reducer tests do not cover: a pass must
not spin on an item it already retried. Append to `__tests__/uploadQueue.test.ts`:

```ts
it('drops a queued item whose payload was lost across a restart', () => {
  const next = reduce(state([item()]), {
    type: 'rejected-missing',
    deviceCallId: 'c1',
  });

  expect(next.items[0]).toMatchObject({ state: 'rejected' });
});
```

Run it:

```bash
npx jest uploadQueue
```

Expected: PASS, 9 tests.

- [ ] **Step 3: Verify end to end on a handset**

With the app signed in and permissions granted, make a real call to a number
that exists in the CRM, then run a sync pass.

Expected: `posted: 1`, and the call appears on that contact in the CRM with the
right direction and duration. Then call a number that is **not** in the CRM and
confirm it comes back in `unknownNumbers` and that **no** Call Activity was
created for it — this is the privacy guarantee, and it must be checked against
the CRM, not inferred from the app's own UI.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: call sync pass draining the persisted queue"
```

---

## Deliberately deferred

- **Audio upload.** `runSyncPass` computes the recording match but does not yet
  upload it (`void match` marks the seam); the multipart `uploadFilesFieldFile` → `createAttachment` flow
  against the returned `callActivityId` is the next task, and it is left out
  here so the call-capture path can be proven on a device first.
- **Background execution.** This plan syncs on app foreground. A WorkManager or
  `expo-task-manager` trigger so calls sync without opening the app is a
  follow-up, and it is where most of the remaining battery and reliability risk
  sits.
- **WhatsApp/Telegram detection** via `NotificationListenerService` — name and
  timing only, no number, no audio. Worth building only after the phone path is
  trusted.
- **The unknown-number "add as contact" UI.** `runSyncPass` returns the numbers;
  the screen that turns one into a Person or an additional phone on an existing
  Person is not built here.
- **iOS.** See Scope.
