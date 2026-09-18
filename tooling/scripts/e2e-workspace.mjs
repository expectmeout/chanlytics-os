/**
 * The nightly's own workspace, made or put back in its known state.
 *
 * The signed-in end-to-end specs used to run as the owner's own account inside
 * a live customer's workspace: every run wrote to it, and the Ask specs spent
 * model tokens there. This makes a workspace that is the suite's alone -- a test
 * owner with exactly one membership, a teammate, three fictional people, one
 * conversation, one call and a WhatsApp channel -- and puts it back in the same
 * state every night, because the specs change some of it and time moves the rest
 * (Reports only counts the last thirty days, so the conversation is re-dated).
 *
 * Every row is chosen to be one production's background work leaves alone:
 *   - the WhatsApp channel has no credentials, no WhatsApp business account and
 *     an id no real phone number can have, so nothing can send from it;
 *   - billing is `direct`, so no Stripe event can reach the workspace or pause it;
 *   - the conversation is open with nothing timed, and the AI reply is delivered,
 *     so no pause, snooze or send sweep selects it;
 *   - the call is ended, with no recording and no thread for the call sweep to
 *     write a note into;
 *   - the config has no calendar, and one notification address: Resend's test
 *     inbox, delivered@resend.dev, which Resend documents as an address that
 *     simulates a delivery, so what is sent to it reaches nobody. It is there
 *     because e2e/thread.spec.ts sends a reply this channel cannot carry: the
 *     failure opens an escalation and alerts the owner, and for a workspace with
 *     no address chooseAddressing (apps/edge/lib/notify.ts) answers `redacted`,
 *     which mails the platform's own mailbox -- a real person -- every night,
 *     and the deadman pages the platform if the escalation outlives two hours.
 *     With an address on file both go to the workspace's own, and this one
 *     delivers nowhere;
 *   - the people have said yes to MESSAGES and nobody has said yes to OFFERS --
 *     the state a real salon was in on 17 Sep 2026, and the one Today's "Worth a
 *     look", People's list steps and Broadcasts' "Get their yes" exist to answer.
 *     A yes to messages starts nothing on its own: the receptionist only ever
 *     answers, nothing here is scheduled to write first, and the channel above
 *     could not carry it if it were. With nobody's yes to offers, no promotional
 *     send has an audience at all. Three, because a list the product calls a
 *     list starts at three (contracts todayLeaks) -- the seed meets the product's
 *     floor rather than the product meeting the seed's;
 *   - and there is no job, escalation, line, playbook, broadcast or Google row.
 *
 * It refuses an owner or teammate address outside example.com, so it can never
 * reset a real account, and refuses when the owner belongs to any workspace but
 * this one and the probes workspace-create.spec.ts makes, or when this workspace
 * has any member but the two test users.
 *
 * The prod-script bar: a dry run by default, a JSONL backup of the workspace
 * before any write, idempotent, and --apply to write.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_USER_EMAIL, E2E_MEMBER_EMAIL
 * Usage: node tooling/scripts/e2e-workspace.mjs [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import { TenantConfigWriteSchema, newReceptionistDefaults } from "@chanlytics/contracts";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SLUG = "chanlytics-e2e";
export const NAME = "Chanlytics E2E Studio";
export const CALL_ID = "e2e-seed-call-1";
const TIMEZONE = "America/New_York";
const BOOKING_LINK = "https://example.com/book/e2e";
const BUSINESS_PHONE = "+12125550142";
const BUSINESS_PHONE_DISPLAY = "(212) 555-0142";
/** 555-01xx is the range set aside for fiction. Stored canonical, as the app compares them. */
export const PEOPLE = [
  { phone: "+12125550143", name: "Robin Example", waProfile: "Robin", identity: { channel: "whatsapp", external_id: "12125550143" } },
  { phone: "+12125550144", name: "Casey Example", waProfile: null, identity: { channel: "voice", external_id: "+12125550144" } },
  { phone: "+12125550145", name: "Sam Example", waProfile: null, identity: { channel: "voice", external_id: "+12125550145" } },
];

