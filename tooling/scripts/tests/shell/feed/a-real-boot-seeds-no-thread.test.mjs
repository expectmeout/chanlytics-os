/**
 * A real session's boot seeds no thread (the wiring's second audit, X6-1, X6-3), run on the app's own seeds
 * (legacy-bridge/seed-globals.ts), the Inbox's store and the bell over them, as a signed-in tab loads them.
 *
 * The seeds published the demo's eleven threads under INBOX_DATA in every session, and the Inbox's store answered the demo's
 * rows until its first read landed: on a real workspace the bell, the top bar's search and Ask's palette read those people as
 * customers for the moment the read took, and the bell took its first look at them. The nightly walk for invented names
 * missed it (it looked for four of them, and only after the reads had landed); this runs the boot itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";

installLegacyReact();
const win = globalThis.window;
// Nothing declared a demo: a signed-in tab, as the app's own page boots it.
delete win.__DEMO_MODE;
await importSrc("apps/dashboard/src/legacy-bridge/seed-globals.ts");
const { inboxData, conversationsData, REAL_CHANNEL_LABELS } = await importSrc(
  "apps/dashboard/src/surfaces/inbox/store.ts",
);
const { inboxSample, conversationsSample } = await importSrc("apps/dashboard/src/surfaces/inbox/sample.ts");
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { installNotifications } = await importSrc("apps/dashboard/src/legacy-bridge/notifications.ts");

const SEEDED = [...inboxSample.THREADS, ...conversationsSample.CONVERSATIONS].map((row) => row.who);
const storage = () => {
  const kept = new Map();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
};

test("REGRESSION (X6-1): a real boot publishes no seeded thread, and the Inbox's store holds none before its read", () => {
  assert.equal(win.__DEMO_MODE, false, "a session that declared nothing is real");
  assert.equal(win.INBOX_DATA, undefined, "REGRESSION: the demo's eleven threads were published in every session");
  assert.equal(win.CONVERSATIONS_DATA, undefined);
  const inbox = inboxData();
  assert.deepEqual(inbox.THREADS, [], "before its read, no thread: not the demo's");
  assert.deepEqual(inbox.CHANNEL_LABELS, REAL_CHANNEL_LABELS, "and the channels' words are the real ones");
  assert.deepEqual(inbox.INBOX_BASELINE, { doneThisWeek: 0 }, "nothing invented is counted as done");
  assert.deepEqual(conversationsData().CONVERSATIONS, []);
  // The names the pages that have not moved still read off the window are the Inbox's own, never a seed.
  assert.equal(typeof win.IX_STORE, "object", "the session's decisions are published as before");
});

test("REGRESSION (X6-1, X6-3): the bell over a real boot names nobody the seeds invent, before and after the Inbox's read", () => {
  const bell = installNotifications(win, storage());
  assert.deepEqual(bell.feed(), [], "nothing read, nothing to say");
  assert.equal(bell.unread(), 0);
  // The Inbox's read lands with one real thread waiting on the owner: that is the bell's one row.
  const thread = { id: "t-real", real: true, needsYou: true, who: "Dani Ortiz", preview: "can I come saturday?" };
  setSurfaceValue("inbox", { ...inboxData(), THREADS: [thread] });
  assert.equal(win.INBOX_DATA?.THREADS?.[0]?.id, "t-real", "the read is published under the old name, as it lands");
  const said = JSON.stringify(bell.feed());
  assert.deepEqual(
    bell.feed().map((row) => row.id),
    ["needs:t-real"],
  );
  for (const seed of SEEDED) assert.ok(!said.includes(seed), `the bell names ${seed}, whom the seeds invent`);
});

test("a demo still draws its seeds: the store answers them in a session that declared itself one", () => {
  setSurfaceValue("inbox", undefined);
  setSurfaceValue("conversations", undefined);
  win.__DEMO_MODE = true;
  try {
    assert.equal(inboxData(), inboxSample);
    assert.equal(conversationsData(), conversationsSample);
  } finally {
    win.__DEMO_MODE = false;
  }
  assert.deepEqual(inboxData().THREADS, [], "and a real one, again, none");
});
