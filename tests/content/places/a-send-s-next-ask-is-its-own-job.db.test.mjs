/**
 * A send's next ask is a job the ledger takes (00728), on a real database. A send that asks again a minute on (for a new
 * version being made, 00708; for an opening it could not read) writes that ask from inside itself, while its own job is
 * still running and holds its once-only key. The next ask carried the same key (the kind, the post, the attempt), so the
 * ledger refused it as a second of the same job and the post stayed where it stood. The two kinds' keys now carry how
 * often the send has asked, where its payload says: the next ask is written beside the running one, a first send's
 * key is what it was, and two of the same ask are still one.
 *
 * Never production: it makes a workspace and jobs, and removes them.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace and jobs"
      : false;

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let db;
let T;

/** A job written as the edge writes one, in the state given: what the ledger said of it. */
async function write(kind, payload, state = "scheduled") {
  const { data, error } = await db
    .from("jobs")
    .insert({ tenant_id: T, kind, due_at: new Date(Date.now() + 60_000).toISOString(), payload, state })
    .select("dedupe_key")
    .single();
  return { key: data?.dedupe_key ?? null, refused: error?.code ?? null };
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const made = await db
    .from("tenants")
    .insert({ name: `Next ask ${RUN}`, slug: `next-ask-${RUN}` })
    .select("id")
    .single();
  assert.equal(made.error, null, made.error?.message);
  T = made.data.id;
});

after(async () => {
  if (skip || !T) return;
  await db.from("jobs").delete().eq("tenant_id", T);
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

for (const [kind, asks] of [
  ["post_publish", { wait: "1", unread: "0" }],
  ["post_publish", { wait: "0", unread: "1" }],
  ["post_google", { unread: "1" }],
]) {
  test(
    `${kind}: a running send's next ask (${JSON.stringify(asks)}) is written beside it, under a key of its own`,
    { skip },
    async () => {
      const post = randomUUID();
      const running = await write(kind, { post_id: post, attempt: "1" }, "fired");
      assert.equal(running.refused, null);
      assert.equal(running.key, `${kind}:${post}:1`, "a first send's key is what it was");
      const next = await write(kind, { post_id: post, attempt: "1", ...asks });
      assert.equal(next.refused, null, "the ledger takes it while the send that wrote it still runs");
      assert.equal(next.key, `${kind}:${post}:1:${Object.values(asks).join(":")}`);
      // Two of the same ask are still one: the second is the ledger's 23505, which a writer reads as already scheduled.
      const twice = await write(kind, { post_id: post, attempt: "1", ...asks });
      assert.equal(twice.refused, "23505");
      // And a second first send of the same post and attempt is still refused beside the running one.
      const second = await write(kind, { post_id: post, attempt: "1" });
      assert.equal(second.refused, "23505");
    },
  );
}
