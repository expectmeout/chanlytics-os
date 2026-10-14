/**
 * Campaigns' home, the page (canvas A, "Lifecycle"): drawn on the stub React over the surfaces the seam hands it, in the
 * real surfaces' shape (the Playbooks and Broadcasts samples, which pass through the same contracts functions a workspace's
 * go through). What is proved here is what the page does with the view model (campaigns-home-vm: lifecycle.test.mjs): it draws
 * the rail, the lines under it and the three tiles; a press on a moment opens it by its address, a Turn on opens the composer
 * on its moment, New message opens it, and a press on a line that can be resumed resumes it; the drawer and the composer are
 * the address's, and host the pages' own panes as they are.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
  unmount,
} from "../../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
/** Friday 2 Oct 2026, 9:44 PM in New York: tomorrow is Saturday the 3rd. */
const NOW = Date.parse("2026-10-03T01:44:00Z");

const went = [];
const replaced = [];
const toasts = [];
const said = [];
installLegacyReact({
  location: {
    pathname: "/w/studio/campaigns",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  history: { replaceState() {}, back: () => said.push(["back"]) },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
});
const SRC = "../../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
await import(`${SRC}/legacy/components/data-bits.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, (t) => toasts.push(t)],
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}` } },
  appNavigate: (to, opts) => (opts && opts.replace ? replaced : went).push(to),
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
const { CampaignsHome } = await import(`${SRC}/surfaces/campaigns/home/home-page.tsx`);
const { useLedgerOnScreen } = await import(`${SRC}/surfaces/campaigns/home/ask-on-campaigns.tsx`);
const { Menu } = await import(`${SRC}/surfaces/kit/menu/menu.tsx`);
const { Icon } = await import(`${SRC}/surfaces/kit/icon/icon.tsx`);
const { Button } = await import(`${SRC}/surfaces/kit/button/button.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { playbooks: verbs } = await import(`${SRC}/surfaces/campaigns/playbooks/verbs.ts`);
const { setSurfaceValue, surfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { standingSaid } = await import(`${SRC}/surfaces/kit/head/standing.ts`);
const { PlaybookPane } = await import(`${SRC}/surfaces/campaigns/playbooks/card-detail.tsx`);
const { PlaybookComposer } = await import(`${SRC}/surfaces/campaigns/playbooks/composer.tsx`);
const { WriteToLeads } = await import(`${SRC}/surfaces/campaigns/reach-out/sources.tsx`);
const { ReachOutPane } = await import(`${SRC}/surfaces/campaigns/reach-out/row.tsx`);
const { PaneSheet } = await import(`${SRC}/surfaces/campaigns/home/pane-sheet.tsx`);
const { Segmented } = await import(`${SRC}/surfaces/kit/segmented/segmented.tsx`);
const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);
const { Picker } = await import(`${SRC}/surfaces/kit/picker/picker.tsx`);
const { BroadcastSend } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { TemplatesPage } = await import(`${SRC}/surfaces/campaigns/templates/templates-page.tsx`);
// The seam's own status for a surface: what a read that failed is told from one that has not landed by (the shell's route gate reads it).
const status = await import(`${SRC}/legacy-bridge/surface-status.ts`);

/** The surfaces of a workspace with a calendar: a win-back running, a visit reminder paused, a welcome with a run waiting. */
function surfaces(over = {}) {
  const now = new Date(NOW);
  const pb = playbooksSample(now);
  const bc = broadcastsSample(now);
  const pool = (pool, candidates = 0, saidYes = pool) => ({
    candidates,
    held: 0,
    pool,
    noYes: pool - saidYes,
    stopped: 0,
    noNumber: 0,
    saidYes,
  });
  // The call's text and the Library's count are the playbooks surface's slice, made of the settings read, the one read of the
  // templates (offered-templates.ts): the page draws the slice, so a test that hands Settings a library hands it here.
  const lib = over.settings && "templatesAll" in over.settings ? over.settings.templatesAll : pb.templates;
  setSurfaceValue("playbooks", {
    ...pb,
    pools: {
      new_week: pool(0),
      visit_tomorrow: pool(3, 3),
      visited: pool(2, 2),
      quiet_30: pool(5, 0, 0),
      ...(over.pools ?? {}),
    },
    library: lib,
    messages:
      over.settings && "messages" in over.settings
        ? over.settings.messages
        : lib
          ? contracts.campaignMessagesOf(lib)
          : null,
    ...(over.playbooks ?? {}),
  });
  // A report a test hands the broadcasts surface is Campaigns' own 30 days now (campaign_results), drawn from there.
  const { report: handed, ...broadcastsOver } = over.broadcasts ?? {};
  setSurfaceValue("broadcasts", {
    ...bc,
    reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 0 },
    ...broadcastsOver,
  });
  setSurfaceValue("campaign_results", {
    period: "30d",
    report:
      over.broadcasts && "report" in over.broadcasts
        ? handed
        : { days: 30, totals: { sent: 8, delivered: 8, read: 5, replied: 3, optIns: 3, optOuts: 2 }, sources: [] },
    chains: null,
    fetchedAt: 0,
  });
  setSurfaceValue("reach_outs", over.reachOuts ?? []);
  setSurfaceValue("settings", {
    templatesAll: pb.templates,
    messages: contracts.campaignMessagesOf(pb.templates),
    ...(over.settings ?? {}),
  });
}

afterEach(() => {
  for (const k of ["playbooks", "broadcasts", "campaign_results", "reach_outs", "settings"])
    setSurfaceValue(k, undefined);
  globalThis.__DEMO_MODE = false;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

const fresh = () => {
  freshTree();
  went.length = 0;
  replaced.length = 0;
  toasts.length = 0;
  said.length = 0;
};
const page = (param = null) => again(() => CampaignsHome({ param, nowMs: NOW }));
const allBy = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const pressed = (n) => press(n);
/** What the page last said to the frame's head (kit/head/standing.ts): the name, the line and the acts, which the frame draws. */
const headSaid = () => {
  const said = standingSaid();
  return { props: { children: [said?.title ?? null, said?.sentence ?? null, said?.act ?? null] } };
};

/* ---------------------------------------------- the page, drawn ---------------------------------------------- */

test("the home draws the rail's moments in order, the lines under it, and the three tiles, each from the view model", () => {
  surfaces();
  fresh();
  const tree = page();
  assert.ok(byTestId(tree, "campaigns-home"));
  assert.deepEqual(
    allBy(tree, "cmh-stage").map((s) => s.props["data-stage"]),
    ["first_contact", "before", "after", "quiet"],
    "the sample workspace has no deals, so no proposal follow-up",
  );
  assert.equal(allBy(tree, "cmh-people").length, 4);
  assert.ok(byTestId(tree, "cmh-reach"), "who can hear you");
  assert.ok(byTestId(tree, "cmh-coming"), "coming up");
  assert.ok(byTestId(tree, "cmh-results"), "what came back");
  assert.deepEqual(
    allBy(tree, "cmh-rung").map((r) => r.props["data-rung"]),
    ["people", "messages", "offers"],
  );
  assert.ok(allBy(tree, "cmh-row").length >= 3, "every campaign is a row of the ledger under the moments");
});

test("a rung's bar is its share of the whole: everyone in People fills it, and the rest is a part of its own (3 Oct: a whole share drew as half)", async () => {
  surfaces();
  fresh();
  const tree = page();
  const { Meter } = await import(`${SRC}/surfaces/kit/meter/meter.tsx`);
  const bar = (id) => find(all(tree, (n) => n.props?.["data-rung"] === id)[0], (n) => n.type === Meter);
  const people = bar("people");
  assert.equal(people.props.rest, undefined, "never the kit's rest, which grows as one more share");
  const [ink, rest] = people.props.parts;
  assert.equal(ink.share, 1, "everyone in People is the whole");
  assert.equal(rest.share, 0, "and nothing is left over");
  for (const id of ["messages", "offers"]) {
    const parts = bar(id).props.parts;
    assert.equal(parts[0].share + parts[1].share, 1, `${id}: the share and the rest make the whole`);
  }
});

test("the head says the page's line with its numbers in bold, the Library with its count, and New message", () => {
  surfaces();
  fresh();
  page();
  assert.equal(standingSaid()?.title, "Campaigns", "the page opens on its head, said to the frame");
  const head = headSaid();
  const text = textOf(head);
  // Facts alone (8 Oct 2026): the lede that explained the page every visit is gone. Where the workspace stands on its
  // channels is NOT in this line: under Glass the frame's head is a screen reader's, clipped to a point on a desk and
  // gone on a phone, so a door drawn in it was a link nobody could see and every Tab still landed on. It is drawn where
  // it is seen, at the rail's head.
  assert.doesNotMatch(text, /What goes out on its own/);
  assert.match(text, /moments are covered, and 7 of your 29 people can hear from you/);
  assert.doesNotMatch(text, /Sending on WhatsApp/);
  assert.equal(byTestId(head, "cmh-channels"), null, "no channel line in the frame's head");
  assert.equal(byTestId(head, "cmh-channels-door"), null, "and no door there");
  // At the rail's head, a chip each (Ruben, 11 Oct 2026, where three sentences stood): an open one says it sends, a closed
  // one is pressed for why, and one Set up is the door that mends it.
  const W = contracts.LIFECYCLE_WORDS.channels;
  const rail = byTestId(page(), "cmh-channels-rail");
  const named = all(rail, (n) => typeof n.props?.["aria-label"] === "string").map((n) => n.props["aria-label"]);
  assert.ok(named.includes(W.sending("WhatsApp")), named.join(" | "));
  assert.ok(named.includes(W.notSetUp("Text")), named.join(" | "));
  pressed(byTestId(rail, "cmh-channels-rail-sms"));
  const why = find(byTestId(page(), "cmh-channels-rail"), (n) => n.props?.className === "cmh-chan-why");
  assert.match(textOf(why), /No texting line yet/, "the closed one says why, pressed");
  assert.ok(byTestId(rail, "cmh-channels-rail-door"), "and Set up is the door, where it is seen");
  assert.ok(byTestId(head, "cmh-library"));
  assert.match(textOf(byTestId(head, "cmh-library")), /Library/);
  assert.ok(byTestId(head, "cmh-new"));
});

test("the head keeps the quiet allowance line once half the month's emails or texts are used, and says nothing before", () => {
  surfaces({ broadcasts: { month_sent: { email: 1240, sms: 0 } } });
  fresh();
  page();
  assert.match(textOf(headSaid()), /1,240 of 2,000 emails used this month/);
  surfaces({ broadcasts: { month_sent: { email: 100, sms: 0 } } });
  fresh();
  page();
  assert.ok(!/used this month/.test(textOf(headSaid())));
});

test("the page draws nothing before the playbooks have landed, and a demo session draws the samples", () => {
  fresh();
  assert.equal(page(), null, "a surface not read yet: nothing, never a seeded page");
  globalThis.__DEMO_MODE = true;
  fresh();
  const tree = page();
  assert.ok(byTestId(tree, "campaigns-home"), "a demo draws the Playbooks and Broadcasts samples");
  assert.equal(
    allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet").props["data-state"],
    "on",
    "the sample's win-back is running",
  );
});

test("the phone opens on the moments: who can hear you one line in their head, and every campaign under them on the journey's line", () => {
  surfaces();
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const tree = page();
  const home = byTestId(tree, "campaigns-home");
  assert.equal(home.props["data-phone"], "true");
  assert.equal(allBy(tree, "cmh-rung").length, 0, "no ladder on a phone: one line");
  assert.equal(
    byTestId(tree, "cmh-also"),
    null,
    "no Also tile: the lists and the reach-outs are groups of the one list",
  );
  const rail = byTestId(tree, "cmh-rail");
  const reach = byTestId(rail, "cmh-reach");
  assert.ok(reach, "the reach is said inside the moments' pane");
  assert.equal(allBy(tree, "cmh-reach").filter((n) => typeof n.type === "string").length, 1, "once");
  assert.match(textOf(reach), /7 of 29 can hear you/);
  assert.match(textOf(reach), /0 to offers/);
  assert.equal(all(reach, (n) => n.type === Meter).length, 0, "no bar: the figure says it");
  // The sample has no texting line: a channel is closed, so where the workspace stands is said, with its door.
  assert.ok(byTestId(reach, "cmh-channels"));
  // The amber "0 to offers" is itself the door to how that yes is got (Ruben, 11 Oct 2026: it stood apart as "Get their yes").
  const yes = all(reach, (n) => n.type === "a" && n.props?.["data-testid"] === "cmh-phone-yes")[0];
  assert.ok(yes, "the door is a link");
  assert.equal(textOf(yes), "0 to offers");
  assert.equal(yes.props["aria-label"], "0 to offers: Get their yes", "named for where it goes");
  assert.match(String(yes.props.href), /broadcasts\/get-yes$/);
  assert.ok(byTestId(rail, "cmh-ledger"), "the campaigns stand in the same pane, under the line");
  const blocks = all(
    home,
    (n) =>
      typeof n.type === "string" &&
      String(n.props?.className ?? "")
        .split(" ")
        .includes("cmh-block"),
  );
  assert.equal(blocks[0].props["data-testid"], "cmh-rail", "the moments are the page's first pane");
  assert.ok(
    byTestId(tree, "cmh-coming") && byTestId(tree, "cmh-results"),
    "what is coming and what came back stand below",
  );
});

/* --------------------------------------------------- presses --------------------------------------------------- */

test("a press on a moment opens its playbook by its address, pushed so Back closes it", () => {
  surfaces();
  fresh();
  const tree = page();
  const winback = allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet");
  pressed(find(winback, (n) => n.props?.["data-testid"] === "cmh-open"));
  assert.deepEqual(went, ["campaigns/moment:pb-sample-winback"]);
});

test("a Turn on opens the composer on the moment it was pressed for", () => {
  surfaces();
  fresh();
  const tree = page();
  const after = allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "after");
  pressed(find(after, (n) => n.props?.["data-testid"] === "cmh-turn-on"));
  assert.deepEqual(went, ["campaigns/new:moment:visited"]);
  fresh();
  const visit = allBy(page(), "cmh-stage").find((s) => s.props["data-stage"] === "before");
  assert.equal(
    find(visit, (n) => n.props?.["data-testid"] === "cmh-open")?.props["data-testid"],
    "cmh-open",
    "a paused playbook opens its drawer",
  );
});

test("New message opens the composer on Send once", () => {
  surfaces();
  fresh();
  page();
  pressed(byTestId(headSaid(), "cmh-new"));
  assert.deepEqual(went, ["campaigns/new"]);
});

test("a paused campaign resumes from its row, asked in place, through the playbooks' own verb, and says so", async () => {
  surfaces({
    playbooks: {
      rows: playbooksSample(new Date(NOW)).rows.map((p) => (p.trigger === "quiet_30" ? p : p)),
    },
  });
  // The month's offer, paused, is a line of its own; resuming it is the verb, then a toast.
  const pb = playbooksSample(new Date(NOW));
  const base = pb.rows[0];
  const month = {
    ...base,
    id: "pb-month",
    name: "The month's offer",
    trigger: "everyone_monthly",
    state: "paused",
    next: "paused",
    triggerLabel: "The month's offer",
  };
  surfaces({ playbooks: { rows: [...pb.rows, month] } });
  fresh();
  verbs.resume = async (id, opts) => {
    said.push(["resume", id]);
    opts.onAccepted({});
    return { ok: true, data: {} };
  };
  const monthRow = (t) => allBy(t, "cmh-row").find((r) => r.props["data-row"] === "pb-month");
  assert.ok(monthRow(page()), "the month's offer is a row of the ledger");
  pressed(byTestId(monthRow(page()), "cmh-resume"));
  const ask = byTestId(monthRow(page()), "cmh-resume-confirm");
  assert.ok(ask, "Resume asks first, in place (decision 7)");
  assert.match(textOf(ask), /The month's offer/);
  assert.deepEqual(said, [], "nothing resumes on the first press");
  pressed(byTestId(monthRow(page()), "cmh-resume-yes"));
  await settle();
  assert.deepEqual(said, [["resume", "pb-month"]]);
  assert.match(textOf(toasts[0].msg), /The month's offer resumed/);
  assert.equal(monthRow(page()).props["data-settled"], "true", "it keeps its place and settles once");
});

test("Copy the phrase copies the words a customer sends to say yes to offers; Show the code is the get-yes address", async () => {
  surfaces();
  fresh();
  const copied = [];
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async (t) => copied.push(t) } },
    configurable: true,
  });
  const tree = page();
  await byTestId(tree, "cmh-copy").props.onClick();
  assert.deepEqual(copied, ["YES OFFERS"]);
  pressed(byTestId(tree, "cmh-code"));
  assert.deepEqual(went, ["broadcasts/get-yes"]);
});

test("a run in what came back and a line in coming up open their run on the Broadcasts page", () => {
  surfaces();
  fresh();
  const tree = page();
  const run = allBy(tree, "cmh-run-open");
  assert.ok(run.length > 0);
  pressed(run[0]);
  assert.match(went[0], /^broadcasts\/run:/);
});

/* ------------------------------- a waiting run, approved or skipped where it waits ------------------------------- */

/**
 * The sample's runs, its waiting one made for the business's own today (the sample stamps the demo zone's day; said here
 * too, so a test that changes the day reads as one), with whatever a test changes of it.
 */
const waitingRows = (over = {}) =>
  broadcastsSample(new Date(NOW)).rows.map((r) =>
    r.state === "pending_approval" ? { ...r, run_for: "2026-10-02", ...over } : r,
  );
const waitingLine = (tree) => allBy(tree, "cmh-row").find((r) => r.props["data-state"] === "waiting");
/** One of the playbooks' verbs answered by the test for as long as `during` runs, then put back. */
async function withVerb(name, answer, during) {
  const real = verbs[name];
  const calls = [];
  verbs[name] = async (id, opts) => {
    calls.push(id);
    const r = answer(id);
    if (r.ok) opts.onAccepted(r.data);
    return r;
  };
  try {
    await during(calls);
  } finally {
    verbs[name] = real;
  }
}

test("a run waiting on you is approved on its row, through the broadcast's own door, and says how many and when", async () => {
  surfaces({ broadcasts: { rows: waitingRows() } });
  fresh();
  const answer = () => ({ ok: true, data: { recipient_count: 4, scheduled_for: null, moved_from: null } });
  await withVerb("approveRun", answer, async (calls) => {
    const line = waitingLine(page());
    assert.equal(line.props["data-state"], "waiting");
    assert.match(textOf(line), /Welcome/);
    assert.match(textOf(line), /Waiting for your approval/);
    const approve = byTestId(line, "cmh-approve");
    assert.match(textOf(approve), /Approve · 4 people/);
    assert.equal(textOf(byTestId(line, "cmh-skip")).trim(), "Skip");
    await approve.props.onClick();
    assert.deepEqual(calls, ["b-sample-2"], "the run's own id, once");
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].tone, "ok");
    assert.equal(textOf(toasts[0].msg), "Welcome approved — 4 people, sending now");
    const after = allBy(page(), "cmh-row").find((r) => r.props["data-row"] === line.props["data-row"]);
    assert.equal(after.props["data-settled"], "true", "the row keeps its place and settles once");
    // Coming up keeps the run's time and says it waits; it decides nothing (one decision per run per screen).
    const coming = allBy(page(), "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
    assert.match(textOf(coming), /4 people\. Nothing sends until you say so\./);
    assert.equal(byTestId(coming, "cmh-waiting-acts"), null);
    // The name is the door to the campaign's drawer, which shows the run and its door to Sent.
    pressed(byTestId(line, "cmh-row-open"));
    assert.equal(went.at(-1), `campaigns/moment:${line.props["data-row"]}`);
  });
});

test("an approval the server refuses is said in the server's words, and the line's acts come back", async () => {
  surfaces({ broadcasts: { rows: waitingRows() } });
  fresh();
  await withVerb(
    "approveRun",
    () => ({ ok: false, message: "That run was already approved." }),
    async () => {
      await byTestId(waitingLine(page()), "cmh-approve").props.onClick();
      assert.equal(toasts[0].tone, "danger");
      assert.equal(textOf(toasts[0].msg), "That run was already approved.");
      assert.equal(byTestId(waitingLine(page()), "cmh-approve").props.disabled, false, "nothing stays busy");
      assert.equal(
        waitingLine(page()).props["data-settled"],
        undefined,
        "a refused act settles no row: nothing changed",
      );
    },
  );
});

test("Skip asks on the line before it skips; No puts the two acts back, Yes skips and says nothing will send", async () => {
  surfaces({ broadcasts: { rows: waitingRows() } });
  fresh();
  await withVerb(
    "skipRun",
    () => ({ ok: true, data: { was: "pending_approval" } }),
    async (calls) => {
      pressed(byTestId(waitingLine(page()), "cmh-skip"));
      let line = waitingLine(page());
      const question = byTestId(line, "cmh-skip-confirm");
      assert.ok(question, "the question stands where the acts stood");
      assert.match(textOf(question), /Skip this run of Welcome\?/);
      assert.match(textOf(question), /Nothing sends, and the run closes\./);
      assert.equal(byTestId(line, "cmh-approve"), null);
      assert.deepEqual(calls, [], "nothing is skipped by the first press");
      pressed(byTestId(line, "cmh-skip-no"));
      line = waitingLine(page());
      assert.ok(byTestId(line, "cmh-approve"), "No puts Approve and Skip back");
      pressed(byTestId(line, "cmh-skip"));
      await byTestId(waitingLine(page()), "cmh-skip-yes").props.onClick();
      assert.deepEqual(calls, ["b-sample-2"]);
      assert.equal(textOf(toasts[0].msg), "Welcome skipped — nothing will send");
      assert.ok(byTestId(waitingLine(page()), "cmh-approve"), "the question is gone once it is answered");
    },
  );
});

test("the demo's waiting run is made for the demo's own day: at 9:44 PM in New York it is still today's, and can be approved", () => {
  const run = broadcastsSample(new Date(NOW)).rows.find((r) => r.state === "pending_approval");
  assert.equal(run.run_for, "2026-10-02", "the business's day, where the UTC day was already the 3rd");
  assert.equal(run.name, "Welcome · 2026-10-02");
  surfaces();
  fresh();
  assert.ok(byTestId(waitingLine(page()), "cmh-approve"), "the sample's own run, untouched, is offered its Approve");
});

test("a run that is decided on its sheet has no acts anywhere on the page: a reach-out's, and one whose playbook is gone", () => {
  const noneWaiting = playbooksSample(new Date(NOW)).rows.map((p) => ({
    ...p,
    totals: { ...p.totals, waiting: null },
  }));
  surfaces({
    playbooks: { rows: noneWaiting },
    broadcasts: { rows: waitingRows({ playbook_id: null, audience: { kind: "reach_out" }, recipient_count: 12 }) },
  });
  fresh();
  let tree = page();
  assert.equal(allBy(tree, "cmh-waiting-acts").length, 0, "no one-tap approval of first cold emails");
  let line = allBy(tree, "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
  assert.match(textOf(line), /12 businesses\. Nothing sends until you say so\./);
  pressed(byTestId(line, "cmh-coming-open"));
  assert.match(went.at(-1), /^broadcasts\/run:b-sample-2$/);
  surfaces({ playbooks: { rows: noneWaiting }, broadcasts: { rows: waitingRows({ playbook_id: "pb-gone" }) } });
  fresh();
  tree = page();
  assert.equal(allBy(tree, "cmh-waiting-acts").length, 0);
  line = allBy(tree, "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
  assert.ok(byTestId(line, "cmh-coming-open"), "Coming up's name is the door to its sheet");
});

test("while the workspace is paused a waiting run says the pause and offers Skip alone: the approve door would answer 402", () => {
  const ready = { ...broadcastsSample(new Date(NOW)).ready, paused: true };
  surfaces({ broadcasts: { rows: waitingRows(), ready } });
  fresh();
  const line = waitingLine(page());
  assert.ok(textOf(line).includes(contracts.CAMPAIGNS_PAUSED_WORDS), "the composers' own sentence for the pause");
  assert.equal(byTestId(line, "cmh-approve"), null);
  assert.equal(textOf(byTestId(line, "cmh-skip")).trim(), "Skip");
});

test("a skip of a run that was already going says so: the receipt is the server's answer, never a promise that nothing sends", async () => {
  surfaces({ broadcasts: { rows: waitingRows() } });
  fresh();
  await withVerb(
    "skipRun",
    () => ({ ok: true, data: { was: "sending" } }),
    async () => {
      pressed(byTestId(waitingLine(page()), "cmh-skip"));
      await byTestId(waitingLine(page()), "cmh-skip-yes").props.onClick();
      assert.equal(textOf(toasts[0].msg), "Welcome stops after this batch");
    },
  );
});

test("two runs wait: each act names its run, and while one press is with the server the other row's question waits in sight and stays open", async () => {
  const first = waitingRows().find((r) => r.state === "pending_approval");
  const second = {
    ...first,
    id: "b-second",
    name: "Win-back · 2026-10-02",
    playbook_id: "pb-sample-winback",
    audience: { kind: "playbook", id: "pb-sample-winback", label: "Win-back" },
    recipient_count: 6,
  };
  const rows = playbooksSample(new Date(NOW)).rows.map((p) =>
    p.id === "pb-sample-winback"
      ? { ...p, totals: { ...p.totals, waiting: { id: "b-second", recipient_count: 6 } } }
      : p,
  );
  surfaces({ playbooks: { rows }, broadcasts: { rows: [...waitingRows(), second] } });
  fresh();
  const lineOf = (name) =>
    allBy(page(), "cmh-row").find((r) => r.props["data-state"] === "waiting" && textOf(r).includes(name));
  // To a screen reader "Approve" twice says nothing of which: each act carries its run's name.
  assert.equal(byTestId(lineOf("Welcome"), "cmh-approve").props["aria-label"], "Approve this run of Welcome");
  assert.equal(byTestId(lineOf("Welcome"), "cmh-skip").props["aria-label"], "Skip this run of Welcome");
  assert.equal(byTestId(lineOf("Win-back"), "cmh-approve").props["aria-label"], "Approve this run of Win-back");
  assert.equal(byTestId(lineOf("Win-back"), "cmh-skip").props["aria-label"], "Skip this run of Win-back");
  // Skip is asked on the second row, then the first row's Approve goes to the server and has not answered yet.
  pressed(byTestId(lineOf("Win-back"), "cmh-skip"));
  const real = verbs.approveRun;
  const calls = [];
  let release = () => {};
  verbs.approveRun = (id, opts) =>
    new Promise((resolve) => {
      calls.push(id);
      release = () => {
        const data = { recipient_count: 4, scheduled_for: null, moved_from: null };
        opts.onAccepted(data);
        resolve({ ok: true, data });
      };
    });
  try {
    const going = byTestId(lineOf("Welcome"), "cmh-approve").props.onClick();
    assert.match(textOf(byTestId(lineOf("Welcome"), "cmh-approve")), /Approving…/);
    assert.equal(byTestId(lineOf("Welcome"), "cmh-approve").props["aria-label"], undefined, "its words say it now");
    // The other row's Yes is not a press that would be dropped unheard: it waits, drawn as waiting.
    assert.equal(byTestId(lineOf("Win-back"), "cmh-skip-yes").props.disabled, true);
    release();
    await going;
    assert.deepEqual(calls, ["b-sample-2"]);
    // The first press finishing closes its own business, never the question asked on another row.
    assert.ok(byTestId(lineOf("Win-back"), "cmh-skip-confirm"), "the second row's question is still there");
    assert.equal(byTestId(lineOf("Win-back"), "cmh-skip-yes").props.disabled, false, "and can be answered now");
  } finally {
    verbs.approveRun = real;
  }
});

test("a press that throws leaves nothing busy: the next press is taken", async () => {
  surfaces({ broadcasts: { rows: waitingRows() } });
  fresh();
  const real = verbs.approveRun;
  verbs.approveRun = async () => {
    throw new Error("the wire fell over");
  };
  try {
    await assert.rejects(() => byTestId(waitingLine(page()), "cmh-approve").props.onClick(), /the wire fell over/);
  } finally {
    verbs.approveRun = real;
  }
  assert.equal(byTestId(waitingLine(page()), "cmh-approve").props.disabled, false);
  await withVerb(
    "approveRun",
    () => ({ ok: true, data: { recipient_count: 4, scheduled_for: null, moved_from: null } }),
    async (calls) => {
      await byTestId(waitingLine(page()), "cmh-approve").props.onClick();
      assert.deepEqual(calls, ["b-sample-2"], "the ref that holds a second press was let go");
    },
  );
});

test("a run whose day has passed says the verb's sentence and offers Skip alone; a viewer is told who may approve and has no Skip", () => {
  // Made for the 30th, read on the 2nd: the approve route would answer 409, so the line never offers it.
  surfaces({ broadcasts: { rows: waitingRows({ run_for: "2026-09-30" }) } });
  fresh();
  const late = waitingLine(page());
  assert.match(textOf(late), /This run was made for Sep 30 and that day has passed/);
  assert.equal(byTestId(late, "cmh-approve"), null);
  assert.equal(textOf(byTestId(late, "cmh-skip")).trim(), "Skip");
  // A role that may not approve: the button is drawn with the role's sentence, as the drawer draws it, and Skip is not.
  const realCanDo = globalThis.canDo;
  const realGate = globalThis.gate;
  globalThis.canDo = () => false;
  globalThis.gate = (perm, doing) => ({
    "aria-disabled": "true",
    title: "Only an owner or operator can " + doing + ".",
  });
  try {
    surfaces({ broadcasts: { rows: waitingRows() } });
    fresh();
    const line = waitingLine(page());
    const approve = byTestId(line, "cmh-approve");
    assert.equal(approve.props.title, "Only an owner or operator can approve a run.");
    assert.equal(byTestId(line, "cmh-skip"), null);
    // And a late run leaves such a role nothing to press: its words say why it waits.
    surfaces({ broadcasts: { rows: waitingRows({ run_for: "2026-09-30" }) } });
    fresh();
    assert.equal(byTestId(waitingLine(page()), "cmh-waiting-acts"), null);
  } finally {
    globalThis.canDo = realCanDo;
    globalThis.gate = realGate;
  }
});

test("a moment whose playbook has a run waiting wears a clock on its node, on a desk and a phone; a covered one keeps its check", () => {
  const rows = playbooksSample(new Date(NOW)).rows;
  const winBack = rows.find((p) => p.trigger === "quiet_30");
  assert.ok(winBack, "the sample has a win-back");
  const waits = rows.map((p) =>
    p.id === winBack.id ? { ...p, state: "running", totals: { waiting: { id: "r-9", recipient_count: 4 } } } : p,
  );
  const nodeOf = (tree, id) => {
    const stage = [...allBy(tree, "cmh-stage"), ...allBy(tree, "cmh-group-head")].find(
      (s) => s.props["data-stage"] === id,
    );
    // The node's glyph: the kit's Icon, drawn as the real one here, named by its `name`.
    const node = find(stage, (n) => n.props?.className === "cmh-node");
    return [stage.props["data-waits"], find(node, (n) => typeof n.props?.name === "string").props.name];
  };
  surfaces({ playbooks: { rows: waits } });
  fresh();
  assert.deepEqual(nodeOf(page(), "quiet"), ["true", "clock"]);
  assert.deepEqual(
    nodeOf(page(), "first_contact"),
    [undefined, "check"],
    "the receptionist is covered, and waits on nobody",
  );
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  assert.deepEqual(nodeOf(page(), "quiet"), ["true", "clock"], "the phone's head on the line says it too");
});

/* ----------------------------------------- the drawer and the composer ----------------------------------------- */

const sheet = (tree) => find(tree, (n) => n.type === PaneSheet);

/** A reach-out as GET reach-outs lists it: a first email and a nudge four days after, over a search's leads. */
const chainOf = (over = {}) => ({
  root_id: "ch-1",
  name: "Cold email to studios",
  search: { id: "s-1", name: "Studios near us" },
  state: "running",
  include_unconfirmed: false,
  gap_minutes: 12,
  mailbox_ids: [],
  signed_by: "Sam",
  created_at: "2026-09-20T00:00:00Z",
  mailboxes: [{ address: "sam@mail.example.com", sent_days: 0, daily_cap: 40, customer_domain: false }],
  steps: [
    {
      id: "ch-1",
      n: 0,
      after_days: null,
      subject: "Quick one",
      body: "{{opening}}",
      template_id: "t1",
      state: "running",
    },
    { id: "n1", n: 1, after_days: 4, subject: null, body: "Just checking in.", template_id: "t2", state: "running" },
  ],
  next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
  ...over,
});

test("a playbook's address opens its own detail in the sheet: the pane the Playbooks page opened, unchanged", () => {
  surfaces();
  fresh();
  const tree = page("moment:pb-sample-winback");
  const s = sheet(tree);
  assert.ok(s, "the drawer is a pane sheet");
  assert.equal(s.props.open, true);
  assert.equal(s.props.title, "Quiet or lapsed", "the sheet says where the moment stands on the rail");
  const pane = find(s, (n) => n.type === PlaybookPane);
  assert.ok(pane, "its own detail, hosted as it is");
  assert.equal(pane.props.p.id, "pb-sample-winback");
  // Closing goes home: replaced where a link arrived at it, and back where the page opened it (use-home.ts useHomeNav).
  s.props.onClose();
  assert.deepEqual(replaced, ["campaigns"]);
});

test("a link to a playbook that is gone says so once the chains were read, and a reach-out opens its own pane", () => {
  surfaces();
  fresh();
  const gone = page("moment:pb-nothing");
  assert.equal(
    find(gone, (n) => n.props?.testid === "pb-gone")?.props.title,
    "That campaign isn't here any more.",
    "a campaign to its reader, never a playbook (decision 19)",
  );
  setSurfaceValue("reach_outs", undefined);
  fresh();
  const reading = page("moment:pb-nothing");
  assert.ok(
    !(byTestId(reading, "pb-gone") || find(reading, (n) => n.props?.testid === "pb-gone")),
    "unread chains: not yet known to be missing",
  );
  setSurfaceValue("reach_outs", [chainOf()]);
  fresh();
  const tree = page("moment:ch-1");
  assert.ok(
    find(tree, (n) => n.type === ReachOutPane),
    "a chain's own pane",
  );
  assert.equal(sheet(tree).props.title, "Reach-outs", "the drawer's kicker is the campaign's group");
});

test("New message hosts the send screen under Send once, the playbook composer under Every time, and where a reach-out starts under Write to leads", () => {
  surfaces();
  fresh();
  const once = page("new");
  const s = sheet(once);
  assert.equal(s.props.title, "New message");
  assert.equal(s.props.askFirst, true, "the sheet's close asks where the composer asks");
  const seg = find(s.props.tools, (n) => n.type === Segmented);
  assert.equal(seg.props.value, "once");
  assert.deepEqual(
    seg.props.options.map((o) => [o.value, o.label]),
    [
      ["once", "Send once"],
      ["every", "Every time"],
      ["leads", "Write to leads"],
    ],
  );
  seg.props.onValueChange("every");
  assert.deepEqual(replaced, ["campaigns/new:every"], "a choice of kind replaces the address, never pushes");
  fresh();
  const every = page("new:every");
  assert.equal(find(sheet(every).props.tools, (n) => n.type === Segmented).props.value, "every");
  assert.ok(find(every, (n) => n.type === PlaybookComposer));
  fresh();
  const leads = page("new:leads");
  assert.equal(find(sheet(leads).props.tools, (n) => n.type === Segmented).props.value, "leads");
  assert.ok(
    find(leads, (n) => n.type === WriteToLeads),
    "the reach-out's sources, read when it is chosen",
  );
});

test("Turn on lands the composer on its moment, and a playbook changed has no choice of kind", () => {
  surfaces();
  fresh();
  const tree = page("new:moment:visited");
  const composer = find(tree, (n) => n.type === PlaybookComposer);
  assert.equal(composer.props.initialTrigger, "visited");
  assert.equal(composer.props.editing, null);
  fresh();
  const edit = page("new:edit:pb-sample-winback");
  const c = find(edit, (n) => n.type === PlaybookComposer);
  assert.equal(c.props.editing.id, "pb-sample-winback", "the playbook the drawer showed");
  assert.equal(sheet(edit).props.tools, undefined, "changing one is not choosing a kind");
});

test("a word the page does not know is the home, never a page of nothing", () => {
  surfaces();
  fresh();
  const tree = page("surprise");
  assert.equal(sheet(tree), null);
  assert.ok(byTestId(tree, "campaigns-home"));
});

test("the Library is a door to the Templates page, and Back closes a thing the page opened", () => {
  surfaces();
  fresh();
  page();
  pressed(byTestId(headSaid(), "cmh-library"));
  assert.deepEqual(went, ["messages"], "the Library is the messages page, a room of the home");
  // A moment opened by a press is a pushed entry: closing it goes back, so Back and Close are one thing.
  fresh();
  const tree = page();
  const winback = allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet");
  pressed(find(winback, (n) => n.props?.["data-testid"] === "cmh-open"));
  const open = page("moment:pb-sample-winback");
  sheet(open).props.onClose();
  assert.deepEqual(said, [["back"]], "back to the entry the press made");
  assert.deepEqual(replaced, []);
});

/* ------------------------------------------ a read that failed is said ------------------------------------------ */

/** The surfaces a Retry was pressed for, in order (the frame's runner, `window.__refreshSurface`). */
const refreshed = [];
globalThis.__refreshSurface = async (key) => {
  refreshed.push(key);
};

/** The failed read at a testid: its words, and the Retry's press. */
const failedAt = (tree, id) => {
  const node = byTestId(tree, id);
  return node ? { node, words: textOf(node), retry: byTestId(tree, `${id}-retry`) } : null;
};

test("a templates read that failed is said in the call's text's place, with a Retry that reads the settings surface again: the one read of the templates", () => {
  surfaces({ settings: { templatesAll: null } });
  fresh();
  refreshed.length = 0;
  const tree = page();
  const failed = failedAt(tree, "cmh-templates-failed");
  assert.ok(failed, "the read that failed is said, never a line that is not there");
  assert.match(failed.words, /Couldn't read your templates/);
  assert.match(
    failed.words,
    /The call's text and the Library's count show once they read\. Everything else here is current\./,
  );
  // The call's text keeps its row and says nothing of its state (lane 2's view model: a library unread or failed says
  // nothing, ledger.test.mjs); what failed is said in its group, First contact, under it.
  const firstContact = allBy(tree, "cmh-group").find((g) => g.props["data-group"] === "first_contact");
  assert.ok(byTestId(firstContact, "cmh-templates-failed"), "in First contact, where the call's text stands");
  const callText = allBy(firstContact, "cmh-row").find((r) => r.props["data-kind"] === "call_text");
  assert.equal(
    find(callText, (n) => n.props?.className === "cmh-row-dot").props["data-tone"],
    "plain",
    "and its row wears no amber for a library it did not read",
  );
  assert.doesNotMatch(textOf(callText), /No message/, "nor says the message is missing, which nobody read");
  assert.equal(textOf(byTestId(tree, "cmh-library")).includes("0"), false, "no Library count it did not read");
  assert.equal(allBy(tree, "cmh-stage").length, 4, "the rest of the page is drawn, and current");
  pressed(failed.retry);
  assert.deepEqual(
    refreshed,
    ["settings"],
    "its Retry reads the settings surface, the one read of the templates, which the playbooks surface is made of",
  );
  surfaces();
  fresh();
  assert.equal(byTestId(page(), "cmh-templates-failed"), null, "read again: nothing to say");
});

test("a pools read that failed is said once, over the rail, and the people it could not count stay a dash", () => {
  surfaces({ playbooks: { countsRead: false }, pools: { quiet_30: null } });
  fresh();
  refreshed.length = 0;
  const tree = page();
  const failed = failedAt(tree, "pb-counts-failed");
  assert.ok(failed, "the same words and testid the Playbooks page said it by");
  assert.match(failed.words, /Couldn't read who each moment reaches/);
  assert.match(failed.words, /The moments show who they reach once it reads\. Everything else here is current\./);
  const win = allBy(tree, "cmh-stage").find((s) => s.props["data-stage"] === "quiet");
  assert.equal(
    textOf(find(win, (n) => n.props?.["data-testid"] === "cmh-people")),
    "—",
    "never a zero it did not count",
  );
  pressed(failed.retry);
  assert.deepEqual(refreshed, ["playbooks"], "its Retry reads the playbooks again");
  surfaces();
  fresh();
  assert.equal(byTestId(page(), "pb-counts-failed"), null);
});

test("a reach-outs read that failed is said where the chains would follow, and an empty read says nothing", () => {
  surfaces({ reachOuts: null });
  setSurfaceValue("reach_outs", null);
  fresh();
  refreshed.length = 0;
  const tree = page();
  const failed = failedAt(tree, "pb-chains-failed");
  assert.ok(failed, "a chains read that failed is said, not an empty list");
  assert.match(failed.words, /Couldn't read your reach-outs/);
  assert.match(failed.words, /The moments above are current\./);
  assert.equal(allBy(tree, "cmh-row").filter((r) => r.props["data-kind"] === "chain").length, 0);
  pressed(failed.retry);
  assert.deepEqual(refreshed, ["reach_outs"], "its Retry reads the reach-outs, not the moments");
  setSurfaceValue("reach_outs", []);
  fresh();
  assert.equal(byTestId(page(), "pb-chains-failed"), null, "read, and none made: nothing to say");
  setSurfaceValue("reach_outs", undefined);
  fresh();
  assert.equal(byTestId(page(), "pb-chains-failed"), null, "not read yet is not failed");
});

test("a campaign report that failed is said in the numbers' place, with a Retry; the runs below stand", () => {
  surfaces({ broadcasts: { report: null } });
  fresh();
  refreshed.length = 0;
  const tree = page();
  const failed = failedAt(tree, "cmh-report-failed");
  assert.ok(failed, "the tile says so");
  assert.match(failed.words, /Couldn't read this period's numbers/);
  assert.match(failed.words, /The runs below stand\./);
  const results = byTestId(tree, "cmh-results");
  assert.equal(
    find(results, (n) => n.props?.["data-testid"] === "cmh-replied"),
    null,
    "no headline it did not read",
  );
  assert.equal(
    find(results, (n) => n.props?.["data-testid"] === "cmh-quiet"),
    null,
    "and not 'nothing went out'",
  );
  assert.ok(allBy(tree, "cmh-run").length > 0, "the runs, which are the surface's own, stand");
  pressed(failed.retry);
  assert.deepEqual(refreshed, ["campaign_results"], "its Retry reads Campaigns' own 30 days, where the report is read");
});

test("what came back says what a read is where a text or an email went too (0030), under the funnel, and nothing where WhatsApp alone sent", () => {
  surfaces({
    broadcasts: {
      report: {
        days: 30,
        totals: { sent: 8, delivered: 8, read: 5, replied: 3, optIns: 3, optOuts: 2, readOf: 6 },
        sources: [],
      },
    },
  });
  let tree = page();
  assert.equal(
    textOf(byTestId(byTestId(tree, "cmh-results"), "cmh-read-note")),
    "Read is of WhatsApp's 6: a text or an email keeps no read receipt.",
  );
  surfaces();
  tree = page();
  assert.equal(byTestId(tree, "cmh-read-note"), null);
});

test("what came back has a second door, Full report, to Reports' Campaigns over the days the tile counts, in the workspace's own time (and 'All runs' stays)", () => {
  const real = Date.now;
  Date.now = () => NOW;
  try {
    surfaces();
    const tree = page();
    const results = byTestId(tree, "cmh-results");
    const door = find(results, (n) => n.props?.["data-testid"] === "cmh-full-report");
    assert.ok(door, "the tile's head has the door");
    assert.match(textOf(door), /Full report/);
    // Friday 2 Oct 2026 at 9:44 PM in New York is still the 2nd there, whatever day it is in UTC: thirty days ending on it.
    assert.equal(door.props.href, "#/reports/campaigns:2026-09-03~2026-10-02");
    const heads = all(results, (n) => /\bcmh-more\b/.test(String(n.props?.className ?? "")));
    assert.ok(
      heads.some((n) => /All runs/.test(textOf(n))),
      "and the door it had",
    );
  } finally {
    Date.now = real;
  }
});

test("on a phone a failed read is said in the same places: over the moments, in the list, and in what came back", () => {
  surfaces({
    playbooks: { countsRead: false },
    reachOuts: null,
    settings: { templatesAll: null },
    broadcasts: { report: null },
  });
  setSurfaceValue("reach_outs", null);
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const tree = page();
  for (const id of ["pb-counts-failed", "pb-chains-failed", "cmh-templates-failed", "cmh-report-failed"])
    assert.ok(byTestId(tree, id), `${id} on a phone too`);
  assert.ok(
    find(byTestId(tree, "cmh-rail"), (n) => n.props?.["data-testid"] === "pb-chains-failed"),
    "in the one list, where the reach-outs would stand",
  );
});

/** Every failed read a tile or a line says, by the testid its words are drawn under. */
const FAILED = [
  "pb-counts-failed",
  "pb-chains-failed",
  "cmh-templates-failed",
  "cmh-report-failed",
  "cmh-reach-failed",
  "cmh-coming-failed",
  "cmh-results-failed",
];

test("a read that has not landed has not failed, and a read that did land says nothing either", () => {
  surfaces();
  fresh();
  const tree = page();
  for (const id of FAILED) assert.equal(byTestId(tree, id), null, `${id}: everything read`);
  for (const id of ["cmh-reach-reading", "cmh-coming-reading", "cmh-results-reading"])
    assert.equal(byTestId(tree, id), null, `${id}: nothing is out`);
  setSurfaceValue("settings", undefined);
  setSurfaceValue("reach_outs", undefined);
  fresh();
  const reading = page();
  for (const id of FAILED) assert.equal(byTestId(reading, id), null, `${id}: unread is not failed`);
});

/* -------------------------------- a read that is still out is said, quietly -------------------------------- */

test("a tile made from the broadcasts says it is reading while they are out, and never 'nothing is set to go out' for a week it could not see", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  fresh();
  const tree = page();
  for (const id of ["cmh-reach-reading", "cmh-coming-reading", "cmh-results-reading"]) {
    assert.ok(byTestId(tree, id), `${id}: the tile says it is reading`);
    assert.equal(textOf(byTestId(tree, id)), "Reading…");
    assert.equal(byTestId(tree, id).props.className, "route-reading cmh-reading", "after the shell's standard beat");
  }
  assert.equal(byTestId(tree, "cmh-coming-empty"), null, "an empty week is not said of one it has not seen");
  assert.equal(allBy(tree, "cmh-coming-line").length, 0, "nor half of one");
  assert.equal(allBy(tree, "cmh-rung").length, 0, "no ladder of nothing");
  assert.equal(byTestId(tree, "cmh-quiet"), null, "nor 'nothing went out'");
  assert.equal(byTestId(tree, "cmh-replied"), null);
  assert.ok(byTestId(tree, "cmh-rules"), "what the sending rules say is true of any week");
  assert.equal(allBy(tree, "cmh-stage").length, 4, "the moments, the playbooks' own read, are drawn");
  assert.ok(
    !/people can hear from you/.test(textOf(tree)),
    "the head says nothing of who can hear before it is counted",
  );
  // The phone's one short tile reads the same way, and what is below it.
  globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  fresh();
  const phone = page();
  for (const id of ["cmh-reach-reading", "cmh-coming-reading", "cmh-results-reading"])
    assert.ok(byTestId(phone, id), `${id} on a phone too`);
  assert.equal(allBy(phone, "cmh-rung").length, 0);
});

test("Send once and a drawer on a reach-out say they are reading rather than draw a sheet with nothing in it", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  fresh();
  const send = page("new");
  assert.ok(byTestId(send, "cmh-composer-reading"), "Send once: reading, in the sheet");
  assert.equal(find(send, (n) => n.type === Segmented).props.value, "once", "the choice of kind is still at its head");
  assert.equal(byTestId(send, "bc-composer"), null, "and no half of a send screen");
  assert.equal(
    find(send, (n) => n.type === BroadcastSend),
    null,
  );
  // A moment link that names no playbook, before the reach-outs are read: reading, not an empty sheet and not 'gone'.
  setSurfaceValue("reach_outs", undefined);
  fresh();
  const moment = page("moment:ch-1");
  assert.ok(byTestId(moment, "cmh-drawer-reading"));
  assert.equal(byTestId(moment, "pb-gone"), null);
  // The playbook composer needs neither read.
  fresh();
  assert.ok(find(page("new:every"), (n) => n.type === PlaybookComposer));
});

/* -------------------------------- a read that failed is said, with its Retry -------------------------------- */

test("a broadcasts read that failed is said in each tile made from it, in the send and with a Retry that reads the broadcasts again; the rest of the page is current", () => {
  surfaces();
  setSurfaceValue("broadcasts", undefined);
  // The seam's own word for it: the surface tried and has no real data (surface-status.ts, the shell's route gate reads it).
  status.setStatus("broadcasts", "seeded");
  try {
    fresh();
    refreshed.length = 0;
    const tree = page();
    for (const [id, what] of [
      ["cmh-reach-failed", "who can hear you"],
      ["cmh-coming-failed", "what is coming up"],
      ["cmh-results-failed", "what came back"],
    ]) {
      const failed = failedAt(tree, id);
      assert.ok(failed, `${id}: said where its data would be`);
      assert.match(failed.words, new RegExp(`Couldn't read ${what}`));
      assert.match(failed.words, /Everything else here is current\./);
      pressed(failed.retry);
    }
    assert.deepEqual(
      refreshed,
      ["broadcasts", "broadcasts", "broadcasts"],
      "each Retry reads the broadcasts, not the moments",
    );
    for (const id of [
      "cmh-reach-reading",
      "cmh-coming-reading",
      "cmh-results-reading",
      "cmh-coming-empty",
      "cmh-quiet",
    ])
      assert.equal(byTestId(tree, id), null, `${id}: failed is not reading, and not 'nothing'`);
    assert.equal(allBy(tree, "cmh-stage").length, 4, "the moments are the playbooks' read, and current");
    assert.equal(byTestId(tree, "cmh-templates-failed"), null, "one failing leaves the others alone");
    // The phone says it in the same places.
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    fresh();
    const phone = page();
    for (const id of ["cmh-reach-failed", "cmh-coming-failed", "cmh-results-failed"])
      assert.ok(byTestId(phone, id), `${id} on a phone too`);
    // Where the workspace stands on its channels is the readiness's to say, and the playbooks' read carries it too: the
    // line stands on a phone though who can hear you could not be read (it was drawn only with the count).
    assert.ok(byTestId(byTestId(phone, "cmh-reach"), "cmh-channels"), "the channels line, under a reach that failed");
    assert.equal(byTestId(phone, "cmh-phone-yes"), null, "and no door to a yes the page could not count");
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    // Send once could not be drawn from what could not be read: said in the sheet, with its Retry, not a sheet of nothing.
    fresh();
    refreshed.length = 0;
    const send = page("new");
    const sendFailed = failedAt(send, "cmh-composer-failed");
    assert.ok(sendFailed, "Send once says so");
    assert.match(sendFailed.words, /Couldn't read who and what you can send to/);
    assert.match(sendFailed.words, /Nothing goes out until it reads\./);
    pressed(sendFailed.retry);
    assert.deepEqual(refreshed, ["broadcasts"]);
    assert.equal(byTestId(send, "cmh-composer-reading"), null);
    assert.equal(byTestId(send, "bc-composer"), null);
  } finally {
    // Read at last: a surface that has been live is never "failed" again, only stale.
    status.setStatus("broadcasts", "live");
  }
});

