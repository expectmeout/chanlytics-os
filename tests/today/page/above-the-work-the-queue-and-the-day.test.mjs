/**
 * Today: what stands above the work, the day's card, the queue, the day, what Ask found, nothing since you looked,
 * the mockup gone, and the page's composition.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toTodayVM,
  todayRunWords,
  todayRunApproved,
  unreadCount,
  zoneDayKey,
  toPersonRowVM,
  PEOPLE_LISTS,
  peopleListAction,
  LIFECYCLE_WORDS,
  CHANNELS_DOOR,
} from "@chanlytics/contracts";
import { todayLeaks } from "../../../apps/dashboard/src/surfaces/today/leaks.ts";
import { again, all, find, byTestId, textOf, classes, press, quiet, redrawWanted } from "../../_stub-react.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";
import { until } from "../../shared/_until.mjs";
import {
  AskFound,
  DayCameTo,
  DayZone,
  FoundOnToday,
  NOW,
  NeedYou,
  NeedYouOnToday,
  TodayAlertBand,
  TodayPins,
  TodaySetup,
  TodayZones,
  W,
  ZONE,
  asked,
  bcWhenWords,
  bellRow,
  block,
  broadcasts,
  busy,
  buttons,
  calendar,
  calls,
  cardOf,
  clear,
  draw,
  escalations,
  failed,
  flashes,
  foundDoorOf,
  foundRowOf,
  headSaid,
  headSentence,
  headline,
  iso,
  linesIn,
  metrics,
  nameOf,
  noPlaybooks,
  people,
  quietDay,
  run,
  set,
  setSurfaceValue,
  surfaceLanded,
  threads,
  went,
  withNobodyAnswered,
} from "./_page.mjs";
import { bridgeHolds, surfaceValue, provided } from "../../shell/_bridge-holds.mjs";

/* ------------------------------------ above the work ------------------------------------ */

test("above the work, nothing while every line is up; a line that is down is one band with its one door", () => {
  clear();
  set({ today: busy() });
  const tree = draw(TodayAlertBand);
  assert.equal(byTestId(tree, "today-standing"), null, "the standing line went: no date, no clock, no count");
  assert.equal(byTestId(tree, "today-alert"), null, "and nothing stands in its place while the lines are up");
  assert.equal(textOf(tree), "");
  const down = toTodayVM(
    metrics({ channels: [{ kind: "whatsapp", status: "disconnected", number: "+1 305" }] }),
    [],
    [],
    [],
    NOW,
  );
  set({ today: down });
  const dark = draw(TodayAlertBand);
  const alert = byTestId(dark, "today-alert");
  assert.ok(alert, "a line that is down is the one thing that cannot wait");
  assert.equal(alert.props.role, "alert");
  assert.ok(textOf(alert).startsWith(down.standing.alert), textOf(alert));
  // Its one door (Today in three zones, 2 Nov 2026): where the line is connected again.
  const door = find(alert, (n) => !!n.props?.href && textOf(n).trim() === "Reconnect");
  assert.ok(door, "Reconnect");
  door.props.onClick();
  assert.equal(went.at(-1), CHANNELS_DOOR);
  assert.equal(
    find(dark, (n) => classes(n).includes("live-dot")),
    null,
    "the coral live-dot is the agent's live state, never a status light",
  );
  assert.ok(!/Good (morning|afternoon|evening)/.test(textOf(dark)));
  set({ today: undefined });
  assert.equal(
    draw(TodayAlertBand).rendered,
    null,
    "no seeded hero: without the view model there is nothing above the work",
  );
});

/* ------------------------------------ the day's card ------------------------------------ */

test("what is not a number: never the traffic the figures say, nor a reply that failed (Need you's row) under the head; a run that went out in the day", () => {
  clear();
  bridgeHolds({ values: { broadcasts: broadcasts() } });
  set({ today: busy(), headline: headline() });
  const warned = draw(TodayAlertBand);
  assert.ok(
    !/receptionist answered|reached the phone line|messages? in/.test(textOf(warned)),
    `REGRESSION: the figures say these already: ${textOf(warned)}`,
  );
  assert.ok(
    !/failed to deliver|didn't reach/.test(textOf(warned)),
    "the band is for what stops every customer: a reply that failed is Need you's row, with Try again (today-doors)",
  );
  // A run that went out is said in the day, at the time it went, with what it has earned so far.
  const day = draw(DayZone);
  const run = surfaceValue("broadcasts").rows[2]; // the run drawn: a second broadcasts() can fall a minute later
  const done = byTestId(day, "today-day-went");
  assert.ok(done, "a run that went out, in the day");
  const at = provided("clock").time(Date.parse(run.started_at));
  assert.ok(textOf(done).includes(`went out at ${at} · ${todayRunWords(run).done.counts}`), textOf(done));
  assert.ok(!textOf(done).includes("—"), "no em dash in a new sentence");
  assert.ok(busy().recap.receipts.length > 0, "the fixture is a day with replies");
  assert.equal(
    all(day, (n) => n.props?.["data-testid"] === "brief-receipt").length +
      all(warned, (n) => n.props?.["data-testid"] === "brief-receipt").length,
    0,
    "no receipt under a summary (7 Oct 2026): what was replied is a question away",
  );
});

