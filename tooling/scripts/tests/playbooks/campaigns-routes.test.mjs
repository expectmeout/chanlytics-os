/**
 * Campaigns' three pages are App Router pages (decision 0015, step 7), and what the frame says around each is the surface's
 * (src/surfaces/campaigns/routes.ts): the crumbs an address wears, named for a playbook or a run only once the surface holds
 * it, the audience a broadcast opens on named by the page's own rule, and the top bar's one act, which only a demo offers.
 * The routes the registry hands the frame take the addresses the rows took (`outbound/<id>`, `broadcasts/run:<id>`), and the
 * path says the product's word.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

const S = "../../../../apps/dashboard/src/surfaces";
const { playbooksChrome, broadcastsChrome } = await import(`${S}/campaigns/routes.ts`);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/routes.ts`);
const { workspacePath, routeOfPath } = await import("@chanlytics/contracts");

afterEach(() => {
  setSurfaceValue("playbooks", undefined);
  setSurfaceValue("broadcasts", undefined);
});

const playbooks = (rows = []) => ({ rows });
const broadcasts = (rows = [], audiences = []) => ({ rows, audiences });

test("Playbooks: the crumbs name Campaigns and Playbooks, and one playbook by name once the playbooks hold it", () => {
  assert.deepEqual(playbooksChrome({ param: null }).crumbs, ["Campaigns", "Playbooks"]);
  setSurfaceValue("playbooks", playbooks([{ id: "pb-1", name: "Win-back" }]));
  assert.deepEqual(playbooksChrome({ param: null }).crumbs, ["Campaigns", "Playbooks"]);
  assert.deepEqual(playbooksChrome({ param: "pb-1" }).crumbs, [
    "Campaigns",
    { label: "Playbooks", to: "outbound" },
    "Win-back",
  ]);
  assert.deepEqual(
    playbooksChrome({ param: "pb-9" }).crumbs,
    ["Campaigns", { label: "Playbooks", to: "outbound" }, "Playbook"],
    "a link to a playbook the surface does not hold names none",
  );
  setSurfaceValue("playbooks", undefined);
  assert.deepEqual(
    playbooksChrome({ param: "pb-1" }).crumbs,
    ["Campaigns", { label: "Playbooks", to: "outbound" }, "Playbook"],
    "before the first read no playbook is named",
  );
});

test("Playbooks: the top bar's act is the demo's Ask door, and only while the surface holds nothing", () => {
  assert.deepEqual(playbooksChrome({ param: null }).act, {
    label: "New campaign",
    glyph: "plus",
    primary: true,
    ask: true,
  });
  setSurfaceValue("playbooks", playbooks());
  assert.equal(playbooksChrome({ param: null }).act, null, "a real workspace's New playbook is the page's own");
});

test("Broadcasts: the crumbs name a run, the get-yes section, or an audience the surface offers, and every address is one mount", () => {
  const b = (param) => broadcastsChrome({ param });
  assert.deepEqual(b(null), { mount: "broadcasts", crumbs: ["Campaigns", "Broadcasts"] });
  const link = { label: "Broadcasts", to: "broadcasts" };
  assert.deepEqual(b("run:b-1").crumbs, ["Campaigns", link, "Broadcast"], "a run nothing holds yet");
  assert.deepEqual(b("get-yes").crumbs, ["Campaigns", link, "Get their yes"]);
  assert.deepEqual(b("s1").crumbs, ["Campaigns", "Broadcasts"], "an audience nothing holds yet");
  setSurfaceValue(
    "broadcasts",
    broadcasts(
      [{ id: "b-1", name: "Win-back · Sep 10" }],
      [
        { kind: "everyone", id: null, label: "Everyone who said yes" },
        { kind: "saved", id: "s1", label: "Regulars" },
        { kind: "list", id: "new_week", label: "New this week" },
        { kind: "playbook", id: "pb-1", label: "Win-back" },
      ],
    ),
  );
  assert.deepEqual(b("run:b-1").crumbs, ["Campaigns", link, "Win-back · Sep 10"]);
  assert.deepEqual(b("run:b-9").crumbs, ["Campaigns", link, "Broadcast"]);
  assert.deepEqual(b("s1").crumbs, ["Campaigns", link, "Regulars"]);
  assert.deepEqual(b("new_week").crumbs, ["Campaigns", link, "New this week"]);
  assert.deepEqual(
    b("pb-1").crumbs,
    ["Campaigns", "Broadcasts"],
    "only a list or a kept list is an audience the composer opens on, never a playbook's",
  );
  assert.deepEqual(b("nobody").crumbs, ["Campaigns", "Broadcasts"]);
  assert.equal(b("run:b-1").mount, "broadcasts");
});

test("the frame takes every address the rows took: a playbook, a run, an audience; Templates is its own route alone", () => {
  for (const route of [
    "outbound",
    "outbound/pb-1",
    "broadcasts",
    "broadcasts/run:b-1",
    "broadcasts/get-yes",
    "broadcasts/s1",
    "messages",
  ])
    assert.ok(routeHasPage(route), route);
  assert.ok(!routeHasPage("messages/x"), "Templates draws no address under it, as Reports draws none");
  assert.equal(SURFACE_ROUTES.outbound.activeNav, "outbound");
  assert.equal(SURFACE_ROUTES.messages.activeNav, "messages");
  assert.equal(SURFACE_ROUTES.broadcasts.pane, false, "Broadcasts draws in the page's own scroller, as its row said");
  assert.equal(SURFACE_ROUTES.outbound.pane, true);
});

test("the path says the product's word: playbooks and templates, and the shell's own route is what a page reads", () => {
  assert.equal(workspacePath("acme", "outbound/pb-1"), "/w/acme/playbooks/pb-1");
  assert.equal(workspacePath("acme", "messages"), "/w/acme/templates");
  assert.equal(workspacePath("acme", "broadcasts/run:b-1"), "/w/acme/broadcasts/run:b-1");
  assert.equal(routeOfPath("/w/acme/playbooks/pb-1"), "outbound/pb-1");
  assert.equal(routeOfPath("/w/acme/templates"), "messages");
});
