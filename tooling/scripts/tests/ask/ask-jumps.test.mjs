/**
 * ⌘K's jumps against the pages a workspace has (Ask Rewired, Phase 7): every page the shell's registry calls real, and
 * People's scopes beside them, is a jump away; every jump lands on a real page, where that page is now, and on a page
 * an answer may name. The Pipeline is a jump where deals are on and the back office for Chanlytics staff, read from
 * the two bits their own doors are drawn by (People's scope strip, Settings' rail); Memory lands on Business, where
 * what the receptionist knows lives (#417). A real page added to the registry without a jump fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_PAGES, ASK_PAGE_ROUTES, askJump, askPages } from "@chanlytics/contracts";

const { SURFACE_STATES, surfaceStateFor, surfaceRetiredTo } =
  await import("../../../../apps/dashboard/src/legacy-bridge/surface-registry.ts");
const { jumpIndexFrom } = await import("../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");

/**
 * Every page a workspace can have, and the jump that reaches it: its label, and where it lands. The keys are the
 * registry's real routes, and People's scopes the registry routes as `clients` (SCOPES).
 */
const REACHED = {
  today: ["Today", "today"],
  inbox: ["Inbox", "inbox"],
  conversations: ["Conversations", "conversations"],
  clients: ["People", "clients"],
  reports: ["Reports", "reports"],
  live: ["Calls", "live"],
  // The route moves to the scope (SURFACE_RETIRED), and the jump goes straight there.
  leads: ["Leads", "clients/leads"],
  // People › Lists is People's rail; `segments/<id>` still lands there.
  segments: ["Lists", "clients"],
  calendar: ["Calendar", "calendar"],
  outbound: ["Playbooks", "outbound"],
  broadcasts: ["Broadcasts", "broadcasts"],
  messages: ["Templates", "messages"],
  start: ["Setting up", "start"],
  "admin/profile": ["Profile", "admin/profile"],
  "admin/workspace": ["Settings", "admin/workspace"],
  "admin/team": ["Team", "admin/team"],
  "admin/autonomy": ["Autonomy", "admin/autonomy"],
  "admin/notifications": ["Notifications", "admin/notifications"],
  "admin/integrations": ["Connections", "admin/integrations"],
  "admin/billing": ["Billing", "admin/billing"],
  // The pane says it is not built and points at Business: Memory's jump lands there, never on it (#417).
  "admin/memory": ["Receptionist memory", "admin/workspace"],
  "admin/activity": ["Activity", "admin/activity"],
  "admin/platform": ["Back office", "admin/platform"],
  "admin/partner": ["Partner", "admin/partner"],
  // People's third scope where deals are on (0008): an address of `clients`, not a route of the registry's own.
  "clients/pipeline": ["Pipeline", "clients/pipeline"],
};
const SCOPES = ["clients/pipeline"];

/** Every page, for a workspace with deals on and a person on Chanlytics' staff. */
const EVERY = askPages({ dealsOn: true, platformAdmin: true });
const where = (to) => {
  const [page, ...rest] = to.split("/");
  return [page, rest.length ? rest.join("/") : null];
};

test("the jump index lists every real surface: each page the registry calls real, and People's scopes, is a jump away", () => {
  const real = Object.keys(SURFACE_STATES)
    .filter((k) => SURFACE_STATES[k] === "real")
    .sort();
  assert.deepEqual(
    Object.keys(REACHED)
      .filter((k) => !SCOPES.includes(k))
      .sort(),
    real,
    "a real page the table does not list has no jump; a listed one the registry drops is a jump to nowhere",
  );
  for (const [route, [label, to]] of Object.entries(REACHED)) {
    const jump = EVERY.find((e) => e.label === label);
    assert.ok(jump, `${route}: no jump called ${label}`);
    assert.equal(jump.to, to, `${route}: ${label} lands on ${to}`);
    assert.equal(askJump(label, EVERY)[0]?.to, to, `${route}: typing "${label}" finds it first`);
  }
  // A moved address is reached where it is now.
  assert.equal(surfaceRetiredTo("leads", null), REACHED.leads[1]);
});

test("every jump lands on a real page, where the page is now, on a page an answer may name, and no two share a name", () => {
  const labels = EVERY.map((e) => e.label);
  assert.equal(new Set(labels).size, labels.length, `a name twice: ${labels.join(", ")}`);
  const listed = new Set(Object.values(REACHED).map(([label]) => label));
  for (const e of EVERY) {
    assert.equal(e.kind, "page");
    assert.ok(listed.has(e.label), `${e.label}: a jump the table does not account for`);
    const [page, param] = where(e.to);
    assert.equal(surfaceStateFor(page, param), "real", `${e.to} is a real page`);
    assert.equal(surfaceRetiredTo(page, param), undefined, `${e.to} is where the page is, not an address that moves`);
    assert.ok(ASK_PAGE_ROUTES.includes(e.to), `${e.to} is a page a citation or an answer's Open may name`);
  }
  assert.ok(!EVERY.some((e) => e.to === "admin/memory"), "never the pane that says it is not built (#417)");
});

test("the Pipeline is a jump where deals are on, after Leads; the back office for Chanlytics staff; every workspace has the rest", () => {
  const names = (has) => askPages(has).map((e) => e.label);
  const none = names({ dealsOn: false, platformAdmin: false });
  assert.deepEqual(
    none,
    ASK_PAGES.map((e) => e.label),
    "the pages every workspace has",
  );
  assert.ok(!none.includes("Pipeline") && !none.includes("Back office"));
  const deals = names({ dealsOn: true, platformAdmin: false });
  assert.equal(deals.indexOf("Pipeline"), deals.indexOf("Leads") + 1, "People's scopes in the strip's order");
  assert.ok(!deals.includes("Back office"));
  const staff = names({ dealsOn: false, platformAdmin: true });
  assert.equal(staff.at(-1), "Back office");
  assert.ok(!staff.includes("Pipeline"), "where deals are off the Pipeline's address draws People");
});

test("the bridge's jump index reads the two bits the pages draw those doors by, and a few words reach each new page", () => {
  const index = (w) => jumpIndexFrom({ ...w });
  const first = (words, w) => askJump(words, index(w))[0]?.to ?? null;
  const on = { __PEOPLE: { rows: [], dealsOn: true }, __ME: { role: "owner", platform_admin: true } };
  const off = { __PEOPLE: { rows: [], dealsOn: false }, __ME: { role: "owner" } };
  assert.equal(first("pipe", on), "clients/pipeline");
  assert.ok(
    askJump("deals", index(on)).some((j) => j.to === "clients/pipeline"),
    "the Pipeline answers to its deals",
  );
  assert.equal(first("back office", on), "admin/platform");
  assert.equal(first("pipe", off), null, "deals off: no Pipeline");
  assert.equal(first("back office", off), null, "not staff: no back office");
  assert.equal(first("pipe", {}), null, "before People is read, nothing is claimed");
  for (const w of [on, off]) {
    assert.equal(first("memory", w), "admin/workspace", "Memory lands on Business");
    assert.equal(first("ai memory", w), "admin/workspace", "and so does the pane's own name");
    assert.equal(first("partner", w), "admin/partner");
    assert.equal(first("setting up", w), "start", "the first run is a jump away");
  }
  // The rest of the index is the browser's own rows, after the pages.
  const people = index({ ...on, __PEOPLE: { rows: [{ id: "p-1", name: "Pip Adams" }], dealsOn: true } });
  assert.deepEqual(
    askJump("pip", people).map((j) => j.label),
    ["Pipeline", "Pip Adams"],
    "a page before a person",
  );
});
