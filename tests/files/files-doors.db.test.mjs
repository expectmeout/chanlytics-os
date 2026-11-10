/**
 * A business's files on a real database (00551, decision 0099), with real sessions: who may use each door (a viewer reads and
 * changes nothing, an owner both, a stranger finds nothing), the service's doors shut to a member, the copy's id and the
 * fingerprint out of a member's reach, a row only from its bytes proven until they are gone, one row a picture, a removed one not
 * brought back, the owner's word kept over the look's, a good look kept over a failed try, and the job each step leaves. And the
 * library searched where it is kept (00597 files_found), in two workspaces of its own, so no other test's files are counted.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
let db;
let A;
let B;
let C;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, tenant, role) {
  const email = `files-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

const started = (who, id, tenant = A) => as[who].client.rpc("file_start", { p_tenant_id: tenant, p_id: id });
/** The one door, as the route (an upload's proof) or the edge (an import's) calls it. */
const found = (client, id, fingerprint, over = {}) =>
  client.rpc("file_found", {
    p_tenant_id: A,
    p_id: id,
    p_status: "inbox",
    p_source: "website",
    p_source_ref: "https://harbor.example/a.jpg",
    p_name: "from-site",
    p_mime: "image/jpeg",
    p_bytes: 2000,
    p_fingerprint: fingerprint,
    p_width: 1000,
    p_height: 1000,
    p_shows: null,
    p_edition: 1,
    ...over,
  });
/** An upload proven: what the route asks, on the service role, for the member it was for. */
const uploaded = (who, id, fingerprint, over = {}) =>
  found(db, id, fingerprint, {
    p_status: "filed",
    p_source: "upload",
    p_source_ref: null,
    p_name: "photo",
    p_bytes: 1000,
    p_width: 1200,
    p_height: 800,
    p_actor: as[who].id,
    ...over,
  });
const keepLook = (id, over = {}) =>
  db.rpc("file_look_keep", {
    p_tenant_id: A,
    p_id: id,
    p_status: "done",
    p_edition: 1,
    p_look: { line: "A shop." },
    p_name: "storefront-dusk",
    p_shows: "storefront",
    ...over,
  });
const change = (id, over) => as.owner.client.rpc("file_change", { p_tenant_id: A, p_id: id, ...over });
const remove = (id) => as.owner.client.rpc("file_remove", { p_tenant_id: A, p_id: id });
const rowOf = async (id) => ok(await db.from("files").select("*").eq("id", id).maybeSingle(), "the row");
const eventsOf = async (kind, fileId) =>
  ok(
    await db.from("events").select("kind, data").eq("tenant_id", A).eq("kind", kind).eq("data->>file_id", fileId),
    "events",
  );
const jobsOf = async (kind, id) =>
  ok(
    await db
      .from("jobs")
      .select("kind, payload, due_at, dedupe_key")
      .eq("tenant_id", A)
      .eq("kind", kind)
      .eq("payload->>file_id", id),
    "jobs",
  );
/** A purge due now: a removal's, not the one every upload leaves itself for a day on. */
const purgesNow = async (id) =>
  (await jobsOf("file_purge", id)).filter((j) => Date.parse(j.due_at) < Date.now() + 3_600_000);

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Files A ${stamp}`, slug: `files-a-${stamp}` },
        { name: `Files B ${stamp}`, slug: `files-b-${stamp}` },
        { name: `Files C ${stamp}`, slug: `files-c-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  C = tenants[2].id;
  as.owner = await member("owner", A, "owner");
  as.viewer = await member("viewer", A, "viewer");
  as.stranger = await member("stranger", B, "owner");
  as.ownerOfC = await member("owner-of-c", C, "owner");
});

after(async () => {
  if (skip) return;
  const all = [A, B, C];
  await db.from("jobs").delete().in("tenant_id", all);
  await db.from("events").delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("files_let_go").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id);
});

