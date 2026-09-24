# The phone app, PR 0: the ground

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web side ready to be wrapped by a native shell — the document knows when it is inside the app,
the domain publishes its app links, a native identity token has a door into the cookie session, and a phone can be
registered and told — with nothing new appearing on the web today.

**Architecture:** Five pieces in the layer that owns each: the in-app fact in `packages/contracts` (one regex, read by
TypeScript and by a boot script the document inlines), its three readers in the legacy shell, the billing page and
`mobile.css`; app links as one pure planner behind a public route and two rewrites; the native sign-in door as a pure
planner behind a thin public route on the cookie-backed client; devices as a migration with two definer doors and one
account route; push as a `push_send` job scheduled by `notify` and run over a push port the edge binds. The spec is
`docs/superpowers/specs/2026-09-24-mobile-groundwork-design.md`.

**Tech Stack:** TypeScript (contracts, jobs, edge, dashboard server), classic-script JSX for the legacy shell,
node:test (`corepack pnpm test`), committed `packages/*/dist`, Supabase migration 00162 (re-check the number at
merge), no new dependencies.

**Worktree and branch:** `Claude Video/cm-mobile-0`, branch `feat/mobile-groundwork`, off `origin/main` at
`4ff6f3bc`. One PR at the end. Baseline: 4693 tests, 4434 pass, 0 fail, 259 skipped (the database suites).

---

### Task 0: The worktree can run the gates

**Files:** none.

- [x] **Step 1:** `corepack pnpm install --frozen-lockfile --prefer-offline` — done.
- [x] **Step 2:** `corepack pnpm test` — 4434 pass, 0 fail, 259 skipped.

---

### Task 1: The in-app fact, in contracts

**Files:**
- Modify: `packages/contracts/src/chrome.ts` (after `themeBootScript`)
- Test: `tooling/scripts/tests/in-app.test.mjs`

- [ ] **Step 1: Write the failing test** `tooling/scripts/tests/in-app.test.mjs`:

```js
/**
 * The document knows when it is inside the native shell.
 *
 * The shell says who it is in its WebView's User-Agent, once: "ChanlyticsApp/<version> (ios|android)". One regex
 * reads it, in TypeScript and in the script the document inlines beside the theme's, so the class on <html> and the
 * global the legacy shell reads are stamped before first paint — a tab bar that appears for a frame under the native
 * one is the jolt this exists to prevent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inAppFrom, inAppBootScript, IN_APP_CLASS } from "../../../packages/contracts/src/chrome.ts";

test("the shell's User-Agent token names the app, its version and its platform; a browser has none", () => {
  assert.deepEqual(
    inAppFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 ChanlyticsApp/1.2.0 (ios)"),
    { version: "1.2.0", platform: "ios" },
  );
  assert.deepEqual(inAppFrom("Mozilla/5.0 (Linux; Android 16) ChanlyticsApp/1.2.0 (android)"), {
    version: "1.2.0",
    platform: "android",
  });
  assert.deepEqual(inAppFrom("ChanlyticsApp/0.1.0"), { version: "0.1.0", platform: "unknown" });
  assert.equal(inAppFrom("Mozilla/5.0 (iPhone) Safari/605.1.15"), null);
  assert.equal(inAppFrom(null), null);
});

function boot(userAgent) {
  const classes = new Set();
  const document = { documentElement: { classList: { add: (c) => classes.add(c) } } };
  const window = {};
  new Function("document", "navigator", "window", inAppBootScript())(document, { userAgent }, window);
  return { classes: [...classes], inApp: window.__IN_APP };
}

test("the boot script stamps the document before paint, from the same regex, and leaves a browser untouched", () => {
  assert.deepEqual(boot("Mozilla/5.0 ChanlyticsApp/1.2.0 (ios)"), {
    classes: [IN_APP_CLASS],
    inApp: { version: "1.2.0", platform: "ios" },
  });
  assert.deepEqual(boot("Mozilla/5.0 Safari/605.1.15"), { classes: [], inApp: undefined });
});
```

- [ ] **Step 2: Run it to see it fail.** `corepack pnpm test tooling/scripts/tests/in-app.test.mjs` — fails: `inAppFrom` is not exported.

- [ ] **Step 3: Add to `packages/contracts/src/chrome.ts`**, after `themeBootScript`:

