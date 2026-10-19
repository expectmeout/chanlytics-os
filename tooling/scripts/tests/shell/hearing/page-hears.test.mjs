/**
 * What each page hears is a table (decision 0058; the wiring's second audit, lane R4): PAGE_HEARS (surface-registry.ts) names, for each
 * family of addresses, the surfaces whose page it is, and ownsTheScreen reads it.
 *
 *  1. The families. Every family the registry names (its routes, its draws, a person's page, Leads' scope, an address that moved) has
 *     a row, and every row is one; every address the address registry opens is of one, a person's tabs of theirs; the addresses
 *     whose family is not their first word are pinned (FAMILY_OF), so a change to how an address is read shows as a failure here; a
 *     row holds the family's own surface and only registered ones.
 *  2. The goldens, baselines/hearing/<family>.json: for each family, the address asked, the surfaces that own it (as ownsTheScreen
 *     answers there), and for each notice the
 *     feed sends (a table and its event, a message's update by its status, a call's turn apart from its end), the surfaces it reads
 *     and the GET routes their modules name. A change to what a page hears is a change to its golden, read in review: R5 changes
 *     cells one at a time and says what each costs. UPDATE_HEARING=1 writes them.
 *  3. The borrow scan, baselines/hearing/borrows.json: the surfaces each folder of pages (and the modules at the pages' root) draws
 *     through useSurface, surfaceValue and useMoved, by key or in a list, and through the window globals an override publishes,
 *     read as a property or named in a string. A figure a page borrows from another surface's read is fresh only as that read is;
 *     this is where it shows. It is kept by folder, not by family: which family a folder draws is the routes' to say. Written
 *     with the goldens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, importSrc, stripComments } from "../../_source.mjs";
import { BASELINES_DIR } from "../../_ratchet.mjs";
import { getsOfFile, registeredSurfaces } from "./_reads.mjs";

globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/studio", hash: "#/today" };
globalThis.location.pathname = "/w/studio";
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

const { MESSAGE_STATUSES } = await importSrc("packages/contracts/src/shared/enums.ts");
const { PERSON_TAB_WORDS, personTabRoute } = await importSrc("packages/contracts/src/person-page/route.ts");
const { watchedEvents } = await importSrc("packages/db/src/realtime.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const registry = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { opensRoute } = await importSrc("apps/dashboard/src/surfaces/addresses.ts");
const { PAGE_HEARS, ROUTE_SURFACE, ROUTE_DRAWS, ROUTES_MOVED, PERSON_ROUTE, routeFamilyOf, routeSurfaceFor } = registry;

const SURFACES = [];
for (const { name, file } of registeredSurfaces()) {
  const override = (await importSrc(file))[name];
  SURFACES.push({ key: override.key, override, routes: getsOfFile(file).length });
}
const KEYS = new Set(SURFACES.map((s) => s.key));

/** Every family the registry names: its routes, its draws, the addresses that moved, a person's page and Leads' scope. */
const ROUTE_FAMILIES = [
  ...new Set([
    ...Object.keys(ROUTE_SURFACE),
    ...Object.keys(ROUTE_DRAWS),
    ...Object.keys(ROUTES_MOVED),
    PERSON_ROUTE,
    "clients/leads",
  ]),
].sort();

/** A person's id as a real one is written (the registry takes a person's page for a uuid alone). */
const PERSON = "0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
/** The address a family is asked at, where the family's own name is not one of it: a person, and a pane Settings does not list. */
const ASKED_AT = {
  [PERSON_ROUTE]: `clients/${PERSON}`,
  admin: "admin/unlisted",
  // A run's home under its sequence (the Campaigns wiring review's lane 2): the family names the screen, no address.
  "campaigns/sequences/runs": "campaigns/sequences/sq-1/runs/b-1",
};
const askedAt = (family) => ASKED_AT[family] ?? family;

/**
 * Addresses of every shape the address registry opens (surfaces/addresses.ts, the shapes its PAGES list says), and the retired and
 * moved ones that still land somewhere.
 */
