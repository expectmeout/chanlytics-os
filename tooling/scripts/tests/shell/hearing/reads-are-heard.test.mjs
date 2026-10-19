/**
 * A page hears every record it draws, and a write tells every page that draws what it changes (decision 0047, point 4; the
 * coverage test the 4 October Campaigns wiring review decided, its lane W3; wiring plan task 3.2).
 *
 * Four lists were kept by hand and nothing tied them together: what a surface reads, the kinds it declares (and so the tables it
 * hears), what each write changes, and the surfaces the refresh map re-reads after it. Four times a reader began to draw a record
 * and the lists fell behind (#1399, #1417, #1423, #1551). The tracer (tooling/scripts/trace-routes.mjs, ported from the Wiring
 * Blueprint's; a-route-is-followed-to-its-tables.test.mjs holds it to its word) follows every route of the dashboard to the tables
 * it reads and writes, the writes with the event each makes; the surfaces are the ones LegacyApp.tsx registers, from the modules it
 * imports them from, run as they are.
 *
 *  1. Reads are heard. The tables a surface's GET routes read must be ones it hears, or be listed in baselines/reads-not-heard.json
 *     with why. An `omit` covers nothing (the wiring's second audit, S3-8): a table a surface's own routes read and its omit leaves
 *     out is a read nobody tells it of, as eleven were. The baseline may only fall: a read nobody listed is a red build, and one that
 *     is heard now must leave the file (UPDATE_BASELINES=1 banks the fall). Each group says what kind of exception it is (KINDS),
 *     and what it claims is checked: the tables each kind may hold, the writes whose rows re-read the surface (`rereadAfter`), the
 *     tables it hears that read it again (`heardWith`), the surfaces that hear it on its page and read that page again (`heardBy`),
 *     the field an over-read feeds that the surface never reads (`field`), the finding an owed read waits on (`finding`). The owed
 *     pairs are counted in the file, and the count may only fall.
 *  2. Writes tell. A surface learns of a write one of two ways: the refresh map names it (or forgets what it holds, for a lens read
 *     where it is drawn), or the feed tells it of every table the write changes that it draws, by the event the write makes. Run
 *     on every write the map decides, AFTER and REFRESHES_NOTHING alike, over the dashboard's own code; a surface left neither way
 *     fails unless the write is listed below with why. (A strict reading, that every row names every surface that draws what its
 *     write changes, would list a surface for each notice the feed already carries: the own-change read, task 2.3, drops the second
 *     read of a change the first one carried.)
 *  3. Rows read what they can change. A surface a row re-reads must read a table the write changes, through the dashboard or the
 *     edge door it asks. A read for nothing is a request a reply pays for: the 12 of F10a's 77 pairs were this.
 *
 * Both lists below may only fall: an entry the code no longer needs fails, and is deleted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, importSrc, stripComments } from "../../_source.mjs";
import { BANK, BANK_HINT, BASELINES_DIR, RAISE, readBaseline, writeBaseline } from "../../_ratchet.mjs";
import {
  PLUMBING,
  getsOfFile,
  readsOf,
  registeredSurfaces,
  traceRoutes,
  unheardReads,
  untoldWrites,
} from "./_reads.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/inbox" };
globalThis.document ??= { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} };
globalThis.window.dispatchEvent ??= () => true;
globalThis.window.addEventListener ??= () => {};
globalThis.window.removeEventListener ??= () => {};
globalThis.CustomEvent ??= class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "A", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

const { liveTablesOf } = await importSrc("packages/contracts/src/activity/record-kinds.ts");
const { watchedEvents, watchedTables } = await importSrc("packages/db/src/realtime.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { AFTER, REFRESHES_NOTHING } = await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts");
const { PAGE_HEARS, PERSON_ROUTE } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { setSurfaceValue, surfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");

/** Every surface the shell registers (LegacyApp.tsx), with the module that holds its override, as the shell imports it. */
const SURFACES = registeredSurfaces();

const { routes, tables } = traceRoutes();
const told = Object.fromEntries(watchedEvents().map((w) => [w.table, w.events]));
const overrides = new Map();
const surfaces = [];
for (const { name, file } of SURFACES) {
  assert.ok(file, `${name}: the shell lists it, and the module it is imported from is not found`);
  const override = (await importSrc(file))[name];
  assert.ok(override?.key, `${name}: ${file} exports no override by that name`);
  overrides.set(override.key, override);
  surfaces.push({
    key: override.key,
    name,
    file,
    reads: override.reads,
    fresh: override.fresh,
    omit: override.omit,
    refreshOnTables: override.refreshOnTables,
    gets: getsOfFile(file),
  });
}