test("a templates read the playbooks surface could not be made of leaves the Library with no count and the call's text with its Retry", () => {
  // The playbooks surface's slice is made of the settings read each time it is published (followSettings), so a null
  // library is a settings read whose templates failed: the rows and the messages both unread.
  surfaces({ settings: { templatesAll: null, messages: null } });
  assert.equal(surfaceValue("playbooks").library, null, "the slice made of it is null too");
  fresh();
  refreshed.length = 0;
  const tree = page();
  const failed = failedAt(tree, "cmh-templates-failed");
  assert.ok(failed, "a templates read that failed is said, as a null `library` is");
  pressed(failed.retry);
  assert.deepEqual(
    refreshed,
    ["settings"],
    "and the Retry reads the settings surface, which the playbooks surface is made of",
  );
  assert.equal(textOf(byTestId(tree, "cmh-library")).includes("0"), false, "no Library count it did not read");
  // The home reads its library from the playbooks surface's slice, which is made of the settings read (offered-templates.ts):
  // a Settings read that is not drawn here says nothing of its own, and the slice the playbooks surface holds stands.
  surfaces();
  setSurfaceValue("settings", undefined);
  status.setStatus("settings", "seeded");
  try {
    fresh();
    assert.equal(byTestId(page(), "cmh-templates-failed"), null, "the playbooks surface's slice stands");
  } finally {
    status.setStatus("settings", "live");
  }
});

