/**
 * A sequence's batch, read where its record draws it (History's day, a lead step's next email, the step editor's people:
 * sequences/use-record.ts useBatchRead). It is read through the batch's own door, GET broadcasts/[id], which its run's sheet
 * in Sent reads, so the two say one thing from one answer. The record followed the Sequences list with it, which is read
 * again at every send heard anywhere in the workspace: a day of History that ended months ago was read whole again each
 * time. It follows the door's own rule now, its sheet's (contracts runStillMoving): read as it opens, and again as the list
 * moves only while the batch is underway or within the reply window after it ended. Run here on the stub React, through
 * the real hook, with the door's two calls answered by the test.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { REPLY_WINDOW_MS } from "@chanlytics/contracts";
import { again, fresh, installLegacyReact, settle, unmount } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// use-record.ts makes the record foot's context as it loads, and "react" under this runner's react-server condition has no
// createContext: the stub gives it one that holds its value, which nothing here draws.
const reactOfDashboard = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
reactOfDashboard.createContext ??= (value) => ({ Provider: "Provider", Consumer: "Consumer", _currentValue: value });

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
await import(`${S}/surfaces/campaigns/sequences/surface.ts`);
const { broadcasts } = await import(`${S}/surfaces/campaigns/broadcasts/verbs.ts`);
const { useBatchRead } = await import(`${S}/surfaces/campaigns/sequences/use-record.ts`);

const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();
/** A batch's answer as the door gives it: the row, and nobody on it (what the hook judges is the row). */
const answerOf = (id, row) => ({
  broadcast: { id, state: "sent", started_at: null, finished_at: null, ...row },
  recipients: [],
  reach_out: null,
});
const BATCHES = {
  old: answerOf("old", { finished_at: ago(30 * 24 * HOUR) }),
  recent: answerOf("recent", { finished_at: ago(2 * HOUR) }),
  waiting: answerOf("waiting", { state: "pending_approval" }),
};

/** The door, answered here: each read counted by its id, and kept as the read cache keeps it, for the next paint. */
let reads = [];
let held = new Map();
broadcasts.detail = async (id) => {
  reads.push(id);
  const r = { ok: true, status: 200, data: BATCHES[id] };
  held.set(id, r);
  return r;
};
broadcasts.peekDetail = (id) => held.get(id) ?? null;

let shown = null;
function Probe({ id }) {
  shown = useBatchRead(id);
  return null;
}
const draw = (id) => again(() => globalThis.React.createElement(Probe, { id }));
/** The Sequences list read again: a new value of the surface the record follows. */
const listMoves = () => values.setSurfaceValue("sequences", { sequences: [], timezone: "UTC", word: "appointment" });

beforeEach(() => {
  unmount();
  fresh();
  reads = [];
  held = new Map();
  shown = null;
  listMoves();
});

test("a day that ended past the reply window is read as it opens, and not again as the list moves", async () => {
  draw("old");
  await settle();
  draw("old");
  assert.equal(shown.state, "read");
  assert.deepEqual(reads, ["old"], "read once, as it opened");
  for (let n = 0; n < 3; n += 1) {
    listMoves();
    draw("old");
    await settle();
  }
  assert.deepEqual(reads, ["old"], "three sends heard in the workspace read nothing of it");
  assert.equal(shown.state, "read", "and it still shows what it read");
});

test("a batch underway, or ended within the reply window, is read again each time the list moves", async () => {
  assert.ok(Date.parse(BATCHES.recent.broadcast.finished_at) > Date.now() - REPLY_WINDOW_MS);
  for (const id of ["waiting", "recent"]) {
    reads = [];
    draw(id);
    await settle();
    listMoves();
    draw(id);
    await settle();
    listMoves();
    draw(id);
    await settle();
    assert.deepEqual(reads, [id, id, id], `${id}: as it opened, then at each move of the list`);
  }
});

test("another batch opened is read, whatever the last one said", async () => {
  draw("old");
  await settle();
  draw("recent");
  await settle();
  draw("old");
  await settle();
  assert.deepEqual(reads, ["old", "recent", "old"], "a day opened again is read again, painted from what is held");
});