test("a start holds no row and no name: only the purge that lets its bytes go, a day on", { skip }, async () => {
  const id = randomUUID();
  ok(await started("owner", id), "start");
  assert.equal(await rowOf(id), null);
  const purges = await jobsOf("file_purge", id);
  assert.equal(purges.length, 1);
  assert.ok(Date.parse(purges[0].due_at) > Date.now() + 23 * 3_600_000, "a day on");
  assert.equal(purges[0].payload.why, "start");
});

test(
  "an upload proven: a row, filed, under who sent it, with its look due now and on the record",
  { skip },
  async () => {
    const id = randomUUID();
    ok(await started("owner", id), "start");
    assert.deepEqual(ok(await uploaded("owner", id, `fp-${id}`, { p_name: `front-door-${stamp}` }), "done"), {
      fate: "kept",
      file_id: id,
    });
    const row = await rowOf(id);
    assert.equal(row.status, "filed");
    assert.equal(row.name, `front-door-${stamp}`);
    assert.equal(row.width, 1200);
    assert.equal(row.created_by, as.owner.id);
    assert.equal(row.look_status, "waiting");
    const looks = await jobsOf("file_look", id);
    assert.equal(looks.length, 1);
    assert.equal(looks[0].dedupe_key, `file_look:${id}:1`, "once a file and an edition");
    assert.ok(Date.parse(looks[0].due_at) <= Date.now() + 1000, "someone is watching this one");
    assert.equal((await eventsOf("file.added", id)).length, 1);
  },
);

test("a done asked twice answers the same, and is not its own twin", { skip }, async () => {
  const id = randomUUID();
  const fp = `fp-${id}`;
  ok(await uploaded("owner", id, fp), "first");
  assert.deepEqual(ok(await uploaded("owner", id, fp), "second"), { fate: "kept", file_id: id });
  assert.equal((await jobsOf("file_look", id)).length, 1);
});

test("a name already taken takes the next free one", { skip }, async () => {
  const name = `same-name-${stamp}`;
  const first = randomUUID();
  const second = randomUUID();
  ok(await uploaded("owner", first, `fp-${first}`, { p_name: name }), "first");
  ok(await uploaded("owner", second, `fp-${second}`, { p_name: name }), "second");
  assert.equal((await rowOf(first)).name, name);
  assert.equal((await rowOf(second)).name, `${name}-2`);
});

test("the same photo twice is one file: the answer names the first, and no second row is made", { skip }, async () => {
  const first = randomUUID();
  const second = randomUUID();
  const fp = `fp-twin-${stamp}`;
  ok(await uploaded("owner", first, fp), "first");
  assert.deepEqual(ok(await uploaded("owner", second, fp), "second"), { fate: "here", file_id: first });
  assert.equal(await rowOf(second), null);
  assert.equal((await jobsOf("file_look", second)).length, 0);
});

test("an upload is the owner's word for a twin that waited or was set aside", { skip }, async () => {
  for (const status of ["inbox", "set_aside"]) {
    const id = randomUUID();
    const fp = `fp-word-${status}-${stamp}`;
    ok(await found(db, id, fp), "found");
    if (status === "set_aside") ok(await change(id, { p_status: "set_aside" }), "set aside");
    assert.deepEqual(ok(await uploaded("owner", randomUUID(), fp), "uploaded"), { fate: "here", file_id: id });
    assert.equal((await rowOf(id)).status, "filed", status);
  }
});

test(
  "a profile files a twin that waited, and takes over from what a listing offered; an import that only offers moves nothing",
  { skip },
  async () => {
    const id = randomUUID();
    const fp = `fp-listed-${stamp}`;
    ok(await found(db, id, fp, { p_source: "google_listing", p_source_ref: "places/p/photos/a" }), "listed");
    assert.equal(ok(await found(db, randomUUID(), fp), "the website too").fate, "here");
    let row = await rowOf(id);
    assert.equal(row.status, "inbox");
    assert.equal(row.source, "google_listing");
    ok(
      await found(db, randomUUID(), fp, { p_source: "google_profile", p_source_ref: "m/1", p_status: "filed" }),
      "profile",
    );
    row = await rowOf(id);
    assert.equal(row.status, "filed");
    assert.equal(row.source, "google_profile");
    assert.equal(row.source_ref, "m/1");
  },
);

