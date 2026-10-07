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
import { readRaw } from "../_source.mjs";
import { changesOf } from "../_live-feed.mjs";
import { installLegacyReact, fresh, all, byTestId, textOf, press } from "../_legacy-react.mjs";

// The queue and the hero are the TSX surface's (apps/dashboard/src/surfaces/today/pages, decision 0015), drawn on the
// stub React over the day the seam holds; a stand-in window gives them the frame's door, and a timer that never fires
// (the rail's clock ticks once a second while a call is up).
const went = [];
installLegacyReact({
  __DEMO_MODE: false,
  __surfaceState: () => "live",
  appNavigate: (to) => went.push(to),
  canDo: () => true,
  setInterval: () => 1,
  clearInterval() {},
});
const { AgentCommand } = await import("../../../../apps/dashboard/src/surfaces/today/pages/queue.tsx");
const { HeroBrief } = await import("../../../../apps/dashboard/src/surfaces/today/pages/brief.tsx");
const { setSurfaceValue } = await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");
const { todayOverride } = await import("../../../../apps/dashboard/src/surfaces/today/surface.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const { wantsRefresh, DEFAULT_REFRESH_TABLES } = await import(
  pathToFileURL(path.join(here, "../../../../apps/dashboard/src/legacy-bridge/surface-realtime.ts")).href
);

const NOW = new Date("2026-09-04T15:00:00.000Z");
const metrics = (over = {}) => ({
  workspace: { name: "Marisa's Beauty Salon", timezone: "America/New_York", status: "active" },
  channels: [{ kind: "voice", status: "active", number: "+13055550123" }],
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

// A person waiting on a person (a handoff row of the queue), and a call on the line now (the Live surface's own row).
const waiting = {
  id: "cv-a",
  state: "needs_human",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: null,
  last_message_at: "2026-09-04T14:19:00Z",
  contact: { id: "k-cv-a", display_name: "Ana Reyes", wa_profile_name: null, phone_e164: "+13055550100" },
  messages: [
    {
      id: "a1",
      direction: "inbound",
      sender: "customer",
      type: "text",
      body: "I'd rather talk to a person about a refund.",
      media: null,
      meta: null,
      status: "received",
      channel: "whatsapp",
      created_at: "2026-09-04T14:19:00Z",
    },
  ],
};
const escalation = {
  id: "e-a",
  conversation_id: "cv-a",
  reason: "human_token",
  details: null,
  state: "open",
  created_at: "2026-09-04T14:20:00Z",
};
const onTheLine = () => ({
  heartbeatMs: 60_000,
  now: [
    {
      callId: "call_live1234",
      who: "Daniela Ruiz",
      whoShort: "Daniela",
      startedAtMs: Date.now() - 90_000,
      heartbeatAtMs: Date.now(),
      transcript: [],
    },
  ],
});
const draw = (Comp) => {
  fresh();
  return globalThis.React.createElement(Comp, {});
};

test("Today draws the call in progress first, then the people who need you, the windows closing, and the calls worth an ear last", () => {
  // The queue (surfaces/today/pages/queue.tsx) owns the order now; the hero keeps the narrative.
  const vm = toTodayVM(metrics(), [waiting], [escalation], [], NOW);
  assert.equal(vm.queue.rows.length, 1, "a person is waiting on a person");
  setSurfaceValue("today", vm);
  globalThis.__LIVE = onTheLine();
  went.length = 0;
  const queue = byTestId(draw(AgentCommand), "today-queue");
  const drawn = all(
    queue,
    (n) => n.props?.["data-testid"] === "brief-live-call" || String(n.props?.["data-testid"]).startsWith("queue-"),
  );
  assert.ok(drawn.length > 1, "the call on the line and the person waiting are both drawn");
  assert.equal(
    drawn[0].props["data-testid"],
    "brief-live-call",
    "REGRESSION: a customer on the line was invisible on Today",
  );
  const door = all(drawn[0], (n) => n.type === "button" && textOf(n).includes("Open Live"))[0];
  assert.ok(door, "the call has a door");
  press(door);
  assert.deepEqual(went, ["live/call_live1234"], "the call's own door, not Live's list");
  const vmSrc = readRaw("packages/contracts/src/today/today-queue.ts");
  const esc = vmSrc.indexOf("for (const r of escRecords) {");
  const win = vmSrc.indexOf("for (const c of closingConvs) {");
  const ear = vmSrc.indexOf("for (const r of callRows) {");
  assert.ok(
    esc > 0 && esc < win && win < ear && vmSrc.includes("waitedMs: Number.NEGATIVE_INFINITY"),
    "a voicemail is worth an ear, after the people waiting on you",
  );
  // The hero, over the same day and the same call on the line, draws neither the call nor a row of one.
  const hero = draw(HeroBrief);
  assert.equal(
    all(
      hero,
      (n) =>
        ["brief-live-call", "brief-call-row"].includes(n.props?.["data-testid"]) ||
        String(n.props?.["data-testid"]).startsWith("queue-"),
    ).length,
    0,
    "the hero no longer repeats the queue",
  );
  delete globalThis.__LIVE;
  setSurfaceValue("today", undefined);
});

test("an ongoing call is a live row the strip can draw", () => {
  const started = new Date(NOW.getTime() - 90_000).toISOString();
  const call = {
    id: "c-live",
    retell_call_id: "call_live1234",
    direction: "inbound",
    call_type: null,
    status: "ongoing",
    from_e164: "+19175550137",
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
    contact: { display_name: "Daniela Ruiz", wa_profile_name: null, phone_e164: "+19175550137" },
  };
  const vm = toTodayVM(metrics(), [], [], [call], NOW);
  assert.ok(vm.calls, "one call today");
  const live = vm.calls.rows.find((r) => r.to === "live");
  assert.ok(live, "REGRESSION: the call in progress has no row");
  assert.equal(live.note, "In progress right now");
  assert.match(live.who, /Daniela/);
});

test("Today repaints when a call starts or ends, not on every transcript turn", async () => {
  // The searches ride along since a round that stops to ask is a lead_rounds UPDATE (spec G7); the calls rule is the same.
  assert.deepEqual(todayOverride.refreshOnTables, [...DEFAULT_REFRESH_TABLES, "calls", "lead_rounds"]);
  // The rule itself, as the runner applies it: Today's own override (surfaces/today/surface.ts), run, not read. A turn
  // keeps status ongoing; a start or an end does not.
  const today = todayOverride;
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
  // A call's notice reaches the rule as its event and each of its statuses (packages/db realtime.ts), and the runner
  // hands the rule what the feed heard (shell/surfaces/surface-boot.test.mjs runs that).
  const turn = await changesOf({ event: "UPDATE", payload: { table: "calls", op: "UPDATE", statuses: ["ongoing"] } });
  assert.deepEqual(
    turn.map((c) => wantsRefresh(today, c.table, c)),
    [false],
    "a transcript turn: every call still ongoing",
  );
  const ended = await changesOf({
    event: "UPDATE",
    payload: { table: "calls", op: "UPDATE", statuses: ["ended", "ongoing"] },
  });
  assert.deepEqual(
    ended.map((c) => wantsRefresh(today, c.table, c)),
    [true, false],
    "one call of two ended in a statement: Today repaints",
  );
});
