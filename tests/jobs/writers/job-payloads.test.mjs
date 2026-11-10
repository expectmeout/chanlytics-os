/**
 * What a job of each kind carries is declared once (contracts JOB_PAYLOADS, decision 0115). The compiler holds the TypeScript
 * writers to it through scheduleJob, so these hold what it cannot see: the SQL functions that insert a job, and a row already
 * on the ledger. For now a claim only says what is off, by name and never by value, and the job runs as it did.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JOB_KINDS } from "../../../packages/contracts/src/shared/enums.ts";
import { JOB_PAYLOADS, payloadFieldsOff } from "../../../packages/contracts/src/jobs/payloads.ts";
import { KIND_POLICY } from "../../../packages/jobs/src/runner/kinds.ts";
import { dispatchJob } from "../../../packages/jobs/src/handlers/handlers.ts";
import { linesOf } from "../../_log-lines.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Each SQL function's job inserts: the kind it names and the fields of its jsonb_build_object, from the schema's snapshot. */
function sqlWriters() {
  const schema = fs.readFileSync(path.join(ROOT, "supabase/schema.sql"), "utf8").replace(/\r\n/g, "\n");
  const out = [];
  for (const fn of schema.split(/\n(?=CREATE FUNCTION )/)) {
    if (!fn.startsWith("CREATE FUNCTION")) continue;
    const name = /^CREATE FUNCTION public\.([a-z0-9_]+)/.exec(fn)[1];
    for (const [insert] of fn.split(/\n\n--\n/)[0].matchAll(/insert into (?:public\.)?jobs\b[\s\S]*?;/g)) {
      const kind = /'([a-z_]+)'/.exec(insert)?.[1];
      const built = /jsonb_build_object\(([\s\S]*?)\)(?:,\s*'|\s*\)|\s*from\b)/.exec(insert)?.[1] ?? "";
      out.push({ fn: name, kind, fields: [...built.matchAll(/(?:^|,\s*)'([a-z_]+)',/g)].map((m) => m[1]) });
    }
  }
  return out;
}

test("every kind has its shape, and none is left over", () => {
  assert.deepEqual(Object.keys(JOB_PAYLOADS).sort(), [...JOB_KINDS].sort());
});

test("what a kind's handler cannot run without is in its shape, and required", () => {
  for (const kind of JOB_KINDS)
    for (const id of KIND_POLICY[kind].ids) {
      const field = JOB_PAYLOADS[kind].shape[id];
      assert.ok(field, `${kind}: its handler runs on ${id}`);
      assert.equal(field.safeParse(undefined).success, false, `${kind}: ${id} may not be left out`);
    }
});

test("the SQL functions write what their kind says", () => {
  const writers = sqlWriters();
  assert.ok(writers.length >= 20, `read ${writers.length} SQL inserts; the schema holds more than that`);
  const off = [];
  for (const { fn, kind, fields } of writers) {
    // jobs_hand_out's kind is its argument, and its payload is empty.
    if (!Object.hasOwn(JOB_PAYLOADS, kind ?? "")) {
      if (fn !== "jobs_hand_out") off.push(`${fn}: no kind read`);
      continue;
    }
    for (const field of fields) if (!JOB_PAYLOADS[kind].shape[field]) off.push(`${fn} writes ${kind}.${field}`);
  }
  assert.deepEqual(off, [], "add the field to JOB_PAYLOADS, or stop writing it");
});

test("the shapes writers hand over are what their kind says", () => {
  const samples = {
    outbound_send: {
      message_id: "m",
      conversation_id: "c",
      to_email: "a@example.com",
      purpose: "outreach",
      proactive: true,
    },
    broadcast_send: { broadcast_id: "b", waits: 1, stalls: 2, resumes: 3 },
    line_provision: { line_id: "l", by: "sweep" },
    email_ingest: { source: "mailbox", mailbox_id: "x", received_id: "r" },
    lead_round_start: { round_id: "r", resume: true },
    lead_collect: { run_id: "r", seq: "p0" },
    lead_check: { round_id: "r", batch: 0, again: "n", lead_ids: ["l"] },
    push_send: { notification_id: "n" },
    push_receipts: { tickets: [{ id: "i", to: "t" }] },
    reply_read: { message_id: "m", stage: "reread-1" },
    booking_read: { received_id: "r", mailbox_id: "x", tool: null },
    event_deliver: { event_id: "e", subscriber: "s", kind: "k", lane: "1" },
    inbound_answer: { wa: {}, message_id: "m", conversation_id: "c", contact_id: "p" },
    history_import: { source: "s", seq: "1:1", connection_id: "c" },
    website_read: { url: "https://example.com" },
    preview_build: { preview_id: "p" },
    erasure_finish: { contact_id: "c", by: null },
    reply_draft: { conversation_id: "c", draft_kind: "reply", rules: "1", message_id: "m" },
    file_look: { file_id: "f", edition: "1" },
    file_fetch: { source: "s", batch: "1", items: [{ url: "https://example.com/a", ref: "r" }], rang: true },
    file_purge: { file_id: "f", why: "sweep" },
    video_digest: { file_id: "f", step: "sheet", edition: "1" },
    campaign_moments: {},
    reach_out_steps: {},
    calendar_read: {},
    google_read: {},
    texts_read: {},
    canary: {},
  };
  assert.deepEqual(Object.keys(samples).sort(), [...JOB_KINDS].sort());
  for (const [kind, payload] of Object.entries(samples))
    assert.deepEqual(payloadFieldsOff(kind, { ...payload, request_id: "r1", requeue_of: "j0" }), [], kind);
});

test("what is off is said by name, and never by what it holds", () => {
  assert.deepEqual(payloadFieldsOff("canary", { stray: "a customer's words" }), ["stray"]);
  assert.deepEqual(payloadFieldsOff("push_send", {}), ["notification_id"]);
  assert.deepEqual(payloadFieldsOff("push_send", { notification_id: 7 }), ["notification_id"]);
  assert.deepEqual(payloadFieldsOff("push_receipts", { tickets: [{ id: "i", to: "t", extra: "x" }] }), [
    "tickets.0.extra",
  ]);
  assert.deepEqual(payloadFieldsOff("canary", null), ["(the payload)"]);
  assert.deepEqual(
    payloadFieldsOff("a_kind_a_newer_build_wrote", { anything: 1 }),
    [],
    "kept for the build that knows it",
  );
});

test("a claim with a payload its kind does not say runs as it did, and one line names the fields, not the words", async () => {
  const words = "a customer's words";
  const ran = [];
  const { lines } = await linesOf(async () => {
    ran.push(
      await dispatchJob(
        {},
        { id: "j1", tenant_id: T, kind: "canary", payload: { stray: words, other: 1 }, attempts: 1 },
      ),
    );
  });
  assert.deepEqual(ran, ["done"], "it is only said, for now");
  const said = lines.filter((l) => l.event === "job_payload_unexpected");
  assert.equal(said.length, 1);
  assert.deepEqual(
    [said[0].kind, said[0].job_id, said[0].tenant_id, said[0].fields],
    ["canary", "j1", T, ["stray", "other"]],
  );
  assert.ok(!JSON.stringify(lines).includes(words), "what it held stays out of the log");
});

test("a payload that is what its kind says writes no line", async () => {
  const { lines } = await linesOf(async () => {
    await dispatchJob({}, { id: "j2", tenant_id: T, kind: "canary", payload: { request_id: "r1" }, attempts: 1 });
  });
  assert.deepEqual(
    lines.filter((l) => l.event === "job_payload_unexpected"),
    [],
  );
});
