/**
 * The phone shell: one pane at a time, a tab bar at the thumb, an app on the
 * home screen.
 *
 * The mobile pass stacked the Inbox list above the thread in 42% of a phone
 * screen, hid the four real places behind a menu button, and the dashboard
 * was a browser tab. Now the list and the thread take turns with a Back, the
 * Conversations page does the same, a tab bar carries what needs you and who
 * is on the line, and a manifest with icons makes it installable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readCode, readRaw } from "../_source.mjs";

function pngSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(b.toString("ascii", 1, 4), "PNG", `${rel} is a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

test("the Inbox and Conversations take turns on a phone, with a Back that only a phone sees", () => {
  // The Inbox's turns and its Back run in inbox-place.test.mjs, on the page itself.
  const thread = readRaw("apps/dashboard/src/surfaces/inbox/thread/header.tsx");
  assert.ok(thread.includes('data-testid="ix-back"'));
  assert.ok(thread.includes("{onBack && ("), "no Back on desktop's markup path when nobody asked for one");
  const cv = readRaw("apps/dashboard/src/surfaces/inbox/pages/conversations-page.tsx");
  assert.ok(cv.includes("data-takeover={phoneOpen || undefined}"));
  // A row pressed opens the pane (openRow: the row, the phone's turn, and the address).
  assert.ok(
    cv.includes("const openRow = (id: string) => {") &&
      cv.includes("    setPhoneOpen(true);") &&
      cv.includes("onSelect={openRow}"),
  );
  const css = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(css.includes(".ix-back { display: none; }"), "hidden by default");
  assert.ok(css.includes(".inbox[data-takeover] .ix-list { display: none; }"));
  assert.ok(css.includes(".inbox[data-takeover] .ix-thread-pane { display: flex; }"));
  assert.ok(
    css.includes(".lm-whisper .btn { min-height: 44px; }"),
    "the whisper's buttons take a thumb on Live, on the class the page draws",
  );
});

test("the tab bar carries the real surfaces and the two counts that matter", () => {
  const shell = readRaw("apps/dashboard/src/legacy/pages/app-shell.jsx");
  assert.ok(shell.includes('data-testid="phone-tabs"'));
  for (const route of ['route: "today"', 'route: "inbox"', 'route: "clients"', 'route: "calendar"'])
    assert.ok(shell.includes(route), route);
  assert.ok(!/route: "(fleet|store|studio|outbound|broadcasts)"/.test(shell), "nothing seeded gets a tab");
  assert.ok(
    !/route: "live"/.test(shell),
    "and not Live: a call is a bar while it is happening, not a slot that is empty the rest of the week",
  );
  assert.ok(shell.includes('t.id === "inbox" && inboxNeeds > 0 ? String(inboxNeeds)'), "what needs you");
  assert.ok(
    shell.includes(
      "<PhoneTabs page={page} inboxNeeds={inboxNeeds} onNavigate={navigate} onMenu={() => setNavOpen(true)} />",
    ),
  );
  assert.ok(
    shell.includes("{!window.__IN_APP && ("),
    "and only outside the app: inside it the native tab bar stands there (window.__IN_APP, stamped before paint)",
  );
  const css = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(css.includes(".phone-tabs { display: none; }"), "desktop never sees it");
  assert.ok(
    css.includes("--bar-foot: max(14px, calc(env(safe-area-inset-bottom, 0px) - 13px));") &&
      css.includes("bottom: var(--bar-foot);"),
    "above the home bar: the boards' capsule floats clear of it, 14px up or 13 nearer the edge than the phone's inset",
  );
  assert.ok(css.includes("min-height: 44px;"), "thumb-sized");
  // Inside the app: the native tab bar stands where the web one did, and the shell says how tall it is.
  assert.ok(
    css.includes("html.in-app .phone-tabs { display: none; }"),
    "belt and braces for the frame before the shell reads the global",
  );
  assert.ok(
    css.includes(
      "html.in-app .main-scroll { --page-foot: var(--app-inset-bottom, 0px); padding-bottom: var(--app-inset-bottom, 0px); }",
    ),
    "the room under every surface is the shell's tab bar, not the web's",
  );
  assert.ok(css.includes("html.in-app .pp-toast-stack { bottom: calc(14px + var(--app-inset-bottom, 0px)); }"));
  // The in-app rule for the web's Google door is in globals.css, which the sign-in page loads (consent-page.test.mjs).
  assert.ok(!css.includes(".auth-google"), "the sign-in page never loads this sheet, so its rule cannot live here");
  assert.ok(
    shell.includes('window.addEventListener("shell:menu", onMenu)') &&
      shell.includes('window.addEventListener("shell:top", onTop)'),
    "the native More tab opens the drawer and a re-tap scrolls to the top (legacy-bridge/app-bridge.ts)",
  );
  // The ✦'s own lift lives in ask.css with the palette's rules (ask.test.mjs holds it there).
  assert.ok(
    css.includes("position: fixed;") && css.includes("bottom: var(--bar-foot);"),
    "fixed to the viewport, floating clear of its bottom: flowed, it lived below the fold",
  );
  // The status the bridge's floating pill used to carry is the shell's one
  // line under the top bar now, mounted in shell-status.test.mjs; nothing
  // fixed sits over the tab bar.
  assert.ok(!readRaw("apps/dashboard/src/legacy-bridge/legacy.css").includes(".bridge-pill"), "the pill is gone");
});

test("the installable shell: a public manifest, real icons, full-screen on iOS, a worker that caches nothing", () => {
  const m = readCode("apps/dashboard/app/manifest.ts");
  assert.ok(m.includes('display: "standalone"'));
  assert.ok(m.includes('purpose: "maskable"'));
  assert.deepEqual(pngSize("apps/dashboard/public/icons/icon-192.png"), {
    ...pngSize("apps/dashboard/public/icons/icon-192.png"),
    w: 192,
    h: 192,
  });
  assert.equal(pngSize("apps/dashboard/public/icons/icon-512.png").w, 512);
  assert.equal(pngSize("apps/dashboard/public/icons/maskable-512.png").w, 512);
  assert.equal(pngSize("apps/dashboard/public/icons/apple-touch-icon.png").w, 180);
  for (const rel of ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png"]) {
    assert.ok(pngSize(`apps/dashboard/public/icons/${rel}`).bytes < 60_000, `${rel} is small`);
  }
  const layout = readCode("apps/dashboard/app/layout.tsx");
  assert.ok(layout.includes('manifest: "/manifest.webmanifest"'));
  // The phone's own bar stands over the app. Under "black-translucent" iOS 26 and 27 laid the installed app out one
  // bar short of the screen, on a strip at its foot nothing can be drawn in (7 Oct 2026).
  assert.ok(
    layout.includes('appleWebApp: { capable: true, statusBarStyle: "default", title: "Chanlytics" }'),
    "the page is never drawn under the phone's bar: an installed iPhone app then ends a bar short of its screen",
  );
  assert.ok(layout.includes('viewportFit: "cover"'));
  assert.ok(
    layout.includes("__html: inAppBootScript()"),
    "inside the app: stamped before first paint, beside the theme",
  );
  // next/font/google is the compiler's, so the layout cannot be run here: its markup is read. The script it inlines
  // stamps DEFAULT_LOOK_PREF for a device that has chosen nothing (theme-boot.test.mjs), and the markup says the same.
  assert.ok(
    layout.includes("__html: themeBootScript()") && layout.includes("data-look={DEFAULT_LOOK_PREF}"),
    "the document stands in the default look until the head's script stamps the one this device keeps",
  );
  assert.ok(
    readCode("apps/dashboard/proxy.ts").includes('"/manifest.webmanifest"'),
    "the installer fetches it without a session (the public list is pinned by value in auth-gate)",
  );
  const sw = readRaw("apps/dashboard/public/sw.js");
  assert.ok(sw.includes("self.skipWaiting()") && sw.includes("self.clients.claim()"));
  assert.ok(!/caches\.|cache\.put|respondWith/.test(sw), "caches nothing: the workspace is live data");
  const boot = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(boot.includes("publicEnv.productionBuild"), "no worker on a dev origin");
  assert.ok(boot.includes('navigator.serviceWorker.register("/sw.js")'));
});