```ts
/**
 * The native shell says who it is in its WebView's User-Agent, once: "ChanlyticsApp/1.2.0 (ios)". One regex reads
 * it, here and in the script the document inlines beside the theme's (inAppBootScript), so the two cannot disagree.
 */
export const IN_APP_UA_RE = /ChanlyticsApp\/(\S+)(?:\s*\((ios|android)\))?/i;
export type InAppPlatform = "ios" | "android" | "unknown";
export interface InApp {
  version: string;
  platform: InAppPlatform;
}
export function inAppFrom(userAgent: string | null | undefined): InApp | null {
  const m = IN_APP_UA_RE.exec(userAgent ?? "");
  if (!m) return null;
  const platform = (m[2] ?? "").toLowerCase();
  return { version: m[1], platform: platform === "ios" || platform === "android" ? platform : "unknown" };
}
/** The class on <html> that in-app rules hang from; the legacy shell reads window.__IN_APP for the same fact. */
export const IN_APP_CLASS = "in-app";
/** Inline in the document head, before anything paints: the tab bar must never appear for a frame under the native one. */
export function inAppBootScript(): string {
  return [
    "try{",
    `var m=new RegExp(${JSON.stringify(IN_APP_UA_RE.source)},"i").exec(navigator.userAgent||"");`,
    `if(m){document.documentElement.classList.add(${JSON.stringify(IN_APP_CLASS)});`,
    'window.__IN_APP={version:m[1],platform:(m[2]||"unknown").toLowerCase()}}',
    "}catch(e){}",
  ].join("");
}
```

- [ ] **Step 4: Run it to see it pass.** Same command — 2 pass.
- [ ] **Step 5: Rebuild the contracts dist** (the app imports the dist): `corepack pnpm --filter @chanlytics/contracts build`.
- [ ] **Step 6: Commit** `feat(contracts): the document can know it is inside the app`.

---

### Task 2: The document, the shell, the billing page and the inset read it

**Files:**
- Modify: `apps/dashboard/app/layout.tsx:63` (a second boot script)
- Modify: `apps/dashboard/src/legacy/pages/app-shell.jsx:816` (no phone tab bar in-app)
- Modify: `apps/dashboard/src/legacy/pages/billing-real.jsx:113-115` (one sentence in place of the Stripe doors)
- Modify: `apps/dashboard/src/legacy/styles/mobile.css` (end of file: the in-app inset)
- Test: `tooling/scripts/tests/settings-doors.test.mjs` (a new case), `tooling/scripts/tests/phone-shell.test.mjs` (a new case)

- [ ] **Step 1: Write the failing tests.** In `settings-doors.test.mjs`, after the S20 case:

```js
test("inside the app the billing page keeps its status and says where billing lives; the three Stripe doors are not drawn (App Store 3.1.3(f))", () => {
  asRole("owner");
  stripe();
  billing({ status: "none" });
  globalThis.window.__IN_APP = { version: "1.0.0", platform: "ios" };
  try {
    const tree = render(Billing, { flash() {} });
    assert.equal(byTestId(tree, "billing-checkout"), null, "no Start the trial");
    assert.equal(byTestId(tree, "billing-portal"), null, "no Manage billing");
    assert.equal(byTestId(tree, "billing-resume"), null);
    assert.equal(textOf(byTestId(tree, "billing-in-app")), "Billing is managed from Chanlytics on the web.");
    assert.ok(byTestId(tree, "billing-headline"), "the status stays");
    assert.ok(!textOf(tree).includes("Stripe"), "and no door names Stripe");
  } finally {
    delete globalThis.window.__IN_APP;
  }
  const tree = render(Billing, { flash() {} });
  assert.ok(byTestId(tree, "billing-checkout"), "on the web the door is back");
  assert.equal(byTestId(tree, "billing-in-app"), null);
});
```

In `phone-shell.test.mjs`, a new test at the end:

```js
test("inside the app the shell draws no phone tab bar (the native one stands there) and the page's bottom inset is the shell's", () => {
  const shell = readRaw("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(
    shell.includes("{!window.__IN_APP && (") && shell.includes("<PhoneTabs page={page}"),
    "the tab bar is drawn only outside the app",
  );
  const css = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(css.includes("html.in-app .phone-tabs { display: none; }"), "belt and braces for the frame before the shell reads the global");
  assert.ok(
    css.includes("html.in-app .main-scroll { padding-bottom: var(--app-inset-bottom, 0px); }"),
    "the room under every surface is the shell's tab bar, not the web's",
  );
  assert.ok(css.includes("html.in-app .phone-ask { bottom: calc(10px + var(--app-inset-bottom, 0px)); }"), "the ✦ sits above the native bar");
  assert.ok(css.includes("html.in-app .pp-toast-stack { bottom: calc(14px + var(--app-inset-bottom, 0px)); }"));
  const layout = readRaw("apps/dashboard/app/layout.tsx");
  assert.ok(layout.includes("__html: inAppBootScript()"), "stamped before first paint, beside the theme");
});
```

- [ ] **Step 2: Run them to see them fail.** `corepack pnpm test tooling/scripts/tests/settings-doors.test.mjs tooling/scripts/tests/phone-shell.test.mjs`.

- [ ] **Step 3: `layout.tsx`** — import `inAppBootScript` beside `themeBootScript`; after the theme script line add:

```tsx
        {/* Inside the native shell (a User-Agent token, contracts inAppBootScript): html.in-app and window.__IN_APP, before paint. */}
        <script dangerouslySetInnerHTML={{ __html: inAppBootScript() }} />
```

- [ ] **Step 4: `app-shell.jsx:816`** becomes:

```jsx
        {/* Inside the app the native tab bar stands here (window.__IN_APP, stamped before paint). */}
        {!window.__IN_APP && (
          <PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />
        )}
```

- [ ] **Step 5: `billing-real.jsx:113-115`** — the three buttons become:

```jsx
            {window.__IN_APP ? (
              /* A free companion to a paid web tool offers no purchase and no call to buy elsewhere (App Store 3.1.3(f)): the status stays, the doors do not. */
              <span className="set-row-hint" data-testid="billing-in-app">Billing is managed from Chanlytics on the web.</span>
            ) : (
              <>
                {vm.actions.checkout && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => leave("checkout")} data-testid="billing-checkout" {...window.gate("billing", "start the subscription")}>{busy === "checkout" ? "Opening Stripe…" : "Start the trial"}</button>}
                {vm.actions.resume && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={resume} data-testid="billing-resume" {...window.gate("billing", "resume the subscription")}>{busy === "resume" ? "Resuming…" : "Resume"}</button>}
                {vm.actions.portal && <button className="btn btn-sm" disabled={!!busy} onClick={() => leave("portal")} data-testid="billing-portal" {...window.gate("billing", "manage the subscription")}>{busy === "portal" ? "Opening Stripe…" : "Manage billing"}</button>}
              </>
            )}
```

- [ ] **Step 6: `mobile.css`**, at the end of the file:

```css
/* ====================================================================
   Inside the native shell (html.in-app, stamped before paint from the
   shell's User-Agent). The native tab bar stands where the web's did, and
   the shell tells the page how tall it is in --app-inset-bottom on <html>.
   Outside the app the variable is unset and every rule below is inert.
   ==================================================================== */
html.in-app .phone-tabs { display: none; }
html.in-app .main-scroll { padding-bottom: var(--app-inset-bottom, 0px); }
html.in-app .phone-ask { bottom: calc(10px + var(--app-inset-bottom, 0px)); }
html.in-app .pp-toast-stack { bottom: calc(14px + var(--app-inset-bottom, 0px)); }
```

- [ ] **Step 7: Run the two tests to see them pass.**
- [ ] **Step 8: Commit** `feat(shell): inside the app, no web tab bar, no Stripe doors, the shell's inset`.

---

### Task 3: App links

**Files:**
- Create: `apps/dashboard/src/server/app-links.ts`
- Create: `apps/dashboard/app/api/app-links/[store]/route.ts`
- Modify: `apps/dashboard/next.config.ts` (a `rewrites()` beside `headers()`)
- Modify: `apps/dashboard/proxy.ts:61` (`PUBLIC_PREFIXES` gains `/.well-known/`)
- Modify: `apps/dashboard/.env.example` (two variables)
- Modify: `tooling/scripts/tests/auth-gate.test.mjs:116` (the prefixes pin)
- Test: `tooling/scripts/tests/app-links.test.mjs`

- [ ] **Step 1: Write the failing test** `tooling/scripts/tests/app-links.test.mjs`:

```js
/**
 * The domain says which apps may open its links: Apple's apple-app-site-association and Android's assetlinks.json,
 * each rendered from one variable and absent (404) until it is set — a file with a placeholder team id is a lie the
 * stores cache for a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { appLinksFor, BROWSER_ONLY } = await import(at("apps/dashboard/src/server/app-links.ts"));
const { GET } = await import(at("apps/dashboard/app/api/app-links/[store]/route.ts"));

test("Apple: every app id opens every path but the ones meant for a browser", () => {
  const file = appLinksFor("apple", { apple: "ABCDE12345.com.chanlytics.app, ABCDE12345.com.chanlytics.app.dev", android: "" });
  assert.deepEqual(file.applinks.details[0].appIDs, ["ABCDE12345.com.chanlytics.app", "ABCDE12345.com.chanlytics.app.dev"]);
  const components = file.applinks.details[0].components;
  assert.deepEqual(components.at(-1), { "/": "/*" }, "everything else opens the app");
  for (const p of BROWSER_ONLY) assert.ok(components.some((c) => c["/"] === p && c.exclude === true), `${p} stays in the browser`);
  assert.deepEqual(file.webcredentials.apps, file.applinks.details[0].appIDs, "and passwords may be shared with the same apps");
});

test("Android: one statement per package, its fingerprints upper-cased", () => {
  const file = appLinksFor("android", { apple: "", android: "com.chanlytics.app=aa:bb|cc:dd; com.chanlytics.app.dev=ee:ff" });
  assert.deepEqual(file, [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.chanlytics.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] },
    },
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: "com.chanlytics.app.dev", sha256_cert_fingerprints: ["EE:FF"] },
    },
  ]);
});

test("unset, or a store nobody has, is nothing", () => {
  assert.equal(appLinksFor("apple", { apple: "", android: "" }), null);
  assert.equal(appLinksFor("android", { apple: "x", android: "  " }), null);
  assert.equal(appLinksFor("windows", { apple: "x", android: "y" }), null);
});

test("the route answers the file as JSON, cacheable for an hour, and 404 until configured", async () => {
  const req = new Request("http://localhost/.well-known/apple-app-site-association");
  process.env.APP_LINKS_APPLE = "ABCDE12345.com.chanlytics.app";
  try {
    const r = await GET(req, { params: Promise.resolve({ store: "apple" }) });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/json");
    assert.equal(r.headers.get("cache-control"), "public, max-age=3600");
    assert.equal((await r.json()).applinks.details[0].appIDs[0], "ABCDE12345.com.chanlytics.app");
  } finally {
    delete process.env.APP_LINKS_APPLE;
  }
  const none = await GET(req, { params: Promise.resolve({ store: "apple" }) });
  assert.equal(none.status, 404);
  assert.equal((await GET(req, { params: Promise.resolve({ store: "windows" }) })).status, 404);
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Create `apps/dashboard/src/server/app-links.ts`:**

```ts
/**
 * The domain's app links, decided without a request: which native apps may open its links, from one variable per
 * store. Pure, so the route stays a thin door and the files are run in a test.
 *
 *   APP_LINKS_APPLE    TEAMID.bundle.id, several separated by commas
 *   APP_LINKS_ANDROID  package=FINGERPRINT|FINGERPRINT;package2=FINGERPRINT (SHA-256 certificate fingerprints)
 *
 * Unset is nothing: the route answers 404, and the stores learn of the app the day the accounts exist, never of a
 * placeholder they would cache for a day.
 */
export type Store = "apple" | "android";

/** Paths that stay in a browser: the sign-in return, a workspace's public pages, and the policies every review links to. */
export const BROWSER_ONLY = ["/auth/*", "/yes/*", "/b/*", "/privacy", "/terms", "/data-deletion"] as const;

const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function appLinksFor(store: string, env: { apple?: string; android?: string }): unknown | null {
  if (store === "apple") {
    const ids = list(env.apple);
    if (!ids.length) return null;
    return {
      applinks: {
        details: [{ appIDs: ids, components: [...BROWSER_ONLY.map((p) => ({ "/": p, exclude: true })), { "/": "/*" }] }],
      },
      webcredentials: { apps: ids },
    };
  }
  if (store === "android") {
    const statements = list(env.android)
      .map((entry) => {
        const [pkg, prints] = entry.split("=");
        const fingerprints = (prints ?? "")
          .split("|")
          .map((f) => f.trim().toUpperCase())
          .filter(Boolean);
        return pkg?.trim() && fingerprints.length
          ? {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: { namespace: "android_app", package_name: pkg.trim(), sha256_cert_fingerprints: fingerprints },
            }
          : null;
      })
      .filter((s) => s !== null);
    return statements.length ? statements : null;
  }
  return null;
}
```

- [ ] **Step 4: Create `apps/dashboard/app/api/app-links/[store]/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { appLinksFor } from "@/server/app-links";

/**
 * GET /.well-known/apple-app-site-association and /.well-known/assetlinks.json (next.config rewrites both here;
 * the proxy leaves /.well-known/ public). The file for one store, from its variable, or 404 while it is unset.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ store: string }> }): Promise<Response> {
  const { store } = await ctx.params;
  const file = appLinksFor(store, { apple: process.env.APP_LINKS_APPLE, android: process.env.APP_LINKS_ANDROID });
  if (!file) return new NextResponse(null, { status: 404 });
  return NextResponse.json(file, {
    headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  });
}
```

- [ ] **Step 5: `next.config.ts`** — after `headers()`:

```ts
  async rewrites() {
    return {
      // The two files a phone's OS reads before it lets a link open the app. One route renders both
      // (app/api/app-links/[store]); the proxy leaves /.well-known/ public.
      beforeFiles: [
        { source: "/.well-known/apple-app-site-association", destination: "/api/app-links/apple" },
        { source: "/.well-known/assetlinks.json", destination: "/api/app-links/android" },
      ],
    };
  },
```

- [ ] **Step 6: `proxy.ts:61`** → `const PUBLIC_PREFIXES = ["/yes/", "/b/", "/.well-known/"];` and, in `auth-gate.test.mjs`, the pin `assert.deepEqual(prefixes, ["/yes/", "/b/", "/.well-known/"]);` with a comment: `/.well-known/` joined with the phone app: the OS fetches the app-links files with no session, and the route under it answers a store's file or 404, nothing else.

- [ ] **Step 7: `apps/dashboard/.env.example`**, a new group at the end:

```
# The phone app's links (app/api/app-links): which apps may open this domain's
# links, one variable per store; unset, each file is a 404. Apple takes
# TEAMID.bundle.id, several separated by commas. Android takes
# package=FINGERPRINT|FINGERPRINT;package2=FINGERPRINT (SHA-256 certificate).
APP_LINKS_APPLE=
APP_LINKS_ANDROID=
```

- [ ] **Step 8: Run** `corepack pnpm test tooling/scripts/tests/app-links.test.mjs tooling/scripts/tests/auth-gate.test.mjs tooling/scripts/tests/env-manifest.test.mjs` — pass.
- [ ] **Step 9: Commit** `feat(dashboard): the domain publishes its app links`.

---

### Task 4: The native sign-in door

**Files:**
- Create: `apps/dashboard/src/server/request-ip.ts` (moved out of the signup route)
- Create: `apps/dashboard/src/server/native-sign-in.ts`
- Create: `apps/dashboard/app/auth/native/route.ts`
- Modify: `apps/dashboard/app/api/v1/signup/route.ts:36-42` (imports `ipOf`, `hashKey`)
- Modify: `apps/dashboard/src/server/rate-limit.ts:125` (`native_sign_in`)
- Modify: `apps/dashboard/proxy.ts:31` (`/auth/native`), `tooling/scripts/tests/auth-gate.test.mjs:190` (the paths pin, "thirteen")
- Test: `tooling/scripts/tests/native-sign-in.test.mjs`

- [ ] **Step 1: Write the failing test** `tooling/scripts/tests/native-sign-in.test.mjs`:

```js
/**
 * The native app's sign-in door, the pure part: what the door signs in and where it lands. The app signs in with
 * Apple or Google natively (Google refuses OAuth inside a WebView), and hands the identity token here; the route
 * signs it in through the cookie-backed client so the WebView is signed in the way /auth/callback signs a browser in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { nativeSignInPlan, NATIVE_FAILED, NATIVE_PROVIDERS } = await import(at("apps/dashboard/src/server/native-sign-in.ts"));
const { ipOf, hashKey } = await import(at("apps/dashboard/src/server/request-ip.ts"));

test("a provider's identity token is signed in and the browser lands on this site only", () => {
  assert.deepEqual(nativeSignInPlan({ provider: "apple", token: "eyJ.a.b", nonce: "n1", next: "/#/inbox" }), {
    signIn: { provider: "apple", token: "eyJ.a.b", nonce: "n1" },
    to: "/#/inbox",
    refused: null,
  });
  assert.deepEqual(nativeSignInPlan({ provider: "google", token: "eyJ.a.b" }), {
    signIn: { provider: "google", token: "eyJ.a.b", nonce: undefined },
    to: "/",
    refused: null,
  });
  assert.equal(nativeSignInPlan({ provider: "apple", token: "t", next: "https://elsewhere.example/" }).to, "/");
  assert.deepEqual(NATIVE_PROVIDERS, ["apple", "google"]);
});

test("anything else is refused by name, to the sign-in page", () => {
  for (const body of [null, {}, { provider: "facebook", token: "t" }, { provider: "apple" }, { provider: "apple", token: "" }, { provider: "apple", token: "x".repeat(8193) }]) {
    const plan = nativeSignInPlan(body);
    assert.equal(plan.signIn, null, JSON.stringify(body));
    assert.equal(plan.to, NATIVE_FAILED);
    assert.equal(typeof plan.refused, "string");
  }
});

test("the network a request came from, and its hashed key, the way sign-up reads them", () => {
  assert.equal(ipOf(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })), "203.0.113.9");
  assert.equal(ipOf(new Request("http://x", { headers: { "x-real-ip": "203.0.113.7" } })), "203.0.113.7");
  assert.equal(ipOf(new Request("http://x")), "unknown");
  assert.match(hashKey("203.0.113.9"), /^[0-9a-f]{32}$/);
});
```

- [ ] **Step 2: Run it to see it fail.**

- [ ] **Step 3: Create `apps/dashboard/src/server/request-ip.ts`** (the signup route's two helpers, moved, one derivation):

```ts
import { createHash } from "node:crypto";

/** A rate key from a value nobody should read back out of the store. */
export const hashKey = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** The network a request came from: the first forwarded address, else the proxy's, else "unknown". */
export function ipOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd ? fwd.split(",")[0].trim() : "";
  return first || req.headers.get("x-real-ip") || "unknown";
}
```

In `signup/route.ts` delete the local `hash` and `ipOf`, import `{ ipOf, hashKey as hash }` from `@/server/request-ip`.

- [ ] **Step 4: Create `apps/dashboard/src/server/native-sign-in.ts`:**

```ts
import { safeNext } from "./oauth-callback";

