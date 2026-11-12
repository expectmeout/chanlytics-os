/**
 * Today on a phone, EXECUTED on the stub React (decision 0076; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md;
 * Today in three zones, 2 Nov 2026): Need you under the head with no head and no Ask's line of its own, its groups each a
 * pane under its name, who waits on the owner first and To do a group of its own after them, one card and the rest short,
 * a short row opening the walk rather than opening in place, the coral passing from Need you to To do when nobody waits,
 * and the day's four figures in Today so far by their short names. On a desk the same list keeps its head and door, and
 * opens a row in place. After his look on a phone (29 Oct 2026): each thing said once above the fold (how long someone
 * waited beside their name, a run's wait in its sentence, the brief's first line with Read), a foot where the list left
 * someone out, and under the head only the warnings that stop customers being answered.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NOTE_WORDS, clockTime, toTodayVM, zoneDayKey } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { unmarkedTimes } from "../../shell/views/_unmarked-times.mjs";
import { NOW, ZONE, escalation, metrics, msg, peopleWithSteps, thread, waiting } from "../record/_world.mjs";

const went = [];
installStubReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate: (to) => went.push(to),
  usePPToast: () => [null, () => {}],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const W = globalThis.window;
// The phone's width, as tokens.css --bp-phone asks it (surfaces/today/phone.ts), and the desk's where a test says so.
let phone = true;
W.matchMedia = (q) => ({
  media: q,
  get matches() {
    return q === "(max-width: 720px)" && phone;
  },
  addEventListener() {},
  removeEventListener() {},
});
Object.assign(globalThis, {
  __WORKSPACES: [{ id: "t1", slug: "studio", name: "Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "t1",
});
W.fetch = async () =>
  new Response(JSON.stringify({ ok: false, error: { code: "unavailable", message: "not read here" } }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { TodayHeadFigures } = await import("../../../apps/dashboard/src/surfaces/today/zones/figures.tsx");
const { PhoneSoFar } = await import("../../../apps/dashboard/src/surfaces/today/zones/foot.tsx");
const { TodayAlertBand } = await import("../../../apps/dashboard/src/surfaces/today/zones/alert.tsx");
const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { useNeedYouLine } = await import("../../../apps/dashboard/src/surfaces/today/need-you-model.ts");

/** Sofia asked for a person three hours ago, an hour before Ana: two handoffs, Sofia's the older. */
const sofia = () =>
  thread("cv-s", "Sofia Reyes", [msg("s1", "What would six of us cost for a wedding?", "2026-09-18T17:00:00Z")], {
    state: "needs_human",
  });
const sofiaHeld = () => ({ ...escalation(), id: "e-s", conversation_id: "cv-s", created_at: "2026-09-18T17:01:00Z" });
const twoWaiting = () => toTodayVM(metrics(), [sofia(), waiting()], [sofiaHeld(), escalation()], [], NOW);
/** And Marco, who wrote at two: a third person waiting. */
const marco = () => thread("cv-m", "Marco Bellini", [msg("m1", "Can we move to Thursday?", "2026-09-18T18:00:00Z")]);
const marcoHeld = () => ({ ...escalation(), id: "e-m", conversation_id: "cv-m", created_at: "2026-09-18T18:01:00Z" });
const threeWaiting = () =>
  toTodayVM(metrics(), [sofia(), waiting(), marco()], [sofiaHeld(), escalation(), marcoHeld()], [], NOW);
const nobodyWaiting = () => toTodayVM(metrics(), [], [], [], NOW);

const set = (vm) => {
  setSurfaceValue("today", vm);
  W.__PEOPLE = { rows: peopleWithSteps([["b", "Ben", -1]]), fetchedAt: NOW.getTime() };
};
after(() => {
  setSurfaceValue("today", undefined);
  delete W.__PEOPLE;
  delete W.__BROADCASTS;
  delete W.__notifs;
});
const draw = (Comp) => {
  fresh();
  return W.React.createElement(Comp, {});
};
const rowsOf = (tree, kind) => all(tree, (n) => n.props?.["data-testid"] === `queue-${kind}`);
const isPrimary = (n) => classes(n).some((c) => c === "btn-primary" || c === "primary");
const pressesOf = (tree) => all(tree, (n) => n.type === "button");

