/**
 * The world the tests of turn/ share: the assistant's turn, executed without a model, its rounds scripted through\nthe
 * ports the loop takes, the read tools and proposal builders run against the database in memory. Split by
 * behaviour\nfrom ask/turn/ on 25 Nov 2026 (layer 14: a test file over 1,600 lines is two files); its header,
 * as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The assistant's turn, executed without a model.
 *
 * runAskTurn is the loop: the page's context, the rounds, the reads in parallel,
 * the proposals, the answer, and every way a turn ends without one. Every
 * door around it was executed; the turn itself was read for its text. Here
 * the model round is scripted through the ports the loop now takes (the move
 * whatsapp/ports.ts made for the receptionist's handler), the read tools and
 * the proposal builders run for real against the database in memory, and
 * the round's own gathering runs on a fake event stream.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../../_log-lines.mjs";
import { SERIES } from "../../reports/people/_people-world.mjs";
import {
  CAMPAIGNS as SALON_SENDS,
  NOW as SALON_NOW,
  SERIES as SALON_WINDOW,
  STUCK as SALON_STUCK,
} from "../../reports/campaigns/_campaign-world.mjs";
import { v1FromAnswer } from "@chanlytics/contracts";

/**
 * A tool's result as the model was sent it, read back: the tool's own JSON inside a fence (round.ts resultBlocks,
 * cross-page.ts readBlock). Fails when it was sent bare.
 */
export function fromRecord(sent) {
  assert.ok(sent.startsWith("<record>\n") && sent.endsWith("\n</record>"), `fenced: ${String(sent).slice(0, 40)}`);
  return JSON.parse(sent.slice("<record>\n".length, -"\n</record>".length));
}

// The turns here are the text path's, the answer written as its format (ASK_ANSWER_TOOL off): the tool is on by
// default since its eval pair (17 Oct 2026), and its own tests below switch it on (withAnswerTool).
process.env.ASK_ANSWER_TOOL = "off";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

delete process.env.ASK_MODEL;

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { runAskTurn } = await import(at("apps/dashboard/src/server/ask/loop/loop.ts"));

export const { askPorts } = await import(at("apps/dashboard/src/server/ask/loop/turn-head.ts"));

export const { foldHistory, storedRaw, findThreadForTurn } = await import(
  at("apps/dashboard/src/server/ask/memory.ts")
);

export const { dropFor } = await import(at("apps/dashboard/src/server/ask/refusals.ts"));

export const { runRound, replayBlocks } = await import(at("apps/dashboard/src/server/ask/round.ts"));

export const { runTool, newToolContext, buildProposal, toApiTools, ACT_TOOL_NAMES, READ_DEFS, ACT_DEFS } = await import(
  at("apps/dashboard/src/server/ask/tools/index.ts")
);

// The tools as the loop offers them, sorted by name (D11), the acts among the reads: told apart by the act names the
// loop itself tells apart.
export const READ_TOOLS = toApiTools("owner", true).filter((t) => !ACT_TOOL_NAMES.has(t.name));

export const ACT_TOOLS = toApiTools("owner", true).filter((t) => ACT_TOOL_NAMES.has(t.name));

export const { scopedRead } = await import(at("apps/dashboard/src/server/ask/cross-page.ts"));

// The tools every question loads, the rest found by the tool search (the operator, D11).
export const { CORE_TOOLS } = await import(at("apps/dashboard/src/server/ask/tools/registry.ts"));

export const { turnWords, answerLine, askTurnText } = await import(
  at("apps/dashboard/src/server/ask/prompt/prompt.ts")
);

export const { workspaceFacts, stableSystem, ASK_RULES, ASK_EXAMPLES } = await import(
  at("apps/dashboard/src/server/ask/prompt/stable-system.ts")
);

/** The listening line, as prompt.ts writes it (the voice door, spec 2026-10-03 §3.4): pinned here, word for word. */
export const SPOKEN_LINE =
  "They are listening, not reading. Open with a short clause and a comma, then what matters first in one breath, in say.headline; say.detail may run to three short sentences when they asked for a summary, a reason or detail, and is empty otherwise. Say a name as a name and a time or a count as the page shows it; never an id, a route, a symbol, a bracketed tag or formatting: no headings, bold or tables, plain sentences only. Every figure and row goes in show, where the screen draws it; a list goes in show.list, whose entries are read after the say, one by one, so keep each short.";

export const { GatewayRefused } = await import(at("apps/dashboard/src/server/shared/model/gateway.ts"));

export const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/shared/reader.ts"));

export const workspaceReads = await import(at("apps/dashboard/src/server/readers/facts.ts"));

export const { report: reportReader } = await import(at("apps/dashboard/src/server/readers/report.ts"));

export const personRoute = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

export const templatesRoute = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));

export const { playbooks: playbooksReader } = await import(at("apps/dashboard/src/server/readers/playbooks.ts"));

// The workspace's facts are kept across turns in the module: each test starts with none kept.
beforeEach(() => readerCache.clear());

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

