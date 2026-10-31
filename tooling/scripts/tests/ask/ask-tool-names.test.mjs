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
import { QUIET } from "../reports/people/_people-world.mjs";
import { QUIET as CAMPAIGNS_QUIET } from "../reports/campaigns/_campaign-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { runTool, buildProposal, newToolContext, ACT_TOOL_NAMES, ACT_DEFS } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);
const {
  MOMENTS_RETIRED,
  PEOPLE_LISTS,
  PERSON_STATE_LABELS,
  PLAYBOOK_TRIGGERS,
  PROPOSAL_SPECS,
  SEQUENCE_MODE_WORDS,
  momentOffered,
  roleAtLeast,
  toReceptionistReportVM,
  toReviewsReportVM,
} = await import("@chanlytics/contracts");
const { readerCache } = await import(at("apps/dashboard/src/server/readers/index.ts"));
beforeEach(() => readerCache.clear());

/** The twenty-six tools as PR 3.1 froze them, by name. */
const OLD_TOOLS = new Set(
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures/ask-tools-0c136563.json"), "utf8"),
  ).operator.map((t) => t.name),
);
/**
 * The rename's rows for those old tools (tooling/evals/tool-names.json): every old tool but the invitation, the Team
 * page's alone since the operator (Ruben, 15 Oct 2026). The table's later rows rename Phase 4's names, no old tool's.
 */
const NAMES = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/tool-names.json"), "utf8"))).filter(
    ([old]) => OLD_TOOLS.has(old),
  ),
);
/** The one old tool with no successor: its calls are refused as the unknown tool its group became. */
const INVITE = "propose_invite";

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
  last_inbound_on_whatsapp: ago(3600_000),
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
  tenants: [{ id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" }],
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
/**
 * What receptionist_series answers (00380) for a quiet period: nothing held, said, handed over or missed, no message while
 * closed and no booking link sent. `over` is what a case puts in it.
 */
function quietReceptionist({ p_days: days }, over = {}) {
  const hold = {
    total: 0,
    sent: 0,
    canceled: 0,
    steered: 0,
    overtaken: 0,
    person_first: 0,
    waiting: 0,
    other: 0,
    low_confidence: 0,
  };
  const handover = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };
  const missed = { n: 0, touched: 0, pending: 0, unknown: 0 };
  return {
    timezone: TZ,
    today: dayKey(NOW.getTime()),
    days,
    hold: { now: hold, before: { total: 0, sent: 0 } },
    topics: { of: 0, stamped: 0, by_intent: {} },
    languages: { of: 0, stamped: 0, by_language: {} },
    blocked: { total: 0, by_reason: {} },
    call_endings: { total: 0, by_reason: {} },
    handover: { now: handover, before: handover },
    missed: { now: missed, before: missed },
    after_hours: [],
    links: { total: 0, people: [] },
    stuck: { open: [] },
    ...over,
  };
}
/** What people_series answers (00395) for a quiet period: nobody reached the business and nothing was answered or done. */
const quietPeople = ({ p_days: days }) => ({ timezone: TZ, today: dayKey(NOW.getTime()), days, ...QUIET });
/** What campaign_ledger answers (00405) for a quiet window: nobody was sent to, held, stopped, failed or approved. */
const quietCampaigns = ({ p_days: days }) => ({
  timezone: TZ,
  today: dayKey(NOW.getTime()),
  days,
  ...CAMPAIGNS_QUIET,
});
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
  // The Receptionist lens's read, which the report reads beside the series (readers/report.ts receptionistReport): a quiet period.
  receptionist_series: (a) => quietReceptionist(a),
  // The People lens's read, which the report reads beside the series (readers/report.ts peopleReport): a quiet period.
  people_series: (a) => quietPeople(a),
  // The Campaigns lens's ledger and what is stuck now, which the report reads beside the sends (readers/campaign-report.ts
  // campaignLedgerReport): a quiet window and nothing stuck. The sends themselves (campaign_series) stay unmodelled, as
  // campaigns.playbooks' last 30 days say: the lens is read and its sends are not, so the report says the lens as an error.
  campaign_ledger: (a) => quietCampaigns(a),
  campaign_stuck: () => ({ runs_waiting: [], runs_failed: [], replies: [], templates: [] }),
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
async function answer(name, input, role = "owner", rpcs = RPCS) {
  const supabase = fakeDb(tables(), {}, rpcs);
  const ctx = { supabase, userId: USER, email: "ada@example.com", params: {} };
  const t = newToolContext(ctx, A, role, TZ, NOW);
  let out;
  if (ACT_TOOL_NAMES.has(name)) {
    const p = await buildProposal(t, name, input);
    // 17 Oct 2026 (the answer canvas, C1): a campaign's card and a one-off send's carry their sheet beside the bytes
    // these hold, made of the summary's own pieces (starter-card.test.mjs holds the two to one derivation), so the card
    // is compared without it; and since 30 Oct 2026 (the review's item 6) a campaign's card carries its one line, as
    // Today's row says it (reaches-someone.test.mjs holds it), beside them too.
    const { sheet: _sheet, line: _line, ...card } = p.proposal ?? {};
    out = {
      result: withoutId(p.result),
      isError: p.isError,
      proposal: p.proposal ? withoutId(JSON.stringify(card)) : null,
    };
  } else {
    const r = await runTool(t, { name, input });
    out = { result: r.result, isError: r.isError, label: r.label };
  }
  return { ...out, reads: supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)) };
}

/**
 * The new call for an old one: the tool the mapping names, with its action first when it has one. The operator (15 Oct
 * 2026) reshaped two inputs: report takes a period by name where it took days, and autonomy's dial alone leaves the mode
 * out where it was empty.
 */