const ADDRESSES = [
  "today",
  "inbox",
  "inbox/th-1",
  "inbox/new",
  "conversations",
  "conversations/all",
  "conversations/cv-1",
  "live",
  "live/call-1",
  "calendar",
  "calendar/2026-10-13",
  "calendar/2026-10-13:a-v1",
  "campaigns",
  "campaigns/moment:pb-1",
  "campaigns/message:hello",
  "campaigns/new",
  "campaigns/sequences",
  "campaigns/sequences/sq-1/people",
  // A run at its home, and the one New on each who (the Campaigns wiring review's lanes 2 and 6).
  "campaigns/sequences/sq-1/runs/b-1",
  "campaigns/sequences/new",
  "campaigns/sequences/new:once:to:s-1",
  "campaigns/sequences/new:leads",
  "campaigns/messages",
  "messages",
  "broadcasts",
  "broadcasts/run:b-1",
  "broadcasts/get-yes",
  "broadcasts/to-send",
  // To send, a part of the Inbox's Needs you (lane 4), and Get their yes, a sheet over People's list (lane 7).
  "inbox/to-send",
  "clients/get-yes",
  "clients",
  `clients/${PERSON}`,
  "clients/new-list",
  "clients/seg:vip",
  `clients/list:${PERSON}`,
  "clients/leads",
  "clients/leads:s-1",
  "clients/pipeline",
  "segments",
  "segments/vip",
  "start",
  "start/find",
  "admin",
  "admin/workspace/calendar",
  "reports",
  "reports/2026-09-01~2026-09-20",
  "reports/reviews:2026-09-01~2026-09-20",
  "outbound",
];
const PANES = Object.keys(ROUTE_SURFACE)
  .filter((r) => r.startsWith("admin/"))
  .concat(["admin/setup"]);
const LENSES = Object.keys(ROUTE_DRAWS).filter((r) => r.startsWith("reports/"));
const PERSON_TABS = Object.keys(PERSON_TAB_WORDS).map((tab) => personTabRoute(PERSON, tab));

test("every family the registry names has a row, and every row is a family", () => {
  assert.deepEqual(Object.keys(PAGE_HEARS).sort(), ROUTE_FAMILIES);
});

test("every address the registry opens is of a family, a person's every tab of theirs, and every family is some address's", () => {
  const reached = new Set();
  // The retired address of Leads and a pane Settings does not list land on pages of their own, and the registry opens neither.
  for (const address of [...ADDRESSES, ...PANES, ...LENSES, ...PERSON_TABS, "leads", "admin/unlisted"]) {
    const family = routeFamilyOf(address);
    assert.ok(ROUTE_FAMILIES.includes(family), `${address} is of ${family}, which is no family`);
    reached.add(family);
  }
  for (const address of [...ADDRESSES, ...PANES.filter((p) => p !== "admin/setup"), ...LENSES, ...PERSON_TABS])
    assert.ok(
      opensRoute(address),
      `${address}: the address registry opens nothing there, so it is no sample of a page`,
    );
  for (const address of PERSON_TABS) assert.equal(routeFamilyOf(address), PERSON_ROUTE, address);
  assert.deepEqual(
    ROUTE_FAMILIES.filter((f) => !reached.has(f)),
    [],
    "a row no address reaches",
  );
  assert.equal(registry.ownsTheScreen("today", "nowhere"), false);
  assert.equal(
    registry.ownsTheScreen("today", "toString"),
    false,
    "a word that names a property of every object is no family",
  );
});

/**
 * The addresses whose family is not simply their first word, each with the family it is: a person and their tabs, a word where a
 * person's id goes, Leads' scope and its views, a Reports lens over days and the Overview by name, a Settings pane with a row, an
 * unlisted pane, Settings with none, an address that moved, a thread, a moment, a view of People, a seeded person, a word nobody
 * wrote, and one that names a property of every object.
 */
const FAMILY_OF = {
  [`clients/${PERSON}`]: PERSON_ROUTE,
  [`clients/${PERSON}/history`]: PERSON_ROUTE,
  "clients/person": "clients",
  "clients/c-seed": "clients",
  "clients/pipeline": "clients",
  [`clients/pipeline:v-x:p-${PERSON}`]: "clients",
  [`clients/seg:vip:p-${PERSON}`]: "clients",
  "clients/leads": "clients/leads",
  "clients/leads:s-1:l-2:c-3:p-4": "clients/leads",
  leads: "leads",
  "reports/2026-09-01~2026-09-20": "reports",
  "reports/overview": "reports",
  "reports/reviews:2026-09-01~2026-09-20": "reports/reviews",
  "reports/campaigns": "reports/campaigns",
  admin: "admin/workspace",
  "admin/workspace/calendar": "admin/workspace",
  "admin/activity/x": "admin/activity",
  "admin/opening": "admin",
  "admin/hours": "admin/hours",
  "admin/setup": "admin/setup",
  "inbox/th-1": "inbox",
  "inbox/to-send": "inbox",
  "campaigns/moment:pb-1": "campaigns",
  // The composer's old address lands on New before a page is drawn: no family of its own any more (lane 6).
  "campaigns/new": "campaigns",
  "campaigns/sequences/sq-1/people": "campaigns/sequences",
  "campaigns/sequences/sq-1/runs/b-1": "campaigns/sequences/runs",
  "campaigns/sequences/sq-1/history/b-1": "campaigns/sequences",
  "campaigns/sequences/new:once:to:s-1": "campaigns/sequences/new",
  "campaigns/sequences/new:leads": "campaigns/sequences/new",
  "broadcasts/run:b-1": "broadcasts",
  "clients/get-yes": "clients/get-yes",
  "start/find": "start",
  "": "today",
  nowhere: "nowhere",
  toString: "toString",
};