export const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

export const P1 = "abababab-abab-4aba-8aba-abababababa1";

export const M1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

export const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5";

export const K1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc9";

export const K2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc8";

export const TPL = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";

export const TPL2 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

export const USER = "u1";

export const TZ = "America/New_York";

/** A Monday at 10:00 in New York. */
export const NOW = new Date("2026-09-14T14:00:00Z");

export const iso = (ms) => new Date(ms).toISOString();

export const contact = {
  id: P1,
  display_name: "Rosa",
  wa_profile_name: null,
  phone_e164: "+15555550100",
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
  // nothing has come to is a first message's, and the reply card asks more of it (conversations/reply-window.test.mjs).
  last_inbound_at: iso(NOW.getTime() - 3600_000),
  last_inbound_on_whatsapp: iso(NOW.getTime() - 3600_000),
  last_message_at: iso(NOW.getTime() - 3600_000),
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
  created_at: iso(NOW.getTime() - 3600_000),
  channel_ts: iso(NOW.getTime() - 3600_000),
  channel: "whatsapp",
  ...over,
});

export const call = (id, over = {}) => ({
  id,
  tenant_id: A,
  retell_call_id: "r1",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+19295550100",
  started_at: iso(NOW.getTime() - 7200_000),
  ended_at: iso(NOW.getTime() - 7000_000),
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
  transcript_object: [],
  recording: null,
  conversation_id: C1,
  contact_id: P1,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" },
  ...over,
});

// The workspace has a WhatsApp number unless a test says otherwise (step 3): a campaign is counted by the channels the
// workspace can send on, and with no number nobody can be sent a broadcast.
/**
 * The workspace's WhatsApp number: not a US one, since Meta's pause on marketing messages to US numbers (contracts
 * whatsapp-offers.ts) would hold every offer these turns count and propose; the one turn about the pause gives a US number.
 */
export const WHATSAPP_NUMBER = {
  id: "ch-wa-base",
  tenant_id: A,
  kind: "whatsapp",
  number_e164: "+442079460958",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
};

export function tables(over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    tenants: [{ id: A, name: "Harbor", timezone: TZ }],
    tenant_config: [
      {
        tenant_id: A,
        config: {
          brain: {
            business_name: "Harbor Moving",
            booking_link: "https://book.example/harbor",
            system_prompt: "Answer as the front desk of Harbor Moving: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: { hours: { mon: { open: "09:00", close: "17:00" } } },
          },
        },
        version: 1,
      },
    ],
    tenant_channels: [WHATSAPP_NUMBER],
    policies: [],
    conversations: [conversation(C1)],
    escalations: [],
    messages: [message(M1, C1)],
    calls: [call(K1)],
    contacts: [{ ...contact, tenant_id: A, erased_at: null }],
    templates: [],
    segments: [],
    segment_members: [],
    playbooks: [],
    ...over,
  };
}

export const RPCS = {
  people_list: () => [],
  // Leads' Back today (00426): nobody asked to hear back today.
  leads_back_today: () => [],
  // The Sequences page's list (00442 sequence_overview): a workspace with none answers none.
  sequence_overview: () => [],
  metrics_summary: () => ({ error: "not modelled here" }),
  report_series: () => ({ error: "not modelled here" }),
  // The Reviews lens's ledger (readers/report.ts reviewsReport), which the report tool reads beside the series: no review on
  // record. The fake's refusal of a door nobody modelled would be caught into the tool's `error`, and say so.
  reviews_ledger: (a) => ({
    timezone: TZ,
    today: "2026-09-14",
    days: a.p_days,
    on_record: { profile: 0, places: 0, complete: false },
    written: [],
    waiting_total: 0,
    waiting: [],
  }),
  // The rail's counts (server/leads/searches.ts listAudienceCounts), so Today's searches read as none inside a turn rather
  // than as a read that failed: the fake's refusal of an unmodelled door must never be caught into a quiet null.
  lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
};