/* -------------------------------- the address, the toasts, the head, the clock -------------------------------- */

test("a link that names a list opens the composer on it: campaigns/new:to:<list> hosts the send screen on that audience", () => {
  surfaces();
  fresh();
  const tree = page("new:to:s-sample-regulars");
  const audience = (t) => find(t, (n) => n.type === Picker && n.props["data-testid"] === "bc-audience");
  assert.equal(audience(tree).props.value, "saved:s-sample-regulars", "the send opens on the list it was asked for");
  assert.equal(find(tree, (n) => n.type === BroadcastSend).props.initialSegment, "s-sample-regulars");
  assert.equal(sheet(tree).props.title, "New message");
  assert.equal(find(sheet(tree).props.tools, (n) => n.type === Segmented).props.value, "once", "it is Send once");
  // No list named: the screen opens on the audience it opens on.
  fresh();
  const plain = page("new");
  assert.equal(find(plain, (n) => n.type === BroadcastSend).props.initialSegment, null);
  assert.notEqual(audience(plain).props.value, "saved:s-sample-regulars");
  // The address's spellings: one list, or none (an empty list is the composer on Send once).
  for (const [param, to] of [
    ["new:to:s-1", "s-1"],
    ["new:to:", null],
    ["new", null],
  ]) {
    fresh();
    surfaces();
    assert.equal(find(page(param), (n) => n.type === BroadcastSend).props.initialSegment, to, param);
  }
});

