/**
 * Every kind of record has one address, written once, and its page opens it exactly (wiring/records-not-pages, task 4.1;
 * findings A1 and A2g). A person, a thread, a call, a visit, a list, a lead, a campaign, a run, a message of the Library, the
 * reviews, the lines and the team were each linked by hand at a hundred places, and each place spelled it as it remembered.
 * Now contracts' `addressOf` (activity/record-address.ts) writes it by the record's kind, and the dashboard's address registry
 * (surfaces/addresses.ts) holds each page's own parse of what it opens. This reads one against the other:
 *
 * - every kind in RECORD_KINDS has an address or says why it has none, and none says both;
 * - for every record, the address `addressOf` writes is a path the workspace routes, the frame has a page for, and that page's
 *   own parse reads back as the record the writer meant, by the same kind and id (where two kinds share a page by design -- a
 *   hold is told in its thread, a step is a line on its person's page -- as the kind the page shows);
 * - every page the frame draws (SURFACE_ROUTES) is a page the registry opens, so a page added to the frame is added to it;
 * - the shapes that are no address (`reports/overview`, `messages/x`, `today/x`, `admin/hours`) open nothing, and a retired
 *   route lands on the page that replaced it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECORD_KINDS,
  RECORDS_WITHOUT_AN_ADDRESS,
  addressOf,
  appLink,
  canonicalRoute,
  movedAddress,
  routeOfPath,
  visitRoute,
  workspacePath,
} from "@chanlytics/contracts";

const S = "../../../../apps/dashboard/src";
const { opensRoute } = await import(`${S}/surfaces/addresses.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/surfaces/routes.ts`);

/** The record an address names (the page's own parse of it), or null where it names none: a view, or no address of any page. */
const recordNamedBy = (route) => {
  const opened = opensRoute(route);
  return opened !== null && "ref" in opened ? opened.ref : null;
};

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const ID2 = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const DAY = "2026-10-09";

/**
 * One of each way a record opens: the ref, the route it is written as, and what its page reads back. A record that opens as
 * another's says which (`opens`): the page shows the kind it is, not the kind that linked to it.
 */
const RECORDS = [
  { ref: { kind: "person", id: ID }, route: `clients/${ID}` },
  { ref: { kind: "conversation", id: ID }, route: `inbox/th-${ID}` },
  { ref: { kind: "conversation", id: ID, in: "conversations" }, route: `conversations/${ID}` },
  {
    ref: { kind: "hold", conversationId: ID },
    route: `inbox/th-${ID}`,
    opens: { kind: "conversation", id: ID },
  },
  { ref: { kind: "call", id: ID }, route: `conversations/cv-${ID}` },
  { ref: { kind: "call", id: ID, on: "live" }, route: `live/${ID}` },
  { ref: { kind: "visit", id: ID, day: DAY }, route: `calendar/${DAY}:a-${ID}` },
  { ref: { kind: "visit", id: ID }, route: `calendar/a-${ID}` },
  { ref: { kind: "step", personId: ID }, route: `clients/${ID}`, opens: { kind: "person", id: ID } },
  { ref: { kind: "deal", personId: ID }, route: `clients/${ID}`, opens: { kind: "person", id: ID } },
  { ref: { kind: "deal", personId: ID, on: "pipeline" }, route: `clients/pipeline:p-${ID}` },
  {
    ref: { kind: "deal", personId: ID, dealKey: ID2, on: "pipeline" },
    route: `clients/pipeline:p-${ID}_${ID2}`,
  },
  { ref: { kind: "list", id: "quiet" }, route: "clients/seg:quiet" },
  { ref: { kind: "list", id: ID, saved: true }, route: `clients/list:${ID}` },
  { ref: { kind: "lead", id: ID }, route: `clients/leads:p-${ID}` },
  { ref: { kind: "lead", searchId: ID }, route: `clients/leads:s-${ID}` },
  { ref: { kind: "lead", id: ID, searchId: ID2 }, route: `clients/leads:s-${ID2}:p-${ID}` },
  { ref: { kind: "campaign", id: ID }, route: `campaigns/moment:${ID}` },
  {
    ref: { kind: "reach_out", id: ID },
    route: `campaigns/moment:${ID}`,
    opens: { kind: "campaign", id: ID },
  },
  { ref: { kind: "send", id: ID }, route: `broadcasts/run:${ID}` },
  { ref: { kind: "template", name: "appointment_reminder" }, route: "campaigns/message:appointment_reminder" },
  { ref: { kind: "review" }, route: "reports/reviews" },
  // One review, by its row: the lens with that review's reply box open (task 5.2, D1-review-twice).
  { ref: { kind: "review", id: ID }, route: `reports/reviews:${ID}` },
  { ref: { kind: "facts" }, route: "admin/workspace" },
  { ref: { kind: "rules" }, route: "admin/autonomy" },
  { ref: { kind: "channel" }, route: "admin/integrations" },
  { ref: { kind: "team" }, route: "admin/team" },
  { ref: { kind: "billing" }, route: "admin/billing" },
];

