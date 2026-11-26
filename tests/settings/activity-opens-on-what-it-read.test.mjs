/**
 * Settings › Activity opens on what its opening read came to (the nightly's settings-loads, 24 Nov 2026): the log's first
 * page is read before the pane is drawn (settings/frame/pane-reads.ts), and where that read was refused (a 429 of the
 * shared read ceiling, on the suite's own stack) the refusal was thrown away. The pane drew the log's waiting shape, read
 * again, and put the failed line in its place: its card 469 px, then 290. Now the refusal is the bridge's last answer for
 * the read until a page lands (bridge/activity.ts), the pane's first frame says it, and a read again keeps the failed line
 * standing, its Retry busy, until the answer lands. Run through the real bridge over a fetch that answers as told.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again, all, byTestId, textOf, press } from "../_stub-react.mjs";
import { until } from "../shared/_until.mjs";
import { holdFrameParts } from "../shell/_bridge-holds.mjs";

installStubReact({ canDo: () => true });
globalThis.location.pathname = "/w/studio/settings/activity";

/** What GET activity answers now, and how many times it was asked; every other read is refused as not read here. */
const wire = { activity: 0, answer: null };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const REFUSED = () =>
  json(429, {
    ok: false,
    error: { code: "rate_limited", message: "Too many report requests. Try again in a minute." },
  });
globalThis.fetch = async (url) => {
  if (new URL(String(url), "https://app.chanlytics.com").pathname !== "/api/v1/activity")
    return json(503, { ok: false, error: { code: "unavailable", message: "not read here" } });
  wire.activity += 1;
  return wire.answer();
};
const realConsoleError = console.error;
console.error = () => {};
test.after(() => {
  console.error = realConsoleError;
});

const S = "../../apps/dashboard/src";
holdFrameParts();
const { activity } = await import(`${S}/bridge/activity.ts`);
const { PaneActivity } = await import(`${S}/surfaces/settings/activity/pane.tsx`);

/** A page of the log with one row, as GET activity answers it. */
const PAGE = {
  rows: [
    {
      id: "e1",
      at: "2026-09-15T14:00:00Z",
      text: "changed the business details",
      kind: "settings.changed",
      source: "decision",
      actor_type: "human",
      actor_user_id: null,
    },
  ],
  actors: {},
  kinds: ["settings.changed"],
  page: { has_more: false, next_cursor: null },
};

/** What the card stands on: the failed line, the waiting shape, the rows, and its Retry's words. */
function shapeOf(tree) {
  const card = byTestId(tree, "set-activity");
  const failed = byTestId(card, "act-failed");
  return {
    failed: !!failed,
    waiting: all(card, (n) => n.props?.className === "act-waiting").length > 0,
    rows: all(card, (n) => n.props?.["data-testid"] === "act-row").length,
    retry: failed ? textOf(all(failed, (n) => n.type === "button")[0]).trim() : null,
  };
}

/**
 * The pane drawn again over the same cells, as React draws it after a state change. The stub's useCallback makes its
 * function anew on each draw, so each draw here reads the log again: a test draws once every read it asked has come
 * back, and never in a loop.
 */
const redraw = () => again(() => PaneActivity({}));
/** The log's reads the pane (and the warm before it) asked for, and how many have come back: the module's object, wrapped. */
const reads = { asked: 0, back: 0 };
const list = activity.list;
activity.list = (f) => {
  reads.asked += 1;
  return list(f).then((r) => {
    reads.back += 1;
    return r;
  });
};
const allBack = () => until(() => reads.back === reads.asked, "every read of the log came back");

test("an opening read that was refused is the pane's first frame, and a read again keeps the failed line where it stands", async () => {
  // The read begun before the pane (pane-reads.ts settingsPaneOnScreen's warm), refused.
  wire.answer = REFUSED;
  const opening = await activity.warm({});
  assert.equal(opening.ok, false);
  assert.equal(activity.peek({})?.ok, false, "the refusal is the last answer this tab has for the read");

  fresh();
  const first = redraw();
  assert.deepEqual(
    shapeOf(first),
    { failed: true, waiting: false, rows: 0, retry: "Retrying…" },
    "REGRESSION: the pane drew the log's waiting shape, then took it away for the failed line",
  );
  assert.equal(wire.activity, 2, "and reads again behind it as it opens");
  await allBack();
  const tree = redraw();
  assert.deepEqual(
    shapeOf(tree),
    { failed: true, waiting: false, rows: 0, retry: "Retry" },
    "refused again, the same line",
  );

  // Retry pressed: the line stays, busy, while the log is read; the page that lands takes its place.
  await allBack();
  const out = [];
  wire.answer = () => new Promise((resolve) => out.push(() => resolve(json(200, { ok: true, data: PAGE }))));
  press(all(byTestId(tree, "act-failed"), (n) => n.type === "button")[0]);
  assert.deepEqual(shapeOf(redraw()), { failed: true, waiting: false, rows: 0, retry: "Retrying…" });
  await until(() => out.length > 0, "the log read again");
  for (const land of out) land();
  await allBack();
  assert.deepEqual(shapeOf(redraw()), { failed: false, waiting: false, rows: 1, retry: null });
  assert.equal(activity.peek({})?.ok, true, "and the page is the tab's answer from then on");
});

test("a pane with nothing read yet still draws the log's shape while it reads: a read out is no refusal", async () => {
  activity.forget();
  wire.answer = () => new Promise(() => {});
  fresh();
  assert.deepEqual(shapeOf(redraw()), { failed: false, waiting: true, rows: 0, retry: null });
});
