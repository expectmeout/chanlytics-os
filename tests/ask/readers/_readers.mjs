/**
 * The world the tests of readers/ share: the readers every route and Ask's tools read through, over the database
 * in\nmemory. Split by behaviour from readers.test.mjs on 25 Nov 2026 (layer 14: a test file over 1,600 lines is
 * two\nfiles); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * The reader kernel (Ask Rewired Phase 1, spec 5.1): one read per turn per
 * reader and arguments, a failure never kept, the tenant's facts kept across
 * turns for five minutes per workspace and person, and the reader context a
 * route or a turn builds. Then the day's readers (PR 1.2): each GET route's
 * body, answering what the route's own test asserts, with the rows a citation
 * may name; and the Inbox and Today as the page composes them. Executed over
 * the database in memory.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { newReceptionistDefaults } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { fieldsOf, logLineOf } from "../../_log-lines.mjs";
import { PLAN } from "../../_lead-fixtures.mjs";
import { QUIET, SERIES } from "../../reports/people/_people-world.mjs";
import { NOW as LEDGER_NOW, SERIES as LEDGER, STUCK } from "../../reports/campaigns/_campaign-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const kernel = await import(at("apps/dashboard/src/server/shared/reader.ts"));

export const {
  facts,
  appointmentWord,
  hasDeals,
  policies,
  config,
  businessShape,
  channelsReady: channelsReadyReader,
} = await import(at("apps/dashboard/src/server/readers/facts.ts"));

export const { metrics } = await import(at("apps/dashboard/src/server/readers/metrics.ts"));

export const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));

export const { escalations } = await import(at("apps/dashboard/src/server/readers/escalations.ts"));

export const { calls } = await import(at("apps/dashboard/src/server/readers/calls.ts"));

export const { searches } = await import(at("apps/dashboard/src/server/readers/searches.ts"));

export const { inbox } = await import(at("apps/dashboard/src/server/readers/inbox.ts"));

export const { today } = await import(at("apps/dashboard/src/server/readers/today.ts"));

// Named apart from the fixtures below that build a conversation's and a message's rows.
export const { conversation: oneThread, messagesOf } = await import(
  at("apps/dashboard/src/server/readers/conversation.ts")
);

export const { call: oneCall } = await import(at("apps/dashboard/src/server/readers/call.ts"));

export const { person: onePerson } = await import(at("apps/dashboard/src/server/readers/person.ts"));

export const threadRoute = await import(at("apps/dashboard/app/api/v1/conversations/[id]/route.ts"));

export const personRoute = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

export const {
  report: reportReader,
  reviewsReport,
  receptionistReport,
  peopleReport,
} = await import(at("apps/dashboard/src/server/readers/report.ts"));

export const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));

export const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

export const { campaignReport, campaignLedgerReport } = await import(
  at("apps/dashboard/src/server/readers/campaign-report.ts")
);

export const reportsRoute = await import(at("apps/dashboard/app/api/v1/reports/route.ts"));

export const campaignsRoute = await import(at("apps/dashboard/app/api/v1/reports/campaigns/route.ts"));

export const ledgerRoute = await import(at("apps/dashboard/app/api/v1/reports/campaigns/ledger/route.ts"));

export const reviewsRoute = await import(at("apps/dashboard/app/api/v1/reports/reviews/route.ts"));

export const receptionistRoute = await import(at("apps/dashboard/app/api/v1/reports/receptionist/route.ts"));

export const peopleRoute = await import(at("apps/dashboard/app/api/v1/reports/people/route.ts"));

export const googleRoute = await import(at("apps/dashboard/app/api/v1/google/route.ts"));

export const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

export const { getCalendarWeek } = await import(at("apps/dashboard/src/server/calendar/week/week.ts"));

export const { forgetFeeds, getOpenings } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));

export const { openings: openingsReader } = await import(at("apps/dashboard/src/server/readers/openings.ts"));

export const openingsRoute = await import(at("apps/dashboard/app/api/v1/ask/openings/route.ts"));

export const { calendar: calendarReader, sources: calendarSources } = await import(
  at("apps/dashboard/src/server/readers/calendar.ts")
);

export const calendarRoute = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));

export const { people: peopleReader } = await import(at("apps/dashboard/src/server/readers/people.ts"));

export const { lists: listsReader } = await import(at("apps/dashboard/src/server/readers/lists.ts"));

export const {
  broadcasts: broadcastsReader,
  broadcastTouches: touchesReader,
  broadcast: oneBroadcast,
} = await import(at("apps/dashboard/src/server/readers/broadcasts.ts"));

export const contactsRoute = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));

export const listCountsRoute = await import(at("apps/dashboard/app/api/v1/people/list-counts/route.ts"));

export const segmentsRoute = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));

export const broadcastsRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/route.ts"));

export const touchesRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/touches/route.ts"));

/**
 * 3 Oct 2026: what a workspace's campaigns have sent by email and by text this calendar month, which the Campaigns head
 * and the composers say (`month_sent`, server/campaigns/month-sent.ts): a function only the service role may call, so the
 * readers reach it through the service client, here a double that counts 1,240 emails and 12 texts.
 */
export const MONTH_SENT = { email: 1240, sms: 12 };

setServiceClient(fakeDb({}, {}, { campaign_month_sent: ({ p_channel }) => MONTH_SENT[p_channel] }));

export const broadcastRoute = await import(at("apps/dashboard/app/api/v1/broadcasts/[id]/route.ts"));

export const { listEveryone } = await import(at("apps/dashboard/src/server/people/people.ts"));

export const { audiencePool: audiencePoolReader } = await import(
  at("apps/dashboard/src/server/readers/audience-pool.ts")
);

export const { getAudiencePool: audiencePoolOf, findPoolList } = await import(
  at("apps/dashboard/src/server/campaigns/audience.ts")
);

export const { findChannelsReadyOrNull } = await import(at("apps/dashboard/src/server/campaigns/channels-ready.ts"));

export const { everyone: everyoneReader } = await import(at("apps/dashboard/src/server/readers/everyone.ts"));

export const { playbooks: playbooksReader } = await import(at("apps/dashboard/src/server/readers/playbooks.ts"));

export const playbooksRoute = await import(at("apps/dashboard/app/api/v1/playbooks/route.ts"));

export const { getBroadcast } = await import(at("apps/dashboard/src/server/campaigns/broadcasts/broadcasts.ts"));

export const { settings: settingsReader } = await import(at("apps/dashboard/src/server/readers/settings.ts"));

export const { connections } = await import(at("apps/dashboard/src/server/readers/connections.ts"));

export const { notifications: notificationsReader } = await import(
  at("apps/dashboard/src/server/readers/notifications.ts")
);

export const { activity: activityReader } = await import(at("apps/dashboard/src/server/readers/activity.ts"));

export const { channels: channelsReader } = await import(at("apps/dashboard/src/server/readers/channels.ts"));

export const { autonomy } = await import(at("apps/dashboard/src/server/readers/autonomy.ts"));

export const settingsRoute = await import(at("apps/dashboard/app/api/v1/settings/route.ts"));

export const setupRoute = await import(at("apps/dashboard/app/api/v1/setup/route.ts"));

export const notificationsRoute = await import(at("apps/dashboard/app/api/v1/notifications/route.ts"));

export const activityRoute = await import(at("apps/dashboard/app/api/v1/activity/route.ts"));

export const channelsRoute = await import(at("apps/dashboard/app/api/v1/channels/route.ts"));

export const policiesRoute = await import(at("apps/dashboard/app/api/v1/policies/route.ts"));

export const { setupDtoFor } = await import(at("apps/dashboard/src/server/setup/setup.ts"));

export const { templates: templatesReader } = await import(at("apps/dashboard/src/server/readers/templates.ts"));

export const templatesRoute = await import(at("apps/dashboard/app/api/v1/templates/route.ts"));

// The kept values live in the module, keyed by workspace, person and reader: each test starts with none.
beforeEach(() => kernel.readerCache.clear());

// The aggregate routes count against their bucket: this instance's memory, never a store dialled.
beforeEach(() => setRateStore(memoryStore()));

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const USER = "u1";

export const ctxFor = (tables) => ({
  supabase: fakeDb(tables, {}),
  userId: USER,
  email: "ada@example.com",
  metadata: {},
});

export const tables = () => ({
  tenants: [
    { id: A, name: "Harbor", timezone: "America/New_York" },
    { id: B, name: "Bayside", timezone: "Europe/Madrid" },
  ],
  tenant_config: [{ tenant_id: A, config: { hours: "9-5" }, version: 3 }],
  policies: [],
});

/** A reader that counts its reads and can be told to fail. */
export const counting = (name, opts = {}) => {
  const r = {
    name,
    reads: 0,
    ...(opts.ttlMs ? { ttlMs: opts.ttlMs } : {}),
    async read(rc, args) {
      r.reads++;
      if (opts.fail && r.reads === 1) throw new Error("first read fails");
      return {
        data: { args, tenant: rc.tenantId },
        rows: [{ kind: "page", id: "today", route: "today", label: "Today" }],
        stamp: Date.now(),
      };
    },
  };
  return r;
};

/* ----------------------------------------------- the day's readers (PR 1.2) */

export const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

export const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

export const L1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";

export const L2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

export const L3 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3";

export const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

export const R1 = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb";

export const HOUR = 3_600_000;

export const ago = (ms) => new Date(Date.now() - ms).toISOString();