test("every kind of record says where it opens, or why it opens nowhere, and never both", () => {
  const written = new Set(RECORDS.map((r) => r.ref.kind));
  for (const kind of Object.keys(RECORD_KINDS)) {
    const without = RECORDS_WITHOUT_AN_ADDRESS[kind];
    if (without !== undefined) {
      assert.ok(!written.has(kind), `${kind} is in RECORDS_WITHOUT_AN_ADDRESS and has an address`);
      assert.ok(without.length >= 40, `${kind} says why in a sentence: ${without}`);
    } else {
      assert.ok(written.has(kind), `${kind} has no address (addressOf) and no reason (RECORDS_WITHOUT_AN_ADDRESS)`);
    }
  }
  for (const kind of [...written, ...Object.keys(RECORDS_WITHOUT_AN_ADDRESS)])
    assert.ok(Object.hasOwn(RECORD_KINDS, kind), `${kind} is no kind of record (RECORD_KINDS)`);
});

test("addressOf writes the route the sample says, a route without its slash", () => {
  for (const { ref, route } of RECORDS) {
    assert.equal(addressOf(ref), route, JSON.stringify(ref));
    assert.ok(!route.startsWith("/") && !route.includes("undefined") && !route.includes("null"), route);
  }
});

test("a record's address is a path the workspace routes and the frame has a page for, and its link and its mail say the same", () => {
  for (const { ref, route } of RECORDS) {
    const path = workspacePath("acme", route);
    assert.equal(routeOfPath(path), route, `${path} reads back as ${route}`);
    assert.equal(movedAddress({ pathname: path }), null, `${path}: no door rewrites it`);
    assert.equal(routeHasPage(route), true, `${route}: the frame has a page for it (${JSON.stringify(ref)})`);
    assert.equal(appLink("acme", route), path, "a mail links the path");
    // The hash spelling every bookmark and email used keeps landing on the same path.
    assert.equal(movedAddress({ pathname: "/w/acme", search: "", hash: `#/${route}` }), path, `#/${route}`);
  }
});

test("the page an address names opens the record the writer meant: the same kind and id", () => {
  for (const { ref, route, opens } of RECORDS) {
    assert.deepEqual(opensRoute(route), { ref: opens ?? ref }, `${route} opens ${JSON.stringify(opens ?? ref)}`);
    assert.deepEqual(recordNamedBy(route), opens ?? ref, route);
    // Written back, it is the same address: the page's reading and the writer's agree on one spelling.
    assert.equal(addressOf(opensRoute(route).ref), route, `${route} written again`);
  }
});

test("a visit the board opened names its view too, and opens the same visit on the same day as the writers' address", () => {
  // The board pushes the view it was opened over (contracts visitRoute's third word), so the week stays the week behind it.
  for (const view of ["week", "month", "agenda"])
    assert.deepEqual(opensRoute(`calendar/${view}:${DAY}:a-${ID}`), { ref: { kind: "visit", id: ID, day: DAY } }, view);
  assert.deepEqual(opensRoute(`calendar/week:a-${ID}`), { ref: { kind: "visit", id: ID } });
  // Day says no word: a day alone is Day's.
  assert.equal(visitRoute(ID, DAY, "day"), `calendar/${DAY}:a-${ID}`);
  assert.equal(visitRoute(ID, DAY, "week"), `calendar/week:${DAY}:a-${ID}`);
});