test("the home's toasts are contracts' words, and the toast that offers to stop a send is the home's own", async () => {
  surfaces();
  fresh();
  // A playbook saved: its next run is said where it is now, under Coming up, never 'on the card'.
  const compose = page("new:every");
  const composer = find(compose, (n) => n.type === PlaybookComposer);
  toasts.length = 0;
  composer.props.onDone({ name: "Sunday quiet" }, false);
  assert.equal(textOf(toasts.at(-1).msg), "Sunday quiet is running — its next run is under Coming up, by your clock");
  composer.props.onDone({ name: "Sunday quiet" }, true);
  assert.equal(textOf(toasts.at(-1).msg), "Sunday quiet changed");
  composer.props.onDone({}, true);
  assert.equal(
    textOf(toasts.at(-1).msg),
    "It changed",
    "a name the server did not answer is named in contracts' words too",
  );
  // The send screen is handed the home's own flash, and draws no host of its own (campaigns-drafts.test.mjs: the toast outlives the sheet).
  const send = find(page("new"), (n) => n.type === BroadcastSend);
  assert.equal(typeof send.props.flash, "function", "the home's toast host");
});

test("Copy the phrase says so where the browser would not copy it, and shows the phrase to be typed", async () => {
  surfaces();
  const refuse = [{ clipboard: { writeText: async () => Promise.reject(new Error("denied")) } }, {}];
  for (const nav of refuse) {
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true });
    fresh();
    const tree = page();
    toasts.length = 0;
    await byTestId(tree, "cmh-copy").props.onClick();
    await settle();
    assert.equal(toasts.length, 1, "said once");
    assert.equal(textOf(toasts[0].msg), "Couldn't copy, the phrase is: YES OFFERS");
    assert.equal(toasts[0].tone, "warn");
  }
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
  });
  fresh();
  toasts.length = 0;
  await byTestId(page(), "cmh-copy").props.onClick();
  await settle();
  assert.equal(textOf(toasts.at(-1).msg), "Phrase copied");
});

