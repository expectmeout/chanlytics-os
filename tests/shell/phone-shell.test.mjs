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
import os from "node:os";
import vm from "node:vm";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { DEFAULT_LOOK_PREF, inAppBootScript, themeBootScript } from "@chanlytics/contracts";
import { ROOT, importSrc } from "../_source.mjs";
import { installStubReact } from "../_stub-react.mjs";
import { bridgeHolds } from "./_bridge-holds.mjs";
import { bootStep } from "./boot/_frame-boot.mjs";
import { PHONE, cascadeOf, element, frameSheets } from "../_css.mjs";

bridgeHolds({ who: { workspaces: [], activeWorkspaceId: null } });
installStubReact();
const { threadBack } = await importSrc("apps/dashboard/src/surfaces/inbox/thread/who.tsx");
const { PHONE_TABS } = await importSrc("apps/dashboard/src/surfaces/frame/places.ts");
const { PhoneTabs } = await importSrc("apps/dashboard/src/surfaces/frame/phone-tabs.tsx");
const { default: manifest } = await importSrc("apps/dashboard/app/manifest.ts");

// The frame's stylesheets, run for an element as a browser runs them (tests/_css.mjs): on a desk, on a phone in a
// browser's tab, and inside the phone app, whose shell sets its tab bar's height on <html> (--app-inset-bottom).
const DOC = 'html[data-theme="light"]';
const APP = 'html.in-app[data-theme="light"]';
const desk = cascadeOf(frameSheets());
const phone = cascadeOf(frameSheets(), PHONE);
const inApp = cascadeOf([...frameSheets(), { css: "html.in-app { --app-inset-bottom: 83px; }" }], PHONE);
const styleAt = (where, doc, ...parts) => where.style(element(doc, ...parts));

/**
 * The root layout (app/layout.tsx), bundled for node with the dashboard's own React and drawn: next/font/local is the
 * compiler's, so the bundle stands a loader in for it that names the font's variable as the compiler would, and the
 * layout's stylesheet is nothing here. Its line is written out, so the run that picks a change's tests reads which module
 * this test draws (tooling/scripts/tests-of.mjs reads a bundle's lines as strings).
 */
