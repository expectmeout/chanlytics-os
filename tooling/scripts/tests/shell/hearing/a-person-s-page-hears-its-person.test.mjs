/**
 * A person's page hears its own person (decision 0058; the wiring's second audit, W-thread-wait-step-1, W-person-list-lead-1,
 * W-review-facts-rules-7).
 *
 * People's whole book hears a person, a hold, the rules, the facts, a lead and a reach-out reply only while its own list is on screen
 * (onlyOnItsPage), and a person's page is another route: a teammate renaming them, their unsubscribe link, a hold opened without a
 * message, a rule or the booking link changed elsewhere reached the open page only when the owner went back to the list. The page
 * has a surface of its own now (people-detail.ts personOverride), the one person on screen, owned there (PAGE_HEARS) and read on
 * those notices; a page that is not a person's keeps them for one, as every page-only kind is kept.
 *
 * Run on the real override, the real registry and the real client, over a stand-in fetch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../../_source.mjs";

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
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t1",
});

/** What the client asked for, by path. */
const asked = [];
globalThis.window.fetch = async (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  asked.push(u.pathname);
  return new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: "Not in this workspace" } }), {
    status: 404,
    headers: { "content-type": "application/json" },
  });
};

const { personOverride } = await importSrc("apps/dashboard/src/surfaces/people/people-detail.ts");
const { peopleOverride } = await importSrc("apps/dashboard/src/surfaces/people/surface.ts");
const { wantsRefresh } = await importSrc("apps/dashboard/src/legacy-bridge/surface-realtime.ts");
const { ownsTheScreen, routeSurfaces } = await importSrc("apps/dashboard/src/legacy-bridge/surface-registry.ts");

const PERSON = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
const at = (route) => {
  globalThis.location.hash = `#/${route}`;
};
const change = (table, event = "UPDATE", row = {}) => ({ table, event, row });

test("a person's page is the person surface's, on every tab, and no other page is", () => {
  for (const route of [`clients/${PERSON}`, `clients/${PERSON}/history`, `clients/${PERSON}/about`]) {
    assert.equal(ownsTheScreen("person", route), true, route);
    assert.ok(routeSurfaces("clients", `${PERSON}`).includes("person"), "drawn there, so read where it is drawn");
    assert.equal(
      ownsTheScreen("people", route),
      false,
      `${route}: People's whole book is not read again for one person`,
    );
  }
  for (const route of ["clients", "clients/pipeline", "clients/leads", "clients/person", "today", "inbox"])
    assert.equal(ownsTheScreen("person", route), false, route);
});

test("on a person's page it hears what the page draws of them that People hears on its own list alone; elsewhere it keeps them", () => {
  const HEARD = [
    ["contacts", "UPDATE", "a rename, a stop, a merge, the business they work at"],
    ["escalations", "INSERT", "a hold opened without a message"],
    ["escalations", "UPDATE", "a hold settled"],
    ["calls", "INSERT", "a call starting"],
    ["broadcasts", "INSERT", "a run made"],
    ["broadcasts", "UPDATE", "a run sent"],
    ["policies", "UPDATE", "the rule their lines name"],
    ["tenant_config", "UPDATE", "the booking link, the postal address"],
    ["playbooks", "UPDATE", "a campaign paused"],
    ["leads", "UPDATE", "their business renamed or moved on"],
  ];
  for (const [table, event, what] of HEARD) {
    at(`clients/${PERSON}/history`);
    assert.equal(wantsRefresh(personOverride, table, change(table, event)), true, `${table} ${event}: ${what}`);
    for (const away of ["clients", "today", "inbox"]) {
      at(away);
      assert.equal(wantsRefresh(personOverride, table, change(table, event)), false, `${table} ${event} on ${away}`);
    }
  }
  at(`clients/${PERSON}`);
  for (const [table, event, why] of [
    ["leads", "INSERT", "a lead run inserts every few seconds; a lead made now is nobody's business yet"],
    ["contacts", "INSERT", "a person made now (an import's hundred) is not the one on screen"],
    ["lead_searches", "UPDATE", "the searches that found leads are Leads'"],
    ["messages", "INSERT", "a message is heard through the Inbox and Conversations (their-thread.ts)"],
    ["conversations", "UPDATE", "a thread's move, through the Inbox's row of them (their-thread.ts)"],
    ["deals", "UPDATE", "People hears a deal on every page, and its read reloads the page"],
    [
      "reach_out_replies",
      "INSERT",
      "People hears a reply's signer on every page, and its read reloads the page (S1-1)",
    ],
  ])
    assert.equal(wantsRefresh(personOverride, table, change(table, event)), false, `${table} ${event}: ${why}`);
  // A call's transcript turn changes nothing the page draws; its end does.
  assert.equal(wantsRefresh(personOverride, "calls", change("calls", "UPDATE", { status: "ongoing" })), false);
  assert.equal(wantsRefresh(personOverride, "calls", change("calls", "UPDATE", { status: "ended" })), true);
  // People's own list rule is as it was: on a person's page it hears its own kinds and keeps the rest for its list.
  assert.equal(wantsRefresh(peopleOverride, "contacts", change("contacts")), false);
  assert.equal(wantsRefresh(peopleOverride, "deals", change("deals")), true);
  at("today");
});

test("its read is the one person on screen, and a page that is not a person's reads nothing", async () => {
  asked.length = 0;
  at(`clients/${PERSON}/visits`);
  await personOverride.apply();
  assert.deepEqual(asked, [`/api/v1/contacts/${PERSON}`]);
  asked.length = 0;
  for (const route of ["clients", "clients/leads", "clients/person", "today"]) {
    at(route);
    await personOverride.apply();
  }
  assert.deepEqual(asked, [], "no person on screen: nothing is read");
  assert.equal(personOverride.onDemand, true, "read where it is drawn, never by a boot on another page");
  assert.deepEqual(personOverride.events, ["surface:person"], "and the page is told by its own event");
  at("today");
});
