/**
 * How a hold lands, and why the difference is worth a word -- on a real database.
 *
 * A thread has exactly ONE open escalation (`escalations_one_open`, 00004), so a
 * second reason does not queue behind the first: it replaces it. Every caller
 * that alerts a person alerts on `opened`, which means that for as long as the
 * outcome could only be "opened" or "refreshed", a thread already waiting for
 * one reason went silent when the reason changed to another. An email arriving
 * on a thread held for the carriers is how that was noticed; it was never an
 * email bug.
 *
 * What the unique index does under a concurrent insert is the whole mechanism,
 * so this belongs against Postgres rather than a double. Skipped without a
 * local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers"
      : false;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const { upsertEscalation } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

let db;
let tenantId;
const stamp = Date.now().toString(36);

/** A person with a thread of their own, so the one-open-row rule is never contended across cases. */
async function thread(tag) {
  const { data: contact, error: cErr } = await db
    .from("contacts")
    .insert({ tenant_id: tenantId, phone_e164: `+1646${String(Date.now()).slice(-7)}${tag}` })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);
  const { data: conv, error: vErr } = await db
    .from("conversations")
    .insert({ tenant_id: tenantId, contact_id: contact.id })
    .select("id")
    .single();
  if (vErr) throw new Error(vErr.message);
  return conv.id;
}
const openRow = async (id) => {
  const { data } = await db
    .from("escalations")
    .select("reason, details, state")
    .eq("conversation_id", id)
    .eq("state", "open")
    .maybeSingle();
  return data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("tenants")
    .insert({ slug: `escalation-outcome-${stamp}`, name: "escalation-outcome" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  tenantId = data.id;
});

after(async () => {
  if (skip) return;
  if (tenantId) await db.from("tenants").delete().eq("id", tenantId);
});

test(
  "a hold says whether it is new, the same one again, or a different reason wearing the same row",
  { skip },
  async () => {
    const id = await thread("1");
    assert.equal(
      await upsertEscalation(db, tenantId, id, "carriers", "The line is not approved for texting yet."),
      "opened",
    );

    // The same reason, said again with newer words: the thread is already in
    // somebody's queue for this, and telling them twice is noise.
    assert.equal(await upsertEscalation(db, tenantId, id, "carriers", "Still waiting on the carriers."), "refreshed");
    assert.deepEqual(
      await openRow(id),
      { reason: "carriers", details: "Still waiting on the carriers.", state: "open" },
      "the words move, the reason does not",
    );

    // A DIFFERENT reason. There is one open row, so this one replaces what the
    // thread was waiting for -- and a caller that only speaks on "opened" would
    // have said nothing at all about it.
    assert.equal(await upsertEscalation(db, tenantId, id, "email_review", "An email arrived."), "changed");
    assert.deepEqual(await openRow(id), { reason: "email_review", details: "An email arrived.", state: "open" });

    // And back again is a change too: it is the reason that decides, never the order.
    assert.equal(await upsertEscalation(db, tenantId, id, "carriers", "The carriers again."), "changed");

    const { count } = await db
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id);
    assert.equal(count, 1, "one row throughout: this is a replacement, not a queue");
  },
);

test(
  "a resolved hold is out of the way: the next reason opens a new row rather than reviving theirs",
  { skip },
  async () => {
    const id = await thread("2");
    await upsertEscalation(db, tenantId, id, "rate_cap", "Reply limit reached.");
    await db.from("escalations").update({ state: "resolved" }).eq("conversation_id", id).eq("state", "open");
    assert.equal(
      await upsertEscalation(db, tenantId, id, "email_review", "An email arrived."),
      "opened",
      "the partial index only guards an OPEN row, so a person who dealt with the last one is not shown its ghost",
    );
    const { count } = await db
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", id);
    assert.equal(count, 2, "the one they resolved is history, and history is kept");
  },
);

test("two holds racing for one thread: one opens, the other is told what it found", { skip }, async () => {
  const id = await thread("3");
  const [a, b] = await Promise.all([
    upsertEscalation(db, tenantId, id, "brain_error", "The receptionist hit an error."),
    upsertEscalation(db, tenantId, id, "email_review", "An email arrived."),
  ]);
  const outcomes = [a, b].sort();
  assert.equal(outcomes.filter((o) => o === "opened").length, 1, `exactly one opened: got ${a} and ${b}`);
  assert.equal(outcomes.filter((o) => o === "changed" || o === "refreshed").length, 1, "and the other found it there");
  assert.notEqual(await openRow(id), null);
});
