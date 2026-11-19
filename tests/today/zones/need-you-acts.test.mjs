/**
 * Need you as the canvas works it (Today in three zones, 2 Nov 2026), drawn on the stub React over Today's read: one open
 * card, the coral where the canvas puts it, the head's line about the rows drawn, and nothing drafted for a row the page
 * does not draw. Each case was a gap the 3 Nov audit found:
 *
 * - a reply the receptionist sends on its own leads as the open card, and the first row waiting is short with the coral
 *   (the canvas's shift moment), where two cards stood open and the coral sat in the second;
 * - the head named the held reply's own window, a day away, as the one thing that cannot wait;
 * - Older's Mark all done took the coral (8 Nov 2026: and now never does, nobody counts it);
 * - Ask wrote drafts for every row past the five waiting, and the head counted them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS } from "@chanlytics/contracts";
import { again, all, press, quiet, redrawWanted, unmount } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, W, answerWith, buttons, flashes, json, wire, went, dayWith, draw, row } from "./_world.mjs";

const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { offerOtherTimes } = await import("../../../apps/dashboard/src/surfaces/booking-request.ts");
const { takeCarriedReply, cameFromToday } = await import("../../../apps/dashboard/src/surfaces/inbox/carried-reply.ts");
const { AttnRow } = await import("../../../apps/dashboard/src/surfaces/kit/attention/attn-row.tsx");
const { useNeedYouLine, useNeedYouModel } =
  await import("../../../apps/dashboard/src/surfaces/today/need-you-model.ts");
const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");
const { surfaceMoved } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");

/** Need you's model and the head's line, as the page and the head read them over Today's read. */
const model = () => again(() => useNeedYouModel(surfaceValue("today") ?? null));
const headLine = () => again(() => useNeedYouLine(surfaceValue("today") ?? null));

const MIN = 60_000;
const DAY = 86_400_000;
/** Lea's reply, which the receptionist sends on its own in ten minutes unless someone stops it. */
const lea = () =>
  row("lea", "Lea Park", {
    kind: "held",
    held: { message_id: "m-held", text: "Yes, 3 PM is free.", sends_at_ms: NOW.getTime() + 10 * MIN },
    clock_ms: 10 * MIN,
    writes: { for_message_id: "m-lea", wire: "WhatsApp", window_open: true, window_closes: "tomorrow 11:17 AM" },
  });
const rowsDrawn = (tree) => all(tree, (n) => n.type === AttnRow);
const testidOf = (n) => n.props.testid;

test("a reply going on its own leads as the one open card; the first row waiting is drawn short, holding the coral", () => {
  setSurfaceValue("today", dayWith([lea(), row("mateo", "Mateo Cruz"), row("sofia", "Sofia Reyes")]));
  const tree = draw(NeedYou);
  const rows = rowsDrawn(tree);
  const open = rows.filter((r) => r.props.work);
  assert.deepEqual(open.map(testidOf), ["queue-held"], "REGRESSION: Lea's card and Mateo's whole card both stood open");
  const [mateo, sofia] = rows.filter((r) => testidOf(r) === "queue-handoff");
  assert.equal(mateo.props.cta?.kind, "primary", "Mateo's short verb holds the page's coral: Lea's press is Stop");
  assert.equal(sofia.props.cta?.kind, "ghost", "and only his");
  setSurfaceValue("today", undefined);
});