/** The pages a write is asked from, so that a lens read where it is drawn is met on its own page. */
const PAGES = [
  "today",
  "inbox",
  "reports",
  "reports/receptionist",
  "reports/people",
  "reports/campaigns",
  "reports/reviews",
  "campaigns",
  // Campaigns' composer, where Campaigns' own 30 days and the playbooks' moments are drawn: its landing is Sequences' list.
  "campaigns/new",
  "campaigns/sequences",
  "clients",
  "calendar",
  "live",
  "admin/profile",
];
/** The surfaces a write's row names, from any of the pages above: re-read where drawn, forgotten (and so owed a read) elsewhere. */
function rereadsOf(write) {
  const keys = new Set();
  const was = globalThis.location.hash;
  try {
    for (const page of PAGES) {
      globalThis.location.hash = `#/${page}`;
      for (const o of AFTER[write]()) keys.add(o.key);
    }
  } finally {
    globalThis.location.hash = was;
  }
  return keys;
}

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 1. Reads are heard                                                                                                       *
 * ------------------------------------------------------------------------------------------------------------------------ */

const FILE = "reads-not-heard.json";
/** Every read no declared kind covers, as "surface table", with where the trace met it. */
const unheard = new Map();
for (const s of surfaces)
  for (const [table, via] of unheardReads(s, routes, liveTablesOf)) unheard.set(`${s.key} ${table}`, via);

/** The baseline's pairs, each with its reason. */
function pairsOf(baseline) {
  const pairs = new Map();
  for (const group of baseline?.groups ?? [])
    for (const [surface, list] of Object.entries(group.reads))
      for (const table of list) pairs.set(`${surface} ${table}`, group.why);
  return pairs;
}

/** The pairs of the groups that are owed, the number the file holds and that may only fall. */
const owedPairs = (groups) =>
  groups.filter((g) => g.kind === "owed").reduce((n, g) => n + Object.values(g.reads).flat().length, 0);

/** A claim keyed by surface (`rereadAfter`, `heardWith`, `heardBy`), kept for the surfaces the group still holds; absent when none is left. */
const keptFor = (claim, reads) => {
  if (!claim) return undefined;
  const kept = Object.fromEntries(Object.entries(claim).filter(([surface]) => surface in reads));
  return Object.keys(kept).length ? kept : undefined;
};

if (BANK) {
  // What fell is banked, and nothing else: a pair that is heard now leaves its group, a group left with none goes, and the count of
  // owed pairs falls with them. What a group claims stays, for the surfaces it still holds.
  const was = readBaseline(FILE);
  if (was) {
    const groups = was.groups
      .map(({ rereadAfter: after, heardWith: with_, heardBy: by, ...group }) => {
        const reads = Object.fromEntries(
          Object.entries(group.reads)
            .map(([surface, list]) => [surface, list.filter((table) => unheard.has(`${surface} ${table}`))])
            .filter(([, list]) => list.length > 0),
        );
        const rereadAfter = keptFor(after, reads);
        const heardWith = keptFor(with_, reads);
        const heardBy = keptFor(by, reads);
        return {
          ...group,
          reads,
          ...(rereadAfter ? { rereadAfter } : {}),
          ...(heardWith ? { heardWith } : {}),
          ...(heardBy ? { heardBy } : {}),
        };
      })
      .filter((group) => Object.keys(group.reads).length > 0);
    writeBaseline(path.join(ROOT, BASELINES_DIR, FILE), {
      owed: RAISE ? owedPairs(groups) : Math.min(was.owed ?? 0, owedPairs(groups)),
      groups,
    });
  }
}
const baseline = readBaseline(FILE);
const held = pairsOf(baseline);

test("the surfaces read here are the ones the shell registers, one each, each from the module the shell imports it from", () => {
  assert.ok(SURFACES.length > 20, `the shell's list was read: ${SURFACES.length} surfaces`);
  assert.equal(new Set(surfaces.map((s) => s.key)).size, surfaces.length, "one surface a key");
  assert.equal(new Set(SURFACES.map((s) => s.name)).size, SURFACES.length, "one override a name");
});

