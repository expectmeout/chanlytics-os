/**
 * A form on the business's own website on a real database (00692; the Forms plan, F4): the sites it may show on are
 * held on its website link (links.sites), each a host without a scheme, a path or a port, ten at most, one website link
 * a form, null on every other place. A member who may act adds and removes them under the table's row rules, as they
 * make and rename a link; a viewer and another workspace's member cannot. An entry sent straight to the form's address
 * from somewhere other than its page is kept, held as `elsewhere`, with no person and no event. A check and a grant are
 * what reading source cannot prove, so these run against Postgres. Skipped without a local database; never production.
 */
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
      ? "refusing a database that is not on this machine: this suite makes workspaces and customers"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const RUN = Date.now();
const CHECK = "23514";
const UNIQUE = "23505";
let db;
let tenantId;
let otherTenantId;
let formId;
let versionId;
const users = {};
const sessions = {};

const ok = (res, what = "") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};
const address = (who) => `${who}-${RUN}@example.com`;
const DRAFT = {
  heading: "Colour consultation",
  lang: "en",
  thanks: "Thanks!",
  next: { chat: true, draft: true, follow_up: false },
  fields: [
    { id: "name", kind: "short", label: "Your name", needed: true },
    { id: "mail", kind: "email", label: "Email", needed: true },
  ],
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const workspace = async (slug, name) =>
    ok(
      await db
        .from("tenants")
        .insert({ slug: `${slug}-${RUN}`, name })
        .select("id")
        .single(),
      slug,
    ).id;
  tenantId = await workspace("form-site", "Harbor");
  otherTenantId = await workspace("form-site-other", "Quay");
  for (const [who, role, tenant] of [
    ["owner", "owner", tenantId],
    ["viewer", "viewer", tenantId],
    ["stranger", "owner", otherTenantId],
  ]) {
    const user = ok(
      await db.auth.admin.createUser({ email: address(who), password: `pw-${RUN}-Aa1!`, email_confirm: true }),
      who,
    ).user;
    users[who] = user.id;
    ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: user.id, role }), `${who}'s seat`);
    const as = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    ok(await as.auth.signInWithPassword({ email: address(who), password: `pw-${RUN}-Aa1!` }), who);
    sessions[who] = as;
  }
  formId = ok(
    await sessions.owner
      .from("forms")
      .insert({ tenant_id: tenantId, slug: "colour", draft: DRAFT, created_by: users.owner })
      .select("id")
      .single(),
    "the form",
  ).id;
  versionId = ok(
    await sessions.owner.rpc("form_publish", { p_tenant_id: tenantId, p_form_id: formId }),
    "publish",
  ).version_id;
});

after(async () => {
  if (skip || !tenantId) return;
  for (const id of [tenantId, otherTenantId]) {
    await db.from("events").delete().eq("tenant_id", id);
    await db.from("tenants").delete().eq("id", id);
  }
  for (const id of Object.values(users)) await db.auth.admin.deleteUser(id).catch(() => undefined);
});

/** A link of the form made by `who`, with `sites` where it is the website's. */
const makeLink = (who, place, sites) =>
  sessions[who]
    .from("links")
    .insert({
      tenant_id: tenantId,
      subject_type: "form",
      subject_id: formId,
      place,
      printed: false,
      created_by: users[who],
      ...(sites === undefined ? {} : { sites }),
    })
    .select("id, code, sites")
    .maybeSingle();

test(
  "a member who may act makes the website link and changes its sites; every other place has none",
  { skip },
  async () => {
    const place = ok(await makeLink("owner", "Google listing"), "a place");
    assert.equal(place.sites, null);
    const website = ok(await makeLink("owner", "Your website", ["luma-salon.com"]), "the website");
    assert.deepEqual(website.sites, ["luma-salon.com"]);
    const kept = ok(
      await sessions.owner
        .from("links")
        .update({ sites: ["luma-salon.com", "shop.luma-salon.com"] })
        .eq("id", website.id)
        .select("sites"),
      "a site added",
    );
    assert.deepEqual(kept[0].sites, ["luma-salon.com", "shop.luma-salon.com"]);
    ok(await sessions.owner.from("links").update({ sites: [] }).eq("id", website.id), "every site removed");
    // One website a form: a second is refused, whoever makes it.
    const second = await makeLink("owner", "Another website", ["other.example"]);
    assert.equal(second.error?.code, UNIQUE);
  },
);

test("a site is a host alone, ten at most, none missing", { skip }, async () => {
  const other = ok(
    await db
      .from("forms")
      .insert({ tenant_id: tenantId, slug: "sites-check", draft: DRAFT, created_by: users.owner })
      .select("id")
      .single(),
    "a second form",
  ).id;
  const tryOn = (sites) =>
    db
      .from("links")
      .insert({ tenant_id: tenantId, subject_type: "form", subject_id: other, place: "Your website", sites })
      .select("id")
      .maybeSingle();
  for (const sites of [
    ["https://luma-salon.com"],
    ["luma-salon.com/book"],
    ["Luma-Salon.com"],
    ["localhost"],
    ["luma-salon.com:8443"],
    ["luma salon.com"],
    ["luma-salon.com", null],
    Array.from({ length: 11 }, (_, n) => `site${n}.example`),
  ])
    assert.equal((await tryOn(sites)).error?.code, CHECK, JSON.stringify(sites));
  const fine = await tryOn(Array.from({ length: 10 }, (_, n) => `site${n}.example`));
  assert.equal(fine.error, null, "ten hosts are a list");
});

test("a viewer and another workspace's member change no site", { skip }, async () => {
  const website = ok(
    await db.from("links").select("id, sites").eq("subject_id", formId).not("sites", "is", null).single(),
    "the website",
  );
  for (const who of ["viewer", "stranger"]) {
    const res = await sessions[who]
      .from("links")
      .update({ sites: ["evil.example"] })
      .eq("id", website.id)
      .select("id");
    assert.deepEqual(res.data ?? [], [], `${who}: no row is changed`);
  }
  const after_ = ok(await db.from("links").select("sites").eq("id", website.id).single(), "read back");
  assert.deepEqual(after_.sites, website.sites);
  assert.equal((await makeLink("viewer", "A viewer's website", ["viewer.example"])).data, null, "nor makes one");
});

test(
  "an entry sent from somewhere other than the form's page is kept, held as elsewhere, with no person",
  { skip },
  async () => {
    const taken = ok(
      await db.rpc("form_request_take", {
        p_tenant_id: tenantId,
        p_form_id: formId,
        p_version_id: versionId,
        p_ref: `elsewhere-${RUN}`,
        p_answers: { name: "Bot", mail: address("bot") },
        p_reach: { name: "Bot", email: address("bot"), phone: null },
        p_words: "e".repeat(64),
        p_held_why: "elsewhere",
      }),
      "the door",
    );
    assert.equal(taken.outcome, "held");
    const entry = ok(
      await db.from("form_entries").select("state, held_why, contact_id").eq("id", taken.entry_id).single(),
    );
    assert.deepEqual(entry, { state: "held", held_why: "elsewhere", contact_id: null });
    const events = ok(await db.from("events").select("id").eq("subject_id", taken.entry_id), "events");
    assert.equal(events.length, 0, "nothing rings");
  },
);