// Decision 0009: any list is a door on Today, pinned by the member (memberships.views.today.pins). The test of it went
// with While you were away's page (the 3 Nov audit, item 61): the foot draws the pins now.
test("the lists a member pinned are lines, each with People's count where it has one; a list that is gone is left out", async () => {
  clear();
  const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
  const S3 = "cccccccc-3333-4333-8333-cccccccccccc";
  const lists = {
    lists: [{ id: "quiet", label: "Quiet 30+ days", count: 4 }],
    saved: [
      { id: S2, name: "VIPs", count: 12, unknown: null },
      { id: S3, name: "Booked soon", count: 0, unknown: "No calendar is read." },
    ],
    views: {
      today: {
        pins: ["seg:quiet", `list:${S2}`, `list:${S3}`, "seg:gone", "list:dddddddd-4444-4444-8444-dddddddddddd"],
      },
    },
  };
  try {
    bridgeHolds({ values: { people: lists } });
    set({ today: busy(), headline: headline() });
    setSurfaceValue("people", lists);
    // People's lists' code, as the pins ask for it while Today loads (foot.tsx listsCode), landed.
    await import("../../../apps/dashboard/src/surfaces/people/people-lists.ts");
    const pinsOf = (tree) => linesIn(tree, "today-pins");
    await until(() => pinsOf(draw(TodayPins)).length > 0, "the lists' code, and the pins it draws");
    const pins = pinsOf(draw(TodayPins));
    assert.deepEqual(
      pins.map(nameOf),
      ["Quiet 30+ days", "VIPs", "Booked soon"],
      "each pinned list that is there, in the member's order; a list that is gone left out",
    );
    assert.deepEqual(
      pins.map((p) => textOf(find(p, (n) => classes(n).includes("calm-said")) ?? null)),
      ["4", "12", ""],
      "a count where People has one, none where it cannot count",
    );
    press(find(pins[1], (n) => typeof n.props?.href === "string"));
    assert.equal(went.at(-1), `clients/list:${S2}`, "each opens its list on People");
    // Nothing pinned: no pins.
    const none = { ...lists, views: {} };
    bridgeHolds({ values: { people: none } });
    set({});
    setSurfaceValue("people", none);
    assert.equal(byTestId(draw(TodayPins), "today-pins"), null);
  } finally {
    setSurfaceValue("people", undefined);
    bridgeHolds({ values: { people: undefined } });
    set({});
  }
});

test("a quiet day: the head says nothing needs you and proves the lines are listening", () => {
  clear();
  const vm = quietDay();
  set({ today: vm, headline: headline() });
  assert.match(vm.proof, /^The last message arrived yesterday at 5:39 PM, and AI answered 1m 18s later\.$/);
  const said = textOf(headSentence(true));
  // What is listening, and when the last message came and how fast it was answered (the canvas of 2 Nov 2026).
  assert.equal(said, `${vm.quiet.headline} ${vm.quiet.sub}`, said);
  assert.match(said, /AI is on\. Last message yesterday 5:39 PM, answered in 1m 18s\./);
  // And says first what a quiet day means for the person reading it: nothing waits on them (7 Oct 2026).
  assert.ok(said.startsWith("Nothing needs you."), said);
  // The sentence is the whole of it (7 Oct 2026): no list of lines and their numbers under it, and no second door.
  const page = draw(TodayZones);
  assert.equal(byTestId(page, "brief-quiet-proof"), null);
  assert.equal(buttons(page, "earlier conversation").length, 0);
  assert.equal(byTestId(page, "today-quiet-line"), null, "no quiet sentence on the page: the head says the day");
});

test("the calls read failed: Need you says so where its calls stand, once", () => {
  clear();
  bridgeHolds({ values: { broadcasts: { rows: [] } } });
  set({ today: toTodayVM(metrics(), threads(), escalations(), null, NOW) });
  const tree = draw(NeedYouOnToday);
  assert.ok(byTestId(tree, "today-calls-failed"));
  assert.equal(all(tree, (n) => String(n.props?.className || "").includes("empty-failed")).length, 1);
  set({ today: busy() });
  assert.equal(byTestId(draw(NeedYouOnToday), "today-calls-failed"), null, "a calls read that landed is not failed");
});

/* ------------------------------------ the queue ------------------------------------ */

