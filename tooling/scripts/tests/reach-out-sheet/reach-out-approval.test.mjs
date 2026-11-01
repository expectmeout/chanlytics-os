/**
 * A reach-out run in Sent (Reach out, Part 4 PR 7; F13, R20–R22), run on the stub React over the surface's own
 * words (surfaces/campaigns/reach-out/surface.ts `run`, contracts reachOutRunWordsOf over approvalWordsOf) and the
 * broadcasts and reach-outs verbs stubbed on the objects the TSX imports (`broadcasts`, `reachOuts`): the block a live
 * reach-out run opens to, waiting on its owner or not; today's share and the rest, the held with their reasons and doors, the skipped by reason, how many are still being
 * checked, and the first ready business's email with its opening marked; Approve naming the checked sends only, from
 * now for a run from an earlier day; the doors and "Check the held again" pressing their routes and reading the run
 * again; and the run read again every fifteen seconds while the check still reads some of it, stopping when it does
 * not or the run closes.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh,
  again,
  unmount,
  all,
  find,
  byTestId,
  textOf,
  press,
  settle,
} from "../_legacy-react.mjs";
import { until } from "../shared/_until.mjs";

installLegacyReact({ __DEMO_MODE: false, __chrome: { state: contracts.stateOf } });
const W = globalThis;
const ZONE = "America/Chicago";
const dayKey = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date(ms));
const TODAY = dayKey(Date.now());
const YESTERDAY = dayKey(Date.now() - 86_400_000);
const role = { now: "owner" };
Object.assign(W, {
  CHANLY: { nav: () => {}, R: {} },
  ST_STORE: { can: (a) => !!(contracts.ROLE_PERMS[role.now] || {})[a], myRole: () => role.now },
  __roleGate: contracts.roleGate,
  __clock: { zone: () => ZONE, dayKey },
});
// The shell's own parts (Confirm, StatePill, PolicyChip, the role gate) are still JSX the frame loads; the run's page is TSX.
const L = "../../../../apps/dashboard/src/legacy";
(await import(`${L}/../surfaces/frame/frame-globals.ts`)).installFrameGlobals();
const S = "../../../../apps/dashboard/src/surfaces/campaigns";
const { BroadcastDetail } = await import(`${S}/broadcasts/run.tsx`);
const { broadcasts } = await import(`${S}/broadcasts/verbs.ts`);
const bridge = await import(`${S}/reach-out/surface.ts`);
// The verbs as the surfaces have them: a test stubs some on their objects, and `world()` puts every one back first.
const REAL_BROADCASTS = { ...broadcasts };
const REAL_REACH_OUTS = { ...bridge.reachOuts };
const realVerbs = () => {
  Object.assign(broadcasts, REAL_BROADCASTS);
  Object.assign(bridge.reachOuts, REAL_REACH_OUTS);
};

/**
 * The run's first send, two hours on, by the zone's own clock (never a fixed UTC hour, which moves with daylight
 * saving), and the words that time is said in.
 */
const FIRST_MS = Date.now() + 2 * 3_600_000;
const FIRST_AT = new Date(FIRST_MS).toISOString();
// Said as the page says it: the time alone on the run's own day, else with its day ("tomorrow 12:12 AM"), since two
// hours on from late evening in Chicago is tomorrow there; the test once failed every night from 10 PM to midnight.
const FIRST_TIME =
  dayKey(FIRST_MS) === dayKey(Date.now())
    ? contracts.clockTime(FIRST_MS, ZONE)
    : contracts.clockWhen(FIRST_MS, ZONE, Date.now());