test("a viewer reads and changes nothing, and a stranger finds nothing", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`, { p_name: `shared-${stamp}` }), "made");
  assert.equal((await started("viewer", randomUUID())).error?.code, "42501");
  assert.equal((await started("stranger", randomUUID())).error?.code, "42501");
  for (const who of ["viewer", "stranger"]) {
    const { client } = as[who];
    assert.equal((await client.rpc("file_remove", { p_tenant_id: A, p_id: id })).error?.code, "42501", who);
    assert.equal(
      (await client.rpc("file_change", { p_tenant_id: A, p_id: id, p_shows: "team" })).error?.code,
      "42501",
      who,
    );
    assert.equal((await client.rpc("file_keep_many", { p_tenant_id: A, p_ids: [id] })).error?.code, "42501", who);
  }
  assert.equal(ok(await as.viewer.client.from("files").select("id, name").eq("id", id), "viewer reads").length, 1);
  assert.equal(ok(await as.stranger.client.from("files").select("id, name").eq("id", id), "stranger reads").length, 0);
});

test(
  "a member writes no row, reaches no service door, and reads neither the copy nor the fingerprint",
  { skip },
  async () => {
    const { client } = as.owner;
    const id = randomUUID();
    ok(await uploaded("owner", id, `fp-${id}`), "made");
    assert.ok((await client.from("files").update({ name: "changed" }).eq("id", id)).error, "no update");
    assert.ok((await client.from("files").select("claude_copy").eq("id", id)).error, "no copy");
    assert.ok((await client.from("files").select("fingerprint").eq("id", id)).error, "no fingerprint");
    assert.ok((await client.from("files_let_go").select("fingerprint")).error, "nothing of what was let go");
    assert.ok((await found(client, randomUUID(), "fp-mine")).error, "no session says what bytes are");
    assert.ok((await client.rpc("file_listing_aside", { p_tenant_id: A })).error, "no aside");
    assert.ok(
      (
        await client.rpc("file_look_keep", {
          p_tenant_id: A,
          p_id: id,
          p_status: "done",
          p_edition: 1,
          p_look: {},
          p_name: "x",
          p_shows: null,
        })
      ).error,
      "no look",
    );
    assert.ok((await client.rpc("file_purged", { p_tenant_id: A, p_id: id })).error, "no purge");
  },
);

test(
  "an import brings a file once: not twice, and not back once it was removed, even before its purge",
  { skip },
  async () => {
    const id = randomUUID();
    const fp = `fp-found-${stamp}`;
    assert.deepEqual(ok(await found(db, id, fp), "first"), { fate: "kept", file_id: id });
    assert.equal((await rowOf(id)).status, "inbox");
    assert.equal((await jobsOf("file_look", id)).length, 1);
    assert.equal((await eventsOf("file.added", id)).length, 0, "an import is on its own line, not 200 of these");
    assert.deepEqual(ok(await found(db, randomUUID(), fp), "again"), { fate: "here", file_id: id });
    ok(await remove(id), "removed");
    assert.equal((await purgesNow(id)).length, 1);
    assert.equal((await purgesNow(id))[0].payload.why, "remove");
    const again = randomUUID();
    assert.deepEqual(ok(await found(db, again, fp), "before its purge"), { fate: "here", file_id: null });
    assert.equal(await rowOf(again), null);
  },
);

test("a person may add again what they removed", { skip }, async () => {
  const id = randomUUID();
  const fp = `fp-again-${stamp}`;
  ok(await uploaded("owner", id, fp, { p_name: `again-${stamp}` }), "first");
  ok(await remove(id), "removed");
  const back = randomUUID();
  assert.deepEqual(ok(await uploaded("owner", back, fp), "added again"), { fate: "kept", file_id: back });
});

test("a purge takes the row, and only what was removed; the fingerprint alone stays", { skip }, async () => {
  const id = randomUUID();
  const fp = `fp-purged-${stamp}`;
  ok(await found(db, id, fp, { p_name: `showed-${stamp}` }), "found");
  ok(await keepLook(id, { p_name: `showed-more-${stamp}` }), "looked");
  ok(await db.rpc("file_purged", { p_tenant_id: A, p_id: id }), "a purge of a live file");
  assert.ok(await rowOf(id), "a file nobody removed is left alone");
  ok(await remove(id), "removed");
  ok(await db.rpc("file_purged", { p_tenant_id: A, p_id: id }), "purged");
  assert.equal(await rowOf(id), null);
  const kept = ok(await db.from("files_let_go").select("*").eq("tenant_id", A).eq("fingerprint", fp), "let go");
  assert.equal(kept.length, 1);
  assert.deepEqual(Object.keys(kept[0]).sort(), ["fingerprint", "let_go_at", "tenant_id"]);
  assert.deepEqual(ok(await found(db, randomUUID(), fp), "not brought back"), { fate: "here", file_id: null });
});

test("a workspace at its number keeps no more, and a start says so first", { skip }, async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    tenant_id: C,
    status: "filed",
    source: "website",
    name: `n-${i}`,
    mime: "image/jpeg",
    bytes: 1,
    fingerprint: `fp-${i}`,
  }));
  ok(await db.from("files").insert(rows), "a full workspace");
  const start = await as.ownerOfC.client.rpc("file_start", { p_tenant_id: C, p_id: randomUUID() });
  assert.equal(start.error?.code, "22023");
  const id = randomUUID();
  assert.deepEqual(ok(await found(db, id, "fp-one-more", { p_tenant_id: C }), "one more"), {
    fate: "full",
    file_id: null,
  });
  assert.equal(await rowOf(id), null);
  // What is here already is still answered as here: full is no reason to lie about a twin.
  assert.equal(ok(await found(db, randomUUID(), "fp-3", { p_tenant_id: C }), "a twin").fate, "here");
});

test("an import's looks are paced, an upload's is not, so 200 photos are not 200 late rows", { skip }, async () => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const id of ids) ok(await found(db, id, `fp-paced-${id}`), "found");
  const due = [];
  for (const id of ids) due.push(Date.parse((await jobsOf("file_look", id))[0].due_at));
  assert.ok(due[1] >= due[0] + 1500, `${due[1] - due[0]} ms apart`);
  assert.ok(due[2] >= due[1] + 1500, `${due[2] - due[1]} ms apart`);
});

test("a kind we do not keep is refused by the table", { skip }, async () => {
  const r = await found(db, randomUUID(), `fp-vector-${stamp}`, { p_mime: "image/svg+xml" });
  assert.equal(r.error?.code, "23514");
});

test("a name is any language's words, and nothing that means something on a page or in a path", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`, { p_name: `año-nuevo-${stamp}` }), "made");
  assert.equal((await rowOf(id)).name, `año-nuevo-${stamp}`);
  for (const name of [
    "<b>bold",
    "a/b",
    "a.b",
    "a b",
    'quote"d',
    "it's",
    "a&b",
    "UPPER",
    "-edge",
    "edge-",
    "dou--ble",
  ]) {
    assert.equal((await change(id, { p_name: name })).error?.code, "23514", name);
  }
  assert.equal((await rowOf(id)).name, `año-nuevo-${stamp}`);
});

