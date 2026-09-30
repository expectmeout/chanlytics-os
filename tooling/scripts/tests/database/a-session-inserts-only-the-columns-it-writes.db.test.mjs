/**
 * A session inserts only the columns the product writes through it (00283), on a real Postgres with a real session.
 *
 * A row policy decides which rows a member may add, never which columns, and Supabase hands authenticated INSERT on
 * the whole table: a member's session could write the columns the edge owns (a message's provider id or delivery
 * time, a broadcast's failure and finish, a playbook's last run, an id or a stamp of its own choosing). Each table a
 * session may insert into now grants the columns the dashboard writes and no others, so the same rows the product
 * writes are still theirs to add, and a column the edge owns is refused as a missing privilege, not a policy.
 * Runs against the database `supabase start` builds, never production.
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
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
const made = { users: [], tenants: [] };
const PASSWORD = "insert-fence-test-password-1";
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};
/** The privilege's refusal: a column the session holds no INSERT on, not a row policy's. */
const noPrivilege = (r, why) => {
  assert.ok(r.error, `REGRESSION: written: ${why}`);
  assert.equal(r.error.code, "42501", `${why}: ${r.error.message}`);
  assert.match(r.error.message, /permission denied/i, `a missing privilege, not the row policy: ${why}`);
};

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

let w;
let me;