export const uuid = (i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`;

/** A request's database: the doors it may call, the reads that fail, PostgREST's row cap. */
export const dayCtx = (tbls, { rpcs = {}, faults = {}, opts = {} } = {}) => ({
  supabase: fakeDb(tbls, faults, rpcs, opts),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** The context a route builds from the membership it resolved. */
export const turnIn = (ctx, tenantId = A) => kernel.readerContext(ctx, { tenantId, role: "viewer" });

export const selects = (ctx, table) => ctx.supabase.seen.filter((q) => q.table === table && q.op === "select");

/** A read of the holds that have closed (db listLastClosedHolds), which the threads' read asks beside their messages. */
export const closedHolds = (q) => q.filters.some(([op, col, v]) => op === "eq" && col === "state" && v === "resolved");

/** The reads of the open escalations, apart from the closed holds the threads' read asks. */
export const openHolds = (ctx) => selects(ctx, "escalations").filter((q) => !closedHolds(q));

// The rows as the route tests build them (inbox-server, inbox-routes, lead-routes), so each reader answers their fixture.
export const contact = (over = {}) => ({
  id: "k1",
  display_name: "Ada",
  wa_profile_name: null,
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  ...over,
});

export const conversation = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  state: "needs_human",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contact_id: "k1",
  contacts: contact(),
  ...over,
});

export const message = (id, conversation_id, tenant_id, over = {}) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "hi",
  media: null,
  meta: null,
  status: "received",
  channel: "whatsapp",
  channel_ts: ago(HOUR),
  created_at: ago(HOUR),
  ...over,
});

export const call = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  retell_call_id: `rc-${id.slice(-1)}`,
  direction: "inbound",
  call_type: "inbound",
  status: "ended",
  from_e164: "+15550000001",
  from_raw: null,
  to_e164: "+15550000002",
  started_at: "2026-09-01T00:00:00Z",
  ended_at: null,
  updated_at: null,
  duration_ms: null,
  disconnection_reason: null,
  sentiment: null,
  call_successful: null,
  in_voicemail: null,
  summary: null,
  conversation_id: C1,
  recording: null,
  ...over,
});

export const view = (over = {}) => ({
  id: S1,
  tenant_id: A,
  name: "Trainers",
  asked: "",
  via: "people",
  plan: PLAN,
  removed_at: null,
  created_at: "2026-09-19T00:00:00Z",
  round_id: R1,
  seq: 1,
  purpose: "probe",
  state: "waiting_on_owner",
  ending: null,
  question: { sentence: "…", criterionKey: "chains", dropTerm: null, asked_at: "2026-09-19T00:00:00Z" },
  answered: null,
  target: 20,
  plan_version: 1,
  qualified: 12,
  review: 0,
  excluded: 13,
  counted: 12,
  judge_tokens: 900,
  ending_pending: null,
  waiting_since: null,
  ended_at: null,
  emails_checked: 0,
  with_phone: 0,
  undo_op_id: null,
  undo_version: null,
  ...over,
});

export const COUNTS = { all: 322, ready: 272, nurture: 31, converted: 9, said_no: 6, not_a_fit: 4 };

/* -------------------------------------- the Inbox and Today, as the page composes them */

/**
 * What `fn` logged under one event name, at error or warn: a logger line's fields (src/server/shared/log.ts, and the packages',
 * which write through the same logger), or a positional line's values after its name.
 */
export async function logged(event, fn) {
  const lines = [];
  const was = { error: console.error, warn: console.warn };
  const hear = (...args) => {
    const line = logLineOf(args);
    if (line) {
      if (line.event === event) lines.push(fieldsOf(line));
    } else if (args[0] === event) lines.push(args.slice(1));
  };
  console.error = console.warn = hear;
  try {
    return { result: await fn(), lines };
  } finally {
    console.error = was.error;
    console.warn = was.warn;
  }
}

/**
 * A workspace a hundred and one threads deep: the newest hundred, and one gone quiet that still waits on a person.
 * Two open escalations, the newer on a thread among the hundred, the older on the quiet one.
 */
export const OUTSIDE = uuid(100);

export const dayTables = () => ({
  conversations: [
    ...Array.from({ length: 100 }, (_, i) => conversation(uuid(i), A, { last_message_at: ago(i * HOUR) })),
    conversation(OUTSIDE, A, {
      last_message_at: ago(200 * HOUR),
      contacts: contact({ id: "k9", display_name: "Quinn", phone_e164: "+15550000009" }),
    }),
  ],
  messages: [message("m3", uuid(3), A), message("m-out", OUTSIDE, A, { created_at: ago(200 * HOUR) })],
  escalations: [
    {
      id: "e-in",
      tenant_id: A,
      state: "open",
      reason: "price",
      details: null,
      created_at: ago(HOUR),
      conversation_id: uuid(3),
    },
    {
      id: "e-out",
      tenant_id: A,
      state: "open",
      reason: "human_token",
      details: null,
      created_at: ago(2 * HOUR),
      conversation_id: OUTSIDE,
    },
  ],
  calls: [
    call(L1, A, { started_at: "2026-09-01T00:00:00Z" }),
    call(L2, A, {
      started_at: "2026-09-02T00:00:00Z",
      contacts: { display_name: "Dana", wa_profile_name: null, phone_e164: "+15550000003" },
    }),
  ],
  lead_searches_view: [view()],
});

// The day's window, which every summary carries: what AI booked today is read from its start.
export const SUMMARY = {
  period: { messages_in: 2 },
  window: { days: 1, since: "2026-09-18T07:00:00Z", since_local: "2026-09-18", now_local: "2026-09-18" },
};

export const dayDoors = { metrics_summary: () => SUMMARY, lead_list_counts: () => COUNTS };

/* -------------------------------------------------- the thread and the call (PR 1.3) */

export const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});

/**
 * inbox-routes.test.mjs, "one thread: any member reads it where it lives": two threads of bayside, a member of both
 * workspaces (a viewer in harbor, an operator in bayside), and the thread's two messages beside the other's one.
 */
export const threadTables = () => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  conversations: [conversation(C1, B), conversation(C2, B)],
  messages: [
    message("m1", C1, B, { created_at: "2026-09-01T00:00:00Z", body: "first" }),
    message("m2", C1, B, { created_at: "2026-09-02T00:00:00Z", body: "second", direction: "outbound", sender: "ai" }),
    message("m3", C2, B, { created_at: "2026-09-03T00:00:00Z", body: "elsewhere" }),
  ],
});

/** A GET's request: `q` is its query string. */
export const req = (q = "") => new Request(`http://localhost/api/v1/x${q}`);

/** A route's context over `tbls`, for the row `id` names. */
export const routeCtx = (tbls, id) => ({
  supabase: fakeDb(tbls, {}),
  userId: USER,
  email: "ada@example.com",
  params: { id },
});

/* ------------------------------------------------------------------------- the person (PR 1.4) */

export const P1 = "11111111-1111-4111-8111-111111111111";

export const P2 = "22222222-2222-4222-8222-222222222222";

export const pol = (tenant_id, subject_type, subject_id, mode) => ({
  tenant_id,
  class: "reply",
  subject_type,
  subject_id,
  mode,
});

/** A row as people_list answers it. */
export const personRow = (id, over = {}) => ({
  id,
  display_name: "Ada",
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  ...over,
});

/**
 * people/routes/, "one person in full": harbor's person with the owner's notes, a WhatsApp identity, their own
 * reply mode and the workspace's, where they came from, their consent changes beside another person's and another
 * kind, and the workspace's booking link; the member is in harbor and bayside. `threads` gives them two threads, the
 * newer with a message, and a call.
 */
export const personTables = ({ threads = false } = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
  ],
  contacts: [
    {
      id: P1,
      tenant_id: A,
      phone_e164: "+15550000001",
      display_name: "Ada",
      erased_at: null,
      marketing_consent: null,
      notes: "Sees Sofia",
    },
  ],
  contact_identities: [
    { contact_id: P1, channel: "whatsapp", external_id: "15550000001", created_at: "2026-08-01T00:00:00Z" },
  ],
  conversations: threads
    ? [
        conversation(C1, A, { contact_id: P1, contacts: contact({ id: P1 }) }),
        conversation(C2, A, { contact_id: P1, contacts: contact({ id: P1 }), last_message_at: ago(2 * HOUR) }),
      ]
    : [],
  messages: threads ? [message("m1", C1, A)] : [],
  calls: threads
    ? [
        call(L1, A, {
          contact_id: P1,
          contacts: { display_name: "Ada", wa_profile_name: null, phone_e164: "+15550000001" },
        }),
      ]
    : [],
  policies: [pol(A, null, null, "auto"), pol(A, "contact", P1, "ask")],
  events: [
    {
      tenant_id: A,
      kind: "contact.added",
      subject_type: "contact",
      subject_id: P1,
      data: { source: "calendar", title: "Colour" },
      created_at: "2026-08-01T00:00:00Z",
    },
    {
      id: "ev-1",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P1,
      data: {
        consent: "opted_in",
        source: "customer_message",
        channel: "sms",
        message_external_id: "SM123",
        words: "START",
      },
      created_at: "2026-08-02T00:00:00Z",
    },
    {
      id: "ev-2",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P1,
      data: { purpose: "marketing", consent: "opted_in", source: "form", note: "signed 2 Sep", by: "u-ada" },
      created_at: "2026-08-03T00:00:00Z",
    },
    {
      id: "ev-3",
      tenant_id: A,
      kind: "contact.consent_changed",
      subject_type: "contact",
      subject_id: P2,
      data: { consent: "opted_out", source: "customer_message" },
      created_at: "2026-08-04T00:00:00Z",
    },
    {
      id: "ev-4",
      tenant_id: A,
      kind: "message.sent",
      subject_type: "message",
      subject_id: "m-1",
      data: {},
      created_at: "2026-08-05T00:00:00Z",
    },
  ],
  tenant_config: [{ tenant_id: A, config: { brain: { booking_link: " https://book.example/marisa " } } }],
  tenants: [],
});

/**
 * A request for the person `id` names, over `tbls`, `faults` failing a read: people_list answers harbor's P1 alone.
 * `opts` are the fake's (maxRows: PostgREST's cap on every select).
 */
export const personCtx = (tbls, id, faults = {}, opts = {}) => ({
  supabase: fakeDb(
    tbls,
    faults,
    { people_list: (a) => (a.p_tenant_id === A && a.p_contact_id === P1 ? [personRow(P1)] : []) },
    opts,
  ),
  userId: USER,
  email: "ada@example.com",
  params: { id },
});

/** GET contacts/:id's payload keys at origin/main (fad8b7ea), in its order. */
export const PERSON_KEYS = [
  "row",
  "identities",
  "conversations",
  "calls",
  "escalations",
  "decisions",
  "receptionist_mode",
  "workspace_reply_mode",
  "visits",
  "notes",
  // 25 Oct 2026 (decision 0073, R22): what a booking tool's client file said of them before Chanlytics, beside the notes.
  "before",
  "person_notes",
  "proposal_url",
  "booking_link",
  "consent_history",
  "campaigns",
  "sequences",
  "lead",
  "doubts",
  "deals",
  // 18 Oct 2026 (0008, amended): what the workspace calls an appointment, where whether deals were on was answered.
  "appointment_word",
  "deal_pace",
  "services",
  "consult_first",
  "added",
  // Since #1566 (decision 0052): the business they work at, and the signers of their replies still offered or taken.
  "business",
  "signers",
];

/**
 * Every read GET contacts/:id made at origin/main (fad8b7ea) for one person with threads, by table, and since 00344 the
 * open doubts naming them (person_doubts, decision 0034 step 4), read in the same round.
 */
export const PERSON_READS = {
  "rpc:people_list": 1,
  "contact_identities.select": 1,
  "conversations.select": 1,
  "calls.select": 1,
  // Their own receptionist mode, and the workspace's.
  "policies.select": 2,
  // Where they came from, and every change to either answer.
  "events.select": 2,
  "contacts.select": 1,
  // The calendar's own lookup, and the booking link and the services.
  "tenant_config.select": 2,
  // The calendar's zone, and what the workspace calls an appointment.
  "tenants.select": 2,
  "leads.select": 1,
  // Their deals, and the workspace's pace.
  "deals.select": 2,
  "sequence_sends.select": 1,
  // The sequences they are in now (decision 0060, S5); with none, their names are never asked.
  "sequence_enrollments.select": 1,
  // What an occasion enrolled them for and has not sent yet (decision 0119).
  "sequence_occasions.select": 1,
  "person_doubts.select": 1,
  "person_notes.select": 1,
  // The signers of their replies (db listSigners, decision 0052, #1566).
  "sequence_replies.select": 1,
  "messages.select": 1,
  "escalations.select": 1,
  "decisions.select": 1,
};

