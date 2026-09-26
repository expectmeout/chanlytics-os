/**
 * One clock: every time the owner reads is said by the business's clock.
 *
 * The pages printed a message's time, a call's start, a broadcast's schedule and a
 * person's history in the BROWSER's zone (Intl.DateTimeFormat([]) with no timeZone),
 * while Today, Playbooks and Reports printed the workspace's. One call read as two
 * times to an owner away from home, or to a teammate in another zone; "Snooze until
 * tomorrow 10:00" meant ten o'clock wherever the browser was. The 12 September
 * audit's D5, the wiring audit's A18 and C11.
 *
 * The instants below are chosen where New York, Tokyo and UTC disagree about the
 * day, so a formatter that falls back to the machine's zone fails here on any
 * machine outside Tokyo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";
import {
  attentionRow,
  broadcastName,
  clockDate,
  clockDayLabel,
  clockShort,
  clockStamp,
  clockTime,
  clockWhen,
  fromZonedInput,
  toBroadcastVM,
  toCallVM,
  toConversationVM,
  toInboxThreadVM,
  toLiveCallVM,
  toLiveVM,
  toPersonRowVM,
  toPersonVM,
  tomorrowAtIn,
  wallClockAt,
  zoneDayKey,
  zonedInputValue,
} from "@chanlytics/contracts";

const at = (iso) => Date.parse(iso);
const iso = (ms) => new Date(ms).toISOString();
const TOKYO = "Asia/Tokyo";
const NY = "America/New_York";

test("a moment is said by the business's clock, whatever zone the viewer is in", () => {
  // 16:30 UTC on 6 September is 1:30 AM on the 7th in Tokyo and 12:30 PM on the 6th in New York.
  assert.equal(clockTime(at("2026-09-06T16:30:00Z"), TOKYO), "1:30 AM");
  assert.equal(clockTime(at("2026-09-06T16:30:00Z"), NY), "12:30 PM");
  assert.equal(zoneDayKey(at("2026-09-06T16:30:00Z"), TOKYO), "2026-09-07");
  assert.equal(zoneDayKey(at("2026-09-06T16:30:00Z"), NY), "2026-09-06");
  assert.equal(clockDate(at("2026-09-06T16:30:00Z"), TOKYO, at("2026-09-07T03:00:00Z")), "Sep 7");
  assert.equal(
    clockDate(at("2025-12-31T20:00:00Z"), NY, at("2026-09-07T03:00:00Z")),
    "Dec 31, 2025",
    "another year says its year",
  );
  assert.equal(typeof C.clockDateYear, "function", "a date that always says its year, for a record");
  assert.equal(C.clockDateYear(at("2026-09-06T16:30:00Z"), TOKYO), "Sep 7, 2026");
});

test("'the same day' is the business's day: a list shows the time today and the date before", () => {
  const now = at("2026-09-07T03:00:00Z"); // noon on the 7th in Tokyo; 11 PM on the 6th in New York
  const late = at("2026-09-06T16:30:00Z"); // 1:30 AM on the 7th in Tokyo; 12:30 PM on the 6th in New York
  assert.equal(clockShort(late, TOKYO, now), "1:30 AM", "Tokyo: the same day");
  assert.equal(clockShort(late, NY, now), "12:30 PM", "New York: the same day there too");
  assert.equal(clockShort(at("2026-09-06T14:00:00Z"), TOKYO, now), "Sep 6", "11 PM on the 6th is yesterday in Tokyo");
  assert.equal(clockStamp(at("2026-09-06T14:00:00Z"), TOKYO, now), "Sep 6 · 11:00 PM", "a message keeps its day");
  assert.equal(clockStamp(late, TOKYO, now), "1:30 AM");
});

test("when a send goes: today, tomorrow, or the date, by the business's day", () => {
  const now = at("2026-09-05T13:00:00Z"); // 9 AM in New York
  assert.equal(clockWhen(at("2026-09-05T22:00:00Z"), NY, now), "today 6:00 PM");
  assert.equal(
    clockWhen(at("2026-09-06T03:30:00Z"), NY, now),
    "today 11:30 PM",
    "03:30 UTC on the 6th is still tonight in New York",
  );
  assert.equal(clockWhen(at("2026-09-06T14:00:00Z"), NY, now), "tomorrow 10:00 AM");
  assert.equal(clockWhen(at("2026-09-12T14:00:00Z"), NY, now), "Sep 12 · 10:00 AM");
});

test("a day on a timeline: today, yesterday, or the date, by the business's day", () => {
  const now = at("2026-09-04T16:00:00Z"); // noon in New York
  assert.equal(clockDayLabel(at("2026-09-04T13:00:00Z"), NY, now), "Today · Sep 4");
  assert.equal(
    clockDayLabel(at("2026-09-04T02:00:00Z"), NY, now),
    "Yesterday · Sep 3",
    "2 AM UTC on the 4th is 10 PM on the 3rd in New York",
  );
  assert.equal(clockDayLabel(at("2026-09-02T16:00:00Z"), NY, now), "Sep 2");
});

test("a wall-clock time by the business's clock, across a clock change: tomorrow at ten is ten there", () => {
  assert.equal(iso(wallClockAt(NY, "2026-09-07", 10, 0)), "2026-09-07T14:00:00.000Z");
  assert.equal(
    iso(wallClockAt(NY, "2026-11-01", 10, 0)),
    "2026-11-01T15:00:00.000Z",
    "after the clocks go back, ten is 15:00 UTC",
  );
  assert.equal(
    iso(tomorrowAtIn(NY, at("2026-09-06T02:30:00Z"), 10)),
    "2026-09-06T14:00:00.000Z",
    "10:30 PM on the 5th in New York: tomorrow is the 6th, though UTC already says the 6th",
  );
  assert.equal(
    iso(tomorrowAtIn(TOKYO, at("2026-09-06T16:30:00Z"), 10)),
    "2026-09-08T01:00:00.000Z",
    "1:30 AM on the 7th in Tokyo: tomorrow is the 8th",
  );
  assert.equal(
    iso(tomorrowAtIn(NY, at("2026-10-31T16:00:00Z"), 10)),
    "2026-11-01T15:00:00.000Z",
    "the night the clocks change",
  );
});

test("a schedule box reads and writes the business's clock, not the device's", () => {
  assert.equal(zonedInputValue(at("2026-09-15T13:30:00Z"), NY), "2026-09-15T09:30");
  assert.equal(zonedInputValue(at("2026-09-15T13:30:00Z"), TOKYO), "2026-09-15T22:30");
  assert.equal(iso(fromZonedInput("2026-09-15T09:30", NY)), "2026-09-15T13:30:00.000Z");
  assert.equal(iso(fromZonedInput("2026-09-15T09:30:00", NY)), "2026-09-15T13:30:00.000Z", "with seconds");
  assert.equal(fromZonedInput("", NY), null);
  assert.equal(fromZonedInput("tomorrow", NY), null);
  assert.equal(
    zonedInputValue(fromZonedInput("2026-11-01T01:30", NY), NY),
    "2026-11-01T01:30",
    "the box shows what was written, even in the repeated hour",
  );
});

test("a zone that is not one is read as UTC, rather than throwing on a page", () => {
  assert.equal(clockTime(at("2026-09-06T16:30:00Z"), "Mars/Olympus"), "4:30 PM");
  assert.equal(zoneDayKey(at("2026-09-06T23:30:00Z"), ""), "2026-09-06");
});

/* ---------------- the view models say the business's time ---------------- *
 * A Tokyo workspace, read at noon on the 7th there (03:00 UTC). Its customer wrote
 * at 1:30 AM on the 7th (16:30 UTC on the 6th): the same day in Tokyo, the day
 * before in UTC, lunchtime the day before in New York. Fixture shapes are the
 * existing tests' own (conversation-vm, live-vm, people-vm, calendar-people).
 */

