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
import { ROOT, readCode, readRaw } from "./_source.mjs";

function pngSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(b.toString("ascii", 1, 4), "PNG", `${rel} is a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

test("the Inbox and Conversations take turns on a phone, with a Back that only a phone sees", () => {
  const inbox = readRaw("apps/dashboard/src/legacy/pages/inbox.jsx");
  assert.ok(
    inbox.includes("const [phoneThreadOpen, setPhoneThreadOpen] = React.useState(!!initialThreadId);"),
    "a deep link opens onto the thread",
  );
  assert.ok(inbox.includes("setActiveThreadId(id); setPhoneThreadOpen(true);"), "a tap opens it");
  assert.ok(inbox.includes('${phoneThreadOpen ? "phone-thread" : ""}'));
  assert.ok(inbox.includes("onBack={() => setPhoneThreadOpen(false)}"));
  const thread = readRaw("apps/dashboard/src/legacy/pages/inbox-thread.jsx");
  assert.ok(thread.includes('data-testid="ix-back"'));
  assert.ok(thread.includes("{onBack && ("), "no Back on desktop's markup path when nobody asked for one");
  const cv = readRaw("apps/dashboard/src/legacy/pages/conversations.jsx");
  assert.ok(cv.includes('${phoneOpen ? "phone-detail" : ""}'));
  // A row pressed opens the pane (openRow: the row, the phone's turn, and the address).
  assert.ok(
    cv.includes("const openRow = (id) => {") &&
      cv.includes("    setPhoneOpen(true);") &&
      cv.includes("onSelect={openRow}"),
  );
  const css = readRaw("apps/dashboard/src/legacy/styles/mobile.css");
  assert.ok(css.includes(".ix-back { display: none; }"), "hidden by default");
  assert.ok(css.includes(".inbox.phone-thread .ix-list { display: none; }"));
  assert.ok(css.includes(".inbox.phone-thread .ix-thread-pane { display: flex; }"));
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
  assert.ok(css.includes("padding: 6px 4px calc(6px + env(safe-area-inset-bottom));"), "above the home bar");
  assert.ok(css.includes("min-height: 44px;"), "thumb-sized");
  // Inside the app: the native tab bar stands where the web one did, and the shell says how tall it is.
  assert.ok(
    css.includes("html.in-app .phone-tabs { display: none; }"),
    "belt and braces for the frame before the shell reads the global",
  );
  assert.ok(
    css.includes("html.in-app .main-scroll { padding-bottom: var(--app-inset-bottom, 0px); }"),
    "the room under every surface is the shell's tab bar, not the web's",
  );
  assert.ok(css.includes("html.in-app .pp-toast-stack { bottom: calc(14px + var(--app-inset-bottom, 0px)); }"));
  // Google refuses OAuth in an embedded WebView: in-app the web's Google door and its "or" are not drawn (PR 1 of the app).
  assert.ok(css.includes("html.in-app .auth-google, html.in-app .auth-or { display: none; }"));
  assert.ok(
    shell.includes('window.addEventListener("shell:menu", onMenu)') &&
      shell.includes('window.addEventListener("shell:top", onTop)'),
    "the native More tab opens the drawer and a re-tap scrolls to the top (legacy-bridge/app-bridge.ts)",
  );
  // The ✦'s own lift lives in ask.css with the palette's rules (ask.test.mjs holds it there).
  assert.ok(
    css.includes("position: fixed;") && css.includes("left: 0; right: 0; bottom: 0;"),
    "fixed to the viewport: flowed, it lived below the fold",
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
  assert.ok(
    layout.includes('appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Chanlytics" }'),
  );
  assert.ok(layout.includes('viewportFit: "cover"'));
  assert.ok(
    layout.includes("__html: inAppBootScript()"),
    "inside the app: stamped before first paint, beside the theme",
  );
  assert.ok(
    readCode("apps/dashboard/proxy.ts").includes('"/manifest.webmanifest"'),
    "the installer fetches it without a session (the public list is pinned by value in auth-gate)",
  );
  const sw = readRaw("apps/dashboard/public/sw.js");
  assert.ok(sw.includes("self.skipWaiting()") && sw.includes("self.clients.claim()"));
  assert.ok(!/caches\.|cache\.put|respondWith/.test(sw), "caches nothing: the workspace is live data");
  const boot = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(boot.includes('process.env.NODE_ENV === "production"'), "no worker on a dev origin");
  assert.ok(boot.includes('navigator.serviceWorker.register("/sw.js")'));
});