/**
 * The native app's sign-in, decided without a network: what to sign in and where to land. Pure, so the route stays
 * a thin door (app/auth/native) and the decisions run in a test.
 *
 * The app signs in natively — Google refuses OAuth inside an embedded WebView, and Apple's button is the system's —
 * and receives an identity token. The token comes here, never a refresh token: handing the native session's refresh
 * token to the WebView would rotate it out from under the native client. The server signs the token in on its own
 * cookie-backed client, so the WebView's session and the app's are independent.
 */
export const NATIVE_FAILED = "/login?error=native";
export const NATIVE_PROVIDERS = ["apple", "google"] as const;
export type NativeProvider = (typeof NATIVE_PROVIDERS)[number];
const TOKEN_MAX = 8192;

export interface NativeSignIn {
  provider: NativeProvider;
  token: string;
  nonce: string | undefined;
}
export interface NativePlan {
  signIn: NativeSignIn | null;
  to: string;
  refused: string | null;
}

const refuse = (why: string): NativePlan => ({ signIn: null, to: NATIVE_FAILED, refused: why });

export function nativeSignInPlan(body: unknown): NativePlan {
  if (!body || typeof body !== "object") return refuse("no body");
  const b = body as Record<string, unknown>;
  const provider = (NATIVE_PROVIDERS as readonly string[]).includes(String(b.provider)) ? (b.provider as NativeProvider) : null;
  if (!provider) return refuse("unknown provider");
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return refuse("no token");
  if (token.length > TOKEN_MAX) return refuse("token too long");
  const nonce = typeof b.nonce === "string" && b.nonce.trim() ? b.nonce.trim() : undefined;
  return { signIn: { provider, token, nonce }, to: safeNext(typeof b.next === "string" ? b.next : null), refused: null };
}
```

- [ ] **Step 5: Create `apps/dashboard/app/auth/native/route.ts`:**

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nativeSignInPlan, NATIVE_FAILED } from "@/server/native-sign-in";
import { takeRate } from "@/server/rate-limit";
import { ipOf, hashKey } from "@/server/request-ip";

/**
 * POST /auth/native -- where the native app hands in the identity token it got from Apple or Google.
 *
 * Signs it in through the same cookie-backed server client every route uses, so the cookie it writes is the one the
 * proxy reads, and lands the WebView where the app asked, on this site only (native-sign-in.ts). Public by an exact
 * entry in the proxy's PUBLIC_PATHS: nobody has a session yet, that is the point. Rate-limited per network like
 * sign-up: a token that does not verify costs a Supabase call each time.
 *
 * The body is JSON or a form: the app posts either. A refusal is the sign-in page saying so once, never a JSON error
 * the WebView would render as text.
 */
export async function POST(request: Request): Promise<Response> {
  await takeRate(`ip:${hashKey(ipOf(request))}`, "native_sign_in");
  const body = await readBody(request);
  const plan = nativeSignInPlan(body);
  let to = plan.to;
  if (plan.signIn) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: plan.signIn.provider,
      token: plan.signIn.token,
      ...(plan.signIn.nonce ? { nonce: plan.signIn.nonce } : {}),
    });
    if (error) {
      console.warn("native_sign_in_failed", JSON.stringify({ provider: plan.signIn.provider, message: error.message.slice(0, 120) }));
      to = NATIVE_FAILED;
    }
  } else {
    console.warn("native_sign_in_refused", JSON.stringify({ why: plan.refused }));
  }
  // Relative, like the callback's: safeNext() guarantees a path on this site. 303 so the WebView's POST becomes a GET.
  return new NextResponse(null, { status: 303, headers: { location: to, "cache-control": "private, no-store" } });
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return await request.json();
    if (type.includes("form")) return Object.fromEntries((await request.formData()).entries());
  } catch {
    /* an unreadable body is a refusal below */
  }
  return null;
}
```

