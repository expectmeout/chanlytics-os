/**
 * Every writer of a link writes an address its page opens exactly (wiring/records-not-pages, task 4.1; findings A1 and A2g).
 * A2g ran the address functions over 73 shapes and read each destination's parser by hand, and found none that fell on "No
 * surface at ..."; this keeps it true by running the writers themselves, each over a record of its kind, and reading what
 * they wrote against the dashboard's address registry (surfaces/addresses.ts: each page's own parse of what it opens):
 *
 * - the Activity log's door for every kind of thing a ledger row can be about (activityDoor);
 * - what the bell keeps: the kind's own door, a row about a thread, a call or the team, and a hold's notice;
 * - Ask's citations: a record cited before the read set held routes, and every page Ask may name;
 * - a person's page: their timeline, what is coming up, and People's own row (the thread, the visits);
 * - Today: every door its brief, its queue and its recap write;
 * - appLink, the link that leaves the app: the same path as the page's own, and the hash spelling lands there.
 *
 * "Opens exactly" is the registry's: the route names a page the frame draws (routeHasPage), the path reads back as the route
 * (routeOfPath), and the page's own parse returns the record the writer meant, by its kind and id. A writer that writes a
 * word its page does not parse fails here, naming the writer and the address.
 *
 * What this does not run: the writers that need a database (the Activity log's lookups of a message's or a deal's page,
 * server/metrics/activity.ts; Ask's readers, server/readers) or the edge (the notices it keeps: the hold's and the run's).
 * The edge's hold notice is contracts' (holdNotice, run below); the rest write the address they are handed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_SUBJECT_HOMES,
  ASK_PAGE_ROUTES,
  SERVER_NOTIFICATION_KINDS,
  activityDoor,
  appLink,
  buildNotificationFeed,
  canonicalRoute,
  citationRoute,
  emptyReadSet,
  holdNotice,
  movedAddress,
  noticeRoute,
  routeOfPath,
  toPersonRowVM,
  toPersonVM,
  toTodayVM,
  visitDoor,
  workspacePath,
} from "@chanlytics/contracts";
import { personDto } from "../consent/_person-row.mjs";

const S = "../../../../apps/dashboard/src";
const { opensRoute } = await import(`${S}/surfaces/addresses.ts`);
const { routeHasPage } = await import(`${S}/surfaces/routes.ts`);

const ID = "3f2a9c1e-5b7d-4e8a-9c0b-1d2e3f4a5b6c";
const ID2 = "9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const PERSON = "5c4b3a29-1807-4f6e-8d5c-4b3a2918f7e6";
const TZ = "America/New_York";
const NOW = Date.parse("2026-10-11T15:00:00Z");
const H = 3_600_000;
const iso = (ms) => new Date(ms).toISOString();

/**
 * One address, read as the app reads it: a page the frame has, a path that reads back as the route, a link that says the same
 * as the page's own, a hash spelling that lands on that path, and the registry's answer for what the page opens. With a `ref`
 * the page must open that record by that kind and id; without, the address must open something (a record or a view).
 */
function opensExactly(route, who, ref) {
  const where = `${who}: ${route}`;
  const path = workspacePath("acme", route);
  assert.equal(routeHasPage(canonicalRoute(route)), true, `${where} has no page the frame draws`);
  assert.equal(
    canonicalRoute(routeOfPath(path)),
    canonicalRoute(route),
    `${where}: ${path} reads back as another route`,
  );
  assert.equal(appLink("acme", route), path, `${where}: a mailed link says another path than the page's`);
  assert.equal(
    movedAddress({ pathname: "/w/acme", search: "", hash: `#/${route}` }),
    path,
    `${where}: the hash spelling lands elsewhere`,
  );
  const opened = opensRoute(route);
  assert.notEqual(opened, null, `${where}: its page opens nothing at that address`);
  if (ref) assert.deepEqual(opened, { ref }, `${where}: opens another record than the writer meant`);
  return opened;
}

/** Every string a view model holds under `to` or `route`, wherever it stands in it. */
function addressesIn(value, out = []) {
  if (Array.isArray(value)) for (const v of value) addressesIn(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if ((k === "to" || k === "route") && typeof v === "string") out.push(v);
      else addressesIn(v, out);
    }
  return out;
}

/* ----------------------------------------------------------- the Activity log */

