/**
 * What the call was about, structured: the agent's analysis fields, their
 * drift check, the analysis riding the normalised call into the door, and
 * the words every surface uses — the caller's request first, the provider's
 * summary folded when that is all there is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_OUTCOMES,
  CALL_OUTCOME_WORDS,
  callOutcomeWords,
  tidyCallSummary,
  toCallVM,
  attentionRow,
  toPersonRowVM,
} from "@chanlytics/contracts";
import {
  normalizeCall,
  callSummaryLine,
  planAgentSettings,
  CALL_ANALYSIS_FIELDS,
  VOICE_WEBHOOK_EVENTS,
  getAgent,
} from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

// The workspace's zone: every view model says its times by it (contracts clock.ts).
const ZONE = "America/New_York";

const NOW = new Date("2026-09-06T16:00:00Z");
const nowMs = NOW.getTime();
const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();
const H = 3_600_000,
  D = 24 * H;

test("the words: six outcomes with a sentence each; a stranger's value has none; the provider's opening is folded, never rewritten", () => {
  assert.equal(CALL_OUTCOMES.length, 6);
  for (const o of CALL_OUTCOMES) assert.ok(CALL_OUTCOME_WORDS[o].length > 3, o);
  assert.equal(callOutcomeWords("booking_link_sent"), "Booking link sent");
  assert.equal(callOutcomeWords("nonsense"), null);
  assert.equal(callOutcomeWords(undefined), null);
  assert.equal(
    tidyCallSummary(
      "The user called Marisa's Beauty Salon to inquire about business hours, specifically for Tuesday, and asked about highlight services and pricing. The agent provided the hours.",
    ),
    "Called to inquire about business hours, specifically for Tuesday, and asked about highlight services and pricing. The agent provided the hours.",
  );
  assert.equal(
    tidyCallSummary("The user called Marisa's Beauty Salon and indicated they were testing the system."),
    "Called and indicated they were testing the system.",
  );
  assert.equal(
    tidyCallSummary("The agent greeted the caller and introduced itself."),
    "The agent greeted the caller and introduced itself.",
    "an opening we did not expect is kept",
  );
  assert.equal(tidyCallSummary("  asked  for\n a trim  "), "Asked for a trim");
  assert.equal(tidyCallSummary(""), null);
  assert.equal(tidyCallSummary(null), null);
});

test("the analysis rides the normalised call when it is an object, and the thread note leads with what the caller wanted", () => {
  const base = {
    call_id: "c1",
    call_status: "ended",
    direction: "inbound",
    duration_ms: 125_000,
    call_analysis: {
      call_summary: "The user called Marisa's Beauty Salon to book a gel manicure.",
      custom_analysis_data: {
        caller_wanted: " Asked for a gel manicure this Saturday around 10. ",
        outcome: "booking_link_sent",
        follow_up: "",
        caller_name: "Ana",
      },
    },
  };
  const n = normalizeCall(base);
  assert.deepEqual(n.analysis, base.call_analysis.custom_analysis_data);
  assert.equal(n.summary, base.call_analysis.call_summary, "the provider's summary is kept beside it");
  assert.equal(
    callSummaryLine(n),
    "Inbound call · 2 min — Asked for a gel manicure this Saturday around 10. (booking link sent)",
  );
  assert.equal(
    normalizeCall({ ...base, call_analysis: { call_summary: "x", custom_analysis_data: ["not", "an", "object"] } })
      .analysis,
    null,
  );
  assert.equal(
    normalizeCall({ ...base, call_analysis: { call_summary: "x", custom_analysis_data: "no" } }).analysis,
    null,
  );
  assert.equal(normalizeCall({ call_id: "c2" }).analysis, null);
  const plain = normalizeCall({ ...base, call_analysis: { call_summary: "The user called to ask about hours." } });
  assert.equal(
    callSummaryLine(plain),
    "Inbound call · 2 min — The user called to ask about hours.",
    "without the analysis the note is the summary, untouched — it is the receptionist's own memory",
  );
  const vm = normalizeCall({
    call_id: "c3",
    call_status: "ended",
    direction: "inbound",
    call_analysis: { in_voicemail: true },
  });
  assert.equal(callSummaryLine(vm), "Inbound call — Reached voicemail.");
});

test("the call card: the request is the headline, the outcome, the to-do and the given name are bullets; an old summary's opening is folded", () => {
  const dto = {
    id: "k1",
    retell_call_id: "c1",
    direction: "inbound",
    call_type: "phone_call",
    status: "ended",
    from_e164: "+13055550134",
    from_raw: null,
    to_e164: null,
    started_at: iso(2 * H),
    ended_at: iso(2 * H - 120_000),
    duration_ms: 120_000,
    disconnection_reason: "user_hangup",
    sentiment: "Positive",
    call_successful: true,
    in_voicemail: false,
    summary: "The user called Marisa's Beauty Salon to inquire about a gel manicure. The agent sent the booking link.",
    transcript_object: null,
    recording: null,
    conversation_id: "cv1",
    contact_id: "c1",
    message_id: null,
    contact: { display_name: "Ana", wa_profile_name: null, phone_e164: "+13055550134" },
    wanted: "Asked for a gel manicure this Saturday around 10.",
    outcome: "booking_link_sent",
    follow_up: "Call back to confirm the slot.",
    caller_name: "Ana",
  };
  const vm = toCallVM(dto, ZONE, NOW);
  assert.equal(vm.summary.headline, "Asked for a gel manicure this Saturday around 10.");
  assert.ok(vm.summary.bullets.includes("Booking link sent"));
  assert.ok(vm.summary.bullets.includes("To do: Call back to confirm the slot."));
  assert.ok(vm.summary.bullets.includes("Gave their name as Ana"));
  assert.match(vm.snippet, /Asked for a gel manicure this Saturday around 10\./);
  const old = toCallVM({ ...dto, wanted: null, outcome: null, follow_up: null, caller_name: null }, ZONE, NOW);
  assert.equal(
    old.summary.headline,
    "Called to inquire about a gel manicure.",
    "before the schema: the provider's first sentence, folded",
  );
  assert.ok(!old.summary.bullets.some((b) => /^To do:|Gave their name|Booking link sent/.test(b)));
});

test("the strip reads the same words: what they wanted from the people door, an old summary folded", () => {
  const caller = {
    id: "c9",
    display_name: null,
    wa_profile_name: null,
    phone_e164: "+13085550109",
    consent: "unknown",
    consent_source: null,
    consent_updated_at: null,
    dnc: false,
    channels: ["voice"],
    conversation_count: 0,
    escalation_count: 0,
    needs_human: false,
    open_escalation_reason: null,
    open_escalation_since: null,
    latest_conversation_id: null,
    latest_state: null,
    latest_paused_until: null,
    latest_assignee_user_id: null,
    latest_snooze_until: null,
    latest_wa_inbound_at: null,
    last_message_at: null,
    last_message_direction: null,
    last_message_sender: null,
    last_inbound_text: null,
    last_inbound_at: null,
    last_call_at: iso(2 * D),
    last_inbound_call_at: iso(2 * D),
    call_count: 1,
    call_seconds: 60,
    first_contact_at: iso(2 * D),
    earliest_row_at: iso(2 * D),
    has_backfill: false,
    has_chat: false,
    queued_reply_at: null,
    effective_reply_mode: "auto",
    visits: null,
  };
  const folded = attentionRow(
    toPersonRowVM(
      {
        ...caller,
        last_inbound_call_summary:
          "The user called Marisa's Beauty Salon to inquire about the opening hours for the next day.",
      },
      ZONE,
      NOW,
    ),
    ZONE,
    nowMs,
  );
  assert.equal(folded.sentence, "Called to inquire about the opening hours for the next day.");
  const wanted = attentionRow(
    toPersonRowVM({ ...caller, last_inbound_call_summary: "Wanted tomorrow's opening hours." }, ZONE, NOW),
    ZONE,
    nowMs,
  );
  assert.equal(wanted.sentence, "Wanted tomorrow's opening hours.");
});

test("the agent's analysis fields: each has a type, a name and a description; the enum's choices are the six; the planner adds them, keeps a stranger's field, and re-sends one that changed", () => {
  assert.deepEqual(
    CALL_ANALYSIS_FIELDS.map((f) => f.name),
    ["caller_wanted", "outcome", "follow_up", "caller_name"],
  );
  for (const f of CALL_ANALYSIS_FIELDS) {
    assert.ok(["string", "enum"].includes(f.type) && f.name && f.description.length > 20, f.name);
    if (f.type === "enum") assert.deepEqual([...f.choices], [...CALL_OUTCOMES]);
    if (f.type === "string") assert.ok(f.examples.length >= 2, `${f.name} shows the analyst the shape`);
  }
  assert.ok(
    CALL_ANALYSIS_FIELDS[0].description.includes("never with 'The user'"),
    "the request in the owner's words, not the provider's",
  );
  const converged = {
    webhook_events: [...VOICE_WEBHOOK_EVENTS],
    webhook_timeout_ms: 20000,
    opt_in_signed_url: true,
    data_storage_retention_days: null,
  };
  const stranger = { type: "system-presets", name: "call_summary" };
  const withOurs = planAgentSettings({
    ...converged,
    post_call_analysis_data: [stranger, ...CALL_ANALYSIS_FIELDS.map((f) => ({ ...f, required: false }))],
  });
  assert.equal(withOurs.agentPatch, null, "ours present, a preset beside them, an echoed `required`: nothing to do");
  const changed = planAgentSettings({
    ...converged,
    post_call_analysis_data: [
      stranger,
      ...CALL_ANALYSIS_FIELDS.map((f) => (f.name === "outcome" ? { ...f, description: "edited by hand" } : { ...f })),
    ],
  });
  assert.ok(changed.drift[0].includes("lacks outcome"));
  const sent = changed.agentPatch.post_call_analysis_data;
  assert.deepEqual(sent[0], stranger, "the stranger's field is kept, first");
  assert.deepEqual(
    sent.slice(1).map((f) => f.name),
    CALL_ANALYSIS_FIELDS.map((f) => f.name),
  );
  assert.equal(sent.find((f) => f.name === "outcome").description, CALL_ANALYSIS_FIELDS[1].description);
  const none = planAgentSettings({ ...converged, post_call_analysis_data: null });
  assert.equal(none.agentPatch.post_call_analysis_data.length, CALL_ANALYSIS_FIELDS.length);
});

test("the wiring: the door files the four columns and keeps them across retries, the people door prefers the request, the ingest passes the analysis, the dashboard selects the columns", () => {
  const mig = readRaw("supabase/migrations/00061_call_outcomes.sql");
  for (const s of [
    "add column if not exists wanted      text,",
    "add column if not exists analysis    jsonb;",
    "check (outcome is null or outcome in ('answered','booking_link_sent','callback_needed','voicemail','no_request','other'));",
    "  p_analysis       jsonb default null\n) returns jsonb",
    "v_wanted          text := nullif(btrim(p_analysis->>'caller_wanted'), '');",
    "    wanted, outcome, follow_up, caller_name, analysis\n  ) values (",
    "    wanted               = coalesce(excluded.wanted, calls.wanted),",
    "    analysis             = coalesce(excluded.analysis, calls.analysis),",
    "select coalesce(k.wanted, k.summary) as summary",
    "and coalesce(k.wanted, k.summary) is not null",
    "grant execute on function public.people_list(uuid, uuid) to authenticated, service_role;",
  ])
    assert.ok(mig.includes(s), s);
  assert.ok(
    mig.includes("drop function if exists public.ingest_call(") && mig.includes("from public, anon, authenticated;"),
    "a new parameter is a drop and a create, and the door stays the edge's alone",
  );
  assert.match(
    readCode("packages/db/src/repositories/calls.ts"),
    /p_analysis: \(?\(n\.analysis \?\? null\) as Json\)?,/,
  );
  const dto = readCode("apps/dashboard/src/server/dto.ts");
  assert.ok(
    dto.includes("summary, wanted, outcome, follow_up, caller_name, transcript_object") &&
      dto.includes("wanted: c.wanted ?? null,"),
  );
});

test("the agent reader carries the analysis schema, so the diagnostic's drift is true", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        agent_id: "agent_x",
        agent_name: "Marisa's",
        version: 3,
        is_published: true,
        response_engine: { type: "retell-llm", llm_id: "llm_1", version: 2 },
        webhook_url: "https://edge/api/retell-webhook?key=SECRET",
        webhook_events: ["call_started"],
        post_call_analysis_data: CALL_ANALYSIS_FIELDS.map((f) => ({ ...f })),
      }),
      { status: 200 },
    );
  try {
    const a = await getAgent({ apiKey: "k" }, "agent_x");
    assert.equal(a.webhook_url, "https://edge/api/retell-webhook", "the query string never comes out");
    assert.deepEqual(
      a.post_call_analysis_data.map((f) => f.name),
      CALL_ANALYSIS_FIELDS.map((f) => f.name),
    );
    assert.ok(
      !planAgentSettings(a).drift.some((d) => d.includes("post_call_analysis_data")),
      "an agent that has the fields is not told it lacks them",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the converge endpoint has more than the default budget", () => {
  // The endpoint itself -- the door, a dry run by default, a draft for a
  // published version, publish only when asked, the backup with its secret
  // stripped, the LLM never touched -- is run in voice-doors.test.mjs.
  assert.ok(
    readRaw("apps/edge/vercel.json").includes('"api/admin/voice-converge.ts"'),
    "several provider calls need more than the default budget",
  );
});

test("a caller who needs a call back lands on Needs you: the reason exists everywhere a reason is named", () => {
  const enums = readCode("packages/contracts/src/enums.ts");
  assert.ok(enums.includes('"callback",'), "the reason is declared");
  assert.ok(readRaw("supabase/migrations/00062_callback_reason.sql").includes("'callback'"), "and the CHECK admits it");
  assert.ok(
    readCode("packages/contracts/src/people.ts").includes('callback: "needs a call back",'),
    "the strip's words",
  );
  const vm = readCode("packages/contracts/src/viewmodels.ts");
  assert.ok(
    vm.includes('callback: "Needs a call back — the phone receptionist could not finish it",') &&
      vm.includes('callback: "They phoned and the receptionist couldn\'t finish it.",'),
    "the Inbox's label and the operator's first sentence",
  );
});
