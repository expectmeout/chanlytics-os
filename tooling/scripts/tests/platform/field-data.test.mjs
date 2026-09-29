/**
 * Field data (00252), run end to end over doubles: the browser's collector and its beacon, the route that keeps a
 * load's reports, the back office's read of their 75th percentile, and the card's words. The real route modules run
 * through route(), the collector over a stub window, the reads over a database in memory.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  PAGE_VITALS,
  PAGE_VITALS_MIN_LOADS,
  PAGE_VITALS_READ,
  SCHEMA_SETS,
  pageVitalsWords,
  vitalValueWords,
  vitalVerdict,
  vitalsPageOf,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const { platformVitals } = await import(at("apps/dashboard/src/server/platform/vitals.ts"));
const vitalsRoute = await import(at("apps/dashboard/app/api/v1/vitals/route.ts"));
const overview = await import(at("apps/dashboard/app/api/v1/platform/overview/route.ts"));
const { createFieldData, beaconTo, flushWhenHidden } = await import(at("apps/dashboard/src/client/field-data.ts"));
const { hashRoute } = await import(at("apps/dashboard/src/legacy-bridge/app-bridge.ts"));

beforeEach(() => setRateStore(memoryStore()));
after(() => setServiceClient(null));

const USER = "u1";
const ctxFor = (rpcs = {}, tables = {}) => ({
  supabase: fakeDb(tables, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
const post = (body) => new Request("http://localhost/api/v1/vitals", { method: "POST", body: JSON.stringify(body) });
const raise = (code, message) => () => {
  throw Object.assign(new Error(message), { code });
};
async function refused(p, code, status) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    assert.equal(e.status, status, e.message);
    return true;
  });
}
const load = (id, name, value) => ({ id: `v4-1727430000000-${id}`, name, value });

test("the five are the table's five, and a page is named for the route a load landed on", () => {
  assert.deepEqual([...PAGE_VITALS], SCHEMA_SETS["page_vitals.metric"]);
  // The shell's own parser, then the name the table keeps: its first segment, or "other".
  assert.equal(vitalsPageOf(hashRoute("#/clients/5f0c9a3e")), "clients");
  assert.equal(vitalsPageOf(hashRoute("#/inbox")), "inbox");
  assert.equal(vitalsPageOf(hashRoute("")), "today");
  assert.equal(vitalsPageOf(hashRoute("#/settings?tab=team")), "settings");
  assert.equal(vitalsPageOf(hashRoute("#/Über")), "other");
  assert.equal(vitalsPageOf(hashRoute(`#/${"a".repeat(40)}`)), "other");
});

test("the route: yours, not a workspace's, counted; it keeps what the page sent and says how many rows took it", async () => {
  assert.deepEqual(vitalsRoute.POST.policy, {
    kind: "write",
    scope: "account",
    role: null,
    rate: "vitals",
    spend: false,
  });
  const calls = [];
  setServiceClient(
    fakeDb(
      {},
      {},
      {
        note_page_vitals: (args) => {
          calls.push(args);
          return args.p_vitals.length;
        },
      },
    ),
  );
  const body = { page: "inbox", vitals: [load(1, "LCP", 2140.5), load(2, "CLS", 0.03)] };
  assert.deepEqual(await vitalsRoute.POST.run(post(body), ctxFor()), { kept: 2 });
  assert.deepEqual(calls, [{ p_page: "inbox", p_vitals: body.vitals }]);
});

test("the route refuses what the table would, before it reaches the table", async () => {
  const calls = [];
  setServiceClient(fakeDb({}, {}, { note_page_vitals: (args) => calls.push(args) }));
  const ok = load(1, "LCP", 900);
  await refused(vitalsRoute.POST.run(post({ page: "Inbox", vitals: [ok] }), ctxFor()), "validation", 400);
  await refused(vitalsRoute.POST.run(post({ page: "inbox", vitals: [] }), ctxFor()), "validation", 400);
  await refused(
    vitalsRoute.POST.run(post({ page: "inbox", vitals: [load(1, "FID", 12)] }), ctxFor()),
    "validation",
    400,
  );
  await refused(
    vitalsRoute.POST.run(post({ page: "inbox", vitals: [load(1, "LCP", -1)] }), ctxFor()),
    "validation",
    400,
  );
  await refused(
    vitalsRoute.POST.run(post({ page: "inbox", vitals: [load(1, "LCP", 600_001)] }), ctxFor()),
    "validation",
    400,
  );
  await refused(
    vitalsRoute.POST.run(post({ page: "inbox", vitals: [{ ...ok, id: "a b" }] }), ctxFor()),
    "validation",
    400,
  );
  const six = [...PAGE_VITALS, "LCP"].map((n, i) => load(i, n, 10));
  await refused(vitalsRoute.POST.run(post({ page: "inbox", vitals: six }), ctxFor()), "validation", 400);
  assert.deepEqual(calls, [], "nothing refused reached the table");
});

test("a report the table could not take is kept by nobody and refused to nobody", async () => {
  setServiceClient(fakeDb({}, {}, { note_page_vitals: raise("PGRST202", "Could not find the function") }));
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(args);
  try {
    const out = await vitalsRoute.POST.run(post({ page: "today", vitals: [load(1, "TTFB", 180)] }), ctxFor());
    assert.deepEqual(out, { kept: 0 });
  } finally {
    console.warn = warn;
  }
  assert.equal(said.length, 1);
  assert.equal(said[0][0], "page_vitals_not_kept");
  assert.deepEqual(JSON.parse(said[0][1]), { code: "PGRST202", message: "Could not find the function" });
});

test("the back office's read asks for the bounded window, says unread as null, and a database without it as none", async () => {
  const asked = [];
  const rows = [
    { metric: "LCP", page: null, samples: 40, p75: 2300, since: "2026-09-21T10:00:00Z" },
    { metric: "LCP", page: "inbox", samples: 40, p75: 2300, since: "2026-09-21T10:00:00Z" },
  ];
  const office = (rpc) => ({ db: fakeDb({}, {}, { page_vitals_p75: rpc }), session: null });
  const read = await platformVitals(
    office((args) => {
      asked.push(args);
      return rows;
    }),
  );
  assert.deepEqual(asked, [{ p_days: PAGE_VITALS_READ.days, p_most: PAGE_VITALS_READ.most }]);
  assert.deepEqual(read, [
    { metric: "LCP", page: null, samples: 40, p75: 2300 },
    { metric: "LCP", page: "inbox", samples: 40, p75: 2300 },
  ]);
  assert.equal(await platformVitals(office(raise("57014", "canceling statement due to statement timeout"))), null);
  assert.deepEqual(await platformVitals(office(raise("PGRST202", "Could not find the function"))), []);
});

test("the timings ride on the overview, and a read that fails takes nothing else with it", async () => {
  const session = {
    is_platform_admin: () => true,
    platform_overview: () => [],
    platform_partner_balances: () => [],
    platform_partner_workspaces: () => [],
  };
  const service = (p75) =>
    fakeDb({ waitlist: [] }, {}, { sweep_health: () => [], jobs_backlog: () => 0, page_vitals_p75: p75 });
  setServiceClient(
    service(() => [{ metric: "INP", page: null, samples: 12, p75: 180, since: "2026-09-26T00:00:00Z" }]),
  );
  const out = await overview.GET.run(new Request("http://localhost/api/v1/platform/overview"), ctxFor(session));
  assert.deepEqual(out.vitals, [{ metric: "INP", page: null, samples: 12, p75: 180 }]);
  assert.equal(out.health.backlog, 0);
  setServiceClient(service(raise("57014", "canceling statement due to statement timeout")));
  const down = await overview.GET.run(new Request("http://localhost/api/v1/platform/overview"), ctxFor(session));
  assert.equal(down.vitals, null, "unread, said as unread");
  assert.deepEqual(down.tenants, []);
  assert.equal(down.health.backlog, 0);
});

test("the collector: the latest of each of the five, sent once at each value, in the order the card says them", () => {
  const sent = [];
  const fd = createFieldData("inbox", (body) => sent.push(body));
  fd.flush();
  assert.deepEqual(sent, [], "nothing reported, nothing sent");
  fd.note(load(1, "TTFB", 180));
  fd.note(load(2, "LCP", 2400));
  fd.note(load(3, "FID", 12));
  fd.note(load(4, "Next.js-hydration", 300));
  fd.note(load(5, "LCP", -3));
  fd.note(load(6, "CLS", Number.NaN));
  fd.note({ id: "a b", name: "FCP", value: 900 });
  fd.flush();
  assert.deepEqual(sent, [{ page: "inbox", vitals: [load(2, "LCP", 2400), load(1, "TTFB", 180)] }]);
  fd.flush();
  assert.equal(sent.length, 1, "nothing new, nothing sent");
  // INP and CLS arrive when the page is hidden, and again if they grew: the grown one goes, under its own id.
  fd.note(load(7, "INP", 120));
  fd.note(load(8, "CLS", 0.01));
  fd.flush();
  fd.note(load(7, "INP", 320));
  fd.flush();
  assert.deepEqual(sent.slice(1), [
    { page: "inbox", vitals: [load(7, "INP", 120), load(8, "CLS", 0.01)] },
    { page: "inbox", vitals: [load(7, "INP", 320)] },
  ]);
  // A background tab's LCP past the ceiling is dropped here, so it never costs the load its other numbers.
  fd.note(load(9, "FCP", 600_001));
  fd.flush();
  assert.equal(sent.length, 3);
});

test("the collector sends when the page is hidden and as it leaves, and stops when unhooked", () => {
  const on = { doc: new Map(), win: new Map() };
  const target = (m) => ({
    addEventListener: (t, f) => m.set(t, f),
    removeEventListener: (t, f) => {
      if (m.get(t) === f) m.delete(t);
    },
  });
  const win = { ...target(on.win), document: { visibilityState: "visible", ...target(on.doc) } };
  let flushes = 0;
  const off = flushWhenHidden(win, { note() {}, flush: () => (flushes += 1) });
  on.doc.get("visibilitychange")();
  assert.equal(flushes, 0, "shown again is not put away");
  win.document.visibilityState = "hidden";
  on.doc.get("visibilitychange")();
  on.win.get("pagehide")();
  assert.equal(flushes, 2);
  off();
  assert.equal(on.doc.size + on.win.size, 0);
});

test("the beacon goes to the route as JSON, and a browser that will not queue it loses a number, not the page", async () => {
  const queued = [];
  beaconTo({ sendBeacon: (url, blob) => queued.push({ url, blob }) })({ page: "today", vitals: [load(1, "FCP", 640)] });
  assert.equal(queued[0].url, "/api/v1/vitals");
  assert.equal(queued[0].blob.type, "application/json");
  assert.deepEqual(JSON.parse(await queued[0].blob.text()), { page: "today", vitals: [load(1, "FCP", 640)] });
  beaconTo({
    sendBeacon: () => {
      throw new TypeError("Illegal invocation");
    },
  })({ page: "today", vitals: [load(1, "FCP", 640)] });
  beaconTo(undefined)({ page: "today", vitals: [load(1, "FCP", 640)] });
  beaconTo({})({ page: "today", vitals: [load(1, "FCP", 640)] });
});

test("the words: a value as a person reads it, and each verdict on web.dev's thresholds at the 75th percentile", () => {
  assert.equal(vitalValueWords("INP", 180.4), "180 ms");
  assert.equal(vitalValueWords("LCP", 2449), "2.4 s");
  assert.equal(vitalValueWords("CLS", 0.034), "0.03");
  assert.equal(vitalVerdict("LCP", 2500), "good");
  assert.equal(vitalVerdict("LCP", 2501), "needs work");
  assert.equal(vitalVerdict("LCP", 4001), "poor");
  assert.equal(vitalVerdict("INP", 200), "good");
  assert.equal(vitalVerdict("INP", 501), "poor");
  assert.equal(vitalVerdict("CLS", 0.1), "good");
  assert.equal(vitalVerdict("CLS", 0.2), "needs work");
});

test("the card: unread says so, a quiet week says so, and a week of loads is a sentence, a line each and the slowest pages", () => {
  assert.deepEqual(pageVitalsWords(null), {
    sentence: "Page timings could not be read just now.",
    lines: [],
    pages: [],
  });
  assert.deepEqual(pageVitalsWords([]), {
    sentence: "No page has sent its timings in the last 7 days.",
    lines: [],
    pages: [],
  });
  const row = (metric, page, samples, p75) => ({ metric, page, samples, p75 });
  const vm = pageVitalsWords([
    row("CLS", null, 812, 0.02),
    row("FCP", null, 812, 1200),
    row("INP", null, 640, 180),
    row("LCP", null, 812, 2400),
    row("TTFB", null, 812, 420),
    row("LCP", "inbox", 300, 3100),
    row("INP", "inbox", 280, 240),
    row("LCP", "today", 480, 2100),
    row("LCP", "clients", PAGE_VITALS_MIN_LOADS - 1, 9000),
    row("LCP", "leads", PAGE_VITALS_MIN_LOADS, 2100),
  ]);
  assert.equal(
    vm.sentence,
    "Of 812 page loads in the last 7 days, three in four drew the page within 2.4 s and answered a tap within 180 ms.",
  );
  assert.deepEqual(
    vm.lines.map((l) => [l.label, l.hint, l.tone]),
    [
      ["Drawn (LCP)", "2.4 s · good · 812 loads", "ok"],
      ["Answers a tap (INP)", "180 ms · good · 640 loads with a tap", "ok"],
      ["Holds still (CLS)", "0.02 · good · 812 loads", "ok"],
      ["First paint (FCP)", "1.2 s · good · 812 loads", "ok"],
      ["First byte (TTFB)", "420 ms · good · 812 loads", "ok"],
    ],
  );
  assert.deepEqual(
    vm.pages.map((p) => [p.page, p.hint]),
    [
      ["inbox", "Drawn within 3.1 s, a tap answered within 240 ms · 300 loads"],
      ["leads", "Drawn within 2.1 s · 20 loads"],
      ["today", "Drawn within 2.1 s · 480 loads"],
    ],
    "slowest first, a tie by name, and a page with fewer loads than it takes to say something left out",
  );
  const slow = pageVitalsWords([row("LCP", null, 1, 4200), row("TTFB", null, 1, 2000)]);
  assert.equal(slow.sentence, "Of 1 page load in the last 7 days, three in four drew the page within 4.2 s.");
  assert.deepEqual(
    slow.lines.map((l) => [l.verdict, l.tone]),
    [
      ["poor", "danger"],
      ["poor", "danger"],
    ],
  );
  const undrawn = pageVitalsWords([row("TTFB", null, 3, 500)]);
  assert.equal(undrawn.sentence, "3 page loads in the last 7 days; none has drawn its page yet.");
});