test("on a phone Need you is the people under the page's head, and To do is a group of its own after them", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  assert.equal(byTestId(queue, "today-queue-count"), null, "the count is the page's head, not the list's");
  assert.equal(
    textOf(byTestId(queue, "today-queue-door")),
    "Inbox",
    "its first group's head holds the way there, as the day's the Calendar's",
  );
  assert.equal(all(queue, (n) => n.props?.["data-testid"] === "today-queue-door").length, 1, "once");
  assert.equal(byTestId(queue, "today-queue-ask"), null, "each card says what Ask prepared: no line over them");
  assert.equal(byTestId(queue, "today-queue").props["data-phone"], true);
  const todo = byTestId(queue, "today-group-todo");
  assert.ok(todo, "To do is a group of Need you");
  const groups = all(queue, (n) => classes(n).includes("ny-group")).map((g) => g.props["data-testid"]);
  assert.equal(groups.at(-1), "today-group-todo", `after the people who wait: ${groups.join(", ")}`);
  const people = rowsOf(queue, "handoff");
  assert.equal(people.length, 2, "both people waiting");
  assert.ok(
    people.every((p) => !all(todo, (n) => n === p).length),
    "neither in To do",
  );
  assert.equal(rowsOf(todo, "step").length, 1, "Ben's step is To do's");
  assert.ok(textOf(todo).includes("Call Ben"), textOf(todo));
});

test("on a phone the day's four figures stand in Today so far, each by its short name", () => {
  phone = true;
  set(twoWaiting());
  const card = draw(PhoneSoFar);
  assert.ok(textOf(card).includes("Today so far"), textOf(card));
  const names = all(card, (n) => classes(n).includes("tc-fig-w")).map(textOf);
  // A word each, so the row of four is one line: "new people" broke in its 65px (the phone pass, 3 Nov 2026).
  assert.deepEqual(names, ["booked", "answered", "calls", "new"]);
  phone = false;
  // A desk's four stand in the frame's head beside the greeting (figures.tsx TodayHeadFigures), by the same short names
  // (the 10/10 read, 2 Nov 2026: "answered by the receptionist" made its cell three times another's), the whole name its
  // title; Today so far is a phone's alone (zones/page.tsx).
  const desk = draw(TodayHeadFigures);
  assert.deepEqual(
    all(desk, (n) => classes(n).includes("tc-fig-w")).map(textOf),
    ["booked", "answered", "calls", "new"],
    "a desk says the short names too",
  );
  assert.ok(
    all(desk, (n) => classes(n).includes("tc-fig"))
      .map((n) => n.props.title)
      .includes("answered by the receptionist"),
    "and the whole name is the figure's title",
  );
  phone = true;
});

test("every time Today's blocks say, says so: a copy some minutes old draws none of them (decision 0101)", () => {
  phone = true;
  set(threeWaiting());
  const queue = draw(NeedYou);
  assert.match(textOf(queue), /\d+h/, "the fixture says a wait");
  assert.deepEqual(unmarkedTimes(queue), []);
  assert.deepEqual(unmarkedTimes(draw(PhoneSoFar)), []);
});

test("Need you holds each wait to the business's own target, and the open card says why it was handed over in words", () => {
  phone = true;
  set(twoWaiting());
  const waits = (tree) =>
    all(tree, (n) => classes(n).includes("cl-attn-wait")).map((n) => [textOf(n), !!n.props["data-long"]]);
  assert.deepEqual(waits(draw(NeedYou)), [
    ["3h", false],
    ["2h", false],
  ]);
  // The owner says an hour (Settings › Autonomy, "Answer people within"): both have waited past it.
  setSurfaceValue("settings", {
    policies: { role: "owner", rows: [{ class: "reply", limits: { answer_within_hours: 1 } }] },
  });
  try {
    assert.deepEqual(
      waits(draw(NeedYou)),
      [
        ["3h", true],
        ["2h", true],
      ],
      "REGRESSION: the amber meant past a day, whatever the business promised",
    );
  } finally {
    setSurfaceValue("settings", undefined);
  }
  // On a desk, beside the name of the row it has open; on a phone Up next is its line, and the sheet says the rest.
  phone = false;
  const [card] = rowsOf(draw(NeedYou), "handoff");
  phone = true;
  assert.equal(textOf(find(card, (n) => classes(n).includes("cl-attn-meta"))), "asked for a person");
  assert.equal(
    find(card, (n) => classes(n).includes("set-mark")),
    null,
    "REGRESSION: an unexplained mark beside the name",
  );
});

