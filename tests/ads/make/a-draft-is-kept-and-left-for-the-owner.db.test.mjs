/**
 * 00659 on a real Postgres: a draft ad is kept, and one left for the owner rings their bell (the Ads plan's 6.2 and
 * G18; decision 0050, call 2), and the owner's most is kept on the ad account (G6).
 *
 * What must hold. A workspace keeps one draft, each keep in place of the one before, for an ad account of its own. An
 * owner, an operator and a partner who showed the second factor may keep one; a viewer, a stranger and a visitor may
 * not, and nobody but a door writes the table. A draft kept with its words by a member who may not run ads rings each
 * owner's bell once while their row is open; one kept with no words rings nothing; the owner's keep closes the rows.
 * The most an ad may cost is the owner's alone to say. Runs against the database `supabase start` builds on this
 * machine, never production.
 *
 * And 00669: a keep that names the draft it read writes nothing over another kept since, nor brings back one gone
 * since, and says so; the ad writer out for a draft's words is marked once for the same words, its mark moves nothing
 * of the draft (Turn on and a keep still read it as the one they read), and goes when it is back.
 */
import { randomUUID } from "node:crypto";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, members and drafts"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in need it"
        : false;

const stamp = Date.now();
const users = [];
const workspaces = [];
let db;

const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};

/** A draft as New ad keeps it, with its words or none. */
const draftOf = (words) => ({
  service: "First appointment",
  picture: "f0000001-0000-4000-8000-000000000000",
  miles: 5,
  total_minor: 7000,
  end_day: "2026-12-03",
  versions: words
    ? [1, 2, 3].map((n) => ({ headline: `First appointment ${n}`, text: "Message Harbor Studio on WhatsApp." }))
    : [],
  answers: {},
});