- [ ] **Step 6: `rate-limit.ts`** — beside `profile_set`: `native_sign_in: { limit: 20, windowMs: 3_600_000, noun: "sign-ins" },` with the comment: The native app's sign-in door: per network, a token that does not verify costs a call each time.
- [ ] **Step 7: `proxy.ts`** — add `"/auth/native",` after `"/auth/callback",`. In `auth-gate.test.mjs` the pinned list gains `"/auth/native"` (sorted after `/auth/callback`), the test's title says thirteen, and a comment: The native app's door joined with the phone app: the app posts an identity token and has no session yet, exactly as the callback has none. Exact path.
- [ ] **Step 8: Run** `corepack pnpm test tooling/scripts/tests/native-sign-in.test.mjs tooling/scripts/tests/auth-gate.test.mjs tooling/scripts/tests/signup.test.mjs tooling/scripts/tests/rate-limit.test.mjs` — pass (rate-limit's test may enumerate buckets; follow its message if it pins the list).
- [ ] **Step 9: Commit** `feat(auth): a native identity token has a door into the cookie session`.

---

### Task 5: A phone can be registered (migration, contracts, types, the routes)

**Files:**
- Create: `supabase/migrations/00162_a_phone_can_be_told.sql`
- Create: `packages/contracts/src/push.ts`; Modify: `packages/contracts/src/index.ts` (export it)
- Modify: `packages/contracts/src/enums.ts:48-83` (`push_send`), `packages/contracts/src/schema-sets.generated.ts` (two entries), `packages/contracts/src/schema-sets.ts` (one Holds line)
- Modify: `packages/db/src/database.types.ts` (the `push_devices` table, two functions)
- Create: `apps/dashboard/app/api/v1/me/devices/route.ts`
- Modify: `apps/dashboard/src/server/rate-limit.ts` (`device_register`), `tooling/scripts/tests/route-policy.json` (regenerated), `apps/dashboard/src/client/routes.generated.ts` (regenerated)
- Test: `tooling/scripts/tests/push.test.mjs` (contracts), `tooling/scripts/tests/account-routes.test.mjs` (two cases)

- [ ] **Step 1: The migration** `supabase/migrations/00162_a_phone_can_be_told.sql`:

```sql
-- 00162 · A phone can be told.
--
-- The bell keeps every alert the edge raises as a row (00057) and the service
-- worker says push arrives "when the keys for it exist"; none did. A native
-- app registers the phone it runs on here, and a push_send job (the ledger,
-- 00098) carries a kept row to every phone of the people it is for.
--
-- A device is a PERSON's, not a workspace's: one phone, one account, however
-- many workspaces. A token that turns up under another account (the same
-- phone, signed in as someone else) is re-owned in one statement by the
-- definer door, which RLS alone could not do: a person may not delete a row
-- that is not theirs. Members read and forget their own; the edge reads all.

/* ------------------------------------------------------- the table --- */
create table if not exists public.push_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Expo's push token for the device ("ExponentPushToken[...]"), one row each.
  token        text not null unique check (char_length(token) between 1 and 200),
  platform     text not null check (platform in ('ios','android')),
  app_version  text check (char_length(app_version) <= 40),
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists push_devices_user on public.push_devices (user_id);
alter table public.push_devices enable row level security;
drop policy if exists push_devices_own_select on public.push_devices;
create policy push_devices_own_select on public.push_devices
  for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_devices from anon;
revoke insert, update, delete on public.push_devices from authenticated;
comment on table public.push_devices is
  'The phones people can be told on: one row per push token, owned by the person, registered and forgotten through two definer doors. The edge reads.';

/* ---------------------------------------------------- the two doors --- */
-- Register this person's phone. A token already held, by anyone, moves here.
create or replace function public.push_device_register(p_token text, p_platform text, p_app_version text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  delete from push_devices where token = p_token and user_id <> v_user;
  insert into push_devices (user_id, token, platform, app_version, last_seen_at)
  values (v_user, p_token, p_platform, p_app_version, now())
  on conflict (token) do update set platform = excluded.platform, app_version = excluded.app_version, last_seen_at = now()
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.push_device_register(text, text, text) from public, anon;
grant execute on function public.push_device_register(text, text, text) to authenticated;

-- Forget this person's phone (sign-out). Someone else's row with that token is not theirs to forget.
create or replace function public.push_device_forget(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_gone integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '28000';
  end if;
  delete from push_devices where token = p_token and user_id = v_user;
  get diagnostics v_gone = row_count;
  return jsonb_build_object('forgotten', v_gone);
end $$;
revoke execute on function public.push_device_forget(text) from public, anon;
grant execute on function public.push_device_forget(text) to authenticated;

/* ----------------------------------------- the ledger learns push_send --- */
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('outbound_send', 'broadcast_send', 'line_provision', 'email_ingest', 'lead_round_start', 'lead_collect', 'lead_check', 'push_send'));
```

- [ ] **Step 2: Contracts.** In `enums.ts` `JOB_KINDS`, after `"lead_check"`:

```ts
  /**
   * One kept notification (00057) to every phone of the people it is for
   * (00162). Scheduled by the edge's notify when the row's kind is one of
   * contracts PUSH_KINDS; a transport failure throws and is tried again by
   * RETRY_WAITS_MS. Internal work: a second claim runs it again.
   */
  "push_send",
```

Create `packages/contracts/src/push.ts`:

```ts
import type { ServerNotificationKind } from "./notifications";

/** Where a phone can be one of ours. Held to push_devices.platform (schema-sets.ts). */
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export interface PushDevice {
  token: string;
  platform: PushPlatform;
  app_version: string | null;
}

const TOKEN_MAX = 200;
const VERSION_MAX = 40;

/** What PUT /api/v1/me/devices accepts, or why not, in one sentence. */
export function parseDevice(body: unknown): { ok: true; device: PushDevice } | { ok: false; reason: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return { ok: false, reason: "A device needs its push token." };
  if (token.length > TOKEN_MAX) return { ok: false, reason: "That push token is longer than any we know." };
  const platform = (PUSH_PLATFORMS as readonly string[]).includes(String(b.platform)) ? (b.platform as PushPlatform) : null;
  if (!platform) return { ok: false, reason: "A device is an iPhone or an Android phone." };
  const version = typeof b.app_version === "string" && b.app_version.trim() ? b.app_version.trim().slice(0, VERSION_MAX) : null;
  return { ok: true, device: { token, platform, app_version: version } };
}

/**
 * The kept kinds a phone is told about. A list, not everything: a sweep's
 * health, the deadman and a plain alert are the platform's news or the
 * bell's, and a phone that buzzes for them is a phone put on silent.
 */
export const PUSH_KINDS = [
  "handoff",
  "call",
  "note_for_you",
  "leads_ready",
  "leads_question",
  "broadcast_sent",
  "broadcast_stopped",
  "job_failed",
  "billing",
  "number",
  "review",
] as const satisfies readonly ServerNotificationKind[];
export type PushKind = (typeof PUSH_KINDS)[number];
export const isPushKind = (kind: string): kind is PushKind => (PUSH_KINDS as readonly string[]).includes(kind);

/** One message to one device, in the shape Expo's push service takes. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: { route: string | null; notification_id: string; tenant_id: string };
}

/** The first line of a kept row's body: what the bell shows under the title, and what a phone shows. */
export function firstLine(body: string, max = 160): string {
  return (
    body
      .split("\n")
      .find((l) => l.trim())
      ?.trim()
      .slice(0, max) ?? ""
  );
}

/** The bell's own words, once per device. */
export function pushFor(
  n: { id: string; tenant_id: string; title: string; body: string; route: string | null },
  tokens: readonly string[],
): PushMessage[] {
  const body = firstLine(n.body);
  return tokens.map((to) => ({
    to,
    title: n.title,
    body,
    sound: "default",
    data: { route: n.route, notification_id: n.id, tenant_id: n.tenant_id },
  }));
}
```

In `notifications.ts`, the bell's `message:` derivation (the `.split("\n").find((l) => l.trim())` chain inside `serverNotificationRows`) becomes `message: firstLine(n.body),` with `import { firstLine } from "./push";` (push.ts imports only a type from notifications, so there is no cycle at runtime). In `index.ts`: `export * from "./push";`.

`schema-sets.generated.ts`: `"jobs.kind"` gains `"push_send"` at the end of its list (the constraint's order); a new entry, in key order among the `p` keys:

```ts
  "push_devices.platform": ["ios", "android"],
```

`schema-sets.ts`: import `PUSH_PLATFORMS` from `./push` and, in the jobs group, `Holds<Exactly<Of<typeof PUSH_PLATFORMS>, SchemaSet<"push_devices.platform">>>,`.

- [ ] **Step 3: The database types.** In `packages/db/src/database.types.ts`, a `push_devices` block in table order (after `policies`, before the next table), and the two functions in `Functions` in name order:

```ts
      push_devices: {
        Row: {
          app_version: string | null
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
```

```ts
      push_device_forget: {
        Args: { p_token: string }
        Returns: Json
      }
      push_device_register: {
        Args: { p_app_version?: string; p_platform: string; p_token: string }
        Returns: Json
      }
```

CI's `database.yml` regenerates from a replay and diffs; a hand edit that drifts fails there, which is the check.

- [ ] **Step 4: Write the failing tests.** `tooling/scripts/tests/push.test.mjs`:

```js
/**
 * A phone can be told: what a device registration accepts, which kept kinds reach a phone, and the words a phone
 * shows -- the bell's own, once per device.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDevice, PUSH_KINDS, PUSH_PLATFORMS, isPushKind, pushFor, firstLine, SERVER_NOTIFICATION_KINDS, JOB_KINDS } from "../../../packages/contracts/src/index.ts";

test("a device is a token and a platform; the version is kept short; anything else is refused in a sentence", () => {
  assert.deepEqual(parseDevice({ token: " ExponentPushToken[abc] ", platform: "ios", app_version: "1.2.0" }), {
    ok: true,
    device: { token: "ExponentPushToken[abc]", platform: "ios", app_version: "1.2.0" },
  });
  assert.deepEqual(parseDevice({ token: "t", platform: "android" }), { ok: true, device: { token: "t", platform: "android", app_version: null } });
  assert.equal(parseDevice({ platform: "ios" }).reason, "A device needs its push token.");
  assert.equal(parseDevice({ token: "t", platform: "windows" }).reason, "A device is an iPhone or an Android phone.");
  assert.equal(parseDevice({ token: "x".repeat(201), platform: "ios" }).ok, false);
  assert.equal(parseDevice(null).ok, false);
  assert.deepEqual(PUSH_PLATFORMS, ["ios", "android"]);
});

test("the kinds a phone hears about are kept kinds, and not all of them; the ledger knows push_send", () => {
  for (const k of PUSH_KINDS) assert.ok(SERVER_NOTIFICATION_KINDS.includes(k), k);
  for (const k of ["sweep", "deadman", "alert"]) assert.ok(!isPushKind(k), `${k} stays off the phone`);
  assert.ok(isPushKind("handoff") && isPushKind("call") && isPushKind("note_for_you"));
  assert.ok(JOB_KINDS.includes("push_send"));
});

test("a phone shows the bell's words: the title, the first line of the body, and where to go", () => {
  const n = {
    id: "n1",
    tenant_id: "t1",
    kind: "handoff",
    title: "WhatsApp handoff needed: +13055550134",
    body: "\n  The assistant flagged a conversation for a human.  \n\nCustomer: +13055550134",
    route: "inbox/th-abc",
  };
  assert.deepEqual(pushFor(n, ["tok-a", "tok-b"]), [
    { to: "tok-a", title: n.title, body: "The assistant flagged a conversation for a human.", sound: "default", data: { route: "inbox/th-abc", notification_id: "n1", tenant_id: "t1" } },
    { to: "tok-b", title: n.title, body: "The assistant flagged a conversation for a human.", sound: "default", data: { route: "inbox/th-abc", notification_id: "n1", tenant_id: "t1" } },
  ]);
  assert.equal(firstLine("x".repeat(200)).length, 160);
  assert.equal(firstLine("\n\n"), "");
  assert.deepEqual(pushFor({ ...n, route: null }, []), []);
});
```

In `account-routes.test.mjs`, import the route beside `me`: `const devices = await import(at("apps/dashboard/app/api/v1/me/devices/route.ts"));`, extend the policy test, and add:

```js
test("a phone is registered on the account through the definer door, and forgotten the same way", async () => {
  assert.deepEqual(devices.PUT.policy, { kind: "write", scope: "account", role: null, rate: "device_register", spend: false });
  assert.deepEqual(devices.DELETE.policy, { kind: "write", scope: "account", role: null, rate: "device_register", spend: false });
  const calls = [];
  const rpcs = {
    push_device_register: (args) => {
      calls.push(["register", args]);
      return { data: { id: "d1" }, error: null };
    },
    push_device_forget: (args) => {
      calls.push(["forget", args]);
      return { data: { forgotten: 1 }, error: null };
    },
  };
  const ctx = ctxFor({ memberships: both("owner", "owner"), tenants: tenants() }, {}, rpcs);
  assert.deepEqual(await devices.PUT.run(ctx, send("PUT", { token: "ExponentPushToken[abc]", platform: "ios", app_version: "1.2.0" })), { id: "d1" });
  assert.deepEqual(await devices.DELETE.run(ctx, send("DELETE", { token: "ExponentPushToken[abc]" })), { forgotten: 1 });
  assert.deepEqual(calls, [
    ["register", { p_token: "ExponentPushToken[abc]", p_platform: "ios", p_app_version: "1.2.0" }],
    ["forget", { p_token: "ExponentPushToken[abc]" }],
  ]);
  await refused(devices.PUT.run(ctx, send("PUT", { token: "t", platform: "windows" })), "validation", 400, "iPhone or an Android");
  await refused(devices.DELETE.run(ctx, send("DELETE", {})), "validation", 400, "push token");
});
```

(`run` is how the file calls every route; read its other cases for the exact helper name before writing this one.)

- [ ] **Step 5: Run them to see them fail.**

- [ ] **Step 6: The route** `apps/dashboard/app/api/v1/me/devices/route.ts`:

```ts
import { write, account } from "@/server/route";
import { AppError, parseDevice } from "@chanlytics/contracts";

/**
 * PUT /api/v1/me/devices — {token, platform, app_version?}: the phone the native app runs on, registered to be
 * told. Yours alone, no workspace involved, so it is declared on the account; the definer door re-owns a token
 * another account held (the same phone, signed in as someone else). Counted, because a loop in the app would
 * otherwise write on every launch.
 */
export const PUT = write({
  scope: account,
  role: null,
  rate: "device_register",
  handle: async ({ ctx, req }) => {
    const parsed = parseDevice(await req.json().catch(() => ({})));
    if (!parsed.ok) throw new AppError("validation", parsed.reason, 400);
    const { device } = parsed;
    const { data, error } = await ctx.supabase.rpc("push_device_register", {
      p_token: device.token,
      p_platform: device.platform,
      ...(device.app_version ? { p_app_version: device.app_version } : {}),
    });
    if (error) throw new AppError("validation", error.message, 400);
    return data as { id: string };
  },
});

/** DELETE /api/v1/me/devices — {token}: sign-out on the phone. Someone else's row with that token is not yours to forget. */
export const DELETE = write({
  scope: account,
  role: null,
  rate: "device_register",
  handle: async ({ ctx, req }) => {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) throw new AppError("validation", "A device needs its push token.", 400);
    const { data, error } = await ctx.supabase.rpc("push_device_forget", { p_token: token });
    if (error) throw new AppError("validation", error.message, 400);
    return data as { forgotten: number };
  },
});
```

(If the test's register call passes `p_app_version` only when present, the fake's recorded args match the code above: the case sends a version.)

`rate-limit.ts`: `device_register: { limit: 60, windowMs: 3_600_000, noun: "device registrations" },` with the comment: The phone app registers its push token on launch; sixty an hour is a loop, not a person.

- [ ] **Step 7: Regenerate** `UPDATE_ROUTE_POLICY=1 corepack pnpm test tooling/scripts/tests/route-policy.test.mjs` then `node tooling/scripts/gen-route-types.mjs`; rebuild the contracts dist (`corepack pnpm --filter @chanlytics/contracts build`) and db (`corepack pnpm --filter @chanlytics/db build`).
- [ ] **Step 8: Run** `corepack pnpm test tooling/scripts/tests/push.test.mjs tooling/scripts/tests/account-routes.test.mjs tooling/scripts/tests/route-policy.test.mjs tooling/scripts/tests/route-types.test.mjs tooling/scripts/tests/migrations.test.mjs tooling/scripts/tests/notifications-durable.test.mjs` and `corepack pnpm typecheck` — pass.
- [ ] **Step 9: Commit** `feat(push): a phone can be registered (00162, push_devices, me/devices)`.

---

### Task 6: A phone is told (the job, the port, the transport, and notify)

**Files:**
- Modify: `packages/jobs/src/handlers.ts` (`PushPort` on `JobContext`, `pushSend`, `HANDLERS`), `packages/jobs/src/ledger.ts:113` (`RETRY_WAITS_MS`)
- Create: `apps/edge/lib/ops/push.ts`
- Modify: `apps/edge/lib/env.ts` (`EXPO_ACCESS_TOKEN`), `apps/edge/.env.example` (a group), `apps/edge/api/jobs/tick.ts` (`push: expoPush()`)
- Modify: `apps/edge/lib/ops/notify.ts` (`recordNotification` returns the id; `notify` schedules `push_send`)
- Test: `tooling/scripts/tests/push-send.test.mjs`, `tooling/scripts/tests/notify-transport.test.mjs` (a case), `tooling/scripts/tests/expo-push.test.mjs`

- [ ] **Step 1: Write the failing tests.** `tooling/scripts/tests/push-send.test.mjs`:

```js
/**
 * push_send, run over the fake database and a recording push port: the readers of a kept row (the one it is
 * addressed to, else every member), their phones, one message each, a phone the service says is gone forgotten, and
 * a transport that fails thrown so the ledger tries again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./_fake-db.mjs";
import { dispatchJob } from "../../../packages/jobs/src/handlers.ts";

const T = "11111111-1111-4111-8111-111111111111";
const row = (over = {}) => ({ id: "n1", tenant_id: T, kind: "handoff", title: "Handoff needed", body: "Maria asked for a person.\nMore", route: "inbox/th-1", recipient_user_id: null, ...over });
const world = (over = {}) =>
  fakeDb({
    notifications: [row(over.notification)],
    memberships: [
      { user_id: "u1", tenant_id: T, role: "owner" },
      { user_id: "u2", tenant_id: T, role: "staff" },
      { user_id: "u9", tenant_id: "22222222-2222-4222-8222-222222222222", role: "owner" },
    ],
    push_devices: [
      { id: "d1", user_id: "u1", token: "tok-u1-a" },
      { id: "d2", user_id: "u1", token: "tok-u1-b" },
      { id: "d3", user_id: "u2", token: "tok-u2" },
      { id: "d9", user_id: "u9", token: "tok-u9" },
    ],
  });
const port = (answer) => {
  const sent = [];
  return {
    sent,
    push: {
      send: async (messages) => {
        sent.push(...messages);
        if (answer instanceof Error) throw answer;
        return messages.map((m) => answer?.[m.to] ?? { to: m.to, status: "ok" });
      },
    },
  };
};
const job = { id: "j1", tenant_id: T, kind: "push_send", payload: { notification_id: "n1" } };
const ctx = (db, p) => ({ db, wire: { whatsapp: null, sms: null }, alert: async () => {}, schedule: async () => {}, deadline: Date.now() + 45_000, ...p });

test("every member's every phone hears a workspace row, in the bell's words; another workspace's phone does not", async () => {
  const db = world();
  const p = port();
  assert.equal(await dispatchJob(ctx(db, { push: p.push }), job), "done");
  assert.deepEqual(p.sent.map((m) => m.to).sort(), ["tok-u1-a", "tok-u1-b", "tok-u2"]);
  assert.deepEqual(p.sent[0], { to: "tok-u1-a", title: "Handoff needed", body: "Maria asked for a person.", sound: "default", data: { route: "inbox/th-1", notification_id: "n1", tenant_id: T } });
});

test("a row addressed to one member reaches that member's phones only", async () => {
  const db = world({ notification: { kind: "note_for_you", recipient_user_id: "u2" } });
  const p = port();
  await dispatchJob(ctx(db, { push: p.push }), job);
  assert.deepEqual(p.sent.map((m) => m.to), ["tok-u2"]);
});

test("a phone the service reports gone is forgotten; a row nobody can hear, or that was purged, is done quietly", async () => {
  const db = world();
  const p = port({ "tok-u1-b": { to: "tok-u1-b", status: "error", error: "DeviceNotRegistered" } });
  await dispatchJob(ctx(db, { push: p.push }), job);
  assert.deepEqual(db.tables.push_devices.map((d) => d.token).sort(), ["tok-u1-a", "tok-u2", "tok-u9"]);
  const empty = fakeDb({ notifications: [row()], memberships: [{ user_id: "u1", tenant_id: T, role: "owner" }], push_devices: [] });
  const q = port();
  assert.equal(await dispatchJob(ctx(empty, { push: q.push }), job), "done");
  assert.deepEqual(q.sent, []);
  const purged = fakeDb({ notifications: [], memberships: [], push_devices: [] });
  assert.equal(await dispatchJob(ctx(purged, { push: q.push }), job), "done");
});

test("a transport that fails throws, so the ledger tries again; a runtime without a port fails by name", async () => {
  const p = port(new Error("push_rejected 503"));
  await assert.rejects(dispatchJob(ctx(world(), { push: p.push }), job), /push_rejected 503/);
  await assert.rejects(dispatchJob(ctx(world(), {}), job), /push_send: this runtime holds no push transport/);
});
```

(`db.tables` is how `_fake-db.mjs` exposes its rows — confirm the property name in the file before running.)

`tooling/scripts/tests/expo-push.test.mjs`:

```js
/**
 * The push transport, executed against a stub of Expo's push service: batches of a hundred, the token when one is
 * set, a receipt per message in order, and a refusal thrown with its status.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { expoPush, EXPO_PUSH_URL, PUSH_BATCH } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/ops/push.ts")).href);

const msg = (i) => ({ to: `tok-${i}`, title: "t", body: "b", sound: "default", data: { route: null, notification_id: "n", tenant_id: "t" } });
const stub = (answer) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization ?? null, n: body.length });
    if (answer instanceof Error) throw answer;
    if (typeof answer === "number") return { ok: false, status: answer, text: async () => "no" };
    return { ok: true, status: 200, json: async () => ({ data: body.map((m) => (m.to === "tok-1" ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "r" })) }) };
  };
  return { calls, fetchImpl };
};

test("one request per hundred, the receipts in the messages' order, a gone device named", async () => {
  const s = stub();
  const receipts = await expoPush(s.fetchImpl).send(Array.from({ length: PUSH_BATCH + 1 }, (_, i) => msg(i)));
  assert.deepEqual(s.calls.map((c) => c.n), [PUSH_BATCH, 1]);
  assert.equal(s.calls[0].url, EXPO_PUSH_URL);
  assert.equal(s.calls[0].auth, null, "no token, no header");
  assert.equal(receipts.length, PUSH_BATCH + 1);
  assert.deepEqual(receipts[1], { to: "tok-1", status: "error", error: "DeviceNotRegistered" });
  assert.deepEqual(receipts[0], { to: "tok-0", status: "ok" });
});

test("the access token rides as a bearer when set; a refusal or a dead wire throws with what happened", async () => {
  process.env.EXPO_ACCESS_TOKEN = "expo-secret";
  try {
    const s = stub();
    await expoPush(s.fetchImpl).send([msg(0)]);
    assert.equal(s.calls[0].auth, "Bearer expo-secret");
  } finally {
    delete process.env.EXPO_ACCESS_TOKEN;
  }
  await assert.rejects(expoPush(stub(503).fetchImpl).send([msg(0)]), /push_rejected 503/);
  await assert.rejects(expoPush(stub(new Error("ECONNRESET")).fetchImpl).send([msg(0)]), /ECONNRESET/);
  assert.deepEqual(await expoPush(stub().fetchImpl).send([]), [], "nothing to send is nothing sent");
});
```

In `notify-transport.test.mjs`, a case (its fake db already holds `notifications`; add `jobs: []` to the world the case builds):

```js
test("a kept row of a kind a phone hears about schedules one push_send naming it; a kind a phone does not hear about schedules none", async () => {
  const db = fakeDb({ notifications: [], jobs: [] });
  const sent = [];
  const send = async () => (sent.push(1), true);
  await notify({ tenantId: TENANT, notifications: null, isEnvDefault: true }, { kind: "handoff", route: "inbox/th-1", subject: "Handoff needed", body: "Maria asked." }, { db, send });
  const [job] = db.tables.jobs;
  assert.equal(job.kind, "push_send");
  assert.equal(job.tenant_id, TENANT);
  assert.equal(job.payload.notification_id, db.tables.notifications[0].id);
  await notify({ tenantId: TENANT, notifications: null, isEnvDefault: true }, { kind: "sweep", subject: "Sweep late", body: "x" }, { db, send });
  assert.equal(db.tables.jobs.length, 1, "the sweep's row stays off the phone");
});
```

(`TENANT` and the platform env the file's other cases set: reuse them as they are.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: `packages/jobs/src/handlers.ts`.** Import `pushFor` and `type PushMessage` from `@chanlytics/contracts`. On `JobContext`, after `leads`:

```ts
  /**
   * The phones: one message each through Expo's push service, as the edge
   * binds it (lib/ops/push.ts). INJECTED like email's intake. A receipt per
   * message, in order; a transport failure throws and the ledger tries again.
   */
  push?: PushPort;
```

and the port's types, before `JobContext`:

```ts
export interface PushReceipt {
  to: string;
  status: "ok" | "error";
  /** Expo's name for what went wrong; "DeviceNotRegistered" is a phone to forget. */
  error?: string;
}
export interface PushPort {
  send(messages: PushMessage[]): Promise<PushReceipt[]>;
}
```

The handler, before `HANDLERS`:

```ts
/**
 * push_send: one kept notification to every phone of the people it is for.
 * payload: { notification_id }. The row it names may be gone (purged, or the
 * workspace erased): that is a job done, not a failure. A phone the service
 * says is gone is forgotten here, where the answer is.
 */
async function pushSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  if (!ctx.push) throw new Error("push_send: this runtime holds no push transport");
  const id = String(job.payload.notification_id ?? "");
  if (!id) throw new Error("push_send: no notification named");
  const n = must(
    "push_send: cannot read the notification",
    await ctx.db
      .from("notifications")
      .select("id, tenant_id, title, body, route, recipient_user_id")
      .eq("id", id)
      .eq("tenant_id", job.tenant_id)
      .maybeSingle(),
  );
  if (!n) return;
  const readers = n.recipient_user_id
    ? [n.recipient_user_id]
    : must(
        "push_send: cannot read who is in the workspace",
        await ctx.db.from("memberships").select("user_id").eq("tenant_id", job.tenant_id),
      ).map((m) => m.user_id);
  if (!readers.length) return;
  const devices = must(
    "push_send: cannot read the phones",
    await ctx.db.from("push_devices").select("token").in("user_id", readers),
  );
  if (!devices.length) return;
  const receipts = await ctx.push.send(pushFor(n, devices.map((d) => d.token)));
  const gone = receipts.filter((r) => r.status === "error" && r.error === "DeviceNotRegistered").map((r) => r.to);
  if (gone.length) {
    must("push_send: cannot forget a phone that is gone", await ctx.db.from("push_devices").delete().in("token", gone));
  }
}
```

`HANDLERS` gains `push_send: pushSend,`. In `ledger.ts` `RETRY_WAITS_MS` gains `push_send: [2 * 60_000, 10 * 60_000],` with a comment: the provider's bad minute, then its short outage, each wait outlasting the lease (jobs-ledger.test.mjs holds every wait above it).

- [ ] **Step 4: The transport** `apps/edge/lib/ops/push.ts`:

```ts
/**
 * The one way the edge reaches a phone: Expo's push service, which holds the
 * APNs and FCM credentials the app's builds registered (PR 3 of the phone app
 * plan). No key is needed to send; EXPO_ACCESS_TOKEN, when set, rides as a
 * bearer so only this deployment may send to this app's tokens.
 *
 * A receipt per message, in the messages' order, is the contract the job
 * stands on; a refusal or a dead wire throws with what happened, and the
 * ledger tries again (RETRY_WAITS_MS).
 */
import type { PushMessage } from "../packages/contracts.js";
import type { PushPort, PushReceipt } from "../packages/jobs.js";
import { env } from "../env.js";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/** Expo takes up to a hundred messages in one request. */
export const PUSH_BATCH = 100;
const TIMEOUT_MS = 10_000;

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export function expoPush(fetchImpl: typeof fetch = fetch): PushPort {
  return {
    async send(messages: PushMessage[]): Promise<PushReceipt[]> {
      const receipts: PushReceipt[] = [];
      for (let i = 0; i < messages.length; i += PUSH_BATCH) {
        const batch = messages.slice(i, i + PUSH_BATCH);
        const token = env.EXPO_ACCESS_TOKEN;
        const r = await fetchImpl(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!r.ok) {
          const detail = await r.text().catch(() => "");
          throw new Error(`push_rejected ${r.status} ${detail.slice(0, 200)}`.trim());
        }
        const { data } = (await r.json()) as { data: ExpoTicket[] };
        batch.forEach((m, k) => {
          const t = data?.[k];
          receipts.push(
            t?.status === "ok" ? { to: m.to, status: "ok" } : { to: m.to, status: "error", error: t?.details?.error ?? t?.message ?? "unknown" },
          );
        });
      }
      return receipts;
    },
  };
}
```

`env.ts`: a getter `EXPO_ACCESS_TOKEN` in a new group after email's, and `.env.example` a group:

```
# Push (Expo's push service, apps/edge/lib/ops/push.ts). No key is needed to
# send; when set, the access token rides as a bearer so only this deployment
# may send to the app's tokens. Made at expo.dev under the project's access
# tokens.
EXPO_ACCESS_TOKEN=
```

`tick.ts`: import `expoPush` from `../../lib/ops/push.js` and add `push: expoPush(),` to the dispatch context beside `page`.

- [ ] **Step 5: `notify.ts`.** `recordNotification` returns `Promise<string | null>`: the insert gains `.select("id").single()` and returns `data.id` (null on any failure, still logged). `notify` keeps the returned id and, after the row:

```ts
  // A phone is told from the row, by the ledger: never in this request, and never lost with the mail.
  if (kept && isPushKind(keptKind) && target.tenantId) {
    const db = ports.db === undefined ? pg() : ports.db;
    if (db) {
      try {
        await scheduleJob(db, { tenantId: target.tenantId, kind: "push_send", dueAt: new Date(), payload: { notification_id: kept } });
      } catch (e) {
        L.error("push_schedule_failed", { kind: keptKind, error: errField(e) });
      }
    }
  }
```

where `keptKind` is the kind `recordNotification` decided (return `{ id, kind }` so the two are one decision), `isPushKind` comes from `../packages/contracts.js` and `scheduleJob` from `../packages/jobs.js`.

- [ ] **Step 6: Rebuild dists** `corepack pnpm --filter @chanlytics/jobs build` (contracts and db were rebuilt in Task 5; jobs bundles core).
- [ ] **Step 7: Run** `corepack pnpm test tooling/scripts/tests/push-send.test.mjs tooling/scripts/tests/expo-push.test.mjs tooling/scripts/tests/notify-transport.test.mjs tooling/scripts/tests/notify-addressing.test.mjs tooling/scripts/tests/jobs-tick.test.mjs tooling/scripts/tests/edge-env.test.mjs tooling/scripts/tests/env-manifest.test.mjs` — pass.
- [ ] **Step 8: Commit** `feat(push): a kept notification reaches every phone of the people it is for`.

---

### Task 7: The gates, the dists, the PR

**Files:** none new.

- [ ] **Step 1: Format** the non-legacy files touched: `corepack pnpm exec prettier --write <each .ts/.mjs file from Tasks 1–6>` (legacy JSX and CSS are ignored by `.prettierignore`).
- [ ] **Step 2: Dists.** `node tooling/scripts/check-dist.mjs` after committing the sources; commit every dist with a real diff (`git diff -w --ignore-cr-at-eol --stat -- packages/*/dist`), restore the ones whose diff is line endings alone.
- [ ] **Step 3: Whole suite** `corepack pnpm test` — expect the baseline plus the new tests, 0 fail. `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`.
- [ ] **Step 4: Migration number.** `MSYS_NO_PATHCONV=1 git ls-tree -r --name-only origin/main -- supabase/migrations | tail -3` and the open PRs' branches: `00162` must be free. `corepack pnpm test tooling/scripts/tests/migrations.test.mjs`.
- [ ] **Step 5: Push and open the PR** with the body below; CI must be green; a PR touching `supabase/migrations/` is not auto-merged — the production push is a separate step (`db push --linked --dry-run`, then `--yes`, BEFORE merge since the code reads the new schema).

PR body:

```
The phone app, PR 0: the ground. Spec docs/superpowers/specs/2026-09-24-mobile-groundwork-design.md.

Nothing new appears on the web. Five pieces the native shell (PRs 1–4) leans on:
- In-app mode: a User-Agent token stamps html.in-app before paint; no web tab bar, no Stripe doors (3.1.3(f)), the shell's inset.
- App links: /.well-known/apple-app-site-association and assetlinks.json from APP_LINKS_APPLE / APP_LINKS_ANDROID; 404 until set.
- POST /auth/native: a native identity token (Apple, Google) signed in through the cookie client; 303 to this site only.
- 00162: push_devices with two definer doors; PUT/DELETE /api/v1/me/devices; jobs.kind gains push_send.
- push_send: notify schedules it for PUSH_KINDS; the job reads readers, phones, sends through Expo's service; a gone device is forgotten.

Ruben's steps after merge: Sign in with Apple on the hosted Supabase project (Providers → Apple: the app's bundle id as client id, once the Apple org account exists); Google's iOS client id under Providers → Google → Authorized Client IDs; Vercel: APP_LINKS_APPLE, APP_LINKS_ANDROID (dashboard), EXPO_ACCESS_TOKEN (edge, optional); the production db push is mine, before merge.
```

---

## Self-review

- **Spec coverage.** §1 in-app mode: Tasks 1–2. §2 app links: Task 3. §3 the native door: Task 4. §4 devices: Task 5. §5 the job: Task 6. Decisions 1–5 are stated in the code comments of Tasks 4, 5 and 6.
- **Placeholders.** Two spots defer to the file being edited (the account-routes `run` helper's name, the fake db's rows property): both are read-before-write notes, not gaps; the code is complete.
- **Type consistency.** `PushMessage` is defined in contracts (Task 5) and read by jobs and the edge (Task 6); `PushPort`/`PushReceipt` live in jobs and are imported by the edge transport; `pushFor(n, tokens)` takes `{id, tenant_id, title, body, route}` in both the contracts test and the handler; `parseDevice` returns `{ok, device | reason}` in the route and the test; `nativeSignInPlan` returns `{signIn, to, refused}` in the route and the test.
