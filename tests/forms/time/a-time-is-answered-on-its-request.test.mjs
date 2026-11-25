/**
 * The time a request asked for, as its owner reads it on the request's page (apps/dashboard/src/surfaces/inbox/request/
 * time.tsx; the canvas's board "Ask for a time: you confirm it"), bundled for node with the dashboard's own React and
 * drawn in each state: waiting on Booked it or Can't with how long it is held; a time booked for someone else since,
 * Can't leading; past its day, with no Booked it; booked; let go. And the form's numbers say how many asked for a time
 * and how often the business's own booking page was opened from the form (campaigns/forms/words.ts resultsWords).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { ROOT } from "../../_source.mjs";

const DASHBOARD_MODULES = path.join(ROOT, "apps/dashboard/node_modules");

globalThis.window = {
  location: { pathname: "/w/harbor/inbox", search: "", hash: "", assign() {} },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  fetch: async () => {
    throw new Error("nothing answers");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null };

const out = await build({
  stdin: {
    contents:
      'export { provide } from "../../../apps/dashboard/src/bridge/provided.ts";\n' +
      'export { TimeAsked } from "../../../apps/dashboard/src/surfaces/inbox/request/time.tsx";\n' +
      'export { resultsWords } from "../../../apps/dashboard/src/surfaces/campaigns/forms/words.ts";\n' +
      'export { renderToStaticMarkup } from "react-dom/server";\n' +
      'export { createElement } from "react";\n',
    resolveDir: path.join(ROOT, "tests/forms/time"),
    sourcefile: "a-time-is-answered.ts",
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
    react: path.join(DASHBOARD_MODULES, "react"),
    "react-dom": path.join(DASHBOARD_MODULES, "react-dom"),
    "@": path.join(ROOT, "apps/dashboard/src"),
  },
  define: { "process.env.NODE_ENV": '"production"' },
});
const file = path.join(os.tmpdir(), `form-time-${process.pid}-${Date.now()}.cjs`);
fs.writeFileSync(file, out.outputFiles[0].text);
const S = createRequire(import.meta.url)(file);
// The bundle holds its own store (bridge/provided.ts): a page's Retry, as the frame installs it.
S.provide("refreshSurface", async () => {});
fs.rmSync(file, { force: true });

const TZ = "America/New_York";
// Sunday 22 November 2026, 9:02 PM in New York.
const NOW = Date.parse("2026-11-23T02:02:00Z");
/** Ana's time: Saturday the 28th, 11:00 AM to 1:00 PM, a balayage, held until 8:02 PM tomorrow. */
const time = (over = {}) => ({
  appointment_id: "v1",
  starts_at: "2026-11-28T16:00:00Z",
  ends_at: "2026-11-28T18:00:00Z",
  service: "Balayage",
  status: "proposed",
  expires_at: "2026-11-24T01:02:00Z",
  holds: true,
  timezone: TZ,
  taken_by: null,
  ...over,
});
const page = { busy: null, book() {}, cant() {} };

/** The block drawn, and what a person reads of it: its words alone, a space between any two elements. */
function drawn(t) {
  const html = S.renderToStaticMarkup(S.createElement(S.TimeAsked, { page, time: t, nowMs: NOW }));
  const words = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  const presses = [...html.matchAll(/<button[^>]*data-testid="([^"]+)"[^>]*>/g)].map((m) => [
    m[1],
    /data-variant="primary"|class="[^"]*primary/.test(m[0]),
  ]);
  return { html, words, presses };
}

test("waiting on its answer: the time on its day, how long it is held, Booked it first, then Can't", () => {
  const { words, presses } = drawn(time());
  assert.match(
    words,
    /^They asked for a time SAT 28 11:00 AM – 1:00 PM Balayage Held for them until tomorrow at 8:02 PM/,
  );
  assert.match(words, /On your calendar as Requested\. Nothing is booked until you say\.$/);
  assert.deepEqual(
    presses.map(([id]) => id),
    ["ix-rq-book", "ix-rq-cant"],
  );
  assert.equal(presses[0][1], true, "Booked it leads");
  assert.doesNotMatch(words, /Booked it too/);
});

test("a time booked for someone else since: it says so, and Can't leads, with Booked it too for two chairs", () => {
  const { words, presses } = drawn(time({ taken_by: "Ana Ruiz" }));
  assert.match(
    words,
    /^That time is booked now You booked Ana Ruiz for Saturday at 11:00 AM\. Tell them it can't, with other times\./,
  );
  assert.deepEqual(
    presses.map(([id]) => id),
    ["ix-rq-cant", "ix-rq-book"],
  );
  assert.equal(presses[0][1], true, "Can't leads");
  assert.match(words, /Booked it too/);
  assert.doesNotMatch(words, /Nothing is booked until you say/, "answered above: the card asks nothing twice");
  // A visit that names nobody is still in the way.
  assert.match(drawn(time({ taken_by: "" })).words, /You booked someone else for Saturday at 11:00 AM/);
});

test("past its day: never booked blind, no Booked it, and the reply below offers what is open now", () => {
  const { words, presses } = drawn(time({ holds: false, expires_at: "2026-11-23T01:02:00Z" }));
  assert.match(words, /^Not confirmed in time It was held until (yesterday|today) at 8:02 PM and may have gone since/);
  assert.match(words, /Tell them what's open now\./);
  assert.match(words, /No longer held on your calendar/);
  assert.deepEqual(presses, [], "nothing is pressed here: Booked it is the door's to refuse, and the reply is below");
});

test("answered: booked is on the calendar, let go is no longer held, and neither asks again", () => {
  const booked = drawn(time({ status: "booked", holds: false, expires_at: null }));
  assert.match(booked.words, /^Booked SAT 28 11:00 AM – 1:00 PM Balayage On your calendar$/);
  assert.deepEqual(booked.presses, []);
  const cant = drawn(time({ status: "cancelled", holds: false }));
  assert.match(cant.words, /^You couldn't take it SAT 28 .+ No longer held on your calendar$/);
  assert.match(cant.html, /data-gone/);
  assert.deepEqual(cant.presses, []);
});

test("the form's numbers say how many asked for a time, and what its business's booking page can't say", () => {
  const base = { days: 30, opens: 41, requests: 9, talked: 4, visits: 2, new_people: 7, known_people: 2 };
  assert.equal(S.resultsWords(base).line, "Opened 41 times · 9 requests · 4 conversations · 2 visits");
  const timed = S.resultsWords({ ...base, asked: 4 });
  assert.equal(timed.line, "Opened 41 times · 9 requests · 4 asked for a time · 4 conversations · 2 visits");
  const page = S.resultsWords({
    ...base,
    opens: 12,
    requests: 3,
    talked: 0,
    visits: 0,
    new_people: 3,
    known_people: 0,
    booking_opens: 5,
  });
  assert.match(
    page.who,
    /Opens are counted, not people\. Your booking page was opened 5 times from it\. Bookings made there can't be traced to the form\.$/,
  );
  // A form whose only news is its booking page still says it.
  const only = S.resultsWords({
    ...base,
    opens: 0,
    requests: 0,
    talked: 0,
    visits: 0,
    new_people: 0,
    known_people: 0,
    booking_opens: 1,
  });
  assert.match(only.who, /Your booking page was opened once from it\./);
  assert.equal(
    S.resultsWords({ ...base, opens: 0, requests: 0, talked: 0, visits: 0, new_people: 0, known_people: 0 }),
    null,
  );
});