const RUN = (over = {}) => ({
  root_id: "r1",
  chain_name: "Reach out · Personal trainers",
  step_id: "r1",
  step_n: 0,
  gap_minutes: 12,
  run_for: TODAY,
  include_unconfirmed: false,
  today: 30,
  later: 12,
  first_at: FIRST_AT,
  checking: 0,
  held: [
    {
      send_id: "h1",
      lead_id: "l1",
      business_name: "Studio One",
      email: "owner@studio1.example",
      reason: "unbacked_fact",
      detail: "a 4.8 rating",
      opening: null,
      angle: null,
      planned_at: FIRST_AT,
    },
    {
      send_id: "h2",
      lead_id: "l2",
      business_name: "Studio Four",
      email: "owner@studio4.example",
      reason: "check_unavailable",
      detail: null,
      opening: null,
      angle: null,
      planned_at: FIRST_AT,
    },
  ],
  planned: [
    { send_id: "p1", business_name: "Studio Two", send_at: FIRST_AT, checked: true },
    { send_id: "p2", business_name: "Studio Three", send_at: FIRST_AT, checked: false },
  ],
  skipped: { closed_every_day: 3, missing_value: 1 },
  first: {
    business_name: "Studio Two",
    subject: "A quick one for Studio Two",
    body: "A 4.9 from 16 reviews says people find you.\n\nI run Harbor Moving Co.\n\nSam",
    opening: "A 4.9 from 16 reviews says people find you.",
    angle: "their reviews",
  },
  mailboxes: [{ address: "sam@harbor-mail.example", sent_days: 3, daily_cap: 40, customer_domain: false }],
  ...over,
});
const DETAIL = (state, run = RUN()) => ({
  broadcast: {
    id: "b1",
    name: "Reach out · Personal trainers",
    state,
    audience: { label: "Personal trainers · Austin" },
    params: [],
    playbook_id: "r1",
    sequence_id: "r1",
  },
  recipients: [],
  reach_out: run,
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * The couriers, stubbed: the run as the test holds it, each read and press recorded. A held email's door is its verb
 * (`sequence_send_decide`), which walks the typed client to its route: the wire answers it as the test says, and any
 * other read the walk's refresh asks for is answered empty.
 */
const world = (state, run) => {
  const w = { detail: DETAIL(state, run), reads: 0, pressed: [], answer: { ok: true, data: {} } };
  realVerbs();
  W.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const decide = /^\/api\/v1\/reach-out-sends\/([^/]+)\/decide$/.exec(u.pathname);
    if (decide && init.method === "POST") {
      w.pressed.push(["decide", decide[1], JSON.parse(init.body).decision]);
      return w.answer.ok
        ? json(200, { ok: true, data: w.answer.data })
        : json(409, { ok: false, error: { code: "conflict", message: w.answer.message } });
    }
    const leave = /^\/api\/v1\/sequences\/([^/]+)\/leave$/.exec(u.pathname);
    if (leave && init.method === "POST") {
      w.pressed.push(["leave", leave[1], JSON.parse(init.body)]);
      return json(200, { ok: true, data: { left: 1, sequence_id: leave[1] } });
    }
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  };
  Object.assign(broadcasts, {
    detail: async () => ((w.reads += 1), { ok: true, data: w.detail }),
    peekDetail: () => null,
  });
  Object.assign(bridge.reachOuts, {
    recheck: async (id) => (w.pressed.push(["recheck", id]), w.answer),
    watchRun: (id) => {
      w.pressed.push(["watch", id]);
      return () => w.pressed.push(["unwatch", id]);
    },
  });
  return w;
};
const SHEET = (over = {}) => {
  const s = { approved: 0, said: null, armed: false, ...over };
  return Object.assign(s, {
    canSend: true,
    position: [1, 2],
    approving: false,
    stopping: false,
    approve: (words) => ((s.approved += 1), (s.said = words)),
    skip: () => {},
    onArm: (on) => (s.armed = on),
  });
};
const open = async (props = {}) => {
  const draw = () => W.React.createElement(BroadcastDetail, { id: "b1", onClose: () => {}, ...props });
  fresh();
  again(draw);
  await settle();
  again(draw);
  await settle();
  return () => again(draw);
};
const lines = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id).map(textOf);