/** What each kind of thing a ledger row is about opens, by the id the row names. */
const SUBJECT_OPENS = {
  contact: { kind: "person", id: ID },
  conversation: { kind: "conversation", id: ID },
  call: { kind: "call", id: ID },
  lead: { kind: "lead", id: ID },
  lead_search: { kind: "lead", searchId: ID },
  broadcast: { kind: "send", id: ID },
  playbook: { kind: "campaign", id: ID },
  // A sequence (0060) is its first step's id, which its campaign opens at until the Sequences page has its address.
  sequence: { kind: "campaign", id: ID },
  appointment: { kind: "visit", id: ID },
  review: { kind: "review", id: ID },
  membership: { kind: "team" },
  invitation: { kind: "team" },
  channel: { kind: "channel" },
  tenant_channel: { kind: "channel" },
  line: { kind: "channel" },
  mailbox: { kind: "channel" },
  mailbox_connection: { kind: "channel" },
  listing: { kind: "channel" },
  subscription: { kind: "billing" },
};

test("every door the Activity log writes is an address its page opens, as the record it is about", () => {
  const doors = Object.entries(ACTIVITY_SUBJECT_HOMES)
    .filter(([, home]) => "door" in home)
    .map(([type]) => type);
  assert.deepEqual(doors.sort(), Object.keys(SUBJECT_OPENS).sort(), "a kind with a door says what it opens here");
  for (const type of doors) {
    const route = activityDoor({ subject_type: type, subject_id: ID });
    assert.ok(route, `${type} has a door`);
    opensExactly(route, `activity ${type}`, SUBJECT_OPENS[type]);
  }
});

/* ---------------------------------------------------------------- the bell */

test("every kind the bell keeps opens a page: its own door, and the one a kind nobody declared falls to", () => {
  for (const kind of SERVER_NOTIFICATION_KINDS) opensExactly(noticeRoute(kind, null), `notice ${kind}`);
  opensExactly(noticeRoute("made_up", null), "a notice of a kind nobody declared");
  opensExactly(noticeRoute(null, null), "a notice of no kind");
});

test("a hold's notice, the needs-you row, the held draft, a missed call and an invitation open their thread, call and team", () => {
  const held = holdNotice({
    conversationId: ID,
    reason: "human_token",
    details: null,
    who: "Ada Lovelace",
    address: null,
    channel: "whatsapp",
    customerWords: "Can I speak to someone?",
    replyWords: null,
    pausedHours: null,
    erased: false,
  });
  opensExactly(held.route, "a hold's notice", { kind: "conversation", id: ID });

  const feed = buildNotificationFeed({
    now: NOW,
    threads: [
      {
        id: `th-${ID}`,
        real: true,
        needsYou: true,
        who: "Ada Lovelace",
        ask: null,
        waitingMin: 5,
        veto: { window: 60, endsAtMs: NOW + 30_000, messageId: "m1", draft: "Yes, Saturday works." },
      },
    ],
    calls: [
      {
        callId: ID2,
        cvId: `cv-${ID2}`,
        who: "Rosa Diaz",
        number: "+13055550101",
        direction: "inbound",
        missed: true,
        live: false,
        startedAtMs: NOW - H,
        heartbeatAtMs: NOW - H,
      },
    ],
    invites: [{ id: "i1", email: "grace@example.com", created_at: iso(NOW - 2 * H) }],
  });
  const byKind = Object.fromEntries(feed.map((item) => [item.kind, item.to]));
  assert.deepEqual(Object.keys(byKind).sort(), ["held_draft", "invite", "missed_call", "needs_you"]);
  opensExactly(byKind.needs_you, "the needs-you row", { kind: "conversation", id: ID });
  opensExactly(byKind.held_draft, "the held draft's row", { kind: "conversation", id: ID });
  opensExactly(byKind.missed_call, "the missed call's row", { kind: "call", id: ID2 });
  opensExactly(byKind.invite, "the invitation's row", { kind: "team" });
});

/* ------------------------------------------------------------------- Ask */

test("an Ask citation of a record before the read set held routes opens where its page opens it, and every page Ask may name opens", () => {
  const read = emptyReadSet();
  const cite = (kind) => citationRoute({ kind, id: ID, label: "x" }, read);
  opensExactly(cite("thread"), "a cited thread", { kind: "conversation", id: ID });
  opensExactly(cite("conversation"), "a cited conversation", { kind: "conversation", id: ID, in: "conversations" });
  opensExactly(cite("call"), "a cited call", { kind: "call", id: ID });
  opensExactly(cite("person"), "a cited person", { kind: "person", id: ID });
  assert.equal(cite("lead"), "", "a row of another kind the read set does not hold opens nowhere");
  for (const route of ASK_PAGE_ROUTES) opensExactly(route, "a page Ask may name");
});