test("who waits holds the card and the page's one primary verb; the run waiting for a word is a line after them, in contracts' words; the approval toast too", async () => {
  clear();
  const approved = { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) };
  bridgeHolds({
    values: { broadcasts: broadcasts() },
    parts: {
      broadcasts: {
        approve: async () => ({ ok: true, data: approved }),
        cancel: async () => ({ ok: true, data: {} }),
      },
    },
  });
  set({
    today: busy(),
  });
  const tree = draw(NeedYouOnToday);
  const queue = byTestId(tree, "today-queue");
  assert.equal(
    find(queue, (n) => classes(n).includes("tq-count")),
    null,
    "REGRESSION: a number over the rows that say it",
  );
  assert.equal(byTestId(queue, "queue-call"), null, "a call worth a listen waits on nobody: it is AI found's");
  const isPrimary = (n) =>
    n.type === "button" && /(^| )(btn-primary|primary)( |$)/.test(String(n.props.className ?? ""));
  const corals = new Set(all(tree, isPrimary));
  assert.equal(corals.size, 1, "the page's one primary verb");
  assert.ok(all(cardOf(tree), (n) => corals.has(n)).length, "the card's");
  // The run waiting for a word: a line after who waits, its title the run's own (contracts todayRunWords).
  const w = todayRunWords(broadcasts().rows[0]);
  const runLine = linesIn(tree, "today-queue").find((l) => l.props["data-testid"] === "brief-run-row");
  assert.ok(runLine, "the run is a line");
  assert.equal(nameOf(runLine), w.waiting.head);
  assert.equal(byTestId(tree, "brief-run-soon"), null, "a run that goes on its own is the day's line");
  // Nobody waits: the run holds the card, and its Approve is said as the server took it.
  set({ today: quietDay() });
  const card = cardOf(draw(NeedYouOnToday));
  assert.equal(card.props["data-holder"], "wait");
  await press(buttons(card, "Approve")[0]);
  const t = todayRunApproved("Win-back", 3, bcWhenWords(approved));
  assert.match(t.rest, /scheduled for/, "the server moved it, and the sentence says when");
  assert.equal(textOf(flashes.at(-1).msg), `${t.lead} ${t.rest}`);
  assert.ok(!textOf(flashes.at(-1).msg).includes("sending now"));
  // The broadcasts read failed: the queue's rows are current, and it says the runs could not be read.
  bridgeHolds({ values: { broadcasts: undefined } });
  set({ today: busy() });
  failed.add("broadcasts");
  const broke = draw(NeedYouOnToday);
  assert.match(textOf(byTestId(broke, "today-runs-failed")), /Couldn't read the campaign runs/);
  assert.match(textOf(cardOf(broke)), new RegExp(busy().queue.rows[0].who), "the rows themselves stand");
});

test("a reach-out's run waiting on Today is opened, never approved from the card (D6): its sheet counts and names each send first", async () => {
  clear();
  const approvals = [];
  bridgeHolds({
    values: {
      broadcasts: {
        rows: [run("b-wait", "pending_approval"), run("b-wait-2", "pending_approval")],
      },
    },
    parts: {
      broadcasts: {
        approve: async (id) => (approvals.push(id), { ok: true, data: { recipient_count: 3 } }),
        cancel: async () => ({ ok: true, data: {} }),
      },
    },
  });
  set({
    today: quietDay(),
  });
  // Two of a customer campaign's waiting for an OK are one row (the run review's item 5, the Campaigns wiring review's
  // rule D): it opens the first, whose screen walks the rest, and approves nothing. Nobody waits: it is the card.
  let card = cardOf(draw(NeedYouOnToday));
  assert.ok(byTestId(card, "brief-runs-row"), "two runs waiting for an OK are one card");
  assert.ok(textOf(card).includes("2 runs wait for your approval"), textOf(card));
  assert.equal(buttons(card, "Approve").length, 0, "it opens, and sends nothing by itself");
  went.length = 0;
  press(buttons(card, "Review")[0]);
  assert.deepEqual(went, ["campaigns/sequences/b-wait/runs/b-wait"], "the first, at its home");
  // Cold email is one row of its own (decision 0120, D8): two of its runs waiting, one for an OK and one going with emails
  // held for a look, say what waits in both and open the held one first. "N runs wait for your OK" says nothing of leads.
  const cold = (id, state, over = {}) =>
    run(id, state, { audience: { kind: "reach_out", label: "Movers nearby", root_id: "s-movers" }, ...over });
  bridgeHolds({
    values: {
      broadcasts: {
        rows: [
          cold("b-first", "pending_approval", { recipient_count: 12 }),
          cold("b-nudge", "sending", { held: 2, recipient_count: 9 }),
          run("b-wait", "pending_approval"),
        ],
      },
    },
  });
  set({});
  const page = draw(NeedYouOnToday);
  card = cardOf(page);
  assert.ok(byTestId(card, "brief-cold-email"), "cold email's runs are one card");
  assert.equal(byTestId(page, "brief-runs-row"), null, "and the runs waiting for an OK are not counted with them");
  assert.equal(
    linesIn(page, "today-queue").filter((l) => l.props["data-testid"] === "brief-run-row").length,
    1,
    "the campaign's own run is a line",
  );
  assert.ok(textOf(card).includes("Cold email"), textOf(card));
  assert.ok(
    textOf(card).includes("2 held for a look. 12 emails wait for your approval. Each one you answer opens the next."),
    textOf(card),
  );
  assert.equal(buttons(card, "Approve").length, 0, "no one-tap send of a cold email from Today, folded or not");
  went.length = 0;
  // On a phone, as this page is drawn, each card's press is Review (wait-rows.tsx): what is done there.
  press(buttons(card, "Review")[0]);
  assert.deepEqual(went, ["campaigns/sequences/b-nudge/runs/b-nudge"], "the held one first, at its home");
  // A reach-out's run alone is opened, never approved from the card (D6).
  bridgeHolds({
    values: {
      broadcasts: {
        rows: [run("b-reach", "pending_approval", { audience: { kind: "reach_out", label: "Movers nearby" } })],
      },
    },
  });
  set({});
  const reach = cardOf(draw(NeedYouOnToday));
  assert.equal(buttons(reach, "Approve").length, 0, "no one-tap send of a reach-out from Today");
  assert.equal(buttons(reach, "Review").length, 1, "the card opens the run");
  assert.equal(buttons(reach, "See who's on it").length, 0, "one door, not the same door twice");
  // A playbook's run alone keeps its Approve, in the one word every screen says for it (decision 19): with its count.
  bridgeHolds({ values: { broadcasts: { rows: [run("b-wait", "pending_approval")] } } });
  set({});
  const playbook = cardOf(draw(NeedYouOnToday));
  assert.equal(buttons(playbook, "Approve").length, 1);
  assert.equal(textOf(buttons(playbook, "Approve")[0]), LIFECYCLE_WORDS.ledger.approve(3));
  assert.equal(textOf(buttons(playbook, "Approve")[0]), "Approve all 3");
  assert.deepEqual(approvals, [], "nothing was approved by drawing the card");
});

