/**
 * The world the tests of tool-names/ share. Split by behaviour from ask-tool-names.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
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
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { inputToday } from "../tools/_screens-names.mjs";
import { QUIET } from "../../reports/people/_people-world.mjs";
import { QUIET as CAMPAIGNS_QUIET } from "../../reports/campaigns/_campaign-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { runTool, buildProposal, newToolContext, ACT_TOOL_NAMES, ACT_DEFS } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);

export const {
  MOMENTS_RETIRED,
  PEOPLE_LISTS,
  PERSON_STATE_LABELS,
  PLAYBOOK_TRIGGERS,
  SEQUENCE_MODE_WORDS,
  momentOffered,
  roleAtLeast,
  toReceptionistReportVM,
  toReviewsReportVM,
} = await import("@chanlytics/contracts");

export const { PROPOSAL_SPECS } = await import("@chanlytics/contracts");

export const { readerCache } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

beforeEach(() => readerCache.clear());

/** The twenty-six tools as PR 3.1 froze them, by name. */
export const OLD_TOOLS = new Set(
  JSON.parse(fs.readFileSync(path.join(ROOT, "tests/fixtures/ask-tools-0c136563.json"), "utf8")).operator.map(
    (t) => t.name,
  ),
);

/**
 * The rename's rows for those old tools (tooling/evals/tool-names.json): every old tool but the invitation, the Team
 * page's alone since the operator (Ruben, 15 Oct 2026). The table's later rows rename Phase 4's names, no old tool's.
 */
export const NAMES = Object.fromEntries(
  Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, "tooling/evals/tool-names.json"), "utf8"))).filter(
    ([old]) => OLD_TOOLS.has(old),
  ),
);

/** The one old tool with no successor: its calls are refused as the unknown tool its group became. */
export const INVITE = "propose_invite";

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

export const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

export const P1 = "abababab-abab-4aba-8aba-abababababa1";

export const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

export const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

export const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";

export const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";

export const K2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";

export const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

export const TPL2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

/** A template and a list of the workspace's own that are not in it. */
export const GONE = "dddddddd-dddd-4ddd-8ddd-ddddddddddd9";

export const LIST_GONE = "bbbbbbbb-bbbb-4bbb-8bbb-000000000000";

export const USER = "u1";

export const TZ = "America/New_York";

/** A Monday at 10:00 in New York. */
export const NOW = new Date("2026-09-14T14:00:00Z");

export const DAY = 86_400_000;

export const iso = (ms) => new Date(ms).toISOString();

export const ago = (ms) => iso(NOW.getTime() - ms);

export const contact = {
  id: P1,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
  email: null,
  consent: "opted_in",
  dnc: false,
};

export const conversation = (id, over = {}) => ({
  id,
  tenant_id: A,
  contact_id: P1,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  // Something has come to the thread from their side, and the row says when, as ingest_inbound stamps it: a thread
  // nothing has come to is a first message's, and the reply card asks more of it (conversations/reply/reply-window.test.mjs).
  last_inbound_at: ago(3600_000),
  last_inbound_on_whatsapp: ago(3600_000),
  last_message_at: ago(3600_000),
  contacts: contact,
  ...over,
});