test("what the look says fills what no one has said, and a person's word stays over it", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`, { p_name: "img-2041" }), "made");
  ok(await keepLook(id, { p_name: `storefront-${stamp}` }), "first look");
  let row = await rowOf(id);
  assert.equal(row.name, `storefront-${stamp}`);
  assert.equal(row.shows, "storefront");
  assert.equal(row.who_in_it, "not_asked", "the look counts people, and only a person says who agreed");
  assert.equal(row.look_status, "done");
  ok(await change(id, { p_name: `my-word-${stamp}`, p_shows: "team", p_who_in_it: "agreed" }), "the owner's word");
  ok(await keepLook(id, { p_name: "other-name", p_shows: "work" }), "second look");
  row = await rowOf(id);
  assert.equal(row.name, `my-word-${stamp}`);
  assert.equal(row.shows, "team");
  assert.equal(row.who_in_it, "agreed");
  const [said] = (await eventsOf("file.changed", id)).slice(-1);
  assert.deepEqual(said.data.said, { name: `my-word-${stamp}`, shows: "team", who_in_it: "agreed" });
  assert.equal(said.data.by, as.owner.id);
});

test("not asked is where a file starts, never what a person says", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`), "made");
  assert.equal((await change(id, { p_who_in_it: "not_asked" })).error?.code, "22023");
});

