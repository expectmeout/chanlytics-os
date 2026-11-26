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
import vm from "node:vm";
import { ROOT, readCode, readRaw, importSrc } from "../_source.mjs";
import { installStubReact } from "../_stub-react.mjs";
import { bridgeHolds } from "./_bridge-holds.mjs";
import { bootStep } from "./boot/_frame-boot.mjs";

bridgeHolds({ who: { workspaces: [], activeWorkspaceId: null } });
installStubReact();
const { threadBack } = await importSrc("apps/dashboard/src/surfaces/inbox/thread/who.tsx");
const { PHONE_TABS } = await importSrc("apps/dashboard/src/surfaces/frame/places.ts");
const { PhoneTabs } = await importSrc("apps/dashboard/src/surfaces/frame/phone-tabs.tsx");
const { default: manifest } = await importSrc("apps/dashboard/app/manifest.ts");

function pngSize(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  assert.equal(b.toString("ascii", 1, 4), "PNG", `${rel} is a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
}

test("the Inbox and Conversations take turns on a phone, with a Back that only a phone sees", () => {
  // The Inbox's turns and its Back run in inbox-place.test.mjs, on the page itself.
  // The thread head's way back is drawn at its start (thread/who.tsx threadBack, moved from header.tsx 17 Nov 2026):
  // only where someone asked for one, which a desk never does.
  assert.equal(threadBack(null), null, "no Back on a desk's markup path when nobody asked for one");
  const went = [];
  const back = threadBack(() => went.push("back"));
  assert.equal(back.props["data-testid"], "ix-back");
  assert.equal(back.props["aria-label"], "Back to the list");
  back.props.onClick();
  assert.deepEqual(went, ["back"], "and its press goes back");
  // Conversations takes the same turns: a row pressed opens its pane and marks the page taken over, drawn in
  // conversations/inbox/conversations-address.test.mjs.
  const css = readRaw("apps/dashboard/src/styles/mobile.css");
  assert.ok(css.includes(".ix-back { display: none; }"), "hidden by default");
  // A list held under the thread it opened stays laid out, where it stood (kit motion/held-list.ts, components.css).
  assert.ok(css.includes(".inbox[data-takeover] .ix-list:not([data-held]) { display: none; }"));
  assert.ok(css.includes(".inbox[data-takeover] .ix-thread-pane { display: flex; }"));
  assert.ok(
    css.includes(".lm-whisper .btn { min-height: 44px; }"),
    "the whisper's buttons take a thumb on Live, on the class the page draws",
  );
});

test("the tab bar carries the real surfaces and the count that matters, drawn by the kit's TabBar", () => {
  // The places themselves are places.ts's, which the tab bar and the document's outline both draw from.
  assert.deepEqual(
    PHONE_TABS.map((t) => t.route),
    ["today", "inbox", "calendar", "clients"],
    "the real places, and not Live: a call is a bar while it is happening, not a slot that is empty the rest of the week; nothing seeded gets a tab",
  );
  const drawn = (inboxNeeds) => {
    const prev = globalThis.window.TabBar;
    globalThis.window.TabBar = function TabBar() {};
    try {
      return PhoneTabs({ page: "inbox", param: null, inboxNeeds, onNavigate() {}, onMenu() {}, onPlace() {} });
    } finally {
      globalThis.window.TabBar = prev;
    }
  };
  const bar = drawn(3);
  assert.equal(bar.props.testid, "phone-tabs", "drawn by the kit's TabBar");
  assert.deepEqual(
    bar.props.places.map((p) => [p.id, p.count]),
    [
      ["home", null],
      ["inbox", 3],
      ["calendar", null],
      ["people", null],
    ],
    "what needs you, on the Inbox",
  );
  assert.equal(drawn(0).props.places.find((p) => p.id === "inbox").count, null, "and a zero says nothing");
  // The shell draws it with what needs you, and only outside the app: inside it the native tab bar stands there, and the
  // native More tab opens the drawer (shell/surfaces/status/the-live-call-bar.test.mjs, "on a phone the web's tab bar ...").
  const css = readRaw("apps/dashboard/src/styles/mobile.css");
  assert.ok(css.includes(".phone-places { display: none; }"), "desktop never sees it");
  assert.ok(
    css.includes("--bar-foot: max(14px, calc(env(safe-area-inset-bottom, 0px) - 13px));") &&
      css.includes("bottom: var(--bar-foot);"),
    "above the home bar: the boards' capsule floats clear of it, 14px up or 13 nearer the edge than the phone's inset",
  );
  assert.ok(css.includes("min-height: 44px;"), "thumb-sized");
  // Inside the app: the native tab bar stands where the web one did, and the shell says how tall it is.
  assert.ok(
    css.includes("html.in-app .phone-places { display: none; }"),
    "belt and braces for the frame before the shell reads the global",
  );
  assert.ok(
    css.includes(
      "html.in-app .main-scroll { --page-foot: var(--app-inset-bottom, 0px); padding-bottom: var(--app-inset-bottom, 0px); }",
    ),
    "the room under every surface is the shell's tab bar, not the web's",
  );
  assert.ok(
    css.includes("html.in-app { --toast-foot: calc(14px + var(--app-inset-bottom, 0px)); }"),
    "a toast rests over the shell's tab bar, where the kit's stack reads it (kit.css .pp-toast-stack)",
  );
  // The in-app rule for the web's Google door is in globals.css, which the sign-in page loads (consent-page.test.mjs).
  assert.ok(!css.includes(".auth-google"), "the sign-in page never loads this sheet, so its rule cannot live here");
  // The ✦'s own lift lives in ask.css with the palette's rules (ask/line/ holds it there).
  assert.ok(
    css.includes("position: fixed;") && css.includes("bottom: var(--bar-foot);"),
    "fixed to the viewport, floating clear of its bottom: flowed, it lived below the fold",
  );
  // The status the bridge's floating pill used to carry is the shell's one
  // line under the top bar now, mounted in shell/surfaces/status/; nothing
  // fixed sits over the tab bar.
  assert.ok(!readRaw("apps/dashboard/src/bridge/frame.css").includes(".bridge-pill"), "the pill is gone");
});

test("the installable shell: a public manifest, real icons, full-screen on iOS, a worker that caches nothing", () => {
  const m = manifest();
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.purpose === "maskable" && i.src === "/icons/maskable-512.png"));
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
  // The installer fetches the manifest without a session: the proxy's public list, run by value in auth/auth-gate.test.mjs.
  // The worker, run as a browser runs it: it takes over at once, and answers nothing, so it caches nothing.
  const heard = {};
  const did = [];
  const self = {
    addEventListener: (type, fn) => (heard[type] = fn),
    skipWaiting: () => did.push("skipWaiting"),
    clients: { claim: () => (did.push("claim"), Promise.resolve()) },
    registration: { showNotification: () => Promise.resolve() },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "apps/dashboard/public/sw.js"), "utf8"), { self });
  heard.install({});
  heard.activate({ waitUntil: (p) => p });
  assert.deepEqual(did, ["skipWaiting", "claim"], "an update never waits on a closed tab");
  assert.equal(heard.fetch, undefined, "caches nothing and answers nothing: the workspace is live data");
  // And the frame's step that registers it (bridge/boot/installs.ts), run over a browser of the test's own: a production
  // build registers /sw.js, a development server none, since a worker on a dev origin outlives the server.
  const registered = [];
  const was = { window: globalThis.window, env: process.env.NODE_ENV, navigator: globalThis.navigator };
  globalThis.window ??= {};
  Object.defineProperty(globalThis, "navigator", {
    value: { serviceWorker: { register: (at) => (registered.push(at), Promise.resolve()) } },
    configurable: true,
  });
  try {
    process.env.NODE_ENV = "development";
    bootStep("serviceWorker").run();
    assert.deepEqual(registered, [], "no worker on a dev origin");
    process.env.NODE_ENV = "production";
    bootStep("serviceWorker").run();
    assert.deepEqual(registered, ["/sw.js"]);
  } finally {
    process.env.NODE_ENV = was.env;
    Object.defineProperty(globalThis, "navigator", { value: was.navigator, configurable: true });
    if (was.window === undefined) delete globalThis.window;
  }
});
