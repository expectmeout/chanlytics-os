/**
 * A workspace holds one line (00195), proved on a real Postgres: the second
 * row being set up for a tenant is refused by lines_one_live_per_tenant_idx,
 * whatever its number, and so is a retry's move to provisioning beside a live
 * one; a failed line does not hold the slot (the door refuses a buy beside it,
 * and a retry moves it back in place); the forwarded row a workspace keeps
 * sits beside its live one; another workspace is unaffected.
 *
 * Runs the way line-provision.db.test.mjs does: against the database
 * `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes lines"
      : false;

let db;
let tenantId;
let otherId;
/** Numbers of this run's own (555-01xx are fixtures; the number is live once, so nothing another run left behind is the one refused). */
const stamp = String(Date.now()).slice(-6);
const number = (n) => `+1555${stamp}${n}`;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (slug, name) => {
    const t = await db.from("tenants").insert({ slug, name }).select("id").single();
    assert.equal(t.error, null, t.error?.message);
    return t.data.id;
  };
  tenantId = await workspace(`one-line-${Date.now()}`, "One line");
  otherId = await workspace(`one-line-other-${Date.now()}`, "One line, other");
});
after(async () => {
  if (skip) return;
  // A workspace's lines go with it (on delete cascade).
  for (const id of [tenantId, otherId]) if (id) await db.from("tenants").delete().eq("id", id);
});

/** The row the buy door writes, as it writes it. */
const buy = (over) =>
  db
    .from("lines")
    .insert({
      tenant_id: tenantId,
      kind: "chanlytics",
      provider: "dry",
      voice_state: "provisioning",
      step: "subaccount",
      state_since: new Date().toISOString(),
      ...over,
    })
    .select("id, voice_state")
    .single();

test(
  "the second line being set up for a workspace is refused by the index, whatever its number, and the first stands",
  { skip },
  async () => {
    const first = await buy({ e164: number(1) });
    assert.equal(first.error, null, first.error?.message);
    const second = await buy({ e164: number(2) });
    assert.equal(
      second.error?.code,
      "23505",
      `a second provisioning row for the workspace: ${JSON.stringify(second.error)}`,
    );
    assert.match(second.error.message, /lines_one_live_per_tenant_idx/, "the workspace's index, not the number's");
    const answering = await buy({ e164: number(3), voice_state: "answering", step: null });
    assert.equal(answering.error?.code, "23505", "nor one that answers");
    const rows = await db.from("lines").select("id").eq("tenant_id", tenantId);
    assert.equal(rows.error, null, rows.error?.message);
    assert.deepEqual(
      rows.data.map((r) => r.id),
      [first.data.id],
      "one line",
    );
  },
);

test(
  "a failed line does not hold the slot, and a retry beside a live line is refused as the insert is",
  { skip },
  async () => {
    const mine = await db.from("lines").select("id").eq("tenant_id", tenantId).single();
    assert.equal(mine.error, null, mine.error?.message);
    const fail = await db
      .from("lines")
      .update({ voice_state: "failed", step: "trunk", last_error: "the carrier said no" })
      .eq("id", mine.data.id)
      .select("id")
      .single();
    assert.equal(fail.error, null, fail.error?.message);
    const next = await buy({ e164: number(4) });
    assert.equal(
      next.error,
      null,
      `beside a failed line the database admits a row; the door is what refuses it: ${next.error?.message}`,
    );
    // The retry's compare-and-swap (line-resume.ts): failed -> provisioning, beside the live one.
    const retry = await db
      .from("lines")
      .update({ voice_state: "provisioning", state_since: new Date().toISOString() })
      .eq("id", mine.data.id)
      .eq("voice_state", "failed")
      .select("id");
    assert.equal(retry.error?.code, "23505", `a retry beside a live line: ${JSON.stringify(retry.error)}`);
    assert.match(retry.error.message, /lines_one_live_per_tenant_idx/);
    const still = await db.from("lines").select("voice_state").eq("id", mine.data.id).single();
    assert.equal(still.data?.voice_state, "failed", "nothing was written");
  },
);

test("the forwarded row a workspace keeps, and another workspace's line, are not counted", { skip }, async () => {
  const kept = await db
    .from("lines")
    .insert({
      tenant_id: tenantId,
      e164: number(5),
      kind: "forwarded",
      provider: "carrier",
      forwarding_state: "instructed",
      state_since: new Date().toISOString(),
    })
    .select("id, voice_state")
    .single();
  assert.equal(kept.error, null, kept.error?.message);
  assert.equal(kept.data.voice_state, "none");
  const theirs = await db
    .from("lines")
    .insert({
      tenant_id: otherId,
      e164: number(6),
      kind: "chanlytics",
      provider: "dry",
      voice_state: "provisioning",
      step: "subaccount",
      state_since: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.equal(theirs.error, null, theirs.error?.message);
});