test("a run waiting on its owner: the decision first, the held, the skipped, the email as an email, what was checked, and the foot (F13, R22)", async () => {
  world("pending_approval");
  const sheet = SHEET();
  const redraw = await open({ sheet });
  const tree = redraw();
  assert.ok(byTestId(tree, "ro-run"), "a reach-out run opens to its own block, never a WhatsApp run's sheet");
  assert.equal(byTestId(tree, "bc-sheet"), null);
  // The block's own back button and top are the pane's head now (the layout is the Inbox's list + pane, docs/2026-10-02-
  // campaigns-on-the-kit.md §3.1): its name as the title, what it is and its place in the queue under it, Close at its right.
  const head = find(byTestId(tree, "bc-run-solo"), (n) => n.type === "h2");
  assert.equal(textOf(head.props.children[0]), "Reach out · Personal trainers", "the run's name is the pane's title");
  assert.ok(byTestId(tree, "bc-detail-close"), "the pane's Close, where the block's back button was");
  // Its state in the head's line, in its colour: what it waits for (the run-to-leads canvas).
  assert.equal(textOf(byTestId(tree, "ro-run-k")), "Waits for your OK");
  assert.equal(textOf(byTestId(tree, "ro-run-will")), "30");
  assert.equal(textOf(byTestId(tree, "ro-run-of")), "of 44");
  // One bar by count, said to a screen reader as its legend says it.
  const bar = find(byTestId(tree, "ro-run-reach"), (n) => Array.isArray(n.props?.parts));
  assert.equal(bar.props["aria-label"], "30 ready, 12 in the coming days, 2 held");
  assert.deepEqual(
    bar.props.parts.map((p) => [p.share, p.tone]),
    [
      [30, "ok"],
      [12, "rest"],
      [2, "warn"],
    ],
  );
  const why = textOf(byTestId(tree, "ro-run-why"));
  assert.match(why, /12 in the coming days/);
  assert.match(why, /2 held/);
  assert.deepEqual(lines(tree, "ro-run-skipped"), [
    "3 skipped · keep no open hour all week",
    "1 skipped · missing a value your words name",
  ]);
  const rules = textOf(byTestId(tree, "ro-run-rules"));
  assert.match(rules, /Each has a checked address/, "R22: said while no unconfirmed address is included");
  assert.equal(
    textOf(byTestId(tree, "ro-run-from")),
    "From sam@harbor-mail.example · 3 days of sending",
    "R22: the run's own mailbox, its days sent, under when it goes",
  );
  assert.equal(textOf(byTestId(tree, "ro-run-opening")), "A 4.9 from 16 reviews says people find you.");
  assert.equal(textOf(byTestId(tree, "ro-run-reader")), "As they read it · step 1, your email");
  assert.equal(textOf(byTestId(tree, "ro-run-subject")), "A quick one for Studio Two");
  // Approve says the count it releases ("Approve all 30"); when it goes is the foot's line beside it.
  assert.equal(textOf(byTestId(tree, "ro-run-approve")).trim(), "Approve all 30");
  assert.equal(textOf(byTestId(tree, "ro-run-dock")), `30 go from ${FIRST_TIME}`);
  assert.equal(textOf(byTestId(tree, "ro-run-approve-note")), "2 held wait for you");
  press(byTestId(tree, "ro-run-approve"));
  assert.equal(sheet.approved, 1);
  assert.equal(
    sheet.said,
    "Reach out · Personal trainers approved — 30 emails today, in their hours",
    "the flash says the block's today count, never the run's whole",
  );
  // Skip asks first, in a card of its own in the foot's place (the canvas's board 4): the question, what it costs, Keep it.
  press(byTestId(tree, "ro-run-skip"));
  const asked = redraw();
  assert.equal(sheet.armed, true);
  const ask = byTestId(byTestId(asked, "ro-run-acts"), "ro-run-skip");
  assert.match(textOf(ask), /^Skip Reach out · Personal trainers's run\?/);
  assert.match(textOf(ask), /Skipping loses this run only/);
  assert.equal(textOf(byTestId(asked, "ro-run-skip-no")), "Keep it");
  assert.equal(textOf(byTestId(asked, "ro-run-skip-yes")), "Yes, skip it");
  press(byTestId(asked, "ro-run-skip-no"));
  assert.equal(sheet.armed, false, "Keep it puts the question away");
});

test("on a phone a waiting reach-out run docks its acts at the pane's foot, one row, and Skip on Approve's caret, as a campaign run's dock does: it stood as a slab halfway down the screen", async () => {
  world("pending_approval");
  const sheet = SHEET();
  const media = W.matchMedia;
  W.matchMedia = (q) => ({ matches: q === "(max-width: 900px)", addEventListener() {}, removeEventListener() {} });
  try {
    const redraw = await open({ sheet });
    let tree = redraw();
    const docks = all(tree, (n) => n.props?.["data-testid"] === "ro-run-acts");
    assert.equal(docks.length, 1, "the acts once, at the foot, not again in the block");
    assert.equal(docks[0].props["data-foot-pair"], undefined, "one row, never the stacked pair");
    assert.equal(byTestId(docks[0], "ro-run-skip"), null, "no Skip of its own beside Approve: it is Approve's caret");
    // The caret is the kit Menu's trigger (Base UI draws it; the stub holds it as the Menu's `trigger`).
    assert.ok(
      find(
        docks[0],
        (n) => Array.isArray(n.props?.groups) && n.props.trigger?.props?.["data-testid"] === "bc-sheet-more",
      ),
      "the caret, joined to Approve (no three dots in the head)",
    );
    press(byTestId(docks[0], "ro-run-approve"));
    assert.equal(sheet.approved, 1, "Approve from the dock");
    // Who gets it is the block's own fold, its press at its head's right, not a half of the dock (19 Oct 2026); opened,
    // its rows are brought into view as they open.
    assert.equal(byTestId(docks[0], "ro-run-see"), null, "no list press in the dock");
    press(byTestId(tree, "ro-run-list-press"));
    tree = redraw();
    const list = byTestId(tree, "ro-run-list");
    assert.equal(list.props["data-open"], "true", "who gets it, opened");
    let brought = null;
    find(list, (n) => typeof n.props?.ref === "function").props.ref({ scrollIntoView: (how) => (brought = how) });
    assert.deepEqual(brought, { block: "nearest" });
    const more = find(tree, (n) => Array.isArray(n.props?.groups) && /^More for /.test(n.props.label ?? ""));
    assert.equal(more.props.label, "More for Reach out · Personal trainers");
    more.props.groups[0].items[0].onSelect();
    assert.equal(sheet.armed, true, "the menu's Skip asks first");
    tree = redraw();
    const ask = byTestId(byTestId(tree, "ro-run-acts"), "ro-run-skip");
    assert.match(textOf(ask), /Skipping loses this run only/, "asked in the dock, with the reach-out's note");
  } finally {
    W.matchMedia = media;
  }
});

test("R22: a run that includes unconfirmed addresses never says each has a checked address", async () => {
  world("pending_approval", RUN({ include_unconfirmed: true }));
  const tree = (await open({ sheet: SHEET() }))();
  assert.doesNotMatch(textOf(byTestId(tree, "ro-run-rules")), /checked address/);
});

test("R21: a run from an earlier day goes from now, re-timed in their hours, never at a time already past", async () => {
  world("pending_approval", RUN({ run_for: YESTERDAY }));
  const redraw = await open({ sheet: SHEET() });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-approve")).trim(), "Approve all 30");
  assert.equal(textOf(byTestId(tree, "ro-run-dock")), "30 go from now");
  assert.match(textOf(byTestId(tree, "ro-run-sub")), /From now, re-timed in their hours/);
  assert.doesNotMatch(textOf(byTestId(tree, "ro-run-acts")), new RegExp(FIRST_TIME));
  press(byTestId(tree, "ro-run-list-press"));
  tree = redraw();
  // Each row its face, its name and when: the words that stand for a time are not set in figures.
  assert.deepEqual(lines(tree, "ro-run-person"), ["STStudio Twofrom now"], "never its old time");
});

test("R21: today's run whose first time has passed goes from now, and who gets it says re-timed, never a past time", async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  world(
    "pending_approval",
    RUN({ first_at: past, planned: [{ send_id: "p1", business_name: "Studio Two", send_at: past, checked: true }] }),
  );
  const redraw = await open({ sheet: SHEET() });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-dock")), "30 go from now");
  press(byTestId(tree, "ro-run-list-press"));
  tree = redraw();
  assert.deepEqual(lines(tree, "ro-run-person"), ["STStudio Twofrom now"]);
});

