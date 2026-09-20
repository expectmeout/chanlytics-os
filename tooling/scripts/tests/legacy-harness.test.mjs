/**
 * The standalone harness loads the same files the app does.
 *
 * `Chanlytics.html` is a second, hand-kept copy of `legacy-bridge/manifest.ts`:
 * both list every file of the classic mockup, in the order the shared global
 * scope requires. Only the manifest had a test. So seventeen surfaces were
 * added to the manifest — each with its own assertion in its own test file —
 * and never to the harness, and the harness rotted where nobody was looking:
 * `app-shell.jsx` names `MessagesPage` with no `window.` guard, `AttnRow` is
 * rendered as `<window.AttnRow>` on Today and on People, and Settings · Setup
 * is a pane that renders nothing. A blank page for the one person who opens
 * this file, which is the only reason it exists.
 *
 * The reverse rot is here too, and it happened: a `<script>` tag for
 * `tweaks-panel.jsx` outlived the file, and the harness threw on boot for as
 * long as it took anyone to look.
 *
 * So the two lists are asserted to be ONE list. Order is part of it — data
 * seeds globals that pages read at module scope — which makes "added at the
 * bottom" as loud as "not added at all".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  identityWords, memberWords, personInitials,
  DEFAULT_TIMEZONE, timezoneCity, timezoneWords,
  SOURCE_WORDS, samePhone, whyNotAPhone, whyNotAHandoff, handoffE164,
} from "@chanlytics/contracts";
import { ROOT, readCode, readRaw } from "./_source.mjs";

const LEGACY = "apps/dashboard/src/legacy";
const html = readRaw(`${LEGACY}/Chanlytics.html`);

/** The harness's own seed file, standing where the bridge puts seed-globals.ts. */
const STUBS = "data/bridge-stubs.jsx";

/** Every `src="dir/file.jsx?v=N"` the harness loads, in order, without the cache-buster. */
const harness = [...html.matchAll(/<script[^>]*\bsrc="((?:components|data|pages)\/[^"?]+\.jsx)[^"]*"/g)].map((m) => m[1]);

/** Every legacy file the bridge loads, in order; its seed-globals is the harness's stub file. */
const manifest = readCode(`${LEGACY}-bridge/manifest.ts`)
  .split("\n")
  .map((l) => l.match(/^import "(?:@\/legacy\/)?(\.\/seed-globals|(?:components|data|pages)\/[^"]+\.jsx)";/))
  .filter(Boolean)
  .map((m) => (m[1] === "./seed-globals" ? STUBS : m[1]));

/** Every file of the mockup on disk, in the shape both lists name it. */
const onDisk = ["components", "data", "pages"].flatMap((dir) =>
  fs.readdirSync(path.join(ROOT, LEGACY, dir)).filter((f) => f.endsWith(".jsx")).map((f) => `${dir}/${f}`),
);

test("a file of the mockup that exists is a file the harness loads", () => {
  const missing = onDisk.filter((f) => f !== STUBS && !harness.includes(f));
  assert.deepEqual(missing, [], `Chanlytics.html has no <script> tag for: ${missing.join(", ")}`);
});

test("the harness loads nothing that is no longer on disk", () => {
  const gone = harness.filter((f) => !fs.existsSync(path.join(ROOT, LEGACY, f)));
  assert.deepEqual(gone, [], `Chanlytics.html loads files that do not exist: ${gone.join(", ")}`);
});

test("the harness and the bridge load the same files in the same order", () => {
  // Not a set comparison: `data/` seeds globals that `pages/` read at module
  // scope, and people-data mutates clients-data's CLIENT_SEGMENTS. A file in
  // the list but in the wrong place is the same blank page as a file missing.
  assert.deepEqual(harness, manifest);
});