test("the head's line names no window of a reply going on its own; another person's, closing within two hours, it names", () => {
  setSurfaceValue("today", dayWith([lea()]));
  draw(NeedYou);
  assert.doesNotMatch(
    String(headLine()),
    /window closes/,
    "REGRESSION: the head named Lea's own window, a day away, as the thing that cannot wait",
  );
  const priya = row("priya", "Priya Nair", {
    kind: "window",
    clock_ms: 95 * MIN,
    writes: { for_message_id: "m-p", wire: "WhatsApp", window_open: true, window_closes: "5:35 PM" },
  });
  setSurfaceValue("today", dayWith([lea(), priya]));
  draw(NeedYou);
  assert.match(String(headLine()), /Priya's window closes at 5:35 PM/);
  setSurfaceValue("today", undefined);
});

test("Older's Mark all done never takes the coral, with nothing above it either: the setup card's act keeps it", () => {
  const old = (id, who) => row(id, who, { waitedMs: 9 * DAY });
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz"), old("o2", "Kai Moreno")]));
  const tree = draw(NeedYou);
  const older = rowsDrawn(tree).find((r) => testidOf(r) === "queue-older");
  assert.equal(older.props.cta?.kind, "ghost", "nobody counts it, and the head says nothing needs you");
  assert.deepEqual(
    [model().coral, model().todo.coral],
    [null, null],
    "REGRESSION: an old number left Finish setting up quiet",
  );
  unmount();
  setSurfaceValue("today", undefined);
});

test("Ask is asked for the drafts of the rows drawn: Up next and the five waiting, never the waiting past them nor Older on a desk", async () => {
  // No words written yet: each row wants Ask's draft. Eight under a week (Up next and seven waiting), two past a week.
  const fresh = Array.from({ length: 8 }, (_, i) =>
    row(`w${i}`, `Person ${i}`, { prepared: null, waitedMs: (i + 1) * 3_600_000 }),
  );
  const old = ["o1", "o2"].map((id) => row(id, `Old ${id}`, { prepared: null, waitedMs: 9 * DAY }));
  setSurfaceValue("reply_drafts", undefined);
  setSurfaceValue("today", dayWith([...fresh, ...old]));
  wire.length = 0;
  draw(NeedYou);
  await until(() => wire.some((w) => w.path === "/api/v1/conversations/drafts"), "the drafts asked for");
  const asked = wire
    .filter((w) => w.path === "/api/v1/conversations/drafts")
    .flatMap((w) => new URLSearchParams(w.query).get("ids")?.split(",") ?? []);
  assert.equal(asked.length, 6, `REGRESSION: drafts were asked for rows the page does not draw: ${asked.join(", ")}`);
  assert.ok(!asked.some((id) => id.startsWith("cv-o")), "never Older's on a desk");
  setSurfaceValue("today", undefined);
  delete W.__REPLIES;
});

test("Older's Mark all done refused whole says why and stays to be pressed again", async () => {
  const old = (id, who) => row(id, who, { waitedMs: 9 * DAY });
  setSurfaceValue("today", dayWith([old("o1", "Dana Ruiz"), old("o2", "Kai Moreno")]));
  answerWith(() => json(403, { ok: false, error: { code: "forbidden", message: "Not yours to give back." } }));
  flashes.length = 0;
  const olderOf = (tree) => rowsDrawn(tree).find((r) => testidOf(r) === "queue-older");
  // It asks first, in the row's own place (decision 0142): the press is the question's while it stands, Not now changes
  // nothing, and Yes is the press that goes.
  olderOf(draw(NeedYou)).props.cta.onClick();
  const redraw = () => olderOf(again(() => W.React.createElement(NeedYou, {})));
  const asked = redraw();
  assert.equal(asked.props.cta, null, "the press is the question's now");
  assert.deepEqual(
    [asked.props.work.props.question, asked.props.work.props.yes, asked.props.work.props.no],
    ["Mark all 2 done?", "Yes, mark 2 done", "Not now"],
  );
  wire.length = 0;
  asked.props.work.props.onNo();
  const kept = redraw();
  assert.deepEqual(
    [kept.props.work, wire.length],
    [null, 0],
    "Not now: nothing asked of the server, the row as it was",
  );
  kept.props.cta.onClick();
  redraw().props.work.props.onYes();
  await until(
    () => flashes.length > 0,
    `the refusal said (the wire: ${wire.map((w) => w.method + " " + w.path).join(", ")})`,
  );
  assert.equal(flashes.at(-1)?.tone, "danger", "REGRESSION: a refusal was said as a receipt, in the quiet ink");
  const again_ = olderOf(again(() => W.React.createElement(NeedYou, {})));
  assert.ok(again_.props.cta, "REGRESSION: the press went, and nothing was left to try again with");
  assert.equal(again_.props.work, null, "and nothing says they were marked done");
  setSurfaceValue("today", undefined);
  unmount();
});

test("Mark done says everyone it marked: a conversation nobody answered is archived, which has no undo, and is counted all the same", async () => {
  const { handBackAll, handedBackWords } =
    await import("../../../apps/dashboard/src/surfaces/today/need-you/sheet/hand-back.ts");
  answerWith(() => json(200, { ok: true, data: { decision_id: "d1" } }));
  // Dana asked for a person: her hold is handed back. Nobody answered Kai, who has no hold: Mark done archives him.
  const dana = row("o1", "Dana Ruiz", { waitedMs: 9 * DAY });
  const kai = row("o2", "Kai Moreno", { waitedMs: 9 * DAY, closes: "archive" });
  wire.length = 0;
  const both = await handBackAll([dana, kai]);
  assert.deepEqual(
    wire.map((w) => w.path.split("/").at(-1)),
    ["hand-back", "archive"],
    "each by its own verb",
  );
  assert.deepEqual([both.done, both.refused, !!both.undo], [2, 0, true]);
  assert.equal(handedBackWords(both), "2 marked done", "REGRESSION: the archived one was left out of the count");
  const alone = await handBackAll([kai]);
  assert.deepEqual(
    [alone.done, alone.refused, alone.undo],
    [1, 0, null],
    "REGRESSION: one such person alone read as none marked, and the page said, in red, that they couldn't be",
  );
  assert.equal(handedBackWords(alone), "Marked done");
  // What the question before Mark all done says of them (contracts): what Undo will not bring back.
  const ask = NEED_YOU_WORDS.oldDone.ask;
  assert.equal(ask.detail(37, 0), "They leave your list, and AI answers them if they write again.");
  assert.equal(
    ask.detail(37, 14),
    "They leave your list until they write again. Nobody answered 14 of them, so those are archived, and Undo won't bring them back.",
  );
  assert.equal(
    ask.detail(2, 2),
    "They leave your list until they write again. Nobody answered them, so they are archived, and Undo won't bring them back.",
  );
});

test("Need you's model hears every read its rows come from, so the list, the page and the head redraw as one lands", () => {
  setSurfaceValue("today", dayWith([row("w1", "Dana Ruiz")]));
  draw(NeedYou);
  // A reach-out's reply read is that reply's row (the wiring's second audit, W-campaign-run-template-reachout-7); Google's
  // reviews and People's steps are To do's; the runs wait for an OK.
  for (const read of ["today", "broadcasts", "people", "calendar", "reach_out_replies", "google", "settings"]) {
    quiet();
    surfaceMoved(read);
    assert.ok(redrawWanted(), `REGRESSION: ${read} landed and Need you was not drawn again`);
  }
  quiet();
  surfaceMoved("billing");
  assert.ok(!redrawWanted(), "and not for a read it does not draw");
  unmount();
  setSurfaceValue("today", undefined);
});

test("Need you's model says whether it draws a pane, which the page lays its columns by: nobody waiting draws none, and Ask found leads", () => {
  setSurfaceValue("today", dayWith([]));
  assert.equal(model().draws, false, "nobody waiting: no pane, whatever came in today");
  setSurfaceValue("today", dayWith([row("w1", "Dana Ruiz", { waitedMs: 3 * MIN * 20 })]));
  assert.equal(model().draws, true, "someone waiting: Need you's pane");
  setSurfaceValue("today", undefined);
  assert.equal(model(), null, "and before Today is read, nothing");
  unmount();
});

test("Stop on AI's reply stops it on Today, and what follows is written in their conversation: the row says nothing was sent, and Reply opens the thread with the stopped words in its box", async () => {
  // Its countdown runs on the clock the page reads, so it goes ten minutes from now, not from the day the world is set on.
  const going = { message_id: "m-held", text: "Yes, 3 PM is free.", sends_at_ms: Date.now() + 10 * MIN };
  setSurfaceValue("today", dayWith([{ ...lea(), held: going }]));
  answerWith((u) =>
    u.pathname === "/api/v1/messages/m-held/cancel-send"
      ? json(200, { ok: true, data: { status: "canceled" } })
      : json(503, { ok: false, error: { code: "unavailable", message: "not read here" } }),
  );
  wire.length = 0;
  went.length = 0;
  /** Lea's row's work, as the page draws it under her words. */
  const workOf = (tree) => rowsDrawn(tree).find((r) => testidOf(r) === "queue-held")?.props.work;
  const drawnAgain = () => workOf(again(() => W.React.createElement(NeedYou, {})));
  const [stop] = buttons(workOf(draw(NeedYou)), NEED_YOU_WORDS.held.stopIt);
  assert.ok(stop, "the countdown keeps its Stop on Today: a brake against a running clock");
  press(stop);
  await until(() => wire.some((w) => w.path === "/api/v1/messages/m-held/cancel-send"), "the hold asked for");
  await until(() => buttons(drawnAgain(), NEED_YOU_WORDS.held.reply).length > 0, "the stopped row's Reply");
  const stopped = drawnAgain();
  assert.equal(
    buttons(stopped, NEED_YOU_WORDS.send).length,
    0,
    "REGRESSION: the stopped words were sent from Today, where nothing is written to a person (D8)",
  );
  press(buttons(stopped, NEED_YOU_WORDS.held.reply)[0]);
  assert.equal(went.at(-1), "inbox/th-cv-lea", "Reply opens their conversation");
  assert.equal(cameFromToday("th-cv-lea"), true, "which offers the way back to Today");
  assert.equal(
    takeCarriedReply("th-cv-lea"),
    "Yes, 3 PM is free.",
    "with the stopped words in its box, to change and send",
  );
  setSurfaceValue("today", undefined);
  unmount();
});

test("Can't do it's reply offers the next two open times in Another time's words, and asks what suits them where none is open or read", async () => {
  const openings = (days) => (u) =>
    u.pathname === "/api/v1/ask/openings"
      ? json(200, { ok: true, data: { openings: { state: "ok", days } } })
      : json(503, { ok: false, error: { code: "unavailable", message: "not read here" } });
  answerWith(
    openings([
      { key: "2026-09-21", windows: ["2:30 – 4 PM"] },
      { key: "2026-09-22", windows: ["9 AM – 12 PM", "1 – 3 PM"] },
    ]),
  );
  assert.equal(
    await offerOtherTimes({ near: "tomorrow at 3:00 PM", service: null }),
    "Tomorrow at 3:00 PM has gone, sorry. Would 2:30 PM on Mon, Sep 21 or 9 AM on Tue, Sep 22 work instead?",
    "the first time of each of the next two windows, never a third",
  );
  answerWith(openings([]));
  assert.equal(
    await offerOtherTimes({ near: "tomorrow at 3:00 PM", service: "Consultation" }),
    "Tomorrow at 3:00 PM has gone, sorry. What other time suits you?",
  );
  answerWith(() => json(503, { ok: false, error: { code: "unavailable", message: "not read here" } }));
  assert.equal(
    await offerOtherTimes({ near: "Friday at 10:00 AM", service: null }),
    "Friday at 10:00 AM has gone, sorry. What other time suits you?",
    "a calendar that could not be read never leaves the box empty, nor the press refused",
  );
});
