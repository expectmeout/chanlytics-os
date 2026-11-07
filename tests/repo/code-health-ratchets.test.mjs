/**
 * What each measure the register holds means, kept honest on sources written for it.
 *
 * The numbers themselves are check:debt's (tooling/scripts/checks/debt.mjs, decision 0074): CI measures a change's base
 * and its head and holds the change to what it adds. What this file holds is that each measure counts what it says it
 * counts: the shell's JSX and the packages' TypeScript are read, the doors' trees are found, and each class guard counts
 * the marked lines of a fixture and nothing else. A measure that quietly read nothing would hold every number at zero.
 * The measures are defined in _measures.mjs; repo/measures.test.mjs holds more of their meaning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { BEHIND_THE_DOORS, ROUTES, lineMapOf, suiteFiles, testLength } from "../_measures.mjs";
import { ROOT } from "../_source.mjs";
import {
  parse,
  functionsIn,
  durationsIn,
  zonelessDatesIn,
  zoneReadersIn,
  seedReadsOutsideADemo,
  needsHumanReads,
  resumesUnasked,
  linesOf,
  fixedWaitsIn,
  droppedDbErrorsIn,
  quarantinesIn,
} from "../_ast.mjs";

// The measure the limits above rest on, kept honest: if the compiler ever stops
// parsing the pages' JSX, the numbers would quietly drop to zero and every ratchet
// would pass. This is the assertion that says so instead.
test("the measure sees a page's JSX and the packages' TypeScript", () => {
  // Ask's answer, TSX since decision 0015's step 12, as the last of the shell's pages left it.
  const shell = functionsIn(parse("apps/dashboard/src/surfaces/ask/turn.tsx"));
  const core = functionsIn(parse("packages/core/src/deliver/deliver.ts"));
  assert.ok(shell.length > 10, "the shell's page parsed as JSX and its functions were found");
  assert.ok(
    shell.some((fn) => fn.branches > 10),
    "a JSX conditional counts as a branch",
  );
  assert.ok(core.length > 5, "core parsed as TypeScript");
});

// The doors' measure, kept honest the same way: if the route trees stopped being read (a moved folder, a changed
// pattern), the number would fall to zero and the ratchet would pass. The doors reached zero on 30 September 2026
// (the thin-doors lane: the edge's, then the dashboard's), so the guard is no longer an offender the measure finds
// but the routes it reads: every route of each tree.
test("the doors' measure reads the edge's doors and the dashboard's routes", () => {
  assert.ok(
    ROUTES.filter((f) => f.startsWith("apps/edge/api/")).length >= 40,
    "the doors of the edge are read (every route under apps/edge/api)",
  );
  assert.ok(
    ROUTES.filter((f) => f.startsWith("apps/dashboard/app/api/")).length >= 80,
    "the routes of the dashboard are read (every route under apps/dashboard/app/api)",
  );
});

// The seed measure on a module written for it (the wiring's second audit, X6-3): each line marked `yes` reads a demo's seeds
// in a real session once per mark, and nothing else in it does: a read under a demo's condition (either side of a negation, an
// `&&`, an `if`, after a guard that leaves outside a demo), a type, a property's own name, a module that is no seed.
test("the seed measure counts a demo's seeds read outside a demo and nothing else", () => {
  const lines = [
    'import { inboxSample, peopleSample as people } from "./sample";',
    'import { NEEDING_YOU } from "../inbox/sample/threads-needing-you";',
    'import { EXAMPLE_READS } from "./examples";',
    'import { DEMO_ADS } from "../demo-ads";',
    'import { accountChecks } from "./ad-accounts-mock";',
    'import type { SampleDay } from "./sample-clock";',
    'import { realRows } from "./rows";',
    "export const seeded = inboxSample; // yes",
    "export const both = [people, NEEDING_YOU]; // yes yes",
    "export const shown = { EXAMPLE_READS }; // yes",
    "export const checks = (p) => accountChecks(p); // yes",
    "export const cut = demoSession() ? DEMO_ADS : realRows();",
    "export const kept = !demoSession() ? realRows() : people;",
    "export const wrong = !demoSession() ? people : realRows(); // yes",
    "export const flag = (demo) => demo && people;",
    "export const either = (s) => !window.__DEMO_MODE || inboxSample;",
    "export function read() { if (isDemoSession()) return people; return realRows(); }",
    "export function guarded(id) { if (!demoSession() || id === null) return null; return NEEDING_YOU[0]; }",
    "export function late(id) { if (id === null) return null; return NEEDING_YOU[0]; } // yes",
    "export const day = (d: SampleDay) => d;",
    "export const named = { inboxSample: 1 }.inboxSample;",
    "export const rows = realRows();",
  ];
  const sf = ts.createSourceFile(
    "surfaces/x/page.ts",
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const marked = lines.reduce((n, l) => n + (l.match(/\byes\b/g) ?? []).length, 0);
  assert.equal(seedReadsOutsideADemo(sf), marked);
  const seed = ts.createSourceFile(
    "surfaces/x/sample.ts",
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(seedReadsOutsideADemo(seed), 0, "a seed module's own reads are its own");
});

/** A fixture's syntax tree, named as the file it stands for (a measure reads the name: a seed module, the standing rule). */
const fixture = (file, lines) =>
  ts.createSourceFile(
    file,
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
const marks = (lines) => lines.reduce((n, l) => n + (l.match(/\byes\b/g) ?? []).length, 0);

// S9-1's class guard on a module written for it: each line marked `yes` compares the raw state once per mark, and nothing
// else does: a write of the state, a type, a word in a sentence, another state compared.
test("the needs_human measure counts comparisons with the raw state and nothing else", () => {
  const lines = [
    'const waits = rows.filter((r) => r.state === "needs_human"); // yes',
    'if ("needs_human" !== c.state) skip(); // yes',
    'switch (t.state) { case "needs_human": return true; } // yes',
    'const q = db.from("conversations").eq("state", "needs_human"); // yes',
    'const any = ["needs_human", "snoozed"].includes(s); // yes',
    'const flagged = new Set(["needs_human"]); const ok = flagged.has(s);',
    'const moved = { state: "needs_human", paused_until: until };',
    'type State = "open" | "needs_human";',
    'const said = "needs_human means a person was asked for";',
    'const open = rows.filter((r) => r.state === "open");',
    "const human = r.needs_human;",
  ];
  assert.equal(needsHumanReads(fixture("apps/dashboard/src/server/x.ts", lines)), marks(lines));
  for (const own of [
    "packages/contracts/src/conversations/standing.ts",
    "apps/dashboard/src/surfaces/people/sample.ts",
  ])
    assert.equal(needsHumanReads(fixture(own, lines)), 0, `${own}: the rule's own, or a demo's seeds`);
});

// S9-2's class guard on modules written for it: a Resume sent on one tap counts; one sent from the question, or behind a
// Resume act already answered (the Campaigns home's runner), does not; nor does another verb's resume.
test("the resume measure counts a campaign's or a reach-out's Resume sent where nothing asks", () => {
  const head = [
    'import { playbooks as V } from "../playbooks/verbs";',
    'import { reachOuts } from "../../campaigns/reach-out/surface";',
    'import { verbs as ads } from "../ads/verbs";',
  ];
  const body = [
    "const tap = () => V.resume(id); // yes",
    "const R = reachOuts;",
    "const chain = () => R.resume(root); // yes",
    "const toggle = () => (paused ? reachOuts.resume(root) : reachOuts.pause(root)); // yes",
    "const ad = () => ads.resume(adId);",
    "const answered = (act) => { if (act.kind === 'resume') return V.resume(act.playbookId); };",
    "const run = async (id) => { await V.resume(id); };",
    "const onAct = (act) => { if (act.kind === 'open') go(); else if (act.kind === 'resume') void run(act.playbookId); };",
    "const unanswered = async (id) => { await V.resume(id); }; // yes",
    "const press = () => void unanswered(id);",
  ];
  const lines = [...head, ...body];
  assert.equal(resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", lines)), marks(lines));
  const asks = ['import { ResumeAct } from "../campaigns/home/resume-act";', ...lines];
  assert.equal(
    resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", asks)),
    0,
    "a module that draws the question",
  );
  assert.equal(resumesUnasked(fixture("apps/dashboard/src/surfaces/x/page.tsx", body)), 0, "no verbs of a campaign's");
});

// The duration measure on a module written for it: each line marked `yes` holds one length of time written as a
// bare number per mark, and nothing else in it is one: a count, a size, seconds, metres, a change of unit, a nudge,
// an index, a zero delay, or a minute already named. A name without its unit hides no length of time (LEASE,
// TIMEOUT, WINDOW), and a name that says another unit keeps a round number out (metres, characters, tokens).
test("the duration measure counts lengths of time and nothing else", () => {
  const lines = [
    "setTimeout(go, 800); // yes",
    "setInterval(tick, 15 * 60 * 1000); // yes",
    "fetch(u, { signal: AbortSignal.timeout(8_000) }); // yes",
    "new Client({ timeout: 20_000, retries: 2 }); // yes",
    "AbortSignal.timeout(Math.max(500, Math.min(left, 5_000))); // yes yes",
    "setTimeout(go, o.debounceMs ?? 400); // yes",
    "const LEASE_MS = 5 * 60_000; // yes",
    "const TTL_MS = 300_000; // yes",
    "const since = Date.now() - days * 86_400_000; // yes",
    "const minutes = Math.round((Date.now() - at.getTime()) / 60000); // yes",
    "const pause = hours * 3600 * 1000; // yes",
    "const waits = [2 * 60_000, 10 * 60_000]; // yes yes",
    "const deadline = now + 50_000; // yes",
    "const left = budgetMs - 8_000; // yes",
    "const rule = { reply_delay_ms: z.number().max(600000) }; // yes",
    "const LEASE = 5 * 60 * 1000; // yes",
    "const TIMEOUT = 300_000; // yes",
    "const WINDOW = 3_600_000; // yes",
    "setTimeout(go, 0);",
    "setTimeout(go, RETRY_MS);",
    "const RETRY_MS = 800;",
    "const NAMED_MS = 5 * MIN_MS;",
    "const RADIUS_MAX_M = 60_000;",
    "const TAB_TOTAL_CHARS = 600_000;",
    "const ASK_TOKENS_DAY = 1_500_000;",
    "const limits = { radiusM: 60 * 1000 };",
    "const PAGE = 1000;",
    "const s = Math.floor(Date.now() / 1000);",
    "const ms = seconds * 1000;",
    "const A_DAY_S = 24 * 60 * 60;",
    "const pin = 100000 + (n % 900000);",
    "AbortSignal.timeout(limits[2]);",
    "const end = at + 1;",
  ];
  const sf = ts.createSourceFile("fixture.ts", lines.join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(
    durationsIn(sf).map((d) => d.line),
    marked,
  );
});

// The zone measure on a module written for it: each line marked `yes` says one date with no zone, and nothing else in
// it is one: a formatter that names its zone, the runtime's zone asked for, a number's own locale string, and options
// the tree cannot read. A miss here would hold every page's dates at zero while they were said in the browser's zone.
test("the zone measure counts dates said with no zone and nothing else", () => {
  const lines = [
    'const DAY = formatterOnUse("en-US", { month: "short", day: "numeric" }); // yes',
    'const WHEN = formatterOnUse([], { hour: "numeric" }); // yes',
    'new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(at); // yes',
    "Intl.DateTimeFormat([]).format(at); // yes",
    "new Intl.DateTimeFormat().format(at); // yes",
    'new Date(at).toLocaleDateString("en-US", { month: "short" }); // yes',
    "d.toLocaleTimeString(); // yes",
    "new Date(at).toLocaleString(); // yes",
    '(new Date(at)).toLocaleString("en-US"); // yes',
    'when.toLocaleString("en-US", { month: "short", day: "numeric" }); // yes',
    'const OK = formatterOnUse("en-US", { timeZone: "UTC", month: "short" });',
    'new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric" }).format(at);',
    'new Intl.DateTimeFormat("en-US", { "timeZone": tz });',
    "const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;",
    "const here = new Intl.DateTimeFormat().resolvedOptions().timeZone;",
    'd.toLocaleDateString("en-US", { timeZone: tz, month: "short" });',
    'dateFormat("en-US", { timeZone: tz, month: "short" }).format(at);',
    "n.toLocaleString();",
    'total.toLocaleString("en-US", { maximumFractionDigits: 0 });',
    'new Intl.DateTimeFormat("en-US", OPTIONS).format(at);',
    'new Intl.DateTimeFormat("en-US", { ...base, hour: "numeric" }).format(at);',
    'new Intl.NumberFormat("en-US").format(n);',
  ];
  const sf = ts.createSourceFile("fixture.ts", lines.join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(
    zonelessDatesIn(sf).map((d) => d.line),
    marked,
  );
  // And on the tree: the mailbox card said its hold's day in the browser's zone until 29 October 2026, and says none now.
  assert.deepEqual(zonelessDatesIn(parse("packages/contracts/src/email/mailbox-connections/rows.ts")), []);
  // And the six sites it held at 29 October 2026 are two (the partner's own day, the paused phone app's widget): the
  // trial's end on the bell and in Billing, the runtime's own DATE_FMT, and a campaign's last send take the zone.
  for (const f of [
    "packages/contracts/src/workspace/billing/plans.ts",
    "apps/edge/lib/billing/notices.ts",
    "packages/contracts/src/shared/time.ts",
    "packages/contracts/src/reports/campaign-report.ts",
  ])
    assert.deepEqual(zonelessDatesIn(parse(f)), [], f);
});

// The zone-readers measure on a module written for it: each line marked `yes` reads a zone itself, where zone-math is
// the one reading of a zone. A number's parts, a zoned formatter's words and zone-math's own functions are not one.
test("the zone-readers measure counts a zone read outside zone-math and nothing else", () => {
  const lines = [
    'const p = dateFormat("en-US", { timeZone: tz, hour: "numeric" }).formatToParts(at); // yes',
    "for (const x of f.formatToParts(now)) parts[x.type] = x.value; // yes",
    'new Intl.DateTimeFormat("en-US", { timeZone: tz }).formatToParts(ms); // yes',
    'const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(at); // yes',
    'const key = dateFormat("en-CA", { timeZone: tz, month: "2-digit" }).format(at); // yes',
    'const iso = formatterOnUse("sv-SE", { year: "numeric" }); // yes',
    'numberFormat("en-US", { style: "currency", currency }).formatToParts(n);',
    'new Intl.NumberFormat("en-US").formatToParts(n);',
    'dateFormat("en-US", { timeZone: tz, month: "short" }).format(at);',
    "const day = dayInZone(tz, at).key;",
    "const { hh, mm } = clockInZone(tz, at);",
    "const p = zoneParts(usableZone(tz), at);",
    'const label = "en-CA";',
  ];
  const sf = ts.createSourceFile("fixture.ts", lines.join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(
    zoneReadersIn(sf).map((d) => d.line),
    marked,
  );
  assert.equal(zoneReadersIn(parse("packages/contracts/src/shared/zone/math.ts")).length, 1, "the one reading itself");
  assert.deepEqual(zoneReadersIn(parse("packages/contracts/src/shared/clock.ts")), [], "the words read through it");
});

// The length measure, kept honest: it counts what the file-length measure counts over a parse, whatever a file's last
// line and line endings. That each of the launcher's globs lists something is checked where the listing is made.
test("the test-length measure counts a file's lines as file-length does, over the suite's test files", () => {
  const SUITE_FILES = suiteFiles();
  for (const text of ["", "a", "a\n", "a\nb", "a\nb\n", "a\n\n", "a\r\nb\r\n", "a\r\nb", "a\rb"]) {
    const sf = ts.createSourceFile("fixture.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    assert.equal(linesOf(lineMapOf(text)), linesOf(sf), JSON.stringify(text));
  }
  const self = path
    .relative(ROOT, fileURLToPath(import.meta.url))
    .split(path.sep)
    .join("/");
  assert.equal(testLength(self), linesOf(parse(self)), "this file, by its line map and by its parse");
  assert.ok(SUITE_FILES.includes(self), "this file is one of the suite's");
  assert.deepEqual(
    SUITE_FILES.filter((f) => !f.endsWith(".test.mjs")),
    [],
    "only test files",
  );
});

// The counted-waits measure on a test file written for it: each line marked `yes` waits a fixed count of turns or a fixed
// time, by a turn written out, a helper of the file's own, or one a module beside it exports (named, as a namespace, or
// loaded by `await import`), once however often its loop turns. A wait bounded by time, a microtask's hop, a mocked
// clock and a name that shadows a helper are none. A miss would let a new count of turns in unseen.
test("the counted-waits measure counts waits of a fixed count of turns or time, and nothing else", () => {
  const lines = [
    'import { settle } from "../_stub-react.mjs";',
    'import * as LR from "../_stub-react.mjs";',
    'import { until } from "../shared/_until.mjs";',
    "const tick = () => new Promise((r) => setTimeout(r, 0));",
    "const turn = () => new Promise((go) => setImmediate(go));",
    "const sleep = (ms) => new Promise((r) => setTimeout(() => r(), ms));",
    "const many = async (n = 8) => { for (let i = 0; i < n; i += 1) await tick(); };",
    "const idle = async () => { for (let i = 0; i < 200 && pending > 0; i += 1) await turn(); await turn(); };",
    "const looked = async (cond) => { for (const from = Date.now(); !cond() && Date.now() - from < 5000; ) await tick(); };",
    "const flush = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };",
    "const open = async () => { draw(); await many(); return draw(); }; // yes",
    'const L = await import("../_stub-react.mjs");',
    'const { settle: s } = await import("../_stub-react.mjs");',
    "await tick(); // yes",
    "await turn(); // yes",
    "await sleep(260); // yes",
    "await many(); // yes",
    "await idle(); // yes",
    "await settle(); // yes",
    "await LR.settle(); // yes",
    "await L.settle(); // yes",
    "await s(); // yes",
    "for (let i = 0; i < 12; i += 1) await settle(); // yes",
    "for (let i = 0; i < 400 && !done; i += 1) await new Promise((r) => setImmediate(r)); // yes",
    "await new Promise((resolve) => setTimeout(resolve, 20)); // yes",
    'await until(() => done, "done");',
    "await looked(() => done);",
    "for (const from = Date.now(); !done && Date.now() - from < 5000; ) await tick();",
    "await flush();",
    "await open();",
    "await Promise.resolve();",
    "await new Promise((r) => queueMicrotask(r));",
    "t.mock.timers.tick(100);",
    "{ const settle = (C) => draw(C); await settle(1); }",
  ];
  const sf = ts.createSourceFile(
    "tests/repo/fixture.test.mjs",
    lines.join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(
    fixedWaitsIn(sf).map((w) => w.line),
    marked,
  );
});

test("e2e-quarantine counts a test.fixme that says quarantine, per file, and no other skip", () => {
  const sf = ts.createSourceFile(
    "a.spec.ts",
    [
      'test("one", () => { test.fixme(true, "quarantine: 2026-11-07 why"); });',
      'test("two", () => { test.fixme(true, `quarantine: 2026-11-07 why`); });',
      'test("skipped", () => { test.skip(true, "quarantine: 2026-11-07 a skip is no quarantine"); });',
      'test("fixme", () => { test.fixme(true, "later"); });',
    ].join("\n"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(quarantinesIn(sf), 2);
});

// The dropped-error measure on a module written for it. supabase-js answers a failed statement with `{ error }` and never
// throws, so each line marked `yes` leaves a failed statement looking like a done write or an empty read: a write or an
// rpc awaited with its result unread; a destructure that leaves `error` out, out of a `Promise.all` too; `(await …).data`;
// and a result held by a name that is read field by field and never for `.error`. Everything else here has the error in
// hand, hands the result or the statement on to what reads it, or is no statement on the database.
test("the dropped-error measure counts a database result whose error nobody can read, and nothing else", () => {
  const lines = [
    "async function all() {",
    'await db.from("lines").update({ a: 1 }).eq("id", id); // yes',
    'await tenantDb(db, t).from("lines").insert({ a: 1 }); // yes',
    'await c.db.from("lines").upsert(row, { onConflict: "id" }).select("id"); // yes',
    'if (gone) await db.from("lines").delete().eq("id", id); // yes',
    'try { await db.from("lines").delete().eq("id", id); } catch { log(); } // yes',
    "await db // yes",
    '  .from("lines")',
    "  .delete();",
    'await db.rpc("drop_it", { p: 1 }); // yes',
    'await rpc("drop_it"); // yes',
    'await (db as never).rpc("drop_it" as never); // yes',
    "await Promise.all([",
    '  db.from("lines").update({ a: 1 }), // yes',
    '  db.rpc("drop_it"), // yes',
    '  db.from("lines").select("id"),',
    '  db.from("lines").update({ a: 1 }).then(check),',
    "  emit(),",
    "]);",
    'await Promise.allSettled([db.from("lines").delete().eq("id", 1)]); // yes',
    'const { data } = await db.from("lines").select("id").maybeSingle(); // yes',
    'const { data: row } = await db.from("lines").select("id").single(); // yes',
    'const { data: n } = await db.rpc("count_it"); // yes',
    'const { count } = await db.from("lines").select("*", { count: "exact", head: true }); // yes',
    'const { data: back } = (await db.from("lines").update({ a: 1 }).select()) as Row; // yes',
    'const { data: d1, error } = await db.from("lines").select("id");',
    'const { data: d2, error: e2 } = await db.rpc("count_it");',
    'const { error: e3 } = await db.from("lines").update({ a: 1 });',
    'const res = await db.from("lines").update({ a: 1 }); // yes',
    'const held = await db.from("lines").select("id").single(); // yes',
    "use(held.data);",
    'const ran = await db.rpc("count_it"); // yes',
    "use(ran.data, ran.count);",
    'const cast = await db.from("lines").select("id"); // yes',
    "use((cast as Row).data, cast!.count);",
    'const seen = await db.from("lines").select("id");',
    "if (seen.error) throw seen.error;",
    'const asked = await db.rpc("count_it");',
    "use(asked.error?.message, (asked as Row).data);",
    'const passed = await db.from("lines").select("id");',
    "check(passed);",
    'const within = await db.from("lines").select("id");',
    "use(within.data, { within });",
    'const later = await db.from("lines").select("id");',
    "const { data: d8, error: e8 } = later;",
    'const thrown = await db.from("lines").select("id").throwOnError();',
    "use(thrown.data);",
    "const other = await listed();",
    "use(other.data);",
    'const shadowed = await db.from("lines").select("id"); // yes',
    "use(shadowed.data, list.map((shadowed) => shadowed.error), { shadowed: 1 }.shadowed, you.shadowed);",
    'const over = await db.from("lines").select("id"); // yes',
    "use(over.data);",
    "{ const over = await listed(); use(over.error); }",
    'const under = await db.from("lines").select("id");',
    "if (under.error) log();",
    "{ const under = await listed(); use(under.data); }",
    "const [",
    "  { data: a1 }, // yes",
    "  { data: a2, error: a3 },",
    "  a4, // yes",
    "  ,",
    "  a5,",
    "  { data: a6 },",
    "  a7, // yes",
    "] = await Promise.all([",
    '  db.from("lines").select("id"),',
    '  db.from("lines").select("id"),',
    '  db.rpc("count_it"),',
    "  skipped(),",
    '  db.from("lines").select("id"),',
    "  listed(),",
    '  db.from("lines").select("id"),',
    "]);",
    "use(a4.data, a5.error);",
    'const [{ data: b1 }, { data: b2 }] = await Promise.all([db.from("lines").select("id"), db.rpc("count_it")]); // yes yes',
    'const [{ data: b3, error: b4 }] = await Promise.allSettled([db.from("lines").select("id")]);',
    "const [x1, x2] = await listed();",
    'const [x3, x4] = await Promise.all([db.from("lines").select("id").then(check)]);',
    'const c1 = (await db.from("lines").select("id")).data; // yes',
    'use((await db.rpc("count_it")).data ?? []); // yes',
    'const c2 = (await db.from("lines").select("id")).error;',
    "const c3 = (await listed()).data;",
    'const c4 = (await db.rpc("count_it").then(check)).data;',
    'const both = await Promise.all([db.from("lines").update({ a: 1 })]);',
    'await db.from("lines").update({ a: 1 }).throwOnError();',
    'const { data: d3 } = await db.from("lines").select("id").throwOnError();',
    'await db.from("lines").update({ a: 1 }).then(check);',
    'await db.rpc("drop_it").then(check).catch(log);',
    'await db.rpc("drop_it").catch(log);',
    'const { data: d4 } = await db.from("lines").select("id").then(check);',
    'await teamCall(db.rpc("team_leave"), "leave");',
    'await retry(() => db.from("lines").update({ a: 1 }));',
    'const { data: d5 } = await fetchIt(db.from("lines"));',
    'await db.from("lines").select("id");',
    'await cache.delete("key");',
    "await saved.update({ a: 1 });",
    "const { data: d6 } = await Array.from(list).pop();",
    'const { rows } = await pool.query("select 1");',
    "for (const { data: d7 } of await listed()) use(d7);",
    'return db.from("lines").update({ a: 1 });',
    "}",
  ];
  const marked = lines.flatMap((l, i) => (l.match(/\byes\b/g) ?? []).map(() => i + 1));
  assert.deepEqual(droppedDbErrorsIn(fixture("apps/edge/lib/x.ts", lines)), marked);
});

// A measure that quietly read nothing would hold every number at zero: each tree is read, and what never runs is not.
test("the dropped-error measure reads every tree behind the doors, and no test", () => {
  for (const [tree, least] of [
    ["apps/edge/api/", 40],
    ["apps/edge/lib/", 100],
    ["apps/dashboard/app/api/", 80],
    ["apps/dashboard/src/server/", 100],
    ["packages/core/src/", 50],
    ["packages/db/src/", 50],
    ["packages/jobs/src/", 5],
    ["packages/channels/src/", 30],
  ])
    assert.ok(BEHIND_THE_DOORS.filter((f) => f.startsWith(tree)).length >= least, `${tree} is read`);
  assert.deepEqual(
    BEHIND_THE_DOORS.filter((f) => /(^|\/)test\/|\.test\.|\.type-test\./.test(f)),
    [],
  );
});