function renamed(old, input) {
  const [name, action] = NAMES[old].split(".");
  let own = input;
  if (old === "get_report") own = { period: `${input.days}d` };
  if (old === "propose_policy" && input.mode === "") {
    const { mode: _, ...rest } = input;
    own = rest;
  }
  return { name, input: action ? { action, ...own } : own };
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
 * 11 Oct 2026 (Reports, the Campaigns lens, C4 T16): the report reads the lens's ledger beside its sends, whether or not the
 * sends could be read (readers/campaign-report.ts campaignLedgerReport, once): the database's campaign_ledger and
 * campaign_stuck, and the connected number's row (the reader says its health from the channel's stored config, db
 * whatsappChannelFacts: its own read of tenant_channels, one). The bytes are unchanged: this world has no campaign_series,
 * so the lens still says error.
 */
const withCampaignReads = (reads) => [...reads, "rpc:campaign_ledger", "rpc:campaign_stuck", "tenant_channels.select"];

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

/**
 * 9 Oct 2026 (spec 2026-10-09 §4.5): the report says the Reach-outs section after the Reviews lens, from its own reader
 * (readers/campaign-report.ts reachOutReport). This world's database models neither reach_out_report nor
 * reach_out_chain_totals (a function it does not have is no read it counts), so it says the read failed. The one change
 * to the bytes of a report it answers; its reads are unchanged.
 */
