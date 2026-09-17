/**
 * Somebody asks for a workspace while the door is shut -- on a real database.
 *
 * THE DEFECT THIS EXISTS FOR. `joinWaitlist` was one `upsert` with
 * `onConflict: "email"`, and `public.waitlist`'s only unique index is on
 * `lower(email)` -- an EXPRESSION, which PostgREST cannot name in an ON CONFLICT
 * clause. Every call came back 42P10, "there is no unique or exclusion
 * constraint matching the ON CONFLICT specification"; the error was tested with
 * `/duplicate|unique/i`, that sentence contains "unique", and so it was
 * swallowed as a duplicate. The route logged `waitlist_join`, the page said
 * "you are on the list", and the list was empty. Nobody ever joined.
 *
 * None of that is visible to a double: what makes two submissions one person is
 * an index on an expression, and what the wrong ON CONFLICT does is a Postgres
 * error nothing in memory raises. So this runs against Postgres.
 *
 * Skipped without a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite writes customers"
    : false;

// What the dashboard's service client reads. Set before the import below, which
// builds it on first call.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_;

const { joinWaitlist } = skip ? { joinWaitlist: null } : await import("../../../apps/dashboard/src/server/signup.ts");
const { platformWaitlist } = skip ? { platformWaitlist: null } : await import("../../../apps/dashboard/src/server/platform.ts");

let db;
const stamp = Date.now().toString(36);
const addr = (who) => `${who}-${stamp}@example.com`;
const rowFor = async (email) => {
  const { data } = await db.from("waitlist").select("id, email, business, source, created_at, invited_at").eq("email", email.toLowerCase()).maybeSingle();
  return data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  await db.from("waitlist").delete().like("email", `%-${stamp}@example.com`);
});

test("REGRESSION: somebody who asks is actually on the list", { skip }, async () => {
  const email = addr("ana");
  await joinWaitlist({ email, name: "Melany's Beauty Salon", source: "https://chanlytics.com/pricing?utm=x" });
  const row = await rowFor(email);
  assert.ok(row, "the row this whole table exists for");
  assert.equal(row.business, "Melany's Beauty Salon");
  assert.equal(row.source, "https://chanlytics.com/pricing?utm=x");
  assert.equal(row.invited_at, null, "null is what puts them IN the queue");
});

test("the address is stored in the spelling the index judges by", { skip }, async () => {
  const email = addr("BEA");
  await joinWaitlist({ email: `  ${email.toUpperCase()} `, name: "Bea" });
  const row = await rowFor(email);
  assert.ok(row, "lower-cased and trimmed by the function, not by whoever calls it");
  assert.equal(row.email, email.toLowerCase());
});

test("asking twice is one person: their place is kept and what they told us is the newer answer", { skip }, async () => {
  const email = addr("cass");
  await joinWaitlist({ email, name: "Firts Try", source: "https://chanlytics.com/" });
  const first = await rowFor(email);

  // A different case is the SAME person -- that is what the expression index is
  // for, and it is the case that silently made two rows if it were on `email`.
  await joinWaitlist({ email: email.toUpperCase(), name: "First Try, spelled right", source: "https://chanlytics.com/pricing" });

  const { data: all } = await db.from("waitlist").select("id").ilike("email", email.replace(/[_%]/g, "\\$&"));
  assert.equal(all.length, 1, "one row per address, whatever case they typed");
  const again = await rowFor(email);
  assert.equal(again.id, first.id);
  assert.equal(again.created_at, first.created_at, "their place in the queue is their created_at: asking twice must not cost it");
  assert.equal(again.business, "First Try, spelled right", "the correction is the newer answer");
  assert.equal(again.source, "https://chanlytics.com/pricing");
});

test("somebody already invited is left entirely alone: a repeat is not a re-join", { skip }, async () => {
  const email = addr("dev");
  await joinWaitlist({ email, name: "Before" });
  const invitedAt = new Date("2026-09-01T10:00:00.000Z").toISOString();
  await db.from("waitlist").update({ invited_at: invitedAt }).eq("email", email);

  await joinWaitlist({ email, name: "After" });
  const row = await rowFor(email);
  assert.equal(row.business, "Before", "their row is history now, and history is not rewritten");
  assert.equal(Date.parse(row.invited_at), Date.parse(invitedAt), "and they are not put back in the queue");
});

test("the queue is read oldest first, and only the ones still waiting", { skip }, async () => {
  // The only query this table has (00088), and the one the back office runs.
  const { data } = await db.from("waitlist")
    .select("email, created_at")
    .is("invited_at", null)
    .like("email", `%-${stamp}@example.com`)
    .order("created_at", { ascending: true });
  const ours = data.map((r) => r.email);
  assert.deepEqual(ours, [addr("ana"), addr("bea"), addr("cass")].map((e) => e.toLowerCase()),
    "in the order they asked, and the invited one is not among them");
});

test("what the back office reads is what a browser gets, and it carries nobody's invited_by", { skip }, async () => {
  // The projection is PostgREST's, so it is proved where PostgREST is: the
  // in-memory double hands back whole rows whatever the select asked for.
  const q = await platformWaitlist({ db });
  const mine = q.waiting.filter((r) => r.email.endsWith(`-${stamp}@example.com`));
  assert.ok(mine.length >= 3, "the ones this file put there are in the queue the back office reads");
  assert.deepEqual(Object.keys(mine[0]).sort(), ["business", "created_at", "email", "id", "source"],
    "who invited whom is not the page's business, and never leaves the server");
  assert.ok(typeof q.total === "number" && q.total >= mine.length);
});