test("the people's word, the shell's name and a path's trailing slash name the same record", () => {
  assert.deepEqual(recordNamedBy(`people/${ID}`), { kind: "person", id: ID }, "the product's word");
  assert.deepEqual(recordNamedBy(`clients/${ID}`), { kind: "person", id: ID }, "the shell's own name");
  assert.deepEqual(opensRoute(routeOfPath(`/w/acme/people/${ID}/`)), { ref: { kind: "person", id: ID } });
  assert.deepEqual(recordNamedBy(`inbox/th-${ID}/x`), null, "an address with more after the thread is nobody's");
});

test("a retired route lands on the page that replaced it: a playbook is a campaign's drawer, and an audience opens the composer", () => {
  assert.deepEqual(recordNamedBy(`outbound/${ID}`), { kind: "campaign", id: ID });
  assert.deepEqual(opensRoute("outbound"), { view: "campaigns" });
  assert.deepEqual(opensRoute("broadcasts/lapsed"), { view: "campaigns/new" }, "People's Bring them back writes this");
  assert.equal(canonicalRoute(`outbound/${ID}`), addressOf({ kind: "campaign", id: ID }));
});

test("every page the frame draws is a page the registry opens, by the route alone: a page added to the frame is added here", () => {
  for (const page of Object.keys(SURFACE_ROUTES))
    assert.notEqual(
      opensRoute(page),
      null,
      `${page}: the registry has no parse for the page (surfaces/addresses.ts PAGES)`,
    );
  assert.deepEqual(
    opensRoute("outbound"),
    { view: "campaigns" },
    "the retired Playbooks page is read as Campaigns' home",
  );
});

test("the shapes that are no address open nothing: a word a page only begins with, a lens that is the Overview, a day that is no date", () => {
  for (const nope of [
    "reports/overview",
    "reports/foo",
    "reports/reviews:not-a-review",
    "reports/people:" + ID,
    "messages/x",
    "today/x",
    "admin/hours",
    "calendar/next-week",
    "calendar/2026-9-9",
    "calendar/year",
    "calendar/week:",
    "calendar/week:next",
    "calendar/month:2026-9-9:a-x",
    "campaigns/new:edit:",
    "broadcasts/run:",
    "inbox/xyz",
    "inbox/th-",
    "clients/seg:Not A Word",
    "clients/list:not-a-uuid",
    "conversations/a/b",
    "live/a:b",
    "start/nowhere",
    "nowhere",
    "nowhere/x",
  ])
    assert.equal(opensRoute(nope), null, nope);
});

test("a page opens its own views, which are no record: a day, a lens, a tab, the composer, the first run", () => {
  const views = {
    today: "today",
    inbox: "inbox",
    "inbox/new": "inbox/new",
    [`inbox/new:${ID}`]: "inbox/new",
    conversations: "conversations",
    "conversations/phone": "conversations/phone",
    [`conversations/phone:cv-${ID}`]: null,
    live: "live",
    calendar: "calendar",
    [`calendar/${DAY}`]: "calendar/day",
    "calendar/week": "calendar/week",
    "calendar/month": "calendar/month",
    "calendar/agenda": "calendar/agenda",
    "calendar/day": "calendar/day",
    [`calendar/week:${DAY}`]: "calendar/week",
    campaigns: "campaigns",
    "campaigns/new": "campaigns/new",
    "campaigns/in:reach_out": "campaigns/in",
    messages: "messages",
    broadcasts: "broadcasts",
    "broadcasts/get-yes": "broadcasts/get-yes",
    "broadcasts/to-send": "broadcasts/to-send",
    clients: "clients",
    "clients/new-list": "clients/new-list",
    "clients/leads": "clients/leads",
    "clients/leads:l-ready": "clients/leads",
    "clients/pipeline": "clients/pipeline",
    "clients/pipeline:v-proposals": "clients/pipeline",
    segments: "lists",
    start: "start",
    "start/phone": "start/step",
    "start/find": "start/step",
    admin: "admin",
    "admin/profile": "admin/profile",
    "admin/workspace/calendar": "admin/workspace",
    "admin/activity/team": "admin/activity",
    reports: "reports/overview",
    "reports/people": "reports/people",
    "reports/receptionist:2026-09-01~2026-09-20": "reports/receptionist",
    "reports/2026-09-01~2026-09-20": "reports/overview",
  };
  for (const [route, view] of Object.entries(views)) {
    const opened = opensRoute(route);
    if (view === null) assert.ok(opened && "ref" in opened, `${route} opens the call`);
    else assert.deepEqual(opened, { view }, route);
  }
});
