/**
 * What a mailbox says about itself when an email could not be taken in -- on a
 * real database.
 *
 * The column had a clearer and no writer: `stampMailboxReceived` has always set
 * `last_error` back to null on a successful intake, and nothing ever set it. So
 * the loop is the thing worth proving, and both halves of it are writes: the
 * mark that a dead `email_ingest` job leaves (jobs settle.ts), and the next
 * email in wiping it. The tenant guard on the mark is a write too -- a job
 * naming a mailbox that is not this workspace's must change no row and must
 * not report that it did, which is exactly the shape of failure an UPDATE
 * reports as success with zero rows.
 *
 * Skipped without a local database.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { settleJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);
const { stampMailboxReceived } = await import(pathToFileURL(path.join(ROOT, "packages/db/dist/index.js")).href);

/** A reply token nobody else has: they are unique across the platform, and the database suites run side by side. */
const token = () =>
  Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(24)),
    (b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32],
  ).join("");

let db;
const stamp = Date.now().toString(36);
const tenants = {};
const mailboxes = {};

/** A dead intake, as the ledger hands it to settlement. */
const deadIntake = (tenantId, mailboxId, receivedId) => ({
  id: `job-${receivedId}`,
  kind: "email_ingest",
  tenant_id: tenantId,
  payload: { mailbox_id: mailboxId, received_id: receivedId },
});
const errorOf = async (id) => (await db.from("mailboxes").select("last_error").eq("id", id).single()).data.last_error;

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  for (const who of ["ours", "theirs"]) {
    const { data, error } = await db
      .from("tenants")
      .insert({ slug: `mailbox-health-${who}-${stamp}`, name: who })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    tenants[who] = data.id;
    const mb = await db
      .from("mailboxes")
      .insert({
        tenant_id: data.id,
        local_part: `health-${who}-${stamp}`,
        reply_token: token(),
        from_name: "Best Movers",
      })
      .select("id")
      .single();
    if (mb.error) throw new Error(mb.error.message);
    mailboxes[who] = mb.data.id;
  }
});

after(async () => {
  if (skip) return;
  for (const id of Object.values(tenants)) await db.from("tenants").delete().eq("id", id);
});

test(
  "an intake that died before storing anything leaves the mark on the mailbox, in the owner's words",
  { skip },
  async () => {
    assert.equal(await errorOf(mailboxes.ours), null, "a new mailbox carries nothing");
    const out = await settleJob(db, deadIntake(tenants.ours, mailboxes.ours, `rcv-never-${stamp}`), true);
    // No message was ever stored, so there is no thread to hold this: the
    // mailbox is the only place in the product it can be said.
    assert.deepEqual(out, [{ what: "email", changed: false, mailbox: "marked" }]);
    const said = await errorOf(mailboxes.ours);
    assert.match(said, /could not be taken in/);
    assert.match(said, /Inbox/, "it tells the owner where to look");
    assert.doesNotMatch(said, /job|lease|retr(y|ies)|error/i, "a sentence for the owner, never the job's own reason");
  },
);

test(
  "the next email taken in clears it: the mark says what is true now, not what was once true",
  { skip },
  async () => {
    assert.notEqual(await errorOf(mailboxes.ours), null, "left standing by the case above");
    const at = new Date().toISOString();
    await stampMailboxReceived(db, mailboxes.ours, at);
    const { data } = await db
      .from("mailboxes")
      .select("last_error, last_received_at")
      .eq("id", mailboxes.ours)
      .single();
    // The stamp comes back in Postgres's own spelling of the instant, so they are
    // compared as instants; what matters is that ONE statement moved both, so
    // neither can be left behind by the other.
    assert.equal(data.last_error, null, "the trouble is cleared by mail flowing again, without anybody doing anything");
    assert.equal(Date.parse(data.last_received_at), Date.parse(at));
  },
);

test("a job naming another workspace's mailbox changes nothing, and does not report a mark", { skip }, async () => {
  const before = await errorOf(mailboxes.theirs);
  // The id is real and the workspace is wrong, which is the only interesting
  // version of this: the filter, not the lookup, is what refuses it.
  const out = await settleJob(db, deadIntake(tenants.ours, mailboxes.theirs, `rcv-cross-${stamp}`), true);
  assert.deepEqual(
    out,
    [{ what: "email", changed: false, mailbox: "gone" }],
    "an UPDATE that matched nothing comes back without an error: the rows are counted, so this cannot read as done",
  );
  assert.equal(await errorOf(mailboxes.theirs), before, "and the other workspace's mailbox is untouched");
});

test(
  "a mailbox deleted since the webhook is gone, not failed, and settlement carries on either way",
  { skip },
  async () => {
    const out = await settleJob(
      db,
      deadIntake(tenants.ours, "00000000-0000-4000-8000-000000000000", `rcv-gone-${stamp}`),
      true,
    );
    assert.deepEqual(out, [{ what: "email", changed: false, mailbox: "gone" }]);
  },
);
