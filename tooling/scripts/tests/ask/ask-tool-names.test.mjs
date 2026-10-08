/**
 * The old tool names, read through the mapping (the Phase 3 plan, D11, D13): every call the twenty-six tools answered,
 * made by its new name and action, answers the bytes it answered.
 *
 * `tooling/evals/tool-names.json` is the one table of the rename (old name -> `name.action`); this suite is driven from
 * it. Each case below is a call as the old tool took it, run over one workspace in memory; the fixture holds what the
 * registry at 7405e34bb answered for it -- the result the model read, the trace line and, for a card, the card -- and
 * which reads it made. The same call, made as `{name, input: {action, ...input}}`, must answer the same bytes after
 * one change: a refusal that named an old tool names its new one, in words ("campaigns with action audiences"). A
 * refusal named list_audiences in twelve places, in ten wordings; every wording is called here, and eleven of the
 * places. The twelfth, a playbook whose list the pool does not hold, follows checkPlaybookInput's read of that same
 * list, so it is reached only if the list goes between the two reads: its call here answers "List not found.", the
 * check's, before it.
 *
 * How the fixture was made, once, and how to make it again: extract the tree at 7405e34bb outside the repository
 * (`git archive 7405e34bb | tar -x -C <dir>`), install it (`corepack pnpm install --frozen-lockfile --ignore-scripts`),
 * copy this file and tooling/evals/tool-names.json into the same paths there, and run it with its FIXTURE read replaced
 * by a loop that calls each case by its OLD name through `answer` and writes `[{call, ...answer}]` to the fixture
 * path: the old registry, answering. No capture script is committed; the old names no longer dispatch here.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, buildProposal, newToolContext, ACT_TOOL_NAMES, ACT_DEFS } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);
const {
  MOMENTS_RETIRED,
  PERSON_STATE_LABELS,
  PLAYBOOK_TRIGGERS,
  PROPOSAL_SPECS,
  momentOffered,
  roleAtLeast,
  toReviewsReportVM,
} = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
beforeEach(() => readerCache.clear());

const NAMES = JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/tool-names.json"), "utf8"));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";
const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";
const K2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";
const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const TPL2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
/** A template and a list of the workspace's own that are not in it. */
const GONE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd9";
const LIST_GONE = "bbbbbbbb-bbbb-4bbb-8bbb-000000000000";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const DAY = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const ago = (ms) => iso(NOW.getTime() - ms);

