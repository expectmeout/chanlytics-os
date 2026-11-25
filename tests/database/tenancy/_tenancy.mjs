/**
 * The world the tests of tenancy/ share. Split by behaviour from tenancy.db.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * Every tenant table keeps its tenancy -- on a real Postgres with real
 * sessions.
 *
 * Forty tables carry a tenant_id, and each got its policies when it was
 * built; four suites prove four of them with real sessions and the rest were
 * proved by reading SQL. This is the proof across the schema: for every
 * table, a member of the workspace reads what the policy says a member reads
 * (the workspace's rows, their own rows, or nothing -- the service role's
 * tables), a member of another workspace reads none of it and can neither
 * change, remove nor add a row in it, and a viewer changes nothing anywhere.
 * For the service role's tables "nothing" is the privilege itself refused
 * (42501), not an empty list: RLS with no policy and a forgotten revoke read
 * the same until someone grants the second one something.
 * The list of tables is checked against the database's own description of
 * itself (PostgREST's OpenAPI root), so a tenant table nobody added a proof
 * for fails here by name.
 *
 * The sessions are real: users are made with the admin API and sign in with
 * a password through the anon key, so RLS judges them as the dashboard's
 * client would. Runs the way activations.db.test.mjs does, against the
 * database `supabase start` builds on this machine, never production.
 */