test("a run's Approve from the card is said the moment the server takes it, with what it scheduled, not after the runs are read again", async () => {
  clear();
  let reread = () => {};
  const accepted = { recipient_count: 3, scheduled_for: iso(3_600_000), moved_from: iso(0) };
  bridgeHolds({
    values: { broadcasts: broadcasts() },
    parts: {
      broadcasts: {
        approve: (_id, opts = {}) => {
          if (opts.onAccepted) opts.onAccepted(accepted);
          return new Promise((r) => {
            reread = () => r({ ok: true, data: accepted });
          });
        },
        cancel: async (id, opts = {}) => {
          canceled.push(id);
          if (opts.onAccepted) opts.onAccepted({ was: "scheduled" });
          return { ok: true, data: { was: "scheduled" } };
        },
      },
    },
  });
  set({
    today: quietDay(),
  });
  const canceled = [];
  const waiting = cardOf(draw(NeedYouOnToday));
  const done = press(buttons(waiting, "Approve")[0]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(flashes.length, 1, "said at acceptance");
  const t = todayRunApproved("Win-back", 3, bcWhenWords(accepted));
  assert.equal(textOf(flashes[0].msg), `${t.lead} ${t.rest}`);
  reread();
  await done;
  assert.equal(flashes.length, 1, "and said once");
  // The way back, as Send once's toast offers it: the approved run goes in an hour, so it is canceled, never yet stopped.
  assert.equal(flashes[0].action?.label, "Cancel it", "REGRESSION: an approval's toast offered no way back");
  await flashes[0].action.onClick();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(canceled, ["b-wait"], "the run just approved");
  assert.match(textOf(flashes.at(-1).msg), /canceled · nothing will send/);
});

test("REGRESSION (S9-10): a run's Approve on Today waits while it is on its way -- a second press approved again, as Sent's once did", async () => {
  clear();
  const approvals = [];
  let land = () => {};
  bridgeHolds({
    values: { broadcasts: broadcasts() },
    parts: {
      broadcasts: {
        approve: (id) => {
          approvals.push(id);
          return new Promise((r) => {
            land = () => r({ ok: true, data: { recipient_count: 3, scheduled_for: iso(0), moved_from: null } });
          });
        },
        cancel: async () => ({ ok: true, data: {} }),
      },
    },
  });
  set({
    today: quietDay(),
  });
  const row = () => cardOf(again(() => W.React.createElement(NeedYouOnToday)));
  const first = cardOf(draw(NeedYouOnToday));
  const done = press(buttons(first, "Approve")[0]);
  press(buttons(first, "Approve")[0]);
  assert.equal(approvals.length, 1, "REGRESSION: the second press asked the server again, which refused it");
  const waiting = buttons(row(), "Approve")[0];
  assert.equal(waiting.props.disabled, true, "the verb waits while the first is on its way");
  assert.equal(waiting.props["aria-busy"], true);
  land();
  await done;
  assert.equal(buttons(row(), "Approve")[0].props.disabled, false, "and is offered again once it has landed");
  assert.equal(approvals.length, 1);
});

test("a waiting run whose day has passed is no row of Need you: nobody is asked for what the verb refuses, and the sweep skips it", async () => {
  // approveRun refuses a playbook's run on a later day than it was made for (contracts runApprovalRefusal). Today's row
  // offered Approve all the same, and the press answered "Not approved" over a 409. Since Today in three zones (2 Nov 2026)
  // such a run is not Today's at all: it waits on nobody, the hourly sweep skips it, and Sent and the Inbox say why.
  clear();
  const approvals = [];
  const stale = zoneDayKey(Date.now() - 3 * 86_400_000, ZONE);
  const rows = broadcasts().rows.map((r) => (r.id === "b-wait" ? { ...r, run_for: stale } : r));
  bridgeHolds({
    values: { broadcasts: { ...broadcasts(), rows } },
    parts: {
      broadcasts: {
        approve: async (id) => {
          approvals.push(id);
          return { ok: true, data: {} };
        },
        cancel: async () => ({ ok: true, data: {} }),
      },
    },
  });
  set({
    today: busy(),
  });
  const queue = byTestId(draw(NeedYouOnToday), "today-queue");
  assert.equal(byTestId(queue, "brief-run-row"), null, "REGRESSION: a row over a run the verb refuses");
  assert.equal(buttons(queue, "Approve").length, 0);
  assert.equal(byTestId(queue, "today-group-ok"), null, "nothing waits for your approval");
  // The words the runs' own pages say it in are contracts' still.
  const w = todayRunWords(rows[0]);
  assert.deepEqual([w.late.meta, w.late.status], ["Campaign · too late to approve", ["Too late to approve"]]);
  assert.deepEqual(approvals, []);
  // The bell's row about one run says where it goes.
  const { verbForRoute } = await import("@chanlytics/contracts");
  assert.deepEqual(
    [verbForRoute("campaigns/sequences/b-wait/runs/b-wait"), verbForRoute("broadcasts")],
    ["Open the run", "Open Campaigns"],
  );
});

test("every person is a line, the first the card, three named under it; what the lines leave out is counted, the run waiting for a word among it, never dropped", () => {
  clear();
  // Four people waiting, all under a week: the first holds the card, the other three are lines.
  const vm = busy();
  const first = vm.queue.rows[0];
  vm.queue.rows = ["one", "two", "three", "four"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
    cta: { ...first.cta },
    also: null,
  }));
  vm.queue.more_people = 0;
  bridgeHolds({ values: { broadcasts: broadcasts() } });
  set({ today: vm });
  const tree = draw(NeedYouOnToday);
  assert.match(textOf(cardOf(tree)), /Person one/, "the first to answer holds the card");
  assert.deepEqual(
    linesIn(tree, "today-queue").map((l) => l.props["data-testid"]),
    ["queue-handoff", "queue-handoff", "queue-handoff"],
    "the people first, three named",
  );
  assert.match(textOf(byTestId(tree, "today-also")), /1 more waiting/, "the run past them, counted with its door");
  // Nothing is dropped in silence: the people past the three named are counted, with the door to the rest.
  vm.queue.rows = ["one", "two", "three", "four", "five", "six", "seven", "eight"].map((w) => ({
    ...first,
    id: `q-${w}`,
    who: `Person ${w}`,
    conversationId: `cv-${w}`,
    cta: { ...first.cta },
    also: null,
  }));
  set({ today: vm });
  const more = draw(NeedYouOnToday);
  assert.match(
    textOf(byTestId(more, "today-also")),
    /5 more waiting/,
    "the four past the card and its three lines, and the run",
  );
});