const NOW = new Date("2026-09-07T03:00:00Z");
const WROTE = "2026-09-06T16:30:00Z";

const msg = (over = {}) => ({
  id: "m1",
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Can I come at eleven?",
  media: null,
  meta: null,
  status: "received",
  created_at: WROTE,
  ...over,
});
const conv = (messages, over = {}) => ({
  id: "c1",
  state: "open",
  paused_until: null,
  last_wa_inbound_at: WROTE,
  last_message_at: WROTE,
  contact: { id: "k1", display_name: "Aiko Tanaka", wa_profile_name: null, phone_e164: "+81312345678" },
  messages,
  ...over,
});

test("REGRESSION (D5): the Inbox and Conversations print a message's time by the business's clock", () => {
  const thread = toInboxThreadVM(
    conv([msg()]),
    { id: "e1", reason: "human_token", details: null, state: "open", created_at: WROTE, conversation_id: "c1" },
    TOKYO,
    NOW,
  );
  assert.equal(thread.timeline.find((x) => x.type === "msg").at, "1:30 AM", "the bubble");
  assert.equal(thread.timeline.find((x) => x.type === "event").at, "1:30 AM", "the flag");
  assert.equal(thread.lastAt, "1:30 AM", "the list row");
  const snoozed = toInboxThreadVM(
    conv([msg()], { state: "snoozed", snooze_until: "2026-09-07T09:00:00Z" }),
    null,
    TOKYO,
    NOW,
  );
  assert.equal(snoozed.wake, "6:00 PM", "the wake: 09:00 UTC is 6 PM in Tokyo");
  const earlier = toConversationVM(
    conv([msg({ created_at: "2026-09-06T14:00:00Z" }), msg({ id: "m2", created_at: WROTE })]),
    TOKYO,
    NOW,
  );
  assert.equal(earlier.messages[0].at, "Sep 6 · 11:00 PM", "yesterday in Tokyo keeps its day");
  assert.equal(earlier.messages[1].at, "1:30 AM");
  assert.equal(earlier.at, "1:30 AM");
  assert.ok(earlier.summary.bullets[0].endsWith("started Sep 6"), earlier.summary.bullets[0]);
});

