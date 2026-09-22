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
 *     no address chooseAddressing (apps/edge/lib/ops/notify.ts) answers `redacted`,
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
import { TenantConfigWriteSchema, leadMonth, newReceptionistDefaults } from "@chanlytics/contracts";
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
  {
    phone: "+12125550143",
    name: "Robin Example",
    waProfile: "Robin",
    identity: { channel: "whatsapp", external_id: "12125550143" },
  },
  {
    phone: "+12125550144",
    name: "Casey Example",
    waProfile: null,
    identity: { channel: "voice", external_id: "+12125550144" },
  },
  {
    phone: "+12125550145",
    name: "Sam Example",
    waProfile: null,
    identity: { channel: "voice", external_id: "+12125550145" },
  },
];

/**
 * One finished search and six leads, in every class and stage e2e/leads.spec.ts
 * reads. Nothing here is a real business: `.example` hosts, 555-01xx numbers,
 * ChIJfixture place ids. The search's phones sit in a different exchange from
 * the people above, so 00140's contacts_link_lead trigger never links one to a
 * seeded person.
 */
export const LEAD_SEARCH = {
  name: "Personal trainers · Austin",
  asked: "personal trainers in Austin with a website, then find their email",
  via: "people",
  card: "local_businesses",
};
export const LEAD_PLAN = {
  version: 1,
  card: "local_businesses",
  name: "personal trainers",
  asked: LEAD_SEARCH.asked,
  terms: ["personal trainer"],
  area: {
    kind: "city",
    label: "Austin, TX",
    state: "TX",
    center: { lat: 30.2672, lng: -97.7431 },
    radius_m: 15000,
    query: "Austin, TX",
  },
  count: 6,
  contact: "email",
  criteria: [
    { key: "independent", text: "independent, not a chain", standard: "likely", required: true },
    { key: "website", text: "has a website", standard: "seen", required: true },
    { key: "right_kind", text: "a personal trainer, not a big-box gym", standard: "likely", required: true },
  ],
  exclusions: [{ key: "chain", text: "chain gyms", origin: "claude" }],
};
/** The round the specs read: one probe that reached what it was asked for. */
export const LEAD_ROUND = {
  seq: 1,
  purpose: "probe",
  ending: "target_reached",
  target: 6,
  plan_version: 1,
  cost_usd: "0.1800",
  judge_tokens: 2400,
};
export const LEADS = [
  {
    place_id: "ChIJfixture0001",
    business_name: "Zilker Strength Lab",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1200 Barton Springs Rd",
    phone_e164: "+15125550101",
    email: "hello@zilkerstrength.example",
    email_state: "ok",
    website_host: "zilkerstrength.example",
    rating: "5.0",
    reviews: 16,
    stage: "ready",
    member: {
      class: "qualified",
      fit: "strong",
      reason: "Independent coaching, 5.0 from 16 reviews",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0002",
    business_name: "Travis Heights Coaching Co.",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1500 S Congress Ave",
    phone_e164: "+15125550102",
    email: "hello@travisheightscoaching.example",
    email_state: "ok",
    website_host: "travisheightscoaching.example",
    rating: "4.9",
    reviews: 88,
    stage: "ready",
    member: {
      class: "qualified",
      fit: "strong",
      reason: "Independent, one location, 88 reviews",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0003",
    business_name: "Mueller Movement Studio",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "1900 Aldrich St",
    phone_e164: "+15125550103",
    email: "info@muellermovement.example",
    email_state: "catch_all",
    website_host: "muellermovement.example",
    rating: "4.7",
    reviews: 40,
    stage: "ready",
    member: {
      class: "review",
      fit: null,
      reason: "Couldn't confirm the email",
      counted: false,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0004",
    business_name: "East Side Kettlebell",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "2200 E 7th St",
    phone_e164: "+15125550104",
    email: null,
    email_state: "none",
    website_host: null,
    rating: "4.8",
    reviews: 22,
    stage: "ready",
    member: {
      class: "review",
      fit: null,
      reason: "No email to check; a phone only",
      counted: false,
      judged: { independent: "pass", website: "fail", right_kind: "pass", chain: "pass" },
    },
  },
  {
    place_id: "ChIJfixture0005",
    business_name: "FitCorp Austin Central",
    category: "Gym",
    city: "Austin",
    region: "TX",
    street: "500 W 6th St",
    phone_e164: "+15125550105",
    email: null,
    email_state: "none",
    website_host: "fitcorp.example",
    rating: "4.1",
    reviews: 900,
    stage: "ready",
    member: {
      class: "excluded",
      excluded_by: "chain",
      fit: null,
      reason: "A chain gym",
      counted: false,
      judged: { independent: "fail", website: "pass", right_kind: "fail", chain: "fail" },
    },
  },
  {
    place_id: "ChIJfixture0006",
    business_name: "Hyde Park Personal Training",
    category: "Personal trainer",
    city: "Austin",
    region: "TX",
    street: "4300 Speedway",
    phone_e164: "+15125550106",
    email: "hi@hydeparkpt.example",
    email_state: "ok",
    website_host: "hydeparkpt.example",
    rating: "4.9",
    reviews: 31,
    stage: "nurture",
    member: {
      class: "qualified",
      fit: "look",
      reason: "Independent; one review mentions a waitlist",
      counted: true,
      judged: { independent: "pass", website: "pass", right_kind: "pass", chain: "pass" },
    },
  },
];
/** What the three counted leads used of the month's allowance. */
export const LEAD_COUNTED = LEADS.filter((l) => l.member.counted).length;

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
const POLICY_MODES = {
  faq: "auto",
  booking: "auto",
  reply: "auto",
  reengage: "ask",
  campaign: "ask",
  reviews: "ask",
  money: "never",
};
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
    throw new Error(
      `the seeded config would not save: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
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
  const keep = (table, data) => {
    for (const row of data ?? []) rows.push({ table, row });
  };
  if (tenantId) {
    keep("tenants", must("backing up tenants", await db.from("tenants").select("*").eq("id", tenantId)));
    for (const table of [
      "billing_accounts",
      "tenant_config",
      "policies",
      "memberships",
      "tenant_channels",
      "contacts",
      "contact_identities",
      "conversations",
      "messages",
      "calls",
      "escalations",
      "jobs",
      "broadcasts",
      "segments",
      "ask_threads",
      "invitations",
      "lead_searches",
      "lead_rounds",
      "leads",
      "lead_search_members",
      "lead_counters",
      "lead_operations",
    ]) {
      keep(table, must(`backing up ${table}`, await db.from(table).select("*").eq("tenant_id", tenantId)));
    }
  }
  const ids = userIds.filter(Boolean);
  if (ids.length)
    keep("profiles", must("backing up profiles", await db.from("profiles").select("*").in("user_id", ids)));
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
  for (const [label, email] of [
    ["E2E_USER_EMAIL", ownerEmail],
    ["E2E_MEMBER_EMAIL", memberEmail],
  ]) {
    if (!/^[^@\s]+@example\.com$/i.test(email ?? "")) {
      throw new Error(`${label} must be an address at example.com: this resets the account it names`);
    }
  }
  if (ownerEmail.toLowerCase() === memberEmail.toLowerCase())
    throw new Error("the owner and the teammate must be two addresses");
  const config = workspaceConfig();
  const did = [];

  const ownerId = await ensureUser(db, ownerEmail, apply, did);
  const memberId = await ensureUser(db, memberEmail, apply, did);

  let tenant = must(
    "reading the workspace",
    await db.from("tenants").select("id, name, status").eq("slug", SLUG).maybeSingle(),
  );
  if (tenant) {
    const members = must(
      "reading its members",
      await db.from("memberships").select("user_id").eq("tenant_id", tenant.id),
    );
    const strangers = members.filter((m) => m.user_id !== ownerId && m.user_id !== memberId);
    if (strangers.length)
      throw new Error(`${SLUG} has ${strangers.length} member(s) besides the two test users; refusing to reset it`);
  }

  // The specs assume one workspace. A probe workspace-create.spec.ts failed to
  // delete is swept; any other membership is a mistake to report, not to fix.
  let probes = [];
  if (ownerId) {
    const mine = must(
      "reading the owner's memberships",
      await db.from("memberships").select("tenant_id").eq("user_id", ownerId),
    );
    const otherIds = mine.map((m) => m.tenant_id).filter((id) => id !== tenant?.id);
    if (otherIds.length) {
      const others = must(
        "reading the owner's other workspaces",
        await db.from("tenants").select("id, name").in("id", otherIds),
      );
      const foreign = others.filter((t) => !t.name.startsWith(PROBE_PREFIX));
      if (foreign.length)
        throw new Error(
          `the test owner also belongs to ${foreign.map((t) => t.name).join(", ")}; refusing, since the specs assume one workspace`,
        );
      for (const probe of others) {
        const pm = must(
          "reading a probe's members",
          await db.from("memberships").select("user_id").eq("tenant_id", probe.id),
        );
        if (pm.some((m) => m.user_id !== ownerId))
          throw new Error(`the probe workspace "${probe.name}" has another member; refusing to delete it`);
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
    tenant = must(
      "creating the workspace",
      await db
        .from("tenants")
        .insert({ slug: SLUG, name: NAME, status: "active", timezone: TIMEZONE })
        .select("id, name, status")
        .single(),
    );
    did.push(`created ${SLUG}`);
  }
  const T = tenant.id;
  const stamp = new Date(now).toISOString();

  // The workspace itself, and what provisioning gives every workspace.
  must("provisioning the workspace", await db.rpc("provision_tenant", { p_tenant_id: T }));
  must(
    "naming the workspace",
    await db.from("tenants").update({ name: NAME, status: "active", timezone: TIMEZONE }).eq("id", T),
  );
  must(
    "setting billing",
    await db.from("billing_accounts").upsert(
      {
        tenant_id: T,
        mode: "direct",
        status: "active",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        price_id: null,
        current_period_end: null,
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        card_brand: null,
        card_last4: null,
        last_payment_failed_at: null,
        last_paid_at: null,
        facts: {},
      },
      { onConflict: "tenant_id" },
    ),
  );
  must(
    "setting the config",
    await db.from("tenant_config").update({ config, updated_by: null, calendar_checked_at: null }).eq("tenant_id", T),
  );
  for (const p of must(
    "reading policies",
    await db.from("policies").select("id, class, subject_type").eq("tenant_id", T),
  )) {
    if (p.subject_type === null || p.subject_type === undefined) {
      if (POLICY_MODES[p.class]) {
        must(
          "resetting a policy",
          await db
            .from("policies")
            .update({ mode: POLICY_MODES[p.class], limits: p.class === "reply" ? REPLY_LIMITS : {} })
            .eq("id", p.id),
        );
      }
    } else {
      must("removing a person's policy", await db.from("policies").delete().eq("id", p.id));
    }
  }

  // The people who sign in, each with nothing a spec left behind.
  must(
    "the owner's membership",
    await db
      .from("memberships")
      .upsert({ user_id: ownerId, tenant_id: T, role: "owner", views: {} }, { onConflict: "user_id,tenant_id" }),
  );
  must(
    "the teammate's membership",
    await db
      .from("memberships")
      .upsert({ user_id: memberId, tenant_id: T, role: "operator", views: {} }, { onConflict: "user_id,tenant_id" }),
  );
  must(
    "the profiles",
    await db.from("profiles").upsert(
      [
        { user_id: ownerId, display_name: "", updated_at: stamp },
        { user_id: memberId, display_name: "", updated_at: stamp },
      ],
      { onConflict: "user_id" },
    ),
  );
  // An open invitation to either address is accepted on sign-in, which would
  // add a membership; take any back.
  for (const email of [ownerEmail, memberEmail]) {
    must(
      "revoking invitations",
      await db
        .from("invitations")
        .update({ revoked_at: stamp })
        .eq("email", email.toLowerCase())
        .is("accepted_at", null)
        .is("revoked_at", null),
    );
  }

  // Whatever the specs made in the workspace, gone before it is rebuilt.
  const tenantRows = async (table, columns = "id") =>
    must(`reading ${table}`, await db.from(table).select(columns).eq("tenant_id", T));
  await deleteWhere(
    db,
    "calls",
    "id",
    (await tenantRows("calls", "id, retell_call_id")).filter((c) => c.retell_call_id !== CALL_ID).map((c) => c.id),
    "clearing calls",
  );
  for (const table of ["escalations", "jobs", "broadcasts", "segments", "ask_threads"]) {
    await deleteWhere(
      db,
      table,
      "id",
      (await tenantRows(table)).map((r) => r.id),
      `clearing ${table}`,
    );
  }
  must("clearing messages", await db.from("messages").delete().eq("tenant_id", T));

  const people = [];
  for (const person of PEOPLE) {
    let row = must(
      "reading a person",
      await db.from("contacts").select("id, erased_at").eq("tenant_id", T).eq("phone_e164", person.phone).maybeSingle(),
    );
    if (row?.erased_at) {
      await deleteWhere(db, "conversations", "contact_id", [row.id], "clearing an erased person's conversation");
      await deleteWhere(db, "contact_identities", "contact_id", [row.id], "clearing an erased person's identities");
      must("removing an erased person", await db.from("contacts").delete().eq("id", row.id));
      row = null;
    }
    const fields = {
      display_name: person.name,
      wa_profile_name: person.waProfile,
      consent: SAID_YES_TO_MESSAGES,
      consent_source: CONSENT_SOURCE,
      consent_updated_at: new Date(now - WEEK_MS).toISOString(),
      dnc: false,
      notes: null,
      email: null,
      marketing_consent: SAID_YES_TO_OFFERS,
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      merged_into_contact_id: null,
    };
    if (row) must("resetting a person", await db.from("contacts").update(fields).eq("id", row.id));
    else
      row = must(
        "adding a person",
        await db
          .from("contacts")
          .insert({ tenant_id: T, phone_e164: person.phone, ...fields })
          .select("id")
          .single(),
      );
    people.push({ ...person, id: row.id });
  }
  const keep = new Set(people.map((p) => p.id));
  const [robin] = people;

  const conversations = await tenantRows("conversations", "id, contact_id");
  await deleteWhere(
    db,
    "conversations",
    "id",
    conversations.filter((c) => c.contact_id !== robin.id).map((c) => c.id),
    "clearing conversations",
  );
  const strangers = (await tenantRows("contacts")).filter((c) => !keep.has(c.id)).map((c) => c.id);
  await deleteWhere(db, "contact_identities", "contact_id", strangers, "clearing identities");
  await deleteWhere(db, "contacts", "id", strangers, "clearing people");
  for (const person of people) {
    must(
      "a person's identity",
      await db.from("contact_identities").upsert(
        {
          tenant_id: T,
          contact_id: person.id,
          channel: person.identity.channel,
          external_id: person.identity.external_id,
          raw: {},
        },
        { onConflict: "tenant_id,channel,external_id" },
      ),
    );
  }

  const channelId = channelExternalId(T);
  if (/^\+?\d+$/.test(channelId)) throw new Error("the channel id must not be something a real number could be");
  await deleteWhere(
    db,
    "tenant_channels",
    "id",
    (await tenantRows("tenant_channels", "id, external_id"))
      .filter((c) => c.external_id !== channelId)
      .map((c) => c.id),
    "clearing channels",
  );
  must(
    "the WhatsApp channel",
    await db.from("tenant_channels").upsert(
      {
        tenant_id: T,
        kind: "whatsapp",
        external_id: channelId,
        number_e164: BUSINESS_PHONE,
        waba_id: null,
        credentials_ref: null,
        status: "active",
        config: {},
      },
      { onConflict: "kind,external_id" },
    ),
  );

  // One conversation, re-dated so Reports counts it: the customer asked, the AI answered.
  const inAt = new Date(now - 2 * 3600_000).toISOString();
  const outAt = new Date(now - 2 * 3600_000 + 20_000).toISOString();
  const thread = {
    state: "open",
    paused_until: null,
    snooze_until: null,
    assignee_user_id: null,
    last_message_at: outAt,
    last_inbound_at: inAt,
    last_wa_inbound_at: inAt,
  };
  let cv = must(
    "reading the conversation",
    await db.from("conversations").select("id").eq("tenant_id", T).eq("contact_id", robin.id).maybeSingle(),
  );
  if (cv) must("re-dating the conversation", await db.from("conversations").update(thread).eq("id", cv.id));
  else
    cv = must(
      "starting the conversation",
      await db
        .from("conversations")
        .insert({ tenant_id: T, contact_id: robin.id, ...thread })
        .select("id")
        .single(),
    );
  must(
    "the conversation's messages",
    await db.from("messages").insert([
      {
        tenant_id: T,
        conversation_id: cv.id,
        contact_id: robin.id,
        channel: "whatsapp",
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: "Hi, can I book a trim this week?",
        external_id: "e2e-seed-a-in",
        channel_ts: inAt,
        created_at: inAt,
        status: "received",
        meta: {},
      },
      {
        tenant_id: T,
        conversation_id: cv.id,
        contact_id: robin.id,
        channel: "whatsapp",
        direction: "outbound",
        sender: "ai",
        type: "text",
        body: `Yes! Pick a time here: ${BOOKING_LINK}`,
        external_id: "e2e-seed-a-out",
        channel_ts: outAt,
        created_at: outAt,
        status: "delivered",
        status_updated_at: outAt,
        meta: {},
      },
    ]),
  );

  // One finished call with a transcript, outside any thread, already notified.
  const startedAt = new Date(now - 26 * 3600_000).toISOString();
  const endedAt = new Date(now - 26 * 3600_000 + 95_000).toISOString();
  const casey = people[1];
  must(
    "the call",
    await db.from("calls").upsert(
      {
        tenant_id: T,
        retell_call_id: CALL_ID,
        agent_id: null,
        channel_id: null,
        contact_id: casey.id,
        conversation_id: null,
        message_id: null,
        direction: "inbound",
        call_type: "phone_call",
        from_e164: casey.phone,
        to_e164: BUSINESS_PHONE,
        status: "ended",
        started_at: startedAt,
        ended_at: endedAt,
        duration_ms: 95_000,
        disconnection_reason: "user_hangup",
        sentiment: "Positive",
        call_successful: true,
        in_voicemail: false,
        summary: "The caller asked about opening hours and was sent the booking link.",
        wanted: "Asked about opening hours",
        outcome: "answered",
        recording: null,
        raw: {},
        notified_at: endedAt,
        transcript:
          "Agent: Thanks for calling Chanlytics E2E Studio, how can I help?\nUser: What time do you open tomorrow?\nAgent: I can text you the booking link with the times.",
        transcript_object: [
          {
            role: "agent",
            content: "Thanks for calling Chanlytics E2E Studio, how can I help?",
            words: [{ start: 0.4 }],
          },
          { role: "user", content: "What time do you open tomorrow?", words: [{ start: 4.1 }] },
          { role: "agent", content: "I can text you the booking link with the times.", words: [{ start: 7.9 }] },
        ],
      },
      { onConflict: "tenant_id,retell_call_id" },
    ),
  );

  await convergeLeads(db, T, ownerId, now);

  const problems = await verify(db, T, ownerId);
  if (problems.length) throw new Error(`the workspace is not in its known state: ${problems.join("; ")}`);
  did.push(`${SLUG} is in its known state`);
  return { apply, did, tenantId: T };
}

/**
 * The lead finder's seed: one finished search, six leads, their memberships and
 * the month's counters, deleted and written again every run so the specs read
 * one state. The workspace is listed in `lead_platform.tenants_on` (decision
 * 30) so a paid run may start a real search here while the switch stays off for
 * everyone else -- the list is added to, never replaced, and `searches_on` is
 * never touched.
 *
 * A round may not be inserted ended (00140's lead_rounds_guard: a round starts
 * queued), so it is written queued and then ended in one update, which is the
 * transition the guard allows.
 */
async function convergeLeads(db, T, ownerId, now) {
  const stamp = new Date(now).toISOString();
  const month = leadMonth(TIMEZONE, new Date(now));
  const day = new Date(now).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

  const platform = must(
    "reading the platform switch",
    await db.from("lead_platform").select("searches_on, tenants_on").eq("id", true).maybeSingle(),
  );
  if (!platform) throw new Error("lead_platform has no row: release A's migration is not on this database");
  if (!(platform.tenants_on ?? []).includes(T)) {
    must(
      "listing the workspace as one that may search",
      await db
        .from("lead_platform")
        .update({ tenants_on: [...(platform.tenants_on ?? []), T] })
        .eq("id", true),
    );
  }

  const old = must("reading the searches", await db.from("lead_searches").select("id").eq("tenant_id", T));
  await deleteWhere(
    db,
    "lead_searches",
    "id",
    old.map((s) => s.id),
    "clearing searches",
  );
  must("clearing lead operations", await db.from("lead_operations").delete().eq("tenant_id", T));
  must("clearing leads", await db.from("leads").delete().eq("tenant_id", T));
  must("clearing the lead counters", await db.from("lead_counters").delete().eq("tenant_id", T));

  const search = must(
    "the search",
    await db
      .from("lead_searches")
      .insert({
        tenant_id: T,
        created_by: ownerId,
        via: LEAD_SEARCH.via,
        card: LEAD_SEARCH.card,
        name: LEAD_SEARCH.name,
        asked: LEAD_SEARCH.asked,
        plan: LEAD_PLAN,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );

  const round = must(
    "the round",
    await db
      .from("lead_rounds")
      .insert({
        tenant_id: T,
        search_id: search.id,
        seq: LEAD_ROUND.seq,
        purpose: LEAD_ROUND.purpose,
        plan: LEAD_PLAN,
        plan_version: LEAD_ROUND.plan_version,
        target: LEAD_ROUND.target,
        state: "queued",
        allowance_reserved: 0,
        allowance_used: LEAD_COUNTED,
        cost_reserved_usd: 0,
        cost_usd: LEAD_ROUND.cost_usd,
        judge_tokens: LEAD_ROUND.judge_tokens,
        judge_model: "seed",
        month,
        day,
        platform_day: new Date(now).toISOString().slice(0, 10),
        started_at: stamp,
        created_at: stamp,
      })
      .select("id")
      .single(),
  );
  must(
    "ending the round",
    await db
      .from("lead_rounds")
      .update({ state: "ended", ending: LEAD_ROUND.ending, ended_at: stamp })
      .eq("id", round.id),
  );

  // A minute apart, oldest last: `leads_page`'s fit sort packs the band with
  // (9999999999 - found_at), so six leads found in the same second tie and fall
  // back to a random member id. The specs read "strongest fit first" off this.
  for (const [i, lead] of LEADS.entries()) {
    const foundAt = new Date(now - i * 60_000).toISOString();
    const row = must(
      "a lead",
      await db
        .from("leads")
        .insert({
          tenant_id: T,
          place_id: lead.place_id,
          business_name: lead.business_name,
          category: lead.category,
          street: lead.street,
          city: lead.city,
          region: lead.region,
          country: "US",
          website_host: lead.website_host,
          phone_e164: lead.phone_e164,
          phone_sources: lead.website_host ? 2 : 1,
          email: lead.email,
          email_state: lead.email_state,
          email_checked_at: lead.email_state === "none" ? null : foundAt,
          rating: lead.rating,
          reviews: lead.reviews,
          stage: lead.stage,
          found_at: foundAt,
        })
        .select("id")
        .single(),
    );
    must(
      "a membership",
      await db.from("lead_search_members").insert({
        search_id: search.id,
        lead_id: row.id,
        round_id: round.id,
        tenant_id: T,
        judgment: {
          answer: {
            ref: lead.place_id,
            criteria: Object.entries(lead.member.judged).map(([key, answer]) => ({
              key,
              answer,
              facts: ["name", "category"],
            })),
            email_index: lead.email ? 0 : null,
            reason: lead.member.reason,
          },
          reasons: [],
          shares: [],
        },
        class: lead.member.class,
        excluded_by: lead.member.excluded_by ?? null,
        fit: lead.member.fit,
        reason: lead.member.reason,
        counted: lead.member.counted,
        counted_month: lead.member.counted ? month : null,
        created_at: stamp,
      }),
    );
  }

  must(
    "the month's counters",
    await db.from("lead_counters").insert([
      { tenant_id: T, kind: "allowance", period: month, used: LEAD_COUNTED, reserved: 0 },
      { tenant_id: T, kind: "budget", period: month, used: LEAD_ROUND.cost_usd, reserved: 0 },
    ]),
  );
}

/** Reads the workspace back and names anything that is not as it should be. */
export async function verify(db, T, ownerId) {
  const problems = [];
  const read = async (what, q) => must(what, await q);
  const mine = await read(
    "the owner's memberships",
    db.from("memberships").select("tenant_id, role").eq("user_id", ownerId),
  );
  if (mine.length !== 1 || mine[0].tenant_id !== T || mine[0].role !== "owner")
    problems.push(`the owner has ${mine.length} membership(s), not one owner membership here`);
  const [newest] = await read(
    "the newest conversation",
    db.from("conversations").select("id").eq("tenant_id", T).order("last_message_at", { ascending: false }).limit(1),
  );
  const messages = newest
    ? await read("its messages", db.from("messages").select("sender, status").eq("conversation_id", newest.id))
    : [];
  if (
    !messages.some((m) => m.sender === "customer") ||
    !messages.some((m) => m.sender === "ai" && m.status !== "queued")
  )
    problems.push("the first conversation lacks a customer message and a sent AI reply");
  const billing = await read(
    "billing",
    db.from("billing_accounts").select("mode, status").eq("tenant_id", T).maybeSingle(),
  );
  if (billing?.mode !== "direct" || billing?.status !== "active") problems.push("billing is not direct and active");
  const channels = await read(
    "channels",
    db.from("tenant_channels").select("external_id, status, credentials_ref, waba_id").eq("tenant_id", T),
  );
  if (
    channels.length !== 1 ||
    channels[0].status !== "active" ||
    channels[0].credentials_ref !== null ||
    channels[0].waba_id !== null ||
    /^\+?\d+$/.test(channels[0].external_id)
  ) {
    problems.push("the workspace should hold exactly one active WhatsApp channel with no credentials and no real id");
  }
  const call = await read(
    "the call",
    db
      .from("calls")
      .select("status, conversation_id, recording, transcript_object")
      .eq("tenant_id", T)
      .eq("retell_call_id", CALL_ID)
      .maybeSingle(),
  );
  if (
    call?.status !== "ended" ||
    call?.conversation_id !== null ||
    call?.recording !== null ||
    !(call?.transcript_object?.length > 0)
  )
    problems.push("the call is not an ended call with a transcript and no thread");
  const cfg = await read("the config", db.from("tenant_config").select("config").eq("tenant_id", T).maybeSingle());
  if (!TenantConfigWriteSchema.safeParse(cfg?.config ?? null).success) problems.push("the config would not save");
  if (cfg?.config?.calendar) problems.push("the config has a calendar");
  // The state the owner-signals specs read. A person who said yes to offers here
  // would give a promotional send an audience; fewer than three who said yes to
  // messages would take the list under the product's own floor, and Today's
  // "Worth a look" would have nothing to say -- the specs would then fail on a
  // missing band, which reads nothing like "the seed drifted".
  const people = (
    await read("the people", db.from("contacts").select("consent, marketing_consent, erased_at").eq("tenant_id", T))
  ).filter((p) => !p.erased_at);
  if (people.some((p) => p.marketing_consent === "opted_in"))
    problems.push("someone in the workspace has said yes to offers");
  if (people.filter((p) => p.consent === SAID_YES_TO_MESSAGES).length < 3)
    problems.push("fewer than three people have said yes to messages");
  // The state e2e/leads.spec.ts reads. Not a stage or a class: the specs change
  // those and undo them, and a spec that failed halfway leaves one moved. What
  // must hold is that this workspace's leads ARE the six fixtures, that none of
  // them is a real business, and that the workspace may search.
  const leads = await read(
    "the leads",
    db.from("leads").select("place_id, business_name, email, phone_e164, website_host").eq("tenant_id", T),
  );
  const wanted = LEADS.map((l) => l.place_id).sort();
  if (JSON.stringify(leads.map((l) => l.place_id).sort()) !== JSON.stringify(wanted))
    problems.push(`the workspace's leads are not the ${LEADS.length} fixtures`);
  for (const l of leads) {
    if (l.email && !/@[\w.-]+\.example$/.test(l.email)) problems.push(`a lead's address is not fictional: ${l.email}`);
    if (l.website_host && !/\.example$/.test(l.website_host))
      problems.push(`a lead's site is not fictional: ${l.website_host}`);
    if (l.phone_e164 && !/^\+1\d{3}55501\d{2}$/.test(l.phone_e164))
      problems.push(`a lead's number is outside the fiction range: ${l.phone_e164}`);
  }
  const searches = await read(
    "the searches",
    db.from("lead_searches").select("id, name, removed_at").eq("tenant_id", T),
  );
  if (searches.length !== 1 || searches[0].name !== LEAD_SEARCH.name || searches[0].removed_at)
    problems.push("the workspace should hold exactly one kept search, the seeded one");
  const platform = await read(
    "the platform switch",
    db.from("lead_platform").select("tenants_on").eq("id", true).maybeSingle(),
  );
  if (!(platform?.tenants_on ?? []).includes(T))
    problems.push("the workspace is not listed in lead_platform.tenants_on, so a paid lead run could not start");
  const alerts = cfg?.config?.notifications;
  if (
    !alerts ||
    Object.keys(alerts).length !== 1 ||
    alerts.escalation_emails?.length !== 1 ||
    alerts.escalation_emails[0] !== ALERT_INBOX
  ) {
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
