/**
 * A real session's boot seeds no thread (the wiring's second audit, X6-1, X6-3), run on the Inbox's store and the bell
 * over it, as a signed-in tab loads them (the boot's seeds on the window went with decision 0151).
 *
 * The seeds published the demo's eleven threads under INBOX_DATA in every session, and the Inbox's store answered the demo's
 * rows until its first read landed: on a real workspace the bell, the top bar's search and Ask's palette read those people as
 * customers for the moment the read took, and the bell took its first look at them. The nightly walk for invented names
 * missed it (it looked for four of them, and only after the reads had landed); this runs the boot itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";
import { surfaceValue } from "../_bridge-holds.mjs";

installStubReact();
const win = globalThis.window;
// A signed-in tab: the boot publishes nothing on the window (decision 0151), and the stores hold what their reads land.
const { inboxData, conversationsData, REAL_CHANNEL_LABELS } = await importSrc(
  "apps/dashboard/src/surfaces/inbox/store.ts",
);
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { installNotifications } = await importSrc("apps/dashboard/src/bridge/notifications.ts");

/** The people the demo's seeds invented, as they named them when demo mode went (16 Nov 2026). */
const SEEDED = [
  "Gabby Moreno",
  "Aisha Khan",
  "@thewellness.co",
  "Jordan Patel",
  "Tara Ellis",
  "Maya Rodriguez",
  "Noah Williams",
  "Kayla Brooks",
  "Marcus Webb",
  "Elena Park",
  "David Chen",
  "Selena Cho",
  "@marcus_lee",
];
const storage = () => {
  const kept = new Map();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) };
};

test("REGRESSION (X6-1): a real boot publishes no seeded thread, and the Inbox's store holds none before its read", () => {
  assert.equal(win.__DEMO_MODE, undefined, "the seeds set no demo flag: demo mode went (16 Nov 2026)");
  assert.equal(
    surfaceValue("inbox"),
    undefined,
    "REGRESSION: the demo's eleven threads were published in every session",
  );
  assert.equal(surfaceValue("conversations"), undefined);
  const inbox = inboxData();
  assert.deepEqual(inbox.THREADS, [], "before its read, no thread: not the demo's");
  assert.deepEqual(inbox.CHANNEL_LABELS, REAL_CHANNEL_LABELS, "and the channels' words are the real ones");
  assert.deepEqual(inbox.INBOX_BASELINE, { doneThisWeek: 0 }, "nothing invented is counted as done");
  assert.deepEqual(conversationsData().CONVERSATIONS, []);
});

test("REGRESSION (X6-1, X6-3): the bell over a real boot names nobody the seeds invent, before and after the Inbox's read", () => {
  const bell = installNotifications(win, storage());
  assert.deepEqual(bell.feed(), [], "nothing read, nothing to say");
  assert.equal(bell.unread(), 0);
  // The Inbox's read lands with one real thread waiting on the owner: that is the bell's one row.
  const thread = { id: "t-real", real: true, needsYou: true, who: "Dani Ortiz", preview: "can I come saturday?" };
  setSurfaceValue("inbox", { ...inboxData(), THREADS: [thread] });
  assert.equal(
    surfaceValue("inbox")?.THREADS?.[0]?.id,
    "t-real",
    "the read is published under the old name, as it lands",
  );
  const said = JSON.stringify(bell.feed());
  assert.deepEqual(
    bell.feed().map((row) => row.id),
    ["needs:t-real"],
  );
  for (const seed of SEEDED) assert.ok(!said.includes(seed), `the bell names ${seed}, whom the seeds invent`);
});
