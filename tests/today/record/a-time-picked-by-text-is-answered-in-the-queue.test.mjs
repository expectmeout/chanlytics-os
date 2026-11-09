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
import { SEND_GRACE_MS, toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installStubReact, fresh, again, all, find, byTestId, textOf, classes, press } from "../../_stub-react.mjs";
import { NOW, ZONE, metrics, waiting } from "./_world.mjs";
import { until } from "../../shared/_until.mjs";

const went = [];
const flashes = [];
installStubReact({
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
const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { RequestWork } = await import("../../../apps/dashboard/src/surfaces/today/need-you/sheet/request-work.tsx");
const { setSurfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
// What a row came to is kept by the row for the visit (need-you/row-state.ts): each test here is a visit of its own.
const { clearRowStates } = await import("../../../apps/dashboard/src/surfaces/today/need-you/row-state.ts");
const { clearSend } = await import("../../../apps/dashboard/src/surfaces/today/need-you/sends.ts");

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

test("the hold is a row that says what they asked for, answered with Confirm and send or Another time, the thread its door", () => {
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
  const tree = W.React.createElement(NeedYou, {});
  const first = byTestId(tree, "queue-handoff");
  assert.ok(textOf(first).includes(ASKED), textOf(first));
  const button = (words) => all(first, (n) => n.type === "button" && textOf(n).trim() === words);
  assert.equal(button("Confirm and send").length, 1);
  assert.equal(button("Another time").length, 1);
  assert.equal(
    button("Confirm and send")[0].props["aria-label"],
    "Confirm and send: Ana Reyes",
    "a reader hears whose",
  );
  // The row is not one button now that it holds its own presses: its words open the thread.
  assert.equal(first.props.onClick, undefined);
  find(first, (n) => classes(n).includes("cl-attn-body")).props.onClick();
  assert.equal(went.at(-1), "inbox/th-cv-a", "the row opens the thread");
});

/* ------------------------------------------ the row's work, pressed ------------------------------------------ */

const CONFIRM = "Confirmed, see you then.";
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
    whole: true,
    tz: ZONE,
    flash: (f) => flashes.push(f),
    keep: (r) => kept.push(r.id),
    // A refused press lets the row go again (WorkProps.unkeep), so the row still asks.
    unkeep: (r) => {
      const i = kept.indexOf(r.id);
      if (i >= 0) kept.splice(i, 1);
    },
  });
const buttonsIn = (tree, words) => all(tree, (n) => n.type === "button" && textOf(n).trim() === words);
const reset = () => {
  doors.length = 0;
  kept.length = 0;
  flashes.length = 0;
  went.length = 0;
  doorSays = () => answered(CONFIRM);
  clearSend("q-e-a");
  clearRowStates();
  fresh();
};

test("Confirm and send asks no door until the grace has run, then says yes and tells them, in that order", async (t) => {
  reset();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    press(buttonsIn(work(), "Confirm and send")[0]);
    assert.deepEqual(doors, [], "nothing said to anyone while Undo still means it never happened");
    assert.deepEqual(kept, ["q-e-a"], "kept in its place while it counts down");
    assert.equal(buttonsIn(again(work), "Undo").length, 1, "Undo, in its place");
    t.mock.timers.tick(SEND_GRACE_MS);
  } finally {
    t.mock.timers.reset();
  }
  await until(() => doors.length === 2, "both doors were asked");
  assert.deepEqual(doors, [
    ["POST", "/api/v1/conversations/cv-a/booking-request", { booked: true }],
    ["POST", "/api/v1/conversations/cv-a/reply", { text: CONFIRM }],
  ]);
  await until(() => textOf(again(work)).includes("Booked for"), "and it says so");
});

test("Undo inside the grace: nothing was said, the row asks again, and a refusal is the door's own sentence", async (t) => {
  reset();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    press(buttonsIn(work(), "Confirm and send")[0]);
    press(buttonsIn(again(work), "Undo")[0]);
    await Promise.resolve();
    t.mock.timers.tick(SEND_GRACE_MS);
  } finally {
    t.mock.timers.reset();
  }
  await until(() => kept.length === 0, "the row is let go");
  assert.deepEqual(doors, [], "REGRESSION: Undo that said yes anyway");

  reset();
  doorSays = () => ({
    status: 409,
    body: { ok: false, error: { code: "conflict", message: "It was answered already." } },
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    press(buttonsIn(work(), "Confirm and send")[0]);
    t.mock.timers.tick(SEND_GRACE_MS);
  } finally {
    t.mock.timers.reset();
  }
  await until(() => flashes.length > 0, "the refusal is said");
  assert.equal(flashes.at(-1).tone, "danger");
  assert.equal(textOf(flashes.at(-1).msg), "It was answered already.");
  assert.deepEqual(kept, [], "and the row still asks");
  await until(() => buttonsIn(again(work), "Confirm and send").length === 1, "its press stands again");
});

test("Another time offers what is open, and goes back to the time they asked for", async () => {
  reset();
  press(buttonsIn(work(), "Another time")[0]);
  const other = again(work);
  assert.ok(textOf(other).includes("Another day"), `and the Calendar for any other: ${textOf(other)}`);
  assert.ok(textOf(other).includes("has gone, sorry") || textOf(other).includes("What they'll get"), textOf(other));
  press(buttonsIn(other, "Back")[0]);
  assert.equal(buttonsIn(again(work), "Confirm and send").length, 1, "back to what they asked for");
  assert.deepEqual(doors, [], "nothing said");
});