function withReachOuts(result) {
  const said = JSON.parse(result);
  return said.error
    ? result
    : JSON.stringify({ ...said, reach_outs: { error: "the cold email numbers could not be read just now" } });
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

/**
 * 10 Oct 2026 (Reports, the Receptionist lens, C2 T13): the report says the Receptionist lens after the Reviews lens, from
 * the lens's own read (readers/report.ts receptionistReport): the database's receptionist_series, and the hours the report's
 * booking line already read. This world's period is quiet, so it says the page's words for each part with nothing in it
 * (its hours, Monday and Saturday, count the messages that came while it was closed: none came), and the read is one rpc
 * more: no booking link was sent, so nobody is read for it (the people the link went to are read only where there were any).
 */
const QUIET_FOLD = toReceptionistReportVM(
  {
    timezone: TZ,
    today: dayKey(NOW.getTime()),
    days: 7,
    series: {
      ...quietReceptionist({ p_days: 7 }),
      links: { sent: 0, booked: null, calendar: "none" },
      stuck: { waiting: 0, oldest_at: null, callbacks: 0, capped: false },
    },
    // This world keeps hours on Monday and Saturday: a message that came while it was closed is counted, and none did.
    profile: { hours: { mon: { open: "09:00", close: "17:00" }, sat: { open: "09:00", close: "17:00" } } },
  },
  { nowMs: NOW.getTime() },
);
const QUIET_RECEPTIONIST_SAID = {
  hold: { empty: QUIET_FOLD.hold.empty },
  topics: { empty: QUIET_FOLD.topics.empty },
  languages: null,
  // A mix with nothing in it says the page's own empty words, as hold and topics do.
  call_endings: { empty: QUIET_FOLD.callEndings.empty },
  link: QUIET_FOLD.link.line,
  handover: [
    {
      label: "Your first reply after a handover",
      value: "—",
      meta: "nothing was handed over in this period",
      change: null,
    },
    { label: "Time to settle a handover", value: "—", meta: "nothing was handed over in this period", change: null },
  ],
  missed: {
    label: "Missed calls answered within an hour",
    value: "—",
    meta: "no call went unanswered at the phone",
    change: null,
  },
  closed: { value: QUIET_FOLD.closed.value, meta: QUIET_FOLD.closed.meta },
  stuck: [
    { label: "Needs you", value: "0", meta: "nobody is waiting for you" },
    { label: "Call-backs", value: "0", meta: "no call-back is waiting" },
    { label: "Replies held back", value: "0", meta: "none were held at the door in this period" },
  ],
  held_back: [],
};
function withReceptionist(result) {
  const said = JSON.parse(result);
  return said.error ? result : JSON.stringify({ ...said, receptionist: QUIET_RECEPTIONIST_SAID });
}
const withReceptionistReads = (reads) => [...reads, "rpc:receptionist_series"];

/**
 * 10 Oct 2026 (Reports, the People lens, C3 T13): the report says the People lens after the Receptionist lens, from the
 * lens's own read (readers/report.ts peopleReport): the database's people_series, and the book as People counts it over
 * the people the turn already reads for the booking line (readers/everyone.ts, once), judged against the channels the
 * workspace can send on. This world's period is quiet and its book is Rosa alone, so it says the page's words for each part
 * of the window with nothing in it, and a book of one: her wires, her freshness, no step, no stopped address, and where she
 * stands. Of fewer than five, the head says no share of yes.
 */
const QUIET_PEOPLE_SAID = {
  head: "Nobody reached you in this period.",
  window: {
    reached: [
      { label: "People who reached you", value: "0", meta: "nobody wrote or called in this period", change: null },
      { label: "New people", value: "0", meta: "nobody new", change: null },
      { label: "Yeses won", value: "0", meta: "nobody said yes in this period", change: null },
      { label: "Stops", value: "0", meta: "nobody asked to stop in this period", change: null },
    ],
    channels: { empty: "Nobody reached you in this period." },
    first_came: { empty: "Nobody new reached you in this period." },
    yeses: { empty: "Nobody said yes in this period." },
    stops: { empty: "Nobody asked to stop in this period." },
    steps_done: { empty: "No step was done in this period." },
    email_stopped: { empty: "No address stopped working in this period." },
  },
  book: {
    // Rosa wrote on WhatsApp and phoned: People's own channels for her are two ways in.
    wires: { rows: ["More than one way: 1"], line: "1 of 1 have reached you more than one way, as of today." },
    fresh: {
      rows: [
        "Under 7 days: 1",
        "7 to 30 days: 0",
        "31 to 60 days: 0",
        "61 to 90 days: 0",
        "91 days or more: 0",
        "Never heard from: 0",
      ],
      line: "Of 1 person as of today: the days since they last wrote or called. Your own messages do not count.",
      quiet: null,
    },
    stuck: [
      { label: "Steps overdue", value: "0", meta: "no next step is past its day", change: null },
      { label: "Steps due today", value: "0", meta: "no next step is due today", change: null },
      { label: "Email stopped working", value: "0", meta: "every address works", change: null },
    ],
    stand: [
      { label: "Said yes to messages", value: "1", meta: "of 1 person", change: null },
      { label: "Can receive offers", value: "1", meta: "of 1 person", change: null },
      { label: "Opted out", value: "0", meta: "of 1 person", change: null },
      { label: "Quiet 30+ days", value: "0", meta: "of 1 person", change: null },
    ],
  },
};
function withPeople(result) {
  const said = JSON.parse(result);
  return said.error ? result : JSON.stringify({ ...said, people: QUIET_PEOPLE_SAID });
}
// The series, and the channels the book is judged against (the number's row and the texting line's: the number's health
// is the turn's); the zone and the people are the turn's already.
const withPeopleReads = (reads) => [...reads, "rpc:people_series", "tenant_channels.select", "lines.select"];

test("the mapping names every old tool once, each to a tool and action the registry has, but the invitation, gone", () => {
  assert.deepEqual(
    [...OLD_TOOLS].filter((old) => !(old in NAMES)),
    [INVITE],
    "the invitation is the Team page's alone",
  );
  assert.equal(Object.keys(NAMES).length, 25, "the twenty-five old tools that are an action still");
  assert.equal(new Set(Object.values(NAMES)).size, 25, "each to its own name.action");
  assert.deepEqual(
    [...new Set(CASES.map(([old]) => old))].sort(),
    [...Object.keys(NAMES), INVITE].sort(),
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
  // 12 Oct 2026 (the wiring map): a timeline message that never reached them says so in the thread's words (not_sent),
  // and this world's one queued reply is "Sending…". Held to that here, then taken out.
  if (Array.isArray(rest.timeline))
    rest.timeline = rest.timeline.map(({ not_sent, ...item }) => {
      if (not_sent !== undefined) assert.equal(not_sent, "Sending…", "an unsent message says the thread's word");
      return item;
    });
  return { ...got, result: JSON.stringify(rest) };
}

/**
 * 14 Oct 2026 (the wiring's second audit, R13 X5-3, X5-7): the reads say the pages' words where these bytes say a stored
 * value -- a person's last contact and both consent answers (people.search), each thread's state and each call's end
 * (people.get), each line's state (workspace.settings) and each campaign's state (campaigns.playbooks). Each is held to a
 * word here, then taken out of both sides, so the rest is compared byte for byte.
 */
function withoutStoredWords(old, gotResult, wantResult) {
  const fields = {
    search_people: [["people", ["last_contact", "consent"]]],
    get_person: [
      ["conversations", ["state"]],
      ["calls", ["status"]],
    ],
    get_settings: [["channels", ["status"]]],
    list_playbooks: [["playbooks", ["state"]]],
  }[old];
  if (!fields) return [gotResult, wantResult];
  const parse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  };
  const got = parse(gotResult);
  const want = parse(wantResult);
  if (!got || !want || got.error || want.error) return [gotResult, wantResult];
  // Ask's thread words (server/ask/thread-state.ts); the others are a page's, which open with a capital.
  const THREAD_WORDS = ["needs you", "you have it", "a teammate is answering", "snoozed", "opted out", "answering"];
  const said = {
    last_contact: (v) => typeof v === "string" && (v.includes(" · ") || v === "No contact recorded"),
    consent: (v) => typeof v?.messages === "string" && typeof v?.offers === "string",
    state: (v, list) =>
      list === "conversations" ? THREAD_WORDS.includes(v) : typeof v === "string" && /^[A-Z]/.test(v),
    status: (v) => typeof v === "string" && /^[A-Z]/.test(v),
  };
  for (const [list, keys] of fields)
    for (const row of got[list] ?? [])
      for (const k of keys)
        assert.ok(said[k](row[k], list), `${old}: ${list}.${k} is the page's word: ${JSON.stringify(row[k])}`);
  const strip = (said) => {
    const out = { ...said };
    for (const [list, keys] of fields)
      if (Array.isArray(out[list]))
        out[list] = out[list].map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k))));
    return JSON.stringify(out);
  };
  return [strip(got), strip(want)];
}

/**
 * 15 Oct 2026 (the wiring's last two links): people says a person's next and last visits' ids beside the words these bytes
 * say of them, an answer's to cite as kind visit. Each is held to an id or null here, then taken out, so the rest is
 * compared byte for byte.
 */
function withoutVisitIds(old, gotResult) {
  const rows = old === "search_people" ? "people" : old === "get_person" ? null : undefined;
  if (rows === undefined) return gotResult;
  const said = JSON.parse(gotResult);
  if (said.error) return gotResult;
  const strip = (row) => {
    for (const k of ["next_visit_id", "last_visit_id"]) {
      assert.ok(k in row, `${old}: says ${k}`);
      assert.ok(row[k] === null || typeof row[k] === "string", `${old}: ${k} is an id or null`);
    }
    const { next_visit_id: _next, last_visit_id: _last, ...rest } = row;
    return rest;
  };
  return JSON.stringify(rows ? { ...said, [rows]: said[rows].map(strip) } : strip(said));
}

/** The old tools that read the open escalations through their reader: two halves since 13 Oct 2026 (R2). */
const ESCALATION_HALVES = new Set(["get_today", "list_threads", "get_thread"]);