test("the addresses whose family is not their first word are the family each is pinned to", () => {
  assert.deepEqual(
    Object.fromEntries(Object.keys(FAMILY_OF).map((address) => [address, routeFamilyOf(address)])),
    FAMILY_OF,
  );
});

test("each row holds its family's own surface whole, and only surfaces the shell registers; a cell of kinds names kinds its surface hears on its page alone; each family is asked at an address of it", () => {
  for (const [family, cells] of Object.entries(PAGE_HEARS)) {
    assert.equal(routeFamilyOf(askedAt(family)), family, `${family} is asked at ${askedAt(family)}, of another family`);
    const { page, param } = registry.routePartsOf(askedAt(family));
    const own = routeSurfaceFor(page, param);
    if (own) assert.equal(cells[own], true, `${family}: its own surface ${own} is on its row, every kind of it`);
    for (const [key, cell] of Object.entries(cells)) {
      assert.ok(KEYS.has(key), `${family}: ${key} is no surface the shell registers`);
      if (cell === true) continue;
      const o = SURFACES.find((s) => s.key === key).override;
      assert.ok(Array.isArray(cell) && cell.length > 0, `${family}: ${key}'s cell is true or a list of kinds`);
      assert.equal(o.fresh, "its-page", `${family}: ${key} hears on its page alone, or a cell of kinds says nothing`);
      for (const kind of cell) assert.ok(o.reads.includes(kind), `${family}: ${key} draws no ${kind}`);
    }
  }
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * The goldens                                                                                                              *
 * ------------------------------------------------------------------------------------------------------------------------ */

const WRITE = process.env.UPDATE_HEARING === "1";
const DIR = path.join(ROOT, BASELINES_DIR, "hearing");
const fileOf = (family) => path.join(DIR, `${family}.json`);

/** The changes each notice of the feed makes, as a surface's rule judges them: a message's update by its status, a call's turn apart. */
function noticesOf() {
  const out = [];
  for (const { table, events } of watchedEvents())
    for (const event of events) {
      const rows =
        table === "messages" && event === "UPDATE"
          ? MESSAGE_STATUSES.map((status) => ({ status }))
          : table === "calls" && event === "UPDATE"
            ? [{ status: "ongoing" }, { status: "ended" }]
            : [{}];
      for (const row of rows)
        out.push({ key: [table, event, row.status].filter(Boolean).join(" "), table, event, row });
    }
  return out;
}

/** Surface keys as one line a review reads at a glance: `conversations inbox today`. */
const line = (keys) => [...keys].sort().join(" ");

/**
 * A family's golden: the address asked, what it owns, and each notice the feed sends that reads anything there, as one line, the
 * surfaces it reads and the GET routes their modules name (`conversations inbox today · 10 routes`), so a cell changed is a line
 * changed. A notice that reads nothing is left out.
 */
function goldenOf(family) {
  const route = askedAt(family);
  const was = globalThis.location.hash;
  globalThis.location.hash = `#/${route}`;
  try {
    const notices = {};
    for (const n of noticesOf()) {
      const reads = SURFACES.filter((s) =>
        wantsRefresh(s.override, n.table, { table: n.table, event: n.event, row: n.row }),
      );
      const routes = reads.reduce((sum, s) => sum + s.routes, 0);
      if (reads.length) notices[n.key] = `${line(reads.map((s) => s.key))} · ${routes} route${routes === 1 ? "" : "s"}`;
    }
    // A surface that owns some kinds here says which: `broadcasts(billing channel facts person rules visit)`.
    const owns = SURFACES.filter((s) => registry.ownsTheScreen(s.key, route)).map((s) => {
      const cell = PAGE_HEARS[family][s.key];
      return Array.isArray(cell) ? `${s.key}(${[...cell].sort().join(" ")})` : s.key;
    });
    return { family, route, owns: line(owns), notices };
  } finally {
    globalThis.location.hash = was;
  }
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (WRITE) {
  fs.rmSync(DIR, { recursive: true, force: true });
  for (const family of ROUTE_FAMILIES) {
    fs.mkdirSync(path.dirname(fileOf(family)), { recursive: true });
    fs.writeFileSync(fileOf(family), json(goldenOf(family)));
  }
}

test("what each page hears is its golden: the surfaces it owns, and for every notice the surfaces it reads and their routes", () => {
  const differ = [];
  for (const family of ROUTE_FAMILIES) {
    const file = fileOf(family);
    assert.ok(fs.existsSync(file), `${path.relative(ROOT, file)} is missing: UPDATE_HEARING=1 writes it`);
    const kept = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    if (kept !== json(goldenOf(family))) differ.push(family);
  }
  assert.deepEqual(
    differ,
    [],
    "what these pages hear changed: run UPDATE_HEARING=1 and read the difference in the goldens (the surfaces read and the routes, for each notice), then keep it",
  );
});

test("no golden is left for a family that is gone", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) walk(path.join(dir, e.name));
      else files.push(path.relative(DIR, path.join(dir, e.name)).split(path.sep).join("/"));
  };
  walk(DIR);
  const families = files.filter((f) => f !== "borrows.json").map((f) => f.replace(/\.json$/, ""));
  assert.deepEqual(families.sort(), ROUTE_FAMILIES);
});