async function rootLayout() {
  const dashboard = path.join(ROOT, "apps/dashboard");
  const out = await build({
    stdin: {
      contents:
        'export { default as RootLayout, metadata, viewport } from "../../apps/dashboard/app/layout.tsx";\n' +
        'export { renderToStaticMarkup } from "react-dom/server";\n' +
        'export { createElement } from "react";\n',
      resolveDir: path.join(ROOT, "tests/shell"),
      sourcefile: "root-layout.ts",
      loader: "ts",
    },
    absWorkingDir: ROOT,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node24",
    jsx: "automatic",
    write: false,
    logLevel: "error",
    loader: { ".css": "empty" },
    alias: {
      react: path.join(dashboard, "node_modules/react"),
      "react-dom": path.join(dashboard, "node_modules/react-dom"),
      "@": path.join(dashboard, "src"),
    },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "the compiler's font loader",
        setup(b) {
          b.onResolve({ filter: /^next\/font\/local$/ }, () => ({ path: "next-font-local", namespace: "stand-in" }));
          b.onLoad({ filter: /.*/, namespace: "stand-in" }, () => ({
            contents: "export default (o) => ({ variable: 'font' + o.variable, className: 'font' })",
            loader: "js",
          }));
        },
      },
    ],
  });
  const file = path.join(os.tmpdir(), `root-layout-${process.pid}-${Date.now()}.cjs`);
  fs.writeFileSync(file, out.outputFiles[0].text);
  try {
    return createRequire(import.meta.url)(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

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
  assert.equal(styleAt(desk, DOC, ".ix-back").display, "none", "hidden on a desk");
  assert.equal(styleAt(phone, DOC, ".ix-back").display, "inline-flex", "and a phone's way back to the list");
  // On a phone the thread takes the page over the list; a list held under the thread it opened stays laid out, where it
  // stood (kit motion/held-list.ts, components.css).
  assert.deepEqual(
    [styleAt(phone, DOC, ".inbox", ".ix-list").display, styleAt(phone, DOC, ".inbox", ".ix-thread-pane").display],
    ["flex", "none"],
    "the list first",
  );
  assert.deepEqual(
    [
      styleAt(phone, DOC, ".inbox[data-takeover]", ".ix-list").display,
      styleAt(phone, DOC, ".inbox[data-takeover]", ".ix-list[data-held]").display,
      styleAt(phone, DOC, ".inbox[data-takeover]", ".ix-thread-pane").display,
    ],
    ["none", "flex", "flex"],
    "then the thread, and a list held under it is still laid out",
  );
  assert.equal(
    styleAt(phone, DOC, ".live-monitor", ".lm-whisper", "button.btn")["min-height"],
    "44px",
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
    return PhoneTabs({ page: "inbox", param: null, inboxNeeds, onNavigate() {}, onMenu() {}, onPlace() {} });
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
  // The bar as the kit's TabBar draws it (tab-bar.tsx: a nav of places), under the class the shell gives it.
  const placesBar = [".app-root", "nav.tab-bar.phone-places"];
  assert.equal(styleAt(desk, DOC, ...placesBar).display, "none", "desktop never sees it");
  const onPhone = styleAt(phone, DOC, ...placesBar);
  assert.equal(onPhone.display, "grid");
  assert.equal(
    onPhone.position,
    "fixed",
    "fixed to the viewport, floating clear of its bottom: flowed, it lived below the fold",
  );
  assert.equal(
    onPhone.bottom,
    "max(14px, calc(env(safe-area-inset-bottom, 0px) - 13px))",
    "above the home bar: the boards' capsule floats clear of it, 14px up or 13 nearer the edge than the phone's inset",
  );
  assert.ok(Number.parseFloat(styleAt(phone, DOC, ...placesBar, "a.tab-bar-tab").height) >= 44, "thumb-sized");
  // Inside the app: the native tab bar stands where the web one did, and the shell says how tall it is.
  assert.equal(
    styleAt(inApp, APP, ...placesBar).display,
    "none",
    "belt and braces for the frame before the shell reads the global",
  );
  const room = styleAt(inApp, APP, ".app-root", ".main", ".main-scroll");
  assert.deepEqual(
    [room["--page-foot"], room["padding-bottom"]],
    ["83px", "83px"],
    "the room under every surface is the shell's tab bar, not the web's",
  );
  assert.equal(styleAt(inApp, APP, ".pp-toast-stack").bottom, "calc(14px + 83px)", "and the toast stands over it");
  // The in-app rule for the web's Google door is one the sign-in page loads: drawn with its one sheet, globals.css, and
  // none of the frame's (consent-page.test.mjs draws the rest of that page's rules).
  const signIn = cascadeOf(["apps/dashboard/app/globals.css"], PHONE);
  assert.equal(
    styleAt(signIn, APP, ".auth", "button.auth-google").display,
    "none",
    "the sign-in page hides it in the app",
  );
  // The ✦'s own lift lives in ask.css with the palette's rules (ask/line/ holds it there).
  // The status the bridge's floating pill used to carry is the shell's one
  // line under the top bar now, mounted in shell/surfaces/status/; nothing
  // fixed sits over the tab bar.
  const plain = phone.rules(element(DOC, "div")).length;
  assert.equal(phone.rules(element(DOC, ".bridge-pill")).length, plain, "the pill is gone");
});

test("the installable shell: a public manifest, real icons, full-screen on iOS, a worker that caches nothing", async () => {
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
  // The document every page stands in, drawn: what the installer and Safari read from its head, and its markup.
  const root = await rootLayout();
  assert.equal(root.metadata.manifest, "/manifest.webmanifest");
  // The phone's own bar stands over the app. Under "black-translucent" iOS 26 and 27 laid the installed app out one
  // bar short of the screen, on a strip at its foot nothing can be drawn in (7 Oct 2026).
  assert.deepEqual(
    root.metadata.appleWebApp,
    { capable: true, statusBarStyle: "default", title: "Chanlytics" },
    "the page is never drawn under the phone's bar: an installed iPhone app then ends a bar short of its screen",
  );
  assert.equal(root.viewport.viewportFit, "cover");
  const markup = root.renderToStaticMarkup(root.createElement(root.RootLayout, null, "the page"));
  const head = markup.slice(0, markup.indexOf("</head>"));
  assert.ok(
    head.includes(`<script>${inAppBootScript()}</script>`),
    "inside the app: stamped before first paint, beside the theme",
  );
  // The script it inlines stamps DEFAULT_LOOK_PREF for a device that has chosen nothing (theme-boot.test.mjs), and the
  // markup says the same.
  assert.ok(head.includes(`<script>${themeBootScript()}</script>`), "the theme, before first paint");
  assert.match(
    markup,
    new RegExp(`^<html [^>]*data-look="${DEFAULT_LOOK_PREF}"`),
    "the document stands in the default look until the head's script stamps the one this device keeps",
  );
  assert.ok(markup.includes("<body>the page"), "and draws its page");
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