test("the head says offers by email are paused, from the email channel's own read, and says nothing otherwise", () => {
  // The playbooks' reading first, as the channels line reads it (contracts readyOf): the home hears it, so a pause by the gates
  // reaches the line while the home is open (the wiring's second audit, W-campaign-run-template-reachout-1). Sent's reading says
  // the opposite here, and is not what the line says.
  const pb = playbooksSample(new Date(NOW));
  const bc = broadcastsSample(new Date(NOW));
  const offersIn = (ready, offers) => ({ ready: { ...ready, email: { ...ready.email, offers } } });
  const paused = { ok: false, why: "paused", paused: { at: "2026-10-01T00:00:00Z", reason: "bounces" } };
  const open = { ok: true, why: null, paused: null };
  surfaces({ playbooks: offersIn(pb.ready, paused), broadcasts: offersIn(bc.ready, open) });
  fresh();
  page();
  assert.equal(
    textOf(byTestId(headSaid(), "cmh-paused")),
    "Offers and news by email are paused: too many offers went to addresses that did not accept them. Appointment messages and replies still go by email.",
    "the quiet line, under the sentence",
  );
  surfaces({ playbooks: offersIn(pb.ready, open), broadcasts: offersIn(bc.ready, paused) });
  fresh();
  page();
  assert.equal(byTestId(headSaid(), "cmh-paused"), null, "offers open: a quiet page says nothing");
  surfaces();
  fresh();
  page();
  assert.equal(byTestId(headSaid(), "cmh-paused"), null);
});

