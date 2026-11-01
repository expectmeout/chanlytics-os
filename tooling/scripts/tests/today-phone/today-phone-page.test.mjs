/**
 * Today on a phone, EXECUTED on the stub React (decision 0076; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md):
 * Need you under the head with no head and no Ask's line of its own, who waits on the owner first and To do a line at its
 * foot that opens under them (the redesign of 1 Nov 2026), one card and the rest short, a short row opening the walk rather
 * than opening in place, the coral passing from Need you to To do when nobody waits, and the day's numbers in one row by
 * their short names. On a desk the same queue keeps its head and door, and opens a row in place. After his look on a phone
 * (29 Oct 2026): each thing said once above the fold (how long someone waited beside their name, a run's wait in its
 * sentence, the brief's first line with Read), a foot where the card left someone out, and under the head only the
 * warnings that stop customers being answered.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { clockTime, toTodayVM, zoneDayKey } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../_legacy-react.mjs";
import { NOW, ZONE, escalation, metrics, msg, peopleWithSteps, thread, waiting } from "../today-record/_world.mjs";

const went = [];
installLegacyReact({
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
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { TodayToDo } = await import("../../../../apps/dashboard/src/surfaces/today/phone/to-do.tsx");
const { TodayCard, TodayHeadFigures } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
const { TodayWarnings } = await import("../../../../apps/dashboard/src/surfaces/today/phone/warnings.tsx");
const { BriefBox } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/parts.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

/** Sofia asked for a person three hours ago, an hour before Ana: two handoffs, Sofia's the older. */
const sofia = () =>
  thread("cv-s", "Sofia Reyes", [msg("s1", "What would six of us cost for a wedding?", "2026-09-18T17:00:00Z")], {
    state: "needs_human",
  });
const sofiaHeld = () => ({ ...escalation(), id: "e-s", conversation_id: "cv-s", created_at: "2026-09-18T17:01:00Z" });
const twoWaiting = () => toTodayVM(metrics(), [sofia(), waiting()], [sofiaHeld(), escalation()], [], NOW);
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

test("on a phone Need you is the people under the page's head, and To do is a line at its foot that opens under them", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(AgentCommand);
  assert.equal(byTestId(queue, "today-queue-count"), null, "the count is the page's head, not the list's");
  assert.equal(byTestId(queue, "today-queue-door"), null, "and the Inbox is the tab bar's");
  assert.equal(byTestId(queue, "today-queue-ask"), null, "each card says what Ask prepared: no line over them");
  assert.equal(byTestId(queue, "today-queue").props["data-phone"], true);
  const line = byTestId(queue, "today-todo-line");
  assert.ok(line, "To do is in the pane, as a line");
  assert.equal(byTestId(queue, "today-todo"), null, "closed while someone waits on you: they are the work");
  assert.match(textOf(line), /To do/);
  press(byTestId(line, "today-todo-open"));
  const opened = again(() => W.React.createElement(AgentCommand, {}));
  const todo = byTestId(opened, "today-todo");
  assert.ok(todo, "opened in place");
  const people = rowsOf(opened, "handoff");
  assert.equal(people.length, 2, "both people waiting");
  assert.ok(
    people.every((p) => !all(todo, (n) => n === p).length),
    "neither in To do",
  );
  assert.equal(rowsOf(todo, "step").length, 1, "Ben's step is To do's");
  assert.ok(textOf(todo).includes("Call Ben"), textOf(todo));
});

test("on a phone the day's four numbers are one row, each by its short name", () => {
  phone = true;
  set(twoWaiting());
  const card = draw(TodayCard);
  const names = all(card, (n) => classes(n).includes("tc-fig-w")).map(textOf);
  assert.deepEqual(names, ["messages", "answered", "calls", "new people"]);
  phone = false;
  // A desk's four stand in the frame's head beside the greeting (card.tsx TodayHeadFigures), by their long names; the
  // card is a phone's alone (today-page.tsx).
  const desk = draw(TodayHeadFigures);
  assert.ok(
    all(desk, (n) => classes(n).includes("tc-fig-w"))
      .map(textOf)
      .includes("answered by the receptionist"),
    "a desk keeps the long names",
  );
  phone = true;
});

test("on a phone one card holds Ask's work, the next is a row with its press, which opens the walk on it", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(AgentCommand);
  const [first, second] = rowsOf(queue, "handoff");
  assert.ok(textOf(first).includes("Sofia Reyes"), "the longest wait is the card");
  assert.ok(byTestId(first, "queue-handoff-work"), "worked in place");
  assert.equal(byTestId(second, "queue-handoff-work"), null, "the second is short");
  const reply = find(second, (n) => n.type === "button" && textOf(n) === "Reply");
  assert.ok(reply, "its one press");
  press(reply);
  const after = again(() => W.React.createElement(AgentCommand, {}));
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
  const queue = draw(AgentCommand);
  assert.equal(pressesOf(queue).filter(isPrimary).length, 1, "one coral in Need you");
  const todo = again(() => W.React.createElement(TodayToDo, {}));
  assert.equal(pressesOf(todo).filter(isPrimary).length, 0, "To do is quiet beside it");
  set(nobodyWaiting());
  draw(AgentCommand);
  const calm = again(() => W.React.createElement(TodayToDo, {}));
  assert.equal(pressesOf(calm).filter(isPrimary).length, 1, "with nobody waiting, To do's Done is the coral");
});