test("on a phone one card holds Ask's work, the next is a row with its press, which opens the walk on it", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  const [first, second] = rowsOf(queue, "handoff");
  assert.ok(textOf(first).includes("Sofia Reyes"), "the longest wait is the card");
  assert.ok(byTestId(first, "queue-handoff-work"), "worked in place");
  assert.equal(byTestId(second, "queue-handoff-work"), null, "the second is short");
  const reply = find(second, (n) => n.type === "button" && textOf(n) === "Reply");
  assert.ok(reply, "its one press");
  press(reply);
  const after = again(() => W.React.createElement(NeedYou, {}));
  const walk = find(after, (n) => typeof n.type === "function" && n.type.name === "WalkSheet");
  assert.ok(walk && walk.props.at, "the walk is open");
  const ana = walk.props.rows.find((r) => r.id === walk.props.at);
  assert.equal(ana && ana.who, "Ana Reyes", "on the row pressed");
  assert.equal(byTestId(rowsOf(after, "handoff")[1], "queue-handoff-work"), null, "never opened in place on a phone");
  assert.deepEqual(went, [], "nor sent to her thread");
});

test("the coral is Need you's first act while someone waits, and To do's when nobody does", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  assert.equal(pressesOf(queue).filter(isPrimary).length, 1, "one coral in Need you");
  const todo = byTestId(queue, "today-group-todo");
  assert.equal(pressesOf(todo).filter(isPrimary).length, 0, "To do is quiet under the people");
  set(nobodyWaiting());
  const calm = draw(NeedYou);
  assert.equal(pressesOf(calm).filter(isPrimary).length, 1, "one coral still");
  assert.equal(
    pressesOf(byTestId(calm, "today-group-todo")).filter(isPrimary).length,
    1,
    "with nobody waiting, To do's Done is the coral",
  );
});

test("on a desk the queue has its head and door, the steps in To do after the people, Up next worked in place and the next opened in its stead", () => {
  phone = false;
  set(twoWaiting());
  const queue = draw(NeedYou);
  assert.ok(byTestId(queue, "today-queue-door"), "its head, with its door");
  assert.equal(byTestId(queue, "today-queue-count"), null, "how many is the page head's, said once");
  const todo = byTestId(queue, "today-group-todo");
  assert.equal(rowsOf(todo, "step").length, 1, "Ben's step is To do's (decision 0007), in its group");
  assert.equal(rowsOf(queue, "step").length, 1, "and nowhere else");
  const [first, second] = rowsOf(queue, "handoff");
  assert.ok(byTestId(first, "queue-handoff-work"), "Up next is worked in place");
  assert.equal(byTestId(second, "queue-handoff-work"), null, "the next is short");
  press(find(second, (n) => n.type === "button" && textOf(n).includes("Reply")));
  const opened = rowsOf(
    again(() => W.React.createElement(NeedYou, {})),
    "handoff",
  );
  assert.ok(byTestId(opened[1], "queue-handoff-work"), "opened in place, on a desk");
  assert.equal(byTestId(opened[0], "queue-handoff-work"), null, "one open at a time");
  assert.deepEqual(went, [], "and nobody sent to a thread");
  assert.equal(byTestId(queue, "today-queue").props["data-phone"], undefined);
  phone = true;
});

/** `n` people waiting on a person, an hour apart, the first the longest: more than the card holds past six. */
const manyWaiting = (n) => {
  const at = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
  const threads = Array.from({ length: n }, (_, i) =>
    thread(`cv-${i}`, `Person ${i}`, [msg(`m${i}`, "Can someone call me?", at(n - i + 1))], { state: "needs_human" }),
  );
  const held = threads.map((t, i) => ({ ...escalation(), id: `e-${i}`, conversation_id: t.id, created_at: at(n - i) }));
  return toTodayVM(metrics(), threads, held, [], NOW);
};
const footOf = (tree) => find(tree, (n) => classes(n).includes("tq-foot"));

