# The phone app, PR 1: the shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An app that runs in the iOS Simulator and an Android emulator and holds the live site in five native tabs:
Today, Inbox, Calendar, People, More. The Inbox tab wears the needs-you count, More opens the web's drawer, a re-tap
scrolls to the top, sign-in works through the code and password doors, a phone without a network sees a native
screen, and a deploy on the web reloads the page on the next foreground. A first cloud build proves the pipeline.
The spec is `docs/superpowers/specs/2026-09-26-mobile-app-prd.md` (M1 to M5, M9, M10, M11).

**Architecture:** `apps/mobile` (Expo SDK 58, Expo Router, `expo-router/native-tabs`, `react-native-webview`,
`expo-network`, `expo-updates`, `react-native-safe-area-context`), one WebView per tab created on first focus; one
browser-layer module on the web, `legacy-bridge/app-bridge.ts`, that speaks the bridge (PRD M3) under `html.in-app`;
one CSS rule hiding the Google door in-app; one `shell:menu` listener in the app shell. The bridge's message shapes
live in `packages/contracts/src/app-bridge.ts` so both sides import one definition.

**Tech Stack:** TypeScript everywhere; node:test for the web side and the shell's pure modules (`tooling/scripts/tests`
for the web, `apps/mobile/test` for the shell, run by the same `corepack pnpm test` through a second glob); EAS Build
from `apps/mobile`; no new dependency on the web side.

**Worktree and branch:** `feat/mobile-shell`, off `origin/main` at the commit named in Task 0. One PR at the end.
Re-read the PRD's M2 and M4 before Task 5; they carry the two things this plan cannot know until a device is in hand.

**Before starting, once:** an Expo account and project (`eas init` from `apps/mobile` prints `extra.eas.projectId`),
and `EXPO_TOKEN` in the environment so `eas build` runs without a login. Nothing else. No Apple account is needed for
a simulator build; a device build waits for enrollment.

---

### Task 0: The baseline, and the commit this plan reads

**Files:** none.

- [ ] **Step 1:** `git fetch origin main && git checkout -b feat/mobile-shell origin/main`; write the sha into this
      plan's header line ("off `origin/main` at …").
- [ ] **Step 2:** `corepack pnpm install --frozen-lockfile && corepack pnpm test`; note the pass count as the baseline.
- [ ] **Step 3:** `corepack pnpm --filter "./packages/*" build && git status`: clean, no dist drift.

---

### Task 1: The bridge's shapes, in contracts

**Files:**

- Create: `packages/contracts/src/app-bridge.ts`
- Modify: `packages/contracts/src/index.ts` (export it)
- Test: `tooling/scripts/tests/app-bridge.test.mjs`

- [ ] **Step 1: Write the failing test.**

```js
/**
 * The two wires between the native shell and the page (contracts/app-bridge.ts): what the page says and what the
 * shell asks, each a small tagged object, parsed once on either side and refused when malformed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePageMessage, parseShellMessage } from "../../../packages/contracts/src/app-bridge.ts";

test("a page message is one of four shapes; anything else is null", () => {
  assert.deepEqual(parsePageMessage('{"t":"route","route":"inbox"}'), { t: "route", route: "inbox" });
  assert.deepEqual(parsePageMessage('{"t":"needs","inbox":3}'), { t: "needs", inbox: 3 });
  assert.deepEqual(parsePageMessage('{"t":"session","state":"out"}'), { t: "session", state: "out" });
  assert.deepEqual(parsePageMessage('{"t":"workspace","slug":"acme-plumbing"}'), { t: "workspace", slug: "acme-plumbing" });
  assert.equal(parsePageMessage('{"t":"needs","inbox":"three"}'), null);
  assert.equal(parsePageMessage("not json"), null);
  assert.equal(parsePageMessage('{"t":"route","route":"javascript:alert(1)"}'), null);
});

test("a shell message is navigate, menu or top; a route is a hash route's name, never a URL", () => {
  assert.deepEqual(parseShellMessage({ t: "navigate", route: "clients" }), { t: "navigate", route: "clients" });
  assert.deepEqual(parseShellMessage({ t: "menu" }), { t: "menu" });
  assert.deepEqual(parseShellMessage({ t: "top" }), { t: "top" });
  assert.equal(parseShellMessage({ t: "navigate", route: "https://example.com" }), null);
  assert.equal(parseShellMessage(null), null);
});
```