import { before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { showSecondFactor } from "../../_second-factor.mjs";

export const URL_ = process.env.SUPABASE_URL;

export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const ANON = process.env.SUPABASE_ANON_KEY;

export const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes users and rows in every table"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the sessions this suite signs in with need it"
        : false;

export let db;

export let A;
// the workspace under test
export let B;
// another workspace
export const users = [];

export const ctx = {};
// ids the fixtures need
export let viewer;
// a member of A who may only read
export let owner;
// another member of A: for the own-rows tables, someone else
export let stranger;
// an owner of B
export let partner;
// the partner who brought A (0012): a member of A, and the one reader of its earnings
export const probes = [];
// service-only rows to remove after

/** A real session for a fresh user with this role in this workspace. */
export async function memberClient(role, tenant) {
  const email = `tenancy-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  const m = await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role });
  assert.equal(m.error, null, m.error?.message);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const s = await client.auth.signInWithPassword({ email, password });
  assert.equal(s.error, null, s.error?.message);
  // A partner's seat reads nothing until the session shows its second factor (0013, 00218); this matrix is about
  // what each role reads once it may, so the partner's session has.
  if (role === "partner") await showSecondFactor(client);
  return { client, userId: made.data.user.id };
}

export async function seed(table, row, pick = "id") {
  const q = db.from(table).insert(row);
  const r = pick ? await q.select(pick).single() : await q;
  assert.equal(r.error, null, `seeding ${table}: ${r.error?.message}`);
  return pick ? r.data[pick] : null;
}

/** An ad's entry (00644), but for its workspace and its message: members read theirs, and only its one door writes. */
export const AD_ENTRY = { platform: "meta", platform_ad_id: "tenancy-ad", kind: "chat", new_person: false };

/** An owner's ad account and one of its ads (00648): members read theirs, and only their doors write. */
export const AD_ACCOUNT = { platform: "meta", status: "disconnected" };

export const AD = {
  platform: "meta",
  origin: "platform",
  name: "Tenancy ad",
  door: "whatsapp",
  status: "made",
  intent: "on",
};

/** Rows some tables get from the workspace's own creation (00017 provisions them). */
export async function ensure(table, row) {
  const has = await db.from(table).select("tenant_id").eq("tenant_id", A).limit(1);
  assert.equal(has.error, null, `${table}: ${has.error?.message}`);
  if (has.data.length === 0) await seed(table, row, null);
}

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const a = await db
    .from("tenants")
    .insert({ slug: `tenancy-${Date.now()}`, name: "Tenancy" })
    .select("id")
    .single();
  assert.equal(a.error, null, a.error?.message);
  A = a.data.id;
  const b = await db
    .from("tenants")
    .insert({ slug: `tenancy-other-${Date.now()}`, name: "Other" })
    .select("id")
    .single();
  assert.equal(b.error, null, b.error?.message);
  B = b.data.id;
  viewer = await memberClient("viewer", A);
  owner = await memberClient("owner", A);
  stranger = await memberClient("owner", B);
  ctx.viewerId = viewer.userId;
  ctx.ownerId = owner.userId;
  ctx.strangerId = stranger.userId;

  // One row per tenant table, in dependency order. A second contact and
  // conversation exist so a stranger's attempted insert is refused by RLS,
  // never by a unique index on the first.
  ctx.contact = await seed("contacts", { tenant_id: A, phone_e164: "+15550001001" });
  ctx.contact2 = await seed("contacts", { tenant_id: A, phone_e164: "+15550001002" });
  await seed("contact_identities", {
    tenant_id: A,
    contact_id: ctx.contact,
    channel: "whatsapp",
    external_id: "15550001001",
  });
  ctx.conversation = await seed("conversations", { tenant_id: A, contact_id: ctx.contact });
  ctx.conversation2 = await seed("conversations", { tenant_id: A, contact_id: ctx.contact2 });
  ctx.message = await seed("messages", {
    tenant_id: A,
    conversation_id: ctx.conversation,
    contact_id: ctx.contact,
    channel: "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "tenancy probe",
    status: "queued",
  });
  await seed("calls", { tenant_id: A, retell_call_id: "call_tenancy_1" });
  // The workspace's receptionist at Retell, kept before any number (00476, decision 0069): the service role's alone, and
  // keyed by its workspace, so no id to pick. A typed rehearsal: members read their workspace's, and only the doors write.
  await seed("voice_agents", { tenant_id: A, agent_id: "agent_tenancy1", llm_id: "llm_tenancy1" }, null);
  await seed("rehearsals", { tenant_id: A, kind: "typed" });
  // What was brought in, and what the profile and the website say (00477, 00479; decision 0073): members read theirs,
  // and only the doors and the service role write.
  await seed("imports", { tenant_id: A, source: "calendar", state: "done" }, null);
  await seed("business_reads", { tenant_id: A, source: "website", facts: {} }, null);
  // What the workspace said of a sender, and what its mailbox left (00483): members read theirs, the doors write.
  await seed("mailbox_senders", { tenant_id: A, sender: "news.example", verdict: "automated" }, null);
  await seed("mailbox_left", { tenant_id: A, address: "deals@news.example", why: "gmail_tab" }, null);
  await seed("mailbox_sender_reads", { tenant_id: A, address: "offers@news.example", kind: "pitch" }, null);
  await seed("escalations", { tenant_id: A, conversation_id: ctx.conversation, reason: "manual", details: "tenancy" });
  // When the thread's person last wrote on WhatsApp (00484); the stranger's attempt is a text, so one a thread and wire
  // refuses nothing on its own.
  await seed(
    "conversation_channel_state",
    { tenant_id: A, conversation_id: ctx.conversation, channel: "whatsapp", last_inbound_at: new Date().toISOString() },
    null,
  );
  // Ask's reply drafted ahead on the thread (00475); the stranger's attempt is a brief, so one a thread and kind refuses
  // nothing on its own.
  await seed(
    "conversation_drafts",
    { tenant_id: A, conversation_id: ctx.conversation, kind: "reply", words: { text: "A draft" } },
    null,
  );
  // An owner's correction looked at (00448, decision 0063): keyed by its message, so the stranger's attempt names another.
  ctx.message2 = await seed("messages", {
    tenant_id: A,
    conversation_id: ctx.conversation2,
    contact_id: ctx.contact2,
    channel: "whatsapp",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "tenancy probe two",
    status: "queued",
  });
  await seed("fact_suggestions", {
    tenant_id: A,
    conversation_id: ctx.conversation,
    source: "reply",
    source_message_id: ctx.message,
  });
  await seed("decisions", {
    tenant_id: A,
    actor_type: "system",
    subject_type: "conversation",
    subject_id: ctx.conversation,
    verb: "archive",
  });
  await seed("events", { tenant_id: A, kind: "message.received" });
  // Whom Anthropic is told a call is for (00544, decision 0097): the service role's alone.
  await seed("anthropic_profiles", { kind: "workspace", tenant_id: A, reference_id: `workspace:${A}` }, null);
  // One model call kept in dollars (00273): the service role's model port writes it, a member of the workspace reads it.
  await seed(
    "ai_usage",
    {
      tenant_id: A,
      purpose: "ask",
      model_asked: "claude-opus-5-5",
      model: "claude-opus-5-5",
      outcome: "answered",
      input_tokens: 10,
      output_tokens: 5,
      usd: 0.0002,
    },
    null,
  );
  ctx.notification = await seed("notifications", { tenant_id: A, kind: "alert", title: "tenancy", body: "probe" });
  // The viewer's own row is theirs from the moment their seat was made (00622, memberships_start_the_bell): seeding
  // it again would be refused as a second row for one person.
  const bell = await db.from("notification_reads").select("user_id").eq("tenant_id", A).eq("user_id", ctx.viewerId);
  assert.equal(bell.data?.length, 1, `a seat's bell row is made with the seat: ${bell.error?.message ?? "none found"}`);
  await seed("notification_marks", { notification_id: ctx.notification, user_id: ctx.viewerId }, null);
  // What the viewer has seen of a person (00349): their floor, and their mark on one person. Their own rows.
  await seed("contact_reads", { tenant_id: A, user_id: ctx.viewerId }, null);
  await seed(
    "contact_marks",
    { tenant_id: A, contact_id: ctx.contact, user_id: ctx.viewerId, seen_at: new Date().toISOString() },
    null,
  );
  ctx.thread = await seed("ask_threads", { tenant_id: A, user_id: ctx.viewerId });
  await seed("ask_messages", {
    tenant_id: A,
    thread_id: ctx.thread,
    user_id: ctx.viewerId,
    role: "user",
    content: { text: "hi" },
  });
  // What Ask remembers (00470, decision 0070): a line every member reads, a day of the journal its owners read, and the
  // viewer's own morning.
  await seed("ask_memory_lines", { tenant_id: A, text: "Our best customers are dental offices", source: "pane" });
  ctx.file = await seed("files", fileRow("seeded"));
  // Where a post went, and a send of it (00611): the service role writes both, a member reads where it stands.
  ctx.post = await seed("posts", {
    tenant_id: A,
    file_id: ctx.file,
    place: "instagram",
    kind: "picture",
    status: "queued",
  });
  await seed(
    "publish_attempts",
    { tenant_id: A, post_id: ctx.post, attempt_no: 1, step: "container", request: {} },
    null,
  );
  // A video asked for (00613): its doors write it, a member reads where it stands.
  ctx.piece = await seed("pieces", {
    tenant_id: A,
    shape: "hook_cut",
    plan: {},
    look: {},
    edition: 1,
    card_key: "seeded",
  });
  // A piece's version, a shape of it as sent, and what an owner approved (00681): members read them, their doors write them.
  ctx.revision = await seed("piece_revisions", { tenant_id: A, piece_id: ctx.piece, n: 1, plan: {}, made_by: "owner" });
  await seed("piece_renditions", {
    tenant_id: A,
    piece_id: ctx.piece,
    revision: 1,
    shape: "9x16",
    file_id: ctx.file,
    path: `${A}/${ctx.file}/video.mp4`,
    checksum: "a".repeat(64),
  });
  await seed("approvals", {
    tenant_id: A,
    subject_type: "piece_revision",
    subject_id: ctx.revision,
    snapshot: {},
    snapshot_hash: "b".repeat(64),
  });
  // A week planned (00706): what the owner claims and what posts are for, a plan and a slot of it, a clip's moments.
  // Members read them, only their doors write them.
  await seed("owner_claims", { tenant_id: A, kind: "offer", text: "Seeded offer", source: "settings" });
  await seed("content_goals", { tenant_id: A, goal: "awareness" });
  ctx.plan = await seed("content_plans", { tenant_id: A, week_of: "2026-11-23", asked_by: "owner" });
  await seed("plan_slots", {
    tenant_id: A,
    plan_id: ctx.plan,
    creative: ctx.piece,
    place: "instagram",
    kind: "reel",
    at: "2026-11-24T23:00:00Z",
    title: "Seeded slot",
  });
  await seed("file_moments", {
    tenant_id: A,
    file_id: ctx.file,
    start_s: 1,
    end_s: 3,
    score: 0.9,
    confidence: 0.6,
    model_edition: 2,
  });
  // What a post said back (00699): its numbers, a person's touch of it, a comment's answer. Members read them, their
  // doors write them.
  await seed("post_observations", {
    tenant_id: A,
    post_id: ctx.post,
    place: "instagram",
    step: "1h",
    metric: "reach",
    availability: "available",
    value: 1,
    period_start: new Date(0).toISOString(),
    period_end: new Date().toISOString(),
  });
  ctx.touch = await seed("touches", {
    tenant_id: A,
    subject_type: "post",
    subject_id: ctx.post,
    kind: "comment",
    contact_id: ctx.contact,
    place: "instagram",
    provider_event_id: "seeded-comment",
    at: new Date().toISOString(),
  });
  await seed("comment_answers", { tenant_id: A, touch_id: ctx.touch, state: "drafted", draft: "Seeded." });
  // What a person removed, by fingerprint, read by no member (00551).
  await seed("files_let_go", { tenant_id: A, fingerprint: "seeded" }, null);
  // A website's key and an entry it sent (00675): members read them, only their doors write them.
  await seed("form_keys", { tenant_id: A, name: "Seeded site", hash: "a".repeat(64) });
  // A website and a form it sends (00709): members read them; form_entry_take and a member's doors write them.
  ctx.formSite = await seed("form_sites", { tenant_id: A, name: "Seeded site" });
  await seed("outside_forms", { tenant_id: A, site_id: ctx.formSite, form: "request" });
  ctx.formEntry = await seed("form_entries", {
    tenant_id: A,
    contact_id: ctx.contact,
    form: "request",
    answers: {},
    words: "b".repeat(64),
    owed: [],
  });
  // A form the business shares (00680), a version of it, a link to it and a day of the link's opens: members read
  // them; an owner or an operator writes a form and a link, and only the doors write a version and a day.
  ctx.form = await seed("forms", { tenant_id: A, slug: "seeded", draft: {} });
  await seed("form_versions", { tenant_id: A, form_id: ctx.form, n: 1, description: {} });
  ctx.link = await seed("links", { tenant_id: A, subject_type: "form", subject_id: ctx.form, place: "Seeded" });
  await seed("link_days", { tenant_id: A, link_id: ctx.link, day: "2026-11-20", opens: 1 }, null);
  // A day of a form's business's booking page opened from it (00691): members read it, and only its door writes one.
  await seed("form_days", { tenant_id: A, form_id: ctx.form, day: "2026-11-20", booking_opens: 1 }, null);
  // What happened to an entry (00680): a member's word that it was answered another way.
  await seed("form_entry_links", { tenant_id: A, entry_id: ctx.formEntry, kind: "marked", created_by: ctx.viewerId });
  // Keyed by their workspace and day, so no id to pick.
  await seed("ask_journal_days", { tenant_id: A, day: "2026-10-20", state: "written", text: "A quiet day." }, null);
  await seed("ask_mornings", { tenant_id: A, user_id: ctx.viewerId, day: "2026-10-21" }, null);
  // What Ask did and what it told (00574, 00575): a record every member reads, and a morning's key.
  await seed("ask_actions", { tenant_id: A, user_id: ctx.ownerId, proposal_id: "p-seeded", kind: "note", by: "press" });
  await seed("ask_notice_days", { tenant_id: A, day: "2026-10-22" }, null);
  // The viewer's own voice session on their thread (00287): a member reads their own, nobody else's.
  await seed("ask_voice_sessions", {
    id: (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ""),
    tenant_id: A,
    user_id: ctx.viewerId,
    thread_id: ctx.thread,
    conversation_id: "conv_viewer",
    token_cipher: "sealed-elsewhere",
    token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    surface: "today",
    language: "en",
  });
  await seed("invitations", { tenant_id: A, email: "invited-1@example.com", invited_by: ctx.ownerId, role: "viewer" });
  ctx.template = await seed("templates", {
    tenant_id: A,
    channel: "whatsapp",
    name: "tenancy_tpl_1",
    language: "en_US",
  });
  ctx.broadcast = await seed("sequence_batches", {
    tenant_id: A,
    name: "tenancy run",
    template_id: ctx.template,
    template_name: "tenancy_tpl_1",
    template_language: "en_US",
    scheduled_for: new Date().toISOString(),
  });
  await seed("sequence_sends", { tenant_id: A, batch_id: ctx.broadcast, contact_id: ctx.contact }, null);
  ctx.playbook = await seed("sequence_steps", {
    tenant_id: A,
    name: "tenancy playbook",
    policy_class: "reengage",
    template_id: ctx.template,
    template_language: "en_US",
    template_name: "tenancy_tpl_1",
    trigger: "quiet_30",
  });
  // A time a sequence owes one person (00598, decision 0119): members read; only the enrol door and the clock write.
  const owedAt = new Date().toISOString();
  await seed(
    "sequence_occasions",
    {
      tenant_id: A,
      sequence_id: ctx.playbook,
      contact_id: ctx.contact,
      occasion: "missed:tenancy-visit",
      due_at: owedAt,
      try_at: owedAt,
    },
    null,
  );
  ctx.segment = await seed("segments", { tenant_id: A, name: "tenancy segment" });
  await seed("segment_members", { tenant_id: A, segment_id: ctx.segment, contact_id: ctx.contact }, null);
  // The workspace's first-run choices (00513): one row a workspace, which setup_choice_set writes.
  await seed("setup_choices", { tenant_id: A, whatsapp: "same" }, null);
  await seed("deals", { tenant_id: A, contact_id: ctx.contact, stage: "proposed" }, null);
  await seed("person_notes", { tenant_id: A, contact_id: ctx.contact, body: "tenancy note" }, null);
  // The appointments record and the notices ledger (00345): members read; the booking_read job writes.
  await seed(
    "appointments",
    {
      tenant_id: A,
      contact_id: ctx.contact,
      source: "booking_email",
      tool: "booksy",
      external_id: "booksy:+15550001001:1791486000000",
      starts_at: "2026-10-08T19:00:00.000Z",
      ends_at: "2026-10-08T20:00:00.000Z",
      timezone: "America/New_York",
    },
    null,
  );
  await seed(
    "appointment_notices",
    {
      tenant_id: A,
      notice_id: "rcv_tenancy",
      tool: "booksy",
      received_at: "2026-10-06T16:00:00.000Z",
      outcome: "booked",
    },
    null,
  );
  await seed("person_doubts", { tenant_id: A, contact_id: ctx.contact, other_id: ctx.contact2, seen: "email" }, null);
  await ensure("policies", { tenant_id: A, class: "reply", mode: "auto" });
  await ensure("tenant_config", { tenant_id: A });
  await ensure("billing_accounts", { tenant_id: A });
  await seed("billing_events", { id: `evt_tenancy_${Date.now()}`, type: "invoice.paid", tenant_id: A }, null);
  await seed(
    "business_records",
    {
      tenant_id: A,
      legal_name: "Tenancy LLC",
      street: "1 Main St",
      city: "Brooklyn",
      region: "NY",
      postal_code: "11201",
      contact_first_name: "M",
      contact_last_name: "S",
      contact_email: "m@example.com",
      contact_phone: "+16460000000",
      website_url: "https://example.com",
    },
    null,
  );
  await seed("capability_activations", { tenant_id: A, capability: "voice" }, null);
  await seed("lines", { tenant_id: A, provider: "dry", kind: "chanlytics", e164: "+15550002001" });
  await seed("mailboxes", {
    tenant_id: A,
    local_part: `tenancy-${Date.now().toString(36)}`,
    reply_token: "t".repeat(24),
    from_name: "Tenancy",
  });
  // A mailbox the business connected (00423): what a reach-out writes from (00472 took 00175's sending domains away). Its
  // host is its address's (mailbox_connections_host_is_address), so both are written from one stamp: three reads of the
  // clock crossed a millisecond on main's run of 19 Oct 2026, and the row was refused.
  const stamp = Date.now().toString(36);
  ctx.mailbox = await seed("mailbox_connections", {
    tenant_id: A,
    provider: "google",
    provider_account: `tenancy-${stamp}`,
    address: `sam@tenancy-mail-${stamp}.example`,
    host: `tenancy-mail-${stamp}.example`,
    from_name: "Tenancy",
  });
  // A business's footage sources (00639), in dependency order: the provider account, a folder watched through it, and
  // one item the folder holds.
  ctx.sourceConnection = await seed("source_connections", {
    tenant_id: A,
    provider: "google",
    provider_account: `tenancy-${stamp}`,
    email: `sam@tenancy-drive-${stamp}.example`,
  });
  ctx.mediaSource = await seed("media_sources", {
    tenant_id: A,
    connection_id: ctx.sourceConnection,
    folder_id: `tenancy-folder-${stamp}`,
    folder_name: "Tenancy footage",
  });
  await seed("source_items", {
    tenant_id: A,
    source_id: ctx.mediaSource,
    provider_id: `tenancy-item-${stamp}`,
    kind: "video",
    name: "tenancy-clip.mp4",
  });
  // Where a file's copies are (00686): the folder a press saves into, a copy the owner saved, and one piece of it.
  const drive = { tenant_id: A, google_account: `tenancy-${stamp}`, connection_id: ctx.sourceConnection };
  await seed("archive_folders", {
    ...drive,
    folder_id: "tenancy-f",
    made_folder_id: "tenancy-m",
    added_folder_id: "tenancy-a",
  });
  ctx.fileArchive = await seed("file_archives", { ...drive, file_id: ctx.file, origin: "saved" });
  await seed("file_archive_parts", {
    tenant_id: A,
    archive_id: ctx.fileArchive,
    part: "original",
    drive_file_id: "d",
    bytes: 1,
  });
  await seed("ad_entries", { tenant_id: A, message_id: ctx.message, ...AD_ENTRY }, null);
  ctx.adAccount = await seed("ad_accounts", { tenant_id: A, ...AD_ACCOUNT, external_id: "tenancy-act-1" });
  ctx.ad = await seed("ads", { tenant_id: A, account_id: ctx.adAccount, ...AD, platform_ad_id: "tenancy-ad-1" });
  await seed("ad_drafts", { tenant_id: A, account_id: ctx.adAccount, draft: { service: "Tenancy cut" } });
  // What a launch made at Meta for an ad made here (00666): members read the workspace's parts, its doors write them.
  await seed("ad_objects", { tenant_id: A, ad_id: ctx.ad, kind: "campaign", name: "Tenancy campaign", state: "made" });
  await seed("ad_days", { tenant_id: A, ad_id: ctx.ad, day: "2026-11-01" }, null);
  // A take-down, walked on an ad (00676, 00682): members read what was done; its doors write it.
  ctx.remediation = await seed("remediations", {
    tenant_id: A,
    cause: "owner_removed",
    subject_type: "file",
    subject_id: "tenancy-file",
  });
  await seed("remediation_actions", {
    tenant_id: A,
    remediation_id: ctx.remediation,
    target_type: "ad",
    target_id: ctx.ad,
    act: "pause",
    outcome: "pending",
  });
  await seed("tenant_channels", { tenant_id: A, kind: "whatsapp", external_id: "tenancy-wa-1" });
  await seed("google_connections", { tenant_id: A, account_name: "accounts/tenancy" }, null);
  await seed("google_listings", { tenant_id: A, place_id: "ChIJtenancy1", name: "Tenancy Salon" }, null);
  await seed("google_listing_days", { tenant_id: A, day: "2026-09-01", review_count: 1 }, null);
  await seed("google_reviews", { tenant_id: A, review_id: "tenancy-review-1" }, null);
  await seed("idempotency_keys", { tenant_id: A, key: "tenancy-key-1", route: "POST /x" }, null);
  await seed("jobs", { tenant_id: A, kind: "line_provision", due_at: new Date().toISOString(), payload: {} });

  // The lead finder (00140), in dependency order. The round is the search's
  // first (the guard allows one live round, and seq 1 needs no session).
  ctx.leadSearch = await seed("lead_searches", {
    tenant_id: A,
    via: "people",
    card: "local_businesses",
    name: "tenancy search",
    asked: "tenancy",
    plan: {},
  });
  ctx.leadRound = await seed("lead_rounds", {
    tenant_id: A,
    search_id: ctx.leadSearch,
    seq: 1,
    purpose: "probe",
    plan: {},
    plan_version: 1,
    target: 5,
    month: "2026-09",
    day: "2026-09-19",
  });
  // Ended as soon as it exists: a round that has not ended is lead work to
  // the lead finder's clock, and leads/engine/engine/ runs beside this
  // suite. queued -> ended is allowed, and the row wants its ending with it.
  const roundEnded = await db.from("lead_rounds").update({ state: "ended", ending: "stopped" }).eq("id", ctx.leadRound);
  assert.equal(roundEnded.error, null, `ending the tenancy round: ${roundEnded.error?.message}`);
  await seed("lead_runs", {
    tenant_id: A,
    round_id: ctx.leadRound,
    purpose: "discover",
    actor: "card-a",
    build: "1",
    webhook_token_hash: "tenancy",
  });
  await seed(
    "lead_judgments",
    { tenant_id: A, round_id: ctx.leadRound, op_id: `tenancy-${Date.now()}`, answer: {} },
    null,
  );
  ctx.lead = await seed("leads", { tenant_id: A, place_id: "ChIJtenancy0001", business_name: "Tenancy Salon" });
  // A reach-out's root (00183) and a send of it: the service role writes both, members read them.
  ctx.reachRoot = await seed("sequence_steps", {
    tenant_id: A,
    kind: "reach_out",
    name: "tenancy reach-out",
    trigger: "lead_first",
    policy_class: "outreach",
    lead_search_id: ctx.leadSearch,
    gap_minutes: 12,
    template_id: ctx.template,
    template_language: "en_US",
    template_name: "tenancy_tpl_1",
  });
  // The check's model spend per UTC day (00197): the service role's alone.
  await seed("reach_out_check_spend", { tenant_id: A, day: "2026-09-26", attempts: 1 }, null);
  // A thread's reply turn (00284): the inbound path's bookkeeping, the service role's alone.
  await seed("reply_turns", { conversation_id: ctx.conversation, tenant_id: A, message_id: ctx.message }, null);
  // A turn the receptionist took and the prompt it read (00401): the model port's, the service role's alone.
  await seed("model_prompts", { tenant_id: A, prompt_hash: "0123456789abcdef", text: "tenancy" }, null);
  await seed(
    "model_turns",
    {
      id: globalThis.crypto.randomUUID(),
      tenant_id: A,
      conversation_id: ctx.conversation,
      prompt_hash: "0123456789abcdef",
      request: {},
    },
    null,
  );
  // A lead's own words at a step (00545): its door writes them, members read them.
  await seed(
    "sequence_lead_words",
    { tenant_id: A, step_id: ctx.reachRoot, lead_id: ctx.lead, subject: "Tenancy", body: "Tenancy words" },
    null,
  );
  // A reply's reading (00222): the service role's doors write it, members read it.
  await seed(
    "sequence_replies",
    { message_id: ctx.message, tenant_id: A, conversation_id: ctx.conversation, claim: "person", intent: "other" },
    null,
  );
  await seed(
    "sequence_sends",
    {
      id: crypto.randomUUID(),
      tenant_id: A,
      batch_id: ctx.broadcast,
      step_id: ctx.reachRoot,
      sequence_id: ctx.reachRoot,
      lead_id: ctx.lead,
      mailbox_id: ctx.mailbox,
      send_at: new Date().toISOString(),
    },
    null,
  );
  await seed("lead_places", { tenant_id: A, lead_id: ctx.lead, place_id: "ChIJtenancy0002" }, null);
  // A lead's own receptionist before they sign up (00497, decision 0079): members read their workspace's, the doors write.
  await seed("lead_previews", { tenant_id: A, lead_id: ctx.lead, token: "tenancyTenancyTenancy1" }, null);
  await seed(
    "lead_search_members",
    { tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, round_id: ctx.leadRound, class: "review" },
    null,
  );
  await seed("lead_counters", { tenant_id: A, kind: "allowance", period: "2026-09" }, null);
  await seed(
    "lead_operations",
    { tenant_id: A, kind: "keep", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 },
    null,
  );
  await seed("lead_preferences", { tenant_id: A, kind: "chain" }, null);
  await seed("lead_suppressions", { tenant_id: A, kind: "place", hash: "tenancy", what: "customer" }, null);
  await seed("lead_suggestions", { tenant_id: A, business_line: "a hair salon in Miami" }, null);
  await seed("platform_metrics", { tenant_id: A, day: "2026-09-26" }, null);
  // The Console (00467, decision 0066): what the team did in A, who has it, what its owner reported, a request about it.
  await seed(
    "platform_acts",
    {
      actor_id: ctx.ownerId,
      actor_role: "support",
      act: "line_retry",
      tenant_id: A,
      target_kind: "workspace",
      reason_kind: "found",
    },
    null,
  );
  await seed(
    "platform_claims",
    { tenant_id: A, user_id: ctx.ownerId, until: new Date(Date.now() + 3_600_000).toISOString() },
    null,
  );
  await seed("support_reports", { tenant_id: A, user_id: ctx.ownerId, words: "The calendar will not open." }, null);
  await seed(
    "privacy_requests",
    {
      kind: "copy",
      tenant_id: A,
      slug: "tenancy",
      name: "Tenancy",
      asked_by: "owner@example.com",
      asked_at: "2026-10-01T00:00:00Z",
      due_at: "2026-10-31T00:00:00Z",
    },
    null,
  );
  // The spine (00334): an outbox row and a delivery of the workspace's, as the copy and the relay would write them.
  await seed(
    "event_outbox",
    { event_id: crypto.randomUUID(), tenant_id: A, kind: "message.received", event_at: "2026-10-06T00:00:00Z" },
    null,
  );
  await seed(
    "provider_events",
    {
      provider: "twilio",
      provider_event_id: `SM-tenancy-${Date.now()}`,
      door: "/api/inbound-sms",
      url: "https://edge.example.com/api/inbound-sms",
      tenant_id: A,
      headers: {},
      body: "From=%2B15550100123&Body=hello",
    },
    null,
  );
  await seed(
    "event_deliveries",
    {
      event_id: crypto.randomUUID(),
      subscriber: "audit",
      tenant_id: A,
      kind: "message.received",
      event_at: "2026-10-06T00:00:00Z",
    },
    null,
  );

  // The service role's own tables, seeded so "a member reads nothing" is not
  // proved on an empty table. A platform admin is a user who is nobody's
  // member, so the grant widens no session this suite signs in with.
  const nobody = await db.auth.admin.createUser({
    email: `tenancy-nobody-${Date.now()}@example.com`,
    password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
    email_confirm: true,
  });
  assert.equal(nobody.error, null, nobody.error?.message);
  users.push(nobody.data.user.id);
  ctx.nobodyId = nobody.data.user.id;
  const key = `tenancy-${Date.now()}`;
  await seed("operator_pages", { key }, null);
  probes.push(["operator_pages", "key", key]);
  await seed("platform_admins", { user_id: ctx.nobodyId }, null);
  probes.push(["platform_admins", "user_id", ctx.nobodyId]);
  await seed("rate_hits", { actor: key, bucket: "tenancy" }, null);
  probes.push(["rate_hits", "actor", key]);
  await seed("waitlist", { email: `${key}@example.com` }, null);
  probes.push(["waitlist", "email", `${key}@example.com`]);
  // The lead finder's platform tables: the switch row is 00140's own; a prior is seeded and removed.
  const prior = `tenancy_${Date.now()}`;
  await seed("lead_niche_priors", { category_key: prior }, null);
  probes.push(["lead_niche_priors", "category_key", prior]);
  // A page load's timing (00255): the platform's, with no person and no workspace on it.
  await seed("page_vitals", { id: key, page: "tenancy", metric: "LCP", value: 1 }, null);
  probes.push(["page_vitals", "id", key]);
  // An error a page hit (00469): no workspace on it, a hash of who; Health reads it on the service role.
  await seed("client_errors", { fingerprint: key, boundary: "os", name: "TypeError", message: "tenancy" }, null);
  probes.push(["client_errors", "fingerprint", key]);
  // The machine image an edition of the video template is drawn on (00613): the platform's, no workspace on it. An
  // edition no template has, so no other suite's image is touched.
  const edition = 1_000_000 + Math.floor(Math.random() * 1_000_000);
  await seed("piece_images", { edition, snapshot_id: `snap_${key}`, hash: "0123456789ab" }, null);
  probes.push(["piece_images", "edition", edition]);
  // What taking footage in cost the platform in a day (00643): no workspace on it. A day long past, picked at random,
  // so no other suite's day is touched.
  const footageDay = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3650) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  await seed("source_days", { day: footageDay, bytes: 1, takes: 1, units: 5 }, null);
  probes.push(["source_days", "day", footageDay]);

  // A partner brought A (0012): their row, the workspace's attribution, one earning, and the card the workspace
  // pays with. The earning outlives the workspace and holds the partner row, so both are removed by hand, in order.
  partner = await memberClient("partner", A);
  ctx.partnerUserId = partner.userId;
  const code = `tenancy-${Date.now().toString(36)}`;
  ctx.partner = await seed("partners", { user_id: ctx.partnerUserId, code });
  await seed("partner_tenants", { tenant_id: A, partner_id: ctx.partner, code_used: code }, null);
  // An owner's invitation to a partner (0020): read by the owner and the partner it names, written by functions.
  await seed("partner_invitations", invitation(), null);
  probes.push(["partner_invitations", "tenant_id", A]);
  await seed("partner_earnings", earning(`evt_tenancy_${key}`), null);
  await seed("billing_card_marks", { tenant_id: A, card_fingerprint: "fp_tenancy" }, null);
  probes.push(["partner_earnings", "partner_id", ctx.partner]);
  probes.push(["partner_tenants", "partner_id", ctx.partner]);
  probes.push(["partners", "id", ctx.partner]);
  await seed(
    "partner_reversals_waiting",
    { stripe_event_id: `evt_${key}`, stripe_invoice_id: `in_${key}`, kind: "refund", amount_cents: 100 },
    null,
  );
  probes.push(["partner_reversals_waiting", "stripe_event_id", `evt_${key}`]);
});

