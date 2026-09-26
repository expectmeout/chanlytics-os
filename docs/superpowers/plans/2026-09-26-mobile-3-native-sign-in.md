# The phone app, PR 3: native sign-in and the lock

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in with Apple and with Google natively, the token becoming the WebView's cookie through PR 0's door; a
lock in front of the pages; a sign-out that is one on both sides. The spec is
`docs/superpowers/specs/2026-09-26-mobile-3-native-sign-in-design.md`; the PRD's M5.

**Architecture:** all on the app. `shell/sign-in.ts` holds the pure rules (the door's form, Google's ids and scheme,
when the lock stands); `shell/native-auth.ts` the two sheets and the native sign-out; `shell/lock.ts` the biometric
prompt and the secure-store choice; `shell/SignIn.tsx` and `shell/Lock.tsx` the two screens; `Surface.tsx` gains a
`post` so a Surface can POST the door's form; `app.config.ts` the Apple capability, the two plugins, and Google's
plugin only when its id exists. Nothing on the web changes: the door is PR 0's.

**Tech Stack:** `expo-apple-authentication`, `expo-local-authentication`, `expo-secure-store`, `expo-crypto` at the
SDK's versions; `@react-native-google-signin/google-signin` 16 (its free, original flow).

**Worktree and branch:** `claude/fervent-brahmagupta-dj2o1e`, off `origin/main` at `eabf469a` (PR 2 merged).

---

### Task 1: The rules

- [x] `shell/sign-in.ts`: `doorForm`, `googleIds`, `reversedClientId`, `shouldLock`, `LOCK_GRACE_MS`; `test/sign-in.test.mjs`.

### Task 2: The sheets, the lock, the screens

- [x] `shell/native-auth.ts`: Apple with a hashed nonce and the raw one for the door; Google configured from the
      build's ids; `signOutNatively`.
- [x] `shell/lock.ts`: `canLock`, `lockChoice`, `setLockChoice`, `unlock`. `shell/Lock.tsx`: one prompt on arrival, a
      button to ask again, and "Stop locking this app" after one success.
- [x] `shell/SignIn.tsx`: the native screen, the email door as the web's login in a Surface, a handoff as a Surface that
      POSTs the door's form (`Surface.post`, `site.ts NATIVE_DOOR`).
- [x] `_layout.tsx`: the sign-in screen when nobody is in; the lock at launch and after two minutes away; Google's
      sign-out when the page reports "out".
- [x] `app.config.ts`: `usesAppleSignIn`, the Apple, local-authentication and secure-store plugins, Google's plugin
      with the reversed id when `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set.

### Task 3: The gates and the PR

- [x] The app's `tsc`, `expo lint`, the suite; a Metro export; the repository's gates.
- [x] Squash-merge (#1130).

---

## As built (26 Sep 2026)

- **Not proven on a phone here.** Apple's sheet needs a device build under the Apple account; Google's needs the ids.
  Both are a rebuild away once Ruben sets them (the runbook's "Turn on native sign-in"). The rules and the form are
  executed by tests; the screens compile and bundle.
- **Google's Android side is the legacy Play Services flow** the free SDK still ships; Credential Manager is its paid
  tier or the nitro package. Revisit if Google removes the legacy flow before the app is in the store.
- **The lock is on by default** where the phone can lock; the PRD said "Face ID lock" without a default, and the
  spec's decision 3 chose it. Ruben may reverse it in one constant.