test("the home reads the clock again each minute and when the tab comes back, so Today and Tomorrow in Coming up roll over midnight while it is open", () => {
  const scheduled = (at) => ({
    ...broadcastsSample(new Date(NOW)).rows.find((r) => r.state === "scheduled"),
    id: "r-tomorrow",
    scheduled_for: new Date(at).toISOString(),
    playbook_id: null,
  });
  // A run at 12:44 on Saturday in New York, which it is Friday 9:44 PM before.
  const at = NOW + 15 * 3_600_000;
  surfaces({ broadcasts: { rows: [scheduled(at)] } });
  fresh();
  const realNow = Date.now;
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  const timers = [];
  let now = NOW;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => (timers.push([fn, ms]), timers.length);
  globalThis.clearInterval = () => {};
  try {
    // No `nowMs`: the page's own clock.
    const draw = () => again(() => CampaignsHome({ param: null }));
    const line = (t) => allBy(t, "cmh-coming-line").find((l) => l.props["data-kind"] === "run");
    let tree = draw();
    assert.match(textOf(line(tree)), /^tomorrow/, "Friday evening: the run is tomorrow's");
    assert.deepEqual(
      timers.map(([, ms]) => ms),
      [60_000],
      "the page asks for a minute's tick",
    );
    // Three hours on, past midnight: the same run is today's, once the page has read the clock again.
    now = NOW + 3 * 3_600_000;
    tree = draw();
    assert.match(textOf(line(tree)), /^tomorrow/, "nothing moves until the page reads the clock");
    timers[0][0]();
    tree = draw();
    assert.match(textOf(line(tree)), /^today/, "after the tick the run is today's");
  } finally {
    Date.now = realNow;
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});

test("the Library's count is the Library page's own: the same templates, languages and reach-out emails, from one function", () => {
  const pb = playbooksSample(new Date(NOW));
  const first = pb.templates[0];
  const rows = [
    ...pb.templates,
    { ...first, id: "tpl-es", language: "es" },
    { ...first, id: "tpl-sample", name: "hello_world" },
    { ...first, id: "tpl-hidden", name: "old_offer", hidden_at: "2026-09-01T00:00:00Z" },
  ];
  const email = (n) => ({
    root_id: `ch-${n}`,
    name: `Cold email ${n}`,
    search: { id: "s-1", name: "Studios" },
    state: "running",
    signed_by: "Sam",
    steps: [
      { id: `ch-${n}`, n: 0, after_days: null, subject: "Quick one", body: "Hello", template_id: `t-${n}a` },
      { id: `n-${n}`, n: 1, after_days: 4, subject: null, body: "Checking in", template_id: `t-${n}b` },
    ],
    next: { run_hour: 9, last_run_for: null, mode: "ask", may_spend: true, waiting_run_id: null },
    mailboxes: [],
  });
  const messages = contracts.campaignMessagesOf(rows);
  surfaces({ reachOuts: [email(1)], settings: { templatesAll: rows, messages } });
  // The page's head says "N templates"; the home's act carries N.
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    channels: [{ kind: "whatsapp" }],
    templatesAll: rows,
    messages,
  });
  fresh();
  TemplatesPage();
  const said = Number(/\d+/.exec(textOf(byTestId(headSaid(), "messages-count")))[0]);
  fresh();
  page();
  const act = Number(/\d+/.exec(textOf(byTestId(headSaid(), "cmh-library")).replace("Library", ""))[0]);
  assert.equal(act, said, "one count");
  assert.equal(
    act,
    pb.templates.length + 1 + 2,
    "each language a row, the two emails, never the sample or the hidden one",
  );
});

