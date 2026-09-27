/**
 * A reach-out run on Broadcasts (Reach out, Part 4 PR 7; F13, R20–R22), run on the stub React over the bridge's own
 * words (legacy-bridge/reach-out/reach-outs.ts `run`, contracts reachOutRunWordsOf over approvalWordsOf) and a stubbed
 * `window.__broadcasts` and `window.__reachOuts`: the block a live reach-out run opens to, waiting on its owner or not;
 * today's share and the rest, the held with their reasons and doors, the skipped by reason, how many are still being
 * checked, and the first ready business's email with its opening marked; Approve naming the checked sends only, from
 * now for a run from an earlier day; the doors and "Check the held again" pressing their routes and reading the run
 * again; and the run read again every fifteen seconds while the check still reads some of it, stopping when it does
 * not or the run closes.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, unmount, all, byTestId, textOf, press, settle } from "../_legacy-react.mjs";

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
const L = "../../../../apps/dashboard/src/legacy";
await import(`${L}/components/data-bits.jsx`);
await import(`${L}/pages/reach-out/reach-out-approval.jsx`);
await import(`${L}/pages/broadcasts-run.jsx`);
const bridge = await import("../../../../apps/dashboard/src/legacy-bridge/reach-out/reach-outs.ts");

/**
 * The run's first send, two hours on, by the zone's own clock (never a fixed UTC hour, which moves with daylight
 * saving), and the words that time is said in.
 */
const FIRST_MS = Date.now() + 2 * 3_600_000;
const FIRST_AT = new Date(FIRST_MS).toISOString();
const FIRST_TIME = contracts.clockTime(FIRST_MS, ZONE);
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
  domains: [{ host: "harbor-mail.example", sent_days: 3 }],
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
  },
  recipients: [],
  reach_out: run,
});

/** The couriers, stubbed: the run as the test holds it, each read and press recorded. */
const world = (state, run) => {
  const w = { detail: DETAIL(state, run), reads: 0, pressed: [], answer: { ok: true, data: {} } };
  W.__broadcasts = {
    detail: async () => ((w.reads += 1), { ok: true, data: w.detail }),
    peekDetail: () => null,
  };
  W.__reachOuts = {
    words: bridge.reachOuts.words,
    run: bridge.reachOuts.run,
    decide: async (id, door) => (w.pressed.push(["decide", id, door]), w.answer),
    recheck: async (id) => (w.pressed.push(["recheck", id]), w.answer),
    watchRun: (id) => {
      w.pressed.push(["watch", id]);
      return () => w.pressed.push(["unwatch", id]);
    },
  };
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
  const draw = () => W.React.createElement(W.BroadcastDetail, { id: "b1", onClose: () => {}, ...props });
  fresh();
  again(draw);
  await settle();
  again(draw);
  await settle();
  return () => again(draw);
};
const lines = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id).map(textOf);

test("a run waiting on its owner: today's share and the rest, the held, the skipped, the rules, the email as it reads (F13, R22)", async () => {
  world("pending_approval");
  const sheet = SHEET();
  const redraw = await open({ sheet });
  const tree = redraw();
  assert.ok(byTestId(tree, "ro-run"), "a reach-out run opens to its own block, never a WhatsApp run's sheet");
  assert.equal(byTestId(tree, "bc-sheet"), null);
  assert.equal(textOf(byTestId(tree, "ro-run-k")), "Waiting on you");
  assert.equal(textOf(byTestId(tree, "ro-run-will")), "30 will get it today");
  assert.match(textOf(byTestId(tree, "ro-run-reach")), /of 44/);
  const why = textOf(byTestId(tree, "ro-run-why"));
  assert.match(why, /12 wait for the coming days/);
  assert.match(why, /2 held by the check/);
  assert.deepEqual(lines(tree, "ro-run-skipped"), [
    "3 skipped · keep no open hour all week",
    "1 skipped · missing a value your words name",
  ]);
  const rules = textOf(byTestId(tree, "ro-run-rules"));
  assert.match(rules, /each has a checked address/, "R22: said while no unconfirmed address is included");
  assert.match(rules, /all from harbor-mail\.example, 3 clean days/, "R22: the run's own domain, its days sent");
  assert.equal(textOf(byTestId(tree, "ro-run-opening")), "A 4.9 from 16 reviews says people find you.");
  assert.match(textOf(byTestId(tree, "ro-run-reader")), /^as Studio Two reads it/);
  assert.equal(textOf(byTestId(tree, "ro-run-approve")).trim(), `Approve — 30 from ${FIRST_TIME}`);
  press(byTestId(tree, "ro-run-approve"));
  assert.equal(sheet.approved, 1);
  assert.equal(
    sheet.said,
    "Reach out · Personal trainers approved — 30 emails today, in their hours",
    "the flash says the block's today count, never the run's whole",
  );
  // Skip asks first, with the reach-out's note.
  press(byTestId(tree, "ro-run-skip"));
  const asked = redraw();
  assert.equal(sheet.armed, true);
  const ask = all(asked, (n) => n.props?.testid === "ro-run-skip")[0];
  assert.match(ask.props.detail, /Skipping loses this run only/);
  assert.equal(ask.props.question, "Skip Reach out · Personal trainers's run?");
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
  assert.equal(textOf(byTestId(tree, "ro-run-approve")).trim(), "Approve — 30 from now");
  assert.match(textOf(byTestId(tree, "ro-run-sub")), /goes from now, re-timed in their hours/);
  assert.doesNotMatch(textOf(byTestId(tree, "ro-run-acts")), new RegExp(FIRST_TIME));
  press(byTestId(tree, "ro-run-see"));
  tree = redraw();
  assert.deepEqual(lines(tree, "ro-run-person"), ["Studio Twore-timed in their hours"], "never its old time");
});