/**
 * Every person's two answers, in force after each run: a yes to messages, taken
 * in person a week before the run, and nothing yet about offers. The specs
 * (e2e/owner-signals.spec.ts) read this state and nothing else; verify() below
 * refuses a workspace that drifted from it.
 */
export const SAID_YES_TO_MESSAGES = "opted_in";
export const SAID_YES_TO_OFFERS = "unknown";
const CONSENT_SOURCE = "in_person";
const WEEK_MS = 7 * 86_400_000;
/**
 * Where the workspace's alerts go: Resend's test inbox, which simulates a
 * delivery and reaches nobody (resend.com/docs/dashboard/emails/send-test-emails).
 * No `from` of its own, so the alert leaves from the platform's verified sender.
 * The header says why there is an address at all.
 */
export const ALERT_INBOX = "delivered@resend.dev";
/** The name workspace-create.spec.ts gives the workspaces it makes and deletes. */
const PROBE_PREFIX = "E2E probe";
/** What provision_tenant gives a new workspace (00073), so a run starts from it. */
const POLICY_MODES = { faq: "auto", booking: "auto", reply: "auto", reengage: "ask", campaign: "ask", reviews: "ask", money: "never" };
const REPLY_LIMITS = { max_replies_day: 20, pause_hours: 24 };

/** The channel's id: the workspace's own, and never something a real number could be. */
export const channelExternalId = (tenantId) => `e2e-wa-${tenantId}`;

function must(what, res) {
  if (res?.error) throw new Error(`${what}: ${res.error.message}`);
  return res?.data ?? null;
}