test("a later look renames nothing, and a failed try leaves a good look as it was", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`, { p_name: `first-name-${stamp}` }), "made");
  ok(await keepLook(id, { p_name: `looked-${stamp}`, p_look: { line: "A good look." } }), "first look");
  ok(await keepLook(id, { p_name: `renamed-${stamp}`, p_edition: 2, p_look: { line: "Read again." } }), "read again");
  let row = await rowOf(id);
  assert.equal(row.name, `looked-${stamp}`, "people and Ask call it this now");
  assert.equal(row.look.line, "Read again.");
  assert.equal(row.look_edition, 2);
  const tried = Date.parse(row.looked_at);
  ok(await keepLook(id, { p_status: "failed", p_edition: 3, p_look: null, p_name: null, p_shows: null }), "failed");
  row = await rowOf(id);
  assert.equal(row.look.line, "Read again.");
  assert.equal(row.look_status, "done");
  assert.equal(row.look_edition, 2, "so a raised edition still reads it");
  assert.ok(Date.parse(row.looked_at) >= tried, "and the sweep leaves it for a day");
});

test("a failed first look says so, under the edition it was tried at", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`), "made");
  ok(await keepLook(id, { p_status: "failed", p_look: null, p_name: null, p_shows: null }), "failed");
  const row = await rowOf(id);
  assert.equal(row.look_status, "failed");
  assert.equal(row.look_edition, 1);
  assert.equal(row.status, "filed");
});

test("a name another file holds is refused, in the door's words", { skip }, async () => {
  const one = randomUUID();
  const two = randomUUID();
  ok(await uploaded("owner", one, `fp-${one}`, { p_name: `held-${stamp}` }), "one");
  ok(await uploaded("owner", two, `fp-${two}`, { p_name: `other-${stamp}` }), "two");
  assert.equal((await change(two, { p_name: `held-${stamp}` })).error?.code, "22023");
});