before(async () => {
  if (skip) return;
  const t = ok(
    await admin
      .from("tenants")
      .insert({ name: "Insert fence", slug: `insert-fence-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const contact = ok(
    await admin.from("contacts").insert({ tenant_id: t, phone_e164: "+15555550171" }).select("id").single(),
    "contact",
  ).id;
  const conversation = ok(
    await admin.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  const template = ok(
    await admin
      .from("templates")
      .insert({ tenant_id: t, channel: "whatsapp", name: "visit_reminder", language: "en_US", meta_status: "approved" })
      .select("id")
      .single(),
    "template",
  ).id;
  w = { t, contact, conversation, template };
  const email = `insert-fence-${RUN}@example.com`;
  const u = ok(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), "user").user;
  made.users.push(u.id);
  ok(await admin.from("memberships").insert({ user_id: u.id, tenant_id: t, role: "owner" }), "membership");
  const session = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await session.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");
  me = { id: u.id, session };
});

test(
  "a reply is queued with the columns the product writes, and never with the edge's: the provider's id, its times, the media, the error",
  { skip },
  async () => {
    const reply = (over) =>
      me.session
        .from("messages")
        .insert({
          tenant_id: w.t,
          conversation_id: w.conversation,
          contact_id: w.contact,
          channel: "whatsapp",
          direction: "outbound",
          sender: "human",
          sent_by: me.id,
          status: "queued",
          type: "text",
          body: "See you at 3",
          content_hash: "h1",
          ...over,
        })
        .select("id");
    ok(await reply({}), "a reply as the product writes it");
    noPrivilege(await reply({ external_id: "wamid.forged" }), "a provider's message id");
    noPrivilege(await reply({ channel_ts: new Date().toISOString() }), "the provider's timestamp");
    noPrivilege(await reply({ status_updated_at: new Date().toISOString() }), "a delivery time");
    noPrivilege(
      await reply({ media: { path: "another/workspace/photo.jpg" } }),
      "a media path (00260 keeps these the edge's)",
    );
    noPrivilege(await reply({ error: { reason: "spoofed" } }), "an error the edge wrote");
  },
);

test(
  "a run is made with the columns the product writes: its start, finish and failure are the edge's; its people carry no delivery state",
  { skip },
  async () => {
    const run = (over) =>
      me.session
        .from("broadcasts")
        .insert({
          tenant_id: w.t,
          name: "Spring reminder",
          template_id: w.template,
          template_name: "visit_reminder",
          template_language: "en_US",
          params: [],
          audience: { kind: "list", id: "x", label: "Everyone" },
          state: "scheduled",
          scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
          recipient_count: 1,
          created_by: me.id,
          ...over,
        })
        .select("id");
    const made1 = ok(await run({}), "a run as the product writes it");
    noPrivilege(await run({ finished_at: new Date().toISOString() }), "a run born finished");
    noPrivilege(await run({ started_at: new Date().toISOString() }), "a run born started");
    noPrivilege(await run({ failure: "spoofed" }), "a failure the edge would write");
    const recipient = (over) =>
      me.session
        .from("broadcast_recipients")
        .insert({ broadcast_id: made1[0].id, contact_id: w.contact, tenant_id: w.t, ...over });
    noPrivilege(await recipient({ state: "sent" }), "a recipient born sent");
    noPrivilege(await recipient({ sent_at: new Date().toISOString() }), "a delivery time");
    ok(await recipient({}), "a recipient as the product writes it");
  },
);

test(
  "a playbook starts without a last run, and a decision, an Ask thread and a list are added with the columns the product writes",
  { skip },
  async () => {
    const playbook = (over) =>
      me.session
        .from("playbooks")
        .insert({
          tenant_id: w.t,
          name: "Reminders",
          trigger: "visit_tomorrow",
          template_id: w.template,
          template_name: "visit_reminder",
          template_language: "en_US",
          params: [],
          policy_class: "follow_up",
          state: "running",
          run_hour: 9,
          cap_per_run: 50,
          gap_days: 14,
          cadence_days: 30,
          created_by: me.id,
          ...over,
        })
        .select("id");
    ok(await playbook({}), "a playbook as the product writes it");
    noPrivilege(await playbook({ last_run_for: "2026-01-01" }), "a run day already written: the sweep would skip it");
    noPrivilege(await playbook({ last_run_at: new Date().toISOString() }), "a last run already written");

    const decision = (over) =>
      me.session
        .from("decisions")
        .insert({
          tenant_id: w.t,
          subject_type: "contact",
          subject_id: w.contact,
          verb: "edit",
          actor_type: "user",
          actor_user_id: me.id,
          payload: {},
          ...over,
        })
        .select("id");
    ok(await decision({}), "a decision as the ledger writes it");
    noPrivilege(await decision({ id: crypto.randomUUID() }), "an id of its own choosing");
    noPrivilege(await decision({ created_at: "2020-01-01T00:00:00Z" }), "a time of its own choosing");

    const thread = ok(
      await me.session
        .from("ask_threads")
        .insert({ tenant_id: w.t, user_id: me.id, title: "A question", scope: null })
        .select("id"),
      "an Ask thread as the product writes it",
    );
    const turn = (over) =>
      me.session
        .from("ask_messages")
        .insert({ thread_id: thread[0].id, tenant_id: w.t, user_id: me.id, role: "user", content: [], ...over })
        .select("id");
    ok(await turn({}), "an Ask message as the product writes it");
    noPrivilege(await turn({ id: crypto.randomUUID() }), "an id of its own choosing");
    noPrivilege(
      await me.session
        .from("ask_threads")
        .insert({ tenant_id: w.t, user_id: me.id, title: "x", last_at: "2020-01-01T00:00:00Z" })
        .select("id"),
      "a last-seen stamp of its own choosing",
    );

    const list = ok(
      await me.session.from("segments").insert({ tenant_id: w.t, name: "Regulars", created_by: me.id }).select("id"),
      "a list as the product writes it",
    );
    noPrivilege(
      await me.session
        .from("segments")
        .insert({ tenant_id: w.t, name: "Hidden", archived_at: new Date().toISOString() }),
      "a list born archived",
    );
    ok(
      await me.session
        .from("segment_members")
        .insert({ segment_id: list[0].id, contact_id: w.contact, tenant_id: w.t, added_by: me.id }),
      "a member of it, as the product writes it",
    );
    ok(
      await me.session
        .from("policies")
        .insert({ tenant_id: w.t, class: "reply", mode: "ask", subject_type: "contact", subject_id: w.contact }),
      "a person's reply mode",
    );
    noPrivilege(
      await me.session
        .from("policies")
        .insert({ tenant_id: w.t, class: "follow_up", mode: "ask", updated_at: "2020-01-01T00:00:00Z" }),
      "a stamp of its own choosing",
    );
  },
);
