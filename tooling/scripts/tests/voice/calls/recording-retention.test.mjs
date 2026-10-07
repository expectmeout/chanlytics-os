/**
 * Recordings are removed on the schedule the privacy page states.
 *
 * "Call recordings are kept for 90 days" had been on the privacy page since it
 * was written, and nothing in the repo deleted one. The purge is executed here
 * over rows in memory and a bucket that answers: the number it enforces is the
 * one the page prints (contracts retention.ts), the audio goes and the row
 * says so, a bucket that refuses changes nothing, and a purged call reads as
 * removed on schedule rather than as still processing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  RETENTION_DAYS,
  RECORDING_RETENTION_DAYS,
  RECORDING_PURGED_WORDS,
  toCallVM,
  toLiveCallVM,
} from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(path.join(here, "../../../../../apps/edge/lib/voice/call-recording.ts")).href);

const NOW = new Date("2026-09-12T04:00:00Z");
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const T = "t-1";
const call = (id, days, recording) => ({ id, tenant_id: T, status: "ended", started_at: daysAgo(days), recording });

test("one number: the page's, the sweep's, and the call's own words", () => {
  assert.equal(RETENTION_DAYS.call_recordings, 90);
  assert.equal(RECORDING_RETENTION_DAYS, 90);
  assert.equal(RECORDING_PURGED_WORDS, "Recording removed after 90 days; the transcript is kept");
});

test("past the retention the audio goes and the row says so; younger, failed and already-purged rows are left alone", async () => {
  const tables = {
    calls: [
      call("old-stored", 91, {
        fetch_state: "stored",
        storage_path: `${T}/calls/old-stored.wav`,
        mime: "audio/wav",
        bytes: 10,
      }),
      call("older-stored", 400, {
        fetch_state: "stored",
        storage_path: `${T}/calls/older-stored.mp3`,
        mime: "audio/mpeg",
        bytes: 10,
      }),
      call("young-stored", 89, {
        fetch_state: "stored",
        storage_path: `${T}/calls/young.wav`,
        mime: "audio/wav",
        bytes: 10,
      }),
      call("old-failed", 120, { fetch_state: "failed", attempts: 3 }),
      call("old-purged", 200, { fetch_state: "purged", purged_at: daysAgo(100) }),
      call("old-none", 200, null),
    ],
  };
  const removed = [];
  const out = await lib.purgeExpiredRecordings(fakeDb(tables), {
    now: NOW,
    remove: async (paths) => {
      removed.push(...paths);
      return { removed: paths, error: null };
    },
  });
  assert.deepEqual(out, { candidates: 2, purged: 2, error: null });
  assert.deepEqual(
    removed,
    [`${T}/calls/older-stored.mp3`, `${T}/calls/old-stored.wav`],
    "oldest first, one call to the bucket for the batch",
  );
  const by = Object.fromEntries(tables.calls.map((c) => [c.id, c.recording]));
  assert.deepEqual(
    by["old-stored"],
    { fetch_state: "purged", purged_at: NOW.toISOString(), retention_days: 90, mime: "audio/wav" },
    "the path and the size go with the audio; the marker says when, and under which rule",
  );
  assert.equal(by["older-stored"].fetch_state, "purged");
  assert.equal(by["young-stored"].fetch_state, "stored", "eighty-nine days is not ninety");
  assert.equal(by["old-failed"].fetch_state, "failed", "nothing to remove");
  assert.equal(by["old-purged"].purged_at, daysAgo(100), "not purged twice");
  assert.equal(by["old-none"], null);
  // Nothing left for the next tick, and the bucket is not asked.
  assert.deepEqual(
    await lib.purgeExpiredRecordings(fakeDb(tables), {
      now: NOW,
      remove: async () => {
        throw new Error("must not be called");
      },
    }),
    { candidates: 0, purged: 0, error: null },
  );
});

test("a bucket that refuses leaves every row as it was; the bound per tick drains a backlog oldest first; a row with no path is marked without a removal", async () => {
  const tables = {
    calls: [
      call("a", 100, { fetch_state: "stored", storage_path: "a.wav" }),
      call("b", 200, { fetch_state: "stored", storage_path: "b.wav" }),
    ],
  };
  const out = await lib.purgeExpiredRecordings(fakeDb(tables), {
    now: NOW,
    remove: async () => ({ removed: [], error: "bucket unreachable" }),
  });
  assert.deepEqual(out, { candidates: 2, purged: 0, error: "bucket unreachable" });
  assert.ok(
    tables.calls.every((c) => c.recording.fetch_state === "stored"),
    "the next tick tries the same batch again",
  );
  const one = await lib.purgeExpiredRecordings(
    fakeDb(tables),
    { now: NOW, remove: async (p) => ({ removed: p, error: null }) },
    1,
  );
  assert.deepEqual(one, { candidates: 1, purged: 1, error: null });
  assert.equal(tables.calls.find((c) => c.id === "b").recording.fetch_state, "purged", "the oldest went first");
  assert.equal(
    tables.calls.find((c) => c.id === "a").recording.fetch_state,
    "stored",
    "the rest waits for the next tick",
  );
  const bare = { calls: [call("x", 100, { fetch_state: "stored" })] };
  let asked = false;
  assert.deepEqual(
    await lib.purgeExpiredRecordings(fakeDb(bare), {
      now: NOW,
      remove: async () => {
        asked = true;
        return { removed: [], error: null };
      },
    }),
    { candidates: 1, purged: 1, error: null },
  );
  assert.equal(asked, false);
  assert.equal(bare.calls[0].recording.fetch_state, "purged");
  // A database that refuses is an error, not zero candidates.
  const broken = await lib.purgeExpiredRecordings(
    fakeDb({ calls: [] }, { "calls.select": { message: "relation is busy" } }),
    { now: NOW, remove: async () => ({ removed: [], error: null }) },
  );
  assert.deepEqual(broken, { candidates: 0, purged: 0, error: "relation is busy" });
});

test("a purged call reads as removed on schedule -- on the call and on the live board -- never as still processing", () => {
  const dto = (recording) => ({
    id: "k1",
    retell_call_id: "r",
    direction: "inbound",
    call_type: "phone_call",
    status: "ended",
    from_e164: "+19175550100",
    from_raw: null,
    to_e164: null,
    started_at: "2026-06-01T10:00:00Z",
    ended_at: "2026-06-01T10:02:00Z",
    updated_at: "2026-06-01T10:02:00Z",
    duration_ms: 120000,
    disconnection_reason: null,
    sentiment: null,
    call_successful: true,
    in_voicemail: false,
    summary: "Booked.",
    wanted: null,
    outcome: null,
    follow_up: null,
    caller_name: null,
    transcript_object: [],
    recording,
    conversation_id: null,
    contact_id: null,
    message_id: null,
    contact: null,
  });
  const vm = toCallVM(dto({ fetch_state: "purged", mime: "audio/wav" }), ZONE, NOW);
  assert.equal(vm.recordingState, "purged");
  assert.ok(vm.summary.bullets.includes(RECORDING_PURGED_WORDS), JSON.stringify(vm.summary.bullets));
  assert.equal(toLiveCallVM(dto({ fetch_state: "purged" }), ZONE, NOW).recordingState, "purged");
  assert.equal(toCallVM(dto({ fetch_state: "stored" }), ZONE, NOW).recordingState, "ready");
  assert.equal(toCallVM(dto({ fetch_state: "pending" }), ZONE, NOW).recordingState, "pending");
  assert.equal(toCallVM(dto(null), ZONE, NOW).recordingState, "none");
});

test("a purge that removed the audio but could not mark the rows says so, and does not count them", async () => {
  // The audio is gone the moment the bucket answers, so the marking is the
  // half that can still fail on its own. It went through setCallRecording,
  // which logs its error and returns void, and the outcome then reported
  // `purged: rows.length` -- the rows it had TRIED -- with error: null. A
  // database refusing every write read as a clean ninety-day purge, while the
  // calls it had emptied still said "Recording still processing" on the page.
  const tables = { calls: [call("a", 100, { fetch_state: "stored", storage_path: "a.wav" })] };
  const removed = [];
  const out = await lib.purgeExpiredRecordings(fakeDb(tables, { "calls.update": { message: "row is locked" } }), {
    now: NOW,
    remove: async (p) => {
      removed.push(...p);
      return { removed: p, error: null };
    },
  });
  assert.deepEqual(
    out,
    { candidates: 1, purged: 0, error: "row is locked" },
    "counted only what was marked, and named the failure",
  );
  assert.deepEqual(removed, ["a.wav"], "the audio did go");
  assert.equal(
    tables.calls[0].recording.fetch_state,
    "stored",
    "so the next tick picks the row up again and retries the marker",
  );
});
