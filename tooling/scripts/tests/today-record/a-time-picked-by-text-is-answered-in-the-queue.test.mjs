/**
 * A time a customer picked by text is a row of Today's queue that answers it (decision 0061): the hold the receptionist
 * opened says what they asked for, and its two verbs are Booked it and Can't, through the door every page presses
 * (POST conversations/[id]/booking-request). Since decision 0071 what follows stays in the row: Booked it lays the
 * confirmation the door drafts there, to send or not; Can't says the thread now waits on a reply; a refusal is the door's
 * own sentence and the row still asks.
 *
 * Run on the queue drawn on the stub React over Today's brief, and on the row's work drawn alone with the door answered
 * by the tab's own fetch.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { BOOKING_REQUEST_WORDS, NEED_YOU_WORDS, toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../_legacy-react.mjs";
import { NOW, ZONE, metrics, waiting } from "./_world.mjs";
import { until } from "../shared/_until.mjs";

const went = [];
const flashes = [];
installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate: (to) => went.push(to),
  usePPToast: () => [null, (m) => flashes.push(m)],
  canDo: () => true,
  gate: () => ({}),
  setInterval: () => 1,
  clearInterval() {},
  __clock: { zone: () => ZONE, dayKey: (ms) => zoneDayKey(ms, ZONE), time: (ms) => clockTime(ms, ZONE) },
});
const W = globalThis.window;
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { RequestWork } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/call-work.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
// What a row came to is kept by the row for the visit (need-you/row-state.ts): each test here is a visit of its own.
const { clearRowStates } = await import("../../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");

const ASKED = "Asked for Sat, Sep 19, 2:00 PM · Balayage";
/** Ana picked a time by text; the receptionist held it for the owner. Her WhatsApp window is open: she wrote a minute ago. */
const requestDay = () =>
  toTodayVM(
    metrics(),
    [{ ...waiting(), last_wa_inbound_at: "2026-09-18T18:19:00Z" }],
    [
      {
        id: "e-a",
        conversation_id: "cv-a",
        reason: "booking_request",
        details: ASKED,
        state: "open",
        created_at: "2026-09-18T18:20:00Z",
      },
    ],
    [],
    NOW,
  );
after(() => setSurfaceValue("today", undefined));

test("the hold is a row that says what they asked for, answered with Booked it and Can't, the thread its door", () => {
  const vm = requestDay();
  const [row] = vm.queue.rows;
  assert.deepEqual(
    [row.kind, row.sentence, row.quoted, row.request, row.cta.label, row.cta.to],
    ["handoff", ASKED, false, { conversationId: "cv-a" }, "Booked it", "inbox/th-cv-a"],
  );
  assert.equal(vm.needsYou?.holds ?? 1, 1, "a person waiting, counted once as every hold is");
  setSurfaceValue("today", vm);
  went.length = 0;
  fresh();
  const tree = W.React.createElement(AgentCommand, {});
  const first = byTestId(tree, "queue-handoff");
  assert.ok(textOf(first).includes(ASKED), textOf(first));
  const button = (words) => all(first, (n) => n.type === "button" && textOf(n).trim() === words);
  assert.equal(button("Booked it").length, 1);
  assert.equal(button("Can't").length, 1);
  assert.equal(button("Booked it")[0].props["aria-label"], "Booked it: Ana Reyes", "a reader hears whose");
  // The row is not one button now that it holds its own presses: its words open the thread.
  assert.equal(first.props.onClick, undefined);
  find(first, (n) => classes(n).includes("cl-attn-body")).props.onClick();
  assert.equal(went.at(-1), "inbox/th-cv-a", "the row opens the thread");
});

/* ------------------------------------------ the row's work, pressed ------------------------------------------ */