export const ctxFor = (t = tables(), rpcs = RPCS, faults = {}) => ({
  supabase: fakeDb(t, faults, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

export const ROUND = (blocks, extra = {}) => ({ blocks, stopReason: "tool_use", streamError: null, ...extra });

export const NONE = { kind: "none", id: "", label: "" };

/** The answer's JSON as the model writes it (ASK_ANSWER_FORMAT): nothing but Say unless `over` sets a part. */
export const answerJson = (headline, over = {}) =>
  JSON.stringify({
    say: { headline, detail: "", ...over.say },
    show: { figures: [], items: [], breakdown: { label: "", total: 0, parts: [], source: NONE }, ...over.show },
    do: { open: { source: NONE, label: "", now: false }, next: [], ...over.do },
    language: over.language ?? "en",
  });

export const prose = (text) => ({ type: "text", id: "", name: "", text, json: "" });

/** The answer is a text block of that JSON. */
export const answer = (headline, over) => prose(answerJson(headline, over));

/** A call as the model writes it; its id by default the name the turn records for it (`name.action`). */
export const tool = (name, input, id = `t-${input?.action ? `${name}.${input.action}` : name}`) => ({
  type: "tool_use",
  id,
  name,
  text: "",
  json: JSON.stringify(input),
});

/** The model, scripted: each call takes the next round; the requests are kept for the assertions. */
export function scripted(rounds) {
  const requests = [];
  const round = async (c, onText, onInput) => {
    requests.push(c.request);
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText, onInput) : r;
  };
  return { round, requests };
}

/**
 * What the turn logged under one event name, while `fn` ran: each logger line's fields (src/server/shared/log.ts) as JSON,
 * the envelope and the stacks left out.
 */
export async function logged(event, fn) {
  const lines = [];
  const was = { warn: console.warn, error: console.error };
  console.warn = console.error = (...args) => {
    const line = logLineOf(args);
    if (line?.event === event) lines.push(JSON.stringify(fieldsOf(line)));
  };
  try {
    return { result: await fn(), lines };
  } finally {
    console.warn = was.warn;
    console.error = was.error;
  }
}

/** A page's context as the server builds it (server/ask/context.ts): the page's aggregate, then a row. */
export const BUILT = {
  blocks: [
    {
      type: "search_result",
      source: "page://today",
      title: "Today",
      content: [{ type: "text", text: "Today: 2 need you" }],
      citations: { enabled: false },
    },
  ],
  refs: [{ kind: "page", id: "today", route: "today", label: "Today" }],
  rows: 0,
  chars: 30,
  stamp: 1,
  failed: false,
  warm: "hit",
};

/** A page context as the tab sends it (contracts PageContext). */
export const PAGE = { v: 1, surface: "today", route: "today", view: null, focus: null, rows: [], asked_at: 1 };

export const ports = (round, extra = {}) => ({
  round,
  context: async () => BUILT,
  shape: async () => "The workspace: Harbor · zone America/New_York",
  tool: runTool,
  propose: buildProposal,
  ...extra,
});

export function turn(ctx, over = {}) {
  const events = [];
  const input = {
    ctx,
    tenantId: A,
    role: "operator",
    facts: workspaceFacts("Harbor", TZ, ctx.supabase ? null : null, NOW, []),
    timezone: TZ,
    personLabel: "ada@example.com (operator)",
    language: "en",
    scope: null,
    surface: "today",
    history: [],
    text: "Who needs me?",
    emit: (ev) => events.push(ev),
    now: NOW,
    ...over,
  };
  return { input, events };
}

/** The person's turn a request asks: the question's message, the turn's words after it as the operator's (memory.ts questionIn). */
export const askedOf = (req) => req.messages.findLast((m) => m.role === "user");

/** The owner, who adds someone to People by hand (a person's card, propose_person's action add; once an invitation). */
export const AN_OWNER = { role: "owner", personLabel: "ada@example.com (owner)" };

/** Ada added to People by hand, and an address that is none: the card these tests make, and the one refused. */
export const ADD_ADA = { action: "add", email: "ada@example.com", name: "Ada" };

export const ADD_NOBODY = { action: "add", email: "not-an-address", name: "Ada" };

/** A model stream as the gateway reads it: it runs until the signal it was given ends it. */
export const cutBy = (signal) =>
  new Promise((r) => (signal.aborted ? r() : signal.addEventListener("abort", r, { once: true })));

/** What the gateway throws for a request whose signal ended before it was answered (gateway.ts streamModel). */
export const unreached = () => new GatewayRefused({ kind: "unreachable", message: "This operation was aborted" });

/* ------------------------------------------------------------------------ the Campaigns lens, said (C4, task 16) */

/**
 * Harbor's Campaigns lens as the fold, the reader and the page share it (reports/campaigns/_campaign-world.mjs): 240
 * messages to 180 people over 14 runs, three runs waiting for an OK, a good WhatsApp number. The turn's clock is the world's
 * own (noon on Fri 4 Sep 2026 at Harbor), since what is stuck is judged at it.
 */
export const SALON_TODAY = SALON_WINDOW.today;

export const salonRpcs = (over = {}) => ({
  ...RPCS,
  report_series: (a) => ({
    timezone: TZ,
    days: a.p_days,
    span_days: a.p_days * 2,
    today: SALON_TODAY,
    series: [],
    reasons: {},
    reply_seconds: [],
    sentiments: {},
    voicemail: 0,
  }),
  campaign_series: () => SALON_SENDS,
  campaign_ledger: (a) => ({ ...SALON_WINDOW, end: a.p_end ?? SALON_WINDOW.end, days: a.p_days }),
  campaign_stuck: () => SALON_STUCK,
  ...over,
});

/** The WhatsApp number, rated good, whose rating Meta last said at six on that Friday morning. */
export const salonTables = () =>
  tables({
    tenant_channels: [
      { ...WHATSAPP_NUMBER, config: { ...WHATSAPP_NUMBER.config, quality_read_at: "2026-09-04T10:00:00.000Z" } },
    ],
  });

/** One report call over the salon: the tool as the model calls it, its answer parsed. */
export async function salonReport(rpcs, input = { period: "30d" }) {
  const tc = newToolContext(ctxFor(salonTables(), rpcs), A, "owner", TZ, new Date(SALON_NOW));
  const out = await runTool(tc, { name: "report", input });
  assert.equal(out.isError, false, out.result);
  return JSON.parse(out.result);
}

/** A function the database does not have yet, as PostgREST refuses a call to it. */
export const functionGone = (signature) => () => {
  throw Object.assign(new Error(`Could not find the function public.${signature} in the schema cache`), {
    code: "PGRST202",
  });
};

/** A figure as Ask says it (the page's label, value, meta and its change, the figure's own `compare`). */
export const saidFigure = (x) => ({ label: x.label, value: x.value, meta: x.meta, change: x.compare });

/* ------------------------------------------------------------ the People lens (Reports, C3) */

export const PEOPLE_DAY = 86_400_000;

/**
 * A person as people_list answers it (ask/readers/'s book): wrote on WhatsApp `daysAgo` days before NOW, said yes to
 * messages and to offers on it, with nothing else open. `over` is what a case puts in the row.
 */
export const bookRow = (n, daysAgo, over = {}) => {
  const heard = iso(NOW.getTime() - daysAgo * PEOPLE_DAY);
  return {
    id: `k-${n}`,
    display_name: `Person ${n}`,
    wa_profile_name: null,
    phone_e164: `+1917555${String(n).padStart(4, "0")}`,
    email: null,
    consent: "opted_in",
    consent_source: "customer_message",
    consent_updated_at: heard,
    marketing_consent: "opted_in",
    marketing_consent_source: "form",
    marketing_consent_updated_at: heard,
    marketing_channels: ["whatsapp"],
    dnc: false,
    channels: ["whatsapp"],
    conversation_count: 1,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: `cv-${n}`,
    latest_state: "open",
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: heard,
    last_message_at: heard,
    last_message_direction: "inbound",
    last_message_sender: "customer",
    last_inbound_text: "Can I move Saturday to 11?",
    last_inbound_at: heard,
    last_call_at: null,
    last_inbound_call_at: null,
    call_count: 0,
    call_seconds: 0,
    first_contact_at: heard,
    earliest_row_at: heard,
    has_backfill: false,
    has_chat: true,
    message_channels: ["whatsapp"],
    queued_reply_at: null,
    ...over,
  };
};

/** The next step of a person, due on a day (the workspace's today is 14 Sep 2026): the member's own. */
export const stepDue = (id, on) => ({ step_id: id, step_body: "Call back", step_due_on: on, step_for_user_id: USER });

/** No yes to offers. */
export const NO_OFFERS = {
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  marketing_channels: [],
};

/**
 * Eight people, heard 1, 2, 3, 10, 40, 70, 20 and 120 days before NOW: the first six have a step a day past, the seventh
 * one due today, the first three said yes to offers, the second reaches Harbor by WhatsApp and by phone, and the last asked
 * to stop.
 */
export const BOOK = [
  bookRow(1, 1, stepDue("s1", "2026-09-12")),
  bookRow(2, 2, { ...stepDue("s2", "2026-09-12"), channels: ["whatsapp", "voice"] }),
  bookRow(3, 3, stepDue("s3", "2026-09-13")),
  bookRow(4, 10, { ...NO_OFFERS, ...stepDue("s4", "2026-09-12") }),
  bookRow(5, 40, { ...NO_OFFERS, ...stepDue("s5", "2026-09-01") }),
  bookRow(6, 70, { ...NO_OFFERS, ...stepDue("s6", "2026-09-10") }),
  bookRow(7, 20, { ...NO_OFFERS, ...stepDue("s7", "2026-09-14") }),
  bookRow(8, 120, { ...NO_OFFERS, consent: "opted_out" }),
];

/** The counts of that book, by hand: eight live people, seven with a yes, three with a yes to offers, three quiet. */
export const BOOK_NOW = {
  people: 8,
  fresh: { under_7: 3, d7_30: 2, d31_60: 1, d61_90: 1, d91_up: 1, never: 0 },
  lists: { opted_in: 7, offers_ok: 3, opted_out: 1, quiet: 3 },
  steps: { overdue: 6, due_today: 1 },
  email_stopped: 0,
  wires: { whatsapp_only: 7, sms_only: 0, phone_only: 0, email_only: 0, several: 1, none: 0 },
};

/** What people_series answers (00395) for the days asked, as the database says it: SERIES's counts, or `over` in their place. */
export const peopleSeriesFor = (a, over = {}) => ({
  ...SERIES,
  timezone: TZ,
  today: "2026-09-14",
  days: a.p_days,
  ...over,
});

export const PEOPLE_GONE = Object.assign(
  new Error("Could not find the function public.people_series(p_days, p_tenant_id) in the schema cache"),
  { code: "PGRST202" },
);

/** A person as people_list returns them: the reads map them through toPersonRowVM, as the page's bridge does. */
export const peopleListRow = (over) => ({
  display_name: null,
  wa_profile_name: null,
  phone_e164: null,
  email: null,
  consent: "opted_in",
  consent_source: "desk",
  consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
  marketing_consent: null,
  marketing_consent_source: null,
  marketing_consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: null,
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: null,
  last_message_at: iso(NOW.getTime() - 3 * 86_400_000),
  last_message_direction: "inbound",
  last_message_sender: "client",
  last_inbound_text: "Thanks!",
  last_inbound_at: iso(NOW.getTime() - 3 * 86_400_000),
  last_call_at: null,
  last_outbound_call_at: null,
  last_inbound_call_at: null,
  created_at: iso(NOW.getTime() - 40 * 86_400_000),
  ...over,
});

export const ANA = "cccccccc-cccc-4ccc-8ccc-cccccccccca1";

export const LUIS = "cccccccc-cccc-4ccc-8ccc-cccccccccca2";

export const ROSA = "cccccccc-cccc-4ccc-8ccc-cccccccccca3";

/** Three answers: a yes to offers with no number, a number with a yes to messages only, and a number with both. */
export const threeAnswers = () => {
  const yesToOffers = {
    marketing_consent: "opted_in",
    marketing_consent_source: "customer_message",
    marketing_consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
  };
  return [
    // Wrote in by email and said yes to both there: an address, and no number.
    peopleListRow({
      id: ANA,
      display_name: "Ana Reyes",
      email: "ana@example.com",
      channels: ["email"],
      consent_source: "customer_message",
      ...yesToOffers,
    }),
    // A number, and a yes to messages only.
    peopleListRow({ id: LUIS, display_name: "Luis Mora", phone_e164: "+15555550101" }),
    // A number, and a yes to both: the one an offer reaches.
    peopleListRow({ id: ROSA, display_name: "Rosa Diaz", phone_e164: "+15555550102", ...yesToOffers }),
  ];
};

/**
 * The operator stress run's workspace (15 Oct 2026): a US WhatsApp number, where Meta has paused offers (contracts
 * whatsapp-offers.ts), and 26 people, each with a number and both yeses. People said 26 had said yes to offers; Ask said 0.
 */
export const usNumberWorld = () => {
  const people = Array.from({ length: 26 }, (_, i) =>
    peopleListRow({
      id: `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`,
      display_name: `Person ${i + 1}`,
      phone_e164: `+155555501${String(i).padStart(2, "0")}`,
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: iso(NOW.getTime() - 20 * 86_400_000),
    }),
  );
  const t = tables({
    tenant_channels: [{ ...WHATSAPP_NUMBER, number_e164: "+19295550198" }],
    templates: [
      {
        id: TPL,
        tenant_id: A,
        channel: "whatsapp",
        name: "saturday_hours",
        language: "en",
        meta_status: "approved",
        category: "MARKETING",
        variables: [],
        body_preview: "We are open Saturday 9 to 5.",
        hidden_at: null,
      },
    ],
  });
  return newToolContext(ctxFor(t, { ...RPCS, people_list: () => people }), A, "owner", TZ, NOW);
};

export const M2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

/** metrics_summary as 00037_hygiene.sql returns it: a calm day with one message and one call. */
export const METRICS = {
  workspace: { name: "Harbor", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+19295550100" }],
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 1,
    last_inbound_at: null,
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
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 200,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};

/* ------------------------------------------------------------------------ the pool, once a turn (PR 1.6) */

/** An approved offer to everyone, with no values to fill. */
export const OFFER = {
  id: TPL,
  tenant_id: A,
  channel: "whatsapp",
  name: "fall_offer",
  language: "en",
  meta_status: "approved",
  category: "MARKETING",
  variables: [],
  body_preview: "20% off this week.",
  hidden_at: null,
};

/* ------------------------------------------------- the three tools read what the pages read (PR 1.6) */

/**
 * Luis waits on a person; Rosa, whose WhatsApp name is Rosi, was last heard from six weeks ago. people_list as the
 * database answers p_query (00125): a name, a WhatsApp name or an address, or three digits of the number.
 */
export const twoPeople = () => [
  peopleListRow({
    id: LUIS,
    display_name: "Luis Mora",
    phone_e164: "+15555550101",
    latest_conversation_id: C1,
    needs_human: true,
    open_escalation_reason: "human_token",
    open_escalation_since: iso(NOW.getTime() - 3_600_000),
  }),
  peopleListRow({
    id: ROSA,
    display_name: "Rosa Diaz",
    wa_profile_name: "Rosi",
    phone_e164: "+15555550182",
    latest_conversation_id: C2,
    last_message_at: iso(NOW.getTime() - 45 * 86_400_000),
    last_inbound_at: iso(NOW.getTime() - 45 * 86_400_000),
  }),
];

export const peopleListMatching = (rows) => (a) => {
  if (a.p_tenant_id !== A) return [];
  if (!a.p_query) return rows;
  const q = a.p_query.toLowerCase();
  const digits = q.replace(/\D/g, "");
  return rows.filter(
    (r) =>
      [r.display_name, r.wa_profile_name, r.email].some((v) => (v ?? "").toLowerCase().includes(q)) ||
      (digits.length >= 3 && (r.phone_e164 ?? "").replace(/\D/g, "").includes(digits)),
  );
};

/** The workspace's contacts behind the rows, for the page's count of who matches. */
export const contactsOf = (rows) =>
  rows.map((r) => ({
    id: r.id,
    tenant_id: A,
    display_name: r.display_name,
    wa_profile_name: r.wa_profile_name,
    email: r.email,
    phone_e164: r.phone_e164,
    erased_at: null,
  }));

/** The workspace's WhatsApp number, with the quality Meta assigned it, and its line. */
export const CHANNELS = [
  {
    id: "ch-wa",
    tenant_id: A,
    kind: "whatsapp",
    number_e164: "+19295550199",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    config: { quality_rating: "YELLOW", messaging_limit: "TIER_1K" },
  },
  {
    id: "ch-voice",
    tenant_id: A,
    kind: "voice",
    number_e164: "+19295550100",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    config: {},
  },
];

/** A search as lead_searches_view answers it: one round, stopped to ask the owner a question. */
export const WAITING_SEARCH = {
  id: "55555555-5555-4555-8555-555555555551",
  tenant_id: A,
  created_by: USER,
  card: "local_businesses",
  name: "Personal trainers in Austin",
  asked: "find me 200 personal trainers in Austin",
  via: "ask",
  plan: { version: 1, count: 200 },
  removed_at: null,
  created_at: "2026-09-12T15:00:00Z",
  round_id: "66666666-6666-4666-8666-666666666661",
  seq: 1,
  purpose: "probe",
  state: "waiting_on_owner",
  ending: null,
  question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterionKey: "chains" },
  answered: null,
  target: 200,
  plan_version: 1,
  cost_usd: 0.4,
  qualified: 20,
  review: 2,
  excluded: 3,
  counted: 20,
  judge_tokens: 900,
};

/* ------------------------------------------------ the turn reads the page (the Phase 2 plan, PR 2.4) */

/** The page as the server built it, with one row a citation may name. */
export const builtWith = (refs = [], rows = []) => ({
  ...BUILT,
  blocks: [
    ...BUILT.blocks,
    ...rows.map((id) => ({
      type: "search_result",
      source: `thread://${id}`,
      title: "Rosa",
      content: [{ type: "text", text: "Rosa · needs you · route: inbox/th-" + id }],
      citations: { enabled: false },
    })),
  ],
  refs: [...BUILT.refs, ...refs],
  rows: rows.length,
});

/** Where a request carries the cache's markers (the Phase 5 plan, D10): each marked block's place, in request order. */
export const markersOf = (req) => [
  ...req.system.flatMap((b, i) => (b.cache_control ? [`system.${i}`] : [])),
  ...(req.tools ?? []).flatMap((t, i) => (t.cache_control ? [`tools.${i}`] : [])),
  ...req.messages.flatMap((m, i) =>
    Array.isArray(m.content) ? m.content.flatMap((b, j) => (b.cache_control ? [`messages.${i}.${j}`] : [])) : [],
  ),
];

/**
 * A request's messages less the cache's markers it carried (D10): the markers ride on each request's own copy, never on
 * the turn's messages, so what the turn keeps of a request (its raw) is these.
 */
export const unmark = (messages) =>
  messages.map((m) =>
    Array.isArray(m.content) ? { ...m, content: m.content.map(({ cache_control: _cc, ...b }) => b) } : m,
  );

/* ------------------------------------------- the turn as the model was sent it (the Phase 5 plan, PR 5.3) -- */

/**
 * The model, scripted, keeping each request as it was sent: its bytes, read back. `scripted` keeps the request itself,
 * whose messages the loop goes on appending to after it was sent.
 */
export function sentAs(rounds) {
  const requests = [];
  const round = async (c, onText) => {
    requests.push(JSON.parse(JSON.stringify(c.request)));
    const r = rounds.shift();
    if (!r) throw new Error("the loop asked for a round the script does not have");
    return typeof r === "function" ? r(c, onText) : r;
  };
  return { round, requests };
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * The prefix a request says (the Phase 5 plan, D2): the sha256 of what it sent besides its messages that a replay needs
 * unchanged -- system and tools as sent, the tool choice, and the output config (the effort and the answer's format).
 */
export const prefixOf = (request) =>
  sha256(
    JSON.stringify({
      system: request.system,
      tools: request.tools,
      tool_choice: request.tool_choice,
      output_config: request.output_config,
    }),
  );

/**
 * The raw turn as a turn's requests say it: the last request's messages before the question, the question, and after
 * it -- the question is the first request's last person's turn, the turn's words after it, and a later round only
 * appends -- less the cache's markers the request carried (D10), its model and its prefix.
 */
export function rawOf(requests) {
  const last = requests.at(-1);
  const messages = unmark(last.messages);
  const at = requests[0].messages.findLastIndex((m) => m.role === "user");
  return {
    base: messages.slice(0, at),
    question: messages[at].content,
    rounds: messages.slice(at + 1),
    model: last.model,
    prefix: prefixOf(last),
  };
}

/** The messages a request was sent, as the turn keeps them: less the cache's markers (D10). */
export const sentOf = (request) => unmark(request.messages);

/** The same bytes: what JSON would store, key for key and in order. */
export const sameBytes = (a, b, why) => assert.equal(JSON.stringify(a), JSON.stringify(b), why);

/** A raw turn's messages put back together: the last request's, byte for byte, when the raw is what was sent. */
export const messagesOf = (raw) => [...raw.base, { role: "user", content: raw.question }, ...raw.rounds];

export const thinking = (signature, words = "") => ({
  type: "thinking",
  id: "",
  name: "",
  text: "",
  json: "",
  thinking: words,
  signature,
});

export const redacted = (data) => ({ type: "redacted_thinking", id: "", name: "", text: "", json: "", data });

/* ------------------------------------------------------------ the live replay (the Phase 5 plan, PR 5.4) -- */

export const T9 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd9";

/**
 * A thread in the database in memory, beside the harness's tables: its turns' content kept as jsonb keeps it (every
 * object's keys reordered), as the ask route writes and reads them.
 */
export function threadWorld() {
  const now = iso(Date.now());
  const world = tables({
    ask_threads: [
      { id: T9, tenant_id: A, user_id: USER, title: "Who needs me?", scope: null, last_at: now, created_at: now },
    ],
    ask_messages: [],
  });
  const db = fakeDb(world, {}, RPCS, { jsonb: ["ask_messages.content"] });
  return { world, ctx: { supabase: db, userId: USER, email: "ada@example.com", params: {} } };
}

/**
 * A turn kept as the ask route keeps it: the question's row, then the answer's, with its shape and the turn as it was
 * sent (storedRaw); `over` sets the answer's content, `raw` its raw's scalars, `created_at` when it was saved.
 */
export async function keep(ctx, text, r, { over = {}, raw = {}, created_at } = {}) {
  const row = (role, content) => ({ thread_id: T9, tenant_id: A, user_id: USER, role, content });
  // The question is saved before its answer, whenever that was.
  const asked = created_at ? { created_at: iso(Date.parse(created_at) - 1_000) } : {};
  await ctx.supabase.from("ask_messages").insert({ ...row("user", { text }), ...asked });
  const stored = r.raw ? { ...storedRaw(r.raw), ...raw } : null;
  const content = {
    v: 2,
    text: r.text,
    proposals: r.proposals,
    failed: r.failed,
    shape: r.shape,
    raw: stored,
    ...over,
  };
  const { data } = await ctx.supabase
    .from("ask_messages")
    .insert({ ...row("assistant", content), ...(created_at ? { created_at } : {}) })
    .select("id")
    .single();
  return data.id;
}

/**
 * The thread's next turn as the route asks it: what findThreadForTurn read from the rows -- its history, its chain and the
 * rest the route spreads into the turn -- then run.
 */
export async function nextTurn(ctx, rounds, over = {}, portsOver = {}) {
  const text = over.text ?? "And tomorrow?";
  const found = await findThreadForTurn(ctx, { tenantId: A, threadId: T9, text, scope: undefined, answering: null });
  const { thread: _thread, scope: _scope, ...earlier } = found;
  const s = sentAs(rounds);
  const input = turn(ctx, { text, ...earlier, ...over }).input;
  const { result: r } = await logged("ask_", () => runAskTurn(input, ports(s.round, portsOver)));
  return { r, s, found };
}

/** How often a turn's rows had a raw turn read: never for a thread its rows already say is cold. */
export const rawReads = (ctx) =>
  ctx.supabase.seen.filter((q) => q.table === "ask_messages" && q.op === "select" && /\braw\b/.test(q.columns)).length;

/**
 * A thread whose chain is two turns long, both kept as the route keeps them: the base, then a live turn that replayed
 * it -- the database's rows, the caller, and the two answers' ids.
 */
export async function twoTurnChain() {
  const { world, ctx } = threadWorld();
  const r1 = await runAskTurn(turn(ctx).input, ports(sentAs([ROUND([answer("One.")])]).round));
  const base = await keep(ctx, "Who needs me?", r1);
  const t2 = await nextTurn(ctx, [ROUND([answer("Two.")])]);
  assert.equal(t2.r.shape.replay, "live");
  return { world, ctx, base, second: await keep(ctx, "And?", t2.r) };
}

/**
 * A reply's card, as the harness's model proposes it: approving one sends a reply and leaves system as it was, so the
 * next turn can stay live -- where an autonomy or a settings card's approval changes system (its policies and settings
 * ride in it), and the next turn is cold by D2.
 */
export const replyCard = (id, to) => ({
  id,
  kind: "reply",
  needs: "operator",
  title: `Reply to ${to}`,
  summary: "We open at nine on Saturday.",
  payload: { conversation_id: C1, text: "We open at nine on Saturday." },
  undo: null,
});

/** The model proposes these cards in turn, one a call: each call gets the next. */
export const proposing = (...cards) => {
  let n = 0;
  return async () => {
    const card = cards[n++];
    return { proposal: card, result: JSON.stringify({ proposed: true, id: card.id }), isError: false };
  };
};

export const draft = tool("propose_reply", {
  action: "draft",
  conversation_id: C1,
  text: "We open at nine on Saturday.",
});

export const SINCE = "Since the last answer, the person acted on cards from earlier in this conversation:";

/** The words a request's question carries, line by line. */
export const wordsLines = (req) =>
  req.messages
    .at(-1)
    .content.find((b) => b.text?.includes("You are speaking with"))
    .text.split("\n");

/** The API's refusal of a replayed thinking block bound to another conversation (model-migration.md, the binding). */
export const BOUND =
  '400 messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block". That setting requires the `thinking-binding-controls-2026-08-01` value in the `anthropic-beta` header.';

/* ------------------------------------------------------------ the cold rebuild (the Phase 5 plan, PR 5.5) -- */

/** A stored answer as the Line reads it back (store.ts toMessageVM): the answer, or the v1 fields alone before it. */
export const answered = (over = {}) => ({
  id: "m-1",
  role: "assistant",
  text: "",
  at: "",
  at_ms: 0,
  citations: [],
  followups: [],
  navigate: null,
  proposals: [],
  language: "en",
  ungrounded: false,
  tools: [],
  latency_ms: null,
  rounds: null,
  failed: false,
  ...over,
});

/** A structured answer as normalizeAnswer leaves it: its headline, its detail, its items, each grounded, and its list. */
export const shaped = (headline, { detail = "", items = [], list = { style: "bullets", entries: [] } } = {}) => ({
  v: 2,
  form: "structured",
  say: { headline, detail },
  show: { figures: [], items, breakdown: null, list },
  do: { open: null, next: [] },
  language: "en",
});

export const itemOf = (kind, id, label, to) => ({
  title: label,
  meta: "",
  line: "",
  source: { kind, id, label, to, door: true },
});

export const cardOf = (id, title, outcome = null, kind = "reply") => ({
  ...replyCard(id, "Rosa"),
  kind,
  title,
  outcome,
});

/** The history's cut for one turn (memory.ts HISTORY_CHARS): a line is never longer. */
export const TURN_CHARS = 1200;

/** A thread's rows as the ask route keeps them, oldest first: each turn its question's content, then its answer's. */
export async function seeded(turns) {
  const { world, ctx } = threadWorld();
  const row = (role, content) => ({ thread_id: T9, tenant_id: A, user_id: USER, role, content });
  for (const [question, reply] of turns) {
    await ctx.supabase.from("ask_messages").insert(row("user", question));
    if (reply) await ctx.supabase.from("ask_messages").insert(row("assistant", reply));
  }
  return { world, ctx };
}

export const threadNow = (ctx, text = "And now?") =>
  findThreadForTurn(ctx, { tenantId: A, threadId: T9, text, scope: undefined, answering: null });

/** An answer as the ask route stores one: the answer, the v1 fields it gives, its cards. */
export const storedAnswer = (a, proposals = []) => ({ v: 2, answer: a, ...v1FromAnswer(a), proposals, failed: false });

/* ---- the answer as a tool (ASK_ANSWER_TOOL, 15 Oct 2026): its input streams where text after a read does not ---- */

/** Runs `fn` with ASK_ANSWER_TOOL set to `value` (undefined: unset), as a deployment sets it, and puts it back. */
export async function withAnswerTool(value, fn) {
  const was = process.env.ASK_ANSWER_TOOL;
  if (value === undefined) delete process.env.ASK_ANSWER_TOOL;
  else process.env.ASK_ANSWER_TOOL = value;
  try {
    return await fn();
  } finally {
    if (was === undefined) delete process.env.ASK_ANSWER_TOOL;
    else process.env.ASK_ANSWER_TOOL = was;
  }
}

/** The answer tool's call, its input the answer's JSON (ASK_ANSWER_FORMAT). */
export const answerCall = (headline, over, id = "t-answer") => ({
  ...tool("answer", {}, id),
  json: answerJson(headline, over),
});

/** A round whose answer call is streamed into the loop as the API sends it: its input JSON in pieces of `step`. */
export const streamedAnswer =
  (call, step = 12) =>
  async (_c, _onText, onInput) => {
    const growing = { ...call, json: "" };
    for (let i = 0; i < call.json.length; i += step) {
      growing.json = call.json.slice(0, i + step);
      onInput(growing, []);
      await new Promise((r) => setTimeout(r, 60)); // past SAY_EVERY_MS, so each piece is said
    }
    return ROUND([call]);
  };