/** How many times each table (or door) was asked, whatever for. */
export const readsOf = (ctx) => {
  const n = {};
  for (const q of ctx.supabase.seen) {
    const k = q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`;
    n[k] = (n[k] ?? 0) + 1;
  }
  return n;
};

export const notHere = (e) => {
  assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "This person is not in your workspace."]);
  return true;
};

/* ------------------------------------------------------------------------ the reports (PR 1.5) */

/** A member of harbor and bayside, viewing both, as ask-routes' reports fixtures hold them. */
export const reportMembers = () => [
  membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
  membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
];

export const series = (a) => ({ days: a.p_days, tenant: a.p_tenant_id });

/** ask/routes/, "the reports: the three presets and no other": nobody in People, no calendar, no deals. */
export const presetsWorld = () => ({
  tables: { memberships: reportMembers(), tenants: [], tenant_config: [], policies: [] },
  rpcs: {
    report_series: series,
    campaign_series: (a) => (a.p_tenant_id === A ? { days: a.p_days } : { error: "no" }),
    people_list: () => [],
  },
});

export const CLIENT = "cccccccc-cccc-4ccc-8ccc-cccccccccc01";

/**
 * ask/routes/, "the reports' Deals section": one page of People, whose one row says the client came from a
 * lead, and their deal, won five days ago at $2,500 a month.
 */
export const dealsWorld = () => ({
  tables: {
    memberships: reportMembers(),
    tenants: [{ id: A, slug: "harbor" }],
    tenant_config: [],
    policies: [],
    deals: [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddd01",
        tenant_id: A,
        contact_id: CLIENT,
        stage: "won",
        proposed_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        amount_cents: 250_000,
        per: "month",
      },
    ],
  },
  rpcs: { report_series: series, people_list: () => [{ id: CLIENT, came_from: "lead" }] },
});

/** A request's database over a world, `faults` failing a read the way PostgREST fails. */
export const worldCtx = (w, faults = {}) => ({
  supabase: fakeDb(w.tables, faults, w.rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** Every query in the order it reached the database: a door by name, a table by what was done to it. */
export const asked = (ctx) => ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`));

export const noReport = (e) => {
  assert.deepEqual([e.code, e.status, e.message], ["not_found", 404, "No workspace found for this report."]);
  return true;
};

/** report_series's answer for a period: no day counted, `replies` each reply the receptionist sent (00304 gives each its hold). */
export const replyReport =
  (replies, extra = {}) =>
  (a) => ({
    timezone: "America/New_York",
    days: a.p_days,
    span_days: a.p_days * 2,
    today: "2026-09-14",
    series: [],
    reasons: {},
    reply_seconds: replies.map((r) => r.s),
    sentiments: {},
    voicemail: 0,
    replies,
    ...extra,
  });

export const sixtyHeld = Array.from({ length: 14 }, () => ({ day: "2026-09-14", s: 63, hold: 60 }));

/** What Ask's report tool says over a world whose report_series answers `payload`, as a member of harbor. */
export async function askReport(payload) {
  const w = presetsWorld();
  w.rpcs.report_series = payload;
  const t = newToolContext(worldCtx(w), A, "viewer", "America/New_York", new Date("2026-09-14T14:00:00Z"));
  const out = await runTool(t, { name: "report", input: { period: "7d" } });
  assert.equal(out.isError, false);
  return JSON.parse(out.result);
}

export const replyTileOf = (said) => said.tiles.find((x) => x.label === "Median reply time");

/**
 * What a report asked, each read once, whatever order the database stand-in heard them in: the series, the booking
 * line and the deals are asked for together (readers/report.ts, 9 Oct 2026: one after the other they were the slowest
 * read the dashboard makes), so only the first has a place of its own, and it is the series.
 */
export const readTogether = (list) => [...list].sort();

/**
 * The reviews' report's world: Harbor Studio on Google, in Auckland (thirteen hours ahead of UTC in October, so its day
 * and UTC's can differ), its Business Profile synced. `a` is a profile review with a reply the receptionist wrote, `b` one
 * that waits, `c` one of the five the public listing shows.
 */
export const REVIEW_A = "ffffffff-ffff-4fff-8fff-ffffffffff01";

export const REVIEW_B = "ffffffff-ffff-4fff-8fff-ffffffffff02";

export const REVIEW_C = "ffffffff-ffff-4fff-8fff-ffffffffff03";

export const googleRow = (id, published, over = {}) =>
  rows.googleReview({
    id,
    tenant_id: A,
    review_id: `g-${id.slice(-2)}`,
    rating: 5,
    author: "Ana P.",
    body: "Fast, careful, and on time.",
    published_at: published,
    first_seen_at: published,
    last_seen_at: published,
    ...over,
  });

/** What reviews_ledger answers for a workspace with the profile's two reviews: the database counts in SQL (google-reviews-ledger.db.test.mjs holds the function), the day in Auckland, where 14:00 UTC on 6 October is already the 7th. */
export const waitingRow = () => {
  const {
    tenant_id: _tenant,
    last_seen_at: _seen,
    ...drawn
  } = googleRow(REVIEW_B, "2026-10-05T09:00:00Z", { rating: 2 });
  return { ...drawn, held: null };
};

export const reviewsLedgerOf = (args, { listing = true } = {}) =>
  listing
    ? {
        timezone: "Pacific/Auckland",
        today: "2026-10-07",
        days: args.p_days,
        on_record: { profile: 2, places: 1, complete: true },
        written: [
          { id: REVIEW_A, d: "2026-10-04", rating: 5, replied: true, secs: 21_600, by: "receptionist" },
          { id: REVIEW_B, d: "2026-10-06", rating: 2, replied: false, secs: null, by: null },
        ],
        waiting_total: 1,
        waiting: [waitingRow()],
      }
    : {
        timezone: "Pacific/Auckland",
        today: "2026-10-07",
        days: args.p_days,
        on_record: { profile: 0, places: 0, complete: false },
        written: [],
        waiting_total: 0,
        waiting: [],
      };

export const reviewsWorld = ({ listing = true, synced = true } = {}) => ({
  tables: {
    memberships: reportMembers(),
    tenants: [{ id: A, slug: "harbor", name: "Harbor Studio", timezone: "Pacific/Auckland" }],
    tenant_config: [],
    policies: [
      {
        id: "p-reviews",
        tenant_id: A,
        class: "reviews",
        mode: "auto",
        subject_type: null,
        subject_id: null,
        limits: {},
        updated_at: "2026-10-01T00:00:00Z",
      },
    ],
    google_listings: listing
      ? [
          rows.googleListing({
            tenant_id: A,
            address: "1 Dock Street",
            maps_uri: "https://maps.example.com/harbor",
            business_status: "OPERATIONAL",
            rating: 4.8,
            review_count: 213,
            linked_at: "2026-08-01T12:00:00Z",
            checked_at: "2026-10-06T12:00:00Z",
          }),
        ]
      : [],
    google_connections: listing
      ? [
          rows.googleConnection({
            tenant_id: A,
            google_email: "owner@example.com",
            account_title: "Harbor Studio",
            location_name: "locations/1",
            location_title: "Harbor Studio",
            connected_at: "2026-08-01T12:00:00Z",
            last_synced_at: synced ? "2026-10-06T12:00:00Z" : null,
          }),
        ]
      : [],
    // A review and a day's reading hang off the listing (a foreign key that cascades): none without one.
    google_reviews: listing
      ? [
          googleRow(REVIEW_A, "2026-10-03T14:00:00Z", {
            reply_text: "Thank you, Ana!",
            replied_at: "2026-10-03T20:00:00Z",
          }),
          googleRow(REVIEW_B, "2026-10-05T09:00:00Z", { rating: 2 }),
          googleRow(REVIEW_C, "2026-10-04T09:00:00Z", { origin: "places" }),
        ]
      : [],
    // The day before the machine's own, so the 92 days the Google read keeps always hold it.
    google_listing_days: listing
      ? [
          {
            tenant_id: A,
            day: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
            rating: 4.8,
            review_count: 213,
          },
        ]
      : [],
    events: [],
  },
  rpcs: { reviews_ledger: (args) => reviewsLedgerOf(args, { listing }) },
});

/* ----------------------------------------------------------------------- the calendar (PR 1.5) */

/** calendar-feed.test.mjs's clock: Tuesday noon in New York. */
export const CAL_NOW = new Date("2026-09-08T16:00:00.000Z");

/** calendar-feed.test.mjs's one appointment: Ana Ruiz, with her number in its words, on the Tuesday afternoon. */
export const ONE_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:a1",
  "SUMMARY:Ana Ruiz · Balayage",
  "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T153000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const calProfile = {
  hours: {
    mon: { open: "09:00", close: "18:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: {},
    sun: {},
  },
  closures: [],
  services: [{ name: "Balayage", duration_min: 90 }],
  booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
};

/** calendar-feed.test.mjs, tables(url, role): harbor's calendar at `url` (none when null), its hours, its one service. */
export const calTables = (url, role = "owner") => ({
  memberships: [membership(A, role, "harbor", "2026-01-01T00:00:00Z")],
  tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        ...(url ? { calendar: { ical_url: url } } : {}),
        brain: {
          business_name: "Harbor",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile: calProfile,
        },
      },
    },
  ],
  policies: [],
});

/** A request over `t`: People as `people` answers them, and the door that puts a person in People, each call kept. */
export const calCtx = (t, people = () => [], made = []) => ({
  supabase: fakeDb(
    t,
    {},
    {
      people_list: people,
      create_person: (a) => {
        made.push(a);
        return { contact_id: "p1", existed: false };
      },
    },
  ),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** The network, scripted for `fn`: every calendar answers `answer`, each fetch kept; no feed is remembered past it. */
export async function withFeed(answer, fn) {
  const was = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    return new Response(answer.body, { status: answer.status ?? 200, headers: { "content-type": "text/calendar" } });
  };
  forgetFeeds();
  try {
    return await fn(fetched);
  } finally {
    globalThis.fetch = was;
    forgetFeeds();
  }
}

/** A turn on calendar-feed's clock. */
export const calIn = (ctx, role = "viewer") => kernel.readerContext(ctx, { tenantId: A, role }, CAL_NOW);

export const WEEK = { from: "2026-09-07", days: 7 };

/** Ana in People, by the number her appointment carries. */
export const ANA = {
  id: "k-ana",
  display_name: "Ana Ruiz",
  wa_profile_name: null,
  phone_e164: "+19175550100",
  email: null,
};

export const tuesday = (week) => week.days.find((d) => d.key === "2026-09-08");

/**
 * The record's five reads (its rows over the span, in two since 00397: the bookings whole and the feed's rows by key;
 * the notices' latest and their held count; the mailbox) are asked for together and waited for together
 * (calendar/week/week.ts recordOverSpan, 9 Oct 2026: one after the other they were round trips the board stood behind). Which
 * is heard first is the database stand-in's to say, not the route's, so the five are put in one order before what was
 * asked is compared: every read is still there, once, with its columns, and everything before and after them is still
 * in its own order. `at` is where the five begin.
 */
export const recordTogether = (asked, at) => [
  ...asked.slice(0, at),
  ...asked.slice(at, at + 5).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ...asked.slice(at + 5),
];

/**
 * Every query GET calendar asked at origin/main (c39ce689) for an owner over calendar-feed's one appointment with
 * nobody in People yet, in order, with the columns it selected: the workspace's door, the zone, the settings, everyone
 * with their reply modes. It then put the person the feed names in People (create_person); since decision 0047 (lane 6)
 * a read of the board writes nothing, for any role, and that last call is gone.
 */
export const CALENDAR_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // Since 00345: the record's rows over the span and the notices' health line (the latest, and the held count), read
  // beside the feed before everyone is (docs/plans/2026-10-07-bookings-arrive-by-email.md); since 00397 the span's
  // record is two reads (findVisitsOver): the bookings whole, and the feed's rows as ids and statuses by key, with the lead
  // each one's person was found as (00426) and whose it is (0119). Nothing here names a lead or was missed: neither is read.
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at, lead_id, contact_id"],
  ["appointment_notices.select", "tool, received_at"],
  ["appointment_notices.select", "id"],
  // The workspace's address the tool is to send to, and Gmail's pending confirmation of a forward here.
  ["mailboxes.select", "*"],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  // Since 3 Nov 2026, so Today's day can say when each person was last in: the record over the season, which each
  // person's visits join (people-visits.ts findPoolRecord, getBoardVisits): a booking's rows whole, and the feed's rows a
  // member said a word of. Nobody here is in People, so nobody comes for a first visit and the record before the season
  // is not asked.
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  // Once the feed has read: the record's taken time over the days on offer, which the open times subtract beside the
  // feed's (record-busy.ts). Asked here because this week does not cover a fortnight's offer; the board's first window does.
  ["appointments.select", "*"],
];