const CONFIRM = "You're booked for Saturday, September 19 at 2:00 PM for a Balayage.";
/** What the booking request's door was asked, and what it answers next. Reads behind a write fail here: not this file's. */
const doors = [];
let doorSays;
W.fetch = async (url, init = {}) => {
  if ((init.method ?? "GET") === "GET") return new Response("{}", { status: 503 });
  doors.push([init.method, String(url).replace(/\?.*$/, ""), JSON.parse(init.body)]);
  const { status, body } = await doorSays();
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};
after(() => delete W.fetch);
const answered = (reply) => ({ status: 200, body: { ok: true, data: { reply } } });
const kept = [];
const work = () =>
  W.React.createElement(RequestWork, {
    row: requestDay().queue.rows[0],
    main: "primary",
    may: true,
    tz: ZONE,
    flash: (f) => flashes.push(f),
    keep: (r) => kept.push(r.id),
  });
const buttonsIn = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const reset = () => {
  doors.length = 0;
  kept.length = 0;
  flashes.length = 0;
  went.length = 0;
  doorSays = () => answered(CONFIRM);
  clearRowStates();
  fresh();
};

test("Booked it answers through the door and lays the confirmation it drafts in the row, to send or not; a second press waits", async () => {
  reset();
  let release;
  doorSays = () => new Promise((resolve) => (release = () => resolve(answered(CONFIRM))));
  press(buttonsIn(work(), "Booked it")[0]);
  await until(() => doors.length === 1, "the door was asked");
  assert.deepEqual(doors, [["POST", "/api/v1/conversations/cv-a/booking-request", { booked: true }]]);
  assert.deepEqual(kept, ["q-e-a"], "kept in its place on the card before the door answers");
  const asking = again(work);
  assert.equal(buttonsIn(asking, "Booked it")[0].props.disabled, true, "a second press waits for the first");
  assert.equal(buttonsIn(asking, "Can't")[0].props.disabled, true);
  release();
  // The confirmation stands in the row's words, typed in where they stand (the refined canvas, 31 Oct 2026): its box's
  // value, under a head that says what it is and whose.
  const typed = (tree) =>
    find(tree, (n) => n.props?.["aria-label"] === NEED_YOU_WORDS.yourWords("Ana Reyes"))?.props.value;
  await until(() => typed(again(work)) === CONFIRM, "the confirmation is drafted in the row");
  const drafted = again(work);
  assert.ok(textOf(drafted).includes("Confirmation · drafted by Ask"), textOf(drafted));
  assert.equal(buttonsIn(drafted, "Send").length, 1, "sent from the row, through the reply's door");
  assert.deepEqual(went, [], "the row keeps it: no trip to the thread");
  press(buttonsIn(drafted, "Don't send")[0]);
  assert.ok(textOf(again(work)).includes(BOOKING_REQUEST_WORDS.said.booked("Ana Reyes")), "not sent: what was done");
});

test("Can't says the thread waits on their reply; a refusal is the door's own sentence and the row still asks", async () => {
  reset();
  doorSays = () => answered(null);
  press(buttonsIn(work(), "Can't")[0]);
  await until(
    () => textOf(again(work)).includes(BOOKING_REQUEST_WORDS.said.cant("Ana Reyes")),
    "Can't is said in the row",
  );
  assert.deepEqual(doors, [["POST", "/api/v1/conversations/cv-a/booking-request", { booked: false }]]);
  assert.equal(buttonsIn(again(work), "Send").length, 0, "nothing drafted to send");

  reset();
  doorSays = () => ({
    status: 409,
    body: { ok: false, error: { code: "conflict", message: "It was answered already." } },
  });
  press(buttonsIn(work(), "Booked it")[0]);
  await until(() => flashes.length > 0, "the refusal is said");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.equal(textOf(flashes.at(-1).msg), "It was answered already.");
  const still = again(work);
  assert.equal(buttonsIn(still, "Booked it").length, 1, "refused: the row still asks");
  assert.equal(buttonsIn(still, "Booked it")[0].props.disabled, false);
});