test("who gets it: open on a run that is going (the canvas's board 7), by day and time, today's and the coming days'; folded by its head", async () => {
  const tomorrow = FIRST_MS + 86_400_000;
  world(
    "scheduled",
    RUN({
      today: 1,
      later: 1,
      planned: [
        { send_id: "p1", business_name: "Studio Two", send_at: FIRST_AT, checked: true },
        { send_id: "p3", business_name: "Studio Five", send_at: new Date(tomorrow).toISOString(), checked: true },
      ],
    }),
  );
  const redraw = await open();
  let tree = redraw();
  const fold = byTestId(tree, "ro-run-list");
  assert.equal(fold.props["data-open"], "true", "open from the start on a run that is going");
  assert.equal(byTestId(fold, "ro-run-list-press").props["aria-label"], contracts.WHO_GETS_IT_WORDS.hide);
  assert.deepEqual(lines(tree, "ro-run-person"), [
    `STStudio Two${contracts.clockWhen(FIRST_MS, ZONE, Date.now())}`,
    `SFStudio Five${contracts.clockWhen(tomorrow, ZONE, Date.now())}`,
  ]);
  // A time on the clock is set in figures.
  const at = all(tree, (n) => n.props?.["data-testid"] === "ro-run-person").map((row) =>
    find(row, (n) => n.type === "small"),
  );
  assert.ok(at.length === 2 && at.every((n) => /\bmono\b/.test(n.props.className || "")));
  press(byTestId(fold, "ro-run-list-press"));
  tree = redraw();
  assert.equal(byTestId(tree, "ro-run-list").props["data-open"], "false", "folded under its head");
  assert.deepEqual(lines(tree, "ro-run-person"), []);
});

