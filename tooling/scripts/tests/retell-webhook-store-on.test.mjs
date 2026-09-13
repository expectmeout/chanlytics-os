/**
 * The voice webhook with the store LIVE -- the half of the store guard the
 * door test cannot see.
 *
 * retell-webhook-door.test.mjs runs the handler as production runs it,
 * BLOB_SHADOW=off, and asserts that no Blob call note is attempted. But with
 * the flag off the store library short-circuits first: getThread answers
 * "unknown" and saveThread refuses, before any Blob call and without a word,
 * so "nothing reached Blob" is the library's doing and would hold with the
 * handler's `storeBackend() !== "off"` guard inverted or deleted. This file
 * runs the same handler in a process where the store is in memory (no
 * BLOB_SHADOW, no BLOB_READ_WRITE_TOKEN) and reads the caller's thread back:
 * the note is there, in the workspace's namespace, so the branch is live and
 * gated on storeBackend(). Invert the guard, or remove the branch, and this
 * file fails; the door test keeps the other half, that with the store retired
 * nothing is attempted. (A guard reduced to `if (from)` passes both -- and is
 * exactly as invisible in production, where the library's own retirement is
 * what refuses the write; there is no seam that would see it, and nothing to
 * see.)
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { openDoor, wire, CALLER } from "./_retell-webhook-world.mjs";

// The store reads its flags at import; each test file is its own process, and
// this one's store is live and in memory. openDoor() imports the handler AFTER
// these lines, on purpose.
process.env.RETELL_WEBHOOK_KEY = "badged-key-for-this-file";
process.env.RETELL_API_KEY = "api-key-for-this-file";
process.env.RETELL_FN_SECRET = "fn-secret-for-this-file";
delete process.env.BLOB_SHADOW;
delete process.env.BLOB_READ_WRITE_TOKEN;
process.env.RESEND_API_KEY = "re_test_only";
process.env.LEAD_TO = "ops@platform.test";
process.env.LEAD_FROM = "Pager <pager@platform.test>";
// No workspace is the environment's own, and the only database is the one handed in.
for (const k of ["WHATSAPP_PHONE_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];

const { setPg, store, deliver, world } = await openDoor();
after(() => setPg(null));

/** The store keys a thread on the caller's digits, no plus. */
const digits = (e164) => e164.replace(/^\+/, "");
/** How many thread objects the workspace holds -- and, being the purge, it empties the folder as it counts. */
const objectsUnder = (namespace) => store.deleteTenantThreads(namespace);

test("with the store live, call_analyzed leaves the voice note in the caller's thread under the workspace's namespace -- the branch the retired store hides", async () => {
  assert.equal(store.storeBackend(), "memory", "no BLOB_SHADOW, no token: the store is live, in this process's memory");
  const w = world();
  w.open();
  const line = wire();
  try {
    const res = await deliver("call_analyzed", w.analysed(w.callId("note")));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);

    // The note, read back the way the handler wrote it: the workspace is the
    // folder, the caller's number the file.
    const t = await store.getThread(store.threadNamespace(w.T), digits(CALLER));
    assert.equal(t.history.length, 1, "one turn: the note");
    assert.equal(t.history[0].role, "assistant");
    assert.match(t.history[0].content, /^\[voice call note \d{4}-\d{2}-\d{2}T\d{2}:\d{2}\] Caller phoned the business line\. Summary: Rosa asked for a moving quote for Tuesday\.$/);
    assert.equal(t.pausedUntil, 0, "a note is not a pause");

    // Never in the environment's namespace: the note is resolved from the same
    // agent routing the call row used, not from whoever the env belongs to.
    assert.equal((await store.getThread(store.threadNamespace(null), digits(CALLER))).history.length, 0);

    // Both notes exist while the store lives: the call_summary row for the
    // Inbox, the turn for the pre-Gate-1b bot's memory. And the owner is told.
    assert.equal(w.tables.messages.filter((m) => m.type === "call_summary").length, 1);
    assert.equal(w.tables.calls[0].message_id, w.tables.messages[0].id);
    assert.equal(line.mail().length, 1);

    // A second call from the same caller APPENDS: the thread is read before it
    // is written, so the first note stands.
    const second = w.analysed(w.callId("second"), {
      call_analysis: {
        call_summary: "Rosa confirmed Tuesday.", user_sentiment: "Positive", call_successful: true, in_voicemail: false,
        custom_analysis_data: { caller_name: "Rosa", caller_wanted: "to confirm Tuesday", outcome: "answered", follow_up: "" },
      },
    });
    assert.equal((await deliver("call_analyzed", second)).status, 200);
    const again = await store.getThread(store.threadNamespace(w.T), digits(CALLER));
    assert.equal(again.history.length, 2);
    assert.ok(again.history[1].content.endsWith("Caller phoned the business line. Summary: Rosa confirmed Tuesday."));
    assert.equal(await objectsUnder(store.threadNamespace(w.T)), 1, "one caller, one object under the workspace");
  } finally {
    line.restore();
  }
});

test("a call with no caller number leaves no store note at all: there is no thread to put it in, and the owner is still told", async () => {
  const w = world();
  w.open();
  const line = wire();
  try {
    const res = await deliver("call_analyzed", w.analysed(w.callId("anonymous"), { from_number: "" }));
    assert.deepEqual([res.status, await res.json()], [200, { ok: true }]);
    assert.equal(await objectsUnder(store.threadNamespace(w.T)), 0, "nothing under the workspace");
    assert.equal(await objectsUnder(store.threadNamespace(null)), 0, "nothing under the environment either");
    assert.equal(w.tables.calls.length, 1, "the call row still lands");
    assert.equal(w.tables.notifications.length, 1);
    assert.equal(w.tables.notifications[0].title, "Rosa phoned · 2 min", "the analysis still has her name");
    assert.equal(line.mail().length, 1);
  } finally {
    line.restore();
  }
});