- [ ] **Step 2: Run it to see it fail.** `corepack pnpm test tooling/scripts/tests/app-bridge.test.mjs`.
- [ ] **Step 3: Write `packages/contracts/src/app-bridge.ts`.** Two discriminated unions (`PageMessage`, `ShellMessage`),
      `ROUTE_RE = /^[a-z][a-z0-9-]*(?:\/[A-Za-z0-9:_-]+)*$/` (a hash route's name: `today`, `inbox`, `clients/abc`),
      `parsePageMessage(raw: string)` (JSON, then shape), `parseShellMessage(v: unknown)`. Pure, no imports. Header
      comment: what each wire is for, and that the page never trusts a route it did not parse.
- [ ] **Step 4: Run to green, rebuild the dist:** `corepack pnpm --filter @chanlytics/contracts build`.
- [ ] **Step 5: Commit** `feat(contracts): the shapes the native shell and the page say to each other`.

---

### Task 2: The page speaks the bridge

**Files:**

- Create: `apps/dashboard/src/legacy-bridge/app-bridge.ts`
- Modify: `apps/dashboard/src/legacy-bridge/LegacyApp.tsx` (install beside `installArrival()`, line ~124)
- Modify: `apps/dashboard/src/legacy/pages/app-shell.jsx` (a `shell:menu` listener that calls `setNavOpen(true)`; a
  `shell:top` listener that scrolls `.main-scroll` to 0; both near the Escape/resize listeners, line ~388)
- Modify: `apps/dashboard/src/legacy/styles/mobile.css` (after line 762: `html.in-app .auth-google, html.in-app .auth-or { display: none; }`)
- Test: `tooling/scripts/tests/app-bridge-page.test.mjs`, a case in `tooling/scripts/tests/phone-shell.test.mjs`

- [ ] **Step 1: Write the failing test** `app-bridge-page.test.mjs`. A stub `window` with `addEventListener`,
      `location.hash`, `document.documentElement.classList`, and `ReactNativeWebView.postMessage` collecting strings.
      Cases: nothing is installed without `html.in-app`; on install the page posts `{t:"route"}` for the current hash
      and `{t:"session",state:"in"}` when `window.__ME` names a person (read what `identity.ts` exposes; use that);
      `hashchange` posts the new route; `inbox:counts` with `{needs: 3}` posts `{t:"needs",inbox:3}`;
      `me:changed` to nobody posts `{t:"session",state:"out"}`; `workspace:changed` posts the slug from the path;
      `window.__appBridge.receive('{"t":"navigate","route":"inbox"}')` sets `location.hash` to `#/inbox`;
      `receive` of `menu` dispatches `shell:menu`; of `top` dispatches `shell:top`; a malformed message does nothing.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Write `app-bridge.ts`.** `installAppBridge(win = window): () => void`. Returns a no-op off `html.in-app`
      or without `win.ReactNativeWebView`. Reads the route from the hash the way `app-shell.jsx` line 56 does (share
      a helper if one exists; else the same regex). Exposes `win.__appBridge = { receive }`. Every post is
      `JSON.stringify` of a `PageMessage`. Header comment names the PRD decision (M3).
- [ ] **Step 4: The shell's two listeners and the CSS rule.** In `phone-shell.test.mjs` add: "inside the app the
      Google door and its divider are not drawn" (read the sheet the way the existing in-app cases do).
- [ ] **Step 5: Run the suite, lint, typecheck.** Layers: `app-bridge.ts` imports `@chanlytics/contracts` only.
- [ ] **Step 6: Commit** `feat(web): the page speaks the native shell's bridge, and hides the Google door in-app`.

---

### Task 3: The app, created

**Files:** `apps/mobile/**` (new), `pnpm-workspace.yaml` (unchanged: `apps/*` already includes it), `eslint.config.mjs`,
`.github/workflows/ci.yml`, `package.json` (the test glob), `.gitignore`.

- [ ] **Step 1: Create it.** From the repository root: `corepack pnpm create expo-app apps/mobile --template default --no-agents-md`.
      Then in `apps/mobile`: `corepack pnpm expo install react-native-webview expo-network expo-updates expo-dev-client expo-application expo-constants expo-symbols`.
      Delete the template's sample screens and components. Move routes to `src/app`.
- [ ] **Step 2: `app.config.ts`** (replace `app.json`): name `Chanlytics`, slug `chanlytics`, scheme `chanlytics`,
      `version` from the file, `ios.bundleIdentifier` and `android.package` `com.chanlytics.app`,
      `ios.deploymentTarget: "16.4"`, `ios.supportsTablet: false`, `ios.config.usesNonExemptEncryption: false`,
      `ios.associatedDomains: ["applinks:<product domain>"]` and the matching `android.intentFilters` with
      `autoVerify: true` (the domain from an `EXPO_PUBLIC_SITE_ORIGIN` read at config time; blank leaves both out),
      `experiments: { typedRoutes: true, reactCompiler: true }`, `updates.url` and `runtimeVersion: { policy: "fingerprint" }`
      written by `eas update:configure`, plugins: `expo-router`, `expo-splash-screen` (the mark on the page colour, a
      dark variant), `expo-updates`. No `newArchEnabled` key.
- [ ] **Step 3: `eas.json`.** `cli.appVersionSource: "remote"`. Profiles: `development` (dev client, internal),
      `development-simulator` (extends development, `ios.simulator: true`), `preview` (internal, channel `preview`),
      `production` (channel `production`, `autoIncrement: true`). `corepack: true`; `pnpm` version from the root
      `packageManager`. `submit.production` left for PR 6.
- [ ] **Step 4: Layers and CI.** In `eslint.config.mjs` a block for `apps/mobile/**/*.{ts,tsx}`: may import
      `@chanlytics/contracts` and nothing else under `@chanlytics/*` or `../../`; the existing blocks gain
      `apps/mobile` in what they may not import. In `ci.yml`, a `mobile` job: install, `pnpm --filter @chanlytics/mobile exec expo customize tsconfig.json`
      is not needed if `expo-env.d.ts` is generated by `expo start`; instead run `npx expo export --platform ios --output-dir /tmp/x`
      once to prove the bundle builds, then `tsc --noEmit`, `expo lint`, `npx expo-doctor`. Add `apps/mobile/test/*.test.mjs`
      to the root test script's globs. `.gitignore`: `apps/mobile/ios`, `apps/mobile/android`, `expo-env.d.ts`, `.expo`.
- [ ] **Step 5: Prove the tree.** `corepack pnpm install` from the root (the lockfile changes once), `corepack pnpm -r typecheck`,
      `corepack pnpm lint`, `corepack pnpm test`, and the dashboard's `next build` still passes (CI's last job). Note
      the root install time before and after; if Vercel's dashboard build slows by more than a minute, say so in the PR.