/** A member signed in as themselves: the session a page's route uses. */
async function memberOf(tenant, role, tag) {
  const email = `ads-draft-${role}-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  if (tenant) ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, client };
}

/** A workspace with a connected ad account, its owner and an operator, the operator named on their profile. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-draft-${tag}-${stamp}`, name: `Harbor Draft ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `act-draft-${tag}-${stamp}`,
        currency: "USD",
        status: "connected",
      })
      .select("id")
      .single(),
  ).id;
  const owner = await memberOf(tenant, "owner", tag);
  const operator = await memberOf(tenant, "operator", tag);
  ok(await db.from("profiles").upsert({ user_id: operator.id, display_name: "Maria" }));
  return { tenant, account, owner, operator };
}

const keep = async (who, ws, words, account = ws.account) =>
  ok(await who.client.rpc("ad_draft_keep", { p_tenant_id: ws.tenant, p_account_id: account, p_draft: draftOf(words) }));
const bellOf = async (tenant) =>
  ok(
    await db
      .from("notifications")
      .select("kind, title, body, route, subject_type, recipient_user_id, closed_at")
      .eq("tenant_id", tenant)
      .eq("kind", "ad_draft")
      .order("created_at"),
  );

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) await db.from("tenants").delete().eq("id", tenant);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a workspace keeps one draft, each keep in place of the one before, by whoever kept it", { skip }, async () => {
  const ws = await workspace("one");
  const first = await keep(ws.owner, ws, false);
  assert.deepEqual([first.kept, first.rung], [true, 0]);
  const again = await keep(ws.operator, ws, false);
  assert.equal(again.draft_id, first.draft_id, "the same row, kept again");
  const rows = ok(await db.from("ad_drafts").select("id, account_id, kept_by, draft").eq("tenant_id", ws.tenant));
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].account_id, rows[0].kept_by, rows[0].draft.service],
    [ws.account, ws.operator.id, "First appointment"],
  );
  // A member reads it; another workspace's account is not one a draft can be kept for.
  assert.equal(ok(await ws.owner.client.from("ad_drafts").select("id").eq("tenant_id", ws.tenant)).length, 1);
  const other = await workspace("other");
  assert.deepEqual(await keep(ws.owner, ws, false, other.account), { kept: false, draft_id: null, rung: 0 });
});

test(
  "left with its words by an operator, it rings each owner's bell once, and the owner's keep closes it",
  { skip },
  async () => {
    const ws = await workspace("bell");
    // Kept with no words yet: nothing to leave, so nothing rings.
    assert.equal((await keep(ws.operator, ws, false)).rung, 0);
    assert.deepEqual(await bellOf(ws.tenant), []);
    // With its words: the owner's bell, once, opening New ad, naming who left it and for what.
    assert.equal((await keep(ws.operator, ws, true)).rung, 1);
    assert.equal((await keep(ws.operator, ws, true)).rung, 0, "never a second row while one is open");
    const [row, ...more] = await bellOf(ws.tenant);
    assert.deepEqual(more, []);
    assert.deepEqual(row, {
      kind: "ad_draft",
      title: "Maria left you a draft ad",
      body: "For First appointment. It runs only once you turn it on.",
      route: "campaigns/ads:new",
      subject_type: "ad_draft",
      recipient_user_id: ws.owner.id,
      closed_at: null,
    });
    // The owner keeps it: the row closes, and the owner's own keep rings nobody.
    assert.equal((await keep(ws.owner, ws, true)).rung, 0);
    assert.notEqual((await bellOf(ws.tenant))[0].closed_at, null);
    // Left again later: a new row.
    assert.equal((await keep(ws.operator, ws, true)).rung, 1);
    assert.equal((await bellOf(ws.tenant)).length, 2);
  },
);

test(
  "only an acting member keeps a draft, only a door writes one, and only the owner says the most",
  { skip },
  async () => {
    const ws = await workspace("who");
    const viewer = await memberOf(ws.tenant, "viewer", "who");
    const stranger = await memberOf(null, "owner", "stranger");
    const visitor = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const args = { p_tenant_id: ws.tenant, p_account_id: ws.account, p_draft: draftOf(true) };
    for (const [who, client] of [
      ["a viewer", viewer.client],
      ["a stranger", stranger.client],
    ]) {
      const refused = await client.rpc("ad_draft_keep", args);
      assert.equal(refused.error?.code, "42501", `${who} may not keep a draft`);
    }
    assert.notEqual((await visitor.rpc("ad_draft_keep", args)).error, null, "nor a visitor");
    // Nobody writes the table but its door.
    const direct = await ws.owner.client
      .from("ad_drafts")
      .insert({ tenant_id: ws.tenant, account_id: ws.account, draft: {} });
    assert.notEqual(direct.error, null);
    // The most: the owner's, on the connected account, in its minor units; anyone else is refused.
    assert.equal(
      ok(await ws.owner.client.rpc("ad_account_most", { p_tenant_id: ws.tenant, p_most_minor: 30_000 })),
      true,
    );
    const account = ok(await db.from("ad_accounts").select("most_minor").eq("id", ws.account).single());
    assert.equal(account.most_minor, 30_000);
    const operator = await ws.operator.client.rpc("ad_account_most", { p_tenant_id: ws.tenant, p_most_minor: 90_000 });
    assert.equal(operator.error?.code, "42501");
    const nothing = await ws.owner.client.rpc("ad_account_most", { p_tenant_id: ws.tenant, p_most_minor: 0 });
    assert.equal(nothing.error?.code, "22023");
  },
);

// ---------------------------------------------------------------------------------------------------------------------
// 00669: a keep names the draft it read, and the writer out for its words is marked

const rowOf = async (ws) =>
  ok(
    await db
      .from("ad_drafts")
      .select("draft, updated_at, writing_ask, writing_for, writing_until")
      .eq("tenant_id", ws.tenant)
      .maybeSingle(),
  );
const keepOver = async (who, ws, readAt, over = {}) =>
  ok(
    await who.client.rpc("ad_draft_keep", {
      p_tenant_id: ws.tenant,
      p_account_id: ws.account,
      p_draft: { ...draftOf(true), ...over },
      p_read_at: readAt,
    }),
  );

test(
  "a keep that names the draft it read writes nothing over one kept since, nor brings back one gone",
  { skip },
  async () => {
    const ws = await workspace("read");
    // None kept yet, and none read: kept.
    const first = await keepOver(ws.owner, ws, "-infinity");
    assert.equal(first.kept, true);
    const read = await rowOf(ws);
    // Kept since by the operator: a keep made from the older one writes nothing, and says so.
    await keep(ws.operator, ws, false);
    const since = await rowOf(ws);
    assert.notEqual(since.updated_at, read.updated_at);
    assert.deepEqual(await keepOver(ws.owner, ws, read.updated_at, { total_minor: 9000 }), {
      kept: false,
      draft_id: first.draft_id,
      rung: 0,
      newer: true,
    });
    assert.equal((await rowOf(ws)).draft.total_minor, 7000, "nothing written over the newer draft");
    assert.equal((await keepOver(ws.owner, ws, "-infinity")).newer, true, "nor by a keep that read none");
    // Made from the draft as it is now: kept.
    assert.equal((await keepOver(ws.owner, ws, since.updated_at, { total_minor: 9000 })).kept, true);
    assert.equal((await rowOf(ws)).draft.total_minor, 9000);
    // Gone since (turned on): a keep made from it brings nothing back. A keep that names nothing keeps, as before.
    const gone = await rowOf(ws);
    ok(await db.from("ad_drafts").delete().eq("tenant_id", ws.tenant));
    assert.deepEqual(await keepOver(ws.owner, ws, gone.updated_at), {
      kept: false,
      draft_id: null,
      rung: 0,
      newer: true,
    });
    assert.equal(await rowOf(ws), null);
    assert.equal((await keep(ws.owner, ws, false)).kept, true);
  },
);

test(
  "the writer out for a draft's words is marked once for the same words, moves nothing of it, and goes when back",
  { skip },
  async () => {
    const ws = await workspace("writer");
    const until = (ms = 30_000) => new Date(Date.now() + ms).toISOString();
    const hold = (who, ask, words = "first appointment", at = until()) =>
      who.client.rpc("ad_draft_writing", { p_tenant_id: ws.tenant, p_ask: ask, p_for: words, p_until: at });
    const back = (who, ask) => who.client.rpc("ad_draft_written", { p_tenant_id: ws.tenant, p_ask: ask });
    const [one, two, three] = [randomUUID(), randomUUID(), randomUUID()];
    // No draft kept: nothing to mark, and nothing to wait for.
    assert.deepEqual(ok(await hold(ws.owner, one)), { held: false, ask: null, until: null });
    await keep(ws.owner, ws, false);
    const kept = await rowOf(ws);
    assert.equal(ok(await hold(ws.owner, one)).held, true);
    // Another ask for the same words, on another device or by another member: the one out, to wait for.
    const out = ok(await hold(ws.operator, two));
    assert.deepEqual([out.held, out.ask], [false, one]);
    assert.ok(Date.parse(out.until) > Date.now());
    // The mark is not a change of the draft: Turn on and a keep read it as the one they read.
    const marked = await rowOf(ws);
    assert.deepEqual(
      [marked.updated_at, marked.writing_ask, marked.writing_for],
      [kept.updated_at, one, "first appointment"],
    );
    // An ask for other words takes it over; the first one back does not end the newer one's mark.
    assert.equal(ok(await hold(ws.owner, three, "consultation")).held, true);
    assert.equal(ok(await back(ws.owner, one)), false);
    assert.equal((await rowOf(ws)).writing_ask, three);
    assert.equal(ok(await back(ws.owner, three)), true);
    assert.deepEqual(Object.values(await rowOf(ws)).slice(2), [null, null, null]);
    // Out past its time (its request gone with it): the next ask for the same words holds it.
    assert.equal(ok(await hold(ws.owner, one)).held, true);
    ok(
      await db
        .from("ad_drafts")
        .update({ writing_until: until(-1000) })
        .eq("tenant_id", ws.tenant),
    );
    assert.equal(ok(await hold(ws.operator, two)).held, true);
    assert.equal((await rowOf(ws)).updated_at, kept.updated_at, "still the draft Turn on would read");
    // Only an acting member marks one; a mark's time is within the route's two minutes, and it names its words.
    const viewer = await memberOf(ws.tenant, "viewer", "writer");
    assert.equal((await hold(viewer, three)).error?.code, "42501");
    assert.equal((await back(viewer, two)).error?.code, "42501");
    assert.equal((await hold(ws.owner, three, "first appointment", until(10 * 60_000))).error?.code, "22023");
    assert.equal((await hold(ws.owner, three, "first appointment", until(-1000))).error?.code, "22023");
    assert.equal((await hold(ws.owner, three, " ")).error?.code, "22023");
  },
);
