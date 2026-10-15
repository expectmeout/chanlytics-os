/**
 * A time a customer picked by text is a row of Today's queue that answers it (decision 0061): the hold the receptionist
 * opened says what they asked for, and its two verbs are Booked it and Can't, through the door every page presses
 * (POST conversations/[id]/booking-request). Booked it goes to the thread with the confirmation carried into its box;
 * Can't says the thread now waits on a reply; a refusal is the door's own sentence and keeps the row.
 *
 * Run on the queue drawn on the stub React over Today's brief, and on the verb with the door handed in.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { toTodayVM, zoneDayKey, clockTime } from "@chanlytics/contracts";
import { installLegacyReact, fresh, all, byTestId, textOf } from "../_legacy-react.mjs";
import { NOW, ZONE, metrics, waiting } from "./_world.mjs";

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
const { requestActs, requestAnswer } =
  await import("../../../../apps/dashboard/src/surfaces/today/pages/queue-requests.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

const ASKED = "Asked for Sat, Sep 19, 2:00 PM · Balayage";
/** Ana picked a time by text; the receptionist held it for the owner. */
const requestDay = () =>
  toTodayVM(
    metrics(),
    [waiting()],
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
  first.props.onClick();
  assert.equal(went.at(-1), "inbox/th-cv-a", "the row opens the thread");
});

test("the verbs: Booked it the row's button, Can't its quiet one, each answering through the door", () => {
  const pressed = [];
  const row = { id: "q-e-a", kind: "handoff", who: "Ana Reyes", request: { conversationId: "cv-a" } };
  const acts = requestActs(row, "primary", (r, booked) => pressed.push([r.request.conversationId, booked]));
  assert.deepEqual(
    [acts.cta.label, acts.cta.kind, acts.also.label, acts.also.kind],
    ["Booked it", "primary", "Can't", "ghost"],
  );
  acts.cta.onClick();
  acts.also.onClick();
  assert.deepEqual(pressed, [
    ["cv-a", true],
    ["cv-a", false],
  ]);
});

test("Booked it goes to the thread with the reply carried; Can't says it waits on a reply; a refusal keeps the row; a second press waits", async () => {
  const row = { id: "q-e-a", kind: "handoff", who: "Ana Reyes", request: { conversationId: "cv-a" } };
  const hidden = [];
  const page = { flash: (f) => flashes.push(f), hide: (id) => hidden.push(id) };
  const asked = [];
  let release;
  const door = (id, booked, who) =>
    new Promise((resolve) => {
      asked.push([id, booked, who]);
      release = () =>
        resolve({
          ok: true,
          reply: "You're booked for Saturday, September 19 at 2:00 PM for a Balayage.",
          receipt: "Booked. Tell Ana Reyes in the thread.",
        });
    });
  went.length = 0;
  flashes.length = 0;
  const first = requestAnswer(row, true, page, door);
  await requestAnswer(row, false, page, door);
  assert.deepEqual(asked, [["cv-a", true, "Ana Reyes"]], "once: the second press waits for the first");
  release();
  await first;
  assert.deepEqual(hidden, ["cv-a"], "the row goes at once");
  assert.equal(went.at(-1), "inbox/th-cv-a", "to the thread, where the reply waits to be sent");
  assert.equal(textOf(flashes.at(-1).msg), "Booked. Tell Ana Reyes in the thread.");

  went.length = 0;
  hidden.length = 0;
  await requestAnswer(row, false, page, async () => ({
    ok: true,
    reply: null,
    receipt: "Ana Reyes is waiting on your reply",
  }));
  assert.equal(textOf(flashes.at(-1).msg), "Ana Reyes is waiting on your reply");
  assert.deepEqual([went, hidden], [[], ["cv-a"]], "Can't stays here: the row comes back as the reply it now waits on");

  hidden.length = 0;
  await requestAnswer(row, true, page, async () => ({ ok: false, message: "It was answered already." }));
  assert.equal(flashes.at(-1).tone, "danger");
  assert.equal(textOf(flashes.at(-1).msg), "It was answered already.");
  assert.deepEqual(hidden, [], "refused: the row stays");
});