- [ ] **Step 6: Commit** `feat(mobile): the app, created on SDK 58 inside the workspace`.

---

### Task 4: The tabs and the WebView

**Files:**

- Create: `apps/mobile/src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/today.tsx`, `inbox.tsx`,
  `calendar.tsx`, `people.tsx`, `more.tsx`
- Create: `apps/mobile/src/site.ts` (the origin, the UA token, `hrefFor(slug, route)`), `src/shell/Surface.tsx` (the
  WebView), `src/shell/bridge.ts` (the shell's side of the bridge, pure), `src/shell/state.ts` (a small store: slug,
  session, needs, the tab's current route)
- Test: `apps/mobile/test/bridge.test.mjs`, `apps/mobile/test/site.test.mjs`

- [ ] **Step 1: `site.ts`.** `SITE_ORIGIN` from `process.env.EXPO_PUBLIC_SITE_ORIGIN` (a static read, the only way
      Expo inlines it); `userAgentToken(version, platform)` produces exactly what `contracts inAppFrom` parses
      (`ChanlyticsApp/1.0.0 (ios)`), and the test proves the round trip through `inAppFrom`. `hrefFor(slug, route)` is
      `/w/<slug>#/<route>`, matching `legacy-bridge/workspace.ts`'s `workspaceHref`; `null` slug gives `/`.
- [ ] **Step 2: `bridge.ts`.** `onPageMessage(state, raw)` parses with contracts' `parsePageMessage` and returns the
      next state (route, needs, session, slug) and what the shell should do (`nothing` | `sign-in` | `badge`).
      `askPage(msg: ShellMessage)` returns the JavaScript to inject: `window.__appBridge&&window.__appBridge.receive(<json>);true;`.
      Test both.
- [ ] **Step 3: `Surface.tsx`.** Props: `route`. Renders nothing until first focus (`useFocusEffect` sets a `mounted`
      flag once), then `WebView` with: `source={{ uri: hrefFor(slug, route) }}`, `applicationNameForUserAgent={userAgentToken(...)}`
      (`expo-application`'s `nativeApplicationVersion`), `sharedCookiesEnabled`, `onMessage` into the store,
      `onShouldStartLoadWithRequest` allowing the site's origin and the auth paths only and sending anything else to
      `expo-web-browser`, `setSupportMultipleWindows={false}` is NOT set (the library warns it opens an iframe escape),
      `onContentProcessDidTerminate={() => ref.reload()}`, `startInLoadingState` with the page colour,
      `renderError` rendering the offline screen, `allowsBackForwardNavigationGestures`, `pullToRefreshEnabled`,
      `contentInsetAdjustmentBehavior="never"`, `injectedJavaScriptBeforeContentLoaded` setting
      `document.documentElement.style.setProperty("--app-inset-bottom", "<px>px")` (M4: iOS `49 + insets.bottom`,
      Android `0`) before paint, `hideKeyboardAccessoryView`, `allowsInlineMediaPlayback`. Android hardware back
      goes to `ref.goBack()` while `canGoBack`.
- [ ] **Step 4: The tab layout.** `(tabs)/_layout.tsx` with `NativeTabs` from `expo-router/native-tabs`, five triggers:
      today (`sf="house"` / `md="home"`), inbox (`tray` / `inbox`) with `NativeTabs.Trigger.Badge` from the store's
      needs count (omitted at 0), calendar, people (`person.2` / `group`), more (`ellipsis` / `more_horiz`). `tintColor`
      and `labelStyle.color` through `DynamicColorIOS`. `listeners.tabPress` on each trigger: when the tab is already
      focused, inject `askPage({t:"top"})`. `disableScrollToTop` on every trigger (a WebView is not a ScrollView).
      Wrap the root in `ThemeProvider` with the page's colours so a tab switch never flashes white.
- [ ] **Step 5: More.** Its Surface loads the workspace at `#/today` and, when the page reports the route, injects
      `{t:"menu"}` once per focus. A re-tap injects it again.
- [ ] **Step 6: Run it.** `corepack pnpm --filter @chanlytics/mobile exec expo run:ios` needs a Mac; from here,
      `eas build --profile development-simulator --platform ios` and Android's `eas build --profile development --platform android`
      (an APK the emulator installs), then `expo start --dev-client` is the loop. Screenshot every tab and the badge.
      Measure a cold boot to first paint of Today on each; write both numbers in the PR.
- [ ] **Step 7: Commit** `feat(mobile): five native tabs over the live site, the badge, More`.

---

### Task 5: Sign-in, the offline screen, and the reload on a deploy

**Files:**

- Create: `apps/mobile/src/app/sign-in.tsx` (a Surface at `/login`, outside the tabs), `src/shell/Offline.tsx`,
  `src/shell/deploy.ts` (pure: decide when to reload)
- Modify: `src/app/_layout.tsx` (session gate: `state === "out"` shows sign-in; `"in"` shows the tabs), `Surface.tsx`
- Test: `apps/mobile/test/deploy.test.mjs`

- [ ] **Step 1: Sign-in.** The sign-in screen is the web's login page in a Surface; the code and password doors work
      as they are; the Google door is hidden by Task 2's rule. When the page reports `{t:"session",state:"in"}` and a
      slug, the tabs mount at that slug. `next` after sign-in is the web's own redirect; the shell does not steer it.
- [ ] **Step 2: Offline.** `useNetworkState()` from `expo-network`; `isConnected === false` or a Surface's
      `renderError` shows `Offline.tsx`: the mark, "No connection", a Retry that reloads the Surface. On iOS
      `isInternetReachable` equals `isConnected`, so the error path is the one that matters there.
- [ ] **Step 3: Reload on a deploy.** `deploy.ts`: given the sha the shell last saw from `GET /api/version` and the sha
      now, and whether the app just came to the foreground, answer `reload` or `keep`; never more than once per five
      minutes. Wired to `AppState` "active": fetch `/api/version` (public, `no-store`), and on a change inject
      `location.reload()` into every mounted Surface. Also `Updates.checkForUpdateAsync()` on the same foreground when
      not in development, `fetchUpdateAsync` then `reloadAsync` only while the app is on the sign-in screen or idle
      for a minute, never mid-page.
- [ ] **Step 4: Prove M4's constant.** On the iOS 26 simulator and an iOS 18 simulator, open Today and scroll to the
      last row: it clears the bar. If not, correct the constant in `Surface.tsx` and note the measured value in the PRD.
- [ ] **Step 5: Commit** `feat(mobile): sign-in through the web's doors, the offline screen, a reload when a deploy lands`.

---

### Task 6: The first cloud build, and the workflow

**Files:** `apps/mobile/.eas/workflows/build-preview.yml`, `apps/mobile/README.md`

- [ ] **Step 1:** `eas update:configure` (writes `runtimeVersion` fingerprint policy and `updates.url`); commit.
- [ ] **Step 2:** `build-preview.yml`: on `push` to `main` with `paths: ["apps/mobile/**", "packages/contracts/**"]`,
      job `build` for both platforms, profile `preview`. The tag-driven deploy workflow is PR 6's.
- [ ] **Step 3:** `eas build --profile preview --platform android` and `--profile development-simulator --platform ios`;
      both finish green; the Android APK installs on an emulator; write both build URLs in the PR.
- [ ] **Step 4:** `README.md`: how to run (dev client, the two build profiles), the bridge in one paragraph pointing at
      contracts, what needs a device (nothing in this PR), what needs enrollment (PRs 2 and 3).
- [ ] **Step 5: Commit** `chore(mobile): EAS configured, the preview build on push`.

---

### Task 7: The gates and the PR

- [ ] `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`;
      `git status` shows no dist drift; `corepack pnpm format:check`.
- [ ] The PR says: what changes for a customer (nothing on the web; in-app the Google door is hidden), what to set
      (`EXPO_PUBLIC_SITE_ORIGIN` in EAS environments; `EXPO_TOKEN` in CI), the deploy order (either), the two boot
      timings, the two build links, the screenshots, and the M4 measurement.
- [ ] Update the PRD's "What exists" section with PR 1's number once merged.