test("a search waiting on you is a line of the queue like a person: its name, its wait, its question; pressed, it takes the card with its answers", () => {
  clear();
  // Stopped to ask at 1 PM, three hours before NOW.
  const waiting = {
    id: "s-wait",
    name: "Personal trainers in Austin",
    asked: PLAN.asked,
    asked_on: "2026-09-17T15:00:00Z",
    plan: PLAN,
    plan_version: 1,
    round: {
      id: "rd1",
      seq: 1,
      purpose: "find",
      state: "waiting_on_owner",
      ending: null,
      question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterion_key: "chains" },
      target: 20,
      counted: 25,
      qualified: 20,
      review: 0,
      excluded: 5,
      emails_checked: 0,
      with_phone: 18,
      ending_pending: false,
      waiting_since: "2026-09-18T17:00:00Z",
      cost_usd: 1.2,
      ended_at: null,
      undo_op_id: null,
      undo_version: null,
      nearby: [],
    },
  };
  const vm = toTodayVM(metrics(), threads(), escalations(), calls(), NOW, [waiting]);
  bridgeHolds({ values: { broadcasts: { rows: [] } } });
  set({ today: vm });
  const tree = draw(NeedYouOnToday);
  const line = linesIn(tree, "today-queue").find((l) => l.props["data-testid"] === "queue-search");
  assert.ok(line, "the search is a line as every person is");
  assert.equal(nameOf(line), waiting.name);
  assert.ok(textOf(line).includes("3h"), `how long it has waited: ${textOf(line)}`);
  assert.ok(textOf(line).includes(waiting.round.question.sentence), "the question, as the search asked it");
  // Answered where it stands (his call D8, 9 Nov 2026): pressed, it takes the card with its answers.
  find(line, (n) => typeof n.props?.onClick === "function").props.onClick({ button: 0 });
  const card = cardOf(again(() => W.React.createElement(NeedYouOnToday, {})));
  assert.ok(byTestId(card, "queue-search"), "the search holds the card");
  assert.equal(new Set(buttons(card, "Keep going")).size, 1);
  assert.equal(new Set(buttons(card, "Stop here")).size, 1);
});

/* ------------------------------------ the day ------------------------------------ */

test("the day listens for what it draws: the calendar, the playbooks, the runs and Today's own read, and not People", () => {
  // The day drew once with the calendar and never again where it heard nothing else land. Who is coming and when they
  // were last in are the board's own read's now (calendar-person-facts.ts), and who comes back is Today's (Today in three
  // zones, 2 Nov 2026): People's book is no read of the day's. The day, Listen's words and To do read the one derivation
  // (zones/day-vm.ts useDayVm).
  clear();
  set({ today: busy(), calendar: calendar([block("b9", 9, "Slot 9")]), playbooks: noPlaybooks() });
  draw(DayZone);
  for (const key of ["calendar", "playbooks", "broadcasts", "today"]) {
    quiet();
    surfaceLanded(key);
    assert.ok(redrawWanted(), `the day redraws when ${key} lands`);
  }
  // A surface nothing here draws from is none of its business.
  for (const key of ["people", "billing"]) {
    quiet();
    surfaceLanded(key);
    assert.ok(!redrawWanted(), `the day does not redraw for ${key}`);
  }
});