test("every script the harness loads is cache-busted", () => {
  // Nothing here is fingerprinted and the mockup is served off a plain static
  // server, so an edited file without a bumped ?v= is an edit the reviewer
  // does not see. (The document itself is the one exception: a browser holding
  // a stale Chanlytics.html is a hard reload, not a version.)
  const bare = [...html.matchAll(/<script[^>]*\bsrc="((?:components|data|pages)\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !s.includes("?v="));
  assert.deepEqual(bare, [], `no ?v= on: ${bare.join(", ")}`);
});

/** The stub file is plain JS in an IIFE, so it runs against any object. */
const seed = (win) => {
  new Function("window", readRaw(`${LEGACY}/${STUBS}`))(win);
  return win;
};

/** What the bridge publishes and the classic pages read without asking first. */
const BRIDGED = [
  "__DEMO_MODE", "__identity", "__tz", "DEFAULT_TIMEZONE", "__FACT_WORDS",
  "__samePhone", "__whyNotAPhone", "__whyNotAHandoff", "__handoffE164",
];

test("the harness seeds the bridge's globals before anything reads them", () => {
  // data/inbox-data.jsx and data/people-data.jsx read __DEMO_MODE at module
  // scope; components/sidebar.jsx and pages/settings.jsx call __identity
  // unguarded. First, or it may as well not be there.
  assert.equal(harness[0], STUBS, "bridge-stubs.jsx is the first script the harness loads");

  const win = seed({});
  for (const g of BRIDGED) assert.notEqual(win[g], undefined, `bridge-stubs.jsx publishes ${g}`);
});

test("the stubs stand IN for the bridge, never over it", () => {
  // This file lives in the tree the Next bundle imports. A stub that
  // overwrote a real implementation would be a mockup's arithmetic deciding
  // what a real workspace sees, so every write is conditional — including the
  // demo switch, which the bridge deliberately sets to FALSE.
  const bridge = { note: "the real one" };
  const win = seed(Object.fromEntries([["__DEMO_MODE", false], ...BRIDGED.slice(1).map((g) => [g, bridge])]));
  assert.equal(win.__DEMO_MODE, false, "an explicit false is not a missing value");
  for (const g of BRIDGED.slice(1)) assert.equal(win[g], bridge, `${g} kept the bridge's`);
});

test("the stubs answer the way contracts answers", () => {
  // Ported, not invented: these answers are read ON SCREEN — initials in an
  // avatar, a timezone's local time, why a typed number is not one anyone can
  // be reached on. A stub that drifts sends a design review to the wrong
  // conclusion about the real interface.
  const win = seed({});
  const me = { email: "sales@chanlytics.com", display_name: "Sarah Chen", role: "owner" };
  assert.deepEqual(win.__identity.words(me), identityWords(me));
  assert.deepEqual(win.__identity.words(null), identityWords(null));
  assert.deepEqual(win.__identity.member({ email: "hi@chanlytics.agency" }), memberWords({ email: "hi@chanlytics.agency" }));
  assert.equal(win.__identity.initials(null, "hi@chanlytics.agency"), personInitials(null, "hi@chanlytics.agency"));

  assert.equal(win.DEFAULT_TIMEZONE, DEFAULT_TIMEZONE);
  assert.equal(win.__tz.city("America/New_York"), timezoneCity("America/New_York"));
  const at = Date.UTC(2026, 3, 26, 16, 4);
  assert.deepEqual(win.__tz.words("America/New_York", at), timezoneWords("America/New_York", at));

  assert.deepEqual(win.__FACT_WORDS, SOURCE_WORDS);
  assert.equal(win.__samePhone("(646) 932-5775", "+16469325775"), samePhone("(646) 932-5775", "+16469325775"));
  for (const n of ["", "12345", "9325775", "646 932 5775", "nonsense"]) {
    assert.equal(win.__whyNotAPhone(n), whyNotAPhone(n), `whyNotAPhone(${JSON.stringify(n)})`);
  }
  for (const n of ["", "6469325775", "+16469325775"]) {
    assert.equal(win.__whyNotAHandoff(n, "+16469325775"), whyNotAHandoff(n, "+16469325775"), `whyNotAHandoff(${JSON.stringify(n)})`);
    assert.equal(win.__handoffE164(n), handoffE164(n), `handoffE164(${JSON.stringify(n)})`);
  }
});

test("the harness is a demo, and the app is not", () => {
  // Around fifty gates ask window.__DEMO_MODE whether they are looking at
  // theater or at a real workspace: Today's whole rail, the sidebar's persona
  // and agent list, the Leads and Live tabs, the scripted lead arrival. Unset,
  // the standalone mockup renders the production half of every one of them —
  // a UI review of a mockup with most of the mockup missing.
  assert.equal(seed({}).__DEMO_MODE, true);
  assert.match(readCode(`${LEGACY}-bridge/seed-globals.ts`), /window\.__DEMO_MODE = false/);
});

test("the mockup draws Reports and Today from their samples, loaded right after the stand-ins (serve-legacy.mjs builds them)", () => {
  // Plain scripts, outside the .jsx lists above: the bridge never loads them, because a workspace draws its own numbers.
  const tags = [...html.matchAll(/<script[^>]*\bsrc="([^"?]+)[^"]*"/g)].map((m) => m[1]);
  assert.equal(tags[tags.indexOf(STUBS) + 1], "data/reports-sample.js", "the demo's Reports reads window.__reportsSample");
  assert.equal(tags[tags.indexOf(STUBS) + 2], "data/today-sample.js", "the demo's Today reads what installTodaySample published");
});
