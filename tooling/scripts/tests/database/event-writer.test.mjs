/**
 * The ledger's one writer (packages/db events.ts), run over a database in memory: a kind files under its own category
 * at its own version, never a caller's; the subject is a row or nothing; a writer whose next step needs the row hears
 * when it did not land (recordEvent), and a best-effort one never throws (emitEvent). What the compiler holds -- each
 * kind's data, and that every kind written is declared -- is events.type-test.ts's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitEvent, recordEvent } from "@chanlytics/db";
import { fakeDb } from "../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../_log-lines.mjs";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("a kind files under its own category, at its own version, about its subject", async () => {
  const t = { events: [] };
  const db = fakeDb(t);
  await emitEvent(db, T, "line.failed", "line", "l1", { step: "buy", error: "x", provider: "twilio", by: null });
  await emitEvent(db, T, "ingest.unroutable", null, null, { channel: "email", addresses: ["a@example.com"] });
  await emitEvent(db, T, "channel.account_update", "channel", "c1", { waba_id: "w1", event: "x" });
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.category, e.version, e.subject_type, e.subject_id]),
    [
      ["line.failed", "setup", 1, "line", "l1"],
      ["ingest.unroutable", "ingest", 1, null, null],
      ["channel.account_update", "system", 1, "channel", "c1"],
    ],
    "the category and the version are the kind's, from the one table",
  );
  assert.deepEqual(t.events[0].data, { step: "buy", error: "x", provider: "twilio", by: null }, "the data as given");
});

test("a writer that needs the row hears when it did not land; a best-effort one logs it and carries on", async () => {
  const db = fakeDb({ events: [] }, { "events.insert": { message: "permission denied for table events" } });
  const r = await recordEvent(db, T, "platform.acted", "line", "l1", { action: "retry", by: "u1", by_email: null });
  assert.deepEqual(r, { error: "permission denied for table events" });
  const said = [];
  const real = console.error;
  console.error = (...a) => said.push(logLineOf(a));
  try {
    await emitEvent(db, T, "message.sent", "message", "m1", { sender: "human" });
  } finally {
    console.error = real;
  }
  assert.deepEqual(
    said.map((l) => [l.level, l.event, fieldsOf(l)]),
    [
      [
        "error",
        "emit_event_failed",
        { tenant_id: T, kind: "message.sent", error: "permission denied for table events" },
      ],
    ],
    "one logger line, the workspace and the kind named, not positional values",
  );
  const fine = await recordEvent(fakeDb({ events: [] }), T, "lead.emailed", "lead", "d1", {
    by: "reach_out",
    send_id: "s1",
  });
  assert.deepEqual(fine, { error: null });
});