/** An owner's invitation to the partner, open a day. */
export const invitation = () => ({
  tenant_id: A,
  partner_id: ctx.partner,
  expires_at: new Date(Date.now() + 86_400_000).toISOString(),
});

/** A partner's earning on A: one invoice's share, held. */
export function earning(eventId) {
  const now = new Date();
  return {
    partner_id: ctx.partner,
    tenant_id: A,
    stripe_invoice_id: `in_${eventId}`,
    stripe_event_id: eventId,
    kind: "share",
    amount_cents: 40000,
    currency: "usd",
    share_bp: 2500,
    earned_cents: 10000,
    paid_at: now.toISOString(),
    payable_at: new Date(now.getTime() + 30 * 86400000).toISOString(),
  };
}

after(async () => {
  if (skip) return;
  for (const [table, col, val] of probes) await db.from(table).delete().eq(col, val);
  if (A) await db.from("tenants").delete().eq("id", A);
  if (B) await db.from("tenants").delete().eq("id", B);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

/** A file of the workspace: what the table takes no default for. */
export function fileRow(name) {
  return {
    id: crypto.randomUUID(),
    tenant_id: A,
    status: "filed",
    source: "upload",
    name,
    mime: "image/jpeg",
    bytes: 1000,
    fingerprint: `fp-${name}`,
  };
}

/**
 * What a member may read of each tenant table:
 *   member  the workspace's rows
 *   acting  the workspace's rows, for an operator or an owner; a viewer reads nothing
 *   owner   the workspace's rows, for its owner alone; a viewer and a partner read nothing (00366: the configuration,
 *           which holds the calendar feed's address; every other member reads it through tenant_config_read)
 *   own     their own rows only (user_id = auth.uid()); another member of the same workspace sees none of theirs
 *   partner the partner who brought the workspace; no member else, its owner included
 *   brought the partner who brought the workspace, and its owner; a viewer reads nothing
 *   none    nothing: the service role's table
 * And a second insert each, for the stranger's attempt: unique on the first row must not be what refuses it.
 * The partitions of events (events_default, a month's events_YYYY_MM) are events: PostgREST does not
 * describe them, and a row written to events is read through events.
 */
export const TENANT_TABLES = {
  contacts: ["member", () => ({ tenant_id: A, phone_e164: "+15550001003" })],
  contact_identities: [
    "member",
    () => ({ tenant_id: A, contact_id: ctx.contact2, channel: "whatsapp", external_id: "15550001002" }),
  ],
  conversations: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2 })],
  // When a thread's person last wrote on each wire (00484): the workspace's members read it, only the doors write.
  conversation_channel_state: [
    "member",
    () => ({
      tenant_id: A,
      conversation_id: ctx.conversation,
      channel: "sms",
      last_inbound_at: new Date().toISOString(),
    }),
  ],
  // Ask's drafts written ahead for a waiting thread (00475): the workspace's members read them, only the door writes.
  conversation_drafts: [
    "member",
    () => ({ tenant_id: A, conversation_id: ctx.conversation, kind: "brief", words: { text: "A stranger's draft" } }),
  ],
  messages: [
    "member",
    () => ({
      tenant_id: A,
      conversation_id: ctx.conversation2,
      contact_id: ctx.contact2,
      channel: "whatsapp",
      direction: "outbound",
      sender: "human",
      type: "text",
      body: "stranger",
      status: "queued",
    }),
  ],
  calls: ["member", () => ({ tenant_id: A, retell_call_id: "call_tenancy_2" })],
  // A conversation rehearsed or a real call reviewed (00476, decision 0069): members read theirs, the doors write. The
  // workspace's agent at Retell is the service role's alone.
  rehearsals: ["member", () => ({ tenant_id: A, kind: "typed" })],
  // What was brought in, one row a source, and what the profile and the website say, one row each (00477, 00479).
  imports: ["member", () => ({ tenant_id: A, source: "mailbox", state: "queued" })],
  business_reads: ["member", () => ({ tenant_id: A, source: "google_profile", facts: {} })],
  voice_agents: ["none", () => ({ tenant_id: A, agent_id: "agent_stranger1" })],
  // The notes an owner's corrections suggest (00448): members read their workspace's, and only the doors write.
  fact_suggestions: [
    "member",
    () => ({ tenant_id: A, conversation_id: ctx.conversation2, source: "reply", source_message_id: ctx.message2 }),
  ],
  escalations: [
    "member",
    () => ({ tenant_id: A, conversation_id: ctx.conversation2, reason: "manual", details: "stranger" }),
  ],
  decisions: [
    "member",
    () => ({
      tenant_id: A,
      actor_type: "system",
      subject_type: "conversation",
      subject_id: ctx.conversation2,
      verb: "archive",
    }),
  ],
  events: ["member", () => ({ tenant_id: A, kind: "message.received" })],
  // The model ledger (00273) and the metering view over it (security invoker): members read their workspace's calls, and
  // nobody signed in writes one.
  ai_usage: [
    "member",
    () => ({
      tenant_id: A,
      purpose: "ask",
      model_asked: "claude-opus-5-5",
      model: "claude-opus-5-5",
      outcome: "answered",
    }),
  ],
  usage_ledger: [
    "member",
    () => ({ tenant_id: A, meter: "model", purpose: "ask", model: "claude-opus-5-5", quantity: 1 }),
  ],
  notifications: ["member", () => ({ tenant_id: A, kind: "alert", title: "stranger", body: "probe" })],
  notification_reads: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId })],
  // A member's reading of the people (00349): read by user_id, written only through contact_mark and the migration.
  contact_reads: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId })],
  contact_marks: ["own", () => ({ tenant_id: A, contact_id: ctx.contact, user_id: ctx.strangerId })],
  ask_threads: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId })],
  // What Ask remembers (00470): the memory is the workspace's, its journal its owners', a morning the member's own.
  ask_memory_lines: ["member", () => ({ tenant_id: A, text: "A stranger's line", source: "pane" })],
  files: ["member", () => fileRow("a-strangers")],
  files_let_go: ["none", () => ({ tenant_id: A, fingerprint: "a-strangers" })],
  form_keys: ["member", () => ({ tenant_id: A, name: "A stranger's site", hash: "c".repeat(64) })],
  form_sites: ["member", () => ({ tenant_id: A, name: "A stranger's site" })],
  outside_forms: ["member", () => ({ tenant_id: A, site_id: ctx.formSite, form: "signup", ref: "a-strangers" })],
  form_entries: [
    "member",
    () => ({ tenant_id: A, contact_id: ctx.contact, form: "request", answers: {}, words: "d".repeat(64), owed: [] }),
  ],
  // A form, its versions, its links, their days and what happened to its entries (00680): the workspace's members
  // read them. A stranger and a viewer write none: a form and a link are an owner's or an operator's, a member's word
  // on an entry is theirs too, and a version and a day are only their doors'.
  forms: ["member", () => ({ tenant_id: A, slug: "a-strangers", draft: {}, created_by: ctx.strangerId })],
  form_versions: ["member", () => ({ tenant_id: A, form_id: ctx.form, n: 2, description: {} })],
  links: [
    "member",
    () => ({
      tenant_id: A,
      subject_type: "form",
      subject_id: ctx.form,
      place: "A stranger's",
      created_by: ctx.strangerId,
    }),
  ],
  link_days: ["member", () => ({ tenant_id: A, link_id: ctx.link, day: "2026-11-21", opens: 1 })],
  form_days: ["member", () => ({ tenant_id: A, form_id: ctx.form, day: "2026-11-21", booking_opens: 1 })],
  form_entry_links: [
    "member",
    () => ({
      tenant_id: A,
      entry_id: ctx.formEntry,
      kind: "reply",
      message_id: ctx.message,
      created_by: ctx.strangerId,
    }),
  ],
  // Where a post went and each send of it (00611): a member reads them, the service role writes them.
  posts: ["member", () => ({ tenant_id: A, file_id: ctx.file, place: "google", kind: "picture", status: "published" })],
  publish_attempts: [
    "member",
    () => ({ tenant_id: A, post_id: ctx.post, attempt_no: 2, step: "publish", request: {} }),
  ],
  // A video asked for (00613): a member reads it, only its doors write it.
  pieces: [
    "member",
    () => ({ tenant_id: A, shape: "hook_cut", plan: {}, look: {}, edition: 1, card_key: "a-strangers" }),
  ],
  // A piece's versions, its shapes and its approvals (00681): a member reads them, only their doors write them.
  piece_revisions: ["member", () => ({ tenant_id: A, piece_id: ctx.piece, n: 9, plan: {}, made_by: "ai" })],
  piece_renditions: [
    "member",
    () => ({
      tenant_id: A,
      piece_id: ctx.piece,
      revision: 1,
      shape: "1x1",
      file_id: ctx.file,
      path: `${A}/${ctx.file}/square.jpg`,
      checksum: "c".repeat(64),
    }),
  ],
  approvals: [
    "member",
    () => ({ tenant_id: A, subject_type: "plan", subject_id: ctx.piece, snapshot: {}, snapshot_hash: "d".repeat(64) }),
  ],
  // A week planned (00706): a member reads each, only their doors write them.
  owner_claims: ["member", () => ({ tenant_id: A, kind: "price", text: "Stranger price", source: "said" })],
  content_goals: ["member", () => ({ tenant_id: A, goal: "reviews" })],
  content_plans: ["member", () => ({ tenant_id: A, week_of: "2026-11-30", asked_by: "clock" })],
  plan_slots: [
    "member",
    () => ({
      tenant_id: A,
      plan_id: ctx.plan,
      creative: ctx.piece,
      place: "google",
      kind: "picture",
      at: "2026-11-25T15:00:00Z",
      title: "Stranger slot",
    }),
  ],
  file_moments: [
    "member",
    () => ({ tenant_id: A, file_id: ctx.file, start_s: 4, end_s: 6, score: 0.5, confidence: 0.5, model_edition: 2 }),
  ],
  // What a post said back (00699): a member reads it, only its doors write it.
  post_observations: [
    "member",
    () => ({
      tenant_id: A,
      post_id: ctx.post,
      place: "instagram",
      step: "1d",
      metric: "views",
      availability: "available",
      value: 9,
      period_start: new Date(0).toISOString(),
      period_end: new Date().toISOString(),
    }),
  ],
  touches: [
    "member",
    () => ({
      tenant_id: A,
      subject_type: "post",
      subject_id: ctx.post,
      kind: "comment",
      contact_id: ctx.contact,
      place: "instagram",
      provider_event_id: "a-strangers-comment",
      at: new Date().toISOString(),
    }),
  ],
  comment_answers: ["member", () => ({ tenant_id: A, touch_id: ctx.touch, state: "cannot", cannot_why: "Stranger." })],
  ask_journal_days: ["owner", () => ({ tenant_id: A, day: "2026-10-19", state: "quiet" })],
  ask_mornings: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId, day: "2026-10-20" })],
  // What Ask did and what it told (00574, 00575): a member reads them, a member who may act writes the record.
  ask_actions: [
    "member",
    () => ({ tenant_id: A, user_id: ctx.strangerId, proposal_id: "p-stranger", kind: "note", by: "press" }),
  ],
  ask_notice_days: ["member", () => ({ tenant_id: A, day: "2026-10-18" })],
  ask_messages: [
    "own",
    () => ({
      tenant_id: A,
      thread_id: ctx.thread,
      user_id: ctx.strangerId,
      role: "user",
      content: { text: "stranger" },
    }),
  ],
  // A voice session: the member's own (00287); its id is the session's hash, unique per row.
  ask_voice_sessions: [
    "own",
    () => ({
      id: (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, ""),
      tenant_id: A,
      user_id: ctx.strangerId,
      thread_id: ctx.thread,
      conversation_id: "conv_stranger",
      token_cipher: "sealed-elsewhere",
      token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      surface: "today",
      language: "en",
    }),
  ],
  memberships: ["own", () => ({ tenant_id: A, user_id: ctx.strangerId, role: "viewer" })],
  invitations: [
    "member",
    () => ({ tenant_id: A, email: "invited-2@example.com", invited_by: ctx.strangerId, role: "viewer" }),
  ],
  templates: ["member", () => ({ tenant_id: A, channel: "whatsapp", name: "tenancy_tpl_2", language: "en_US" })],
  // Reach out (00197): the check's spend is the service role's, read by no member.
  reach_out_check_spend: ["none", () => ({ tenant_id: A, day: "2026-09-27" })],
  // Decision 0060 (00440): a sequence, its steps, its batches, its sends (a customer's and a lead's) and its replies are each
  // the workspace's; the five old names that were views of them went in 00452.
  sequences: ["member", () => ({ tenant_id: A, name: "stranger sequence", starts: "date" })],
  sequence_steps: [
    "member",
    () => ({
      tenant_id: A,
      name: "stranger step",
      policy_class: "reengage",
      template_id: ctx.template,
      template_language: "en_US",
      template_name: "tenancy_tpl_1",
      trigger: "new_week",
    }),
  ],
  sequence_batches: [
    "member",
    () => ({
      tenant_id: A,
      name: "stranger batch",
      template_id: ctx.template,
      template_name: "tenancy_tpl_1",
      template_language: "en_US",
      scheduled_for: new Date().toISOString(),
    }),
  ],
  sequence_sends: ["member", () => ({ tenant_id: A, batch_id: ctx.broadcast, contact_id: ctx.contact2 })],
  // Someone in a sequence (00441): members read where people stand; only the sends' trigger and the leave door write it.
  sequence_enrollments: ["member", () => ({ tenant_id: A, sequence_id: ctx.broadcast, contact_id: ctx.contact2 })],
  // A time a sequence owes one person (00598): members read when it is owed; the enrol door and the clock write it.
  sequence_occasions: [
    "member",
    () => {
      const at = new Date().toISOString();
      return {
        tenant_id: A,
        sequence_id: ctx.playbook,
        contact_id: ctx.contact2,
        occasion: "missed:stranger-visit",
        due_at: at,
        try_at: at,
      };
    },
  ],
  sequence_replies: [
    "member",
    () => ({ message_id: ctx.message, tenant_id: A, conversation_id: ctx.conversation, claim: "person", intent: "no" }),
  ],
  segments: ["member", () => ({ tenant_id: A, name: "stranger segment" })],
  // What the first run chose for the workspace (00513, decision 0091): its members read it; setup_choice_set writes.
  setup_choices: ["member", () => ({ tenant_id: A, whatsapp: "later" })],
  segment_members: ["member", () => ({ tenant_id: A, segment_id: ctx.segment, contact_id: ctx.contact2 })],
  deals: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2, stage: "proposed" })],
  person_notes: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2, body: "stranger note" })],
  // The record and the ledger (00345): members read; nobody but the service role writes.
  appointments: [
    "member",
    () => ({
      tenant_id: A,
      contact_id: ctx.contact2,
      source: "booking_email",
      tool: "booksy",
      external_id: "booksy:+15550001002:1791489600000",
      starts_at: "2026-10-08T20:00:00.000Z",
      ends_at: "2026-10-08T21:00:00.000Z",
      timezone: "America/New_York",
    }),
  ],
  appointment_notices: [
    "member",
    () => ({
      tenant_id: A,
      notice_id: `rcv_stranger_${Date.now()}`,
      tool: "booksy",
      received_at: "2026-10-06T16:00:00.000Z",
      outcome: "booked",
    }),
  ],
  person_doubts: ["member", () => ({ tenant_id: A, contact_id: ctx.contact2, other_id: ctx.contact, seen: "name" })],
  // A person's moments (00259, 0021): members read; only the triggers on contacts, messages and calls, and the fill,
  // write. Every person has a row from their insert, so the stranger's is refused for the privilege, not the key.
  person_moments: ["member", () => ({ contact_id: ctx.contact2, tenant_id: A, added_at: new Date().toISOString() })],
  policies: [
    "member",
    () => ({ tenant_id: A, class: "faq", mode: "auto", subject_type: "contact", subject_id: ctx.contact2 }),
  ],
  tenant_config: ["owner", () => ({ tenant_id: A })],
  // The settings as they stood at each version (00402, decision 0039): written by the trigger on tenant_config, so a
  // workspace has its first from the day it is made; read by no session.
  tenant_config_versions: [
    "none",
    () => ({ tenant_id: A, version: 900_000 + Math.floor(Math.random() * 99_999), config: {} }),
  ],
  anthropic_profiles: ["none", () => ({ kind: "workspace", tenant_id: A, reference_id: "workspace:stranger" })],
  billing_accounts: ["member", () => ({ tenant_id: A })],
  billing_events: ["none", () => ({ id: `evt_stranger_${Date.now()}`, type: "invoice.paid", tenant_id: A })],
  business_records: [
    "member",
    () => ({
      tenant_id: A,
      legal_name: "Stranger LLC",
      street: "2 Main St",
      city: "Brooklyn",
      region: "NY",
      postal_code: "11201",
      contact_first_name: "S",
      contact_last_name: "T",
      contact_email: "s@example.com",
      contact_phone: "+16460000001",
      website_url: "https://example.org",
    }),
  ],
  capability_activations: ["member", () => ({ tenant_id: A, capability: "sms" })],
  lines: ["member", () => ({ tenant_id: A, provider: "dry", kind: "chanlytics", e164: "+15550002002" })],
  // One mailbox per workspace, so this insert would meet the unique index too; row-level security refuses it first, which is the proof.
  mailboxes: [
    "member",
    () => ({
      tenant_id: A,
      local_part: `stranger-${Date.now().toString(36)}`,
      reply_token: "s".repeat(24),
      from_name: "Stranger",
    }),
  ],
  // What a workspace said of a sender of its mailbox's mail, and what the mailbox left, one row a sender (00483): members
  // read their workspace's; the member's door and the edge's service role write.
  mailbox_senders: [
    "member",
    () => ({ tenant_id: A, sender: `stranger-${Date.now().toString(36)}.example`, verdict: "automated" }),
  ],
  mailbox_left: [
    "member",
    () => ({ tenant_id: A, address: `x-${Date.now().toString(36)}@stranger.example`, why: "updates" }),
  ],
  // What Chanlytics read a sender to be (00495): members read their workspace's; only the edge's service role writes.
  mailbox_sender_reads: [
    "member",
    () => ({ tenant_id: A, address: `r-${Date.now().toString(36)}@stranger.example`, kind: "notice" }),
  ],
  // A mailbox a business connected (00423, decision 0056): members read their workspace's, and only the edge's service
  // role writes one, once the provider's grant is in hand.
  mailbox_connections: [
    "member",
    () => ({
      tenant_id: A,
      provider: "google",
      provider_account: `stranger-${Date.now().toString(36)}`,
      address: `sam@stranger-mail-${Date.now().toString(36)}.example`,
      host: `stranger-mail-${Date.now().toString(36)}.example`,
      from_name: "Stranger",
    }),
  ],
  // A business's footage sources (00639): a provider account it connected, a folder watched through it, and what the
  // folder holds. Members read their workspace's; only the service role writes (the connect and the reads to come).
  source_connections: [
    "member",
    () => ({
      tenant_id: A,
      provider: "google",
      provider_account: `stranger-${Date.now().toString(36)}`,
      email: "sam@stranger-drive.example",
    }),
  ],
  media_sources: [
    "member",
    () => ({
      tenant_id: A,
      connection_id: ctx.sourceConnection,
      folder_id: `stranger-folder-${Date.now().toString(36)}`,
      folder_name: "Stranger footage",
    }),
  ],
  source_items: [
    "member",
    () => ({
      tenant_id: A,
      source_id: ctx.mediaSource,
      provider_id: `stranger-item-${Date.now().toString(36)}`,
      kind: "image",
      name: "stranger.jpg",
    }),
  ],
  // Where a file's copies are (00686): members read their workspace's; only the service role writes.
  archive_folders: [
    "member",
    () => ({
      tenant_id: A,
      google_account: "stranger",
      folder_id: "s-f",
      made_folder_id: "s-m",
      added_folder_id: "s-a",
    }),
  ],
  file_archives: ["member", () => ({ tenant_id: A, file_id: ctx.file, origin: "shelf" })],
  file_archive_parts: [
    "member",
    () => ({ tenant_id: A, archive_id: ctx.fileArchive, part: "video", shelf_key: "s", bytes: 1 }),
  ],
  ad_entries: ["member", () => ({ tenant_id: A, message_id: ctx.message2, ...AD_ENTRY })],
  ad_accounts: ["member", () => ({ tenant_id: A, ...AD_ACCOUNT, external_id: "stranger-act" })],
  ads: ["member", () => ({ tenant_id: A, account_id: ctx.adAccount, ...AD, platform_ad_id: "stranger-ad" })],
  ad_days: ["member", () => ({ tenant_id: A, ad_id: ctx.ad, day: "2026-11-02" })],
  ad_drafts: ["member", () => ({ tenant_id: A, account_id: ctx.adAccount, draft: { service: "Stranger cut" } })],
  ad_objects: [
    "member",
    () => ({ tenant_id: A, ad_id: ctx.ad, kind: "ad", version: 2, name: "Stranger ad", state: "sent" }),
  ],
  remediations: [
    "member",
    () => ({ tenant_id: A, cause: "stop", subject_type: "workspace", subject_id: "stranger-stop" }),
  ],
  remediation_actions: [
    "member",
    () => ({
      tenant_id: A,
      remediation_id: ctx.remediation,
      target_type: "post",
      target_id: ctx.ad,
      act: "take_down",
      outcome: "pending",
    }),
  ],
  tenant_channels: ["member", () => ({ tenant_id: A, kind: "sms", external_id: "tenancy-sms-2" })],
  google_connections: ["member", () => ({ tenant_id: A, account_name: "accounts/stranger" })],
  google_listings: ["member", () => ({ tenant_id: A, place_id: "ChIJstranger", name: "Stranger Salon" })],
  google_listing_days: ["member", () => ({ tenant_id: A, day: "2026-09-02", review_count: 1 })],
  google_reviews: ["member", () => ({ tenant_id: A, review_id: "stranger-review" })],
  idempotency_keys: ["acting", () => ({ tenant_id: A, key: "stranger-key", route: "POST /x" })],
  jobs: ["none", () => ({ tenant_id: A, kind: "line_provision", due_at: new Date().toISOString(), payload: {} })],
  // A thread's reply turn (00284): read and written by the inbound path's service role, by no member.
  reply_turns: ["none", () => ({ conversation_id: ctx.conversation, tenant_id: A, message_id: ctx.message })],
  // A receptionist's turn as the model read it, and the prompt it read (00401, decision 0039): written by the model
  // port's service role through model_turn_keep, read by no session.
  model_prompts: [
    "none",
    () => ({
      tenant_id: A,
      prompt_hash: globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 16),
      text: "probe",
    }),
  ],
  model_turns: [
    "none",
    () => ({
      id: globalThis.crypto.randomUUID(),
      tenant_id: A,
      conversation_id: ctx.conversation,
      prompt_hash: "0123456789abcdef",
      request: {},
    }),
  ],
  // The lead finder (00140): members read, nobody signed in writes a row; the
  // judgments and the counters are the service role's. The view runs under
  // the reader's own row security (security_invoker), and is not writable.
  lead_searches: [
    "member",
    () => ({
      tenant_id: A,
      via: "people",
      card: "local_businesses",
      name: "stranger search",
      asked: "stranger",
      plan: {},
    }),
  ],
  lead_rounds: [
    "member",
    () => ({
      tenant_id: A,
      search_id: ctx.leadSearch,
      seq: 2,
      purpose: "topup",
      plan: {},
      plan_version: 1,
      target: 1,
      month: "2026-09",
      day: "2026-09-19",
    }),
  ],
  lead_runs: [
    "member",
    () => ({
      tenant_id: A,
      round_id: ctx.leadRound,
      purpose: "discover",
      actor: "card-a",
      build: "1",
      webhook_token_hash: "stranger",
    }),
  ],
  lead_judgments: ["none", () => ({ tenant_id: A, round_id: ctx.leadRound, op_id: "stranger", answer: {} })],
  leads: ["member", () => ({ tenant_id: A, place_id: "ChIJstranger0001", business_name: "Stranger" })],
  lead_places: ["member", () => ({ tenant_id: A, lead_id: ctx.lead, place_id: "ChIJstranger0002" })],
  sequence_lead_words: [
    "member",
    () => ({ tenant_id: A, step_id: ctx.reachRoot, lead_id: ctx.lead, body: "Stranger" }),
  ],
  lead_previews: ["member", () => ({ tenant_id: A, lead_id: ctx.lead, token: "strangerStrangerStran1" })],
  lead_search_members: [
    "member",
    () => ({ tenant_id: A, search_id: ctx.leadSearch, lead_id: ctx.lead, class: "review" }),
  ],
  lead_counters: ["none", () => ({ tenant_id: A, kind: "budget", period: "2026-09" })],
  lead_operations: [
    "member",
    () => ({ tenant_id: A, kind: "exclude", search_id: ctx.leadSearch, lead_ids: [ctx.lead], version: 1 }),
  ],
  lead_preferences: ["member", () => ({ tenant_id: A, kind: "too_far" })],
  lead_suppressions: ["member", () => ({ tenant_id: A, kind: "email", hash: "stranger", what: "email_opt_out" })],
  lead_suggestions: ["member", () => ({ tenant_id: A, business_line: "a stranger line" })],
  // One UTC day of a workspace, counted (00277): the back office reads it through platform_metrics_read; no member does.
  platform_metrics: ["none", () => ({ tenant_id: A, day: "2026-09-27" })],
  // A partner (0012): who brought the workspace, what they earned from it, and the card it pays with. Only the
  // service role writes any of them; the partner themselves included.
  partner_tenants: ["brought", () => ({ tenant_id: A, partner_id: ctx.partner, code_used: "stranger" })],
  partner_earnings: ["partner", () => earning(`evt_stranger_${Date.now()}`)],
  partner_invitations: ["brought", invitation],
  billing_card_marks: ["none", () => ({ tenant_id: A, card_fingerprint: "fp_stranger" })],
  // The Console (00467, decision 0066): the platform's own tables about a workspace, the service role's alone; a member,
  // the workspace's owner included, reads none of them and writes none.
  platform_acts: [
    "none",
    () => ({ actor_role: "owner", act: "line_retry", tenant_id: A, target_kind: "workspace", reason_kind: "found" }),
  ],
  platform_claims: ["none", () => ({ tenant_id: A, user_id: ctx.strangerId, until: "2099-01-01T00:00:00Z" })],
  support_reports: ["none", () => ({ tenant_id: A, user_id: ctx.strangerId, words: "A stranger's report." })],
  privacy_requests: [
    "none",
    () => ({
      kind: "copy",
      tenant_id: A,
      slug: "stranger",
      name: "Stranger",
      asked_by: "stranger@example.com",
      asked_at: "2026-10-01T00:00:00Z",
      due_at: "2026-10-31T00:00:00Z",
    }),
  ],
  // The spine (00334, decision 0032): an event's outbox row and its deliveries follow their workspace; the service role
  // alone writes and reads them.
  event_outbox: [
    "none",
    () => ({ event_id: crypto.randomUUID(), tenant_id: A, kind: "message.received", event_at: "2026-10-06T00:00:00Z" }),
  ],
  // The intake ledger (00336): a provider's delivery as it came, the service role's alone.
  provider_events: [
    "none",
    () => ({
      provider: "twilio",
      provider_event_id: `SM-stranger-${Date.now()}`,
      door: "/api/inbound-sms",
      url: "https://edge.example.com/api/inbound-sms",
      tenant_id: A,
      headers: {},
      body: "From=%2B15550100123&Body=hello",
    }),
  ],
  event_deliveries: [
    "none",
    () => ({
      event_id: crypto.randomUUID(),
      subscriber: "audit",
      tenant_id: A,
      kind: "message.received",
      event_at: "2026-10-06T00:00:00Z",
    }),
  ],
  lead_searches_view: [
    "member",
    () => ({ tenant_id: A, via: "people", card: "local_businesses", name: "stranger", asked: "stranger", plan: {} }),
  ],
};