/* ------------------------------------------------------------ the Receptionist lens (Reports, C2) */

export const LINKS_URL = "https://cal.example/links.ics";

/** Bo, Cy and Dee beside Ana (above): People as people_list answers it, each with the number a visit of theirs would carry. */
export const BO = {
  id: "k-bo",
  display_name: "Bo Example",
  wa_profile_name: null,
  phone_e164: "+19175550101",
  email: null,
};

export const CY = {
  id: "k-cy",
  display_name: "Cy Example",
  wa_profile_name: null,
  phone_e164: "+19175550102",
  email: null,
};

export const DEE = {
  id: "k-dee",
  display_name: "Dee Example",
  wa_profile_name: null,
  phone_e164: "+19175550103",
  email: null,
};

export const visit = (uid, name, phone, from, to) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  `SUMMARY:${name} · Cut`,
  `DESCRIPTION:${name} ${phone}`,
  `DTSTART;TZID=America/New_York:${from}`,
  `DTEND;TZID=America/New_York:${to}`,
  "END:VEVENT",
];

/**
 * The calendar on CAL_NOW (Tuesday noon in New York): Ana's visit this afternoon, Bo's ten days before anyone sent him
 * a link, and Dee's tomorrow, who was sent none. Cy has none.
 */
export const LINKED_ICS = [
  "BEGIN:VCALENDAR",
  ...visit("r1", "Ana Ruiz", "+1 (917) 555-0100", "20260908T140000", "20260908T153000"),
  ...visit("r2", "Bo Example", "+1 (917) 555-0101", "20260828T100000", "20260828T110000"),
  ...visit("r3", "Dee Example", "+1 (917) 555-0103", "20260909T100000", "20260909T110000"),
  "END:VCALENDAR",
].join("\r\n");

/** The people sent the booking link, as receptionist_series lists them: the moment each was first sent it. */
export const LINKS = {
  total: 3,
  people: [
    { c: ANA.id, at: "2026-09-07T15:00:00.000Z" },
    { c: BO.id, at: "2026-09-07T16:00:00.000Z" },
    { c: CY.id, at: "2026-09-08T10:00:00.000Z" },
  ],
};

export const NO_HOLD = {
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

export const NO_HANDOVERS = { n: 0, replied: { n: 0, median_s: null }, settled: { n: 0, median_s: null } };

export const NO_MISSED = { n: 0, touched: 0, pending: 0, unknown: 0 };

/** What receptionist_series answers (00380) for a quiet window, as the database hands it over: the days asked, ending where it was asked to; `over` is what the test puts in it. */
export const quietSeries = (a, over = {}) => ({
  timezone: "America/New_York",
  today: "2026-09-08",
  end: a.p_end ?? "2026-09-08",
  days: a.p_days,
  hold: { now: NO_HOLD, before: { total: 0, sent: 0 } },
  topics: { of: 0, stamped: 0, by_intent: {} },
  languages: { of: 0, stamped: 0, by_language: {} },
  blocked: { total: 0, by_reason: {} },
  call_endings: { total: 0, by_reason: {} },
  handover: { now: NO_HANDOVERS, before: NO_HANDOVERS },
  missed: { now: NO_MISSED, before: NO_MISSED },
  after_hours: [],
  links: { total: 0, people: [] },
  stuck: { open: [] },
  ...over,
});

/** calendar-feed's Harbor (New York, its hours) with the calendar `url` names (none when null), receptionist_series answering `over` and People holding Ana, Bo, Cy and Dee. */
export const receptionistWorld = (url, over = {}, rpcs = {}) => ({
  tables: { ...calTables(url), events: over.events ?? [] },
  rpcs: {
    receptionist_series: (a) => quietSeries(a, over),
    people_list: () => [ANA, BO, CY, DEE],
    ...rpcs,
  },
});

export const LENS = { days: 30, end: null };

/* ------------------------------------------------------------------- the People lens (Reports, C3) */

export const BOOK_DAY = 24 * HOUR;

/**
 * A person as people_list answers it (people-pool.test.mjs's row): wrote on WhatsApp `daysAgo` days before CAL_NOW, a yes
 * to messages and to offers on it, with nothing else open.
 */
export const bookRow = (n, daysAgo, over = {}) => {
  const heard = new Date(CAL_NOW.getTime() - daysAgo * BOOK_DAY).toISOString();
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

/**
 * The moment the fifth person last wrote: 22:00 on 1 Sep in New York, 02:00 on 2 Sep in UTC. CAL_NOW is the 8th at noon in
 * New York, so by the workspace's days they were heard 7 days ago (`d7_30`), and by UTC's 6 (`under_7`): only the workspace's
 * zone puts them in the right bucket.
 */
export const EDGE_HEARD = "2026-09-02T02:00:00.000Z";

/**
 * Five people, so the book's buckets differ: heard 2, 20, 45 and 100 days before CAL_NOW, and the fifth on the edge of the
 * week by the zone (above). The first has a step of the member's a day past, the second one of a teammate's due today and
 * reaches Harbor by WhatsApp and by phone, the fourth asked to stop.
 */
export const BOOK = [
  bookRow(1, 2, { step_id: "s1", step_body: "Send the quote", step_due_on: "2026-09-07", step_for_user_id: USER }),
  bookRow(2, 20, {
    channels: ["whatsapp", "voice"],
    step_id: "s2",
    step_body: "Call back",
    step_due_on: "2026-09-08",
    step_for_user_id: "u2",
  }),
  bookRow(3, 45),
  bookRow(4, 100, { consent: "opted_out" }),
  bookRow(5, 0, { last_inbound_at: EDGE_HEARD, last_message_at: EDGE_HEARD, latest_wa_inbound_at: EDGE_HEARD }),
];

/** The counts of the People world's busy thirty days, without the window they were read for. */
export const { timezone: _zone, today: _day, days: _span, ...BUSY } = SERIES;

/** What people_series answers (00395) for the days asked, ending where it was asked to: a quiet window, or what `over` puts in it. */
export const peopleSeriesAnswer = (a, over = {}) => ({
  timezone: "America/New_York",
  today: "2026-09-08",
  end: a.p_end ?? "2026-09-08",
  days: a.p_days,
  ...QUIET,
  ...over,
});

/** Harbor's WhatsApp number, as the People worlds give the channels (calendar-counts.test.mjs's). */
export const WHATSAPP_ON = [{ tenant_id: A, kind: "whatsapp", status: "active", config: {} }];

/** calendar-feed's Harbor with People as BOOK, people_series answering `over` and the channels `channels` gives. */
export const peopleLensWorld = (over = {}, rpcs = {}, channels = WHATSAPP_ON) => ({
  tables: { ...calTables(null), tenant_channels: channels },
  rpcs: { people_series: (a) => peopleSeriesAnswer(a, over), people_list: () => BOOK, ...rpcs },
});

/** What a database that has not run 00395 answers a call to people_series. */
export const peopleSeriesGone = () => {
  throw Object.assign(
    new Error("Could not find the function public.people_series(p_days, p_tenant_id) in the schema cache"),
    { code: "PGRST202" },
  );
};

export const peopleListDown = () => {
  throw new Error("people down");
};

/* ----------------------------------------------------------------------- the Campaigns lens' ledger (C4) */

/** campaigns/_campaign-world.mjs's clock: noon on Fri 4 Sep 2026 at Harbor (New York), where its stuck facts are judged. */
export const LEDGER_CLOCK = new Date(LEDGER_NOW);

/** Harbor's WhatsApp number as Meta last said it: rated RED, and the three moments its config keeps (the standing's is the newest). */
export const RED_CONFIG = {
  quality_rating: "RED",
  quality_read_at: "2026-09-04T10:00:00.000Z",
  standing_read_at: "2026-09-04T12:30:00.000Z",
  quality_at: "2026-09-03T08:00:00.000Z",
};

/** An active WhatsApp channel of Harbor's holding `config`; `over` changes the row (a stopped number, another kind). */
export const numberOf = (config, over = {}) => [{ tenant_id: A, kind: "whatsapp", status: "active", config, ...over }];

/** What campaign_ledger answers (00405) for the days asked: the world's thirty days, said for the window it was asked. */
export const ledgerAnswer = (a) => ({ ...LEDGER, end: a.p_end ?? LEDGER.end, days: a.p_days });

/** calendar-feed's Harbor with the ledger world's two answers (campaign_stuck as the database gives it) and the channels `channels` gives. */
export const ledgerWorld = (rpcs = {}, channels = numberOf(RED_CONFIG)) => ({
  tables: { ...calTables(null), tenant_channels: channels },
  rpcs: { campaign_ledger: ledgerAnswer, campaign_stuck: () => STUCK, ...rpcs },
});

/** What a database that has not run 00405 or 00406 answers a call to its function. */
export const functionGone = (signature) => () => {
  throw Object.assign(new Error(`Could not find the function public.${signature} in the schema cache`), {
    code: "PGRST202",
  });
};

export const ledgerGone = functionGone("campaign_ledger(p_days, p_tenant_id)");

export const stuckGone = functionGone("campaign_stuck(p_tenant_id)");

/** A function the database refuses for a reason that is not its absence. */
export const refusedFunction = (name) => () => {
  throw Object.assign(new Error(`permission denied for function ${name}`), { code: "42501" });
};

/** A turn on the ledger world's clock, or on `now`. */
export const ledgerIn = (ctx, role = "viewer", now = LEDGER_CLOCK) =>
  kernel.readerContext(ctx, { tenantId: A, role }, now);

/** What a workspace with nothing stuck is told by campaign_stuck. */
export const NOTHING_STUCK = { runs_waiting: [], runs_failed: [], replies: [], templates: [] };

/* ----------------------------------------------------------------------- the openings (PR 1.5) */

/** calendar-counts.test.mjs's feed for the openings: Wednesday morning taken, the afternoon open. */
export const WEDNESDAY_TAKEN = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:o1",
  "SUMMARY:Taken",
  "DTSTART;TZID=America/New_York:20260909T090000",
  "DTEND;TZID=America/New_York:20260909T120000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

/* ------------------------------------------------- the people list, the lists, the broadcasts (PR 1.6) */

export const P3 = "33333333-3333-4333-8333-333333333333";

/** GET contacts' payload keys at origin/main (e3184cff), in its order: withVisits' four, then the page's own. */
export const PEOPLE_KEYS = [
  "people",
  "calendar",
  "booking_link",
  "consult_first",
  // 18 Oct 2026 (0008, amended): whether a deal was ever recorded, and the workspace's word, where whether deals were
  // on was.
  "has_deals",
  "appointment_word",
  "deal_pace",
  "follow_up",
  // 3 Oct 2026: what the workspace can send on now, which who can be sent what is judged against (contracts reach-any.ts).
  "channels_ready",
  "page",
];

/**
 * people/routes/, "the people list is the workspace the tab named": harbor holds two people and bayside one;
 * harbor's reply mode is auto, and one of its people has their own, never. No calendar, and no deal on file.
 */
export const listWorld = () => ({
  tables: {
    memberships: reportMembers(),
    policies: [pol(A, null, null, "auto"), pol(A, "contact", P2, "never")],
    tenants: [],
    tenant_config: [],
  },
  rpcs: { people_list: (a) => (a.p_tenant_id === A ? [personRow(P1), personRow(P2)] : [personRow(P3)]) },
});

/** people/routes/, "the list pages under one order": the door does the matching, the count is where the rows are. */
export const pagingWorld = () => ({
  tables: {
    memberships: reportMembers(),
    policies: [],
    tenants: [],
    tenant_config: [],
    contacts: [
      { id: P1, tenant_id: A, phone_e164: "+15550000001", display_name: "Ada", erased_at: null },
      { id: P2, tenant_id: A, phone_e164: "+15550000002", display_name: "Bo", erased_at: null },
      { id: P3, tenant_id: A, phone_e164: "+15550000003", display_name: "Cy", erased_at: "2026-08-01T00:00:00Z" },
    ],
  },
  rpcs: { people_list: (a) => (a.p_query ? [personRow(P2, { display_name: "Bo" })] : [personRow(P1), personRow(P2)]) },
});

/**
 * A workspace whose customers sometimes get a proposal first (0008), with calendar-feed's one appointment naming Ana by
 * her number: Ana has a step for a teammate, Luis a proposal out and a step for the member asking, and the proposal
 * follow-up runs (0006) -- its number, its approved template -- and its run reached Luis this week.
 */
export const peopleWorld = () => {
  const cal = calTables("https://cal.example/people.ics", "viewer");
  const sent = ago(48 * HOUR);
  const DAY = 24 * HOUR;
  return {
    tables: {
      ...cal,
      memberships: reportMembers(),
      tenants: [{ ...cal.tenants[0], appointment_word: "meeting" }],
      policies: [
        pol(A, null, null, "auto"),
        { tenant_id: A, class: "follow_up", subject_type: null, subject_id: null, mode: "ask" },
      ],
      contacts: [
        { id: P1, tenant_id: A, display_name: "Ana Ruiz", phone_e164: "+19175550100", erased_at: null },
        { id: P2, tenant_id: A, display_name: "Luis Mora", phone_e164: "+19175550101", erased_at: null },
      ],
      deals: [
        { id: "d1", tenant_id: A, contact_id: P2, stage: "proposed", proposed_at: ago(10 * DAY), decided_at: null },
        { id: "d2", tenant_id: A, contact_id: P1, stage: "won", proposed_at: ago(13 * DAY), decided_at: ago(3 * DAY) },
      ],
      playbooks: [
        {
          id: "pb-follow",
          tenant_id: A,
          trigger: "proposal_waiting",
          state: "running",
          run_hour: 10,
          last_run_for: null,
          template_name: "proposal_follow_up",
          template_language: "en_US",
        },
      ],
      templates: [
        {
          tenant_id: A,
          channel: "whatsapp",
          name: "proposal_follow_up",
          language: "en_US",
          meta_status: "approved",
          category: "utility",
        },
      ],
      tenant_channels: [{ tenant_id: A, kind: "whatsapp", status: "active", config: { quality_rating: "GREEN" } }],
      broadcasts: [
        {
          id: "b1",
          tenant_id: A,
          playbook_id: "pb-follow",
          state: "sent",
          scheduled_for: sent,
          created_at: sent,
          run_for: null,
          params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "proposal_link" }],
        },
      ],
      broadcast_recipients: [{ tenant_id: A, broadcast_id: "b1", contact_id: P2, state: "sent", sent_at: sent }],
    },
    rpcs: {
      people_list: (a) =>
        a.p_tenant_id === A
          ? [
              personRow(P1, { display_name: "Ana Ruiz", phone_e164: "+19175550100", step_for_user_id: "u2" }),
              personRow(P2, {
                display_name: "Luis Mora",
                phone_e164: "+19175550101",
                deal_id: "d1",
                deal_stage: "proposed",
                step_for_user_id: USER,
              }),
            ]
          : [],
      team_roster: () => [
        { member_user_id: USER, display_name: "Ada", email: "ada@example.com" },
        { member_user_id: "u2", display_name: "Sam", email: "sam@example.com" },
      ],
    },
  };
};

