/**
 * An owner's correction is kept (00448, decision 0063), on a real Postgres, as real sessions: the held drafts counted by
 * intent the way receptionist_series counts its hold; the corrections found (a rewritten draft's instruction, the owner's
 * first text after a hold the receptionist opened) and nothing else, each handed over once; a look that passed becomes a
 * suggestion and a line on the bell; a member keeps or dismisses it once, which closes that line; a stranger, a viewer and
 * a session calling the service role's doors are refused. Runs against the database `supabase start` builds on this
 * machine, never production.
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
      ? "refusing a database that is not on this machine: this suite makes users, workspaces and messages"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

const MIN = 60_000;
const w = {};
const users = [];
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const ago = (min) => new Date(Date.now() - min * MIN).toISOString();

/** A real session for a fresh user with this role in this workspace. */
async function member(role, tenant) {
  const email = `fact-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await w.admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await w.admin.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  return { client, id: made.data.user.id };
}

/** A person and their thread in a workspace. */
async function thread(tenant = w.tenant, phone = `+1305555${Math.floor(1000 + Math.random() * 8999)}`) {
  const contact = ok(
    await w.admin.from("contacts").insert({ tenant_id: tenant, phone_e164: phone }).select("id").single(),
  ).id;
  const id = ok(
    await w.admin.from("conversations").insert({ tenant_id: tenant, contact_id: contact }).select("id").single(),
  ).id;
  return { id, contact, tenant };
}

/** One message of a thread, as the doors write them. */
const say = async (t, row) =>
  ok(
    await w.admin
      .from("messages")
      .insert({
        tenant_id: t.tenant,
        conversation_id: t.id,
        contact_id: t.contact,
        channel: "whatsapp",
        type: "text",
        ...row,
      })
      .select("id")
      .single(),
  ).id;
const customer = (t, body, min) =>
  say(t, { direction: "inbound", sender: "customer", body, status: "received", created_at: ago(min) });
const draft = (t, meta, status, min, error = null) =>
  say(t, { direction: "outbound", sender: "ai", body: "A draft", status, meta, error, created_at: ago(min) });
const owner = (t, body, min) =>
  say(t, { direction: "outbound", sender: "human", body, status: "sent", created_at: ago(min) });
const hold = async (t, reason, min) =>
  ok(
    await w.admin
      .from("escalations")
      .insert({ tenant_id: t.tenant, conversation_id: t.id, reason, created_at: ago(min) })
      .select("id")
      .single(),
  ).id;

/** The corrections not yet looked at, of this workspace (the doors read every workspace's). */
const corrections = async () =>
  ok(await w.admin.rpc("fact_corrections", { p_limit: 50 })).filter((c) => c.tenant_id === w.tenant);
const candidates = async () =>
  ok(await w.admin.rpc("fact_candidates", { p_limit: 50 })).filter((c) => c.tenant_id === w.tenant);

before(async () => {
  if (skip) return;
  w.admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const stamp = Date.now().toString(36);
  w.tenant = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `facts-${stamp}`, name: "Facts" })
      .select("id")
      .single(),
  ).id;
  w.other = ok(
    await w.admin
      .from("tenants")
      .insert({ slug: `facts-other-${stamp}`, name: "Other" })
      .select("id")
      .single(),
  ).id;
  ok(
    await w.admin.from("tenant_config").upsert({
      tenant_id: w.tenant,
      config: {
        brain: {
          profile: {
            notes: [{ title: "Parking", text: "Behind the shop." }],
            services: [{ name: "Balayage" }],
          },
        },
      },
    }),
  );
  w.owner = await member("owner", w.tenant);
  w.viewer = await member("viewer", w.tenant);
  w.stranger = await member("owner", w.other);
});

after(async () => {
  if (skip || !w.admin) return;
  for (const t of [w.tenant, w.other].filter(Boolean)) {
    for (const table of [
      "fact_suggestions",
      "notifications",
      "events",
      "escalations",
      "messages",
      "conversations",
      "contacts",
    ])
      await w.admin.from(table).delete().eq("tenant_id", t);
    await w.admin.from("tenants").delete().eq("id", t);
  }
  for (const id of users) await w.admin.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the held drafts are counted by intent, each once, the way receptionist_series counts its hold",
  { skip },
  async () => {
    const t = await thread();
    const v = (intent) => ({ source: "veto_window", intent });
    await draft(t, v("booking"), "sent", 50);
    await draft(t, v("booking"), "canceled", 49);
    await draft(t, v("booking"), "canceled", 48, { reason: "steered" });
    await draft(t, v("booking"), "canceled", 47, { reason: "superseded_by_human" });
    await draft(t, v("pricing"), "delivered", 46);
    await draft(t, { source: "low_confidence" }, "queued", 45);
    await draft(t, v("booking"), "canceled", 44, { reason: "superseded_by_newer_message" });
    // Not held drafts: a rewrite (its draft is counted as steered), a backfilled row, a reply that went at once.
    await draft(t, { source: "steered", steer: "shorter" }, "sent", 43);
    await draft(t, { ...v("booking"), backfill: "true" }, "sent", 42);
    await draft(t, { source: "receptionist" }, "sent", 41);

    const rows = ok(await w.owner.client.rpc("held_drafts_by_intent", { p_tenant_id: w.tenant, p_days: 30 }));
    const by = Object.fromEntries(rows.map((r) => [r.intent, r]));
    assert.deepEqual(
      [by.booking.held, by.booking.sent, by.booking.canceled, by.booking.steered, by.booking.person_first],
      [5, 1, 1, 1, 1],
    );
    assert.deepEqual([by.pricing.held, by.pricing.sent], [1, 1]);
    assert.deepEqual([by.other.held, by.other.sent], [1, 0], "a draft with no intent is counted as other");

    const series = ok(await w.owner.client.rpc("receptionist_series", { p_tenant_id: w.tenant, p_days: 30 }));
    const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
    const h = series.hold.now;
    assert.deepEqual(
      [sum("held"), sum("sent"), sum("steered"), sum("canceled"), sum("person_first")],
      [h.total, h.sent, h.steered, h.canceled, h.person_first],
      "one rule for what became of a held draft, read the same way by both",
    );
    // A stranger reads nothing of it: the caller's row security decides.
    assert.deepEqual(ok(await w.stranger.client.rpc("held_drafts_by_intent", { p_tenant_id: w.tenant })), []);
  },
);

test(
  "the corrections are a rewritten draft's instruction and the owner's first text after a hold, each handed over once",
  { skip },
  async () => {
    // A held draft rewritten to the owner's instruction.
    const a = await thread();
    await customer(a, "Are you open on Monday?", 30);
    const was = await draft(a, { source: "veto_window", intent: "faq" }, "canceled", 29, { reason: "steered" });
    const steered = await draft(
      a,
      { source: "steered", steer: "Tell her we are closed on Mondays now", steered_from: was },
      "queued",
      28,
    );
    // The owner answering a thread the receptionist handed them, then writing again.
    const b = await thread();
    await customer(b, "Do you do eyebrow threading?", 25);
    await say(b, {
      direction: "outbound",
      sender: "ai",
      body: "Let me check with the team.",
      status: "sent",
      created_at: ago(24),
    });
    await hold(b, "human_token", 24);
    const replied = await owner(b, "Yes we do eyebrow threading every day but Sunday", 20);
    await owner(b, "See you soon!", 19);
    // Not corrections: an owner's text with no hold, one after a stop, and a rewrite with no instruction.
    const c = await thread();
    await owner(c, "Happy birthday from all of us at the shop", 15);
    const d = await thread();
    await hold(d, "opt_out", 14);
    await owner(d, "Sorry to see you go, you are off our list now", 13);
    await draft(c, { source: "steered", steer: "" }, "queued", 12);

    // This test's threads: the first test's thread holds a rewrite of its own ("shorter"), a correction too.
    const mine = new Set([a.id, b.id, c.id, d.id]);
    const found = (await corrections()).filter((f) => mine.has(f.conversation_id));
    assert.deepEqual(
      found.map((f) => [f.source, f.message_id]),
      [
        ["steer", steered],
        ["reply", replied],
      ],
    );
    assert.deepEqual(
      found.map((f) => [f.words, f.said]),
      [
        ["Tell her we are closed on Mondays now", "A draft"],
        ["Yes we do eyebrow threading every day but Sunday", "Let me check with the team."],
      ],
    );

    const all = await candidates();
    assert.equal(all.length, 3, "this test's two, and the first test's rewrite");
    const handed = all.filter((h) => mine.has(h.conversation_id));
    assert.equal(handed.length, 2);
    const steer = handed.find((h) => h.source === "steer");
    assert.deepEqual(steer.asked, ["Are you open on Monday?"]);
    assert.deepEqual(steer.known.sort(), ["Balayage", "Parking. Behind the shop."]);
    assert.deepEqual([steer.notes_count, steer.workspace_today, steer.conversation_id], [1, 0, a.id]);
    // Stamped as they were handed over: a second batch takes neither, and each is a look that said nothing yet.
    assert.deepEqual(await candidates(), []);
    assert.deepEqual(await corrections(), []);
    const looks = ok(await w.admin.from("fact_suggestions").select("state, source").eq("tenant_id", w.tenant));
    assert.deepEqual(
      looks.map((l) => l.state),
      ["nothing", "nothing", "nothing"],
    );
    w.looks = handed;
  },
);

test(
  "a look that passed is a suggestion and a line on the bell; a member keeps or dismisses it once, which ends that line",
  { skip },
  async () => {
    assert.ok(w.looks, "the corrections test ran first");
    // The rewrite's look first, then the reply's: the batch hands them over oldest first, but says no order of its own.
    const first = w.looks.find((l) => l.source === "steer");
    const second = w.looks.find((l) => l.source === "reply");
    // The service role's doors are no session's.
    const tried = await w.owner.client.rpc("fact_suggest", { p_id: first.id, p_title: "x", p_body: "y", p_quote: "z" });
    assert.ok(tried.error, "a member may not call the sweep's door");
    assert.ok((await w.owner.client.rpc("fact_candidates", { p_limit: 5 })).error, "nor take a batch");

    const said = ok(
      await w.admin.rpc("fact_suggest", {
        p_id: first.id,
        p_title: "Mondays",
        p_body: "We are closed on Mondays.",
        p_quote: "we are closed on Mondays now",
      }),
    );
    assert.equal(said.suggestion.state, "suggested");
    assert.deepEqual(
      ok(await w.admin.rpc("fact_suggest", { p_id: first.id, p_title: "a", p_body: "b", p_quote: "c" })),
      { error: "not_found" },
      "a look is said once",
    );
    assert.deepEqual(
      ok(await w.admin.rpc("fact_suggest", { p_id: second.id, p_title: " ", p_body: "b", p_quote: "c" })),
      {
        error: "empty",
      },
    );
    ok(
      await w.admin.rpc("fact_suggest", {
        p_id: second.id,
        p_title: "Threading",
        p_body: "We do eyebrow threading every day but Sunday.",
        p_quote: "we do eyebrow threading every day but Sunday",
      }),
    );
    const bell = ok(
      await w.admin
        .from("notifications")
        .select("kind, title, route, subject_type, subject_id, closed_at")
        .eq("tenant_id", w.tenant)
        .eq("kind", "note_to_keep")
        .order("created_at", { ascending: true }),
    );
    assert.deepEqual(
      bell.map((n) => [n.title, n.route, n.subject_type, n.subject_id, n.closed_at]),
      [
        ["The receptionist can learn from your rewrite", "admin/autonomy", "fact_suggestion", first.id, null],
        ["The receptionist can learn from your reply", "admin/autonomy", "fact_suggestion", second.id, null],
      ],
    );

    // The workspace's members read what waits; a stranger reads nothing, and nobody writes the table but the doors.
    const seen = ok(await w.owner.client.from("fact_suggestions").select("id, state").eq("state", "suggested"));
    assert.equal(seen.length, 2);
    assert.deepEqual(ok(await w.stranger.client.from("fact_suggestions").select("id").eq("tenant_id", w.tenant)), []);
    await w.owner.client.from("fact_suggestions").update({ state: "kept" }).eq("id", first.id);
    assert.equal(
      ok(await w.admin.from("fact_suggestions").select("state").eq("id", first.id).single()).state,
      "suggested",
    );

    // A stranger and a viewer are told it does not exist.
    for (const who of [w.stranger, w.viewer]) {
      const r = await who.client.rpc("fact_suggestion_answer", { p_id: first.id, p_keep: true });
      assert.match(r.error?.message ?? "", /not found/i);
    }
    const kept = ok(
      await w.owner.client.rpc("fact_suggestion_answer", { p_id: first.id, p_keep: true, p_config_version: 7 }),
    );
    assert.deepEqual(kept.suggestion, { id: first.id, state: "kept" });
    const row = ok(await w.admin.from("fact_suggestions").select("*").eq("id", first.id).single());
    assert.deepEqual([row.state, row.decided_by, row.config_version], ["kept", w.owner.id, 7]);
    assert.deepEqual(ok(await w.owner.client.rpc("fact_suggestion_answer", { p_id: first.id, p_keep: false })), {
      error: "answered",
      state: "kept",
    });
    const dismissed = ok(await w.owner.client.rpc("fact_suggestion_answer", { p_id: second.id, p_keep: false }));
    assert.equal(dismissed.suggestion.state, "dismissed");
    const after2 = ok(await w.admin.from("fact_suggestions").select("config_version").eq("id", second.id).single());
    assert.equal(after2.config_version, null, "a dismissal writes no version");

    const closed = ok(
      await w.admin.from("notifications").select("closed_at").eq("tenant_id", w.tenant).eq("kind", "note_to_keep"),
    );
    assert.ok(
      closed.every((n) => n.closed_at),
      "each answer ended its line on the bell, for everyone",
    );
    const kinds = ok(
      await w.admin
        .from("events")
        .select("kind, data")
        .eq("tenant_id", w.tenant)
        .like("kind", "settings.fact_%")
        .order("created_at", { ascending: true }),
    );
    assert.deepEqual(
      kinds.map((e) => e.kind),
      ["settings.fact_suggested", "settings.fact_suggested", "settings.fact_kept", "settings.fact_dismissed"],
    );
    assert.ok(
      kinds.every((e) => !JSON.stringify(e.data).includes("Mondays")),
      "the ledger carries no words",
    );
  },
);
