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
import { again, all, unmount } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import { NOW, W, answerWith, flashes, json, wire, dayWith, draw, row } from "./_world.mjs";

const { NeedYou } = await import("../../../apps/dashboard/src/surfaces/today/zones/need-you.tsx");
const { AttnRow } = await import("../../../apps/dashboard/src/surfaces/kit/attention/attn-row.tsx");
const { useNeedYouLine, useNeedYouModel } =
  await import("../../../apps/dashboard/src/surfaces/today/need-you-model.ts");
const { setSurfaceValue, surfaceValue } = await import("../../../apps/dashboard/src/surfaces/surface-values.ts");

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
  olderOf(draw(NeedYou)).props.cta.onClick();
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

test("Need you's model says whether it draws a pane, which the page lays its columns by: nobody waiting draws none, and Ask found leads", () => {
  setSurfaceValue("today", dayWith([]));
  assert.equal(model().draws, false, "nobody waiting: no pane, whatever came in today");
  setSurfaceValue("today", dayWith([row("w1", "Dana Ruiz", { waitedMs: 3 * MIN * 20 })]));
  assert.equal(model().draws, true, "someone waiting: Need you's pane");
  setSurfaceValue("today", undefined);
  assert.equal(model(), null, "and before Today is read, nothing");
  unmount();
});