test("on a desk the queue has its head and door, the steps in To do at its foot, Up next worked in place and the next opened in its stead", () => {
  phone = false;
  set(twoWaiting());
  const queue = draw(AgentCommand);
  assert.ok(byTestId(queue, "today-queue-door"), "its head, with its door");
  assert.equal(byTestId(queue, "today-queue-count"), null, "how many is the page head's, said once");
  assert.equal(rowsOf(queue, "step").length, 0, "Ben's step is To do's (decision 0007), behind its line");
  assert.ok(byTestId(queue, "today-todo-line"));
  const [first, second] = rowsOf(queue, "handoff");
  assert.ok(byTestId(first, "queue-handoff-work"), "Up next is worked in place");
  assert.equal(byTestId(second, "queue-handoff-work"), null, "the next is short");
  press(find(second, (n) => n.type === "button" && textOf(n).includes("Reply")));
  const opened = rowsOf(
    again(() => W.React.createElement(AgentCommand, {})),
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
  const [sofiaRow] = rowsOf(draw(AgentCommand), "handoff");
  assert.ok(once(sofiaRow), textOf(sofiaRow));
  assert.ok(!textOf(sofiaRow).includes("since "), `no since on a phone: ${textOf(sofiaRow)}`);
  phone = false;
  const [deskRow] = rowsOf(draw(AgentCommand), "handoff");
  assert.ok(once(deskRow), `a desk says the wait, once: ${textOf(deskRow)}`);
  assert.ok(!textOf(deskRow).includes("since "), `and no since: ${textOf(deskRow)}`);
  phone = true;
});

test("on a phone the card says who it left out, with See all, and says nothing where it left nobody out", () => {
  phone = true;
  set(twoWaiting());
  assert.equal(footOf(draw(AgentCommand)), null, "two people, both drawn: no foot");
  // The day holds six (contracts today-queue.ts), each a row of its group; past them the foot counts the rest.
  set(manyWaiting(8));
  const queue = draw(AgentCommand);
  assert.equal(rowsOf(queue, "handoff").length, 6, "the card holds six");
  const foot = footOf(queue);
  assert.ok(foot, "and says the rest");
  assert.ok(textOf(foot).includes("2 more in the Inbox"), textOf(foot));
  const all_ = find(foot, (n) => n.type === "button" && textOf(n) === "See all");
  assert.ok(all_, "with the door to them");
  went.length = 0;
  press(all_);
  assert.deepEqual(went, ["inbox"]);
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
    const row = byTestId(draw(AgentCommand), "brief-run-row");
    assert.ok(row, "the run is a row");
    assert.ok(textOf(row).includes("Waits for your OK"), textOf(row));
    assert.ok(!textOf(row).includes("Waiting for your approval"), `said once: ${textOf(row)}`);
    assert.ok(
      find(row, (n) => n.type === "button" && textOf(n) === "Review"),
      "Review, what is done there",
    );
    phone = false;
    const desk = byTestId(draw(AgentCommand), "brief-run-row");
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

test("on a phone's card Ask's brief is its first line with Read; the walk's sheet and a desk draw it whole", () => {
  const brief = {
    opening: "Hi, it's the studio, returning your call.",
    points: ["Ask about Thursday"],
    ask: null,
    avoid: [],
  };
  fresh();
  const card = again(() => W.React.createElement(BriefBox, { brief, onRead: () => {} }));
  assert.ok(textOf(card).includes("Open with"), textOf(card));
  assert.ok(textOf(card).includes("“Hi, it's the studio, returning your call.”"), textOf(card));
  assert.ok(!textOf(card).includes("Call notes"), "no head over its one line");
  assert.ok(!textOf(card).includes("Ask about Thursday"), "the rest is the sheet's");
  assert.ok(
    find(card, (n) => n.type === "button" && textOf(n).includes("Read")),
    "Read opens it",
  );
  const whole = again(() => W.React.createElement(BriefBox, { brief }));
  assert.ok(textOf(whole).includes("Call notes · only you see these"), textOf(whole));
  assert.ok(textOf(whole).includes("Ask about Thursday"), textOf(whole));
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
    const warned = draw(TodayWarnings);
    const rows = all(warned, (n) => n.props?.["data-testid"] === "today-warning").map(textOf);
    assert.equal(rows.length, 1, rows.join(" | "));
    assert.ok(rows[0].includes("WhatsApp number"), rows[0]);
  } finally {
    delete W.__notifs;
  }
});

test("a call back that has waited past a week says first that it may be let go; a newer one goes straight to its brief", async () => {
  const { CallWork } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/call-work.tsx");
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
      }),
    );
  };
  assert.ok(textOf(work(NEED_YOU_OLD_MS + DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "Ask's word, before its notes");
  assert.ok(!textOf(work(DAY_MS)).includes(NEED_YOU_WORDS.staleCall), "a call back under a week is simply owed");
});