test("a look the model would not give sends a filed picture to a person, the first time only", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`, { p_name: `refused-one-${stamp}` }), "made");
  const refused = { p_status: "refused", p_look: null, p_name: null, p_shows: null };
  ok(await keepLook(id, refused), "refused");
  let row = await rowOf(id);
  assert.equal(row.look_status, "refused");
  assert.equal(row.status, "inbox");
  assert.equal(row.name, `refused-one-${stamp}`);

  const looked = randomUUID();
  ok(await uploaded("owner", looked, `fp-${looked}`), "another");
  ok(await keepLook(looked, { p_name: `looked-${stamp}-2` }), "looked");
  ok(await keepLook(looked, refused), "refused on a second read");
  row = await rowOf(looked);
  assert.equal(row.status, "filed", "a photo in use does not leave for a re-read's refusal");
  assert.equal(row.look_status, "done", "and what it was read to show still stands");
  assert.equal(row.look.line, "A shop.");
});

test("the Inbox's one press: what waits, in this workspace, is filed; one event says how many", { skip }, async () => {
  const waiting = [randomUUID(), randomUUID()];
  for (const id of waiting) ok(await found(db, id, `fp-${id}`), "found");
  const filed = randomUUID();
  ok(await uploaded("owner", filed, `fp-${filed}`), "filed");
  const aside = randomUUID();
  ok(await found(db, aside, `fp-${aside}`), "found");
  ok(await change(aside, { p_status: "set_aside" }), "set aside");
  const said = await as.owner.client.rpc("file_keep_many", {
    p_tenant_id: A,
    p_ids: [...waiting, filed, aside, randomUUID()],
  });
  assert.equal(ok(said, "kept"), 2);
  for (const id of waiting) assert.equal((await rowOf(id)).status, "filed");
  assert.equal((await rowOf(aside)).status, "set_aside", "a word already said stays");
  const events = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "file.kept"), "events");
  assert.ok(events.some((e) => e.data.count === 2 && e.data.by === as.owner.id));
});

test("a wrong listing's photos leave the Inbox, and what a person touched or kept stays", { skip }, async () => {
  const offered = randomUUID();
  const named = randomUUID();
  const kept = randomUUID();
  const fromSite = randomUUID();
  const listing = { p_source: "google_listing", p_source_ref: "places/p/photos/a" };
  for (const id of [offered, named, kept]) ok(await found(db, id, `fp-${id}`, listing), "listed");
  ok(await found(db, fromSite, `fp-${fromSite}`), "from the site");
  ok(await change(named, { p_name: `its-name-${stamp}` }), "named");
  ok(await change(kept, { p_status: "filed" }), "kept");
  assert.ok(ok(await db.rpc("file_listing_aside", { p_tenant_id: A }), "aside") >= 1);
  assert.equal((await rowOf(offered)).status, "set_aside");
  assert.equal((await rowOf(named)).status, "inbox");
  assert.equal((await rowOf(kept)).status, "filed");
  assert.equal((await rowOf(fromSite)).status, "inbox");
  const said = ok(await db.from("events").select("data").eq("tenant_id", A).eq("kind", "file.set_aside"), "events");
  assert.ok(said.length >= 1, "nobody pressed this, so the record says where they went");
});

test("a removal is said once and asks its purge, and a second press finds it gone", { skip }, async () => {
  const id = randomUUID();
  ok(await uploaded("owner", id, `fp-${id}`), "made");
  ok(await remove(id), "removed");
  assert.equal((await eventsOf("file.removed", id)).length, 1);
  assert.equal((await remove(id)).error?.code, "P0002");
});

/** What Ask made, as the route keeps it (00553), on the service role. */
const made = (id, fingerprint, over = {}) =>
  db.rpc("file_made", {
    p_tenant_id: A,
    p_id: id,
    p_name: "now-booking",
    p_bytes: 2000,
    p_fingerprint: fingerprint,
    p_width: 1080,
    p_height: 1350,
    p_look: { line: 'A post saying "Now booking".', text_seen: ["Now booking"] },
    p_who_in_it: "not_asked",
    p_made: { from: randomUUID(), plan: { line: "Now booking" } },
    ...over,
  });

test("what Ask made is a file: filed, on its source, its look written, and no look left to do", { skip }, async () => {
  const id = randomUUID();
  assert.deepEqual(ok(await made(id, `fp-${id}`), "made"), { fate: "kept", file_id: id });
  const row = await rowOf(id);
  assert.deepEqual(
    [row.status, row.source, row.shows, row.look_status, row.mime, row.who_in_it],
    ["filed", "made", "graphic", "done", "image/jpeg", "not_asked"],
  );
  assert.equal(row.look.line, 'A post saying "Now booking".');
  assert.equal(row.made.plan.line, "Now booking");
  const looks = ok(
    await db.from("jobs").select("id").eq("kind", "file_look").contains("payload", { file_id: id }),
    "jobs",
  );
  assert.deepEqual(looks, [], "no model is asked about what code drew");
  assert.equal((await eventsOf("file.added", id)).length, 1, "a person's press is on the record");
});

test("what Ask made asked twice answers the same; the same picture twice is the one file", { skip }, async () => {
  const id = randomUUID();
  ok(await made(id, `fp-${id}`), "made");
  assert.deepEqual(ok(await made(id, `fp-${id}`), "again"), { fate: "kept", file_id: id });
  const second = randomUUID();
  assert.deepEqual(ok(await made(second, `fp-${id}`), "a twin"), { fate: "here", file_id: id });
  assert.equal((await db.from("files").select("id").eq("id", second)).data.length, 0);
});

test("a name already taken takes the next free one, as an upload's does", { skip }, async () => {
  const [one, two] = [randomUUID(), randomUUID()];
  ok(await made(one, `fp-${one}`, { p_name: "fall-special" }), "first");
  ok(await made(two, `fp-${two}`, { p_name: "fall-special" }), "second");
  assert.equal((await rowOf(one)).name, "fall-special");
  assert.equal((await rowOf(two)).name, "fall-special-2");
});

test("only the service role keeps what Ask made: a member's session is refused the door", { skip }, async () => {
  const id = randomUUID();
  const refused = await as.owner.client.rpc("file_made", {
    p_tenant_id: A,
    p_id: id,
    p_name: "mine",
    p_bytes: 1,
    p_fingerprint: `fp-${id}`,
    p_width: 1,
    p_height: 1,
    p_look: {},
    p_who_in_it: "not_asked",
    p_made: {},
  });
  assert.ok(refused.error, "not theirs to call");
  const seen = await as.owner.client.from("files").select("made").limit(1);
  assert.ok(seen.error, "and how it was made is the service role's to read");
});

test("the bucket is private and takes only the kinds and the size we keep", { skip }, async () => {
  const bucket = ok(await db.storage.getBucket("files"), "the bucket");
  assert.equal(bucket.public, false);
  assert.equal(bucket.file_size_limit, 25_000_000);
  assert.ok(bucket.allowed_mime_types.includes("image/heic"));
  assert.ok(!bucket.allowed_mime_types.includes("image/svg+xml"));
});

/* ------------------------------------------------------------------------- the library searched where it is kept (00597) -- */

let D;
let E;
const lib = {};

/** A file row as the service role keeps one, the n-th minute of the day: a picture unless it says it is a video. */
function libRow(key, tenant, minute, over = {}) {
  lib[key] = randomUUID();
  return {
    id: lib[key],
    tenant_id: tenant,
    status: "filed",
    source: "upload",
    // Every column one row names is sent for every row, as null where it is left out, so the default is said here.
    kind: "image",
    name: `${key}-${stamp}`,
    mime: "image/jpeg",
    bytes: 1000,
    fingerprint: `fp-lib-${key}-${stamp}`,
    look_status: "done",
    created_at: `2026-11-10T10:${String(minute).padStart(2, "0")}:00Z`,
    ...over,
  };
}
const libClip = (ref) => ({ kind: "video", mime: "video/mp4", media_ref: `${ref}-${stamp}`, media_status: "ready" });

/** What the member's session is answered: the page's files by their keys, and how many in all. */
async function libFound(who, args, tenant = D) {
  const answer = ok(
    await as[who].client.rpc("files_found", { p_tenant_id: tenant, p_status: "filed", p_limit: 40, ...args }),
    "files_found",
  );
  const keyOf = new Map(Object.entries(lib).map(([k, v]) => [v, k]));
  return { keys: answer.ids.map((i) => keyOf.get(i) ?? i), total: answer.total };
}

before(async () => {
  if (skip) return;
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Library D ${stamp}`, slug: `files-d-${stamp}` },
        { name: `Library E ${stamp}`, slug: `files-e-${stamp}` },
      ])
      .select("id"),
    "the library's workspaces",
  );
  D = tenants[0].id;
  E = tenants[1].id;
  as.libOwner = await member("lib-owner", D, "owner");
  as.libStranger = await member("lib-stranger", E, "owner");
  ok(
    await db.from("files").insert([
      libRow("storefront", D, 1, {
        shows: "storefront",
        look: { line: "A shop front at dusk.", text_seen: ["Open late"] },
      }),
      libRow("balayage", D, 2, {
        ...libClip("balayage"),
        shows: "work",
        seconds: 24,
        look: { line: "A colour from start to finish.", moments: [{ at: 21.5, what: "the finished colour" }] },
        sound: { words: { language: "es", voices: 1, text: "Bienvenidos al salón", cues: [], events: [] } },
        sound_said: "Spanish, music",
      }),
      libRow("waiting", D, 3, { status: "inbox", source: "website" }),
      libRow("post", D, 4, { source: "made", shows: "graphic", look: { line: "A post." } }),
      libRow("unsorted", D, 5, { look_status: "waiting" }),
      libRow("half-sent", D, 6, { ...libClip("half"), media_status: "uploading", look_status: "waiting" }),
      libRow("gone", D, 7, { removed_at: "2026-11-10T11:00:00Z", look: { line: "A shop front." } }),
      libRow("theirs", E, 8, { shows: "storefront", look: { line: "A shop front at dusk." } }),
    ]),
    "the library's files",
  );
});