/** Tables without a tenant_id: scoped by the user, or the service role's, or the workspace row itself. */
export const OTHER_TABLES = {
  tenants: "workspace", // read by membership on id; owners update their own
  notification_marks: "own",
  push_devices: "own", // a person's phones (00162): read by user_id; written only through the two definer doors
  web_push_subscriptions: "own", // a person's browsers (00575): read and written by user_id, on their own session
  profiles: "people", // a person's own row, and the rows of people who share a workspace with them: not tenancy
  operator_pages: "none",
  client_errors: "none", // the errors pages hit (00469): no workspace, a hash of who; the service role's alone
  platform_admins: "none",
  rate_hits: "none",
  // A transaction's notices kept for its commit (00507): empty at rest, each row deleted as it is told; the service role's alone.
  workspace_notices_pending: "empty",
  sweep_status: "none",
  event_subscriptions: "none", // who reacts to an event kind (00334): platform-wide rows, the service role's alone
  job_kinds: "none", // each job kind's lane, once-only rule and pause (00526): platform-wide rows, the service role's alone
  piece_images: "none", // the machine image each edition of the video template is drawn on (00613): the service role's alone
  source_days: "none", // what taking footage in cost the platform in a day (00643): no workspace on it; the service role's alone
  waitlist: "none",
  lead_platform: "none", // the switch, one row; read through lead_searches_on()
  lead_niche_priors: "none", // platform-wide priors; read through lead_niche_prior()
  partners: "own", // a partner's own row (0012): read by user_id; written only through partner_become
  partner_payouts: "own", // a partner's own payouts (0012, P5): read through their partner row; written only by partner_payout_mark
  partner_reversals_waiting: "none", // a refund that came before its share (00207): the service role's alone
  page_vitals: "none", // a page load's timings (00255): no person, no workspace; the routes and the back office read it
  erasure_keying: "none", // whether the erasure digests are keyed (00263): one row, read only by the definer functions
};

