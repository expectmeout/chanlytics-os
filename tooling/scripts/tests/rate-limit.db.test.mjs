/**
 * A limit counts a stranger (00103).
 *
 * take_rate is the one shared counter behind every dashboard limit. Its actor
 * was a uuid, and the sign-up door -- the only public write -- counts by a
 * hashed network and a hashed address, which Postgres refused, so that door
 * fell back to per-instance memory without anybody being told. The actor is a
 * label now; this proves the function takes one and counts it.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !URL_ || !KEY
  ? "no database in env"
  : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
    ? "refusing a database that is not on this machine: this suite counts hits"
    : false;

let db;
const actors = [];

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const a of actors) await db.from("rate_hits").delete().eq("actor", a);
});

const take = (bucket, actor, limit, windowMs = 60_000) =>
  db.rpc("take_rate", { p_bucket: bucket, p_actor: actor, p_limit: limit, p_window_ms: windowMs });

test("a hashed network is an actor: counted, then refused with a retry hint", { skip }, async () => {
  const actor = `ip:${randomUUID().replace(/-/g, "")}`;
  actors.push(actor);
  const a = await take("signup_ip", actor, 2);
  assert.equal(a.error, null, a.error?.message);
  assert.deepEqual(a.data, { allowed: true, used: 1 });
  const b = await take("signup_ip", actor, 2);
  assert.deepEqual(b.data, { allowed: true, used: 2 });
  const c = await take("signup_ip", actor, 2);
  assert.equal(c.error, null, c.error?.message);
  assert.equal(c.data.allowed, false);
  assert.ok(c.data.retry_after_s >= 1, "told when to try again");
});

test("a person's key is the text of their uuid, and buckets do not share a count", { skip }, async () => {
  const user = randomUUID();
  actors.push(user);
  const a = await take("reply", user, 1);
  assert.deepEqual(a.data, { allowed: true, used: 1 });
  const other = await take("whisper", user, 1);
  assert.deepEqual(other.data, { allowed: true, used: 1 }, "a different bucket, a fresh count");
  const again = await take("reply", user, 1);
  assert.equal(again.data.allowed, false);
});