export const message = (id, conversation_id, over = {}) => ({
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

export const call = (id, over = {}) => ({
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

export const template = (id, name, over = {}) => ({
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
export const tables = () => ({
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
export const rosaRow = {
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

export const dayKey = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

/** A quiet day in report_series: two messages in, one answered by the receptionist, one call. */
export const quiet = {
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
export function quietReceptionist({ p_days: days }, over = {}) {
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
export const quietPeople = ({ p_days: days }) => ({ timezone: TZ, today: dayKey(NOW.getTime()), days, ...QUIET });

/** What campaign_ledger answers (00405) for a quiet window: nobody was sent to, held, stopped, failed or approved. */
export const quietCampaigns = ({ p_days: days }) => ({
  timezone: TZ,
  today: dayKey(NOW.getTime()),
  days,
  ...CAMPAIGNS_QUIET,
});

export const RPCS = {
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

export const PLAN = {
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
export const CASES = [
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
export const withoutId = (s) => s.replace(/"id":"p-[0-9a-f-]{36}",?/g, "").replace(/,?"made_at":"[^"]+"/g, "");

/** One call over a fresh copy of the workspace: what the model read, the trace line or the card, and the reads made. */
export async function answer(name, input, role = "owner", rpcs = RPCS) {
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
 * out where it was empty. Since 26 Nov 2026 a field or a value that named a sequence or the receptionist says campaign
 * or ai (tools/_screens-names.mjs inputToday).
 */
export function renamed(old, input) {
  const [name, action] = NAMES[old].split(".");
  let own = input;
  if (old === "get_report") own = { period: `${input.days}d` };
  if (old === "propose_policy" && input.mode === "") {
    const { mode: _, ...rest } = input;
    own = rest;
  }
  return { name, input: inputToday(name, action ? { action, ...own } : own) };
}

/** Whose an action is, in the registry's refusal (tools/context/context.ts WHOSE). */
export const WHOSE = { owner: "an owner's", partner: "an owner's or a partner's" };

/**
 * The reads with the channels' two after the leading tenants reads: the number's row and the texting line's; and, since 4 Oct
 * 2026, whether the workspace is paused (tenants.status, db workspacePaused), which the playbooks' page says instead of a
 * next run's time.
 */
export const withChannelReads = (reads) => {
  const at = reads.findIndex((r) => r !== "tenants.select");
  const i = at < 0 ? reads.length : at;
  return [...reads.slice(0, i), "tenant_channels.select", "lines.select", "tenants.select", ...reads.slice(i)];
};

/** The old tools that read the threads through the conversations reader (readers/conversations.ts). */
export const THROUGH_THE_HUNDRED = new Set(["get_today", "list_threads"]);

/** An old name as a refusal now says it: the tool, and its action in words. */
export const inWords = (to) => (to.includes(".") ? to.replace(".", " with action ") : to);

export const pageModesOf = (old) => (r) =>
  old === "search_people" && r === "policies.select" ? "rpc:people_reply_modes" : r;

/** What the registry at 7405e34b answered for each call, frozen from the old names before they went. */
export const FIXTURE = (await import("../tools/_ai-named.mjs")).frozenAnswers(ROOT);

/**
 * The report's reply_time says the hold the owner set since the Reports fix wave (spec D14): null where the report
 * carries none, as the report this suite reads does. The one change to the bytes of an answer that has a reply_time.
 */
export function withHold(result) {
  const said = JSON.parse(result);
  return said.reply_time ? JSON.stringify({ ...said, reply_time: { ...said.reply_time, hold: null } }) : result;
}

/**
 * 6 Oct 2026 (decision 0030): the report says the Campaigns lens beside it, from the lens's own read (readers/
 * campaign-report.ts), said after its deals: an error in this world, whose database has no campaign_series (a function
 * it does not have is no read it counts). The one change to the bytes of a report it answers.
 */
export function withCampaigns(result) {
  const said = JSON.parse(result);
  return said.error
    ? result
    : JSON.stringify({ ...said, campaigns: { error: "the campaign numbers could not be read just now" } });
}

/**
 * 11 Oct 2026 (Reports, the Campaigns lens, C4 T16): the report reads the lens's ledger beside its sends, whether or not the
 * sends could be read (readers/campaign-report.ts campaignLedgerReport, once): the database's campaign_ledger and
 * campaign_stuck, and the connected number's row (the reader says its health from the channel's stored config, db
 * findWhatsappChannelFacts: its own read of tenant_channels, one). The bytes are unchanged: this world has no campaign_series,
 * so the lens still says error.
 */
export const withCampaignReads = (reads) => [
  ...reads,
  "rpc:campaign_ledger",
  "rpc:campaign_stuck",
  "tenant_channels.select",
];

/**
 * 7 Oct 2026 (Reports phase C, lens 1, T4): the report says the Reviews lens after the Campaigns lens, from the lens's own
 * read (readers/report.ts reviewsReport: Google as GET google reads it, and the reviews the database counted where a
 * profile has synced). This world has no Google listing and a deployment that can look none up, so it says `linked: false` and
 * the fold's words for that, and the read is six reads more: the ledger function, the listing, the connection, the newest reviews, the daily readings
 * and the Autonomy row for reviews. The one change to the bytes and to the reads of a report it answers.
 */
export function withReviews(result) {
  const said = JSON.parse(result);
  return said.error ? result : JSON.stringify({ ...said, reviews: { linked: false, words: NOTHING_LINKED } });
}

/**
 * 9 Oct 2026 (spec 2026-10-09 §4.5): the report says the Reach-outs section after the Reviews lens, from its own reader
 * (readers/campaign-report.ts reachOutReport). This world's database models neither reach_out_report nor
 * reach_out_chain_totals (a function it does not have is no read it counts), so it says the read failed. The one change
 * to the bytes of a report it answers; its reads are unchanged.
 */
export function withReachOuts(result) {
  const said = JSON.parse(result);
  return said.error
    ? result
    : JSON.stringify({ ...said, reach_outs: { error: "the cold email numbers could not be read just now" } });
}

/** What the Reviews fold says of a workspace with nothing linked, where nothing can be looked up (this world's deployment). */
export const NOTHING_LINKED = toReviewsReportVM(
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

export const withReviewReads = (reads) => [
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
export const QUIET_FOLD = toReceptionistReportVM(
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
    // 17 Nov 2026 (decision 0138): the calls kept off the owner's list, counted from the ledger: none in this world.
    screened: { total: 0, by_reason: {} },
  },
  { nowMs: NOW.getTime() },
);

export const QUIET_RECEPTIONIST_SAID = {
  hold: { empty: QUIET_FOLD.hold.empty },
  topics: { empty: QUIET_FOLD.topics.empty },
  languages: null,
  // A mix with nothing in it says the page's own empty words, as hold and topics do.
  call_endings: { empty: QUIET_FOLD.callEndings.empty },
  calls_kept_off_your_list: QUIET_FOLD.screened.line,
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

export function withReceptionist(result) {
  const said = JSON.parse(result);
  // The lens is the report's ai since 26 Nov 2026 (tools/_screens-names.mjs): it was receptionist.
  return said.error ? result : JSON.stringify({ ...said, ai: QUIET_RECEPTIONIST_SAID });
}

export const withReceptionistReads = (reads) => [...reads, "rpc:receptionist_series", "events.select"];

/**
 * 10 Oct 2026 (Reports, the People lens, C3 T13): the report says the People lens after the Receptionist lens, from the
 * lens's own read (readers/report.ts peopleReport): the database's people_series, and the book as People counts it over
 * the people the turn already reads for the booking line (readers/everyone.ts, once), judged against the channels the
 * workspace can send on. This world's period is quiet and its book is Rosa alone, so it says the page's words for each part
 * of the window with nothing in it, and a book of one: her wires, her freshness, no step, no stopped address, and where she
 * stands. Of fewer than five, the head says no share of yes.
 */
export const QUIET_PEOPLE_SAID = {
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

export function withPeople(result) {
  const said = JSON.parse(result);
  return said.error ? result : JSON.stringify({ ...said, people: QUIET_PEOPLE_SAID });
}

// The series, and the channels the book is judged against (the number's row and the texting line's: the number's health
// is the turn's); the zone and the people are the turn's already.
export const withPeopleReads = (reads) => [...reads, "rpc:people_series", "tenant_channels.select", "lines.select"];

/**
 * people.get says where the person stands, as their People row does (personStateFor, for the member asking): a change
 * to its bytes since 7405e34b, when an answer read a person's standing from their threads' stored states. Held to one
 * of the states' words here, then taken out, so the rest is compared byte for byte.
 */
export function withoutPersonState(old, got) {
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
export function withoutStoredWords(old, gotResult, wantResult) {
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
  const THREAD_WORDS = [
    "needs you",
    "you have it",
    "a teammate is answering",
    "snoozed",
    "opted out",
    "waiting on them",
    "answering",
  ];
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
export function withoutVisitIds(old, gotResult) {
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
export const ESCALATION_HALVES = new Set(["get_today", "list_threads", "get_thread"]);

/**
 * 13 Oct 2026 (the wiring's second audit, R2: S7-1, W-thread-wait-step-4): Today's answer says the one count's parts -- the
 * holds and the replies counting down under needs_you, the runs waiting that an approval can still send, and the searches
 * waiting -- in this world one hold, no reply on its way, no run and no search.
 */
export function withTheOneCount(frozen) {
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
export function withoutRightNowDetail(frozen) {
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
export function withNothingHeld(frozen) {
  return JSON.stringify({ ...JSON.parse(frozen), total_matching: 0, threads: [] });
}

/**
 * 6 Oct 2026 (the review's fixes): a thread's held_draft is a draft that still waits, by the rule `held` asks
 * (heldDraftWaits). This world's one draft is past its deadline, so a row and a thread read name none: the one change to
 * their bytes.
 */
export function withNoHeldDraft(frozen) {
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
export function withCallDirection(frozen) {
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
export function withHeldListWord(frozen) {
  return frozen.replaceAll('"label":"Waiting on you"', '"label":"You have it"');
}

/**
 * 18 Oct 2026 (0008, amended: every workspace has deals): the deal lists are offered once a deal is on file, where they
 * were offered wherever the workspace said some customers get a proposal first. This world said so and records no deal,
 * so campaigns.audiences lists them no more: the one change to its bytes.
 */
export function withoutDealLists(frozen) {
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
export function withChannels(frozen) {
  const said = JSON.parse(frozen);
  const note =
    typeof said.note === "string"
      ? `${said.note.replace(
          "Two consents, two counts each. can_be_sent_offers is who a promotional message reaches and",
          "Two consents, two counts each, all by WhatsApp. can_be_sent_offers is who a promotional message reaches on WhatsApp and",
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
export function withTheYesItself(frozen) {
  const { note, ...said } = JSON.parse(frozen);
  if (typeof note !== "string") return frozen;
  const offersGoBy =
    "Offers and news go by WhatsApp only. Texting is approved for replies and appointment messages, so no offer goes by text: someone who only texts you hears of them once they say yes on WhatsApp.";
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
 * message, where it said Campaigns › Messages and an approved template. (25 Nov 2026, the server's refusals in the owner's
 * words) The message it does not hold is "Saved message not found.". The fixture is the old registry's bytes and stays
 * as it was made; these are the changes to them.
 */
export function withTheVerbsWords(frozen) {
  return frozen
    .replace(/"that template is not approved by WhatsApp[^"]*"/, '"Saved message not found."')
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
export function withTheClocksHour(frozen) {
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
export function withCampaignWord(frozen) {
  return frozen
    .replace('"card":"Playbook: ', '"card":"Campaign: ')
    .replace('"title":"Playbook: ', '"title":"Campaign: ');
}

/**
 * 11 Oct 2026 (Leads on a phone, and the ideas for a new search, 00398): a plan's sentence marks where its criteria
 * begin and end (contracts planWords: "in Austin, TX: a; b; reached by …"), where these bytes ran them on after the area,
 * and a plan Ask proposes names its kind (`category_key`, the key an idea and the platform's counts read it by), beside
 * its name. 4 Nov 2026: its facts lost a key nothing set. 14 Nov 2026 (decision 0132): a search made for email counts a
 * lead only with a checked email, and says so. The one frozen plan is the plumbers', kept as it was made.
 */
export const withThePlansWords = (frozen) =>
  frozen
    .replaceAll(
      "in Austin, TX has a website (confirmed) family-owned, reached by",
      "in Austin, TX: has a website (confirmed); family-owned; reached by",
    )
    .replaceAll("; reached by a checked email or a phone.", "; each with a checked email.")
    .replace('"name":"plumbers","asked"', '"name":"plumbers","category_key":"plumber","asked"')
    .replace('"cannotSee":null,', "");

/**
 * 9 Nov 2026 (the answers canvas, D4): a card's undo says what follows in a person's words. The fixture stays as it was made.
 */
export const withTheUndosWords = (frozen) =>
  frozen
    .replace(
      '"undo":"Sends 15 seconds after you approve; cancel within them"',
      '"undo":"Goes in 15 seconds. Undo stops it."',
    )
    .replace('"undo":"Delete it — nothing will run"', '"undo":"Delete it. Nothing goes out."')
    // And a send's card says how many it leaves out (its receipt reads it).
    .replace(/^(\{"kind":"broadcast".*?"count":\d+)\},"needs"/, '$1,"left_out":0},"needs"');

/**
 * 10 Oct 2026 (the moment spec, decision 19): the line a read says while it runs is a person's, so campaigns.playbooks
 * said "Reading the campaigns" where these bytes say "Reading the playbooks"; since the operator (15 Oct 2026) the two
 * reads say the Sequences page's words: the moments, and the lists and messages a send may use. The actions keep their
 * reads; the fixture stays as it was made.
 */
export const SEQUENCES_LABELS = {
  "Reading the playbooks": "Reading the moments",
  "Reading the lists and templates": "Reading the lists and messages",
};

export function withCampaignsLabel(want) {
  return want.label in SEQUENCES_LABELS ? { ...want, label: SEQUENCES_LABELS[want.label] } : want;
}

/**
 * 11 Oct 2026 (a one-off send honours the breath, fix round 3): the week's breath counts a message within a week either
 * side, one due included, so campaigns.playbooks' note says who waits in those words. The one sentence, once.
 */
export function withTheBreathsWords(frozen) {
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
export function withTheRunsBreath(frozen) {
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
export function withLastThirtyDays(frozen) {
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
export function againstOffered(got, frozen) {
  const g = JSON.parse(got);
  const w = JSON.parse(frozen);
  assert.deepEqual(
    g.triggers.map((t) => t.trigger),
    PLAYBOOK_TRIGGERS.filter((t) => momentOffered(t, { calendarOn: false })).map((t) => t.id),
    "the moments offered for a new playbook, retired ones left out",
  );
  for (const t of g.triggers) {
    const was = w.triggers.find((x) => x.trigger === t.trigger);
    // A moment offered since 7405e34b, with no calendar (a deal marked won, 22 Nov 2026): an occasion's, so it counts
    // nobody ahead of time and says so by its mark.
    if (!was) {
      assert.deepEqual(
        [t.trigger, t.each_at_their_own_time, "said_yes_now" in t || "can_be_sent_now" in t],
        ["deal_won", true, false],
        "the one moment offered since, counted for nobody",
      );
      continue;
    }
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
 * three messages it stores. 7 Nov 2026 (decision 0113): and Cold email after it, for the same reason; here
 * nothing is set, so each row is null, there are no claims, and an answer to a lead offers the booking link. Nothing
 * else moved.
 */
export function withHowItAnswers(frozen) {
  const answers = {
    tone: null,
    phone_greeting: null,
    phone_voice: "Tamsin",
    transfer_number: null,
    own_words: "Answer as the front desk of Harbor Moving: brief and warm.",
    messages: { greeting: "g", error: "e", non_text: "n" },
  };
  const rows = ["offer", "who_for", "fixes", "claims", "tone", "signed_by", "signature", "reply_offer"];
  const filled = { claims: [], reply_offer: "booking_link" };
  const reachOut = Object.fromEntries(rows.map((k) => [k, filled[k] ?? null]));
  const result = {};
  for (const [k, v] of Object.entries(JSON.parse(frozen))) {
    result[k] = v;
    if (k === "vision") Object.assign(result, { answers, reach_out: reachOut });
  }
  return JSON.stringify(result);
}

/**
 * 19 Oct 2026 (decision 0064): a sequence's mode is its own, so campaigns.playbooks says what a NEW sequence of each class
 * starts as (new_sequences_start_as: the rows the frozen answer called modes) and what each mode does to a batch in How
 * it runs' words, Never gone (a sequence is paused on its page) and a batch of new words waiting first. Each playbook says
 * its own mode; this world has none. Nothing else moved.
 */
/**
 * The moments' note as it reads since an occasion's moments are among them (10 Nov 2026): what their mark means. A deal
 * marked won is one of them since 22 Nov 2026.
 */
export function withOccasionsNote(frozen) {
  const said = JSON.parse(frozen);
  if (typeof said.note !== "string") return frozen;
  const before = "A null count means the page could not count it just now. ";
  const marks =
    "each_at_their_own_time marks a moment that names nobody ahead of time (two hours before a meeting, a meeting marked missed, the booking link sent and nothing booked, someone marked as a client): each person comes to it when that happens to them and its message goes then, so it has no count, and that is no fault. ";
  return JSON.stringify({ ...said, note: said.note.replace(before, before + marks) });
}

export function withEachSequencesMode(frozen) {
  const said = JSON.parse(frozen);
  if (!("modes" in said)) return frozen;
  const words = {
    auto: SEQUENCE_MODE_WORDS.auto.does,
    veto: SEQUENCE_MODE_WORDS.veto.does,
    ask: SEQUENCE_MODE_WORDS.ask.does,
    new_words:
      "a send of a step whose words are new to the owner (next_batch_asks_first) waits for their OK first, whatever the mode",
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
export const withTheHomes = (frozen) =>
  frozen
    .replaceAll('"route":"campaigns"', '"route":"campaigns/sequences"')
    .replaceAll('"route":"broadcasts"', '"route":"campaigns/sequences"');

/**
 * 19 Oct 2026 (decision 0064): a new campaign's card says what its batches do by the mode its sequence starts with, where
 * it said its class's mode and a run's wait; this world's Re-engage has no row, so its sequence asks before each batch.
 */
export const withTheSequencesStart = (frozen) =>
  frozen.replaceAll(
    "under “Re-engage” (ask): each run waits for you on Today.",
    "Each send waits for your approval (Re-engage).",
  );

/**
 * 30 Oct 2026 (the review of the live app, item 6): a campaign whose moment names nobody today says so in the moment's
 * words, where it said "0 people on the list said yes" of a day or a list with nobody on it. This world has nobody quiet.
 */
export const withNobodyNamed = (frozen) =>
  frozen.replaceAll("0 people on the list said yes to offers", "Nobody has gone quiet for 30 days");