test("every route a surface reads is one the trace follows, and every surface reads at least one", () => {
  for (const s of surfaces) {
    assert.ok(s.gets.length > 0, `${s.key} (${s.name}) names no GET route: say how it is read`);
    for (const get of s.gets) assert.ok(routes[get], `${s.key} reads ${get}, which is no route of the dashboard`);
  }
});

test("a surface reads no table its kinds do not cover and the baseline does not explain: nothing new goes unheard", () => {
  assert.ok(baseline, `${BASELINES_DIR}/${FILE} is missing`);
  const fresh = [...unheard].filter(([pair]) => !held.has(pair)).map(([pair, via]) => `${pair}  (${via})`);
  assert.deepEqual(
    fresh,
    [],
    "hear it: declare the kind of record in the surface's declareReads (or leave it out of the kind with `omit` and the reason); or, " +
      `for a table the feed does not tell a workspace of, list it in ${BASELINES_DIR}/${FILE} with why`,
  );
});

test("the baseline is not stale: a read that is heard now leaves it", () => {
  const stale = [...held.keys()].filter((pair) => !unheard.has(pair));
  assert.deepEqual(stale, [], `good, now bank it: ${BANK_HINT}`);
});

test("the baseline says why for every read, in groups that name surfaces and tables that exist", () => {
  assert.ok(baseline && Array.isArray(baseline.groups) && baseline.groups.length > 0);
  const known = new Set(surfaces.map((s) => s.key));
  const seen = new Set();
  for (const group of baseline.groups) {
    assert.ok(
      typeof group.why === "string" && group.why.trim().length >= 60,
      `a reason is a sentence: ${String(group.why).slice(0, 50)}`,
    );
    assert.ok(Object.keys(group.reads).length > 0, `${group.why.slice(0, 40)}: names no surface`);
    for (const [surface, list] of Object.entries(group.reads)) {
      assert.ok(known.has(surface), `${surface} is not a surface the shell registers`);
      assert.ok(list.length > 0, `${surface}: names no table`);
      for (const table of list) {
        assert.ok(tables.has(table), `${surface} ${table}: not a table of the schema`);
        assert.equal(PLUMBING.has(table), false, `${table} is the machinery's, and is not held`);
        assert.equal(seen.has(`${surface} ${table}`), false, `${surface} ${table} is listed twice`);
        seen.add(`${surface} ${table}`);
      }
    }
  }
});

/**
 * What kind of exception each group is (the wiring's second audit, S3-8, read on 12 October 2026: 148 of the 184 pairs then sat on
 * tables the feed carries, under reasons nothing checked, and six of the reasons were false):
 *  - `seat`: the caller's own seat, and what is private to them (their alerts, their marks and reads, their own name);
 *  - `account`: the workspace's own row and its plan, the partner's account, or (`of: "other workspaces"`) rows of the workspaces
 *    a partner brought, which this workspace's topic cannot carry, read only by a surface the feed tells nothing (`own-change`);
 *  - `unfed`: a table the feed does not tell a workspace of, with what reads it again (`rereadAfter`, `heardWith`) or the finding
 *    owed it;
 *  - `over-read`: a table the feed carries, read and not drawn (`field`, the DTO field it feeds, which the surface's own module
 *    never reads; null where it feeds nothing drawn), or drawn only as it rides with a table the surface hears (`heardWith`), or
 *    as another surface that hears it on this surface's page reads the page again (`heardBy`: People's read reloads a person's
 *    page, the Inbox's their thread);
 *  - `owed`: a table the feed carries, drawn and not heard: work not done, with the finding or the lane it waits on.
 */
const KINDS = ["seat", "account", "unfed", "over-read", "owed"];
const SEAT = new Set([
  "memberships",
  "profiles",
  "contact_marks",
  "contact_reads",
  "notification_marks",
  "notification_reads",
]);
const ACCOUNT = new Set([
  "tenants",
  "billing_accounts",
  "partners",
  "partner_tenants",
  "partner_invitations",
  "partner_earnings",
]);
/** A finding of the wiring's second audit (`S3-3`, `X3-2`, `W-person-list-lead-8`), or a lane of it (`R5`). */
const FINDING = /^(R\d+|[SX]\d+-\d+|W-[a-z-]+-\d+)$/;
const watched = new Set(watchedTables());