test("R21: while some are being checked, Approve says so, and who gets it names the checked sends only", async () => {
  world("pending_approval", RUN({ checking: 12 }));
  const redraw = await open({ sheet: SHEET() });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-approve-note")), "12 more go once checked");
  assert.match(textOf(byTestId(tree, "ro-run-why")), /12 being checked/);
  press(byTestId(tree, "ro-run-list-press"));
  tree = redraw();
  assert.deepEqual(
    lines(tree, "ro-run-person"),
    [`STStudio Two${contracts.clockWhen(FIRST_MS, ZONE, Date.now())}`],
    "Studio Three is not checked yet",
  );
  assert.match(textOf(byTestId(tree, "ro-run-list")), /12 more are being checked; they go once they pass/);
});

test("R20: a scheduled run with held opens to them; each door presses its decision and reads the run again; a refusal is said at its row", async () => {
  const w = world("scheduled");
  const redraw = await open({ acts: W.React.createElement("button", { "data-testid": "bc-stop" }, "Cancel") });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-k")), "Scheduled");
  assert.equal(byTestId(tree, "ro-run-approve"), null, "approved already, or under veto: no Approve");
  assert.ok(byTestId(tree, "bc-stop"), "the run's own verbs");
  // The held fold under their amber card's head in every state (the canvas's boards 1, 6 and 7): See them opens them.
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ro-held").length, 0, "folded under their head");
  press(byTestId(tree, "ro-run-see-held"));
  tree = redraw();
  const held = all(tree, (n) => typeof n.type === "string" && n.props?.["data-testid"] === "ro-held");
  assert.equal(held.length, 2, "See them opens them in place");
  assert.match(textOf(held[0]), /Studio One/);
  assert.deepEqual(
    // The buttons drawn: a kit LinkButton is its own node and the host button it draws, both carrying the id.
    all(held[0], (n) => n.type === "button" && /^ro-door-/.test(n.props?.["data-testid"] || "")).map(
      (n) => n.props["data-testid"],
    ),
    // Its answers by the one rule (contracts heldAnswersOf): at step 1 the no is Take out.
    contracts.heldAnswersOf({ reason: "unbacked_fact", detail: "a 4.8 rating" }, 1).map((a) => `ro-door-${a.door}`),
  );
  // One group per row: in the sheet's narrow layout a row's grid has one door cell, and doors laid in it one by one
  // stacked on each other, so a press on Include landed on Skip (seen in the real app, 27 Sep 2026). The held row is the
  // amber card's (held-row.tsx look="card"): its answers are one line of pills under its why.
  for (const row of held) {
    const groups = all(row, (n) => /\bro-hrow-acts\b/.test(n.props?.className || ""));
    assert.equal(groups.length, 1, "a held row's doors are one group");
    assert.equal(
      all(groups[0], (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).length,
      all(row, (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).length,
      "every door is in it",
    );
  }
  const reads = w.reads;
  press(byTestId(held[0], "ro-door-include"));
  // The verb's walk reads the surfaces it moved before it answers, so a fixed number of turns is not enough: a condition is.
  await until(() => (redraw(), w.reads > reads), "the run read again");
  assert.deepEqual(w.pressed.at(-1), ["decide", "h1", "include"]);
  assert.ok(w.reads > reads, "the run read again once the decision landed");
  w.answer = { ok: false, message: contracts.REACH_OUT_REFUSALS.gone };
  tree = redraw();
  press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "ro-held")[0], "ro-door-rewrite"));
  await until(() => byTestId(redraw(), "ro-held-said"), "the refusal said at its row");
  assert.equal(textOf(byTestId(redraw(), "ro-held-said")), contracts.REACH_OUT_REFUSALS.gone);
});

