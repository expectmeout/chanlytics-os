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
const { PROPOSAL_SPECS, roleAtLeast } = await import("@chanlytics/contracts");
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
      number_e164: "+19295550100",
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

/** A card's id is minted per call; everything else is the card. */
const withoutId = (s) => s.replace(/"id":"p-[0-9a-z]+-[0-9a-z]+",?/g, "");

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

/** The old tools that read the threads through the conversations reader (readers/conversations.ts). */
const THROUGH_THE_HUNDRED = new Set(["get_today", "list_threads"]);

/** An old name as a refusal now says it: the tool, and its action in words. */
const inWords = (to) => (to.includes(".") ? to.replace(".", " with action ") : to);

/** What the registry at 7405e34b answered for each call, frozen from the old names before they went. */
const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tooling/scripts/tests/fixtures/ask-tool-results-7405e34b.json"), "utf8"),
);

test("the mapping names every old tool once, each to a tool and action the registry has", () => {
  assert.equal(Object.keys(NAMES).length, 26, "the twenty-six old tools");
  assert.equal(new Set(Object.values(NAMES)).size, 26, "each to its own name.action");
  assert.deepEqual(
    [...new Set(CASES.map(([old]) => old))].sort(),
    Object.keys(NAMES).sort(),
    "every old tool is called here at least once",
  );
});

test("every old tool's call, made by its new name and action, answers the bytes the old tool answered at 7405e34b, and makes the same reads", async () => {
  assert.equal(FIXTURE.length, CASES.length, "one frozen answer per call");
  for (let i = 0; i < CASES.length; i++) {
    const [old, input, role = "owner"] = CASES[i];
    const { call: frozen, ...want } = FIXTURE[i];
    assert.deepEqual(frozen, [old, input, role], `case ${i} is the call the fixture froze`);
    const call = renamed(old, input);
    const got = await answer(call.name, call.input, role);
    // A refusal that named an old tool names its new one: the one change to the bytes, applied to every old name.
    let result = want.result;
    for (const [from, to] of Object.entries(NAMES))
      result = result.replace(new RegExp(`\\b${from}\\b`, "g"), inWords(to));
    // An action above the caller is refused by the registry first since PR 4.3 (the Phase 4 plan, D2), in its words,
    // before anything is read, as its builder refused it: the other change to these bytes.
    const act = ACT_DEFS.find((x) => x.name === call.name)?.actions[call.input.action ?? ""];
    const needs = act && call.input.action ? PROPOSAL_SPECS[act.kind].needs : null;
    if (needs && !roleAtLeast(role, needs))
      result = JSON.stringify({ error: `${call.name}: action ${call.input.action} is ${WHOSE[needs]}` });
    // The threads' messages are one call since 00235: the conversations reader read the table a page at a time, and
    // reads each thread's newest through newest_messages. The old tools that read through it made that read, and no
    // other of the table: the one change to the reads, with the bytes unchanged.
    const reads = THROUGH_THE_HUNDRED.has(old)
      ? want.reads.map((r) => (r === "messages.select" ? "rpc:newest_messages" : r))
      : want.reads;
    assert.deepEqual(got, { ...want, result, reads }, `${old} -> ${NAMES[old]} ${JSON.stringify(input)}`);
  }
});