test("R21: today's run whose first time has passed goes from now, and who gets it says re-timed, never a past time", async () => {
  const past = new Date(Date.now() - 3_600_000).toISOString();
  world(
    "pending_approval",
    RUN({ first_at: past, planned: [{ send_id: "p1", business_name: "Studio Two", send_at: past, checked: true }] }),
  );
  const redraw = await open({ sheet: SHEET() });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-approve")).trim(), "Approve — 30 from now");
  press(byTestId(tree, "ro-run-see"));
  tree = redraw();
  assert.deepEqual(lines(tree, "ro-run-person"), ["Studio Twore-timed in their hours"]);
});

test("who gets it: by day and time, today's and the coming days' counted as the reach line counts them", async () => {
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
  assert.equal(textOf(byTestId(tree, "ro-run-see")), "See the 1 today and 1 later");
  press(byTestId(tree, "ro-run-see"));
  tree = redraw();
  assert.deepEqual(lines(tree, "ro-run-person"), [
    `Studio Two${contracts.clockWhen(FIRST_MS, ZONE, Date.now())}`,
    `Studio Five${contracts.clockWhen(tomorrow, ZONE, Date.now())}`,
  ]);
});

test("R21: while some are being checked, Approve says so, and who gets it names the checked sends only", async () => {
  world("pending_approval", RUN({ checking: 12 }));
  const redraw = await open({ sheet: SHEET() });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-approve-note")), "12 more are being checked; they go once they pass.");
  assert.match(textOf(byTestId(tree, "ro-run-why")), /The receptionist is checking 12 more/);
  press(byTestId(tree, "ro-run-see"));
  tree = redraw();
  assert.deepEqual(
    lines(tree, "ro-run-person"),
    [`Studio Two${contracts.clockWhen(FIRST_MS, ZONE, Date.now())}`],
    "Studio Three is not checked yet",
  );
  assert.match(textOf(byTestId(tree, "ro-run-list")), /Who gets it · 12 more are being checked/);
});

test("R20: a scheduled run with held opens to them; each door presses its decision and reads the run again; a refusal is said at its row", async () => {
  const w = world("scheduled");
  const redraw = await open({ acts: W.React.createElement("button", { "data-testid": "bc-stop" }, "Cancel") });
  let tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-k")), "Scheduled");
  assert.equal(byTestId(tree, "ro-run-approve"), null, "approved already, or under veto: no Approve");
  assert.ok(byTestId(tree, "bc-stop"), "the run's own verbs");
  const held = all(tree, (n) => n.props?.["data-testid"] === "ro-held");
  assert.equal(held.length, 2, "open at once: the notice and Playbooks' link land on them");
  assert.match(textOf(held[0]), /Studio One/);
  assert.deepEqual(
    all(held[0], (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).map((n) => n.props["data-testid"]),
    contracts.holdDoors("unbacked_fact").map((d) => `ro-door-${d}`),
  );
  // One group per row: in the sheet's narrow layout a row's grid has one door cell, and doors laid in it one by one
  // stacked on each other, so a press on Include landed on Skip (seen in the real app, 27 Sep 2026).
  for (const row of held) {
    const groups = all(row, (n) => /\bbc-person-doors\b/.test(n.props?.className || ""));
    assert.equal(groups.length, 1, "a held row's doors are one group");
    assert.equal(
      all(groups[0], (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).length,
      all(row, (n) => /^ro-door-/.test(n.props?.["data-testid"] || "")).length,
      "every door is in it",
    );
  }
  const reads = w.reads;
  press(byTestId(held[0], "ro-door-include"));
  await settle();
  redraw();
  await settle();
  assert.deepEqual(w.pressed.at(-1), ["decide", "h1", "include"]);
  assert.ok(w.reads > reads, "the run read again once the decision landed");
  w.answer = { ok: false, message: "This email was planned too long ago to include." };
  tree = redraw();
  press(byTestId(all(tree, (n) => n.props?.["data-testid"] === "ro-held")[0], "ro-door-skip"));
  await settle();
  assert.equal(textOf(byTestId(redraw(), "ro-held-said")), "This email was planned too long ago to include.");
});

test("Check the held again, for the holds the check could not answer: one press for the run", async () => {
  const w = world("sending");
  const redraw = await open();
  const tree = redraw();
  assert.equal(textOf(byTestId(tree, "ro-run-recheck")), contracts.REACH_OUT_SHEET_WORDS.recheck);
  press(byTestId(tree, "ro-run-recheck"));
  await settle();
  assert.deepEqual(w.pressed.at(-1), ["recheck", "b1"]);
  // None left that the check could not answer: nothing to offer.
  w.detail = DETAIL("sending", RUN({ held: [RUN().held[0]] }));
  const none = await open();
  assert.equal(byTestId(none(), "ro-run-recheck"), null);
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
  W.__broadcasts.report = () => null;
  W.CmHead = () => null;
  W.CmDot = () => null;
  W.StatePill = () => null;
  const tree = (await open())();
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
  mock.timers.enable({ apis: ["setTimeout"] });
  const was = W.fetch;
  let asked = 0;
  W.fetch = async () => {
    asked += 1;
    return new Response(JSON.stringify({ ok: false, error: { code: "not_found", message: "Broadcast not found." } }), {
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