const call = (over = {}) => ({
  id: "k1",
  retell_call_id: "r-k1",
  direction: "inbound",
  call_type: "phone_call",
  from_e164: "+81312345678",
  from_raw: "+81312345678",
  to_e164: "+81398765432",
  started_at: WROTE,
  ended_at: "2026-09-06T16:33:00Z",
  updated_at: "2026-09-06T16:33:00Z",
  duration_ms: 180_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Booked a cut.",
  transcript_object: null,
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  contact: null,
  status: "ended",
  ...over,
});

test("REGRESSION (D5): a call's start reads the same on Conversations and Live -- the business's clock", () => {
  assert.equal(toCallVM(call(), TOKYO, NOW).at, "1:30 AM");
  assert.equal(toLiveCallVM(call(), TOKYO, NOW).startedLabel, "1:30 AM");
  const voice = {
    id: "ch1",
    kind: "voice",
    number_e164: "+81398765432",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    last_inbound_at: WROTE,
  };
  assert.equal(toLiveVM([call()], [voice], TOKYO, NOW).line.lastCallLabel, "1:30 AM");
});

test("REGRESSION (C11): a broadcast's when and its default name are the business's day", () => {
  const base = {
    id: "b1",
    name: "Spring",
    template_id: "t",
    template_name: "spring_offer",
    template_language: "en_US",
    params: [],
    audience: { kind: "everyone", id: null, label: "Everyone who said yes" },
    state: "sent",
    scheduled_for: "2026-09-06T03:00:00Z",
    started_at: "2026-09-06T03:00:00Z",
    finished_at: "2026-09-06T03:30:00Z",
    recipient_count: 10,
    failure: null,
    created_at: "2026-09-05T12:50:00Z",
    counts: { queued: 0, sent: 8, skipped: 2, failed: 0, delivered: 6, read: 4, replied: 1 },
  };
  assert.equal(
    toBroadcastVM(base, NY, new Date("2026-09-05T13:00:00Z")).when,
    "today 11:30 PM",
    "03:30 UTC on the 6th is tonight in New York",
  );
  assert.equal(broadcastName("spring_offer", TOKYO, new Date(WROTE)), "Spring offer · Sep 7");
});

const row = (over = {}) => ({
  id: "k1",
  display_name: "Aiko Tanaka",
  wa_profile_name: null,
  phone_e164: "+81312345678",
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: WROTE,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: WROTE,
  last_message_at: WROTE,
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I come at eleven?",
  last_inbound_at: WROTE,
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: WROTE,
  earliest_row_at: WROTE,
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});