/** A member's grant on files is by column (00551: never the copy's id or the fingerprint), so `*` is refused them. */
export const COLUMNS_OF = {
  files: "id, tenant_id",
  // A member never reads a post's container, nor what a send carried and what came back (00611's column grants).
  posts: "id, tenant_id, status",
  publish_attempts: "id, tenant_id, outcome",
  // A member never reads the machine a video is drawn on, nor its card's key (00613's column grants).
  pieces: "id, tenant_id, status",
  // A member never reads where a piece of a copy sits on the shelf, nor a checksum (00686's column grants).
  file_archive_parts: "id, tenant_id, state",
};

export const seen = async (client, table, filter) => {
  let q = client
    .from(table)
    .select(COLUMNS_OF[table] ?? "*")
    .limit(5);
  for (const [col, val] of filter) q = q.eq(col, val);
  const r = await q;
  return r.error ? `error: ${r.error.message}` : r.data.length;
};

export const nothing = (x) => x === 0 || (typeof x === "string" && x.startsWith("error:"));

/**
 * How a select was refused, for the service role's tables: the Postgres error
 * code, or what came back instead. A sibling of seen(), not a change to it:
 * seen() answers "how many rows" for every other table and every other check
 * here; this answers "was the privilege itself refused".
 */
export const refusedWith = async (client, table, filter) => {
  let q = client.from(table).select("*").limit(5);
  for (const [col, val] of filter) q = q.eq(col, val);
  const r = await q;
  if (!r.error) return `${r.data.length} rows`;
  return r.error.code ?? `an error without a code: ${r.error.message}`;
};