test("each band of Today is drawn again when a surface it draws from lands, and by no other's", () => {
  // The shell drew whole on every surface's read; a band now names the surfaces it draws (useSurface) and moves on those.
  clear();
  set({ today: busy(), calendar: calendar([block("b9", 9, "Slot 9")]), playbooks: noPlaybooks() });
  const bands = [
    ["the alert line", TodayAlertBand, ["today"]],
    ["what the day came to", DayCameTo, ["today"]],
    ["the setup card", TodaySetup, ["setup"]],
    // Need you is Today's own rows, the runs, and To do's steps (People's) and visits to mark (the Calendar's).
    ["Need you", NeedYou, ["today", "broadcasts", "people", "calendar"], { card: null }],
    ["the day", DayZone, ["broadcasts", "calendar", "playbooks", "today"]],
    // And who waits on you, which folds what AI found to one line while anyone does (Today, calm, D20).
    [
      "AI found",
      AskFound,
      ["reports_headline", "people", "today", "ask_morning", "inbox", "broadcasts"],
      { part: "lines", held: false },
    ],
    ["the pins", TodayPins, ["people"]],
  ];
  for (const [name, Band, drawnFrom, props] of bands) {
    draw(Band, props);
    for (const key of drawnFrom) {
      quiet();
      surfaceLanded(key);
      assert.ok(redrawWanted(), `${name} is drawn again when ${key} lands`);
    }
    for (const stranger of ["billing", "inbox", "conversations"].filter((s) => !drawnFrom.includes(s))) {
      quiet();
      surfaceLanded(stranger);
      assert.ok(!redrawWanted(), `${name} is not drawn again for ${stranger}`);
    }
  }
});

test("AI found ranks what the workspace's own counts say first: the first its card, its head, its numbers, its door, Not today and Ask why; the next its lines, each a door; the rest said", () => {
  clear();
  const vm = withNobodyAnswered();
  bridgeHolds({ values: { people: people() } });
  set({ today: vm, headline: headline() });
  const { rows: rules } = todayLeaks(headline(), people(), vm.noReply, { max: Number.POSITIVE_INFINITY });
  assert.ok(rules.length > 3, `the fixture holds more rules than AI found draws: ${rules.map((l) => l.id).join(", ")}`);
  const ranked = [...rules.filter((l) => l.tone === "warn"), ...rules.filter((l) => l.tone !== "warn")];
  const calls = vm.queue.rows.filter((r) => r.kind === "call" || r.kind === "tried").length;
  // Where it holds the card: the first finding, whole.
  const tree = draw(FoundOnToday);
  const card = cardOf(tree);
  assert.equal(card.props["data-holder"], "found");
  assert.equal(textOf(find(card, (n) => classes(n).includes("calm-title"))), ranked[0].head, "its head");
  assert.equal(textOf(find(card, (n) => classes(n).includes("calm-why"))), ranked[0].sub, "its numbers under it");
  assert.equal(textOf(byTestId(card, "today-found-act")).trim(), ranked[0].cta.label, "its one door");
  assert.ok(all(card, (n) => n.props?.trigger?.props?.["data-testid"] === "today-found-rest").length, "Not today");
  // Ask why beside it: the row's own words and its arithmetic go to Ask (the AskFound board: "Ask why stays").
  press(byTestId(card, "today-found-ask"));
  assert.deepEqual(asked.at(-1), { prompt: ranked[0].ask }, "REGRESSION: a rule's row had lost Ask why");
  press(byTestId(card, "today-found-act"));
  assert.equal(went.at(-1), ranked[0].cta.to, "its door goes where the count is");
  // While anyone waits, one line under it (D20): the next finding, its door its own page; the rest said, never dropped.
  const inMore = new Set(all(byTestId(tree, "today-found-more"), (n) => classes(n).includes("calm-line")));
  const lines = linesIn(tree, "today-ask-found").filter((l) => !inMore.has(l));
  assert.deepEqual(lines.map(nameOf), [ranked[1].head]);
  assert.match(find(lines[0], (n) => typeof n.props?.href === "string").props.href, new RegExp(`${ranked[1].cta.to}$`));
  assert.match(
    textOf(byTestId(tree, "today-found-more")),
    new RegExp(`${rules.length + calls - 2} more`),
    "the rest are said, never dropped",
  );
  // Nothing read yet, nothing failed: nothing to rank draws nothing.
  bridgeHolds({ values: { people: undefined } });
  set({ today: undefined, headline: undefined });
  const none = draw(FoundOnToday);
  assert.deepEqual([byTestId(none, "today-ask-found"), cardOf(none)], [null, null], "nothing to rank, no pane");
});