after(async () => {
  if (skip) return;
  const all = [D, E];
  await db.from("files").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
});

test(
  "the library: everything kept, newest first, and nothing removed, on its way, waiting or another's",
  { skip },
  async () => {
    assert.deepEqual(await libFound("libOwner", {}), {
      keys: ["unsorted", "post", "balayage", "storefront"],
      total: 4,
    });
    assert.deepEqual(await libFound("libOwner", { p_status: "inbox" }), { keys: ["waiting"], total: 1 });
  },
);

test(
  "the library finds a file by its name, its sentence, its words, a clip's moments, its sound and what is said",
  { skip },
  async () => {
    for (const [words, keys] of [
      ["storefront", ["storefront"]],
      ["dusk", ["storefront"]],
      ["open late", ["storefront"]],
      ["finished colour", ["balayage"]],
      ["spanish", ["balayage"]],
      ["bienvenidos salón", ["balayage"]],
      ["shop", ["storefront"]],
    ])
      assert.deepEqual((await libFound("libOwner", { p_words: words })).keys, keys, words);
    assert.deepEqual(await libFound("libOwner", { p_words: "dusk bienvenidos" }), { keys: [], total: 0 }, "every word");
    assert.equal((await libFound("libOwner", { p_words: "   " })).total, 4, "blank words find every file");
    assert.deepEqual(
      await libFound("libOwner", { p_words: "-dusk" }),
      { keys: [], total: 0 },
      "exclusions alone, none",
    );
  },
);

