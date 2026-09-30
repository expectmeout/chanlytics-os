/**
 * A search keeps the Ask thread it was planned in (00172), proved on a real
 * Postgres with real sessions: lead_search_create keeps the thread only when
 * it is the caller's own in the same workspace, and null otherwise; the view
 * carries it; a thread that goes takes the link with it, never the search.
 * And the premise the Ask route's fallback stands on: a teammate's thread is,
 * to the session client, not there at all.
 *
 * Runs the way lead-engine.db.test.mjs does, against the database `supabase
 * start` builds on this machine, and leaves nothing behind.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { takeLock } from "../../_file-lock.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and searches"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the workspace under test
let B; // another workspace
let owner; // an owner of A, who plans the searches
let partner; // a second owner of A
const users = [];
const platformDays = new Set();

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

async function memberClient(role, tenant) {
  const email = `lead-thread-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

const plan = {
  version: 1,
  card: "local_businesses",
  name: "pilates studios",
  asked: "pilates studios in Denver",
  terms: ["pilates studio"],
  area: {
    kind: "city",
    label: "Denver, CO",
    state: "CO",
    center: { lat: 39.7392, lng: -104.9903 },
    radius_m: 25_000,
    query: "Denver, CO, USA",
  },
  count: 5,
  contact: "phone",
  criteria: [],
  exclusions: [],
};

/** A thread of `who`'s own, made on their session as Ask makes one. */
const threadOf = async (who, tenant) =>
  ok(
    await who.client
      .from("ask_threads")
      .insert({ tenant_id: tenant, user_id: who.userId, title: "Pilates studios in Denver" })
      .select("id")
      .single(),
  ).id;

const create = async (who, thread) =>
  ok(
    await who.client.rpc("lead_search_create", {
      p_tenant_id: A,
      p_plan: plan,
      p_via: "ask",
      p_estimate_usd: 0.05,
      ...(thread === undefined ? {} : { p_thread_id: thread }),
    }),
  );
const threadOfSearch = async (id) =>
  ok(await db.from("lead_searches").select("thread_id").eq("id", id).single()).thread_id;

// The platform's switch list, lead_platform.tenants_on, is one array every lead suite reads, adds itself to and writes
// back: this file takes the lock for the whole of it, as lead-lists.db and the money-lock walk do (_file-lock.mjs), or
// one's write erases another's and its workspace finds its searches paused.
let releaseList;
before(async () => {
  if (skip) return;
  releaseList = await takeLock("lead-platform-list");
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-thread-${Date.now()}`, name: "Lead thread", timezone: "America/Denver" })
      .select("id")
      .single(),
  ).id;
  B = ok(
    await db
      .from("tenants")
      .insert({ slug: `lead-thread-other-${Date.now()}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  owner = await memberClient("owner", A);
  partner = await memberClient("owner", A);
  const p = ok(await db.from("lead_platform").select("tenants_on").eq("id", true).single());
  ok(
    await db
      .from("lead_platform")
      .update({ tenants_on: [...(p.tenants_on ?? []), A] })
      .eq("id", true),
  );
});

after(async () => {
  try {
    if (skip) return;
    const p = await db.from("lead_platform").select("tenants_on").eq("id", true).single();
    if (p.data)
      await db
        .from("lead_platform")
        .update({ tenants_on: (p.data.tenants_on ?? []).filter((t) => t !== A) })
        .eq("id", true);
    for (const id of [A, B].filter(Boolean)) {
      for (const r of (await db.from("lead_rounds").select("platform_day").eq("tenant_id", id)).data ?? [])
        platformDays.add(r.platform_day);
      await db.from("events").delete().eq("tenant_id", id);
      await db.from("tenants").delete().eq("id", id);
    }
    if (platformDays.size)
      await db
        .from("lead_counters")
        .delete()
        .is("tenant_id", null)
        .eq("kind", "day")
        .in("period", [...platformDays]);
    for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
  } finally {
    await releaseList?.();
  }
});

test(
  "a search keeps the thread it was planned in only when that thread is the planner's own in this workspace; the view carries it; a thread that goes takes the link, never the search",
  { skip },
  async () => {
    const mine = await threadOf(owner, A);
    const theirs = await threadOf(partner, A);
    // A thread of the owner's in another workspace: made by the service role, since they are no member there.
    const elsewhere = ok(
      await db
        .from("ask_threads")
        .insert({ tenant_id: B, user_id: owner.userId, title: "Elsewhere" })
        .select("id")
        .single(),
    ).id;

    // The premise of the Ask route's fallback: a teammate's thread is, to the session client, not there at all.
    assert.equal(ok(await partner.client.from("ask_threads").select("id").eq("id", mine).maybeSingle()), null);

    const kept = await create(owner, mine);
    assert.ok(kept.search_id, JSON.stringify(kept));
    assert.equal(await threadOfSearch(kept.search_id), mine, "the planner's own thread is kept");
    const seen = ok(
      await owner.client.from("lead_searches_view").select("thread_id").eq("id", kept.search_id).single(),
    );
    assert.equal(seen.thread_id, mine, "and the view carries it");

    for (const [thread, why] of [
      [theirs, "a teammate's thread"],
      [elsewhere, "the planner's thread in another workspace"],
      ["99999999-9999-4999-8999-999999999999", "a thread that does not exist"],
      [null, "no thread"],
      [undefined, "a call that names four arguments, as the page's does"],
    ]) {
      const r = await create(owner, thread);
      assert.ok(r.search_id, `${why}: the search still starts (${JSON.stringify(r)})`);
      assert.equal(await threadOfSearch(r.search_id), null, `${why}: null`);
    }

    // The thread goes (deleted, or purge_ask after ninety days): the search stays, its link is null.
    ok(await owner.client.from("ask_threads").delete().eq("id", mine));
    assert.equal(await threadOfSearch(kept.search_id), null);
    assert.equal(
      ok(await db.from("lead_searches").select("id").eq("id", kept.search_id)).length,
      1,
      "the search is not the thread's",
    );
  },
);