test("a held email's Take out, at step 1, is the leave verb on the run's sequence by its lead, and the run is read again", async () => {
  const w = world("scheduled");
  const redraw = await open();
  const reads = w.reads;
  press(byTestId(redraw(), "ro-run-see-held"));
  const held = all(redraw(), (n) => typeof n.type === "string" && n.props?.["data-testid"] === "ro-held");
  // The check could not run for Studio Four and faulted nothing: only its no, the run's Check the held again its retry.
  assert.deepEqual(
    all(held[1], (n) => n.type === "button" && /^ro-door-/.test(n.props?.["data-testid"] || "")).map(
      (n) => n.props["data-testid"],
    ),
    ["ro-door-take_out"],
  );
  press(byTestId(held[1], "ro-door-take_out"));
  await until(() => (redraw(), w.reads > reads), "the run read again");
  assert.deepEqual(w.pressed.at(-1), ["leave", "r1", { enrollment_ids: [], lead_ids: ["l2"] }]);
  assert.ok(w.reads > reads, "the run read again once they were taken out");
});

test("Check the held again, for the holds the check could not answer: one press for the run", async () => {
  const w = world("sending");
  const redraw = await open();
  press(byTestId(redraw(), "ro-run-see-held"));
  const tree = redraw();
  // At the held card's foot, once its rows are open.
  assert.equal(textOf(byTestId(tree, "ro-run-recheck")), contracts.REACH_OUT_SHEET_WORDS.recheck);
  press(byTestId(tree, "ro-run-recheck"));
  await settle();
  assert.deepEqual(w.pressed.at(-1), ["recheck", "b1"]);
  // None left that the check could not answer: nothing to offer.
  w.detail = DETAIL("sending", RUN({ held: [RUN().held[0]] }));
  const none = await open();
  press(byTestId(none(), "ro-run-see-held"));
  assert.equal(byTestId(none(), "ro-run-recheck"), null);
});

test("D1-lead-person-door: a held and a ready business on the sheet each open their lead over the page (?lead=), so the owner stays on the run; one with no lead named is its name alone", async () => {
  // A page move goes through the bridge's door, which without a frame is the shell's own (CHANLY.nav): none is made. The
  // lead opens over the page as its own entry in the history (leads/sheet/lead-over.ts), here a record of it.
  const went = [];
  const nav = W.CHANLY.nav;
  W.CHANLY.nav = (to) => went.push(to);
  const history = W.history;
  const pushed = [];
  W.history = { state: null, pushState: (_s, _t, url) => pushed.push(url), replaceState() {}, back() {} };
  const pressDoor = (n) => n.props.onClick({ button: 0, stopPropagation() {}, preventDefault() {} });
  const leadOf = (address) => new URL(address, "https://app.invalid").searchParams.get("lead");
  try {
    const LEAD_HELD = "6f1c2a4e-3b7d-4c58-9a10-2d5e8b7c4f01";
    const LEAD_READY = "9d3e5b21-7a64-4f0c-8e12-5c7a1d9b3e22";
    world(
      "scheduled",
      RUN({
        held: [{ ...RUN().held[0], lead_id: LEAD_HELD }],
        planned: [
          { send_id: "p1", lead_id: LEAD_READY, business_name: "Studio Two", send_at: FIRST_AT, checked: true },
          // A read from before the lead was carried: the name stands without a door.
          { send_id: "p9", business_name: "Studio Nine", send_at: FIRST_AT, checked: true },
        ],
      }),
    );
    const redraw = await open();
    press(byTestId(redraw(), "ro-run-see-held"));
    let tree = redraw();
    const held = byTestId(tree, "ro-held-lead");
    assert.equal(textOf(held), "Studio One");
    assert.equal(held.props.title, contracts.REACH_OUT_SHEET_WORDS.openLead);
    assert.equal(leadOf(held.props.href), LEAD_HELD, "its address, for a new tab");
    pressDoor(held);
    assert.equal(leadOf(pushed[0]), LEAD_HELD);
    // Who gets it is open from the start on a run that is going (the canvas's board 7).
    tree = redraw();
    const ready = all(tree, (n) => n.props?.["data-testid"] === "ro-run-person");
    assert.equal(ready.length, 2);
    assert.equal(textOf(byTestId(ready[0], "ro-person-lead")), "Studio Two");
    assert.equal(byTestId(ready[1], "ro-person-lead"), null, "no lead named, no door");
    assert.match(textOf(ready[1]), /Studio Nine/);
    pressDoor(byTestId(ready[0], "ro-person-lead"));
    assert.equal(leadOf(pushed[1]), LEAD_READY);
    assert.deepEqual(went, [], "the page stays where it is");
  } finally {
    W.CHANLY.nav = nav;
    W.history = history;
  }
});