// A desk said it twice too: "Email, waited 5d" over "Escalated · wrote by email · since Mon 5:02 PM" (the refined canvas,
// 31 Oct 2026), so the wait is said once there as well, in the meta line beside the name.
test("how long someone waited is said once, beside their name, on a phone and on a desk", () => {
  phone = true;
  set(twoWaiting());
  const once = (row) => textOf(row).split("3h").length === 2;
  const [sofiaRow] = rowsOf(draw(NeedYou), "handoff");
  assert.ok(once(sofiaRow), textOf(sofiaRow));
  assert.ok(!textOf(sofiaRow).includes("since "), `no since on a phone: ${textOf(sofiaRow)}`);
  phone = false;
  const [deskRow] = rowsOf(draw(NeedYou), "handoff");
  assert.ok(once(deskRow), `a desk says the wait, once: ${textOf(deskRow)}`);
  assert.ok(!textOf(deskRow).includes("since "), `and no since: ${textOf(deskRow)}`);
  phone = true;
});

test("how many were done today follows how many need you, where no list head says it; and the page's last line waits for nobody to", async () => {
  const { useZonesStanding } = await import("../../../apps/dashboard/src/surfaces/today/zones/head.tsx");
  const { TodayEnd } = await import("../../../apps/dashboard/src/surfaces/today/zones/foot.tsx");
  const { standingSaid } = await import("../../../apps/dashboard/src/surfaces/kit/head/standing.ts");
  const HeadProbe = () => {
    useZonesStanding();
    return null;
  };
  phone = true;
  set({ ...twoWaiting(), done_today: 3 });
  draw(HeadProbe);
  assert.match(textOf(standingSaid()?.sentence ?? null), /need you\. 3 done today\.$/);
  assert.equal(
    byTestId(draw(TodayEnd), "today-end"),
    null,
    "REGRESSION: it said that was everything while someone waited",
  );
  set(nobodyWaiting());
  assert.ok(byTestId(draw(TodayEnd), "today-end"), "nobody waiting: the page says it is done");
});

test("on a phone a group's foot says how many more wait and goes to them, and nothing stands under the list", () => {
  phone = true;
  set(twoWaiting());
  assert.equal(
    footOf(draw(NeedYou)),
    null,
    "REGRESSION: a pill under a divider, where every other card's door is in its head",
  );
  // Up next and five waiting on you (contracts NEED_YOU_CAPS); past them the group's own foot is the way to the rest.
  set(manyWaiting(8));
  const queue = draw(NeedYou);
  assert.equal(rowsOf(queue, "handoff").length, 6, "Up next and the five waiting");
  assert.equal(footOf(queue), null);
  const door = byTestId(byTestId(queue, "today-group-waiting"), "today-group-waiting-more");
  assert.equal(textOf(door).trim(), "2 more waiting", "with the door to them");
  assert.match(door.props.href, /\/inbox$/);
  // The one Inbox door is the list's head, on a phone as on a desk.
  assert.ok(byTestId(queue, "today-queue-door"), "one door on the head");
});

test("on a phone a run waiting for your OK says so once, in its sentence, and opens with Review", () => {
  const reach = {
    id: "b-reach",
    name: "Movers nearby",
    state: "pending_approval",
    playbook_id: null,
    audience: { kind: "reach_out", label: "Movers nearby" },
    recipient_count: 7,
    scheduled_for: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    started_at: null,
    when: "today 6:00 PM",
    counts: { sent: 0, replied: 0 },
  };
  W.__BROADCASTS = { rows: [reach] };
  try {
    phone = true;
    set(twoWaiting());
    const row = byTestId(draw(NeedYou), "brief-run-row");
    assert.ok(row, "the run is a row");
    assert.ok(textOf(row).includes("Waits for your OK"), textOf(row));
    assert.ok(!textOf(row).includes("Waiting for your approval"), `said once: ${textOf(row)}`);
    assert.ok(
      find(row, (n) => n.type === "button" && textOf(n) === "Review"),
      "Review, what is done there",
    );
    phone = false;
    const desk = byTestId(draw(NeedYou), "brief-run-row");
    assert.ok(textOf(desk).includes("Waiting for your approval"), "a desk keeps its state line");
    assert.ok(
      find(desk, (n) => n.type === "button" && textOf(n) === "Open"),
      "and its Open",
    );
  } finally {
    delete W.__BROADCASTS;
    phone = true;
  }
});

