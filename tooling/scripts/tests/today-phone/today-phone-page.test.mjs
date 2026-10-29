/**
 * Today on a phone, EXECUTED on the stub React (decision 0076; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md):
 * Need you under the head with no head and no Ask's line of its own, who waits on the owner first and To do under them in
 * the same pane, one card and the rest short, a short row opening the walk rather than opening in place, the coral passing
 * from Need you to To do when nobody waits, and the day's numbers in one row by their short names. The same queue on a
 * desk is as it was.
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
const { TodayCard } = await import("../../../../apps/dashboard/src/surfaces/today/pages/card.tsx");
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
});
const draw = (Comp) => {
  fresh();
  return W.React.createElement(Comp, {});
};
const rowsOf = (tree, kind) => all(tree, (n) => n.props?.["data-testid"] === `queue-${kind}`);
const isPrimary = (n) => classes(n).some((c) => c === "btn-primary" || c === "primary");
const pressesOf = (tree) => all(tree, (n) => n.type === "button");

test("on a phone Need you is the people under the page's head, and To do is under them in the same pane", () => {
  phone = true;
  set(twoWaiting());
  const queue = draw(AgentCommand);
  assert.equal(byTestId(queue, "today-queue-count"), null, "the count is the page's head, not the list's");
  assert.equal(byTestId(queue, "today-queue-door"), null, "and the Inbox is the tab bar's");
  assert.equal(byTestId(queue, "today-queue-ask"), null, "each card says what Ask prepared: no line over them");
  assert.equal(byTestId(queue, "today-queue").props["data-phone"], true);
  const todo = byTestId(queue, "today-todo");
  assert.ok(todo, "To do is in the pane");
  const people = rowsOf(queue, "handoff");
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
  const desk = draw(TodayCard);
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

test("on a desk the queue is as it was: its head, the steps among its rows, and the second row worked in place", () => {
  phone = false;
  set(twoWaiting());
  const queue = draw(AgentCommand);
  assert.ok(byTestId(queue, "today-queue-count"), "its head");
  assert.equal(rowsOf(queue, "step").length, 1, "Ben's step among the rows (decision 0007)");
  assert.ok(byTestId(rowsOf(queue, "handoff")[1], "queue-handoff-work"), "the first two are worked in place");
  assert.equal(byTestId(queue, "today-queue").props["data-phone"], undefined);
  phone = true;
});