/** The pages a claim's write is asked from: the coverage pages, and the pages whose own rows name a surface there (ifDrawn). */
const CLAIM_PAGES = [...PAGES, "clients/leads", "broadcasts", "messages", "admin/workspace", "start"];
/** The surfaces a write's row names from any page a claim may mean. */
function rereadAnywhere(write) {
  const keys = new Set();
  const was = globalThis.location.hash;
  try {
    for (const page of CLAIM_PAGES) {
      globalThis.location.hash = `#/${page}`;
      for (const o of AFTER[write]?.() ?? []) keys.add(o.key);
    }
  } finally {
    globalThis.location.hash = was;
  }
  return keys;
}

/** An address of the first family whose row names the surface (PAGE_HEARS): a person's page by a person's id. */
function pageOf(surface) {
  const family = Object.entries(PAGE_HEARS).find(([, cells]) => surface in cells)?.[0];
  if (!family) return null;
  return family === PERSON_ROUTE ? "clients/0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f" : family;
}

/** Whether a surface hears some event the feed tells of a table, with the address on `page`. */
function hearsTableOn(key, table, page) {
  const was = globalThis.location.hash;
  globalThis.location.hash = `#/${page}`;
  try {
    return (told[table] ?? []).some((event) => wantsRefresh(overrides.get(key), table, { table, event, row: {} }));
  } finally {
    globalThis.location.hash = was;
  }
}

/** A field as the wire spells it and as a view model does: `last_inbound_at`, `lastInboundAt`. */
const spellings = (field) => [field, field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];

test("every group says what kind of exception it is, and holds only the tables that kind may", () => {
  for (const group of baseline.groups) {
    const at = `${group.kind} (${group.why.slice(0, 50)})`;
    assert.ok(KINDS.includes(group.kind), `${at}: a kind of ${KINDS.join(", ")}`);
    if ("finding" in group) assert.match(group.finding, FINDING, `${at}: a finding or a lane of the audit`);
    for (const [surface, list] of Object.entries(group.reads))
      for (const table of list) {
        const pair = `${surface} ${table}`;
        if (group.kind === "seat") assert.ok(SEAT.has(table), `${pair}: not a seat's table`);
        if (group.kind === "account" && group.of !== "other workspaces")
          assert.ok(ACCOUNT.has(table), `${pair}: not the account's table`);
        if (group.kind === "account" && group.of === "other workspaces")
          assert.equal(
            overrides.get(surface)?.fresh,
            "own-change",
            `${pair}: another workspace's rows are read only by a surface the feed tells nothing`,
          );
        if (group.kind === "unfed")
          assert.equal(watched.has(table), false, `${pair}: the feed tells it, so it is not unfed`);
        if (group.kind === "over-read" || group.kind === "owed")
          assert.ok(watched.has(table), `${pair}: the feed does not tell it; it is unfed`);
      }
    if (group.kind === "owed")
      assert.ok(group.finding, `${at}: an owed read names the finding or the lane it waits on`);
    if (group.kind === "unfed")
      assert.ok(
        group.rereadAfter || group.heardWith || group.finding,
        `${at}: say what reads it again, or the finding owed it`,
      );
    if ("of" in group)
      assert.equal(group.of, "other workspaces", `${at}: an \`of\` names other workspaces and nothing else`);
    if (group.kind === "over-read")
      assert.ok(
        "field" in group || group.heardWith || group.heardBy,
        `${at}: say the field it feeds, what it rides with, or who hears it for the page`,
      );
  }
});

test("an over-read's field is one its surface never reads", () => {
  for (const group of baseline.groups.filter((g) => g.kind === "over-read" && typeof g.field === "string"))
    for (const surface of Object.keys(group.reads)) {
      const { file } = surfaces.find((s) => s.key === surface);
      const source = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
      for (const spelled of spellings(group.field))
        assert.equal(
          new RegExp(`\\b${spelled}\\b`).test(source),
          false,
          `${surface} reads ${spelled} (${file}): it draws what the group says it does not`,
        );
    }
});