test("under a phone's head only what stops customers being answered: a run waiting and a job that failed stay in the bell", () => {
  const note = (id, kind, title) => ({
    id,
    key: id,
    kind,
    title,
    message: "",
    tone: "warn",
    icon: "alert",
    unread: true,
    about: null,
    time: "1h",
    actions: [{ label: "Open", to: "inbox", primary: true }],
  });
  W.__notifs = {
    feed: () => [
      note("n1", "playbook", "Movers nearby waits for your OK"),
      note("n2", "job_failed", "A lead_collect job did not finish"),
      note("n3", "number", "Your WhatsApp number's rating dropped"),
    ],
    onChange: () => () => {},
    older: () => 0,
    read() {},
    dismiss() {},
    seenAll() {},
  };
  try {
    phone = true;
    set(twoWaiting());
    const warned = draw(TodayAlertBand);
    const rows = all(warned, (n) => n.props?.["data-testid"] === "today-warning").map(textOf);
    assert.equal(rows.length, 1, rows.join(" | "));
    assert.ok(rows[0].includes("WhatsApp number"), rows[0]);
    // Two at most, and only what is still New: one the bell was closed over has been seen (its close is the member
    // looking), and the bell keeps it.
    const feed = W.__notifs.feed();
    W.__notifs.feed = () => [
      ...feed,
      note("n4", "sweep", "Replies are not being read"),
      note("n5", "billing", "Your card was declined"),
      { ...note("n6", "number", "Your WhatsApp number is limited"), unread: false },
    ];
    const capped = all(draw(TodayAlertBand), (n) => n.props?.["data-testid"] === "today-warning").map(textOf);
    assert.equal(capped.length, 2, capped.join(" | "));
    assert.ok(!capped.some((r) => r.includes("is limited")), "a warning already seen stays in the bell");
  } finally {
    delete W.__notifs;
  }
});