test(
  "the library's shelf is shelfFilterOf's parts: what it shows, posts or not, the unsorted on other",
  { skip },
  async () => {
    assert.deepEqual((await libFound("libOwner", { p_made: false, p_shows: ["storefront", "interior"] })).keys, [
      "storefront",
    ]);
    assert.deepEqual((await libFound("libOwner", { p_made: true })).keys, ["post"]);
    assert.deepEqual((await libFound("libOwner", { p_made: false, p_shows: ["other"], p_or_unsorted: true })).keys, [
      "unsorted",
    ]);
    assert.deepEqual((await libFound("libOwner", { p_made: false, p_shows: ["other"] })).keys, [], "unsorted, unasked");
  },
);

test("the library answers a page, and counts them all", { skip }, async () => {
  assert.deepEqual(await libFound("libOwner", { p_limit: 2 }), { keys: ["unsorted", "post"], total: 4 });
  assert.deepEqual(await libFound("libOwner", { p_limit: 2, p_offset: 2 }), {
    keys: ["balayage", "storefront"],
    total: 4,
  });
  assert.deepEqual(await libFound("libOwner", { p_limit: 2, p_offset: 4 }), { keys: [], total: 4 });
});

test("the library: another workspace's member finds nothing of this one, under row security", { skip }, async () => {
  assert.deepEqual(await libFound("libStranger", { p_words: "dusk" }), { keys: [], total: 0 });
  assert.deepEqual(await libFound("libStranger", { p_words: "dusk" }, E), { keys: ["theirs"], total: 1 });
});
