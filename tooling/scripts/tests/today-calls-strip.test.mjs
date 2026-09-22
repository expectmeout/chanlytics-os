/**
 * Today shows who is on the phone line right now.
 *
 * The Today view model has carried `calls.rows` since the Calls slice — the
 * call in progress, the one that reached voicemail, the one whose caller was
 * angry — and the brief never rendered a single one. A customer could be on
 * the line while the page built to say "here is what is happening" said
 * nothing about it.
 *
 * These pin: the brief draws live calls first and the calls worth an ear
 * after the people who need you; a live row exists in the VM for an ongoing
 * call; and Today repaints when a call starts or ends but NOT on the
 * transcript turn every few seconds (three plpgsql aggregates per turn was
 * the regression the table-routed realtime rule was built to stop).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { toTodayVM } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { wantsRefresh } = await import(
  pathToFileURL(path.join(here, "../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts")).href
);

test("Today draws the call in progress first, then the people who need you, the windows closing, and the calls worth an ear last", () => {
  // The queue (dashboard-a-command.jsx) owns the order now; the hero keeps the narrative.
  const queue = readRaw("apps/dashboard/src/legacy/pages/dashboard-a-command.jsx");
  const rail = queue.indexOf("<LiveRail nav={nav} />");
  const rows = queue.indexOf("{drawn}");
  assert.ok(rail > 0 && rail < rows, "REGRESSION: a customer on the line was invisible on Today");
  assert.ok(
    queue.includes('data-testid="brief-live-call"') && queue.includes("nav(`live/${c.callId}`)"),
    "the call's own door, not Live's list",
  );
  const vm = readRaw("packages/contracts/src/today.ts");
  const esc = vm.indexOf("for (const r of escRecords) {");
  const win = vm.indexOf("for (const c of closingConvs) {");
  const ear = vm.indexOf("for (const r of callRows) {");
  assert.ok(
    esc > 0 && esc < win && win < ear && vm.includes("waitedMs: Number.NEGATIVE_INFINITY"),
    "a voicemail is worth an ear, after the people waiting on you",
  );
  const brief = readRaw("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(
    !brief.includes('data-testid="brief-live-call"') && !brief.includes('data-testid="brief-call-row"'),
    "the hero no longer repeats the queue",
  );
});

const NOW = new Date("2026-09-04T15:00:00.000Z");
const metrics = (over = {}) => ({
  workspace: { name: "Melany's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "voice", status: "active", number: "+13083368109" }],
  window: {
    days: 1,
    since: "2026-09-04T04:00:00+00:00",
    since_local: "2026-09-04T00:00:00",
    now_local: "2026-09-04T11:00:00",
  },
  now: {
    escalations_open: 0,
    oldest_open_escalation_at: null,
    threads_needing_human: 0,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 0,
    messages_out_ai: 0,
    messages_out_you: 0,
    conversations_active: 0,
    answered_by_ai: 0,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 0,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 0,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
    ...over,
  },
});

test("an ongoing call is a live row the strip can draw", () => {
  const started = new Date(NOW.getTime() - 90_000).toISOString();
  const call = {
    id: "c-live",
    retell_call_id: "call_live1234",
    direction: "inbound",
    call_type: null,
    status: "ongoing",
    from_e164: "+19175746416",
    from_raw: null,
    to_e164: null,
    started_at: started,
    ended_at: null,
    duration_ms: null,
    disconnection_reason: null,
    sentiment: null,
    call_successful: null,
    in_voicemail: null,
    summary: null,
    transcript_object: null,
    recording: null,
    conversation_id: "cv1",
    contact_id: "k1",
    message_id: null,
    created_at: started,
    updated_at: new Date(NOW.getTime() - 5_000).toISOString(),
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175746416" },
  };
  const vm = toTodayVM(metrics(), [], [], [call], NOW);
  assert.ok(vm.calls, "one call today");
  const live = vm.calls.rows.find((r) => r.to === "live");
  assert.ok(live, "REGRESSION: the call in progress has no row");
  assert.equal(live.note, "In progress right now");
  assert.match(live.who, /Daniela/);
});

test("Today repaints when a call starts or ends, not on every transcript turn", () => {
  const surface = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(surface.includes('refreshOnTables: [...DEFAULT_REFRESH_TABLES, "calls"],'));
  assert.ok(surface.includes('c.row.status !== "ongoing"'), "a turn keeps status ongoing; a start or an end does not");
  // The rule itself, as the runner applies it.
  const today = {
    refreshOnTables: ["messages", "conversations", "escalations", "calls"],
    refreshWhen: (c) => c.table !== "calls" || c.event !== "UPDATE" || c.row.status !== "ongoing",
  };
  assert.equal(
    wantsRefresh(today, "calls", { table: "calls", event: "INSERT", row: { status: "ongoing" } }),
    true,
    "a call starting",
  );
  assert.equal(
    wantsRefresh(today, "calls", { table: "calls", event: "UPDATE", row: { status: "ongoing" } }),
    false,
    "REGRESSION: a transcript turn re-ran three aggregates",
  );
  assert.equal(
    wantsRefresh(today, "calls", { table: "calls", event: "UPDATE", row: { status: "ended" } }),
    true,
    "a call ending",
  );
  assert.equal(wantsRefresh(today, "messages", { table: "messages", event: "INSERT", row: {} }), true);
  assert.equal(
    wantsRefresh(today, "calls"),
    true,
    "without a row to judge, the table alone decides — the historical behaviour",
  );
  const live = { refreshOnTables: ["calls"] };
  assert.equal(
    wantsRefresh(live, "calls", { table: "calls", event: "UPDATE", row: { status: "ongoing" } }),
    true,
    "Live still repaints per turn",
  );
  const db = readCode("packages/db/src/realtime.ts");
  assert.ok(/w\.table,\s*payload\.eventType,?\s*\)/.test(db), "the event type reaches the rule");
  const runner = readCode("apps/dashboard/src/legacy-bridge/surface-runner.ts");
  assert.ok(
    runner.includes('wantsRefresh(o, table, { table, event: event ?? "*", row: row as Record<string, unknown> })'),
  );
});