test("what a group says re-reads its pages does: each write's row names the surface, and each table it rides with is heard", () => {
  for (const group of baseline.groups) {
    for (const [surface, writes] of Object.entries(group.rereadAfter ?? {})) {
      assert.ok(surface in group.reads, `rereadAfter names ${surface}, which the group does not hold`);
      for (const write of writes) {
        assert.ok(AFTER[write], `${write} is no row of the refresh map`);
        assert.ok(rereadAnywhere(write).has(surface), `${write}'s row does not re-read ${surface}`);
      }
    }
    for (const [surface, list] of Object.entries(group.heardWith ?? {})) {
      assert.ok(surface in group.reads, `heardWith names ${surface}, which the group does not hold`);
      const hears = overrides.get(surface)?.refreshOnTables ?? [];
      for (const table of list) assert.ok(hears.includes(table), `${surface} does not hear ${table}`);
    }
    for (const [surface, others] of Object.entries(group.heardBy ?? {})) {
      assert.ok(surface in group.reads, `heardBy names ${surface}, which the group does not hold`);
      const page = pageOf(surface);
      assert.ok(page, `${surface} owns no page (PAGE_HEARS), so no surface can hear for it there`);
      for (const other of others)
        for (const table of group.reads[surface])
          assert.ok(
            hearsTableOn(other, table, page),
            `${other} does not hear ${table} on ${page}, so it cannot read ${surface}'s page again for it`,
          );
    }
  }
});

/** A route key as a pattern that matches it in prose and not inside a longer key: "PUT me" is not "PUT me/alerts". */
const keyPattern = (key) =>
  new RegExp(`(?<![\\w/\\[\\]-])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w/\\[\\]-])`);

/** Whether a write's row, made on a page that draws none of it, drops what the surface held: a period read it forgets. */
function forgets(write, surface) {
  const was = globalThis.location.hash;
  setSurfaceValue(surface, { held: true });
  globalThis.location.hash = "#/admin/profile";
  try {
    AFTER[write]();
    return surfaceValue(surface) === undefined;
  } finally {
    setSurfaceValue(surface, undefined);
    globalThis.location.hash = was;
  }
}

test("a reason that names a write of the refresh map is true of every surface its group holds: the row names each, from some page, or forgets what it held (W-visit-deal-4)", () => {
  // The workspace row's group said "PATCH workspaces re-reads the pages that draw them" of fifteen surfaces, and the row read nine:
  // a reason is held to the row it names, so a claim nobody wrote down as `rereadAfter` is checked all the same.
  const writes = Object.keys(AFTER);
  for (const group of baseline.groups)
    for (const write of writes.filter((w) => keyPattern(w).test(group.why)))
      for (const surface of Object.keys(group.reads))
        assert.ok(
          rereadAnywhere(write).has(surface) || forgets(write, surface),
          `${surface}: its group's reason names ${write}, whose row neither reads it nor forgets it: say what reads it again, or move it to a group that does not name the write`,
        );
});

