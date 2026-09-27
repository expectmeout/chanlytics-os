/**
 * The ledger's finished rows leave on the contract's days, and nothing else does, on a real database.
 *
 * Nothing purged `jobs` until 00215, so every send left a row holding its number and words. purge_jobs deletes done
 * and canceled rows RETENTION_DAYS.jobs_finished after they last changed and failed ones after jobs_failed; a
 * scheduled or fired row is the live ledger and is never read. A finished outbound_send whose message is still
 * queued stays, since the reach-out sender may yet adopt it; its message id is cast only when it is one, so a scrubbed
 * payload (no id) or a malformed one neither stops the purge nor keeps the row. Seeded a day either side of each
 * boundary and run with its DEFAULTS, so a default that drifts from the contract fails here. Skipped without a local
 * database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { RETENTION_DAYS } from "@chanlytics/contracts";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite deletes jobs"
      : false;

let db;
let tenantId;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `jobs-purge-${Date.now()}`, name: "Jobs purge" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip || !tenantId) return;
  await db.from("tenants").delete().eq("id", tenantId);
});

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const hourAhead = () => new Date(Date.now() + 3_600_000).toISOString();
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A job row as the ledger leaves it, last changed `days` ago. */
const job = (label, state, days, kind = "push_send", payload = { notification_id: crypto.randomUUID() }) => ({
  id: crypto.randomUUID(),
  tenant_id: tenantId,
  kind,
  state,
  due_at: daysAgo(days),
  payload: { ...payload, label },
  updated_at: daysAgo(days),
});

async function purgeAndRead(rows) {
  ok(await db.from("jobs").insert(rows));
  const n = ok(await db.rpc("purge_jobs"));
  assert.ok(typeof n === "number" && n >= 0, `purge_jobs answers a count, got ${n}`);
  const left = ok(
    await db
      .from("jobs")
      .select("payload")
      .in(
        "id",
        rows.map((r) => r.id),
      ),
  );
  return left.map((r) => r.payload.label).sort();
}

test(
  "done and canceled jobs leave after the contract's week, failed ones after its ninety days, and a live row never",
  { skip },
  async () => {
    const week = RETENTION_DAYS.jobs_finished;
    const failed = RETENTION_DAYS.jobs_failed;
    const left = await purgeAndRead([
      job("done, past the week", "done", week + 1),
      job("done, inside the week", "done", week - 1),
      job("canceled, past the week", "canceled", week + 1),
      job("canceled, inside the week", "canceled", week - 1),
      job("failed, past the week but inside its days", "failed", failed - 1),
      job("failed, past its days", "failed", failed + 1),
      // Live rows last changed a year ago: still the ledger's. Due ahead and leased ahead, so no other suite's
      // backlog or claim sees them while they exist.
      { ...job("scheduled, a year old", "scheduled", 400), due_at: hourAhead() },
      { ...job("fired, a year old", "fired", 400), due_at: hourAhead(), lease_until: hourAhead() },
    ]);
    assert.deepEqual(left, [
      "canceled, inside the week",
      "done, inside the week",
      "failed, past the week but inside its days",
      "fired, a year old",
      "scheduled, a year old",
    ]);
  },
);

test(
  "a finished send whose message is still queued stays; one whose message went, or whose payload names no message, goes",
  { skip },
  async () => {
    const contact = ok(
      await db
        .from("contacts")
        .insert({ tenant_id: tenantId, email: `purge-${Date.now()}@example.com` })
        .select("id")
        .single(),
    );
    const conv = ok(
      await db.from("conversations").insert({ tenant_id: tenantId, contact_id: contact.id }).select("id").single(),
    );
    const message = async (status) =>
      ok(
        await db
          .from("messages")
          .insert({
            tenant_id: tenantId,
            conversation_id: conv.id,
            channel: "sms",
            direction: "outbound",
            sender: "ai",
            body: "Your table is at eight.",
            status,
          })
          .select("id")
          .single(),
      ).id;
    const queued = await message("queued");
    const sent = await message("sent");
    const old = RETENTION_DAYS.jobs_finished + 30;
    const send = (label, payload) => job(label, "done", old, "outbound_send", payload);
    const left = await purgeAndRead([
      send("its message is still queued", { message_id: queued, conversation_id: conv.id }),
      send("its message went", { message_id: sent, conversation_id: conv.id }),
      send("scrubbed by an erasure", { scrubbed_at: daysAgo(old), reason: "contact erased" }),
      send("a message id that is not one", { message_id: "not-a-message" }),
      // Another kind that happens to carry the queued message's id is not the send that owns it.
      job("another kind naming the message", "done", old, "push_send", { message_id: queued }),
    ]);
    assert.deepEqual(left, ["its message is still queued"]);
  },
);