/** A config the settings save would accept, built by the same helpers. */
export function workspaceConfig() {
  const brain = {
    business_name: NAME,
    phone_display: BUSINESS_PHONE_DISPLAY,
    booking_link: BOOKING_LINK,
    ...newReceptionistDefaults(NAME),
  };
  const parsed = TenantConfigWriteSchema.safeParse({ brain, notifications: { escalation_emails: [ALERT_INBOX] } });
  if (!parsed.success) {
    throw new Error(`the seeded config would not save: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

async function findUser(db, email) {
  const want = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing users: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === want);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureUser(db, email, apply, did) {
  const found = await findUser(db, email);
  if (found) return found.id;
  if (!apply) {
    did.push(`would create the user ${email}`);
    return null;
  }
  // Confirmed at creation, so no email is sent; sign-in is minted by the harness.
  const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw new Error(`creating ${email}: ${error.message}`);
  did.push(`created the user ${email}`);
  return data.user.id;
}

/** Every row the workspace holds that a run resets, for the backup taken before one. */
export async function snapshot(db, tenantId, userIds) {
  const rows = [];
  const keep = (table, data) => { for (const row of data ?? []) rows.push({ table, row }); };
  if (tenantId) {
    keep("tenants", must("backing up tenants", await db.from("tenants").select("*").eq("id", tenantId)));
    for (const table of ["billing_accounts", "tenant_config", "policies", "memberships", "tenant_channels", "contacts", "contact_identities",
      "conversations", "messages", "calls", "escalations", "jobs", "broadcasts", "segments", "ask_threads", "invitations"]) {
      keep(table, must(`backing up ${table}`, await db.from(table).select("*").eq("tenant_id", tenantId)));
    }
  }
  const ids = userIds.filter(Boolean);
  if (ids.length) keep("profiles", must("backing up profiles", await db.from("profiles").select("*").in("user_id", ids)));
  return rows;
}

async function deleteWhere(db, table, column, values, what) {
  for (const value of values) must(what, await db.from(table).delete().eq(column, value));
}

/**
 * Brings the workspace to its known state. With `apply: false` it reads, checks
 * every refusal, and says what it would do.
 */
export async function converge(db, { ownerEmail, memberEmail, apply = false, now = Date.now(), backup = null } = {}) {
  for (const [label, email] of [["E2E_USER_EMAIL", ownerEmail], ["E2E_MEMBER_EMAIL", memberEmail]]) {
    if (!/^[^@\s]+@example\.com$/i.test(email ?? "")) {
      throw new Error(`${label} must be an address at example.com: this resets the account it names`);
    }
  }
  if (ownerEmail.toLowerCase() === memberEmail.toLowerCase()) throw new Error("the owner and the teammate must be two addresses");
  const config = workspaceConfig();
  const did = [];

  const ownerId = await ensureUser(db, ownerEmail, apply, did);
  const memberId = await ensureUser(db, memberEmail, apply, did);

  let tenant = must("reading the workspace", await db.from("tenants").select("id, name, status").eq("slug", SLUG).maybeSingle());
  if (tenant) {
    const members = must("reading its members", await db.from("memberships").select("user_id").eq("tenant_id", tenant.id));
    const strangers = members.filter((m) => m.user_id !== ownerId && m.user_id !== memberId);
    if (strangers.length) throw new Error(`${SLUG} has ${strangers.length} member(s) besides the two test users; refusing to reset it`);
  }

  // The specs assume one workspace. A probe workspace-create.spec.ts failed to
  // delete is swept; any other membership is a mistake to report, not to fix.
  let probes = [];
  if (ownerId) {
    const mine = must("reading the owner's memberships", await db.from("memberships").select("tenant_id").eq("user_id", ownerId));
    const otherIds = mine.map((m) => m.tenant_id).filter((id) => id !== tenant?.id);
    if (otherIds.length) {
      const others = must("reading the owner's other workspaces", await db.from("tenants").select("id, name").in("id", otherIds));
      const foreign = others.filter((t) => !t.name.startsWith(PROBE_PREFIX));
      if (foreign.length) throw new Error(`the test owner also belongs to ${foreign.map((t) => t.name).join(", ")}; refusing, since the specs assume one workspace`);
      for (const probe of others) {
        const pm = must("reading a probe's members", await db.from("memberships").select("user_id").eq("tenant_id", probe.id));
        if (pm.some((m) => m.user_id !== ownerId)) throw new Error(`the probe workspace "${probe.name}" has another member; refusing to delete it`);
      }
      probes = others;
    }
  }

  if (!apply) {
    for (const probe of probes) did.push(`would delete the leftover probe workspace "${probe.name}"`);
    did.push(tenant ? `would reset ${SLUG} (${tenant.id})` : `would create ${SLUG}`);
    return { apply, did, tenantId: tenant?.id ?? null };
  }

  if (backup) await backup(await snapshot(db, tenant?.id ?? null, [ownerId, memberId]));

  for (const probe of probes) {
    must("deleting a probe's events", await db.from("events").delete().eq("tenant_id", probe.id));
    must("deleting a probe's memberships", await db.from("memberships").delete().eq("tenant_id", probe.id));
    must("deleting a probe workspace", await db.from("tenants").delete().eq("id", probe.id));
    did.push(`deleted the leftover probe workspace "${probe.name}"`);
  }

  if (!tenant) {
    tenant = must("creating the workspace", await db.from("tenants").insert({ slug: SLUG, name: NAME, status: "active", timezone: TIMEZONE }).select("id, name, status").single());
    did.push(`created ${SLUG}`);
  }
  const T = tenant.id;
  const stamp = new Date(now).toISOString();

  // The workspace itself, and what provisioning gives every workspace.
  must("provisioning the workspace", await db.rpc("provision_tenant", { p_tenant_id: T }));
  must("naming the workspace", await db.from("tenants").update({ name: NAME, status: "active", timezone: TIMEZONE }).eq("id", T));
  must("setting billing", await db.from("billing_accounts").upsert({
    tenant_id: T, mode: "direct", status: "active", stripe_customer_id: null, stripe_subscription_id: null, price_id: null,
    current_period_end: null, trial_end: null, cancel_at: null, cancel_at_period_end: false, card_brand: null, card_last4: null,
    last_payment_failed_at: null, last_paid_at: null, facts: {},
  }, { onConflict: "tenant_id" }));
  must("setting the config", await db.from("tenant_config").update({ config, updated_by: null, calendar_checked_at: null }).eq("tenant_id", T));
  for (const p of must("reading policies", await db.from("policies").select("id, class, subject_type").eq("tenant_id", T))) {
    if (p.subject_type === null || p.subject_type === undefined) {
      if (POLICY_MODES[p.class]) {
        must("resetting a policy", await db.from("policies").update({ mode: POLICY_MODES[p.class], limits: p.class === "reply" ? REPLY_LIMITS : {} }).eq("id", p.id));
      }
    } else {
      must("removing a person's policy", await db.from("policies").delete().eq("id", p.id));
    }
  }

  // The people who sign in, each with nothing a spec left behind.
  must("the owner's membership", await db.from("memberships").upsert({ user_id: ownerId, tenant_id: T, role: "owner", views: {} }, { onConflict: "user_id,tenant_id" }));
  must("the teammate's membership", await db.from("memberships").upsert({ user_id: memberId, tenant_id: T, role: "operator", views: {} }, { onConflict: "user_id,tenant_id" }));
  must("the profiles", await db.from("profiles").upsert([
    { user_id: ownerId, display_name: "", updated_at: stamp },
    { user_id: memberId, display_name: "", updated_at: stamp },
  ], { onConflict: "user_id" }));
  // An open invitation to either address is accepted on sign-in, which would
  // add a membership; take any back.
  for (const email of [ownerEmail, memberEmail]) {
    must("revoking invitations", await db.from("invitations").update({ revoked_at: stamp }).eq("email", email.toLowerCase()).is("accepted_at", null).is("revoked_at", null));
  }

  // Whatever the specs made in the workspace, gone before it is rebuilt.
  const tenantRows = async (table, columns = "id") => must(`reading ${table}`, await db.from(table).select(columns).eq("tenant_id", T));
  await deleteWhere(db, "calls", "id", (await tenantRows("calls", "id, retell_call_id")).filter((c) => c.retell_call_id !== CALL_ID).map((c) => c.id), "clearing calls");
  for (const table of ["escalations", "jobs", "broadcasts", "segments", "ask_threads"]) {
    await deleteWhere(db, table, "id", (await tenantRows(table)).map((r) => r.id), `clearing ${table}`);
  }
  must("clearing messages", await db.from("messages").delete().eq("tenant_id", T));

  const people = [];
  for (const person of PEOPLE) {
    let row = must("reading a person", await db.from("contacts").select("id, erased_at").eq("tenant_id", T).eq("phone_e164", person.phone).maybeSingle());
    if (row?.erased_at) {
      await deleteWhere(db, "conversations", "contact_id", [row.id], "clearing an erased person's conversation");
      await deleteWhere(db, "contact_identities", "contact_id", [row.id], "clearing an erased person's identities");
      must("removing an erased person", await db.from("contacts").delete().eq("id", row.id));
      row = null;
    }
    const fields = {
      display_name: person.name, wa_profile_name: person.waProfile,
      consent: SAID_YES_TO_MESSAGES, consent_source: CONSENT_SOURCE, consent_updated_at: new Date(now - WEEK_MS).toISOString(),
      dnc: false, notes: null, email: null,
      marketing_consent: SAID_YES_TO_OFFERS, marketing_consent_source: null, marketing_consent_updated_at: null,
      merged_into_contact_id: null,
    };
    if (row) must("resetting a person", await db.from("contacts").update(fields).eq("id", row.id));
    else row = must("adding a person", await db.from("contacts").insert({ tenant_id: T, phone_e164: person.phone, ...fields }).select("id").single());
    people.push({ ...person, id: row.id });
  }
  const keep = new Set(people.map((p) => p.id));
  const [robin] = people;

  const conversations = await tenantRows("conversations", "id, contact_id");
  await deleteWhere(db, "conversations", "id", conversations.filter((c) => c.contact_id !== robin.id).map((c) => c.id), "clearing conversations");
  const strangers = (await tenantRows("contacts")).filter((c) => !keep.has(c.id)).map((c) => c.id);
  await deleteWhere(db, "contact_identities", "contact_id", strangers, "clearing identities");
  await deleteWhere(db, "contacts", "id", strangers, "clearing people");
  for (const person of people) {
    must("a person's identity", await db.from("contact_identities").upsert(
      { tenant_id: T, contact_id: person.id, channel: person.identity.channel, external_id: person.identity.external_id, raw: {} },
      { onConflict: "tenant_id,channel,external_id" },
    ));
  }

  const channelId = channelExternalId(T);
  if (/^\+?\d+$/.test(channelId)) throw new Error("the channel id must not be something a real number could be");
  await deleteWhere(db, "tenant_channels", "id", (await tenantRows("tenant_channels", "id, external_id")).filter((c) => c.external_id !== channelId).map((c) => c.id), "clearing channels");
  must("the WhatsApp channel", await db.from("tenant_channels").upsert({
    tenant_id: T, kind: "whatsapp", external_id: channelId, number_e164: BUSINESS_PHONE, waba_id: null, credentials_ref: null, status: "active", config: {},
  }, { onConflict: "kind,external_id" }));

  // One conversation, re-dated so Reports counts it: the customer asked, the AI answered.
  const inAt = new Date(now - 2 * 3600_000).toISOString();
  const outAt = new Date(now - 2 * 3600_000 + 20_000).toISOString();
  const thread = {
    state: "open", paused_until: null, snooze_until: null, assignee_user_id: null,
    last_message_at: outAt, last_inbound_at: inAt, last_wa_inbound_at: inAt,
  };
  let cv = must("reading the conversation", await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", robin.id).maybeSingle());
  if (cv) must("re-dating the conversation", await db.from("conversations").update(thread).eq("id", cv.id));
  else cv = must("starting the conversation", await db.from("conversations").insert({ tenant_id: T, contact_id: robin.id, ...thread }).select("id").single());
  must("the conversation's messages", await db.from("messages").insert([
    { tenant_id: T, conversation_id: cv.id, contact_id: robin.id, channel: "whatsapp", direction: "inbound", sender: "customer", type: "text",
      body: "Hi, can I book a trim this week?", external_id: "e2e-seed-a-in", channel_ts: inAt, created_at: inAt, status: "received", meta: {} },
    { tenant_id: T, conversation_id: cv.id, contact_id: robin.id, channel: "whatsapp", direction: "outbound", sender: "ai", type: "text",
      body: `Yes! Pick a time here: ${BOOKING_LINK}`, external_id: "e2e-seed-a-out", channel_ts: outAt, created_at: outAt,
      status: "delivered", status_updated_at: outAt, meta: {} },
  ]));

  // One finished call with a transcript, outside any thread, already notified.
  const startedAt = new Date(now - 26 * 3600_000).toISOString();
  const endedAt = new Date(now - 26 * 3600_000 + 95_000).toISOString();
  const casey = people[1];
  must("the call", await db.from("calls").upsert({
    tenant_id: T, retell_call_id: CALL_ID, agent_id: null, channel_id: null, contact_id: casey.id, conversation_id: null, message_id: null,
    direction: "inbound", call_type: "phone_call", from_e164: casey.phone, to_e164: BUSINESS_PHONE, status: "ended",
    started_at: startedAt, ended_at: endedAt, duration_ms: 95_000, disconnection_reason: "user_hangup", sentiment: "Positive",
    call_successful: true, in_voicemail: false, summary: "The caller asked about opening hours and was sent the booking link.",
    wanted: "Asked about opening hours", outcome: "answered", recording: null, raw: {}, notified_at: endedAt,
    transcript: "Agent: Thanks for calling Chanlytics E2E Studio, how can I help?\nUser: What time do you open tomorrow?\nAgent: I can text you the booking link with the times.",
    transcript_object: [
      { role: "agent", content: "Thanks for calling Chanlytics E2E Studio, how can I help?", words: [{ start: 0.4 }] },
      { role: "user", content: "What time do you open tomorrow?", words: [{ start: 4.1 }] },
      { role: "agent", content: "I can text you the booking link with the times.", words: [{ start: 7.9 }] },
    ],
  }, { onConflict: "tenant_id,retell_call_id" }));

  const problems = await verify(db, T, ownerId);
  if (problems.length) throw new Error(`the workspace is not in its known state: ${problems.join("; ")}`);
  did.push(`${SLUG} is in its known state`);
  return { apply, did, tenantId: T };
}

/** Reads the workspace back and names anything that is not as it should be. */
export async function verify(db, T, ownerId) {
  const problems = [];
  const read = async (what, q) => must(what, await q);
  const mine = await read("the owner's memberships", db.from("memberships").select("tenant_id, role").eq("user_id", ownerId));
  if (mine.length !== 1 || mine[0].tenant_id !== T || mine[0].role !== "owner") problems.push(`the owner has ${mine.length} membership(s), not one owner membership here`);
  const [newest] = await read("the newest conversation", db.from("conversations").select("id").eq("tenant_id", T).order("last_message_at", { ascending: false }).limit(1));
  const messages = newest ? await read("its messages", db.from("messages").select("sender, status").eq("conversation_id", newest.id)) : [];
  if (!messages.some((m) => m.sender === "customer") || !messages.some((m) => m.sender === "ai" && m.status !== "queued")) problems.push("the first conversation lacks a customer message and a sent AI reply");
  const billing = await read("billing", db.from("billing_accounts").select("mode, status").eq("tenant_id", T).maybeSingle());
  if (billing?.mode !== "direct" || billing?.status !== "active") problems.push("billing is not direct and active");
  const channels = await read("channels", db.from("tenant_channels").select("external_id, status, credentials_ref, waba_id").eq("tenant_id", T));
  if (channels.length !== 1 || channels[0].status !== "active" || channels[0].credentials_ref !== null || channels[0].waba_id !== null || /^\+?\d+$/.test(channels[0].external_id)) {
    problems.push("the workspace should hold exactly one active WhatsApp channel with no credentials and no real id");
  }
  const call = await read("the call", db.from("calls").select("status, conversation_id, recording, transcript_object").eq("tenant_id", T).eq("retell_call_id", CALL_ID).maybeSingle());
  if (call?.status !== "ended" || call?.conversation_id !== null || call?.recording !== null || !(call?.transcript_object?.length > 0)) problems.push("the call is not an ended call with a transcript and no thread");
  const cfg = await read("the config", db.from("tenant_config").select("config").eq("tenant_id", T).maybeSingle());
  if (!TenantConfigWriteSchema.safeParse(cfg?.config ?? null).success) problems.push("the config would not save");
  if (cfg?.config?.calendar) problems.push("the config has a calendar");
  // The state the owner-signals specs read. A person who said yes to offers here
  // would give a promotional send an audience; fewer than three who said yes to
  // messages would take the list under the product's own floor, and Today's
  // "Worth a look" would have nothing to say -- the specs would then fail on a
  // missing band, which reads nothing like "the seed drifted".
  const people = (await read("the people", db.from("contacts").select("consent, marketing_consent, erased_at").eq("tenant_id", T))).filter((p) => !p.erased_at);
  if (people.some((p) => p.marketing_consent === "opted_in")) problems.push("someone in the workspace has said yes to offers");
  if (people.filter((p) => p.consent === SAID_YES_TO_MESSAGES).length < 3) problems.push("fewer than three people have said yes to messages");
  const alerts = cfg?.config?.notifications;
  if (!alerts || Object.keys(alerts).length !== 1 || alerts.escalation_emails?.length !== 1 || alerts.escalation_emails[0] !== ALERT_INBOX) {
    problems.push(`the config's alerts go somewhere other than the test inbox, ${ALERT_INBOX}`);
  }
  return problems;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(2);
  }
  const apply = process.argv.includes("--apply");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const backupsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
  const report = await converge(db, {
    ownerEmail: process.env.E2E_USER_EMAIL,
    memberEmail: process.env.E2E_MEMBER_EMAIL,
    apply,
    backup: async (rows) => {
      mkdirSync(backupsDir, { recursive: true });
      const file = join(backupsDir, `e2e-workspace-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);
      writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
      console.log(`backed up ${rows.length} rows to ${file}`);
    },
  });
  for (const line of report.did) console.log(`- ${line}`);
  if (!apply) console.log("dry run: nothing was written; --apply writes");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