test("REGRESSION: AI found over People's real rows -- a yes to offers with no number to send one to is not 'nobody has said yes', and there is no door to ask for it again", () => {
  clear();
  const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  const row = (id, name, over = {}) =>
    toPersonRowVM(
      {
        id,
        display_name: name,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: at(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: at(3),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "Thanks!",
        last_inbound_at: at(3),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: at(30),
        earliest_row_at: at(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        ...over,
      },
      ZONE,
      NOW,
    );
  const rows = [
    row("p1", "Rosa Diaz", { phone_e164: "+13055550101" }),
    row("p2", "Mia Chen", { phone_e164: "+13055550102" }),
    row("p3", "Ivy Park", { phone_e164: "+13055550103" }),
    // Wrote in by email and said yes to both there: an address, and no number.
    row("p4", "Ana Reyes", {
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: at(20),
    }),
  ];
  // The People surface as the bridge publishes it (surface-data.ts publishPeople), with no calendar.
  const P = {
    rows,
    lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar).map((l) => {
      const members = rows.filter(l.test);
      return {
        id: l.id,
        label: l.label,
        group: l.group,
        count: members.length,
        ids: members.map((r) => r.id),
        action: peopleListAction(l.id, members),
      };
    }),
    aggregates: { total: rows.length },
  };
  // A week that booked and answered, so the reach row is the rule that stands.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  bridgeHolds({ values: { people: P } });
  set({ today: busy(), headline: R });
  const want = todayLeaks(R, P).rows.find((l) => l.id === "unreachable");
  assert.ok(want, "nobody can be sent an offer: the rule stands");
  const reach = foundRowOf(draw(FoundOnToday), want.head);
  assert.ok(reach, "its row in AI found");
  assert.ok(
    !/has said yes to offers/.test(textOf(reach)),
    `REGRESSION: Ana said yes to offers, and the row said nobody had: ${textOf(reach)}`,
  );
  assert.equal(want.cta.label, "See them", "REGRESSION: a door asking Ana for the yes she gave");
  press(foundDoorOf(reach));
  assert.equal(went.at(-1), "clients/seg:opted_in", "the number is People's list, and the door opens it");
});

test("AI found, in every workspace: the consultations with nothing after them are a rule's row, the count's own words, its door the Pipeline", () => {
  clear();
  const DAY = 86_400_000;
  // The page asks contracts with the clock it runs on, so the consultations ended within the last week of now.
  const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
  const consulted = (id, name, days) =>
    toPersonRowVM(
      {
        id,
        display_name: name,
        wa_profile_name: null,
        phone_e164: null,
        email: null,
        consent: "opted_in",
        consent_source: "in_person",
        consent_updated_at: ago(20),
        dnc: false,
        marketing_consent: null,
        marketing_consent_source: null,
        marketing_consent_updated_at: null,
        channels: ["whatsapp"],
        conversation_count: 1,
        escalation_count: 0,
        needs_human: false,
        open_escalation_reason: null,
        open_escalation_since: null,
        latest_conversation_id: null,
        latest_state: "open",
        latest_paused_until: null,
        latest_assignee_user_id: null,
        latest_snooze_until: null,
        latest_wa_inbound_at: null,
        last_message_at: ago(days + 1),
        last_message_direction: "inbound",
        last_message_sender: "customer",
        last_inbound_text: "See you then",
        last_inbound_at: ago(days + 1),
        last_call_at: null,
        call_count: 0,
        call_seconds: 0,
        first_contact_at: ago(30),
        earliest_row_at: ago(30),
        has_backfill: false,
        has_chat: true,
        queued_reply_at: null,
        visits: {
          timezone: ZONE,
          source: "Google Calendar",
          state: "ok",
          next: null,
          last: {
            id: `v-${id}`,
            start: new Date(Date.parse(ago(days)) - 3_600_000).toISOString(),
            end: ago(days),
            title: "Consultation",
            all_day: false,
            via: "phone",
            consultation: true,
          },
        },
      },
      ZONE,
      new Date(),
    );
  const rows = [consulted("p-b", "Bea Ortiz", 2), consulted("p-a", "Abel Cruz", 4), consulted("p-c", "Cora Diaz", 1)];
  const P = { rows, lists: [], aggregates: { total: rows.length } };
  // A week that booked and answered, so the consultations are the one rule.
  const R = headline({ in: 23, ai: 23, you: 0, none: 0, booking: { calendar: "ok", days: 7, asked: 18, booked: 17 } });
  bridgeHolds({ values: { people: P } });
  set({ today: busy(), headline: R });
  const want = todayLeaks(R, P).rows.find((l) => l.id === "consults-waiting");
  assert.ok(want, "three consultations this week, nothing after any");
  assert.equal(want.text, "3 consultations in the last week with nothing booked or proposed since.");
  const row = foundRowOf(draw(FoundOnToday), want.head);
  assert.ok(row, "the row is drawn");
  assert.equal(want.tag, "Next step");
  press(foundDoorOf(row));
  assert.equal(went.at(-1), "clients/pipeline", "the door is the Pipeline, whose number the row re-prints");
});

/* ------------------------------------ nothing since you looked ------------------------------------ */

test("the head says nothing under its sentence: what happened since the member looked is the bell's, and the figures' (decision 0137)", () => {
  clear();
  // The bell holds news since the member looked, and the day counted what AI answered: the head says neither a second time.
  const rows = [
    { ...bellRow("n:1", "review", "1 new rating on Google", "ok"), at: Date.now() - 3_600_000, message: "Five stars" },
  ];
  const api = {
    feed: () => rows,
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll() {},
    unread: () => unreadCount(rows),
    older: () => 0,
  };
  bridgeHolds({ parts: { bell: api } });
  set({ today: busy() });
  const said = headSaid(true);
  assert.ok(said?.sentence, "the head's one sentence stands");
  assert.equal("after" in said, false, "REGRESSION: a line under the sentence, the bell's news said again");
  assert.equal(byTestId(said.sentence, "today-since"), null);
});

/* ------------------------------------ the mockup ------------------------------------ */

// The mockup's sample of Today's borrowed surfaces (`window.__TODAY_SAMPLE`) is deleted (decision 0015, step 4): the
// standalone mockup no longer draws Today, so a demo session's sample is no source of anything. What is left of this
// test is its second half, which still holds as it was, and the first half turned round.
test("the mockup no longer draws Today: a demo session's sample is not read, the borrowed surfaces come from the bridge's names alone", () => {
  clear();
  const bell = {
    feed: () => [bellRow("n:1", "review", "1 new rating on Google", "ok")],
    onChange: () => () => {},
    read() {},
    dismiss() {},
    seenAll() {},
    unread: () => 1,
    older: () => 0,
  };
  set({
    today: busy(),
    __TODAY_SAMPLE: {
      __PEOPLE: people(),
      __BROADCASTS: broadcasts(),
      __CALENDAR: calendar([block("b9", 9, "Gloss")]),
      __PLAYBOOKS: noPlaybooks(),
      __clock: provided("clock"),
      __notifs: bell,
    },
  });
  const drawn = draw(TodayZones);
  assert.ok(byTestId(drawn, "today-queue"), "today-queue: its own view model still draws");
  for (const id of ["today-day", "today-period", "brief-run-row", "today-day-went", "today-pin", "today-found-rule"])
    assert.equal(byTestId(drawn, id), null, `${id}: not drawn from the sample, which nothing reads any more`);
  for (const name of ["__PEOPLE", "__BROADCASTS", "__CALENDAR", "__PLAYBOOKS", "__notifs"])
    assert.equal(
      W[name],
      undefined,
      `${name}: the sample is copied onto nothing; the pages read the seam (decision 0151)`,
    );
  // A workspace never reads the sample: the same globals outside a demo session draw nothing borrowed.
  const real = draw(TodayZones);
  for (const id of ["today-day", "today-period", "brief-run-row", "today-pin", "today-found-rule"])
    assert.equal(byTestId(real, id), null, `${id}: never from the sample outside a demo`);
  assert.ok(byTestId(real, "today-queue"), "its own view model still draws");
});

/* ------------------------------------ the composition ------------------------------------ */

test("the page is its bands and nothing seeded", () => {
  clear();
  bridgeHolds({
    values: { people: people(), broadcasts: broadcasts() },
    parts: {
      bell: {
        feed: () => [],
        onChange: () => () => {},
        read() {},
        dismiss() {},
        seenAll() {},
        unread: () => 0,
        older: () => 0,
      },
    },
  });
  set({
    today: busy(),
    headline: headline(),
    calendar: calendar([block("b9", 9, "Gloss")]),
    playbooks: noPlaybooks(),
  });
  const tree = draw(TodayZones);
  const order = ["today-card", "today-queue", "today-day", "today-came-to", "today-ask-found"].map((id) =>
    byTestId(tree, id),
  );
  assert.ok(order.every(Boolean), "every part: the card, who else waits, the day, what it came to, what AI found");
  const names = all(tree, (n) => typeof n.type === "function").map((n) => n.type.name);
  for (const seeded of [
    "NowPlayingRail",
    "TrustReview",
    "SegmentPulse",
    "AgentFleet",
    "AmbientDock",
    "HeroBriefSeed",
    "AgentCommandSeed",
    "TodayPulse",
    "TodayJourney",
    "PulseArc",
    "BriefBeats",
    "TodayBriefPane",
    "TodayGoing",
  ])
    assert.ok(!names.includes(seeded), `${seeded} is gone from Today`);
  const name = (c) =>
    typeof c.type === "function" ? c.type.name : (c.props?.["data-testid"] ?? String(c.props?.className));
  const partsOf = (col) =>
    [col.props.children]
      .flat(Infinity)
      .filter(Boolean)
      .flatMap((c) => (c.type === W.React.Fragment ? [c.props.children].flat(Infinity).filter(Boolean) : [c]))
      .map(name);
  // Setting up (decision 0073) is a line at the foot of the day's column, so the two end near each other (L8). What goes on
  // its own today is the day's (0064); AI found is under the day: nothing it suggests outranks a person waiting (0070).
  const [work, rest] = all(tree, (n) => classes(n).includes("calm-col"));
  const day = ["DayZone", "DayCameTo", "AskFound", "LetAiDoMore", "TodayContentLine", "TodayPins"];
  assert.deepEqual([partsOf(work), partsOf(rest)], [["NeedYou"], [...day, "TodaySetup", "today-setting-up"]]);
  assert.equal(
    all(tree, (n) => n.props?.["data-testid"] === "today-recap").length,
    0,
    "what is not a number is said where it is acted on: under the head, in the day, never a list of its own",
  );
});