test("REGRESSION (D5): a person's row and the attention strip say their days and times by the business's clock", () => {
  const vm = toPersonRowVM(row(), TOKYO, NOW);
  assert.equal(vm.firstContact.label, "Sep 7", "first contact: the 7th in Tokyo");
  assert.equal(vm.consent.sub, "In person · Sep 7");
  const snoozed = toPersonRowVM(
    row({ latest_state: "snoozed", latest_snooze_until: "2026-09-07T09:00:00Z" }),
    TOKYO,
    NOW,
  );
  assert.equal(snoozed.receptionist.label, "Snoozed until 6:00 PM");
  const waiting = toPersonRowVM(
    row({ needs_human: true, open_escalation_reason: "human_token", open_escalation_since: WROTE }),
    TOKYO,
    NOW,
  );
  assert.equal(attentionRow(waiting, TOKYO, NOW.getTime()).status.at(-1), "since 1:30 AM");
});

test("REGRESSION (D5): a profile's timeline, last exchange and record are the business's days", () => {
  const detail = {
    row: row(),
    identities: [],
    conversations: [conv([msg()])],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    added: { at: WROTE, source: "manual", title: null },
  };
  const vm = toPersonVM(detail, TOKYO, NOW);
  const said = vm.timeline.find((x) => x.kind === "customer");
  assert.deepEqual([said.time, said.day], ["1:30 AM", "Today · Sep 7"]);
  assert.equal(vm.lastExchange.customer.at, "1:30 AM Today · Sep 7");
  assert.equal(vm.about.find((a) => a.k === "Added").v, "Sep 7, 2026 · by hand");
});

/* ------------- the bridge hands every view model the workspace's zone ------------- *
 * Every surface on a workspace page boots at once (surface-runner.ts), so the Inbox can
 * map its threads before the workspace read has published the zone. Run over a fake
 * wire, from a browser in New York or UTC, for a workspace in Tokyo.
 */

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.document = {
  body: {},
  addEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: {
    pathname: "/w/tokyo",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  setTimeout: () => 1,
  clearTimeout() {},
};
const WORKSPACE = { id: "t-tokyo", slug: "tokyo", name: "Tokyo Salon", status: "active", timezone: TOKYO };
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The wire: each `METHOD /path` answered from `routes`, anything else a 404; every request kept. */
const wire = (routes) => {
  const seen = [];
  globalThis.window.fetch = async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const method = init.method ?? "GET";
    seen.push({ method, path: u.pathname, body: init.body ? JSON.parse(init.body) : null });
    const data = routes[`${method} ${u.pathname}`];
    return data
      ? json(200, { ok: true, data })
      : json(404, { ok: false, error: { code: "not_found", message: `no ${method} ${u.pathname}` } });
  };
  return seen;
};
const quiet = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
/** `Date.now` pinned for one call: the bridge asks it what "now" is. */
const pinned = async (ms, fn) => {
  const real = Date.now;
  Date.now = () => ms;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
};
const { inboxOverride } = await quiet(() => import("../../../../../apps/dashboard/src/legacy-bridge/surface-data.ts"));

test("REGRESSION (D5): on a cold load the Inbox waits for the workspace's zone -- it said the minute by the browser's clock", async () => {
  const seen = wire({
    "GET /api/v1/workspaces": { workspaces: [WORKSPACE], activeWorkspaceId: WORKSPACE.id },
    "GET /api/v1/conversations": { conversations: [conv([msg()])] },
    "GET /api/v1/escalations": { escalations: [] },
    "GET /api/v1/templates": { templates: [] },
  });
  await quiet(() => inboxOverride.apply());
  const row = globalThis.window.INBOX_DATA.THREADS[0];
  assert.match(
    row.lastAt,
    /^Sep 7/,
    `written at 1:30 AM on the 7th in Tokyo, which is the 6th in New York and in UTC: ${row.lastAt}`,
  );
  assert.ok(
    seen.some((q) => q.path === "/api/v1/workspaces"),
    "the zone was read, not guessed",
  );
});

