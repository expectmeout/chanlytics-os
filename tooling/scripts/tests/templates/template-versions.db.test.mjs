/**
 * A message's email and text versions, saved and removed through their doors -- on a real database.
 *
 * 00296 gives a member two definer doors over `templates`, which members may only read: save_template_version writes
 * (or rewrites) the email or text version of a message, remove_template_version deletes one. 00342 gives a third,
 * create_message_version, which writes the FIRST version of a message no row of the workspace holds, with the category,
 * the values and the title that version says. What reading the SQL cannot prove is who may call them, what they refuse
 * and what they leave alone, so these sign real people in and call them. Runs the way tenancy.db.test.mjs does, against
 * the local stack only; skipped without one.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { channelNeverCarries } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = process.env.SUPABASE_CLI || "supabase";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

let db;
let A; // the workspace under test
let B; // another workspace
const users = [];
let owner;
let operator;
let viewer;
let stranger; // an owner of B
let whatsappId; // the message's WhatsApp row in A

const VARIABLES = [
  { position: 1, label: "First name", example: "Dani" },
  { position: 2, label: "Business name", example: "Luna Studio" },
];

/** A real session for a fresh user with this role in this workspace. */
async function memberClient(role, tenant) {
  const email = `versions-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, userId: made.data.user.id };
}

async function seedTemplate(row) {
  const r = await db
    .from("templates")
    .insert({ meta_status: "approved", source: "chanlytics", variables: VARIABLES, category: "utility", ...row })
    .select("id")
    .single();
  assert.equal(r.error, null, `seeding a template: ${r.error?.message}`);
  return r.data.id;
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await db
    .from("tenants")
    .insert({ slug: `versions-${Date.now()}`, name: "Versions" })
    .select("id")
    .single();
  assert.equal(a.error, null, a.error?.message);
  A = a.data.id;
  const b = await db
    .from("tenants")
    .insert({ slug: `versions-other-${Date.now()}`, name: "Versions other" })
    .select("id")
    .single();
  assert.equal(b.error, null, b.error?.message);
  B = b.data.id;
  owner = await memberClient("owner", A);
  operator = await memberClient("operator", A);
  viewer = await memberClient("viewer", A);
  stranger = await memberClient("owner", B);
  whatsappId = await seedTemplate({
    tenant_id: A,
    channel: "whatsapp",
    name: "visit_reminder",
    language: "en_US",
    title: "Visit reminder",
    body_preview: "Hi {{1}}, a reminder from {{2}}.",
    components: [{ type: "BODY", text: "Hi {{1}}, a reminder from {{2}}." }],
    meta_id: "meta-visit-reminder-en",
    synced_at: new Date().toISOString(),
    source: "meta",
  });
});

after(async () => {
  if (skip) return;
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

function save(who, over = {}) {
  return who.client.rpc("save_template_version", {
    p_tenant_id: A,
    p_name: "visit_reminder",
    p_language: "en_US",
    p_channel: "email",
    p_subject: "Tomorrow at {{2}}",
    p_body: "Hi {{1}},\r\n\r\nSee you soon.",
    ...over,
  });
}

async function rowOf(id) {
  const r = await db.from("templates").select("*").eq("id", id).maybeSingle();
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}

test(
  "a member saves an email version of a message: Meta's component shape, the message's purpose, slots and title",
  { skip },
  async () => {
    const r = await save(owner);
    assert.equal(r.error, null, r.error?.message);
    assert.deepEqual(
      { ...r.data, id: typeof r.data.id },
      { id: "string", channel: "email", name: "visit_reminder", language: "en_US" },
    );
    const row = await rowOf(r.data.id);
    assert.equal(row.tenant_id, A);
    assert.equal(row.meta_status, "approved", "nothing reviews it but the person who wrote it");
    assert.equal(row.source, "chanlytics");
    assert.equal(row.category, "utility", "the message's purpose, not its own");
    assert.deepEqual(row.variables, VARIABLES, "the message's slots");
    assert.equal(row.title, "Visit reminder", "starts with the message's title");
    assert.equal(row.created_by, owner.userId);
    assert.equal(row.meta_id, null, "never filed with Meta");
    assert.deepEqual(row.components, [
      { type: "HEADER", format: "TEXT", text: "Tomorrow at {{2}}" },
      { type: "BODY", text: "Hi {{1}},\n\nSee you soon." },
    ]);
    assert.equal(row.body_preview, "Hi {{1}},\n\nSee you soon.", "line endings read as \\n, the words trimmed");
  },
);

test("a text version has a body and no heading, and the channel's own row", { skip }, async () => {
  const r = await save(operator, { p_channel: "sms", p_subject: "ignored", p_body: "  Hi {{1}}, see you soon.  " });
  assert.equal(r.error, null, r.error?.message);
  assert.equal(r.data.channel, "sms");
  const row = await rowOf(r.data.id);
  assert.deepEqual(row.components, [{ type: "BODY", text: "Hi {{1}}, see you soon." }], "a text has no subject");
  assert.equal(row.created_by, operator.userId);
  const rows = await db.from("templates").select("channel").eq("tenant_id", A).eq("name", "visit_reminder");
  assert.deepEqual(rows.data.map((x) => x.channel).sort(), ["email", "sms", "whatsapp"], "one row a channel");
});

test("saving again rewrites the version in place and keeps what the workspace did to the row", { skip }, async () => {
  const first = await save(owner, { p_language: "es", p_subject: "Mañana", p_body: "Hola {{1}}." });
  assert.equal(first.error, null, first.error?.message);
  const named = await owner.client.rpc("set_template_title", {
    p_template_id: first.data.id,
    p_title: "El recordatorio",
  });
  assert.equal(named.error, null, named.error?.message);
  const again = await save(operator, {
    p_language: "es",
    p_subject: "Mañana a las {{2}}",
    p_body: "Hola {{1}}, hasta mañana.",
  });
  assert.equal(again.error, null, again.error?.message);
  assert.equal(again.data.id, first.data.id, "the same row, not a second");
  const row = await rowOf(first.data.id);
  assert.equal(row.title, "El recordatorio", "the title the workspace gave it is kept");
  assert.equal(row.created_by, owner.userId, "its author is kept");
  assert.equal(row.components[0].text, "Mañana a las {{2}}");
  assert.equal(row.body_preview, "Hola {{1}}, hasta mañana.");
  const count = await db
    .from("templates")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", A)
    .eq("channel", "email")
    .eq("language", "es");
  assert.equal(count.count, 1);
});

test(
  "the message must exist: a name nobody has, another workspace's message, and a reach-out's email are not versions to write",
  { skip },
  async () => {
    const unknown = await save(owner, { p_name: "no_such_message" });
    assert.equal(unknown.error?.code, "P0002");
    assert.match(unknown.error.message, /Message not found/);
    const reach = await save(owner, { p_name: "reach_out_0123456789abcdef" });
    assert.equal(reach.error?.code, "22023");
    assert.match(reach.error.message, /edited in the reach-out/);
    await seedTemplate({
      tenant_id: B,
      channel: "whatsapp",
      name: "their_own_message",
      language: "en_US",
      body_preview: "Hi {{1}}",
      components: [{ type: "BODY", text: "Hi {{1}}" }],
    });
    const theirs = await save(owner, { p_name: "their_own_message" });
    assert.equal(theirs.error?.code, "P0002", "a message in another workspace is not found, not copied");
    const rows = await db.from("templates").select("id").eq("tenant_id", A).eq("name", "their_own_message");
    assert.deepEqual(rows.data, []);
  },
);

test(
  "what it refuses, in a person's words: a channel it does not write, a language, an empty email, a subject or a body too long",
  { skip },
  async () => {
    const say = async (over, code, words) => {
      const r = await save(owner, over);
      assert.equal(r.error?.code, code, JSON.stringify(over));
      assert.match(r.error.message, words, JSON.stringify(over));
    };
    await say({ p_channel: "whatsapp" }, "22023", /email or text/);
    await say({ p_channel: "voice" }, "22023", /email or text/);
    await say({ p_language: "english" }, "22023", /language/);
    await say({ p_language: "" }, "22023", /language/);
    await say({ p_subject: "   " }, "22023", /subject/);
    await say({ p_subject: null }, "22023", /subject/);
    await say({ p_subject: "x".repeat(61) }, "22023", /at most 60/);
    await say({ p_body: " \n " }, "22023", /Write the email/);
    await say({ p_body: "x".repeat(2001) }, "22023", /at most 2000/);
    await say({ p_channel: "sms", p_body: "" }, "22023", /Write the text/);
    await say({ p_channel: "sms", p_body: "x".repeat(1601) }, "22023", /at most 1600/);
    const edge = await save(owner, { p_subject: "x".repeat(60), p_body: "x".repeat(2000), p_language: "pt_BR" });
    assert.equal(edge.error, null, "the limits themselves are allowed");
    const text = await save(owner, { p_channel: "sms", p_body: "x".repeat(1600), p_language: "pt_BR" });
    assert.equal(text.error, null);
  },
);

test(
  "who may: an owner or an operator of the workspace; a viewer, a stranger and a signed-out caller may not",
  { skip },
  async () => {
    const rowsBefore = await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    const asViewer = await save(viewer, { p_language: "fr" });
    assert.equal(asViewer.error?.code, "P0002", "a viewer changes nothing: not found, as a stranger reads it");
    const asStranger = await save(stranger, { p_language: "fr" });
    assert.equal(asStranger.error?.code, "P0002");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const asAnon = await save({ client: anon }, { p_language: "fr" });
    assert.ok(asAnon.error, "the logged-out key holds no door");
    assert.equal(asAnon.error.code, "42501");
    const noUser = await save({ client: db }, { p_language: "fr" });
    assert.equal(noUser.error?.code, "28000", "the service role has no person, and a door that names one says sign in");
    const rowsAfter = await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A);
    assert.equal(rowsAfter.count, rowsBefore.count, "none of them wrote a row");
    for (const who of [owner, operator]) assert.equal((await save(who, { p_language: "fr" })).error, null);
  },
);

test(
  "a member removes the version they wrote, and nothing else: not Meta's row, not a reach-out's email, not another workspace's",
  { skip },
  async () => {
    const mine = await save(owner, { p_language: "de" });
    assert.equal(mine.error, null, mine.error?.message);

    const reachId = await seedTemplate({
      tenant_id: A,
      channel: "email",
      name: "reach_out_0123456789abcdef",
      language: "en",
      category: "marketing",
      body_preview: "Hello",
      components: [{ type: "BODY", text: "Hello" }],
    });
    const theirsId = await seedTemplate({
      tenant_id: B,
      channel: "email",
      name: "their_own_message",
      language: "en_US",
      body_preview: "Hi",
      components: [{ type: "BODY", text: "Hi" }],
    });
    const metaEmail = await seedTemplate({
      tenant_id: A,
      channel: "email",
      name: "visit_reminder",
      language: "ja",
      source: "meta",
      body_preview: "x",
      components: [{ type: "BODY", text: "x" }],
    });
    for (const [who, id, why] of [
      [owner, whatsappId, "a WhatsApp template is Meta's, deleted through the edge"],
      [owner, reachId, "a reach-out's email is the reach-out's"],
      [owner, theirsId, "another workspace's version"],
      [owner, metaEmail, "a row Meta wrote"],
      [viewer, mine.data.id, "a viewer changes nothing"],
      [stranger, mine.data.id, "a stranger"],
      [owner, "00000000-0000-4000-8000-000000000000", "a row that is not there"],
    ]) {
      const r = await who.client.rpc("remove_template_version", { p_template_id: id });
      assert.equal(r.error?.code, "P0002", why);
      assert.match(r.error.message, /Version not found/, why);
      if (id !== "00000000-0000-4000-8000-000000000000") assert.ok(await rowOf(id), `${why}: the row is still there`);
    }
    const gone = await operator.client.rpc("remove_template_version", { p_template_id: mine.data.id });
    assert.equal(gone.error, null, gone.error?.message);
    assert.deepEqual(gone.data, { id: mine.data.id, channel: "email", name: "visit_reminder", language: "de" });
    assert.equal(await rowOf(mine.data.id), null);
    assert.ok(await rowOf(whatsappId), "the message's WhatsApp row is untouched");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const asAnon = await anon.rpc("remove_template_version", { p_template_id: metaEmail });
    assert.equal(asAnon.error?.code, "42501");
  },
);

test("a version a playbook still names is not removed: the owner is told, and the row stays", { skip }, async () => {
  const mine = await save(owner, { p_language: "it" });
  assert.equal(mine.error, null, mine.error?.message);
  const pb = await db
    .from("playbooks")
    .insert({
      tenant_id: A,
      name: "Uses a version",
      trigger: "quiet_30",
      policy_class: "reengage",
      template_id: mine.data.id,
      template_name: "visit_reminder",
      template_language: "it",
    })
    .select("id")
    .single();
  assert.equal(pb.error, null, pb.error?.message);
  const r = await owner.client.rpc("remove_template_version", { p_template_id: mine.data.id });
  assert.equal(r.error?.code, "P0001");
  assert.match(r.error.message, /still uses this version/);
  assert.ok(await rowOf(mine.data.id));
  await db.from("playbooks").delete().eq("id", pb.data.id);
  assert.equal((await owner.client.rpc("remove_template_version", { p_template_id: mine.data.id })).error, null);
});

test("a member still cannot write the table directly: the doors are the only way in", { skip }, async () => {
  const insert = await owner.client.from("templates").insert({
    tenant_id: A,
    channel: "email",
    name: "visit_reminder",
    language: "ko",
    meta_status: "approved",
    source: "chanlytics",
  });
  assert.ok(insert.error, "RLS refuses the insert");
  const direct = await owner.client.from("templates").delete().eq("id", whatsappId).select("id");
  assert.deepEqual(direct.data ?? [], [], "and a delete takes no row");
  assert.ok(await rowOf(whatsappId));
});

/* ---- 00342: a message may begin as an email or a text ---- */

const BEGIN_VARIABLES = [
  { position: 1, label: "First name", example: "Dani" },
  { position: 2, label: "The offer", example: null },
];

/** create_message_version as a member calls it: a first email of an offer, over what a test changes. */
function begin(who, over = {}) {
  return who.client.rpc("create_message_version", {
    p_tenant_id: A,
    p_name: "spring_news",
    p_language: "en_US",
    p_channel: "email",
    p_subject: "News from {{2}}",
    p_body: "Hi {{1}},\r\n\r\nSpring is here: {{2}}",
    p_category: "marketing",
    p_variables: BEGIN_VARIABLES,
    p_title: "Spring news",
    ...over,
  });
}

async function rowsNamed(name) {
  const r = await db.from("templates").select("*").eq("tenant_id", A).eq("name", name).order("channel");
  assert.equal(r.error, null, r.error?.message);
  return r.data;
}

/** One statement through `supabase db query --local`, for what only the catalog can say (SUPABASE_CLI names the binary). */
function catalog(sql) {
  const r = spawnSync(CLI, ["db", "query", "--local", "--output-format", "json", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.error) throw new Error(`could not run ${CLI} (${r.error.message}); set SUPABASE_CLI to the supabase binary`);
  assert.equal(r.status, 0, `supabase db query exited ${r.status}: ${(r.stderr ?? "") + (r.stdout ?? "")}`);
  const out = r.stdout;
  const start = out.search(/[[{]/);
  const parsed = JSON.parse(out.slice(start, out.lastIndexOf(out[start] === "{" ? "}" : "]") + 1));
  return Array.isArray(parsed) ? parsed : (parsed.rows ?? []);
}

test(
  "a member begins a message with an email: approved at once, the first version's category, values and title, and Meta's component shape",
  { skip },
  async () => {
    const r = await begin(owner);
    assert.equal(r.error, null, r.error?.message);
    assert.deepEqual(
      { ...r.data, id: typeof r.data.id },
      { id: "string", channel: "email", name: "spring_news", language: "en_US" },
    );
    const row = await rowOf(r.data.id);
    assert.equal(row.tenant_id, A);
    assert.equal(row.meta_status, "approved", "nothing reviews it but the person who wrote it");
    assert.equal(row.source, "chanlytics");
    assert.equal(row.category, "marketing", "the category the first version says");
    assert.deepEqual(row.variables, BEGIN_VARIABLES, "the values, as the edge writes them on a WhatsApp row");
    assert.equal(row.title, "Spring news");
    assert.equal(row.created_by, owner.userId);
    assert.equal(row.meta_id, null, "never filed with Meta");
    assert.equal(row.hidden_at, null);
    assert.deepEqual(row.components, [
      { type: "HEADER", format: "TEXT", text: "News from {{2}}" },
      { type: "BODY", text: "Hi {{1}},\n\nSpring is here: {{2}}" },
    ]);
    assert.equal(row.body_preview, "Hi {{1}},\n\nSpring is here: {{2}}", "line endings read as \\n, the words trimmed");
    assert.equal((await rowsNamed("spring_news")).length, 1, "no WhatsApp row came with it");
  },
);

test(
  "a message with no values takes none, an example may be left out, and only the three keys the edge writes are kept, cleaned",
  { skip },
  async () => {
    const none = await begin(operator, {
      p_name: "plain_news",
      p_variables: [],
      p_title: "   ",
      p_body: "No values here.",
    });
    assert.equal(none.error, null, none.error?.message);
    const plain = await rowOf(none.data.id);
    assert.deepEqual(plain.variables, []);
    assert.equal(plain.title, null, "a blank title is none: its name made words");
    assert.equal(plain.created_by, operator.userId);

    const cleaned = await begin(owner, {
      p_name: "cleaned_news",
      p_title: "  Cleaned   news ",
      p_subject: "  Hello   there ",
      p_variables: [
        { position: 1, label: "  First   name ", example: "   ", ignored: "x" },
        { position: 2, label: "Offer" },
      ],
      p_body: "Hi {{1}}, {{2}}",
    });
    assert.equal(cleaned.error, null, cleaned.error?.message);
    const row = await rowOf(cleaned.data.id);
    assert.deepEqual(row.variables, [
      { position: 1, label: "First name", example: null },
      { position: 2, label: "Offer", example: null },
    ]);
    assert.equal(row.title, "Cleaned news");
    assert.equal(row.components[0].text, "Hello there", "the subject's white space is read as one space");

    const edge = await begin(owner, {
      p_name: "edge_values",
      p_variables: [{ position: 1, label: "x".repeat(40), example: "y".repeat(100) }],
      p_title: "t".repeat(60),
      p_subject: "x".repeat(60),
      p_body: "x".repeat(2000),
    });
    assert.equal(edge.error, null, "the limits themselves are allowed");
  },
);

test(
  "a text of an offer is refused with contracts' own sentence and writes nothing; a text of a message about a visit is written, with no subject",
  { skip },
  async () => {
    const offer = await begin(owner, {
      p_name: "spring_text",
      p_channel: "sms",
      p_subject: "ignored",
      p_body: "Hi {{1}}",
    });
    assert.equal(offer.error?.code, "22023");
    assert.equal(
      offer.error.message,
      channelNeverCarries("sms", "marketing"),
      "the sentence the ticks and the sends say",
    );
    assert.equal(offer.error.message, "Texts carry no offers.");
    assert.deepEqual(await rowsNamed("spring_text"), []);

    const visit = await begin(owner, {
      p_name: "visit_text",
      p_channel: "sms",
      p_category: "utility",
      p_subject: "ignored",
      p_body: "  Hi {{1}}, see you soon.  ",
    });
    assert.equal(visit.error, null, visit.error?.message);
    assert.equal(visit.data.channel, "sms");
    const row = await rowOf(visit.data.id);
    assert.equal(row.category, "utility");
    assert.deepEqual(row.components, [{ type: "BODY", text: "Hi {{1}}, see you soon." }], "a text has no subject");
    assert.equal(row.meta_status, "approved");

    // An email of an offer is the message's own channel.
    assert.equal((await begin(owner, { p_name: "spring_mail" })).error, null);
  },
);

test(
  "a message that exists is never begun again, in any language or on any channel: a second writer overwrites neither its category nor its values",
  { skip },
  async () => {
    const first = await begin(owner, { p_name: "visit_check", p_category: "utility", p_title: "Visit check" });
    assert.equal(first.error, null, first.error?.message);
    const hidden = await seedTemplate({
      tenant_id: A,
      channel: "email",
      name: "hidden_note",
      language: "en_US",
      body_preview: "Hi",
      components: [{ type: "BODY", text: "Hi" }],
      hidden_at: new Date().toISOString(),
    });
    assert.ok(hidden);
    const refused = [
      ["the same email again", { p_name: "visit_check" }],
      ["its email in another language", { p_name: "visit_check", p_language: "es" }],
      ["its text in its language", { p_name: "visit_check", p_channel: "sms" }],
      ["its text in another language", { p_name: "visit_check", p_channel: "sms", p_language: "es" }],
      ["a message that has a WhatsApp row", { p_name: "visit_reminder", p_language: "fr", p_category: "utility" }],
      ["a message the workspace hid", { p_name: "hidden_note", p_language: "es", p_category: "utility" }],
    ];
    for (const [why, over] of refused) {
      const r = await begin(owner, { p_category: "utility", p_variables: [], p_body: "Hello", ...over });
      assert.equal(r.error?.code, "23505", why);
      assert.equal(r.error.message, "This message already exists. Write its other versions in the Library.", why);
    }
    assert.deepEqual(
      (await rowsNamed("visit_check")).map((x) => [x.channel, x.language, x.category, x.title]),
      [["email", "en_US", "utility", "Visit check"]],
      "nothing was written beside it, and nothing of it was changed",
    );

    // The versions after the first are 00296's door, which takes the category, the values and the title from the row.
    const next = await save(operator, {
      p_name: "visit_check",
      p_channel: "sms",
      p_subject: "",
      p_body: "Hi {{1}}",
    });
    assert.equal(next.error, null, next.error?.message);
    const text = await rowOf(next.data.id);
    assert.equal(text.category, "utility");
    assert.deepEqual(text.variables, BEGIN_VARIABLES);
    assert.equal(text.title, "Visit check");
  },
);

test("two first writers of one name take turns: one writes it and the other is told it exists", { skip }, async () => {
  for (let round = 1; round <= 4; round++) {
    const name = `race_news_${round}`;
    const [a, b] = await Promise.all([
      begin(owner, { p_name: name, p_language: "en_US", p_category: "utility" }),
      begin(operator, {
        p_name: name,
        p_language: "es",
        p_category: "utility",
        p_channel: round % 2 ? "sms" : "email",
      }),
    ]);
    const errors = [a, b].filter((r) => r.error).map((r) => r.error.code);
    assert.deepEqual(errors, ["23505"], `round ${round}: exactly one is refused, as a conflict`);
    assert.equal((await rowsNamed(name)).length, 1, `round ${round}: one first version, not two`);
  }
});

test(
  "what it refuses, in a person's words: the name, the channel, the language, the words' lengths, the category, the values, the title",
  { skip },
  async () => {
    const before = (await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A)).count;
    const say = async (over, code, words) => {
      const r = await begin(owner, { p_name: "refused_news", p_category: "utility", ...over });
      assert.equal(r.error?.code, code, JSON.stringify(over));
      assert.match(r.error.message, words, JSON.stringify(over));
    };
    await say({ p_name: "" }, "P0002", /Message not found/);
    await say({ p_name: "x".repeat(61) }, "22023", /name is at most 60/);
    await say({ p_name: "reach_out_0123456789abcdef" }, "22023", /edited in the reach-out/);
    await say({ p_channel: "whatsapp" }, "22023", /email or text/);
    await say({ p_channel: "voice" }, "22023", /email or text/);
    await say({ p_language: "english" }, "22023", /language/);
    await say({ p_subject: "   " }, "22023", /subject/);
    await say({ p_subject: "x".repeat(61) }, "22023", /at most 60/);
    await say({ p_body: " \n " }, "22023", /Write the email/);
    await say({ p_body: "x".repeat(2001) }, "22023", /at most 2000/);
    await say({ p_channel: "sms", p_body: "" }, "22023", /Write the text/);
    await say({ p_channel: "sms", p_body: "x".repeat(1601) }, "22023", /at most 1600/);
    for (const category of [null, "", "Marketing", "authentication", "offer"])
      await say({ p_category: category }, "22023", /offer or news, or about their own visit or proposal/);
    const values = /Give each value a number, in order from 1, and a name/;
    for (const variables of [
      null,
      {},
      "1",
      [1],
      [null],
      [{ position: 2, label: "A" }],
      [{ position: 0, label: "A" }],
      [
        { position: 1, label: "A" },
        { position: 3, label: "B" },
      ],
      [
        { position: 1, label: "A" },
        { position: 1, label: "B" },
      ],
      [
        { position: 2, label: "B" },
        { position: 1, label: "A" },
      ],
      [{ position: 1.5, label: "A" }],
      [{ position: "1", label: "A" }],
      [{ label: "A" }],
      [{ position: 1 }],
      [{ position: 1, label: "   " }],
      [{ position: 1, label: 7 }],
      [{ position: 1, label: "A", example: 7 }],
    ])
      await say({ p_variables: variables }, "22023", values);
    await say({ p_variables: [{ position: 1, label: "x".repeat(41) }] }, "22023", /name is at most 40/);
    await say(
      { p_variables: [{ position: 1, label: "A", example: "y".repeat(101) }] },
      "22023",
      /example is at most 100/,
    );
    await say({ p_title: "x".repeat(61) }, "22023", /A title is at most 60 characters/);
    const after = (await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A)).count;
    assert.equal(after, before, "none of them wrote a row");

    // A title is held to the title door's own length and words (00050): one sentence, whichever door says it.
    const named = await owner.client.rpc("set_template_title", { p_template_id: whatsappId, p_title: "x".repeat(61) });
    const titled = await begin(owner, { p_name: "refused_news", p_title: "x".repeat(61) });
    assert.equal(titled.error.message, named.error.message);
  },
);

test(
  "who may begin a message: an owner or an operator of the workspace; a viewer, a stranger and a signed-out caller may not",
  { skip },
  async () => {
    const before = (await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A)).count;
    const asViewer = await begin(viewer, { p_name: "who_news" });
    assert.equal(asViewer.error?.code, "P0002", "a viewer changes nothing: not found, as a stranger reads it");
    assert.equal(asViewer.error.message, "Message not found.");
    const asStranger = await begin(stranger, { p_name: "who_news" });
    assert.equal(asStranger.error?.code, "P0002");
    assert.equal(asStranger.error.message, "Message not found.");
    const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
    const asAnon = await begin({ client: anon }, { p_name: "who_news" });
    assert.equal(asAnon.error?.code, "42501", "the logged-out key holds no door");
    const noUser = await begin({ client: db }, { p_name: "who_news" });
    assert.equal(noUser.error?.code, "28000", "the service role has no person, and a door that names one says sign in");
    const after = (await db.from("templates").select("id", { count: "exact", head: true }).eq("tenant_id", A)).count;
    assert.equal(after, before, "none of them wrote a row");
    assert.deepEqual(await rowsNamed("who_news"), []);
    assert.equal((await begin(owner, { p_name: "who_news_owner" })).error, null);
    assert.equal((await begin(operator, { p_name: "who_news_operator" })).error, null);
    // Another workspace's rows are no reason to refuse: a name is a workspace's own.
    const theirs = await begin(stranger, { p_tenant_id: B, p_name: "visit_reminder", p_category: "utility" });
    assert.equal(theirs.error, null, "B holds no row of that name, though A does");
  },
);

test("a message has no kind to set afterwards: there is no set_message_kind", { skip }, () => {
  const rows = catalog(
    "select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_message_kind') as kind, " +
      "exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'create_message_version') as door",
  );
  assert.deepEqual(rows, [{ kind: false, door: true }]);
});