test("a viewer sees the held and why, told once why they may not decide; no door", async () => {
  role.now = "viewer";
  try {
    world("scheduled");
    const tree = (await open())();
    assert.equal(all(tree, (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).length, 0);
    assert.equal(byTestId(tree, "ro-run-recheck"), null);
    assert.equal(textOf(byTestId(tree, "ro-run-role")), W.gateTitle("approve", "decide a held email or approve a run"));
  } finally {
    role.now = "owner";
  }
});

test("a run no longer live, or not a reach-out's, is not this block", async () => {
  world("sent");
  const tree = (await open())();
  assert.ok(byTestId(tree, "bc-detail"), "the run's own page is drawn, over the real report and parts");
  assert.equal(byTestId(tree, "ro-run"), null);
});

test("R21: the run is read again while the check reads some of it, and not once it does not, nor once it closes", async () => {
  const w = world("scheduled", RUN({ checking: 5 }));
  /** Watches started and not stopped: one while the check reads some of the run, none otherwise. */
  const live = () =>
    w.pressed.filter((p) => p[0] === "watch").length - w.pressed.filter((p) => p[0] === "unwatch").length;
  const redraw = await open();
  assert.deepEqual(w.pressed, [["watch", "b1"]], "watching while 5 are being checked");
  // The check is done: the next read says so, and the watch stops.
  w.detail = DETAIL("scheduled", RUN({ checking: 0 }));
  W.dispatchEvent(new Event("surface:broadcasts"));
  redraw();
  await settle();
  redraw();
  assert.equal(live(), 0);
  // Checking again, then the run closed: the watch stops with it.
  w.detail = DETAIL("scheduled", RUN({ checking: 2 }));
  W.dispatchEvent(new Event("surface:broadcasts"));
  redraw();
  await settle();
  redraw();
  assert.equal(live(), 1);
  unmount();
  assert.equal(live(), 0);
  assert.deepEqual(w.pressed.at(-1), ["unwatch", "b1"]);
});

test("the bridge's watch reads the run every fifteen seconds through the broadcasts courier, and stops by itself", async () => {
  realVerbs();
  mock.timers.enable({ apis: ["setTimeout"] });
  const was = W.fetch;
  let checking = 2;
  const asked = [];
  W.fetch = async (url) => {
    asked.push(new URL(String(url), "https://app.example").pathname);
    const data = DETAIL("scheduled", RUN({ checking }));
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const heard = [];
  try {
    const stop = bridge.reachOuts.watchRun("b1", (d) => heard.push(d.reach_out.checking));
    mock.timers.tick(14_999);
    await settle();
    assert.equal(asked.length, 0, "nothing before fifteen seconds");
    mock.timers.tick(1);
    for (let i = 0; i < 5; i += 1) await settle();
    assert.deepEqual(heard, [2]);
    checking = 0;
    mock.timers.tick(15_000);
    for (let i = 0; i < 5; i += 1) await settle();
    assert.deepEqual(heard, [2, 0]);
    mock.timers.tick(60_000);
    for (let i = 0; i < 5; i += 1) await settle();
    assert.deepEqual(heard, [2, 0], "stopped by itself once nothing is being checked");
    assert.ok(asked.every((p) => p.endsWith("/broadcasts/b1")));
    // Stopped from outside before its beat: nothing more is read.
    checking = 3;
    const stop2 = bridge.reachOuts.watchRun("b1", (d) => heard.push(d.reach_out.checking));
    stop2();
    mock.timers.tick(30_000);
    for (let i = 0; i < 5; i += 1) await settle();
    assert.deepEqual(heard, [2, 0]);
    stop();
  } finally {
    W.fetch = was;
    mock.timers.reset();
  }
});

test("the watch stops on a run this member may not read, or that is gone: a 4xx asks again for nothing", async () => {
  realVerbs();
  mock.timers.enable({ apis: ["setTimeout"] });
  const was = W.fetch;
  let asked = 0;
  W.fetch = async () => {
    asked += 1;
    return new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: "Run not found." } }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const heard = [];
    bridge.reachOuts.watchRun("b404", (d) => heard.push(d));
    for (let beat = 0; beat < 4; beat += 1) {
      mock.timers.tick(15_000);
      for (let i = 0; i < 5; i += 1) await settle();
    }
    assert.deepEqual([asked, heard.length], [1, 0]);
  } finally {
    W.fetch = was;
    mock.timers.reset();
  }
});