/* ------------------------------------------------------------------------------------------------------------------------ *
 * The borrow scan                                                                                                          *
 * ------------------------------------------------------------------------------------------------------------------------ */

const PAGES_DIR = "apps/dashboard/src/surfaces";
/** Which surface publishes each window global (an override's `globals`). */
const GLOBAL_OF = new Map(SURFACES.flatMap((s) => (s.override.globals ?? []).map((g) => [g, s.key])));

/** The surface keys a call names, alone or in a list: `useSurface("people")`, `useMoved(["calendar", "people"])`. */
const CALLS = /\b(?:useSurface|surfaceValue|useMoved)\(\s*(\[[^\]]*\]|["'][a-z_]+["'])/g;

/** The surfaces one module draws: by key, and through a global an override publishes, read as `.__X` or named `"__X"`. */
function borrowsIn(rel) {
  const keys = new Set();
  const source = stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  for (const m of source.matchAll(CALLS)) for (const k of m[1].matchAll(/["']([a-z_]+)["']/g)) keys.add(k[1]);
  for (const m of source.matchAll(/(?:\.|["'])(__[A-Z][A-Z0-9_]*)\b/g))
    if (GLOBAL_OF.has(m[1])) keys.add(GLOBAL_OF.get(m[1]));
  return keys;
}

const isModule = (name) => /\.(ts|tsx|jsx)$/.test(name) && !/\.type-test\.ts$/.test(name);

/** The surfaces a folder of pages draws, from every module under it; the root of the pages' tree from its own modules alone. */
function borrowsOf(dir) {
  const keys = new Set();
  const walk = (at, deep) => {
    for (const e of fs.readdirSync(path.join(ROOT, at), { withFileTypes: true })) {
      const rel = `${at}/${e.name}`;
      if (e.isDirectory()) {
        if (deep) walk(rel, deep);
      } else if (isModule(e.name)) for (const k of borrowsIn(rel)) keys.add(k);
    }
  };
  walk(dir === ROOT_FOLDER ? PAGES_DIR : `${PAGES_DIR}/${dir}`, dir !== ROOT_FOLDER);
  return [...keys].sort();
}

/** The modules at the root of the pages' tree (holder-names.ts, needs-you.ts, ...), which every page may draw from. */
const ROOT_FOLDER = ".";

/** Each folder of pages, each folder inside one (Campaigns' home, Sent, the Library; Settings' panes; a person's page), and the root's modules. */
function pageFolders() {
  const out = [ROOT_FOLDER];
  for (const top of fs.readdirSync(path.join(ROOT, PAGES_DIR), { withFileTypes: true })) {
    if (!top.isDirectory() || top.name === "kit") continue;
    out.push(`${top.name}`);
    for (const inner of fs.readdirSync(path.join(ROOT, PAGES_DIR, top.name), { withFileTypes: true }))
      if (inner.isDirectory()) out.push(`${top.name}/${inner.name}`);
  }
  return out.sort();
}

const BORROWS = path.join(DIR, "borrows.json");
/** Each folder's borrows as one line, as the goldens write surfaces. */
const borrowsNow = () => Object.fromEntries(pageFolders().map((dir) => [dir, line(borrowsOf(dir))]));
if (WRITE) fs.writeFileSync(BORROWS, json(borrowsNow()));

test("the surfaces each folder of pages draws are the borrow scan's, and each is one the shell registers", () => {
  const now = borrowsNow();
  for (const [dir, keys] of Object.entries(now))
    for (const key of keys.split(" ").filter(Boolean))
      assert.ok(KEYS.has(key), `${dir} draws ${key}, which is no surface the shell registers`);
  assert.ok(fs.existsSync(BORROWS), `${path.relative(ROOT, BORROWS)} is missing: UPDATE_HEARING=1 writes it`);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(BORROWS, "utf8")),
    now,
    "what a folder of pages draws changed: run UPDATE_HEARING=1 and read the difference in borrows.json, then keep it",
  );
});