test("a person's profile says its days by the workspace's zone", async () => {
  Object.assign(globalThis.window, { __WORKSPACES: [WORKSPACE], __ACTIVE_WORKSPACE: WORKSPACE.id });
  const detail = {
    row: row(),
    identities: [],
    conversations: [conv([msg()])],
    calls: [],
    escalations: [],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    added: { at: WROTE, source: "manual", title: null },
  };
  wire({ "GET /api/v1/contacts/k1": { person: detail } });
  const { personDetail } = await import("../../../../../apps/dashboard/src/legacy-bridge/people-detail.ts");
  const vm = await personDetail("k1");
  assert.equal(vm.about.find((a) => a.k === "Added").v, "Sep 7, 2026 · by hand");
});

test("REGRESSION: a snooze with no time asked for wakes at ten tomorrow by the business's clock -- it was ten wherever the browser was", async () => {
  Object.assign(globalThis.window, { __WORKSPACES: [WORKSPACE], __ACTIVE_WORKSPACE: WORKSPACE.id });
  const seen = wire({ "POST /api/v1/conversations/c1/snooze": { conversation: { id: "c1", state: "snoozed" } } });
  const { inboxVerb } = await import("../../../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  // 1:30 AM on the 7th in Tokyo; 12:30 PM on the 6th in New York.
  await pinned(at(WROTE), () =>
    quiet(() => inboxVerb({ conversationId: "c1", escalationId: null, who: "Aiko" }, "snooze")),
  );
  const asked = seen.find((q) => q.method === "POST" && q.path === "/api/v1/conversations/c1/snooze");
  assert.ok(asked, "the snooze was asked for");
  assert.equal(asked.body.until, "2026-09-08T01:00:00.000Z", "10 AM on the 8th in Tokyo");
});

test("the palette offers the missed-calls question for the business's today", async () => {
  const { askPalette } = await import("../../../../../apps/dashboard/src/legacy-bridge/ask/palette.ts");
  const base = { surface: "today", language: "en", needsYou: 0, heldDrafts: 0, liveNow: 0, hasCalendar: false };
  const none = C.buildAskSuggestions({ ...base, missedToday: 0 }).map((s) => s.q);
  const missedQ = C.buildAskSuggestions({ ...base, missedToday: 1 })
    .map((s) => s.q)
    .find((q) => !none.includes(q));
  const win = {
    __WORKSPACES: [WORKSPACE],
    __ACTIVE_WORKSPACE: WORKSPACE.id,
    INBOX_DATA: { THREADS: [] },
    __LIVE: { now: [], recent: [{ callId: "k1", who: "Aiko", missed: true, live: false, startedAtMs: at(WROTE) }] },
  };
  // 2 PM on the 7th in Tokyo, where the call was today; 1 AM on the 7th in New York, where it was yesterday.
  const qs = await pinned(at("2026-09-07T05:00:00Z"), () =>
    askPalette(win, null)
      .suggestions("today", null, "en")
      .map((s) => s.q),
  );
  assert.ok(
    qs.includes(missedQ),
    `REGRESSION: a call missed this morning in Tokyo counted as yesterday's: ${JSON.stringify(qs)}`,
  );
});

test("the pages read one clock, the workspace's: a time, a schedule box, when a send really goes", async () => {
  const { installClock } = await import("../../../../../apps/dashboard/src/legacy-bridge/zone.ts");
  Object.assign(globalThis.window, { __WORKSPACES: [WORKSPACE], __ACTIVE_WORKSPACE: WORKSPACE.id });
  installClock();
  const clock = globalThis.window.__clock;
  assert.equal(clock.time(at(WROTE)), "1:30 AM");
  assert.equal(clock.city(), "Tokyo");
  assert.equal(clock.inputValue(at("2026-09-15T13:30:00Z")), "2026-09-15T22:30");
  assert.equal(clock.fromInput("2026-09-15T22:30"), at("2026-09-15T13:30:00Z"));
  const late = clock.nextOpen(at("2026-09-15T13:30:00Z"));
  assert.deepEqual(
    [late.moved, iso(late.at)],
    [true, "2026-09-16T00:00:00.000Z"],
    "10:30 PM in Tokyo waits for nine the next morning there",
  );
});