test("the email is drawn as they read it: its paragraphs, the name under its words or the mailbox's signature, then the foot (30 Oct 2026)", async () => {
  const first = {
    ...RUN().first,
    signature: "Sam Rivera\nHarbor Moving Co.",
    foot: "I found your business on Google Maps.\nThis is a marketing email.\nHarbor Moving Co. · 1 Main St, Austin, TX\nNo thanks? Just reply and say so.",
  };
  world("pending_approval", RUN({ first }));
  const tree = (await open({ sheet: SHEET() }))();
  // REGRESSION: "As they read it" ended at the ask: no name, no signature, no foot, every paragraph run into one.
  const words = textOf(byTestId(tree, "ro-run-words"));
  assert.match(words, /I run Harbor Moving Co\.\n\nSam/, "the name under the words, its paragraphs kept");
  assert.equal(textOf(byTestId(tree, "ro-run-signature")), "Sam Rivera\nHarbor Moving Co.");
  assert.equal(textOf(byTestId(tree, "ro-run-legal")), first.foot);
  // A run read from a server before them draws its words alone.
  world("pending_approval", RUN());
  const plain = (await open({ sheet: SHEET() }))();
  assert.equal(byTestId(plain, "ro-run-signature"), null);
  assert.equal(byTestId(plain, "ro-run-legal"), null);
});

test("a mailbox that has not sent yet goes on its first day of sending, never its zeroth (30 Oct 2026)", async () => {
  world(
    "pending_approval",
    RUN({ mailboxes: [{ address: "sam@harbor-mail.example", sent_days: 0, daily_cap: 40, customer_domain: false }] }),
  );
  const tree = (await open({ sheet: SHEET() }))();
  assert.equal(textOf(byTestId(tree, "ro-run-from")), "From sam@harbor-mail.example · its first day of sending");
});

test("who gets it shows each email's opening, with Rewrite the opening and Take out at its row, each pressing its verb (30 Oct 2026)", async () => {
  const w = world(
    "pending_approval",
    RUN({
      today: 2,
      planned: [
        {
          send_id: "p1",
          lead_id: "l1",
          business_name: "Studio Two",
          send_at: FIRST_AT,
          checked: true,
          opening: "A 4.9 from 16 reviews says people find you.",
        },
        {
          send_id: "p2",
          lead_id: "l2",
          business_name: "Studio Three",
          send_at: FIRST_AT,
          checked: true,
          opening: null,
        },
      ],
    }),
  );
  const flashed = [];
  const redraw = await open({ sheet: SHEET(), flash: (f) => flashed.push(f) });
  let tree = redraw();
  press(byTestId(tree, "ro-run-list-press"));
  tree = redraw();
  const rows = all(tree, (n) => n.props?.["data-testid"] === "ro-run-person");
  assert.equal(rows.length, 2);
  // REGRESSION: the run's screen, where Approve is, listed names and times alone: an OK sent openings nobody read.
  assert.equal(textOf(byTestId(rows[0], "ro-person-opening")), "A 4.9 from 16 reviews says people find you.");
  assert.equal(byTestId(rows[1], "ro-person-opening"), null, "not written yet: nothing to show");
  // The buttons drawn: a kit Button is its own node and the host button it draws, both carrying the id.
  const doorsOf = (row) =>
    all(row, (n) => n.type === "button" && /^ro-person-door-/.test(n.props?.["data-testid"] ?? "")).map(textOf);
  assert.deepEqual(doorsOf(rows[0]), ["Rewrite the opening", "Take out"]);
  assert.deepEqual(doorsOf(rows[1]), ["Take out"]);
  const reads = w.reads;
  press(byTestId(rows[0], "ro-person-door-rewrite"));
  // The verb's walk reads the surfaces it moved before it answers: a condition, never a fixed number of turns.
  await until(() => (redraw(), w.reads > reads), "the run read again");
  assert.deepEqual(
    w.pressed.filter((p) => p[0] === "decide"),
    [["decide", "p1", "rewrite"]],
  );
  press(byTestId(redraw(), "ro-person-door-take_out"));
  await until(() => w.pressed.some((p) => p[0] === "leave"), "Take out pressed");
  const left = w.pressed.find((p) => p[0] === "leave");
  assert.deepEqual([left[1], left[2].lead_ids], ["r1", ["l1"]], "Take out is the leave verb on the lead");
});