test("a call back that has waited past a week says in its sheet that it may be let go; a newer one is simply owed", async () => {
  const { CallWork } = await import("../../../apps/dashboard/src/surfaces/today/need-you/call-work.tsx");
  const { NEED_YOU_WORDS, NEED_YOU_OLD_MS, DAY_MS } = await import("@chanlytics/contracts");
  const callBack = (waitedMs) => ({
    id: `q-cb-${waitedMs}`,
    kind: "callback",
    who: "Dana Park",
    phone: "+15555550134",
    conversationId: null,
    writes: null,
    waitedMs,
    cta: { label: "Call", to: "inbox" },
  });
  const work = (waitedMs) => {
    fresh();
    return again(() =>
      W.React.createElement(CallWork, {
        row: callBack(waitedMs),
        main: "primary",
        may: true,
        tz: ZONE,
        flash: () => {},
        keep: () => {},
        whole: true,
      }),
    );
  };
  assert.ok(textOf(work(NEED_YOU_OLD_MS + DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "said under what they wanted");
  assert.ok(!textOf(work(DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "a call back under a week is simply owed");
});

test("on a phone Need you is one pane, its groups small labels over its rows, as a desk's are", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  const groups = all(queue, (n) => classes(n).includes("ny-group"));
  assert.ok(groups.length > 0, "the groups");
  assert.equal(
    find(queue, (n) => classes(n).includes("ny-pane")),
    null,
    "REGRESSION: five cards on a phone",
  );
  assert.ok(byTestId(queue, "today-queue-door"), "the list's own head, with its door");
  assert.ok(
    groups.some((g) => g.props["data-testid"] === "today-group-todo"),
    "To do among them",
  );
});

test("Need you has no cuts over it, on a desk or a phone: its groups are its order (the canvas of 2 Nov 2026)", () => {
  // Two verbs ask (the replies, and a run's approval) over four rows: the old list drew its chips to cut them here.
  const run = (id) => ({
    id,
    name: `Win-back ${id}`,
    state: "pending_approval",
    playbook_id: null,
    audience: { kind: "segment", label: "Quiet" },
    recipient_count: 3,
    scheduled_for: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    started_at: null,
    when: "today 6:00 PM",
    counts: { sent: 0, replied: 0 },
  });
  const stripOf = () => find(draw(NeedYou), (n) => typeof n.type === "function" && n.type.name === "SubTabs");
  try {
    for (const width of [true, false]) {
      phone = width;
      W.__BROADCASTS = { rows: [run("b-1")] };
      set(threeWaiting());
      assert.equal(stripOf(), null, "the groups say what each row asks: no chips to cut them");
      assert.ok(byTestId(draw(NeedYou), "today-group-ok"), "the run waits for your OK in its group");
    }
  } finally {
    delete W.__BROADCASTS;
    phone = true;
  }
});

test("on a phone's Up next two lines of Ask's reply stand with no box round them, and a press opens the walk on it", () => {
  phone = true;
  // Sofia wrote an hour ago on WhatsApp: the window is open, so Ask's reply can be sent from the card.
  // A thread of its own: the drafts the tab holds outlive a test, and an earlier one read Sofia's and was refused.
  const open = thread(
    "cv-w",
    "Sofia Reyes",
    [msg("w1", "What would six of us cost for a wedding?", "2026-09-18T19:00:00Z")],
    { state: "needs_human", last_wa_inbound_at: "2026-09-18T19:00:00Z" },
  );
  const held = { ...sofiaHeld(), id: "e-w", conversation_id: "cv-w" };
  const vm = toTodayVM(metrics(), [open, waiting()], [held, escalation()], [], NOW);
  const first = vm.queue.rows[0];
  setSurfaceValue("reply_drafts", {
    complete: true,
    fetchedAt: NOW.getTime(),
    drafts: [
      {
        conversation_id: first.conversationId,
        kind: "reply",
        for_message_id: first.writes.for_message_id,
        words: { text: "Six of us is $540 for the wedding package.", subject: "", asks: [], brief: null },
        made_at: NOW.toISOString(),
      },
    ],
  });
  try {
    set(vm);
    const queue = draw(NeedYou);
    const card = byTestId(rowsOf(queue, "handoff")[0], "queue-handoff-work");
    assert.ok(textOf(card).includes("Six of us is $540"), textOf(card));
    const peek = find(card, (n) => classes(n).includes("ny-glimpse"));
    assert.ok(peek, "two lines of the words, no box in a box");
    assert.equal(
      find(card, (n) => n.type === "button" && textOf(n) === "Edit"),
      null,
      "no Edit beside Send: the field in the sheet is the edit",
    );
    assert.ok(
      find(card, (n) => n.type === "button" && textOf(n) === "Send"),
      "Send",
    );
    peek.props.onClick();
    const walk = find(
      again(() => W.React.createElement(NeedYou, {})),
      (n) => typeof n.type === "function" && n.type.name === "WalkSheet",
    );
    assert.equal(walk.props.at, first.id, "the walk, open on this row");
  } finally {
    setSurfaceValue("reply_drafts", undefined);
  }
});

test("the head says Ask has a reply ready only where its words can go: never over a card whose one press is a template", () => {
  phone = true;
  /** One handoff on WhatsApp, its window open or shut, with Ask's reply kept for it; what the head is told of it. */
  const headOver = (lastIn) => {
    const t = thread("cv-t", "Tara Quinn", [msg("t1", "Is Saturday free?", lastIn)], {
      state: "needs_human",
      last_wa_inbound_at: lastIn,
    });
    const vm = toTodayVM(metrics(), [t], [{ ...escalation(), id: "e-t", conversation_id: "cv-t" }], [], NOW);
    const row = vm.queue.rows[0];
    setSurfaceValue("reply_drafts", {
      complete: true,
      fetchedAt: NOW.getTime(),
      drafts: [
        {
          conversation_id: row.conversationId,
          kind: "reply",
          for_message_id: row.writes.for_message_id,
          words: { text: "Saturday at ten is free.", subject: "", asks: [], brief: null },
          made_at: NOW.toISOString(),
        },
      ],
    });
    set(vm);
    draw(NeedYou);
    return again(() => useNeedYouLine(surfaceValue("today") ?? null));
  };
  try {
    assert.match(String(headOver("2026-09-18T19:00:00Z")), /Ask has a reply ready/, "an open window: the words can go");
    assert.doesNotMatch(
      String(headOver("2026-09-16T19:00:00Z")),
      /Ask has/,
      "REGRESSION: the head said a reply was drafted over a card whose one press was Choose a template",
    );
  } finally {
    setSurfaceValue("reply_drafts", undefined);
  }
});

test("on a phone the page is one column in the canvas's order: Ask found leads where Need you draws no pane, setting up goes under the work while anyone waits, and the page's end is last", async () => {
  phone = true;
  const { TodayZones } = await import("../../../apps/dashboard/src/surfaces/today/zones/page.tsx");
  const order = () => {
    fresh();
    const page = again(() => TodayZones());
    const root = page.rendered ?? page;
    assert.equal(root.props["data-testid"], "today-phone");
    return root.props.children.filter(Boolean).map((c) => c.type?.name ?? c.props?.["data-testid"]);
  };
  // Whether Need you draws its panes is the page's arrangement's to know before anything draws (today/arrangement.ts).
  set(twoWaiting());
  const busy = order();
  assert.deepEqual(busy, [
    "TodayAlertBand",
    "NeedYou",
    "ColdEmailNote",
    "TodayContentNote",
    "DayZone",
    "AskFound",
    "PhoneSoFar",
    "PhonePins",
    "today-setting-up",
    "TodayEnd",
  ]);
  // Nobody waits, but Ben's step is due: To do is Need you's pane, so Ask found stays under the day.
  set(nobodyWaiting());
  assert.deepEqual(order(), [
    "TodayAlertBand",
    "today-setting-up",
    "NeedYou",
    "ColdEmailNote",
    "TodayContentNote",
    "DayZone",
    "AskFound",
    "PhoneSoFar",
    "PhonePins",
    "TodayEnd",
  ]);
  // And with no step due either, Need you draws no pane and Ask found leads.
  delete W.__PEOPLE;
  assert.deepEqual(order(), [
    "TodayAlertBand",
    "today-setting-up",
    "NeedYou",
    "ColdEmailNote",
    "TodayContentNote",
    "AskFound",
    "DayZone",
    "PhoneSoFar",
    "PhonePins",
    "TodayEnd",
  ]);
});

test("on a phone the walk steps into To do's rows after the people (the Parts board: 'To do's rows join the walk'), Done there is To do's, and its end offers only the to-dos it does not walk", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  press(find(rowsOf(queue, "handoff")[1], (n) => n.type === "button" && textOf(n) === "Reply"));
  const walk = find(
    again(() => W.React.createElement(NeedYou, {})),
    (n) => typeof n.type === "function" && n.type.name === "WalkSheet",
  );
  assert.deepEqual(
    walk.props.rows.map((r) => [r.kind, r.who]),
    [
      ["handoff", "Sofia Reyes"],
      ["handoff", "Ana Reyes"],
      ["step", "Ben"],
    ],
    "REGRESSION: the walk ended at the people and sent the member out of the sheet for Ben's step",
  );
  assert.equal(typeof walk.props.stepDone, "function", "a step's Done in the sheet is To do's own");
  assert.equal(walk.props.todos, 0, "nothing of To do's is left outside the walk");
});

test("Done on a step in the walk goes on to the next one still open: the step leaves the rows at once, and the sheet never says the walk's end while rows follow", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(NeedYou);
  press(find(rowsOf(queue, "handoff")[1], (n) => n.type === "button" && textOf(n) === "Reply"));
  const walk = find(
    again(() => W.React.createElement(NeedYou, {})),
    (n) => typeof n.type === "function" && n.type.name === "WalkSheet",
  );
  const [first, , ben] = walk.props.rows;
  const at = [];
  const done = [];
  const sheet = again(() =>
    W.React.createElement(walk.type, {
      ...walk.props,
      at: ben.id,
      onAt: (to) => at.push(to),
      stepDone: (r) => done.push(r.id),
    }),
  );
  press(find(sheet, (n) => n.type === "button" && n.props?.["aria-label"] === NOTE_WORDS.markDone(ben.sentence)));
  assert.deepEqual(
    at,
    [first.id],
    "REGRESSION: Done hid the step, and the sheet said 'That's everyone' over the people still open",
  );
  assert.deepEqual(done, [ben.id], "and the step is To do's to mark done");
});