test("the Library's count and the home's count both take a message written for email or text alone, once, whatever channels it has", () => {
  const pb = playbooksSample(new Date(NOW));
  const first = pb.templates[0];
  // Two messages with no WhatsApp row: one an email and a text (one message), one an email in two languages (two), and an
  // email beside a WhatsApp version, which is no message of its own.
  const own = (n, over) => ({
    ...first,
    id: `own-${n}`,
    channel: "email",
    name: "fall_hours",
    language: "en_US",
    meta_status: "approved",
    source: "chanlytics",
    ...over,
  });
  const versions = [
    own(1, {}),
    own(2, { channel: "sms" }),
    own(3, { name: "spring_news", category: "marketing" }),
    own(4, { name: "spring_news", category: "marketing", language: "es" }),
    own(5, { name: first.name, language: first.language }),
  ];
  const messages = contracts.campaignMessagesOf([...pb.templates, ...versions]);
  surfaces({ settings: { templatesAll: pb.templates, templateVersions: versions, messages } });
  setSurfaceValue("settings", {
    settings: { config: { brain: { business_name: "Northside Studio" } } },
    channels: [{ kind: "whatsapp" }],
    templatesAll: pb.templates,
    templateVersions: versions,
    messages,
  });
  fresh();
  TemplatesPage();
  const said = Number(/\d+/.exec(textOf(byTestId(headSaid(), "messages-count")))[0]);
  fresh();
  page();
  const act = Number(/\d+/.exec(textOf(byTestId(headSaid(), "cmh-library")).replace("Library", ""))[0]);
  assert.equal(act, said, "one count");
  assert.equal(
    act,
    pb.templates.length + 3,
    "each WhatsApp row, and the three own-only: not the email beside a WhatsApp version",
  );
  assert.equal(
    contracts.libraryCount(messages, 0),
    pb.templates.length + 3,
    "and it is contracts' libraryCount that says it",
  );
});

test("Campaigns' own 30 days are one read of each report over its own period, each failing alone: a report that could not be read leaves the chains standing, and a chains' answer is each root's own", async () => {
  const { campaignResultsOverride } = await import(`${SRC}/surfaces/campaigns/home/results-surface.ts`);
  const answer = (data) =>
    new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { "content-type": "application/json" } });
  const refused = () =>
    new Response(JSON.stringify({ ok: false, error: { code: "unavailable", message: "not read here" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  const campaigns = {
    timezone: ZONE,
    days: 30,
    span_days: 60,
    today: "2026-10-02",
    series: [],
    sources: [
      {
        id: "pb-1",
        kind: "playbook",
        name: "Win-back",
        template_name: "winback_offer",
        runs: 2,
        sent: 14,
        delivered: 12,
        read: 7,
        replied: 3,
        last_at: "2026-10-01T14:05:00Z",
      },
    ],
  };
  // Nine emails to four businesses (00404 counts them); `businesses` is dropped below to read a database before it.
  const chains = { complete: true, by_root: { "ro-1": { written: 9, businesses: 4, wrote_back: 2 } } };
  const asked = [];
  const read = async (fail) => {
    const kept = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = new URL(String(url), "https://app.chanlytics.com");
      asked.push(`${u.pathname}?period=${u.searchParams.get("period")}`);
      if (u.pathname === "/api/v1/reports/campaigns")
        return fail === "campaigns" ? refused() : answer({ report: campaigns });
      if (u.pathname === "/api/v1/reports/reach-outs")
        return fail === "reach-outs" ? refused() : answer({ report: { chains: [] }, chains });
      return refused();
    };
    try {
      await campaignResultsOverride.apply();
      return surfaceValue("campaign_results");
    } finally {
      globalThis.fetch = kept;
    }
  };
  const errorWas = console.error;
  console.error = () => {};
  try {
    const both = await read(null);
    assert.equal(both.period, "30d");
    assert.deepEqual(
      both.report.sources,
      [{ id: "pb-1", kind: "playbook", name: "Win-back", sent: 14, replied: 3, lastAt: "2026-10-01T14:05:00Z" }],
      "each campaign's own, as the ledger's rows read them",
    );
    assert.deepEqual(both.chains, {
      complete: true,
      byRoot: { "ro-1": { written: 9, businesses: 4, wroteBack: 2 } },
    });
    assert.deepEqual(
      [...new Set(asked)].sort(),
      ["/api/v1/reports/campaigns?period=30d", "/api/v1/reports/reach-outs?period=30d"],
      "both over Campaigns' one period, naming no last day",
    );
    const noReport = await read("campaigns");
    assert.deepEqual([noReport.report, noReport.chains.byRoot["ro-1"].written], [null, 9], "the chains stand");
    const noChains = await read("reach-outs");
    assert.deepEqual([noChains.report.sources.length, noChains.chains], [1, null], "the report stands");
    // A database before 00404 answers no businesses: the ledger holds null, and says the old line.
    delete chains.by_root["ro-1"].businesses;
    const old = await read(null);
    assert.deepEqual(old.chains, {
      complete: true,
      byRoot: { "ro-1": { written: 9, businesses: null, wroteBack: 2 } },
    });
  } finally {
    console.error = errorWas;
    setSurfaceValue("campaign_results", undefined);
  }
});

test("what Ask is told the ledger shows (the moment spec, A2): its rows in order, forty at most, a one-off send as its run, a reach-out as one, the receptionist, the call's text and an offer not made left out, and the view they are under", () => {
  const row = (id, kind, name, status = "on") => ({ id, kind, name, status });
  const rows = [
    row("receptionist", "receptionist", "The receptionist", "always"),
    row("call_text", "call_text", "The call's text", "always"),
    row("p1", "playbook", "Win-back"),
    row("c1", "chain", "Movers in Austin"),
    row("everyone_monthly", "offer", "The month's offer", "off"),
    row("b1", "sent_once", "Monday offer", "off"),
    row("l1", "list", "Past clients", "paused"),
    ...Array.from({ length: 45 }, (_, i) => row(`p${i + 2}`, "playbook", `Campaign ${i + 2}`)),
  ];
  const told = (view) => {
    delete globalThis.window.__askOnScreen;
    again(() => useLedgerOnScreen(view));
    return globalThis.window.__askOnScreen;
  };
  const said = told({ status: "needs", group: "quiet", query: "win", visibleRows: rows });
  assert.equal(said.key, "campaigns");
  assert.deepEqual(said.ids.slice(0, 5), ["p1", "reach_out:c1", "run:b1", "l1", "p2"]);
  assert.equal(said.ids.length, contracts.ASK_CONTEXT_MAX_ROWS);
  assert.deepEqual(said.labels.slice(0, 4), ["Win-back", "Movers in Austin", "Monday offer", "Past clients"]);
  assert.equal(said.view, "playbooks:needs:in:quiet:search");
  assert.equal(told({ status: "all", group: null, query: "  ", visibleRows: [] }).view, "playbooks:all");
  assert.deepEqual(
    told({ status: "paused", group: "lists", query: "", visibleRows: [] }).view,
    "playbooks:paused:in:lists",
  );
});

test("the page tells Ask the rows its ledger draws, in its order, under the group its address names; taken back when it goes", () => {
  fresh();
  surfaces();
  delete globalThis.window.__askOnScreen;
  const drawnIds = (tree) => allBy(tree, "cmh-row").map((r) => r.props["data-row"]);
  const plain = (id) => id.replace(/^run:/, "");
  const check = (tree, view) => {
    const s = globalThis.window.__askOnScreen;
    assert.equal(s.key, "campaigns");
    assert.equal(s.view, view);
    const drawn = drawnIds(tree);
    assert.ok(s.ids.length > 0, "the ledger's campaigns are told");
    assert.deepEqual(
      s.ids.map(plain),
      drawn.filter((id) => s.ids.map(plain).includes(id)),
      "only rows the ledger draws, in its order",
    );
    for (const r of allBy(tree, "cmh-row").filter((n) => n.props["data-kind"] === "playbook"))
      assert.ok(s.ids.includes(r.props["data-row"]), `the drawn campaign ${r.props["data-row"]} is told`);
  };
  check(page(), "playbooks:all");
  fresh();
  surfaces();
  check(page("in:quiet"), "playbooks:all:in:quiet");
  unmount();
  assert.equal(globalThis.window.__askOnScreen, null, "taken back when the ledger goes");
});

test("under Reach-outs Ask is told every row the screen shows (A2): each reach-out by its first step, spelled as one, in the ledger's order", () => {
  fresh();
  surfaces({ reachOuts: [chainOf(), chainOf({ root_id: "ch-2", name: "Cold email to gyms", state: "paused" })] });
  delete globalThis.window.__askOnScreen;
  const tree = page("in:reach_out");
  const drawn = allBy(tree, "cmh-row").map((r) => [r.props["data-kind"], r.props["data-row"]]);
  assert.deepEqual(
    drawn,
    [
      ["chain", "ch-1"],
      ["chain", "ch-2"],
    ],
    "the group draws its two reach-outs",
  );
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.view, "playbooks:all:in:reach_out");
  assert.deepEqual(s.ids, ["reach_out:ch-1", "reach_out:ch-2"], "the screen's rows, every one");
  assert.deepEqual(s.labels, ["Cold email to studios", "Cold email to gyms"]);
  unmount();
});