/* ------------------------------------------------------------ a person's page */

const CAL = "+13055550133";
const call = (over = {}) => ({
  id: ID2,
  retell_call_id: "call_abc123def456",
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: CAL,
  from_raw: null,
  to_e164: "+13055550100",
  started_at: iso(NOW - 5 * H),
  ended_at: iso(NOW - 5 * H + 60_000),
  duration_ms: 60_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "They asked about Saturday.",
  wanted: "Saturday",
  outcome: null,
  follow_up: null,
  caller_name: null,
  transcript_object: [],
  recording: null,
  conversation_id: ID,
  contact_id: PERSON,
  message_id: null,
  contact: { display_name: "Cal Jones", wa_profile_name: null, phone_e164: CAL },
  ...over,
});
const visit = (id, startMs, over = {}) => ({
  id: `v-${id}`,
  start: iso(startMs),
  end: iso(startMs + H),
  title: "Colour",
  all_day: false,
  via: "phone",
  ...over,
});

test("a person's page writes addresses its pages open: their thread, their calls, a hold's thread, each visit by its row or its day", () => {
  const ahead = visit("ahead", Date.parse("2026-10-13T18:00:00Z"), { record_id: "r-ahead" });
  const unsynced = visit("unsynced", Date.parse("2026-10-16T18:00:00Z"));
  const past = visit("past", Date.parse("2026-10-01T18:00:00Z"), { record_id: "r-past", said: "kept" });
  const detail = {
    row: personDto({
      id: PERSON,
      display_name: "Cal Jones",
      phone_e164: CAL,
      visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: past },
    }),
    identities: [],
    conversations: [
      {
        id: ID,
        state: "open",
        paused_until: null,
        last_wa_inbound_at: iso(NOW - 6 * H),
        last_message_at: iso(NOW - 6 * H),
        messages: [
          {
            id: "m1",
            conversation_id: ID,
            direction: "inbound",
            sender: "customer",
            channel: "whatsapp",
            type: "text",
            body: "Is Saturday free?",
            media: null,
            meta: null,
            status: "received",
            created_at: iso(NOW - 6 * H),
          },
        ],
      },
    ],
    calls: [call()],
    escalations: [
      {
        id: "e1",
        conversation_id: ID,
        reason: "human_token",
        state: "open",
        details: null,
        created_at: iso(NOW - 6 * H),
        updated_at: iso(NOW - 6 * H),
        resolved_by_user_id: null,
      },
    ],
    decisions: [],
    receptionist_mode: null,
    workspace_reply_mode: "auto",
    visits: {
      timezone: TZ,
      source: "Google Calendar",
      state: "ok",
      next: ahead,
      last: past,
      all: [past, ahead, unsynced],
    },
  };
  const vm = toPersonVM(detail, TZ, new Date(NOW));
  const links = vm.timeline.flatMap((t) => (t.link ? [[t.kind, t.link.to]] : []));
  const toOf = (kind) => links.filter(([k]) => k === kind).map(([, to]) => to);
  for (const to of toOf("customer"))
    opensExactly(to, "their message on the timeline", { kind: "conversation", id: ID });
  for (const to of toOf("call")) opensExactly(to, "their call on the timeline", { kind: "call", id: ID2 });
  for (const to of toOf("escalation")) opensExactly(to, "a hold on the timeline", { kind: "conversation", id: ID });
  assert.equal(toOf("customer").length, 1, "the message is on the timeline");
  assert.equal(toOf("call").length, 1, "the call is on the timeline");
  assert.equal(toOf("escalation").length, 1, "the hold is on the timeline");
  const visits = toOf("visit");
  assert.equal(visits.length, 3, "each visit is a line");
  for (const to of visits) opensExactly(to, "a visit on the timeline");
  assert.deepEqual(
    visits.map((to) => opensRoute(to)),
    [
      { view: "calendar/day" },
      { ref: { kind: "visit", id: "r-ahead", day: "2026-10-13" } },
      { ref: { kind: "visit", id: "r-past", day: "2026-10-01" } },
    ],
    "a visit with a row opens it on its day; one the sync has not kept opens its day",
  );
  for (const c of vm.comingUp) opensExactly(c.to, "Coming up");
});