test("the owed reads are counted in the file, and the count may only fall", () => {
  const now = owedPairs(baseline.groups);
  assert.ok(Number.isInteger(baseline.owed), `${FILE} says how many reads are owed`);
  assert.ok(
    now <= baseline.owed,
    `${now} owed reads, more than the ${baseline.owed} the file allows: hear one instead`,
  );
  assert.equal(now, baseline.owed, `good, now bank it: ${BANK_HINT}`);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 2. Writes tell                                                                                                           *
 * ------------------------------------------------------------------------------------------------------------------------ */

/**
 * Writes whose pages the feed and the map cannot be held to, and the surfaces they leave without (`write -> surface`, or
 * `write -> *` for all), each with why. May only fall: an entry no longer needed fails.
 */
const NOT_TOLD = {
  "POST workspaces/create -> *":
    "It makes another workspace's rows (its settings, its rules, the seat of whoever made it), and the tab switches to that workspace, which boots; nothing of the workspace on screen is drawn from them.",
  "POST partner/workspaces -> *":
    "A partner sets up a workspace for a client: its rows are the new workspace's, which the tab switches to when its invitation went (REFRESHES_NOTHING says so); nothing of the workspace on screen is drawn from them.",
};

/** What each write leaves a surface without: the tables it changes that the surface draws and neither the map nor the feed carries. */
const untold = new Map();
for (const write of [...Object.keys(AFTER), ...Object.keys(REFRESHES_NOTHING)]) {
  const route = routes[write];
  if (!route) continue;
  const reread = write in AFTER ? rereadsOf(write) : new Set();
  for (const s of surfaces) {
    if (reread.has(s.key)) continue;
    const gaps = untoldWrites(s, route.verbs, told, liveTablesOf);
    if (gaps.length) untold.set(`${write} -> ${s.key}`, gaps.join(", "));
  }
}
const excusedBy = (pair) => {
  const [write] = pair.split(" -> ");
  return [pair, `${write} -> *`].find((key) => key in NOT_TOLD) ?? null;
};

test("every write the refresh map decides is followed by the trace, and the trace's writes are the dashboard's own code", () => {
  const writes = [...Object.keys(AFTER), ...Object.keys(REFRESHES_NOTHING)];
  assert.ok(writes.length > 100, `the map decides ${writes.length} writes`);
  const lost = writes.filter((write) => !routes[write]);
  assert.deepEqual(
    lost,
    [],
    "a write of the map the trace does not know: a route that moved, or a key that is not one",
  );
});

test("a write leaves no surface without the tables it changes that the surface draws: the map names it, or the feed tells it", () => {
  const found = [...untold].filter(([pair]) => !excusedBy(pair)).map(([pair, gaps]) => `${pair}  (${gaps})`);
  assert.deepEqual(
    found,
    [],
    "name the surface in the write's row of refresh-map.ts (a lens read where it is drawn is forgotten elsewhere: ifDrawn), declare " +
      "the kind in the surface's declareReads so the feed tells it, or list the write in NOT_TOLD with why",
  );
});

test("the writes listed as untold are still untold, and each says why", () => {
  const needed = new Set([...untold.keys()].map(excusedBy).filter(Boolean));
  assert.deepEqual(
    Object.keys(NOT_TOLD).filter((key) => !needed.has(key)),
    [],
    "no longer needed: delete it",
  );
  for (const [key, why] of Object.entries(NOT_TOLD))
    assert.ok(why.trim().length >= 60, `${key}: say why in a sentence`);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * 3. Rows read what they can change                                                                                        *
 * ------------------------------------------------------------------------------------------------------------------------ */

/**
 * Re-reads a row asks for that the trace finds nothing to read for (`write -> surface`), each with why. A read for nothing is
 * paid by every reply; these are the ones left, and may only fall.
 */
const NOT_READ = {
  "PUT lead-suggestions -> leads":
    "The ideas are kept through an object the trace does not follow (ideaStore.saveLine in server/leads/lead-suggestions.ts); it writes lead_suggestions, which Leads reads for a new search's ideas (GET lead-suggestions).",
  "PUT people/[id]/business -> leads":
    "The row says the lead's own rows list its people (0052); they are People's rows (leads/peek/people.tsx), which the row re-reads, and the trace finds no read of contacts under Leads, so it is probably premature. Owed: drop leads() from the row once the peek is seen to redraw from People's re-read alone.",
  "DELETE people/[id]/business -> leads":
    "The row says the lead's own rows list its people (0052); they are People's rows (leads/peek/people.tsx), which the row re-reads, and the trace finds no read of contacts under Leads, so it is probably premature. Owed: drop leads() from the row once the peek is seen to redraw from People's re-read alone.",
  "POST settings/receptionist -> reports_campaigns":
    "channelChange() names the Campaigns lens for the connected number's health; the first receptionist writes tenant_config (the hours, the postal address), which the lens does not read. Premature. Owed: drop reportsCampaigns() from settingsWrite, with CAMPAIGNS_WRITES in refresh-coverage.test.mjs.",
  "PATCH workspaces -> calendar":
    "The board's times and its 'today' are the workspace's zone, which the calendar's read takes through tenantFacts (server/tenant.ts, by readers/facts.ts), a file the trace leaves to the wrapper (WRAPPER: every route reads the caller's seat through it), so it finds no read of tenants under GET calendar. The read is real: a zone saved left the board on the old one's times for up to five minutes (W-visit-deal-4). Owed: the trace enters tenantFacts where a reader calls it.",
  "POST calendar/visits/[id] -> reports_people":
    "visits() names the People lens with the other readers of a visit; the lens's read (GET reports/people) reads no appointment. Premature. Owed: drop reportsPeople() from visits(), with its assertions in a-visit-reaches-every-reader.test.mjs.",
};

/** Each re-read of a row that the write's own tables, and the tables of the edge doors it asks, give the surface nothing to read for. */
const premature = new Map();
for (const write of Object.keys(AFTER)) {
  const route = routes[write];
  if (!route) continue;
  const changed = new Set([...route.writes, ...route.doorWrites].filter((t) => !PLUMBING.has(t)));
  for (const key of rereadsOf(write)) {
    const s = surfaces.find((x) => x.key === key);
    const reads = s ? readsOf(s.gets, routes, { doors: true }) : new Map();
    if (![...changed].some((t) => reads.has(t)))
      premature.set(`${write} -> ${key}`, `changes ${[...changed].sort().join(", ") || "nothing"}`);
  }
}

test("every surface a row re-reads is one the shell registers", () => {
  const known = new Set(surfaces.map((s) => s.key));
  for (const write of Object.keys(AFTER))
    for (const key of rereadsOf(write)) assert.ok(known.has(key), `${write} re-reads ${key}`);
});

test("a row re-reads only surfaces that read a table its write changes", () => {
  const found = [...premature].filter(([pair]) => !(pair in NOT_READ)).map(([pair, what]) => `${pair}  (${what})`);
  assert.deepEqual(
    found,
    [],
    "drop the surface from the write's row of refresh-map.ts: a read for nothing is paid by every reply; or list it in NOT_READ with why",
  );
});

test("the re-reads listed as for nothing still are, and each says why", () => {
  assert.deepEqual(
    Object.keys(NOT_READ).filter((pair) => !premature.has(pair)),
    [],
    "no longer premature: delete it",
  );
  for (const [pair, why] of Object.entries(NOT_READ))
    assert.ok(why.trim().length >= 60, `${pair}: say why in a sentence`);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * What the findings asked for                                                                                              *
 * ------------------------------------------------------------------------------------------------------------------------ */

const change = (table, event = "UPDATE", row = {}) => ({ table, event, row });
const at = (hash) => {
  globalThis.location.hash = hash;
};
/** Whether `key` asks to be read for `table` on `route`, and on a page that is none of its own. */
function heardOn(key, table, route, change_ = change(table)) {
  const o = overrides.get(key);
  at(`#/${route}`);
  const here = wantsRefresh(o, table, change_);
  at("#/admin/profile");
  const away = wantsRefresh(o, table, change_);
  at("#/today");
  return { here, away };
}

test("People hears what its follow-up facts depend on, on its page: the playbooks, the number, the plan, the rules and the templates (F8a)", () => {
  for (const table of ["sequence_steps", "tenant_channels", "billing_accounts", "policies", "templates"]) {
    assert.ok(overrides.get("people").refreshOnTables.includes(table), `People names ${table}`);
    assert.deepEqual(
      heardOn("people", table, "clients"),
      { here: true, away: false },
      `${table}: heard on People, kept for it elsewhere`,
    );
  }
});

test("each Reports page hears the tables it counts, on its page: the overview its calls and hours, the People lens its channels, the Campaigns lens its replies, number and domains (F8c)", () => {
  const WANTED = [
    ["reports", "reports", ["calls", "tenant_config", "deals", "appointments", "contacts"]],
    ["reports_receptionist", "reports/receptionist", ["appointments", "contacts", "tenant_config"]],
    ["reports_people", "reports/people", ["contacts", "tenant_channels", "lines", "mailboxes"]],
    // And the mailboxes a reach-out writes from, the hosted one among them, and a deal won (owed, closed 15 October).
    [
      "reports_campaigns",
      "reports/campaigns",
      ["sequence_replies", "tenant_channels", "mailbox_connections", "mailboxes", "deals"],
    ],
  ];
  for (const [key, route, list] of WANTED)
    for (const table of list) {
      assert.deepEqual(
        heardOn(key, table, route),
        { here: true, away: false },
        `${key}: ${table} on ${route}, kept for it elsewhere`,
      );
    }
  // The overview counts calls, never a transcript turn of one in progress.
  const turn = change("calls", "UPDATE", { status: "ongoing" });
  assert.deepEqual(
    heardOn("reports", "calls", "reports", turn),
    { here: false, away: false },
    "a turn is no change to a count",
  );
  assert.equal(
    heardOn("reports", "calls", "reports", change("calls", "UPDATE", { status: "ended" })).here,
    true,
    "a call ending is",
  );
  // What the lenses leave out they say so: a lens that draws no line's saga is not told of one.
  assert.equal(heardOn("reports_campaigns", "lines", "reports/campaigns").here, false);
});

test("the receipts of a run are the one thing the Campaigns pages count and the feed cannot tell: listed, with why, in the baseline", () => {
  for (const key of ["reports_campaigns", "broadcasts", "playbooks"])
    assert.ok(held.has(`${key} sequence_sends`), `${key} reads a run's people unheard, and the baseline says why`);
  assert.equal(
    watchedTables().includes("sequence_sends"),
    false,
    "the feed tells a batch (sequence_batches), never its sends",
  );
});