/**
 * 13 Oct 2026 (the wiring's second audit, R2: S7-1, W-thread-wait-step-4): Today's answer says the one count's parts -- the
 * holds and the replies counting down under needs_you, the runs waiting that an approval can still send, and the searches
 * waiting -- in this world one hold, no reply on its way, no run and no search.
 */
function withTheOneCount(frozen) {
  const said = JSON.parse(frozen);
  if (!said.needs_you || !("period" in said)) return frozen;
  const { period, ...rest } = said;
  const { count, rows, ...more } = said.needs_you;
  return JSON.stringify({
    ...rest,
    needs_you: { count, holds: count, replies_on_their_way: 0, ...more, rows },
    campaign_runs_waiting: { count: 0, runs: [] },
    searches_waiting: [],
    period,
  });
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
 * 12 Oct 2026 (D1-hold-words): People's list of the threads the member looking has is worded as the Inbox words them,
 * "You have it", where these bytes say "Waiting on you"; its id and its token keep their names. The fixture stays as it
 * was made.
 */
function withHeldListWord(frozen) {
  return frozen.replaceAll('"label":"Waiting on you"', '"label":"You have it"');
}

/**
 * 18 Oct 2026 (0008, amended: every workspace has deals): the deal lists are offered once a deal is on file, where they
 * were offered wherever the workspace said some customers get a proposal first. This world said so and records no deal,
 * so campaigns.audiences lists them no more: the one change to its bytes.
 */
function withoutDealLists(frozen) {
  const deals = new Set(PEOPLE_LISTS.filter((l) => l.needsDeals).map((l) => l.id));
  const said = JSON.parse(frozen);
  return JSON.stringify({
    ...said,
    audiences: said.audiences.filter((a) => !(a.kind === "list" && deals.has(a.audience_id))),
  });
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
 * 15 Oct 2026 (the operator stress run): sequences.lists counts who said yes as People does (the rows' saidYes), whether or
 * not a number or a channel can carry it now, where it counted a yes only where one could, so Meta's pause on offers to US
 * numbers read 0 over 26 who had said yes. It says what they lack where WhatsApp reaches none of them (why_none_offers,
 * why_none_messages: none in this world, whose counts are as they were) and, before its note, which channels carry offers
 * now (offers_go_by: the Broadcasts page's sentence, of this world's UK number and no texting line or email). Its note
 * says so: the one change to its bytes beside that field.
 */
function withTheYesItself(frozen) {
  const { note, ...said } = JSON.parse(frozen);
  if (typeof note !== "string") return frozen;
  const offersGoBy =
    "Offers and news go by WhatsApp only. The text line is registered with the carriers for replies and appointment messages, so nothing promotional is sent by text; someone who has only ever texted you hears about offers once they say yes on WhatsApp.";
  const yes =
    "said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, as People counts it, whether or not a number or a channel can carry it now. Where some said yes and WhatsApp reaches none of them, why_none_offers or why_none_messages says what they lack, in People's words: a number to send to, or a channel that can carry it, and offers_go_by says which channels carry offers now (Meta's pause on offers to US numbers among them). Say how many said yes and what they lack, and never send the owner to get a yes they already have.";
  return JSON.stringify({
    ...said,
    offers_go_by: offersGoBy,
    note: note
      .replace("Two consents, two counts each, all by WhatsApp.", "Two consents, two counts each.")
      .replace("said_yes_to_offers and said_yes_to_messages count everyone who gave that yes, a number or not.", yes),
  });
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
 * owner (whose state reads "Waiting for your approval" since 11 Oct 2026; the two "Needs you" these bytes hold are a PERSON's
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
 * 9 Oct 2026 (the moment spec, decision 19): a playbook card's title says what a person calls it, "Campaign: …", where
 * these bytes say "Playbook: …". The kind, the action and the payload keep their names. The fixture stays as it was made.
 */
function withCampaignWord(frozen) {
  return frozen
    .replace('"card":"Playbook: ', '"card":"Campaign: ')
    .replace('"title":"Playbook: ', '"title":"Campaign: ');
}

/**
 * 11 Oct 2026 (Leads on a phone, and the ideas for a new search, 00398): a plan's sentence marks where its criteria
 * begin and end (contracts planWords: "in Austin, TX: a; b; reached by …"), where these bytes ran them on after the area,
 * and a plan Ask proposes names its kind (`category_key`, the key an idea and the platform's counts read it by), beside
 * its name. The one frozen plan is the plumbers'; the fixture stays as it was made.
 */
function withThePlansWords(frozen) {
  return frozen
    .replaceAll(
      "in Austin, TX has a website (confirmed) family-owned, reached by",
      "in Austin, TX: has a website (confirmed); family-owned; reached by",
    )
    .replace('"name":"plumbers","asked"', '"name":"plumbers","category_key":"plumber","asked"');
}

/**
 * 10 Oct 2026 (the moment spec, decision 19): the line a read says while it runs is a person's, so campaigns.playbooks
 * said "Reading the campaigns" where these bytes say "Reading the playbooks"; since the operator (15 Oct 2026) the two
 * reads say the Sequences page's words: the moments, and the lists and messages a send may use. The actions keep their
 * reads; the fixture stays as it was made.
 */
const SEQUENCES_LABELS = {
  "Reading the playbooks": "Reading the moments",
  "Reading the lists and templates": "Reading the lists and messages",
};
function withCampaignsLabel(want) {
  return want.label in SEQUENCES_LABELS ? { ...want, label: SEQUENCES_LABELS[want.label] } : want;
}

/**
 * 11 Oct 2026 (a one-off send honours the breath, fix round 3): the week's breath counts a message within a week either
 * side, one due included, so campaigns.playbooks' note says who waits in those words. The one sentence, once.
 */
function withTheBreathsWords(frozen) {
  return frozen.replace(
    "whoever a broadcast already reached this week waits out the week.",
    "whoever hears from you within a week of today, by a message already sent or one due, waits.",
  );
}

/**
 * 12 Oct 2026 (Ask as the marketing manager, the review after the merge): the run's breath is a week either side of it,
 * a message sent or due, never one playbook message a week, and the appointment moments are exempt from it and from the
 * playbook's gap (contracts playbookRunReach returns before either), so campaigns.playbooks' note says both in the
 * contracts' words (BREATH_WHY, PLAYBOOK_CARD_WORDS.appointmentBreath), in this workspace's word (it sells by proposal: a
 * meeting). The one sentence, once (in the owner's words since the 30 Oct 2026 review, item 6: it said "exempt from one a
 * week per person"); this world lists no playbook, so the fields that say a campaign's end and its trial
 * are not in these bytes.
 */
function withTheRunsBreath(frozen) {
  return frozen.replace(
    "and sends one playbook message per person per week.",
    "and holds whoever hears from you within a week of it, by a message already sent or one due, for a later run; a reminder the day before a meeting and a check the day after go one per meeting, exempt from the gap and sent whatever else they hear from you within a week of it.",
  );
}

/**
 * 9 Oct 2026 (the moment spec, A6, D35): campaigns.playbooks says each playbook's last 30 days (last_30_days, from
 * campaign_series' sources; null where that read fails, as in this world, which models no campaign_series) in the place
 * of its all-time runs, sent and replied, and its route is Campaigns' own word. Nothing else moved.
 */
function withLastThirtyDays(frozen) {
  const said = JSON.parse(withTheRunsBreath(withTheBreathsWords(frozen)));
  if (!Array.isArray(said.playbooks)) return frozen;
  const playbooks = said.playbooks.map((p) =>
    Object.fromEntries(
      Object.entries(p).flatMap(([k, v]) =>
        k === "runs" ? [["last_30_days", null]] : k === "sent" || k === "replied" ? [] : [[k, v]],
      ),
    ),
  );
  return JSON.stringify({ ...said, route: said.route === "outbound" ? "campaigns" : said.route, playbooks });
}

/**
 * campaigns.playbooks lists the moments a NEW playbook is offered, in the words contracts gives them now (2 Oct 2026,
 * the lifecycle set: contracts momentOffered; this workspace has no calendar, and every workspace has deals). Its
 * listing is held to those moments, each one's counts to what 7405e34b counted for it, and the rest of the answer is
 * compared byte for byte.
 */
function againstOffered(got, frozen) {
  const g = JSON.parse(got);
  const w = JSON.parse(frozen);
  assert.deepEqual(
    g.triggers.map((t) => t.trigger),
    PLAYBOOK_TRIGGERS.filter((t) => momentOffered(t, { calendarOn: false })).map((t) => t.id),
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

/**
 * 18 Oct 2026 (the Settings wiring review, item 14): workspace.settings says how it answers -- its tone, what callers
 * hear first and in which voice, the transfer number, the owner's own words and the three messages -- beside the
 * languages and photos, so a card that changes a row of How it answers is proposed from what the row holds. This
 * world's: nothing set but the prompt written before the form, which the box opens as the owner's own words, and the
 * three messages it stores. Nothing else moved.
 */
function withHowItAnswers(frozen) {
  const answers = {
    tone: null,
    phone_greeting: null,
    phone_voice: "Tamsin",
    transfer_number: null,
    own_words: "Answer as the front desk of Harbor Moving: brief and warm.",
    messages: { greeting: "g", error: "e", non_text: "n" },
  };
  const said = Object.entries(JSON.parse(frozen));
  return JSON.stringify(
    Object.fromEntries(
      said.flatMap(([k, v]) =>
        k === "vision"
          ? [
              [k, v],
              ["answers", answers],
            ]
          : [[k, v]],
      ),
    ),
  );
}

/**
 * 19 Oct 2026 (decision 0064): a sequence's mode is its own, so campaigns.playbooks says what a NEW sequence of each class
 * starts as (new_sequences_start_as: the rows the frozen answer called modes) and what each mode does to a batch in How
 * it runs' words, Never gone (a sequence is paused on its page) and a batch of new words waiting first. Each playbook says
 * its own mode; this world has none. Nothing else moved.
 */
function withEachSequencesMode(frozen) {
  const said = JSON.parse(frozen);
  if (!("modes" in said)) return frozen;
  const words = {
    auto: SEQUENCE_MODE_WORDS.auto.does,
    veto: SEQUENCE_MODE_WORDS.veto.does,
    ask: SEQUENCE_MODE_WORDS.ask.does,
    new_words:
      "a batch of a step whose words are new to the owner (next_batch_asks_first) waits for their OK first, whatever the mode",
  };
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(said).map(([k, v]) =>
        k === "modes" ? ["new_sequences_start_as", v] : k === "mode_words" ? [k, words] : [k, v],
      ),
    ),
  );
}

/**
 * 19 Oct 2026 (the Campaigns wiring review's lane 1): a tool's route is its page's own address, never a retired one that an
 * edge moves on: the playbooks' read (Campaigns, `campaigns`) and the audiences' (Sent's, `broadcasts`) say Sequences, which
 * those landed on. Nothing else moved.
 */
const withTheHomes = (frozen) =>
  frozen
    .replaceAll('"route":"campaigns"', '"route":"campaigns/sequences"')
    .replaceAll('"route":"broadcasts"', '"route":"campaigns/sequences"');

/**
 * 19 Oct 2026 (decision 0064): a new campaign's card says what its batches do by the mode its sequence starts with, where
 * it said its class's mode and a run's wait; this world's Re-engage has no row, so its sequence asks before each batch.
 */
const withTheSequencesStart = (frozen) =>
  frozen.replaceAll(
    "under “Re-engage” (ask): each run waits for you on Today.",
    "Each batch waits for your OK (Re-engage).",
  );

/**
 * 30 Oct 2026 (the review of the live app, item 6): a campaign whose moment names nobody today says so in the moment's
 * words, where it said "0 people on the list said yes" of a day or a list with nobody on it. This world has nobody quiet.
 */
const withNobodyNamed = (frozen) =>
  frozen.replaceAll("0 people on the list said yes to offers", "Nobody has gone quiet for 30 days");

test("every old tool's call, made by its new name and action, answers the bytes the old tool answered at 7405e34b, and makes the same reads", async () => {
  assert.equal(FIXTURE.length, CASES.length, "one frozen answer per call");
  for (let i = 0; i < CASES.length; i++) {
    const [old, input, role = "owner"] = CASES[i];
    const { call: frozen, ...want } = FIXTURE[i];
    assert.deepEqual(frozen, [old, input, role], `case ${i} is the call the fixture froze`);
    if (old === INVITE) {
      // The invitation's tool is gone with it (Ruben, 15 Oct 2026): refused as any unknown tool, before anything is read.
      const gone = await answer("propose_team", { action: "invite", ...input }, role);
      assert.deepEqual(
        [gone.isError, JSON.parse(gone.result).error, gone.reads],
        [true, "unknown tool propose_team", []],
      );
      continue;
    }
    const call = renamed(old, input);
    const got = withoutPersonState(old, await answer(call.name, call.input, role));
    // 2 Oct 2026: a moment no longer offered for a new playbook (contracts MOMENTS_RETIRED) is not one of the tool's
    // triggers: the schema refuses it, naming the ones that are, before anything is read (the check refuses it in the
    // moment's own words if it gets that far, which core-campaigns.test.mjs runs).
    if (call.name === "propose_sequence" && String(call.input.trigger) in MOMENTS_RETIRED) {
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
      .replaceAll(
        "Connect your calendar under Settings › Business",
        "Add a calendar link under Settings › Hours & booking",
      )
      // 11 Oct 2026 (decision 0051): saying it is an automated assistant is no longer a switch, and Ask says so.
      .replaceAll(
        "says it is an automated assistant when asked",
        "always says it is the business's automated assistant, never a person",
      );
    for (const [from, to] of Object.entries(NAMES))
      result = result.replace(new RegExp(`\\b${from}\\b`, "g"), inWords(to));
    if (NAMES[old] === "report")
      result = withPeople(withReceptionist(withReachOuts(withReviews(withCampaigns(withHold(result))))));
    if (NAMES[old] === "inbox.list" && input.filter === "held") result = withNothingHeld(result);
    if (old === "get_today") result = withTheOneCount(result);
    // 19 Oct 2026 (decision 0064, step 2): Today says what goes on its own later today unless it is stopped, as its Going
    // today draws it, before the searches that wait: nothing in this world.
    if (old === "get_today") result = result.replace('"searches_waiting":', '"going_today":[],"searches_waiting":');
    if (old === "get_settings") result = withHowItAnswers(result);
    if (NAMES[old] === "sequences.moments") result = withEachSequencesMode(result);
    if (old === "list_threads" || old === "get_thread") result = withNoHeldDraft(result);
    if (NAMES[old] === "calls.list" || NAMES[old] === "calls.get") result = withCallDirection(result);
    if (NAMES[old] === "sequences.lists")
      result = withoutDealLists(withTheYesItself(withHeldListWord(withChannels(result))));
    if (NAMES[old].startsWith("propose_sequence.")) result = withTheVerbsWords(result);
    // 8 Oct 2026: a playbook's hour by the product's clock (withTheClocksHour): the campaigns' own answers and cards,
    // in their result and in the card they propose.
    const campaignsOwn = NAMES[old].startsWith("sequences.") || NAMES[old].startsWith("propose_sequence.");
    if (campaignsOwn) result = withTheClocksHour(result);
    // 9 Oct 2026: and a playbook card's title says "Campaign" (withCampaignWord), in its result and in the card.
    const playbookCard = NAMES[old] === "propose_sequence.moment";
    if (playbookCard) result = withNobodyNamed(withTheSequencesStart(withCampaignWord(result)));
    // 11 Oct 2026: a plan's sentence and its kind (withThePlansWords), in the result and in the card.
    const leadPlan = NAMES[old] === "propose_lead_search.find";
    if (leadPlan) result = withThePlansWords(result);
    const card =
      campaignsOwn && typeof want.proposal === "string"
        ? {
            proposal: playbookCard
              ? withNobodyNamed(withTheSequencesStart(withCampaignWord(withTheClocksHour(want.proposal))))
              : withTheClocksHour(want.proposal),
          }
        : leadPlan && typeof want.proposal === "string"
          ? { proposal: withThePlansWords(want.proposal) }
          : {};
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
      NAMES[old].startsWith("propose_sequence.") && input.template_id === TPL && reads00.includes("templates.select");
    const reads0 = readsRows ? [...reads00, "templates.select"] : reads00;
    // 3 Oct 2026 (One message, every channel, step 3): the playbooks reader asks whether the workspace can send on each
    // channel (server/campaigns/channels-ready.ts): the WhatsApp number and the texting line, after the turn's tenants
    // reads (the mailbox only where the deployment sends email, which this one does not). The one change to its reads.
    // A campaign proposed (a broadcast, a playbook) asks the same of WhatsApp alone, the one channel Ask names: whether
    // its number can send. One read more, in any order; a call refused before, at its template, never gets that far.
    const proposes = String(NAMES[old]).startsWith("propose_sequence.") && !want.isError;
    // 7 Oct 2026 (lane 1, T5): a playbook's check reads the message the template's id names (db messageVersionRowsOf: the
    // version, then every row of it, on any channel), where it read the one WhatsApp row: a playbook proposed on a
    // template, which reached the check after Ask's own read of the row, makes one `templates` read more.
    const readsMessage =
      proposes &&
      NAMES[old] === "propose_sequence.moment" &&
      reads00.filter((r) => r === "templates.select").length >= 2;
    const counted =
      NAMES[old] === "sequences.moments"
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
    const withDoubts0 = NAMES[old] === "people.get" ? [...withDecisions, "person_doubts.select"] : withDecisions;
    // 12 Oct 2026 (#1566, decision 0052): and the signers of their replies still offered or taken (db signersOf), in the
    // same round; its bytes are unchanged, the tool not saying them. This world's person names no lead, so the business
    // they work at reads nothing.
    // 15 Oct 2026 (decision 0060, S5): and the sequences they are in now (db sequencesOfPerson); none here, so no names.
    const withDoubts =
      NAMES[old] === "people.get"
        ? [...withDoubts0, "sequence_replies.select", "sequence_enrollments.select"]
        : withDoubts0;
    // 7 Oct 2026 (00345, bookings arrive by email): the calendar's reader reads the record beside the feed -- the
    // appointments over the span, the notices' health line (the latest, and the held count) and the workspace's mailbox
    // -- so calendar.week makes those reads more. Its bytes are unchanged: this workspace has no calendar and no
    // booking has arrived, and with no feed to read nothing of the record's taken time is asked. Since 00397 the span's
    // record is two reads (db visitsOver: the bookings whole, and the feed's rows by key), so five more.
    const withCalendar =
      NAMES[old] === "calendar.week"
        ? [
            ...withDoubts,
            "appointments.select",
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
    // 9 Oct 2026 (a moment holds many campaigns, lane 1, task 14): the playbooks reader asks the database what each
    // playbook's runs earned (00374 playbook_totals, db playbookTotals: one call) and reads the playbooks' rows alone,
    // where it read every run's row beside them to sum it in TypeScript: one `broadcasts` read fewer and one call to the
    // function more. Its bytes are unchanged (GET playbooks answers the same bytes, playbooks/totals/playbook-totals.test.mjs).
    const countsInTheDatabase = NAMES[old] === "sequences.moments" && withOurWire.includes("sequence_batches.select");
    const withTotals = countsInTheDatabase
      ? [...withOurWire.toSpliced(withOurWire.indexOf("sequence_batches.select"), 1), "rpc:playbook_totals"]
      : withOurWire;
    // 9 Oct 2026 (the moment spec, D9): a playbook proposed is held to the running ones on its moment, list and message
    // (packages/db runningTwins): one `playbooks` read more for a call that reaches its card.
    const readsTwins = NAMES[old] === "propose_sequence.moment" && !want.isError;
    const withTwins = readsTwins ? [...withTotals, "sequence_steps.select"] : withTotals;
    // 10 Oct 2026 (a moment holds many campaigns: the month's allowance, one rule): a playbook proposed is counted against
    // the week's touches as the page's pools are (server/campaigns/playbooks.ts recentTouches, db touchesSince: the week's
    // runs, and the workspace's zone a waiting run is judged by), where it was counted with nobody touched: two reads more
    // for a call that reaches its card, and no read of the runs' people where the week holds no run. Its bytes are
    // unchanged: nobody here heard from a campaign this week.
    const withWeek = readsTwins ? [...withTwins, "sequence_batches.select", "tenants.select"] : withTwins;
    // 11 Oct 2026 (a one-off send honours the breath): a broadcast proposed leaves out whoever heard this week, as the
    // composer counts them and the route skips them (db recentTouches over touchesSince): the same two reads more for a
    // call that reaches its card, and for the audiences listing, which counts as the card does. Their bytes are unchanged:
    // nobody here heard from a campaign this week.
    const readsBreath = (NAMES[old] === "propose_sequence.once" && !want.isError) || NAMES[old] === "sequences.lists";
    const withBreath = readsBreath ? [...withWeek, "sequence_batches.select", "tenants.select"] : withWeek;
    // 10 Oct 2026 (Reports, the Receptionist lens, C2 T13): and the Receptionist lens's own: one rpc more (withReceptionistReads).
    // 10 Oct 2026 (Reports, the People lens, C3 T13): and the People lens's: its series and the channels the book is judged against.
    // 11 Oct 2026 (Reports, the Campaigns lens, C4 T16): and the Campaigns lens's ledger, what is stuck and the number (withCampaignReads).
    // 13 Oct 2026 (the wiring's second audit, R2): the open escalations are read in two halves (readers/escalations.ts: the
    // holds that wait on a person, and the hand-backs), one read more where the old tool read them through the reader; and
    // Today reads the runs waiting for approval (readers/broadcasts.ts waitingRuns), one `broadcasts` read more. Its bytes
    // gain the one count's parts (withTheOneCount).
    const halves =
      ESCALATION_HALVES.has(old) && withBreath.includes("escalations.select")
        ? [...withBreath, "escalations.select"]
        : withBreath;
    // 13 Oct 2026 (Ruben: held emails count): and the going runs, whose check may hold emails for your say (db
    // waitingRunsOf): one `broadcasts` read more. Nobody here has a going reach-out run, so no held count is asked.
    // 19 Oct 2026 (decision 0064, step 2): and the runs set to go before the day ends (db runsGoingBetween), one more.
    // 31 Oct 2026 (decision 0079, L5): and the leads who tried their own receptionist (db previewsTriedSince), one more.
    // Its bytes are unchanged: nobody here tried one.
    const withRunsWaiting =
      old === "get_today"
        ? [
            ...halves,
            "sequence_batches.select",
            "sequence_batches.select",
            "sequence_batches.select",
            "lead_previews.select",
          ]
        : halves;
    // 13 Oct 2026 (the wiring's second audit, R3, S5-3): a person the workspace does not show is asked once more whether
    // they were combined into another (db keptPersonOf), so their old address opens the person they became: one
    // `contacts` read more where the profile is refused. Its bytes are unchanged for nobody combined.
    const followsACombine =
      NAMES[old] === "people.get" && want.isError ? [...withRunsWaiting, "contacts.select"] : null;
    const withKept = followsACombine ?? withRunsWaiting;
    // 16 Oct 2026 (a question handed back unanswered still waits): the conversations reader asks each thread's newest
    // closed hold beside its messages (db lastClosedHolds), so a thread whose customer wrote last can say nobody answered
    // them: one `escalations` read more for each read of the threads' messages. The bytes are unchanged: no tool says it yet.
    const withClosedHolds = [
      ...withKept,
      ...withKept.filter((r) => r === "rpc:newest_messages").map(() => "escalations.select"),
    ];
    // 18 Oct 2026 (0008, amended: every workspace has deals): where a tool read how the workspace's customers buy
    // (tenants.sells_by), it reads what it needs of what replaced it. People's page and a playbook's card say the
    // workspace's word (one `tenants` read, as before), and People's rows ask whether a deal was ever recorded (one
    // `deals` read more); a pool or a list asks the second alone; the settings and the report ask neither. This world
    // records no deal, so the moments ask whether there is one where they read its pace and its proposals out. Their
    // bytes are unchanged, the deal lists aside (withoutDealLists).
    const pool =
      readsReach &&
      (old === "list_audiences" || old === "propose_broadcast" || (old === "search_people" && !!input.list));
    const dealt = [...withClosedHolds, ...(readsReach ? ["deals.select"] : [])];
    const drop = (r, x) => (r.includes(x) ? r.toSpliced(r.indexOf(x), 1) : r);
    const withoutBuys =
      pool || NAMES[old] === "report" || NAMES[old] === "workspace.settings" ? drop(dealt, "tenants.select") : dealt;
    const withOneDealRead = NAMES[old] === "sequences.moments" ? drop(withoutBuys, "deals.select") : withoutBuys;
    const reads =
      NAMES[old] === "report"
        ? withCampaignReads(withPeopleReads(withReceptionistReads(withReviewReads(withOneDealRead))))
        : withOneDealRead;
    const [gotResult, wantResult] = withoutStoredWords(
      old,
      ...(NAMES[old] === "sequences.moments"
        ? againstOffered(got.result, withTheHomes(withLastThirtyDays(result)))
        : [
            withoutVisitIds(old, got.result),
            withTheHomes(NAMES[old] === "people.get" ? withoutRightNowDetail(result) : result),
          ]),
    );
    // 2 Oct 2026: a win-back proposed asks first whether a calendar is connected (check-playbook's calendarOn), from the
    // zone and settings the turn reads once: the same reads as before, those two earlier.
    // Reads asked at once land in any order: People's list has read the workspace beside its rows since e32aaf29c,
    // so every call's reads are compared as a set of counts, the win-back's and the channels' among them.
    const inOrder = (r) => [...r].sort();
    assert.deepEqual(
      { ...got, result: gotResult, reads: inOrder(got.reads) },
      { ...withCampaignsLabel(want), ...card, result: wantResult, reads: inOrder(reads) },
      `${old} -> ${NAMES[old]} ${JSON.stringify(input)}`,
    );
  }
});

test("the report finds the people its booking link went to only where the link went to someone, and reads People once either way: the turn's one read (readers/everyone.ts), filtered", async () => {
  const peopleReads = (reads) => reads.filter((r) => r === "rpc:people_list").length;
  const none = await answer("report", { period: "7d" });
  assert.equal(none.isError, false, none.result);
  assert.equal(peopleReads(none.reads), 1, "no link sent: nobody to find");
  assert.equal(none.reads.filter((r) => r === "rpc:receptionist_series").length, 1, "the lens's read, once");
  // The People lens counts the same People: its series is its one call more, and the book is the turn's one read, counted.
  assert.equal(none.reads.filter((r) => r === "rpc:people_series").length, 1, "the People lens's read, once");
  // The Campaigns lens's ledger and what is stuck: one call each, whether or not the sends could be read.
  assert.deepEqual(
    ["rpc:campaign_ledger", "rpc:campaign_stuck"].map((rpc) => none.reads.filter((r) => r === rpc).length),
    [1, 1],
    "the Campaigns lens's ledger and what is stuck, once each",
  );
  // The channels: the People lens judges its book against the turn's one read of them (the number's row and the texting
  // line's), and the Campaigns lens reads the connected number's row once more, to say its health (the reader's own read,
  // the channel's stored config): two reads of the number's row, one of the texting line's.
  assert.deepEqual(
    ["tenant_channels.select", "lines.select"].map((q) => none.reads.filter((r) => r === q).length),
    [2, 1],
    "and the channels: the book's judgment, once, and the number's health, once",
  );

  const link = (a) => quietReceptionist(a, { links: { total: 1, people: [{ c: P1, at: ago(DAY) }] } });
  const sent = await answer("report", { period: "7d" }, "owner", { ...RPCS, receptionist_series: link });
  assert.equal(sent.isError, false, sent.result);
  assert.equal(peopleReads(sent.reads), 1, "a link sent to Rosa: People is read whole once, then filtered to her");
  // This workspace keeps no calendar link: the calendar cannot say who booked, and the line says why, never a count.
  assert.equal(
    JSON.parse(sent.result).receptionist.link,
    "1 person was sent the booking link. Add a calendar link under Settings › Hours & booking to see who booked.",
  );
});