/**
 * The service role's tables must refuse the PRIVILEGE, not only the rows. RLS
 * on with no policy answers a member with an empty list, and so does a table
 * that turned RLS on and forgot the revoke: the two read as equally safe until
 * someone grants the second one something. 42501 (insufficient_privilege) is
 * the only answer that says the grant itself is gone, so it is what every
 * "none" table is required to say -- to a viewer, an owner and a stranger
 * alike. Four tables (billing_events, jobs, platform_admins, sweep_status)
 * answered [] until 00120; this is the assertion that would have named them.
 */
export const PRIVILEGE_REFUSED = "42501";

export const notRefused = (who, how) =>
  `the service role's table did not refuse ${who} the privilege (${PRIVILEGE_REFUSED}); it answered ${how}`;

/**
 * The tables whose rows a sweep takes away, in whichever suite runs one beside this. The relay (relay_events, 00334:
 * the first step of every tick) takes every workspace's outbox rows, oldest first, and deletes each: this workspace's
 * seeded one too, when the relay's own suite, a job's, a broadcast's or a reach-out's runs a tick while this one is
 * judging. The row was then gone before it was counted ("nothing was seeded"), or between the two counts, and a suite
 * that passes alone failed in the whole run for another suite's reason. The proof still needs the row (an update that
 * a policy let through moves no row of an empty table), so it is not excused: it is put back, and the table judged again.
 */
export const TAKEN_BY_A_SWEEP = new Set(["event_outbox"]);

export const NOTHING_SEEDED = "nothing was seeded, so the proof would be vacuous";

export const ROWS_WENT = "the workspace's rows went from";

/** A finding that is about the table's own row count: the two a sweep's take produces. */
export const aboutItsRows = (found) => found.includes(NOTHING_SEEDED) || found.includes(ROWS_WENT);