const contact = {
  id: P1,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  consent: "opted_in",
  dnc: false,
};
const conversation = (id, over = {}) => ({
  id,
  tenant_id: A,
  contact_id: P1,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  // Something has come to the thread from their side, and the row says when, as ingest_inbound stamps it: a thread
  // nothing has come to is a first message's, and the reply card asks more of it (conversations/reply-window.test.mjs).
  last_inbound_at: ago(3600_000),
  last_wa_inbound_at: ago(3600_000),
  last_message_at: ago(3600_000),
  contacts: contact,
  ...over,
});
const message = (id, conversation_id, over = {}) => ({
  id,
  conversation_id,
  tenant_id: A,
  direction: "inbound",
  sender: "client",
  type: "text",
  body: "Are you open Saturday?",
  media: null,
  meta: null,
  status: "delivered",
  created_at: ago(3600_000),
  channel_ts: ago(3600_000),
  channel: "whatsapp",
  ...over,
});
const call = (id, over = {}) => ({
  id,
  tenant_id: A,
  retell_call_id: `r-${id.slice(-1)}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+19295550100",
  started_at: ago(7200_000),
  ended_at: ago(7000_000),
  duration_ms: 200_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about Saturday.",
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: "Rosa",
  transcript_object: [
    { role: "agent", content: "Harbor Moving, how can I help?" },
    { role: "user", content: "Are you open Saturday?" },
  ],
  recording: null,
  conversation_id: C1,
  contact_id: P1,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" },
  ...over,
});
const template = (id, name, over = {}) => ({
  id,
  tenant_id: A,
  channel: "whatsapp",
  name,
  language: "en",
  meta_status: "approved",
  category: "MARKETING",
  variables: [],
  body_preview: "We are open Saturday 9 to 5.",
  hidden_at: null,
  ...over,
});

/** One workspace: Rosa, her escalated thread with a held draft, a snoozed one, a call that ended and one on the line. */
const tables = () => ({
  memberships: [
    { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: {
            hours: { mon: { open: "09:00", close: "17:00" }, sat: { open: "09:00", close: "13:00" } },
            services: [{ name: "Estimate", duration_min: 60 }],
          },
        },
        notifications: { escalation_emails: ["ada@example.com"] },
      },
      version: 3,
    },
  ],
  tenant_channels: [
    {
      tenant_id: A,
      kind: "whatsapp",
      status: "active",
      // Not a US number: Meta's pause on marketing messages to US numbers (contracts whatsapp-offers.ts) would hold the
      // offers these tools count, and the pause is ask-turn's to prove, not the names'.
      number_e164: "+442079460100",
      quality: "GREEN",
      quality_event: null,
      messaging_limit: "TIER_1K",
    },
  ],
  policies: [
    {
      id: "p-reply",
      tenant_id: A,
      class: "reply",
      mode: "auto",
      subject_type: null,
      subject_id: null,
      limits: { min_confidence: 0.6 },
      updated_at: iso(NOW.getTime()),
    },
  ],
  conversations: [
    conversation(C1),
    conversation(C2, { state: "snoozed", snooze_until: iso(NOW.getTime() + DAY), assignee_user_id: USER }),
  ],
  escalations: [
    {
      id: E1,
      tenant_id: A,
      conversation_id: C1,
      reason: "human_token",
      details: "asked for a person",
      state: "open",
      created_at: ago(1800_000),
    },
  ],
  messages: [
    message(M1, C1),
    message(M2, C1, {
      direction: "outbound",
      sender: "ai",
      status: "queued",
      body: "Yes, Saturday 9 to 1.",
      created_at: ago(1800_000),
      channel_ts: ago(1800_000),
    }),
  ],
  calls: [call(K1), call(K2, { status: "ongoing", started_at: ago(60_000), ended_at: null, duration_ms: null })],
  contacts: [{ ...contact, tenant_id: A, erased_at: null }],
  templates: [
    template(TPL, "saturday_hours"),
    template(TPL2, "month_offer", {
      variables: [{ position: 1, label: "offer", example: "20% off cuts" }],
      body_preview: "This month: {{1}}.",
    }),
  ],
  segments: [],
  segment_members: [],
  playbooks: [],
  deals: [],
  events: [],
  contact_identities: [],
});

/** Rosa as people_list answers her. */
const rosaRow = {
  id: P1,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  consent: "opted_in",
  consent_source: "desk",
  consent_updated_at: ago(40 * DAY),
  marketing_consent: "opted_in",
  marketing_consent_source: "desk",
  marketing_consent_updated_at: ago(40 * DAY),
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 2,
  escalation_count: 1,
  needs_human: true,
  open_escalation_reason: "human_token",
  open_escalation_since: ago(1800_000),
  latest_conversation_id: C1,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: ago(3600_000),
  last_message_at: ago(3600_000),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "Are you open Saturday?",
  last_inbound_at: ago(3600_000),
  last_call_at: ago(7200_000),
  last_outbound_call_at: null,
  last_inbound_call_at: ago(7200_000),
  call_count: 2,
  call_seconds: 200,
  first_contact_at: ago(40 * DAY),
  earliest_row_at: ago(40 * DAY),
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  created_at: ago(40 * DAY),
};

const dayKey = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
/** A quiet day in report_series: two messages in, one answered by the receptionist, one call. */
const quiet = {
  messages_in: 2,
  answered_ai: 1,
  answered_you: 0,
  unanswered: 1,
  calls: 1,
  call_seconds: 200,
  escalations: 1,
  new_contacts: 0,
};
const RPCS = {
  people_list: (a) => (a?.p_contact_id && a.p_contact_id !== P1 ? [] : [rosaRow]),
  metrics_summary: () => ({
    workspace: { name: "Harbor", timezone: TZ, status: "active" },
    channels: [{ kind: "whatsapp", status: "active", number: "+19295550100" }],
    window: {
      days: 1,
      since: "2026-09-14T04:00:00+00:00",
      since_local: "2026-09-14T00:00:00",
      now_local: "2026-09-14T10:00:00",
    },
    now: {
      escalations_open: 1,
      oldest_open_escalation_at: ago(1800_000),
      threads_needing_human: 1,
      threads_snoozed: 1,
      threads_awaiting_reply: 1,
      last_inbound_at: ago(3600_000),
      last_outbound_at: null,
    },
    period: {
      messages_in: 1,
      messages_out_ai: 0,
      messages_out_you: 0,
      conversations_active: 1,
      answered_by_ai: 0,
      answered_by_you: 0,
      unanswered_in_window: 1,
      median_reply_seconds_ai: null,
      send_failures: 0,
      escalations_new: 1,
      escalation_reasons: { human_token: 1 },
      calls: 2,
      call_seconds: 200,
      call_sentiments: {},
      calls_voicemail: 0,
      new_contacts: 0,
    },
  }),
  report_series: ({ p_days: days }) => ({
    timezone: TZ,
    days,
    span_days: days * 2,
    today: dayKey(NOW.getTime()),
    series: Array.from({ length: days * 2 }, (_, i) => ({
      day: dayKey(NOW.getTime() - (days * 2 - 1 - i) * DAY),
      ...quiet,
    })),
    reasons: { human_token: 3 },
    reply_seconds: [30, 90, 600],
    sentiments: {},
    voicemail: 0,
  }),
  // The Reviews lens's ledger, which the report reads beside the series (readers/report.ts reviewsReport): nothing on record.
  reviews_ledger: ({ p_days: days }) => ({
    timezone: TZ,
    today: dayKey(NOW.getTime()),
    days,
    on_record: { profile: 0, places: 0, complete: false },
    written: [],
    waiting_total: 0,
    waiting: [],
  }),
  lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
  lead_niche_prior: () => null,
};

const PLAN = {
  looking_for: "local_businesses",
  country: "US",
  count: 100,
  who: "plumbers",
  who_one: "plumber",
  category_key: "plumber",
  terms: ["plumber", "plumbing company"],
  city: "Austin",
  region: "TX",
  contact: "email",
  criteria: [
    { text: "has a website", standard: "seen", required: true },
    { text: "family-owned", standard: "likely", required: false },
  ],
  leave_out: [{ words: "chains" }],
  asked: "find me 100 plumbers in Austin",
};

/**
 * Every call, as the old tool took it: [old name, input, role]. Each tool answers once as it would for the question it
 * exists for, and once or more where its handler refuses in words, a null on an optional key is absent, or an unknown
 * key is stripped -- the parse's own moves, which the action's union must repeat.
 */
const CASES = [
  ["get_today", {}],
  ["list_threads", { filter: "recent" }],
  ["list_threads", { filter: "held" }],
  ["list_threads", { filter: "snoozed", extra: 1 }],
  ["get_thread", { conversation_id: C1 }],
  ["get_thread", { conversation_id: C1, more: true }],
  ["get_thread", { conversation_id: C1, more: null }],
  ["get_thread", { conversation_id: "nope" }],
  ["search_people", { query: "rosa" }],
  ["search_people", { query: "", list: "quiet" }],
  ["search_people", { query: "rosa", list: null }],
  ["search_people", { query: "", list: "no such list!" }],
  ["search_people", { query: "", list: `list:${LIST_GONE}` }],
  ["get_person", { contact_id: P1 }],
  ["get_person", { contact_id: C2 }],
  ["list_calls", { filter: "recent" }],
  ["list_calls", { filter: "live" }],
  ["list_calls", { filter: "missed" }],
  ["get_call", { call_id: K1 }],
  ["get_call", { call_id: "nope" }],
  ["get_report", { days: 7 }],
  ["get_report", { days: 30 }],
  ["get_settings", {}],
  ["get_openings", { day: "fri", service: "" }],
  ["get_calendar", { day: "tomorrow" }],
  ["get_calendar", { day: "", days: 7 }],
  ["get_calendar", { day: "sat", days: null }],
  ["list_audiences", {}],
  ["list_playbooks", {}],
  ["list_lead_searches", {}],
  ["draft_reply", { conversation_id: C1, text: "See you Saturday", voice: "you" }],
  ["draft_reply", { conversation_id: "nope", text: "x", voice: "receptionist", extra: true }],
  ["propose_steer", { message_id: M2, instruction: "shorter" }],
  ["propose_steer", { message_id: M1, instruction: "shorter" }],
  ["propose_thread_verb", { conversation_id: C1, verb: "snooze", until: "2026-09-20T10:00:00-04:00" }],
  ["propose_thread_verb", { conversation_id: C1, verb: "resolve" }],
  ["propose_thread_verb", { conversation_id: C2, verb: "wake" }],
  ["propose_thread_verb", { conversation_id: C1, verb: "wake" }],
  ["propose_person_mode", { contact_id: P1, mode: "never" }],
  ["propose_person_mode", { contact_id: P1, mode: "ask" }, "operator"],
  ["propose_deal", { contact_id: P1, stage: "proposed", service: "Estimate", amount_cents: 25000, per: "once" }],
  ["propose_deal", { contact_id: P1, stage: "won" }],
  ["propose_policy", { class: "reply", mode: "", min_confidence: 0.9 }],
  ["propose_policy", { class: "money", mode: "ask" }],
  ["propose_settings", { change: { op: "add_closure", date: "2026-12-24", until: "2026-12-26", note: "Holidays" } }],
  ["propose_settings", { change: { op: "add_closure", date: "2026-12-25" } }, "operator"],
  ["propose_whisper", { call_id: K2, text: "Saturday is full" }],
  ["propose_whisper", { call_id: K1, text: "Saturday is full" }],
  ["propose_broadcast", { template_id: TPL, audience_kind: "everyone", params: [] }],
  ["propose_broadcast", { template_id: TPL, audience_kind: "list", audience_id: "nope" }],
  ["propose_broadcast", { template_id: "nope", audience_kind: "everyone", audience_id: null }],
  ["propose_broadcast", { template_id: TPL, audience_kind: "saved", audience_id: "nope" }],
  ["propose_broadcast", { template_id: GONE, audience_kind: "everyone" }],
  ["propose_broadcast", { template_id: TPL, audience_kind: "saved", audience_id: LIST_GONE, params: [] }],
  ["propose_playbook", { trigger: "quiet_30", template_id: TPL, params: [] }],
  ["propose_playbook", { trigger: "quiet_30", template_id: TPL, params: [], list: null, name: null }],
  ["propose_playbook", { trigger: "new_week" }],
  ["propose_playbook", { trigger: "saved_list" }],
  ["propose_playbook", { trigger: "quiet_30", template_id: "nope" }],
  ["propose_playbook", { trigger: "quiet_30", template_id: GONE }],
  [
    "propose_playbook",
    { trigger: "saved_list", list: `list:${LIST_GONE}`, policy_class: "campaign", template_id: TPL, params: [] },
  ],
  ["propose_invite", { email: "bea@example.com", role: "operator" }],
  ["propose_invite", { email: "bea@example.com", role: "viewer" }, "partner"],
  ["propose_lead_search", PLAN],
  ["propose_lead_search", PLAN, "operator"],
];

/** A card's id is minted per call, and so is the moment it was made (made_at); everything else is the card. */
const withoutId = (s) => s.replace(/"id":"p-[0-9a-f-]{36}",?/g, "").replace(/,?"made_at":"[^"]+"/g, "");

/** One call over a fresh copy of the workspace: what the model read, the trace line or the card, and the reads made. */
async function answer(name, input, role = "owner") {
  const supabase = fakeDb(tables(), {}, RPCS);
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const t = newToolContext(ctx, A, role, TZ, NOW);
  let out;
  if (ACT_TOOL_NAMES.has(name)) {
    const p = await buildProposal(t, name, input);
    out = {
      result: withoutId(p.result),
      isError: p.isError,
      proposal: p.proposal ? withoutId(JSON.stringify(p.proposal)) : null,
    };
  } else {
    const r = await runTool(t, { name, input });
    out = { result: r.result, isError: r.isError, label: r.label };
  }
  return { ...out, reads: supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)) };
}

/** The new call for an old one: the tool the mapping names, with its action first when it has one. */
function renamed(old, input) {
  const [name, action] = NAMES[old].split(".");
  return { name, input: action ? { action, ...input } : input };
}

/** Whose an action is, in the registry's refusal (tools/context.ts WHOSE). */
const WHOSE = { owner: "an owner's", partner: "an owner's or a partner's" };

/**
 * The reads with the channels' two after the leading tenants reads: the number's row and the texting line's; and, since 4 Oct
 * 2026, whether the workspace is paused (tenants.status, db workspacePaused), which the playbooks' page says instead of a
 * next run's time.
 */
const withChannelReads = (reads) => {
  const at = reads.findIndex((r) => r !== "tenants.select");
  const i = at < 0 ? reads.length : at;
  return [...reads.slice(0, i), "tenant_channels.select", "lines.select", "tenants.select", ...reads.slice(i)];
};

/** The old tools that read the threads through the conversations reader (readers/conversations.ts). */
const THROUGH_THE_HUNDRED = new Set(["get_today", "list_threads"]);

/** An old name as a refusal now says it: the tool, and its action in words. */
const inWords = (to) => (to.includes(".") ? to.replace(".", " with action ") : to);

/** What the registry at 7405e34b answered for each call, frozen from the old names before they went. */
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures/ask-tool-results-7405e34b.json"), "utf8"),
);

/**
 * The report's reply_time says the hold the owner set since the Reports fix wave (spec D14): null where the report
 * carries none, as the report this suite reads does. The one change to the bytes of an answer that has a reply_time.
 */
function withHold(result) {
  const said = JSON.parse(result);
  return said.reply_time ? JSON.stringify({ ...said, reply_time: { ...said.reply_time, hold: null } }) : result;
}

/**
 * 6 Oct 2026 (decision 0030): the report says the Campaigns lens beside it, from the lens's own read (readers/
 * campaign-report.ts), said after its deals: an error in this world, whose database has no campaign_series (a function
 * it does not have is no read it counts). The one change to the bytes of a report it answers.
 */
function withCampaigns(result) {
  const said = JSON.parse(result);
  return said.error
    ? result
    : JSON.stringify({ ...said, campaigns: { error: "the campaign numbers could not be read just now" } });
}

/**
 * 7 Oct 2026 (Reports phase C, lens 1, T4): the report says the Reviews lens after the Campaigns lens, from the lens's own
 * read (readers/report.ts reviewsReport: Google as GET google reads it, and the reviews the database counted where a
 * profile has synced). This world has no Google listing and a deployment that can look none up, so it says `linked: false` and
 * the fold's words for that, and the read is six reads more: the ledger function, the listing, the connection, the newest reviews, the daily readings
 * and the Autonomy row for reviews. The one change to the bytes and to the reads of a report it answers.
 */
function withReviews(result) {
  const said = JSON.parse(result);
  return said.error ? result : JSON.stringify({ ...said, reviews: { linked: false, words: NOTHING_LINKED } });
}
/** What the Reviews fold says of a workspace with nothing linked, where nothing can be looked up (this world's deployment). */
const NOTHING_LINKED = toReviewsReportVM(
  {
    timezone: "America/New_York",
    today: "2026-09-14",
    days: 7,
    google: { listing: null, connection: null, reviews: [], days: [], reply_mode: "ask" },
    readable: false,
    ledger: null,
  },
  { nowMs: 0 },
).lines.empty;
const withReviewReads = (reads) => [
  ...reads,
  "rpc:reviews_ledger",
  "google_listings.select",
  "google_connections.select",
  "google_reviews.select",
  "google_listing_days.select",
  "policies.select",
];

test("the mapping names every old tool once, each to a tool and action the registry has", () => {
  assert.equal(Object.keys(NAMES).length, 26, "the twenty-six old tools");
  assert.equal(new Set(Object.values(NAMES)).size, 26, "each to its own name.action");
  assert.deepEqual(
    [...new Set(CASES.map(([old]) => old))].sort(),
    Object.keys(NAMES).sort(),
    "every old tool is called here at least once",
  );
});

/**
 * people.get says where the person stands, as their People row does (personStateFor, for the member asking): a change
 * to its bytes since 7405e34b, when an answer read a person's standing from their threads' stored states. Held to one
 * of the states' words here, then taken out, so the rest is compared byte for byte.
 */
function withoutPersonState(old, got) {
  if (NAMES[old] !== "people.get") return got;
  const said = JSON.parse(got.result);
  if (said.error) return got;
  assert.ok(Object.values(PERSON_STATE_LABELS).includes(said.state), `people.get says a state: ${said.state}`);
  const rest = { ...said };
  delete rest.state;
  delete rest.state_detail;
  // 5 Oct 2026 (the 2 Oct audit, C3): the right-now line of an escalation says when and why in the person page's own
  // sentence, and no longer appends "Paused until someone answers." to every reason; its title is held as frozen.
  if (rest.right_now?.detail) {
    assert.ok(
      typeof rest.right_now.detail === "string" && rest.right_now.detail.length > 0,
      "a right-now line says one",
    );
    rest.right_now = { ...rest.right_now };
    delete rest.right_now.detail;
  }
  return { ...got, result: JSON.stringify(rest) };
}

/** The frozen answer's side of the right-now change withoutPersonState makes (the 2 Oct audit, C3). */
function withoutRightNowDetail(frozen) {
  const said = JSON.parse(frozen);
  if (!said.right_now?.detail) return frozen;
  const right_now = { ...said.right_now };
  delete right_now.detail;
  return JSON.stringify({ ...said, right_now });
}

/**
 * 5 Oct 2026 (Ask honesty, A12): `held` lists the threads whose held draft still waits, by the Inbox's rule (contracts
 * heldDraftWaits). This world's one draft was queued thirty minutes before NOW with no hold window, so its deadline is
 * past and nothing is held: the frozen answer's one change, the thread gone from its list and its count.
 */
function withNothingHeld(frozen) {
  return JSON.stringify({ ...JSON.parse(frozen), total_matching: 0, threads: [] });
}

/**
 * 6 Oct 2026 (the review's fixes): a thread's held_draft is a draft that still waits, by the rule `held` asks
 * (heldDraftWaits). This world's one draft is past its deadline, so a row and a thread read name none: the one change to
 * their bytes.
 */
function withNoHeldDraft(frozen) {
  const said = JSON.parse(frozen);
  const none = (t) => ("held_draft" in t ? { ...t, held_draft: null } : t);
  if (Array.isArray(said.threads)) return JSON.stringify({ ...said, threads: said.threads.map(none) });
  return "held_draft" in said ? JSON.stringify(none(said)) : frozen;
}

/**
 * 5 Oct 2026 (Ask honesty): a call's row says which way it was dialled, since only a customer's dial that never connected
 * is "missed" (contracts missedCall). Every call of this world is inbound (`call()` above), so the frozen rows gain
 * `direction: "inbound"` after `who`: the one change to their bytes, in calls.list and calls.get.
 */
function withCallDirection(frozen) {
  const said = JSON.parse(frozen);
  const into = (row) =>
    Object.fromEntries(
      Object.entries(row).flatMap(([k, v]) =>
        k === "who"
          ? [
              [k, v],
              ["direction", "inbound"],
            ]
          : [[k, v]],
      ),
    );
  if (Array.isArray(said.calls)) return JSON.stringify({ ...said, calls: said.calls.map(into) });
  return "who" in said ? JSON.stringify(into(said)) : frozen;
}

/**
 * 7 Oct 2026 (lane 1, T6): campaigns.audiences lists the messages the composers offer, whatever channels they have versions
 * on, each with the channels it can be sent by (contracts messageHolds). Every template of this world is an approved
 * WhatsApp row alone: the one change to the bytes of the listing, `channels` after `category`. (The lane's review) Its
 * note says its four counts are by WhatsApp, and that a message held on email or text is proposed by its channels, whose
 * card counts the people they reach, so a 0 in them is not nobody: the other change, to the note.
 */
function withChannels(frozen) {
  const said = JSON.parse(frozen);
  const note =
    typeof said.note === "string"
      ? `${said.note.replace(
          "Two consents, two counts each. can_be_sent_offers is who a promotional template reaches and",
          "Two consents, two counts each, all by WhatsApp. can_be_sent_offers is who a promotional template reaches on WhatsApp and",
        )} A message whose channels hold email or sms is proposed with channels naming them, and its card then counts the people those channels reach: a 0 in these counts does not mean nobody can be reached for it.`
      : null;
  const held = { whatsapp: true, email: false, sms: false };
  const into = (t) =>
    Object.fromEntries(
      Object.entries(t).flatMap(([k, v]) =>
        k === "category"
          ? [
              [k, v],
              ["channels", held],
            ]
          : [[k, v]],
      ),
    );
  return Array.isArray(said.templates)
    ? JSON.stringify({ ...said, templates: said.templates.map(into), ...(note === null ? {} : { note }) })
    : frozen;
}

/**
 * 7 Oct 2026 (lane 1, T6): Ask reads the message a proposal names through core's readCampaignMessage, the verb the routes
 * read it by, and says what it refuses in its own sentence: a template the workspace does not hold is "Template not found."
 * (the broadcast's and the playbook's, which said it was not approved by WhatsApp, the playbook's adding "or the workspace
 * keeps it out of the composers", a sentence now said of a message that exists and is hidden); and a moment's starter of
 * which the workspace holds no version it can send `has no version this workspace can send yet`, where it said it was not
 * approved on this workspace yet. (T11) That refusal sends the owner to the Library, the room's name now, and to name a
 * message, where it said Campaigns › Messages and an approved template. The fixture is the old registry's bytes and stays as
 * it was made; these are the changes to them.
 */
function withTheVerbsWords(frozen) {
  return frozen
    .replace(/"that template is not approved by WhatsApp[^"]*"/, '"Template not found."')
    .replace("starter is not approved on this workspace yet", "starter has no version this workspace can send yet")
    .replace(
      "under Campaigns › Messages, or name an approved template from",
      "under Campaigns › Library, or name a message from",
    );
}

/**
 * 8 Oct 2026 (Campaigns, one name per thing): a playbook's hour is said by the product's clock, as every other time is
 * (contracts clockHour: "Daily 10:00 AM"), where these bytes say a 24-hour one ("Daily 10:00"). The one change to what
 * the campaigns' tools answer and propose: the schedule line of a playbook. The fixture stays as it was made. Nothing
 * else is rewritten, because no frozen call holds it: none answers a next run with an hour, nor a run waiting on its
 * owner (whose state reads "Waiting on you" since that day; the two "Needs you" these bytes hold are a PERSON's
 * state, in People's answers, which is still its name).
 */
function withTheClocksHour(frozen) {
  const hour = (hh) => {
    const h = Number(hh);
    return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
  };
  return frozen.replace(/\b(Daily|daily at|days at) (\d{2}):00\b/g, (_, said, h) => `${said} ${hour(h)}`);
}

/**
 * campaigns.playbooks lists the moments a NEW playbook is offered, in the words contracts gives them now (2 Oct 2026, the
 * lifecycle set: contracts momentOffered; this workspace sells by proposal and has no calendar). Its listing is held to
 * those moments, each one's counts to what 7405e34b counted for it, and the rest of the answer is compared byte for byte.
 */
function againstOffered(got, frozen) {
  const g = JSON.parse(got);
  const w = JSON.parse(frozen);
  assert.deepEqual(
    g.triggers.map((t) => t.trigger),
    PLAYBOOK_TRIGGERS.filter((t) => momentOffered(t, { dealsOn: true, calendarOn: false })).map((t) => t.id),
    "the moments offered for a new playbook, retired ones left out",
  );
  for (const t of g.triggers) {
    const was = w.triggers.find((x) => x.trigger === t.trigger);
    assert.deepEqual(
      [t.said_yes_now, t.can_be_sent_now, t.counted_per_list],
      [was.said_yes_now, was.can_be_sent_now, was.counted_per_list],
      `${t.trigger}: counted as it was`,
    );
  }
  delete g.triggers;
  delete w.triggers;
  return [JSON.stringify(g), JSON.stringify(w)];
}

test("every old tool's call, made by its new name and action, answers the bytes the old tool answered at 7405e34b, and makes the same reads", async () => {
  assert.equal(FIXTURE.length, CASES.length, "one frozen answer per call");
  for (let i = 0; i < CASES.length; i++) {
    const [old, input, role = "owner"] = CASES[i];
    const { call: frozen, ...want } = FIXTURE[i];
    assert.deepEqual(frozen, [old, input, role], `case ${i} is the call the fixture froze`);
    const call = renamed(old, input);
    const got = withoutPersonState(old, await answer(call.name, call.input, role));
    // 2 Oct 2026: a moment no longer offered for a new playbook (contracts MOMENTS_RETIRED) is not one of the tool's
    // triggers: the schema refuses it, naming the ones that are, before anything is read (the check refuses it in the
    // moment's own words if it gets that far, which core-campaigns.test.mjs runs).
    if (call.name === "propose_campaign" && String(call.input.trigger) in MOMENTS_RETIRED) {
      assert.equal(got.isError, true, `${old}: a retired moment is refused`);
      assert.match(got.result, /expected one of/, `${old}: by the schema, naming the moments there are`);
      assert.deepEqual(got.reads, [], `${old}: before anything is read`);
      continue;
    }
    // A refusal that named an old tool names its new one: the one change to the bytes, applied to every old name.
    // 7 Oct 2026: the frozen world's WhatsApp number was a US one, and Meta's pause on marketing messages to US numbers
    // (contracts whatsapp-offers.ts) would now hold every offer these tools count; the world's number is a UK one, and the
    // one place the frozen bytes say the number (workspace.settings) is rewritten to it. The pause itself is ask-turn's to prove.
    // 7 Oct 2026 (the calendar's setup, said once): what Reports says with no calendar link names the link, where it
    // said "Connect your calendar" to a business whose bookings arrive by email (contracts BOOKED_NEEDS_A_LINK).
    let result = want.result
      .replaceAll("+19295550100", "+442079460100")
      .replaceAll("Connect your calendar under Settings › Business", "Add a calendar link under Settings › Business");
    for (const [from, to] of Object.entries(NAMES))
      result = result.replace(new RegExp(`\\b${from}\\b`, "g"), inWords(to));
    if (NAMES[old] === "report") result = withReviews(withCampaigns(withHold(result)));
    if (NAMES[old] === "inbox.list" && input.filter === "held") result = withNothingHeld(result);
    if (old === "list_threads" || old === "get_thread") result = withNoHeldDraft(result);
    if (NAMES[old] === "calls.list" || NAMES[old] === "calls.get") result = withCallDirection(result);
    if (NAMES[old] === "campaigns.audiences") result = withChannels(result);
    if (NAMES[old].startsWith("propose_campaign.")) result = withTheVerbsWords(result);
    // 8 Oct 2026: a playbook's hour by the product's clock (withTheClocksHour): the campaigns' own answers and cards,
    // in their result and in the card they propose.
    const campaignsOwn = NAMES[old].startsWith("campaigns.") || NAMES[old].startsWith("propose_campaign.");
    if (campaignsOwn) result = withTheClocksHour(result);
    const card =
      campaignsOwn && typeof want.proposal === "string" ? { proposal: withTheClocksHour(want.proposal) } : {};
    // An action above the caller is refused by the registry first since PR 4.3 (the Phase 4 plan, D2), in its words,
    // before anything is read, as its builder refused it: the other change to these bytes.
    const act = ACT_DEFS.find((x) => x.name === call.name)?.actions[call.input.action ?? ""];
    const needs = act && call.input.action ? PROPOSAL_SPECS[act.kind].needs : null;
    if (needs && !roleAtLeast(role, needs))
      result = JSON.stringify({ error: `${call.name}: action ${call.input.action} is ${WHOSE[needs]}` });
    // The threads' messages are one call since 00258: the conversations reader read the table a page at a time, and
    // reads each thread's newest through newest_messages. The old tools that read through it made that read, and no
    // other of the table: the one change to the reads, with the bytes unchanged.
    const reads00 = THROUGH_THE_HUNDRED.has(old)
      ? want.reads.map((r) => (r === "messages.select" ? "rpc:newest_messages" : r))
      : want.reads;
    // 7 Oct 2026 (lane 1, T6): Ask reads the message a proposal's template names through core's readCampaignMessage (db
    // messageVersionRowsOf: the version, then every row of its message), where it read the one WhatsApp row: one `templates`
    // read more for a template this workspace holds. A template it does not hold answers at the version, one read as before.
    const readsRows =
      NAMES[old].startsWith("propose_campaign.") && input.template_id === TPL && reads00.includes("templates.select");
    const reads0 = readsRows ? [...reads00, "templates.select"] : reads00;
    // 3 Oct 2026 (One message, every channel, step 3): the playbooks reader asks whether the workspace can send on each
    // channel (server/campaigns/channels-ready.ts): the WhatsApp number and the texting line, after the turn's tenants
    // reads (the mailbox only where the deployment sends email, which this one does not). The one change to its reads.
    // A campaign proposed (a broadcast, a playbook) asks the same of WhatsApp alone, the one channel Ask names: whether
    // its number can send. One read more, in any order; a call refused before, at its template, never gets that far.
    const proposes = String(NAMES[old]).startsWith("propose_campaign.") && !want.isError;
    // 7 Oct 2026 (lane 1, T5): a playbook's check reads the message the template's id names (db messageVersionRowsOf: the
    // version, then every row of it, on any channel), where it read the one WhatsApp row: a playbook proposed on a
    // template, which reached the check after Ask's own read of the row, makes one `templates` read more.
    const readsMessage =
      proposes &&
      NAMES[old] === "propose_campaign.playbook" &&
      reads00.filter((r) => r === "templates.select").length >= 2;
    const counted =
      NAMES[old] === "campaigns.playbooks"
        ? withChannelReads(reads0)
        : proposes
          ? [...reads0, "tenant_channels.select", ...(readsMessage ? ["templates.select"] : [])]
          : reads0;
    // 3 Oct 2026 (the review's item 7): People's rows say who can be sent what against what the workspace can send on, so
    // a tool that reads the people's pool or a page of them asks for it once a turn (readers/facts.ts channelsReady): the
    // number's row and the texting line's, in any order among the rest. Answers and cards are unchanged.
    // A call refused before it reads the people (a list that is no token, a template that is not there) never gets that far.
    const readsReach =
      ["search_people", "list_audiences", "propose_broadcast", "propose_playbook"].includes(old) &&
      counted.includes("rpc:people_list");
    const reached = readsReach ? [...counted, "tenant_channels.select", "lines.select"] : counted;
    // 8 Oct 2026 (Ask names channels; the spec of that day, decision 5): a playbook proposed with no channel named goes
    // by what the composer would tick for it (contracts newCampaignChannels), so it asks what the workspace can send on
    // before its check (act/playbook.ts unnamedChannels, over readers/facts.ts channelsReady: the number's row and the
    // texting line's, the read the people's pool makes once a turn). A call that goes on to count its people makes no
    // read more; one the CHECK refuses never got that far, and makes those two. The one change to its reads; the bytes
    // are unchanged, this workspace's default being WhatsApp alone.
    const refusedAtTheCheck =
      old === "propose_playbook" && input.channels === undefined && want.result === '{"error":"List not found."}';
    const reachReads = refusedAtTheCheck ? [...reached, "tenant_channels.select", "lines.select"] : reached;
    // 6 Oct 2026 (#1431): a person's page reads the decisions recorded about them, not only those on their threads
    // (packages/db personDecisions), so people.get reads `decisions` once even for a person with no thread, or none at all.
    // The one change to its reads; its bytes are unchanged.
    const withDecisions =
      NAMES[old] === "people.get" && !reachReads.includes("decisions.select")
        ? [...reachReads, "decisions.select"]
        : reachReads;
    // 7 Oct 2026 (00344, decision 0034 step 4): a person's page reads the open doubts naming them (person_doubts) in the
    // same round, so people.get makes that one read more; its bytes are unchanged, the tool not saying them yet.
    const withDoubts = NAMES[old] === "people.get" ? [...withDecisions, "person_doubts.select"] : withDecisions;
    // 7 Oct 2026 (00345, bookings arrive by email): the calendar's reader reads the record beside the feed -- the
    // appointments over the span, the notices' health line (the latest, and the held count) and the workspace's mailbox
    // -- so calendar.week makes those four reads more. Its bytes are unchanged: this workspace has no calendar and no
    // booking has arrived, and with no feed to read nothing of the record's taken time is asked.
    const withCalendar =
      NAMES[old] === "calendar.week"
        ? [
            ...withDoubts,
            "appointments.select",
            "appointment_notices.select",
            "appointment_notices.select",
            "mailboxes.select",
          ]
        : withDoubts;
    // 7 Oct 2026 (00349): the Inbox's read and a page of People say what the member asking has seen of each person they
    // hold (server/people/person-seen.ts), for the rows that say who is new to them: one call to the door more, where
    // the read holds anyone. The old tools that read through the Inbox's hundred make it, and a search of People with
    // no list (a list is counted over the pool, which is not a page). Their bytes are unchanged: no tool says it.
    const readsSeen = THROUGH_THE_HUNDRED.has(old) || (old === "search_people" && !input.list);
    const withSeen = readsSeen ? [...withCalendar, "rpc:contact_seen"] : withCalendar;
    // 7 Oct 2026 (Reports phase C, lens 1, T4): the report reads the Reviews lens too: six reads more (withReviewReads).
    // 8 Oct 2026 (a conversation begins from the Inbox): a thread nothing has come to from the person's side is answered
    // where our own written words last went (server/verbs.ts replyChannelOf, db ourLastWire), never on WhatsApp by default:
    // one `messages` read more for a reply drafted on such a thread. This workspace's one inbound message names a sender
    // the reader does not count as the person's own, so the draft that reaches the read makes it. Its bytes are unchanged.
    const readsOurWire = NAMES[old] === "propose_reply.draft" && withSeen.includes("messages.select");
    const withOurWire = readsOurWire ? [...withSeen, "messages.select"] : withSeen;
    const reads = NAMES[old] === "report" ? withReviewReads(withOurWire) : withOurWire;
    const [gotResult, wantResult] =
      NAMES[old] === "campaigns.playbooks"
        ? againstOffered(got.result, result)
        : [got.result, NAMES[old] === "people.get" ? withoutRightNowDetail(result) : result];
    // 2 Oct 2026: a win-back proposed asks first whether a calendar is connected (check-playbook's calendarOn), from the
    // zone and settings the turn reads once: the same reads as before, those two earlier.
    // Reads asked at once land in any order: People's list has read the workspace beside its rows since e32aaf29c,
    // so every call's reads are compared as a set of counts, the win-back's and the channels' among them.
    const inOrder = (r) => [...r].sort();
    assert.deepEqual(
      { ...got, result: gotResult, reads: inOrder(got.reads) },
      { ...want, ...card, result: wantResult, reads: inOrder(reads) },
      `${old} -> ${NAMES[old]} ${JSON.stringify(input)}`,
    );
  }
});