/* ------------------------------------------------- Ask's doors ------------------------------------------------- */

test("Ask's doors on Campaigns (the moment spec, A1): Ask in the head between the Library and New message, wearing the three; the drawer's More asks about its campaign; the first day's 'Set up my campaigns' asks it", () => {
  const asked = [];
  const askWas = globalThis.askAbout;
  const matchWas = globalThis.matchMedia;
  globalThis.askAbout = (about) => asked.push(about);
  try {
    surfaces();
    fresh();
    page();
    const head = headSaid();
    const door = byTestId(head, "cmh-ask");
    assert.ok(door, "the head's door");
    assert.match(String(door.props.className), /\bcmh-ask\b/, "the class the phone's width hides");
    assert.match(textOf(door), /Ask/);
    assert.equal(find(door, (n) => n.type === Icon)?.props.name, "three", "it wears Ask's three");
    // The kit's Button and what it draws carry the same testid: each door once, as the page drew it, a kit Button.
    const acts = all(
      head,
      (n) => n.type === Button && ["cmh-library", "cmh-ask", "cmh-new"].includes(n.props?.["data-testid"]),
    );
    assert.deepEqual(
      acts.map((n) => n.props["data-testid"]),
      ["cmh-library", "cmh-ask", "cmh-new"],
    );
    pressed(door);
    assert.deepEqual(asked.at(-1), {}, "Ask opens on the page, its scope the address's");
    // The drawer's More starts with it on a desk; on a phone it follows the menu's own acts (Pause or Resume, Edit).
    // What it does is the next test's.
    const moreOf = (tree) =>
      find(tree, (n) => n.type === Menu && /More for Win-back/.test(n.props.label ?? "")).props.groups[0].items.map(
        (i) => i.label,
      );
    fresh();
    assert.equal(moreOf(page("moment:pb-sample-winback"))[0], "Ask about this campaign", "first on a desk");
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    fresh();
    const onPhone = moreOf(page("moment:pb-sample-winback"));
    assert.equal(
      onPhone[onPhone.indexOf("Edit") + 1],
      "Ask about this campaign",
      "after the drawer's own acts on a phone",
    );
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    // The first day: no campaign yet. "Set up my campaigns" stands beside the hinted Turn on and asks it as a sentence.
    surfaces({ playbooks: { rows: [] } });
    fresh();
    const first = page();
    const setUp = byTestId(first, "cmh-setup-ask");
    assert.ok(setUp, "beside the first day's Turn on");
    const hinted = allBy(first, "cmh-stage").find((s) => s.props["data-hint"] === "true");
    assert.ok(byTestId(hinted, "cmh-setup-ask"), "in the hinted moment, after its Turn on");
    assert.equal(allBy(first, "cmh-setup-ask").filter((n) => n.type === Button).length, 1, "one door");
    pressed(setUp);
    assert.deepEqual(asked.at(-1), { prompt: "Set up my campaigns" });
    // A new workspace's quietest day, nobody yet to reach at any moment, hints no Turn on: the door stands by the first.
    const nobody = (n) => ({ candidates: 0, held: 0, pool: n, noYes: 0, stopped: 0, noNumber: 0, saidYes: n });
    surfaces({ playbooks: { rows: [] }, pools: { visit_tomorrow: nobody(3), visited: nobody(2) } });
    fresh();
    const quiet = page();
    assert.equal(allBy(quiet, "cmh-stage").filter((s) => s.props["data-hint"] === "true").length, 0, "no hint");
    const firstOff = allBy(quiet, "cmh-stage").find((s) => byTestId(s, "cmh-turn-on"));
    assert.ok(byTestId(firstOff, "cmh-setup-ask"), "beside the first Turn on");
    // On a phone (≤900px, no rail): the same door, under the hinted moment's Turn on, with its mark and its words.
    surfaces({ playbooks: { rows: [] } });
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    fresh();
    const phone = page();
    const onPhoneDoor = byTestId(phone, "cmh-setup-ask");
    assert.ok(onPhoneDoor, "the phone's first day has its door too");
    assert.equal(textOf(onPhoneDoor), contracts.LIFECYCLE_WORDS.ask.setUpDoor);
    assert.equal(find(onPhoneDoor, (n) => n.type === Icon)?.props.name, "three", "its mark, never a bare glyph");
    // Once, at the list's top: under the hinted moment it read as that moment's (Ruben, 11 Oct 2026).
    assert.equal(
      allBy(phone, "cmh-group").filter((g) => byTestId(g, "cmh-setup-ask")).length,
      0,
      "under no moment of the list",
    );
    assert.ok(byTestId(byTestId(phone, "cmh-ledger"), "cmh-setup-ask"), "at the top of the list");
    globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    surfaces();
    fresh();
    assert.equal(
      byTestId(page(), "cmh-setup-ask"),
      null,
      "a workspace with campaigns has its ledger, not the first day's door",
    );
  } finally {
    globalThis.askAbout = askWas;
    globalThis.matchMedia = matchWas;
  }
});

test("'Ask about this campaign' (A1) closes the drawer the way the drawer closes, then opens Ask over the home on that campaign, by its id and its name, once the address has left the drawer: on a phone the drawer is a modal sheet Ask would open under", () => {
  const asked = [];
  const heard = [];
  const askWas = globalThis.askAbout;
  const chanlyWas = globalThis.CHANLY;
  const matchWas = globalThis.matchMedia;
  globalThis.askAbout = (about) => asked.push(about);
  // The frame's address (legacy-bridge/workspace.ts hearAddress): each listener until it stops, told when the route moves.
  const hear = (fn) => {
    heard.push(fn);
    return () => heard.splice(heard.indexOf(fn), 1);
  };
  globalThis.CHANLY = { ...chanlyWas, address: { hear, href: (route) => `/w/studio/${route}` } };
  const moved = () => {
    for (const fn of [...heard]) fn();
  };
  // The item the drawer's More draws, as a press reaches it.
  const askItem = (tree) =>
    find(tree, (n) => n.type === Menu && /More for Win-back/.test(n.props.label ?? ""))
      .props.groups.flatMap((g) => g.items)
      .find((i) => i.label === "Ask about this campaign");
  const winBack = { about: { kind: "playbook", id: "pb-sample-winback", label: "Win-back" } };
  try {
    surfaces();
    // Arrived at by a link: the drawer closes by putting the home's address in its place.
    fresh();
    askItem(page("moment:pb-sample-winback")).onSelect();
    assert.deepEqual(replaced, ["campaigns"], "the drawer closed, the way it closes");
    assert.deepEqual(asked, [], "Ask waits until the address has left the drawer");
    moved();
    assert.deepEqual(asked, [winBack], "then opens on that campaign, named: the chip says it");
    assert.equal(heard.length, 0, "and stops listening");
    moved();
    assert.equal(asked.length, 1, "once");
    // Opened by a press: the drawer closes by Back, and Ask opens once the Back has landed, so a phone's Back entry of
    // Ask's own (ask-real.jsx useArClose) stands over the home and that Back is never taken for Ask's.
    fresh();
    asked.length = 0;
    const home = page();
    const quiet = allBy(home, "cmh-stage").find((s) => s.props["data-stage"] === "quiet");
    pressed(find(quiet, (n) => n.props?.["data-testid"] === "cmh-open"));
    askItem(page("moment:pb-sample-winback")).onSelect();
    assert.deepEqual([said, replaced, asked], [[["back"]], [], []]);
    moved();
    assert.deepEqual(asked, [winBack]);
    // On a phone, the item its menu draws after the drawer's own acts does the same.
    globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    fresh();
    asked.length = 0;
    askItem(page("moment:pb-sample-winback")).onSelect();
    assert.deepEqual([replaced, asked], [["campaigns"], []]);
    moved();
    assert.deepEqual(asked, [winBack]);
    // Where the frame hears no address (the standalone mockup), Ask opens as the drawer closes.
    globalThis.CHANLY = chanlyWas;
    fresh();
    asked.length = 0;
    askItem(page("moment:pb-sample-winback")).onSelect();
    assert.deepEqual([replaced, asked], [["campaigns"], [winBack]]);
  } finally {
    globalThis.askAbout = askWas;
    globalThis.CHANLY = chanlyWas;
    globalThis.matchMedia = matchWas;
  }
});