test("People's own row names the thread, the person and each visit by addresses their pages open", () => {
  const ahead = visit("ahead", Date.parse("2026-10-13T18:00:00Z"), { record_id: "r-ahead" });
  const past = visit("past", Date.parse("2026-10-01T18:00:00Z"), { record_id: "r-past" });
  const row = toPersonRowVM(
    personDto({
      id: PERSON,
      has_chat: true,
      latest_conversation_id: ID,
      visits: { timezone: TZ, source: "Google Calendar", state: "ok", next: ahead, last: past },
    }),
    TZ,
    new Date(NOW),
    null,
    null,
  );
  // The cells press these: the name opens the person, the chat cell the thread (columns.tsx), the Visits cell the visit.
  opensExactly(`clients/${row.id}`, "the name cell", { kind: "person", id: PERSON });
  opensExactly(`inbox/${row.threadId}`, "the chat cell", { kind: "conversation", id: ID });
  opensExactly(visitDoor(row.nextVisitDate, row.nextVisitId), "the next visit", {
    kind: "visit",
    id: "r-ahead",
    day: "2026-10-13",
  });
  opensExactly(visitDoor(row.lastVisitDate, row.lastVisitId), "the last visit", {
    kind: "visit",
    id: "r-past",
    day: "2026-10-01",
  });
});

/* ------------------------------------------------------------------- Today */

const metrics = () => ({
  workspace: { name: "Harbor Studio", timezone: TZ, status: "active" },
  channels: [
    { kind: "whatsapp", status: "active", number: "+1 305" },
    { kind: "voice", status: "active", number: "+1 786" },
  ],
  window: {
    days: 1,
    since: "2026-10-11T04:00:00Z",
    since_local: "2026-10-11T00:00:00",
    now_local: "2026-10-11T11:00:00",
  },
  now: {
    escalations_open: 1,
    oldest_open_escalation_at: iso(NOW - 2 * H),
    threads_needing_human: 1,
    threads_snoozed: 0,
    threads_awaiting_reply: 0,
    last_inbound_at: iso(NOW - H),
    last_outbound_at: iso(NOW - H),
  },
  period: {
    messages_in: 5,
    messages_out_ai: 4,
    messages_out_you: 0,
    conversations_active: 3,
    answered_by_ai: 4,
    answered_by_you: 0,
    unanswered_in_window: 0,
    median_reply_seconds_ai: 40,
    send_failures: 1,
    escalations_new: 1,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 60,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
});
const thread = (id, over = {}, messages = []) => ({
  id,
  state: "needs_human",
  paused_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: iso(NOW - 2 * H),
  last_message_at: iso(NOW - H),
  contact: {
    id: `c-${id}`,
    display_name: "Ada Lovelace",
    wa_profile_name: null,
    phone_e164: "+17865550181",
    consent: "opted_in",
    dnc: false,
  },
  messages,
  ...over,
});
const message = (id, conversation, over = {}) => ({
  id,
  conversation_id: conversation,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Can I move Saturday?",
  media: null,
  meta: null,
  status: "received",
  created_at: iso(NOW - 2 * H),
  ...over,
});

test("every door Today writes -- its queue, its recap, its figures -- is an address its page opens", () => {
  const failed = thread(ID2, { state: "open" }, [
    message("m1", ID2),
    message("m2", ID2, {
      direction: "outbound",
      sender: "ai",
      body: "Yes, Saturday at 3 works.",
      status: "failed",
      created_at: iso(NOW - H),
    }),
  ]);
  const vm = toTodayVM(
    metrics(),
    [thread(ID, {}, [message("m0", ID)]), failed],
    [
      {
        id: "e1",
        reason: "human_token",
        details: null,
        state: "open",
        created_at: iso(NOW - 2 * H),
        conversation_id: ID,
      },
    ],
    [call()],
    new Date(NOW),
  );
  const doors = [...new Set(addressesIn(vm))];
  assert.ok(doors.includes(`inbox/th-${ID}`), "the waiting thread is a door");
  assert.ok(doors.includes(`inbox/th-${ID2}`), "the reply that failed is a door to its thread");
  for (const to of doors) opensExactly(to, "Today");
});