/**
 * 7 Oct 2026: the follow-up's template is read as its message, whatever its channels (db listMessageVersionRows: the rows of its
 * name and language, which contracts campaignMessageOf picks the versions out of), where it was Meta's row alone.
 */
export const MESSAGE_ROWS_ASKED =
  "id, channel, name, language, meta_status, category, variables, hidden_at, title, source, components, body_preview, rejected_reason";

/**
 * Every query GET contacts asked at origin/main (e3184cff) for peopleWorld's first page, in order, with the columns it
 * selected (and, since 3 Oct 2026, the two reads of what the workspace can send on). The workspace's door. The first stage at once: the page and how many match, then the page's reply modes (its own people's alone since 00625, 13 Nov 2026, where every reply policy was read).
 * The second at once: whether a deal is on file and the workspace's word (18 Oct 2026, where how its customers buy was
 * read), the calendar's zone and settings (the feed itself is fetched, never read from the database), who each step is
 * for, the pace; then, once a deal is on file, the proposal
 * follow-up's facts -- its playbook, its class, the workspace, its number, the proposals out, its template, and the
 * runs that touched them.
 */
export const PEOPLE_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["rpc:people_list", null],
  ["contacts.select", "id"],
  ["rpc:people_reply_modes", null],
  ["deals.select", "id"],
  ["tenants.select", "appointment_word"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // 7 Oct 2026 (00349): what the member asking has seen of each person on the page (server/people/person-seen.ts), for
  // the rows that say who is new to them: one call to the door, with the page's other reads of its rows.
  ["rpc:contact_seen", null],
  ["rpc:team_roster", null],
  // 3 Oct 2026: what the workspace can send on, with the first page (readers/facts.ts channelsReady): its WhatsApp
  // number, and its texting line. The mailbox is read only where the deployment has an email domain.
  ["tenant_channels.select", "config, number_e164"],
  ["lines.select", "sms_state, reg_mock"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  [
    "sequence_steps.select",
    "id, sequence_id, state, run_hour, last_run_for, until, template_name, template_language, words_ok_at",
  ],
  // 19 Oct 2026 (decision 0064): whether the follow-up asks is its sequence's mode, where its class's row was read.
  ["sequences.select", "id, mode"],
  ["tenants.select", "status"],
  ["tenant_channels.select", "config, number_e164"],
  ["deals.select", "id, contact_id, proposed_at"],
  // 3 Oct 2026: the channels the follow-up ticks (db listPlaybookChannels), beside its template: the number and Meta's
  // approval stop only a follow-up that goes by WhatsApp.
  ["sequence_steps.select", "channels"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, joined to it: a booking's rows whole, and the
  // feed's rows as ids and statuses by key (db findVisitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["templates.select", MESSAGE_ROWS_ASKED],
  ["tenants.select", "timezone"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
];

/**
 * The same queries in the order they reach the database since 2 Oct 2026: what is read of the workspace -- a deal on
 * file and its word, the calendar's zone and settings, the pace -- and the page's reply modes no longer wait for the
 * page's rows, a round trip each time; they leave with the page and its count. Then, once a deal is on file, the
 * follow-up's facts; and once the rows are in, who each step is for.
 */
export const PEOPLE_ASKED_NOW = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["rpc:people_list", null],
  ["rpc:people_reply_modes", null],
  ["tenants.select", "appointment_word"],
  ["tenant_channels.select", "config, number_e164"],
  ["lines.select", "sms_state, reg_mock"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // Whether a deal is on file, asked with the word and answered after the settings.
  ["deals.select", "id"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  ["contacts.select", "id"],
  ["rpc:contact_seen", null], // once the page's reply modes name its people, before its rows (16 Nov 2026)
  [
    "sequence_steps.select",
    "id, sequence_id, state, run_hour, last_run_for, until, template_name, template_language, words_ok_at",
  ],
  ["tenants.select", "status"],
  ["tenant_channels.select", "config, number_e164"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["rpc:team_roster", null],
  ["sequence_steps.select", "channels"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, joined to it: a booking's rows whole, and the
  // feed's rows as ids and statuses by key (db findVisitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["templates.select", MESSAGE_ROWS_ASKED],
  ["sequences.select", "id, mode"],
  ["tenants.select", "timezone"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
];

/**
 * The record's reads beside the rest (0002's readers): a reader asks for the record beside the feed, so where its two
 * reads land among the others is the stand-in's to say. The others in their order, and the record's apart.
 */
export const recordApart = (asked) => {
  const isRecord = (q) => (Array.isArray(q) ? q[0] : q) === "appointments.select";
  return [asked.filter((q) => !isRecord(q)), asked.filter(isRecord)];
};

/** A list of queries as a bag: the same reads, whatever their order. */
export const bagOf = (asked) => asked.map((q) => JSON.stringify(q)).sort();

/** Every query in the order it reached the database, with the columns a select asked for. */
export const askedWith = (ctx) =>
  ctx.supabase.seen.map((q) => (q.rpc ? [`rpc:${q.rpc}`, null] : [`${q.table}.${q.op}`, q.columns]));

/** The config reader's columns (getTenantConfig), where the calendar's own lookup asked for the one, config. */
export const CONFIG_READER_COLUMNS = "tenant_id, config, version, updated_at, updated_by";

export const SEG1 = "5e5e5e5e-1111-4111-8111-5e5e5e5e5e5e";

export const SEG2 = "5e5e5e5e-2222-4222-8222-5e5e5e5e5e5e";

/** people/routes/, "lists: one workspace's with their members' ids": a list in each workspace, one member each. */
export const segmentsWorld = () => ({
  tables: {
    memberships: reportMembers(),
    segments: [
      { id: SEG1, tenant_id: A, name: "Regulars" },
      { id: SEG2, tenant_id: B, name: "VIP" },
    ],
    segment_members: [
      { segment_id: SEG1, contact_id: P1, tenant_id: A },
      { segment_id: SEG2, contact_id: P2, tenant_id: B },
    ],
  },
  rpcs: {},
});

export const BC1 = "88888888-8888-4888-8888-888888888881";

export const BC2 = "88888888-8888-4888-8888-888888888882";

export const BC3 = "88888888-8888-4888-8888-888888888883";

/** A broadcast row as playbooks/routes/ builds one. */
export const bcRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  name: "Reminder",
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [],
  audience: { kind: "everyone", id: null, label: "Everyone" },
  state: "scheduled",
  scheduled_for: "2026-09-10T00:00:00Z",
  started_at: null,
  finished_at: null,
  recipient_count: 3,
  failure: null,
  created_at: "2026-09-10T00:00:00Z",
  playbook_id: null,
  run_for: null,
  ...over,
});

/** playbooks/routes/, "the broadcasts list is the workspace the tab named": two of harbor's, one of bayside's. */
export const bcWorld = () => ({
  tables: {
    memberships: reportMembers(),
    broadcasts: [
      bcRow(BC1, A, { created_at: "2026-09-09T00:00:00Z" }),
      bcRow(BC2, A, { created_at: "2026-09-10T00:00:00Z", state: "sent" }),
      bcRow(BC3, B),
    ],
    broadcast_recipients: [
      {
        broadcast_id: BC2,
        tenant_id: A,
        contact_id: "k1",
        state: "sent",
        reason: null,
        sent_at: "2026-09-10T01:00:00Z",
        messages: { conversation_id: null, status: "delivered" },
      },
    ],
  },
  rpcs: {},
});

/** playbooks/routes/, "who a run of any kind reached this week": sent, held back, canceled, last month. */
export const touchedWorld = () => {
  const rec = (broadcast_id, contact_id, state, sent_at) => ({
    broadcast_id,
    tenant_id: A,
    contact_id,
    state,
    reason: null,
    sent_at,
    messages: null,
  });
  return {
    tables: {
      memberships: reportMembers(),
      broadcasts: [
        bcRow(BC1, A, { created_at: ago(2 * HOUR), state: "sent" }),
        bcRow(BC2, A, { created_at: ago(2 * HOUR), state: "canceled" }),
        bcRow(BC3, A, { created_at: ago(40 * 24 * HOUR), state: "sent" }),
      ],
      broadcast_recipients: [
        rec(BC1, "k1", "sent", ago(HOUR)),
        rec(BC1, "k2", "skipped", null),
        rec(BC2, "k3", "queued", null),
        rec(BC3, "k4", "sent", ago(40 * 24 * HOUR)),
      ],
    },
    rpcs: {},
  };
};

/** run-report.test.mjs's shape, in harbor: one run that reached two people and held one back, and what came back. */
export const detailWorld = () => {
  const T0 = Date.parse("2026-09-20T15:00:00Z");
  const at = (ms) => new Date(T0 + ms).toISOString();
  const rec = (contact_id, over) => ({
    broadcast_id: BC1,
    tenant_id: A,
    contact_id,
    state: "sent",
    reason: null,
    sent_at: at(0),
    ...over,
  });
  const said = (conversation_id, direction, ms, body, sender) => ({
    tenant_id: A,
    conversation_id,
    direction,
    created_at: at(ms),
    body,
    sender,
    type: "text",
  });
  return {
    tables: {
      memberships: reportMembers(),
      broadcasts: [bcRow(BC1, A, { state: "sent", scheduled_for: at(0), started_at: at(0), created_at: at(-HOUR) })],
      broadcast_recipients: [
        rec(P1, {
          messages: { conversation_id: "cv-1", status: "read", meta: { status_at: { delivered: at(60_000) } } },
          contacts: { display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null },
        }),
        rec(P2, {
          messages: { conversation_id: "cv-2", status: "delivered", meta: {} },
          contacts: { display_name: null, wa_profile_name: "Lu", phone_e164: "+19175550101", email: null },
        }),
        rec(P3, {
          state: "skipped",
          reason: "no_consent",
          sent_at: null,
          messages: null,
          contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: null, email: "rosa@example.com" },
        }),
      ],
      messages: [
        said("cv-1", "inbound", HOUR, "Yes please!", "customer"),
        said("cv-1", "outbound", 2 * HOUR, "Booked you in.", "ai"),
        said("cv-2", "inbound", 3 * HOUR, "stop", "customer"),
      ],
      events: [
        {
          tenant_id: A,
          kind: "contact.consent_changed",
          subject_type: "contact",
          subject_id: P2,
          data: { consent: "opted_out", purpose: "marketing" },
          created_at: at(3 * HOUR),
        },
      ],
      conversations: [
        { id: "cv-1", tenant_id: A, state: "open" },
        { id: "cv-2", tenant_id: A, state: "needs_human" },
      ],
    },
    rpcs: {},
  };
};

/** A request for broadcasts/:id over `w`. */
export const detailCtx = (w, id) => ({ ...worldCtx(w), params: { id } });

/* -------------------------------------------------------------------------------- the playbooks (PR 1.6) */

export const PB1 = "99999999-9999-4999-8999-999999999991";

export const PB2 = "99999999-9999-4999-8999-999999999992";

/** GET playbooks' payload keys at origin/main (e3184cff), in its order. */
export const PLAYBOOKS_KEYS = [
  "playbooks",
  "timezone",
  // 11 Oct 2026: `touched` left the answer; no client read it, and who the breath holds is in each pool's `held`.
  "pools",
  "calendar",
  "lists",
  "people_lists",
  // 18 Oct 2026 (0008, amended): whether a deal was ever recorded, where whether deals were on was answered.
  "has_deals",
  // 3 Oct 2026: whether each channel can send now, which the pools were counted against (server/campaigns/channels-ready.ts),
  // and what its campaigns have sent by email and by text this month (server/campaigns/month-sent.ts).
  "ready",
  "month_sent",
  // 9 Oct 2026 (spec 2026-10-09 §4.8): what the workspace calls an appointment, and whether its bookings arrive by a tool's
  // emails (readers/facts.ts businessShape), which the home's moments are said and counted by.
  "appointment_word",
  "bookings_by_email",
  // 9 Oct 2026 (spec 2026-10-09 §4.3, decision 7): each autonomy class's mode as stored (readers/facts.ts policies), so a
  // Resume asked on Campaigns says in full that a campaign under `auto` sends on its own.
];

/** A playbook row as the page's read selects it (server/campaigns/playbooks.ts COLUMNS), a moment. */
export const pbRow = (id, over = {}) => ({
  id,
  tenant_id: A,
  kind: "moment",
  name: "Win-back",
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: "77777777-7777-4777-8777-777777777771",
  template_name: "winback_offer",
  template_language: "en_US",
  params: [],
  policy_class: "reengage",
  state: "running",
  run_hour: 10,
  cap_per_run: 50,
  gap_days: 30,
  cadence_days: 0,
  last_run_for: null,
  last_run_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

/** peopleWorld's workspace with its playbooks: the proposal follow-up, and a win-back on a list of its own kept by hand. */
export const playbooksWorld = () => {
  const w = peopleWorld();
  return {
    tables: {
      ...w.tables,
      playbooks: [
        pbRow("pb-follow", {
          name: "Follow-up",
          trigger: "proposal_waiting",
          template_name: "proposal_follow_up",
          policy_class: "follow_up",
          gap_days: 0,
        }),
        pbRow("pb-win", { trigger: "saved_list", list_id: SEG1, created_at: "2026-09-02T00:00:00Z" }),
      ],
      segments: [{ id: SEG1, tenant_id: A, name: "Regulars", rule: null, archived_at: null }],
      segment_members: [{ tenant_id: A, segment_id: SEG1, contact_id: P1 }],
    },
    rpcs: w.rpcs,
  };
};

/** calendar-counts.test.mjs's person: a yes to offers and a number, heard from forty days ago. */
export const poolPerson = (n, over = {}) => ({
  id: `p${n}`,
  display_name: `Person ${n}`,
  wa_profile_name: null,
  phone_e164: `+1917555${String(n).padStart(4, "0")}`,
  consent: "opted_in",
  consent_source: "customer_message",
  marketing_consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: ago(60 * 24 * HOUR),
  last_inbound_at: ago(40 * 24 * HOUR),
  latest_wa_inbound_at: ago(40 * 24 * HOUR),
  latest_conversation_id: `c${n}`,
  conversation_count: 1,
  ...over,
});

/** people_list as the database answers it: a page of at most a thousand, from an offset. */
export const pagedPeople = (all) => (a) => all.slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000));

/** calendar-counts.test.mjs's workspace: an owner, no calendar, and whatever `extra` adds. */
export const countsWorld = (people, extra = {}) => ({
  tables: {
    ...calTables(null, "owner"),
    playbooks: [],
    templates: [],
    // With its WhatsApp number: the pools are counted against what each channel can send on now (step 3), and a workspace
    // with none has nobody a run can reach.
    tenant_channels: [{ tenant_id: A, kind: "whatsapp", status: "active", config: {} }],
    ...extra,
  },
  rpcs: { people_list: people },
});

/** playbooks/routes/, "playbooks: the workspace's with their runs' numbers": one of harbor's, one of bayside's. */
export const outboundWorld = () => ({
  tables: {
    memberships: reportMembers(),
    playbooks: [pbRow(PB1), pbRow(PB2, { tenant_id: B, name: "Welcome", trigger: "new_week" })],
    broadcasts: [bcRow(BC1, B, { playbook_id: PB2, state: "sent", run_for: "2026-09-10" })],
    broadcast_recipients: [],
    tenants: [{ id: B, name: "Bayside", timezone: "America/Chicago" }],
    templates: [],
  },
  // No People door: the pools' read of everyone fails, and no moment is counted.
  rpcs: {},
});

/**
 * Every query GET playbooks asked at origin/main (e3184cff) for playbooksWorld, in order, with the columns it selected.
 * The workspace's door. The first stage at once: the zone, who a run reached this week (with the zone its touches
 * keep), the word and a deal on file (18 Oct 2026, where how the customers buy was read), the playbooks' runs and rows,
 * the pace, then the runs' recipients. The second: everyone
 * with their reply modes; the calendar's own lookup of the zone and the settings; then, deals being on, who had a
 * proposal's follow-up; and the lists.
 */
export const PLAYBOOKS_ASKED_AT_MAIN = [
  ["memberships.select", "tenant_id, role, tenants (slug, name, timezone)"],
  ["tenants.select", "name, timezone"],
  ["tenants.select", "timezone"],
  ["tenants.select", "appointment_word"],
  ["deals.select", "id"],
  [
    "sequence_batches.select",
    "id, name, template_id, template_name, template_language, params, audience, state, scheduled_for, started_at, finished_at, recipient_count, failure, created_at, playbook_id, run_for",
  ],
  [
    "sequence_steps.select",
    "id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at",
  ],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  ["deals.select", "id, stage, proposed_at, decided_at"],
  [
    "sequence_sends.select",
    // 6 Oct 2026: with the channel each went by, so a run says what each channel sent (0030).
    "broadcast_id, contact_id, state, reason, sent_at, channel, messages(conversation_id, status, meta)",
  ],
  // 6 Oct 2026: a follow-up's touches carry the deal and the link it was about (0029), the two keys of its words read.
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  ["rpc:people_list", null],
  ["policies.select", "subject_type, subject_id, mode"],
  ["tenants.select", "name, timezone"],
  ["tenant_config.select", "config"],
  // 11 Oct 2026 (0002's readers): the record over the feed's season, beside it: a booking's rows whole, and the feed's
  // rows as ids and statuses by key (db findVisitsOver).
  ["appointments.select", "*"],
  ["appointments.select", "id, status, external_id, starts_at"],
  ["deals.select", "id, contact_id, proposed_at"],
  ["tenants.select", "timezone"],
  ["sequence_batches.select", "id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params"],
  [
    "sequence_sends.select",
    "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
  ],
  ["segments.select", "id, name, rule, archived_at"],
  ["segment_members.select", "segment_id, contact_id"],
];

/**
 * A request's database whose reads of one table are not answered until `open()`: what a reader has asked for while one of
 * its reads is still out. The query is recorded as it is answered (fakeDb), so a table held here is in `seen` only after.
 */
export function heldAt(ctx, table) {
  let open;
  const gate = new Promise((go) => (open = go));
  const from = ctx.supabase.from.bind(ctx.supabase);
  ctx.supabase.from = (t) => {
    const q = from(t);
    if (t !== table) return q;
    for (const answer of ["then", "single", "maybeSingle"]) {
      const was = q[answer].bind(q);
      q[answer] = (...args) => gate.then(() => was(...args));
    }
    return q;
  };
  return open;
}

/** Long enough for every read that waits on nothing held to have reached the database. */
export const idle = async () => {
  for (let i = 0; i < 25; i++) await new Promise((go) => setImmediate(go));
};

/* ------------------------------------------ the workspace's pages: settings, and the six beside it (PR 1.7) */

/** A request's reader context for a member of `role` in `tenantId`, on `now` when handed one. */
export const memberIn = (ctx, tenantId, role, now) => kernel.readerContext(ctx, { tenantId, role }, now);

export const DAY = 86_400_000;

export const FEED = "https://calendar.example.com/private/abcdef123456/basic.ics";

/**
 * settings-routes.test.mjs, "the settings read": a member of two workspaces -- harbor's viewer, bayside's owner -- each
 * with a calendar feed on file, and harbor's own name and zone.
 */
export const settingsWorld = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_config: [
    { tenant_id: A, config: { calendar: { ical_url: FEED } }, version: 3, updated_at: "2026-09-01T00:00:00Z" },
    { tenant_id: B, config: { calendar: { ical_url: FEED } }, version: 1, updated_at: "2026-09-01T00:00:00Z" },
  ],
  tenants: [{ id: A, name: "Harbor", timezone: "America/New_York" }],
  tenant_channels: [],
  google_listings: [],
  ...over,
});

/** settings-routes.test.mjs, "F1": a receptionist that publishes the number the business keeps, forwarded to its line. */
export const forwardedWorld = () => ({
  memberships: [
    membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "owner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_config: [
    {
      tenant_id: A,
      config: {
        brain: {
          business_name: "Harbor Moving",
          booking_link: "https://book.example/harbor",
          phone_display: "(718) 555-0142",
          system_prompt: "Answer as the front desk of Harbor Moving: brief, warm, and never a price.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
        },
      },
      version: 2,
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
  tenants: [{ id: A, name: "Harbor Moving", timezone: "America/New_York" }],
  tenant_channels: [{ tenant_id: A, kind: "voice", number_e164: "+19295550100", status: "active" }],
  google_listings: [],
  lines: [
    {
      id: L1,
      tenant_id: A,
      e164: "+17185550142",
      kind: "forwarded",
      provider: "carrier",
      area_code: 718,
      voice_state: "answering",
      sms_state: "none",
      whatsapp_state: "none",
      port_state: "none",
      forwarding_state: "verified",
      state_since: "2026-09-20T00:00:00Z",
      created_at: "2026-09-20T00:00:00Z",
      facts: { carrier: "verizon", mode: "unanswered", destination_e164: "+19295550100" },
    },
  ],
});

/**
 * What GET settings asks of the database, after the workspace's door, in its order: what it asked at origin/main, and
 * the listing's review link (db reviewLinkOf, 00415) read beside the platform's facts.
 */
export const SETTINGS_ASKED = [
  "tenant_config.select",
  "tenants.select",
  "google_listings.select",
  "google_listings.select",
  // What packages/db answers goes out as it is asked for (decision 0111): the workspace's channels ahead of its lines.
  "tenant_channels.select",
  "lines.select",
  "ad_accounts.select",
  "policies.select",
];

/** The preview's clock, apart: the rest of what the settings read answers does not move with the minute. */
export const withoutClock = (d) => (d.prompt ? { ...d, prompt: { ...d.prompt, now: "<clock>" } } : d);

/** setup.test.mjs, "what the first run's Check reads": Northside's listing and its receptionist, owned in harbor. */
export const setupWorld = () => ({
  tables: {
    memberships: [
      membership(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
      membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
    ],
    google_listings: [
      rows.googleListing({
        tenant_id: A,
        place_id: "ChIJ-northside-movers",
        name: "Northside Movers",
        linked_at: "2026-09-07T14:00:00Z",
        facts: {
          hours: [{ open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 17, minute: 0 } }],
          website: null,
          service_area_only: true,
          primary_type: "moving_company",
          phone_e164: "+13055550100",
        },
      }),
    ],
    tenant_config: [
      {
        tenant_id: A,
        version: 3,
        config: { brain: { business_name: "Northside Movers", ...newReceptionistDefaults("Northside Movers") } },
      },
    ],
  },
  rpcs: {
    team_roster: () => [
      { membership_id: "m1", member_user_id: USER, email: "ada@example.com", display_name: "Ada", role: "owner" },
    ],
  },
});

export const N1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";

export const N2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";

export const N3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

export const N4 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";

/**
 * reads-routes.test.mjs, "reading notifications", on a clock (`now`): harbor's rows a day, three days and forty days
 * old, one of bayside's; my mark on N2, another person's on N1 -- and, handed `mine`, marks of my own beside them.
 */
export const notificationsWorld = (now = Date.now(), { mine = [], rows } = {}) => {
  const ago = (days) => new Date(now - days * DAY).toISOString();
  const row = (id, tenant_id, kind, title, days, over = {}) => ({
    id,
    tenant_id,
    kind,
    title,
    body: "…",
    route: null,
    subject_type: null,
    subject_id: null,
    created_at: ago(days),
    ...over,
  });
  return {
    memberships: [
      membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
      membership(B, "viewer", "bayside", "2026-02-01T00:00:00Z"),
    ],
    notifications: rows ?? [
      row(N1, A, "handoff", "Rosa asked for a person", 1, {
        body: "She wrote: can I talk to someone?\nSecond line",
        route: "inbox/th-x",
        subject_type: "conversation",
        subject_id: "x",
      }),
      row(N2, A, "billing", "Your trial ends in three days", 3, { route: "admin/billing" }),
      row(N3, A, "alert", "Old", 40),
      row(N4, B, "alert", "Elsewhere", 1),
    ],
    notification_marks: [
      { notification_id: N2, user_id: USER, read_at: ago(2), dismissed_at: null },
      { notification_id: N1, user_id: "someone-else", read_at: ago(0), dismissed_at: ago(0) },
      ...mine,
    ],
    notification_reads: [{ tenant_id: A, user_id: USER, seen_at: "2026-09-10T12:00:00Z" }],
  };
};

/**
 * activity.test.mjs, "owners read both ledgers": harbor's owner; a person, their thread and their call; four decisions
 * (one bayside's) and five events (a usage row and a webhook row among them), and the team's roster.
 */
export const activityWorld = () => {
  const P = "11111111-1111-4111-8111-111111111111";
  const C = "22222222-2222-4222-8222-222222222222";
  const K = "33333333-3333-4333-8333-333333333333";
  const decision = (id, tenant_id, verb, subject_type, subject_id, actor, payload, created_at) => ({
    id,
    tenant_id,
    verb,
    subject_type,
    subject_id,
    actor_type: "user",
    actor_user_id: actor,
    payload,
    created_at,
  });
  const event = (id, kind, subject_type, subject_id, data, created_at) => ({
    id,
    tenant_id: A,
    kind,
    subject_type,
    subject_id,
    data,
    created_at,
  });
  return {
    tables: {
      memberships: [membership(A, "owner", "harbor", "2026-01-01T00:00:00Z")],
      tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
      conversations: [{ id: C, tenant_id: A, contact_id: P }],
      calls: [{ id: K, tenant_id: A, contact_id: P }],
      decisions: [
        decision(
          "d1",
          A,
          "consent_change",
          "contact",
          P,
          "u-ada",
          { consent: "opted_in", source: "form" },
          "2026-09-11T14:00:00Z",
        ),
        decision("d2", A, "take_over", "conversation", C, "u-bo", {}, "2026-09-11T15:00:00Z"),
        decision("d3", A, "export", "workspace", A, "u-ada", { what: "people", rows: 5 }, "2026-09-12T02:30:00Z"),
        decision("d4", B, "export", "workspace", B, "u-x", {}, "2026-09-11T16:00:00Z"),
      ],
      events: [
        event("e1", "message.received", "message", "m1", {}, "2026-09-11T14:30:00Z"),
        event("e2", "usage.ask_tokens", "user", USER, { tokens: 400 }, "2026-09-11T14:45:00Z"),
        event("e3", "webhook.delivery", null, null, {}, "2026-09-11T14:50:00Z"),
        event("e4", "call.recorded", "call", K, {}, "2026-09-10T10:00:00Z"),
        event("e5", "broadcast.sent", "broadcast", "b1", { sent: 3, held: 1 }, "2026-09-12T13:00:00Z"),
      ],
    },
    rpcs: {
      team_roster: () => [
        { membership_id: "m1", member_user_id: "u-ada", email: "ada@example.com", display_name: "Ada", role: "owner" },
        { membership_id: "m2", member_user_id: "u-bo", email: "bo@example.com", display_name: "", role: "operator" },
      ],
    },
    person: P,
  };
};

/** reads-routes.test.mjs, "the channels read": harbor's WhatsApp number with Meta's quality on its config, bayside's line. */
export const channelsWorld = (over = {}) => ({
  memberships: [
    membership(A, "operator", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenant_channels: [
    {
      id: "ch1",
      tenant_id: A,
      kind: "whatsapp",
      number_e164: "+13055550199",
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
      config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
    },
    {
      id: "ch2",
      tenant_id: B,
      kind: "voice",
      number_e164: "+13055550198",
      status: "active",
      created_at: "2026-08-01T00:00:00Z",
      config: {},
    },
  ],
  messages: [],
  calls: [],
  ...over,
});

/**
 * A reply's usage event (usage.llm_tokens), `ms` before now: what the day's budget counts, and what says it in replies.
 */
export const usage = (id, tenant_id, input_tokens, output_tokens, ms, kind = "usage.llm_tokens") => ({
  id,
  tenant_id,
  kind,
  subject_type: null,
  subject_id: null,
  data: { input_tokens, output_tokens },
  created_at: new Date(Date.now() - ms).toISOString(),
});

/** settings-routes.test.mjs, "the autonomy matrix": harbor's rows and a person's own row, bayside's with its limits. */
export const matrixRow = (tenant_id, cls, mode, limits = {}) => ({
  id: `${cls}-${tenant_id.slice(0, 1)}`,
  tenant_id,
  class: cls,
  mode,
  subject_type: null,
  subject_id: null,
  limits,
  updated_at: "2026-09-01T00:00:00Z",
});

export const matrixWorld = (over = {}) => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  policies: [
    matrixRow(A, "reply", "auto"),
    matrixRow(A, "money", "ask"),
    { ...matrixRow(A, "reply", "never"), id: "person", subject_type: "contact", subject_id: "k1" },
    matrixRow(B, "reply", "auto", { max_replies_day: 50, reply_delay_ms: 15000 }),
    matrixRow(B, "booking", "auto"),
  ],
  contacts: [
    { id: "k1", tenant_id: A, display_name: "Dana Reyes", wa_profile_name: null, phone_e164: null, email: null },
  ],
  // Harbor's replies this week, one before it and a line that is no reply; bayside's one.
  events: [
    usage("u1", A, 1200, 300, DAY / 24),
    usage("u2", A, 900, 100, 2 * DAY),
    usage("u3", A, 5000, 5000, 8 * DAY),
    usage("u4", A, 700, 0, DAY / 24, "message.sent"),
    usage("u5", B, 400, 100, DAY / 24),
  ],
  ...over,
});

export const TP1 = "77777777-7777-4777-8777-777777777771";

export const TP2 = "77777777-7777-4777-8777-777777777772";

export const TP3 = "77777777-7777-4777-8777-777777777773";

export const TP4 = "77777777-7777-4777-8777-777777777774";

export const TP9 = "77777777-7777-4777-8777-777777777779";

/** A template row as playbooks/routes/ builds one. */
export const tplRow = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  body_preview: "See you at {{1}}",
  variables: [],
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "starter",
  hidden_at: null,
  title: null,
  ...over,
});

/**
 * playbooks/routes/, "templates: the composers see the approved and unhidden": bayside's approved reminder, its
 * hidden sample and its pending offer, harbor's own; the reminder here titled, and carrying a heading, a footer and a
 * button that takes a value (Meta's components, as the sync keeps them).
 */
export const templatesWorld = () => ({
  memberships: [
    membership(A, "viewer", "harbor", "2026-01-01T00:00:00Z"),
    membership(B, "operator", "bayside", "2026-02-01T00:00:00Z"),
  ],
  templates: [
    tplRow(TP1, B, {
      title: "Visit reminder",
      components: [
        { type: "HEADER", format: "TEXT", text: "Your visit" },
        { type: "BODY", text: "See you at {{1}}" },
        { type: "FOOTER", text: "Reply STOP to opt out" },
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Book", url: "https://book.example/{{1}}" }] },
      ],
    }),
    tplRow(TP2, B, { name: "hello_world", hidden_at: "2026-09-01T00:00:00Z" }),
    tplRow(TP3, B, { name: "offer", meta_status: "pending", category: "marketing" }),
    tplRow(TP4, A, { name: "elsewhere" }),
  ],
});

/** playbooks/routes/, "a template says what sends it": bayside's messages, playbooks and runs. */
export const usageWorld = () => ({
  memberships: templatesWorld().memberships,
  templates: [
    tplRow(TP1, B, { name: "winback_offer" }),
    tplRow(TP2, B, { name: "winback_offer", language: "es_MX" }),
    tplRow(TP3, B, { name: "autumn_promo", category: "marketing", source: "meta" }),
    tplRow(TP4, B, { name: "booking_link", variables: [{ position: 1 }, { position: 2 }, { position: 3 }] }),
    tplRow(TP9, A, { name: "elsewhere" }),
  ],
  playbooks: [
    pbRow(PB1, { tenant_id: B, template_name: "winback_offer" }),
    pbRow(PB2, { tenant_id: B, name: "Second wind", template_name: "winback_offer", state: "paused" }),
  ],
  broadcasts: [
    bcRow(BC1, B, { template_name: "winback_offer", state: "sent" }),
    bcRow(BC2, B, { template_name: "winback_offer", playbook_id: PB1, state: "sent" }),
  ],
  broadcast_recipients: [
    { broadcast_id: BC1, contact_id: "c1", tenant_id: B, state: "sent", sent_at: "2026-09-10T15:00:00Z" },
    { broadcast_id: BC2, contact_id: "c2", tenant_id: B, state: "sent", sent_at: "2026-09-17T14:00:00Z" },
  ],
  messages: [],
});

/** What GET templates asked at origin/main for Settings (`all`), after the workspace's door: the rows, then the usage. */
export const TEMPLATES_ALL_ASKED_AT_MAIN = [
  "templates.select",
  "sequence_batches.select",
  "sequence_sends.select",
  "messages.select",
  "sequence_steps.select",
];

/**
 * 9 Oct 2026 (00374): how many of each went out is the database's count, one call (template_sends), where every sent
 * person and every templated message was paged here; it is asked as the reads start, ahead of the runs it no longer waits on.
 */
export const TEMPLATES_ALL_ASKED = [
  "templates.select",
  "rpc:template_sends",
  "sequence_batches.select",
  // What packages/db answers goes out as it is asked for (decision 0111): the steps ahead of the sequences' names.
  ...TEMPLATES_ALL_ASKED_AT_MAIN.slice(2).filter((k) => k !== "sequence_sends.select" && k !== "messages.select"),
  // 17 Oct 2026 (the Sequences phone review): the sequences' names, so a message says which sends it ("VIP color clients
  // · step 2"), read beside its steps.
  "sequences.select",
  // 14 Oct 2026 (the wiring's second audit, S1-3): the business's zone, so a campaign past its last day reads ended.
  "tenants.select",
];

/**
 * Lane 1 (a message needs no WhatsApp row), T7: the read answers the workspace's messages, made of EVERY row, beside the
 * list. An email's and a text's rows are written approved and a WhatsApp row is Meta's, so the composers' list holds the
 * first and not a version still in review, and a message made of the list alone lost that version's standing.
 */
export const EM1 = "77777777-7777-4777-8777-777777777781";

export const EM2 = "77777777-7777-4777-8777-777777777782";

export const EM3 = "77777777-7777-4777-8777-777777777783";

export const messagesWorld = (rows) => ({
  memberships: templatesWorld().memberships,
  templates: rows,
  playbooks: [],
  broadcasts: [],
  broadcast_recipients: [],
  messages: [],
});

/** An email's or a text's version as the library files it: Meta's component shape, the subject a HEADER, the words the BODY. */
export const ownRow = (id, channel, over = {}) =>
  tplRow(id, B, {
    channel,
    category: null,
    source: "chanlytics",
    components: [
      ...(channel === "email" ? [{ type: "HEADER", format: "TEXT", text: "We miss you" }] : []),
      { type: "BODY", text: "Hi {{1}}" },
    ],
    ...over,
  });

export const messagesOfRead = async (rows, all = false) =>
  (await kernel.load(turnIn(dayCtx(messagesWorld(rows)), B), templatesReader, { all })).data;

export const LIST_HAND = "bbbbbbbb-1111-4111-8111-bbbbbbbbbbb1";

export const LIST_RULE = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbb2";

export const LIST_NAMING = "bbbbbbbb-3333-4333-8333-bbbbbbbbbbb3";

export const LIST_ARCHIVED = "bbbbbbbb-4444-4444-8444-bbbbbbbbbbb4";

export const LIST_GONE = "bbbbbbbb-9999-4999-8999-bbbbbbbbbbb9";

/**
 * calendar-counts' three people, with the workspace's own lists: one kept by hand; one kept by a rule, with a stale
 * member row a rule list never reads; one whose rule names the first; and one archived (00169), kept by hand.
 */
export const listsPoolWorld = () =>
  countsWorld(pagedPeople([poolPerson(1), poolPerson(2), poolPerson(3, { conversation_count: 0 })]), {
    segments: [
      { id: LIST_HAND, tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      {
        id: LIST_RULE,
        tenant_id: A,
        name: "Talked to us",
        rule: { all: [{ field: "conversations", op: "at_least", n: 1 }] },
        archived_at: null,
      },
      {
        id: LIST_NAMING,
        tenant_id: A,
        name: "Regulars who talked",
        rule: {
          all: [
            { field: "in_list", op: "is", list: `list:${LIST_HAND}` },
            { field: "conversations", op: "at_least", n: 1 },
          ],
        },
        archived_at: null,
      },
      { id: LIST_ARCHIVED, tenant_id: A, name: "Old list", rule: null, archived_at: "2026-09-10T00:00:00Z" },
    ],
    segment_members: [
      { tenant_id: A, segment_id: LIST_HAND, contact_id: "p1" },
      { tenant_id: A, segment_id: LIST_HAND, contact_id: "p3" },
      { tenant_id: A, segment_id: LIST_RULE, contact_id: "p3" },
      { tenant_id: A, segment_id: LIST_ARCHIVED, contact_id: "p2" },
    ],
  });

/**
 * 12 Oct 2026 (Ask, the marketing manager, the review after the merge): campaigns.playbooks says a campaign's end as its
 * card on Campaigns does, through the page's one reading of GET playbooks' answer (contracts lifecyclePlaybooksOf). A
 * campaign past its last day still reads running and runs nothing, so it has no next run and says why; a last day ahead
 * is said. Since decision 0064 each says its own sequence's mode, made from its class's row, and whether its next batch
 * waits for an OK because its words are new (the trial is gone). Harbor here, on a frozen clock, Thursday 3 December
 * 2026 at nine in the morning in New York, its campaigns' class on auto; the month's offer three times: ended on 30
 * November, ending on the 31st with new words, and always on.
 */
export const LIFE_NOW = new Date("2026-12-03T14:00:00.000Z");

export const SEEN = "2026-11-02T15:00:00.000Z";

/**
 * 10 Oct 2026 (Ask, the marketing manager, task 5): how full the book is, for pacing an offer to what the business can
 * take, is the openings reader's own answer counted in slots over the next fourteen days, so the room Ask says is the
 * time the receptionist would offer. Harbor here opens nine to five on weekdays; its feed holds two hours tomorrow and
 * a booking that arrived by email takes an hour the day after. The clock is late on a Tuesday in New York, already
 * Wednesday in UTC, so today offers nothing and the first day with room is tomorrow on the business's clock.
 */
export const ROOM_NOW = new Date("2026-09-09T03:30:00.000Z");

export const ROOM_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:r1",
  "SUMMARY:Taken",
  "DTSTART;TZID=America/New_York:20260909T100000",
  "DTEND;TZID=America/New_York:20260909T120000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const NINE_TO_FIVE = { open: "09:00", close: "17:00" };

export const ROOM_HOURS = {
  mon: NINE_TO_FIVE,
  tue: NINE_TO_FIVE,
  wed: NINE_TO_FIVE,
  thu: NINE_TO_FIVE,
  fri: NINE_TO_FIVE,
  sat: {},
  sun: {},
};

/**
 * calTables(url), open nine to five and booking by `rules`, with one booking on record: Thursday two to three in the
 * afternoon, New York.
 */
export const roomTables = (url, rules = calProfile.booking_rules) => {
  const t = calTables(url);
  const [row] = t.tenant_config;
  const brain = { ...row.config.brain, profile: { ...calProfile, hours: ROOM_HOURS, booking_rules: rules } };
  return {
    ...t,
    tenant_config: [{ ...row, config: { ...row.config, brain } }],
    appointments: [
      {
        id: "appt-room",
        tenant_id: A,
        source: "booking_email",
        tool: "booksy",
        external_id: "booksy:appt-room",
        status: "booked",
        starts_at: "2026-09-10T18:00:00.000Z",
        ends_at: "2026-09-10T19:00:00.000Z",
        all_day: false,
        timezone: "America/New_York",
      },
    ],
  };
};

/** The open slots of half an hour in each day's windows, as freeWindows gives them. */
export const slotsOf = (openings) =>
  openings.map((o) => ({
    day: o.key,
    open: o.windows.reduce((n, w) => n + Math.floor((w.end - w.start) / (30 * 60_000)), 0),
  }));

export const sumOpen = (days) => days.reduce((n, d) => n + d.open, 0);
