/**
 * The page context, built on the server (the Phase 2 plan, PR 2.2, Task 8): what the tab says is on screen, read
 * again through each page's own readers under the person's workspace, one `search_result` block for the page's
 * aggregate and one per row, in the page's words; a row another workspace holds is absent and nothing names it; the
 * caps (D11); the per-instance minute the warm keeps a build for (D7); and the shape of the workspace as one block
 * (D9). Executed over the database in memory: every query the build makes is in `ctx.supabase.seen`.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "./_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { buildContext, clearContextCache, shapeBlock, CONTEXT_TTL_MS } = await import(
  at("apps/dashboard/src/server/ask/context.ts")
);
const { readerCache, readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));
const { shape } = await import(at("apps/dashboard/src/server/readers/shape.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));

beforeEach(() => {
  readerCache.clear();
  clearContextCache();
});

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const C2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const CB = "cccccccc-cccc-4ccc-8ccc-cccccccccccb";
const P1 = "abababab-abab-4aba-8aba-abababababa1";
const P2 = "abababab-abab-4aba-8aba-abababababa2";
const PB = "abababab-abab-4aba-8aba-ababababababb";
const K1 = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const KB = "dddddddd-dddd-4ddd-8ddd-dddddddddddb";
const E1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at 10:00 in New York. */
const NOW = new Date("2026-09-14T14:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const HOUR = 3600_000;

const contactOf = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
});
const conversation = (id, tenant_id, contact_id, name, over = {}) => ({
  id,
  tenant_id,
  contact_id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: iso(NOW.getTime() - HOUR),
  last_message_at: iso(NOW.getTime() - HOUR),
  contacts: contactOf(contact_id, name),
  ...over,
});
const message = (id, conversation_id, tenant_id, body) => ({
  id,
  conversation_id,
  tenant_id,
  direction: "inbound",
  sender: "client",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "delivered",
  created_at: iso(NOW.getTime() - HOUR),
  channel_ts: iso(NOW.getTime() - HOUR),
  channel: "whatsapp",
});
const call = (id, tenant_id, name, over = {}) => ({
  id,
  tenant_id,
  retell_call_id: `r-${id}`,
  direction: "inbound",
  call_type: "phone_call",
  status: "ended",
  from_e164: "+15555550100",
  from_raw: null,
  to_e164: "+15555550199",
  started_at: iso(NOW.getTime() - 2 * HOUR),
  ended_at: iso(NOW.getTime() - 2 * HOUR + 200_000),
  duration_ms: 200_000,
  disconnection_reason: "user_hangup",
  sentiment: null,
  call_successful: true,
  in_voicemail: false,
  summary: "Asked about Saturday.",
  wanted: null,
  outcome: null,
  follow_up: null,
  caller_name: name,
  transcript_object: [],
  recording: null,
  conversation_id: null,
  contact_id: null,
  message_id: null,
  updated_at: iso(NOW.getTime()),
  contacts: null,
  ...over,
});
/** A People row as people_list answers it. */
const personRow = (id, name, over = {}) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+15555550100",
  consent: "opted_in",
  dnc: false,
  has_chat: true,
  first_seen_at: iso(NOW.getTime() - 60 * 24 * HOUR),
  last_message_at: iso(NOW.getTime() - 3 * HOUR),
  last_inbound_at: iso(NOW.getTime() - 3 * HOUR),
  latest_conversation_id: null,
  conversation_count: 1,
  ...over,
});
/** metrics_summary as 00037_hygiene.sql returns it: a calm day with one message and one call. */
const METRICS = {
  workspace: { name: "Harbor", timezone: TZ, status: "active" },
  channels: [{ kind: "whatsapp", status: "active", number: "+15555550199" }],
  window: {
    days: 1,
    since: "2026-09-14T04:00:00+00:00",
    since_local: "2026-09-14T00:00:00",
    now_local: "2026-09-14T10:00:00",
  },
  now: {
    escalations_open: 1,
    oldest_open_escalation_at: null,
    threads_needing_human: 1,
    threads_snoozed: 0,
    threads_awaiting_reply: 1,
    last_inbound_at: null,
    last_outbound_at: null,
  },
  period: {
    messages_in: 3,
    messages_out_ai: 1,
    messages_out_you: 0,
    conversations_active: 2,
    answered_by_ai: 1,
    answered_by_you: 0,
    unanswered_in_window: 1,
    median_reply_seconds_ai: null,
    send_failures: 0,
    escalations_new: 1,
    escalation_reasons: {},
    calls: 1,
    call_seconds: 200,
    call_sentiments: {},
    calls_voicemail: 0,
    new_contacts: 0,
  },
};
/** A receptionist's configuration the parser takes, with `over` in its brain. */
const brain = (over = {}) => ({
  business_name: "Harbor",
  booking_link: "https://book.example/harbor",
  system_prompt: "Answer as the front desk of Harbor: brief and warm, never a price.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
  ...over,
});
const COUNTS = { all: 3, ready: 2, nurture: 1, converted: 0, said_no: 0, not_a_fit: 0 };

/** Harbor (A) and Bayside (B): a thread, a call and a person each, and harbor's second thread handed to a person. */
function tables(over = {}) {
  return {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "operator",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        user_id: USER,
        tenant_id: B,
        role: "operator",
        tenants: { slug: "bayside" },
        created_at: "2026-02-01T00:00:00Z",
      },
    ],
    tenants: [
      { id: A, name: "Harbor", timezone: TZ, sells_by: "booking" },
      { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "booking" },
    ],
    tenant_config: [],
    tenant_channels: [],
    policies: [],
    conversations: [
      conversation(C1, A, P1, "Rosa"),
      conversation(C2, A, P2, "Quinn", { last_message_at: iso(NOW.getTime() - 5 * HOUR) }),
      conversation(CB, B, PB, "Bruno"),
    ],
    messages: [
      message("m1", C1, A, "Are you open Saturday?"),
      message("m2", C2, A, "Can I talk to someone?"),
      message("m3", CB, B, "Hola"),
    ],
    escalations: [
      {
        id: E1,
        tenant_id: A,
        conversation_id: C2,
        reason: "human_token",
        details: "asked for a person",
        state: "open",
        created_at: iso(NOW.getTime() - 2 * HOUR),
      },
    ],
    calls: [
      call(K1, A, "Rosa", {
        contact_id: P1,
        contacts: { display_name: "Rosa", wa_profile_name: null, phone_e164: "+15555550100" },
      }),
      call(KB, B, "Bruno", { contacts: { display_name: "Bruno", wa_profile_name: null, phone_e164: "+15555550101" } }),
    ],
    contacts: [],
    templates: [],
    segments: [],
    segment_members: [],
    playbooks: [],
    broadcasts: [],
    broadcast_recipients: [],
    ...over,
  };
}
const RPCS = {
  metrics_summary: () => METRICS,
  people_list: (a) =>
    (a.p_tenant_id === A ? [personRow(P1, "Rosa"), personRow(P2, "Quinn")] : [personRow(PB, "Bruno")]).slice(
      a.p_offset ?? 0,
      (a.p_offset ?? 0) + (a.p_limit ?? 1000),
    ),
  lead_list_counts: () => COUNTS,
};
const ctxFor = (t = tables(), rpcs = RPCS) => ({
  supabase: fakeDb(t, {}, rpcs),
  userId: USER,
  email: "ada@example.com",
  params: {},
});
/** A warm's reader context in harbor, on the fixture's clock. */
const rcIn = (ctx, tenantId = A, opts = { keep: true }) =>
  readerContext(ctx, { tenantId, role: "operator" }, NOW, opts);
/** A page context as the tab sends it. */
const page = (surface, rows, over = {}) => ({
  v: 1,
  surface,
  route: surface,
  view: null,
  focus: null,
  rows,
  askedAt: 1,
  ...over,
});
const textOf = (b) => b.content[0].text;
/** What was logged while `fn` ran, every level. */
async function logs(fn) {
  const lines = [];
  const was = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  console.error = console.warn = console.log = console.info = (...a) => lines.push(a.map(String).join(" "));
  try {
    return { result: await fn(), lines };
  } finally {
    Object.assign(console, was);
  }
}

/* ------------------------------------------------------------------ the day */

test("Today: the queue's rows the page drew, each as the queue says it (who, the row's state, when, where it opens), after the page's own aggregate; a thread another workspace holds is absent, and no block or log names it", async () => {
  const ctx = ctxFor();
  const { result: b, lines } = await logs(() =>
    buildContext(
      rcIn(ctx),
      page("today", [
        { kind: "thread", id: C2 },
        { kind: "thread", id: CB },
      ]),
    ),
  );
  assert.deepEqual(
    b.blocks.map((x) => x.source),
    ["page://today", `thread://${C2}`],
  );
  assert.equal(b.blocks[0].title, "Today");
  assert.match(textOf(b.blocks[0]), /^Today: /, "the day's standing, first");
  assert.match(textOf(b.blocks[0]), /1 need you/, "the queue's own parts");
  assert.equal(b.blocks[1].title, "Quinn");
  assert.match(textOf(b.blocks[1]), /^Quinn · /);
  assert.ok(textOf(b.blocks[1]).endsWith(`route: inbox/th-${C2}`), textOf(b.blocks[1]));
  for (const x of b.blocks) {
    assert.equal(x.type, "search_result");
    assert.deepEqual(x.citations, { enabled: false });
    assert.equal(x.content.length, 1);
  }
  assert.deepEqual(b.refs, [
    { kind: "page", id: "today", route: "today", label: "Today" },
    { kind: "thread", id: C2, route: `inbox/th-${C2}`, label: "Quinn" },
  ]);
  assert.equal(b.rows, 1);
  assert.equal(b.warm, "miss");
  assert.ok(!JSON.stringify(b).includes(CB), "no block names bayside's thread");
  assert.ok(!lines.some((l) => l.includes(CB)), "and no log line does");
});

test("the Inbox: the threads in the bucket the page drew, each in list_threads' words, and every bucket counted as list_threads counts it; Conversations: its threads and calls; Live: its calls -- another workspace's rows absent from each", async () => {
  const inbox = await buildContext(
    rcIn(ctxFor()),
    page(
      "inbox",
      [
        { kind: "thread", id: C1 },
        { kind: "thread", id: CB },
        { kind: "thread", id: C2 },
      ],
      { view: "all" },
    ),
  );
  assert.deepEqual(
    inbox.blocks.map((x) => [x.source, x.title]),
    [
      ["page://inbox", "Inbox"],
      [`thread://${C1}`, "Rosa"],
      [`thread://${C2}`, "Quinn"],
    ],
    "in the page's order, bayside's thread left out",
  );
  assert.match(
    textOf(inbox.blocks[0]),
    /^Inbox, all: 2 threads on screen · needs you: 1 · held: 0 · waiting on you: 0/,
  );
  assert.match(textOf(inbox.blocks[1]), /^Rosa · answering · Are you open Saturday\?/);
  assert.match(textOf(inbox.blocks[2]), /^Quinn · needs you · /);

  const cv = await buildContext(
    rcIn(ctxFor()),
    page(
      "conversations",
      [
        { kind: "conversation", id: C1 },
        { kind: "call", id: K1 },
        { kind: "call", id: KB },
        { kind: "conversation", id: CB },
      ],
      { route: "conversations/all", view: "all" },
    ),
  );
  assert.deepEqual(
    cv.blocks.map((x) => x.source),
    ["page://conversations", `conversation://${C1}`, `call://${K1}`],
  );
  assert.equal(textOf(cv.blocks[0]), "Conversations, all: 1 conversations and 1 calls on screen");
  assert.ok(textOf(cv.blocks[1]).endsWith(`route: conversations/${C1}`));
  assert.match(textOf(cv.blocks[2]), /^Rosa · handled · .* · Asked about Saturday\. · route: conversations\/cv-/);
  assert.deepEqual(
    cv.refs.map((r) => [r.kind, r.id]),
    [
      ["page", "conversations/all"],
      ["conversation", C1],
      ["call", K1],
    ],
  );

  const live = await buildContext(
    rcIn(ctxFor()),
    page("live", [
      { kind: "call", id: KB },
      { kind: "call", id: K1 },
    ]),
  );
  assert.deepEqual(
    live.blocks.map((x) => x.source),
    ["page://live", `call://${K1}`],
  );
  assert.equal(textOf(live.blocks[0]), "Live: 0 live now · 1 calls on screen");
});

/* ------------------------------------------------------------------ people */

test("People: the people the page drew, each as search_people says them, and how many there are in all; the Pipeline where deals are off draws People's rows; another workspace's person is absent", async () => {
  const b = await buildContext(
    rcIn(ctxFor()),
    page(
      "people",
      [
        { kind: "person", id: PB },
        { kind: "person", id: P2 },
        { kind: "person", id: P1 },
      ],
      {
        route: "clients",
        view: "all",
      },
    ),
  );
  assert.deepEqual(
    b.blocks.map((x) => [x.source, x.title]),
    [
      ["page://people", "People"],
      [`person://${P2}`, "Quinn"],
      [`person://${P1}`, "Rosa"],
    ],
  );
  assert.equal(textOf(b.blocks[0]), "People, all: 2 people on screen · people: 2");
  assert.match(textOf(b.blocks[2]), /^Rosa · .*last contact .* · route: clients\/abababab/);
  assert.deepEqual(b.refs.slice(1), [
    { kind: "person", id: P2, route: `clients/${P2}`, label: "Quinn" },
    { kind: "person", id: P1, route: `clients/${P1}`, label: "Rosa" },
  ]);

  const off = await buildContext(
    rcIn(ctxFor()),
    page("pipeline", [{ kind: "person", id: P1 }], { route: "clients/pipeline", view: "all" }),
  );
  assert.deepEqual(
    off.blocks.map((x) => x.source),
    ["page://pipeline", `person://${P1}`],
  );
  assert.match(textOf(off.blocks[0]), /^Pipeline, all: 1 people on screen/);
});

test("the Pipeline where deals are on: each row in its group with its service and value, and the line over the table and the groups' counts, as the page builds them", async () => {
  const t = tables({
    tenants: [
      { id: A, name: "Harbor", timezone: TZ, sells_by: "proposal" },
      { id: B, name: "Bayside", timezone: "Europe/Madrid", sells_by: "booking" },
    ],
    deals: [],
  });
  const rpcs = {
    ...RPCS,
    people_list: (a) =>
      a.p_tenant_id === A
        ? [
            personRow(P1, "Rosa", {
              deal_id: "d1",
              deal_stage: "proposed",
              deal_service: "Kitchen remodel",
              deal_proposed_at: iso(NOW.getTime() - 3 * 24 * HOUR),
              deal_amount_cents: 120_000,
            }),
            personRow(P2, "Quinn"),
          ].slice(a.p_offset ?? 0, (a.p_offset ?? 0) + (a.p_limit ?? 1000))
        : [],
  };
  const b = await buildContext(
    rcIn(ctxFor(t, rpcs)),
    page(
      "pipeline",
      [
        { kind: "person", id: P1 },
        { kind: "person", id: PB },
      ],
      {
        route: "clients/pipeline",
        view: "all",
      },
    ),
  );
  assert.deepEqual(
    b.blocks.map((x) => x.source),
    ["page://pipeline", `person://${P1}`],
  );
  assert.match(textOf(b.blocks[1]), /^Rosa · .*Kitchen remodel · \$1,200/);
  assert.match(textOf(b.blocks[0]), /^Pipeline, .*: 1 on screen · .*1 proposal/);
});

test("the Calendar: the people its board names in the span the page drew, each with what they have on it, and the span's feed, taken and open times; a person the board does not name is absent", async () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:a1",
    "SUMMARY:Ana Ruiz · Balayage",
    "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
    "DTSTART;TZID=America/New_York:20260915T140000",
    "DTEND;TZID=America/New_York:20260915T153000",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const ANA = { id: "k-ana", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null };
  const t = tables({
    tenant_config: [
      {
        tenant_id: A,
        config: {
          calendar: { ical_url: "https://cal.example/ok.ics" },
          brain: brain({
            profile: {
              hours: { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" } },
              closures: [],
              services: [{ name: "Balayage", duration_min: 90 }],
              booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
            },
          }),
        },
        version: 1,
      },
    ],
  });
  const was = globalThis.fetch;
  globalThis.fetch = async () => new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } });
  forgetFeeds();
  try {
    const b = await buildContext(
      rcIn(ctxFor(t, { ...RPCS, people_list: (a) => (a.p_tenant_id === A ? [ANA] : []) })),
      page(
        "calendar",
        [
          { kind: "person", id: "k-ana" },
          { kind: "person", id: P1 },
        ],
        { view: "2026-09-14/7" },
      ),
    );
    assert.deepEqual(
      b.blocks.map((x) => [x.source, x.title]),
      [
        ["page://calendar", "Calendar"],
        ["person://k-ana", "Ana Ruiz"],
      ],
    );
    assert.match(textOf(b.blocks[1]), /^Ana Ruiz · .*Balayage.* · route: clients\/k-ana$/);
    assert.match(textOf(b.blocks[0]), /^Calendar, .* · taken: 1 · open times: \d+/);
  } finally {
    globalThis.fetch = was;
    forgetFeeds();
  }
});

test("Leads: the leads the page drew, each as its row says it and opened where the page opens it, the rail's counts and the searches waiting for an answer; a lead the Leads read did not return is absent, and a lead is never a citation's row", async () => {
  const LEAD = "12121212-1212-4121-8121-121212121212";
  const SEARCH = "34343434-3434-4343-8343-343434343434";
  const pageRow = (lead_id, business_name) => ({
    member_id: `m-${lead_id}`,
    lead_id,
    place_id: `place-${lead_id}`,
    search_id: SEARCH,
    round_id: null,
    class: "qualified",
    excluded_by: null,
    fit: "strong",
    reason: "independent, in the area",
    distance_m: 2400,
    counted: true,
    counted_month: "2026-09",
    judgment: null,
    shares: [],
    business_name,
    category: "Personal trainer",
    street: "1 Main St",
    city: "Austin",
    region: "TX",
    postal_code: "78704",
    lat: 30.24,
    lng: -97.75,
    website_host: "example.com",
    instagram_url: null,
    phone_e164: "+15555550142",
    phone_sources: 2,
    phone_wrong: false,
    email: "hello@example.com",
    email_alternates: [],
    email_state: "ok",
    email_checked_at: "2026-09-12T12:00:00Z",
    rating: 4.9,
    reviews: 61,
    stage: "ready",
    closed_reason: null,
    last_outcome: null,
    last_note: null,
    contact_id: null,
    contacted_at: null,
    converted_at: null,
    exported_at: null,
    found_at: "2026-09-12T10:00:00Z",
    places: 1,
    version: 3,
    page_key: "0000123456",
    sort_key: `0000123456|m-${lead_id}`,
  });
  const rpcs = {
    ...RPCS,
    leads_page: (a) => (a.p_tenant_id === A ? [pageRow(LEAD, "Travis Heights Coaching")] : [pageRow("x", "Elsewhere")]),
  };
  const t = tables({
    lead_searches: [
      { id: SEARCH, tenant_id: A, name: "Trainers in Austin", asked: "trainers", created_at: "2026-09-12T09:00:00Z" },
    ],
  });
  const b = await buildContext(
    rcIn(ctxFor(t, rpcs)),
    page(
      "leads",
      [
        { kind: "lead", id: "x" },
        { kind: "lead", id: LEAD },
      ],
      { route: "clients/leads", view: "ready" },
    ),
  );
  assert.deepEqual(
    b.blocks.map((x) => [x.source, x.title]),
    [
      ["page://leads", "Leads"],
      [`lead://${LEAD}`, "Travis Heights Coaching"],
    ],
  );
  assert.ok(textOf(b.blocks[1]).endsWith(`route: clients/leads:l-ready:p-${LEAD}`), textOf(b.blocks[1]));
  assert.match(textOf(b.blocks[0]), /^Leads, ready: 1 leads on screen · all: 3 · ready: 2 · nurture: 1/);
  assert.deepEqual(
    b.refs.map((r) => r.kind),
    ["page"],
    "a lead rides as data and is cited by its page (Phase 4 makes it a row)",
  );
});

/* ------------------------------------------------------------------ the rest */

test("Campaigns: the playbooks, the broadcasts or the messages the page drew, by its tab, each in its page's words and none a citation's row; Reports, Settings, Start and any other page are their aggregate alone", async () => {
  const PB1 = "77777777-7777-4777-8777-7777777777a1";
  const BC1 = "77777777-7777-4777-8777-7777777777b1";
  const T1 = "77777777-7777-4777-8777-7777777777c1";
  const t = tables({
    playbooks: [
      {
        id: PB1,
        tenant_id: A,
        kind: "moment",
        name: "Win-back",
        trigger: "quiet_30",
        list_id: null,
        list_key: null,
        template_id: T1,
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
      },
    ],
    broadcasts: [
      {
        id: BC1,
        tenant_id: A,
        name: "September offer",
        template_id: T1,
        template_name: "winback_offer",
        template_language: "en_US",
        params: [],
        audience: { kind: "everyone", id: null, label: "Everyone" },
        state: "scheduled",
        scheduled_for: "2026-09-15T14:00:00Z",
        started_at: null,
        finished_at: null,
        recipient_count: 3,
        failure: null,
        created_at: "2026-09-10T00:00:00Z",
        playbook_id: null,
        run_for: null,
      },
    ],
    templates: [
      {
        id: T1,
        tenant_id: A,
        channel: "whatsapp",
        name: "winback_offer",
        language: "en_US",
        body_preview: "We miss you",
        variables: [],
        category: "MARKETING",
        meta_status: "approved",
        quality: null,
        rejected_reason: null,
        synced_at: null,
        source: "meta",
        hidden_at: null,
        title: "Win-back offer",
        components: [],
      },
    ],
  });
  const pb = await buildContext(
    rcIn(ctxFor(t)),
    page("campaigns", [{ kind: "playbook", id: PB1 }], { route: "outbound", view: "playbooks" }),
  );
  assert.deepEqual(
    pb.blocks.map((x) => [x.source, x.title]),
    [
      ["page://campaigns", "Campaigns"],
      [`playbook://${PB1}`, "Win-back"],
    ],
  );
  assert.ok(textOf(pb.blocks[1]).endsWith(`route: outbound/${PB1}`));
  assert.match(textOf(pb.blocks[0]), /^Campaigns, playbooks: 1 on screen · playbooks: 1, 1 running/);

  const bc = await buildContext(
    rcIn(ctxFor(t)),
    page("campaigns", [{ kind: "run", id: BC1 }], { route: "broadcasts", view: "broadcasts" }),
  );
  assert.deepEqual(
    bc.blocks.map((x) => [x.source, x.title]),
    [
      ["page://campaigns", "Campaigns"],
      [`run://${BC1}`, "September offer"],
    ],
  );
  assert.match(textOf(bc.blocks[1]), /^September offer · .* · 3 people · 0 sent · route: broadcasts\/run:/);

  const msgs = await buildContext(
    rcIn(ctxFor(t)),
    page("campaigns", [{ kind: "template", id: T1 }], { route: "messages", view: "messages" }),
  );
  assert.deepEqual(
    msgs.blocks.map((x) => [x.source, x.title]),
    [
      ["page://campaigns", "Campaigns"],
      [`template://${T1}`, "Win-back offer"],
    ],
  );
  assert.equal(textOf(msgs.blocks[1]), "Win-back offer · MARKETING · approved · en_US · route: messages");
  for (const b of [pb, bc, msgs])
    assert.deepEqual(
      b.refs.map((r) => r.kind),
      ["page"],
    );

  const s = await buildContext(
    rcIn(ctxFor(tables({ tenant_channels: [{ tenant_id: A, kind: "whatsapp", status: "active" }] }))),
    page("settings", [], { route: "admin/hours", view: "hours" }),
  );
  assert.deepEqual(
    s.blocks.map((x) => x.source),
    ["page://settings"],
  );
  assert.match(
    textOf(s.blocks[0]),
    /^Settings, hours · Harbor · America\/New_York · lines: whatsapp active · deals off$/,
  );

  const roster = () => [
    { membership_id: "m1", member_user_id: USER, email: "ada@example.com", display_name: "Ada", role: "operator" },
  ];
  const st = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, team_roster: roster })),
    page("start", [], { route: "start/phone", view: "phone" }),
  );
  assert.deepEqual(
    st.blocks.map((x) => x.source),
    ["page://start"],
  );
  assert.match(textOf(st.blocks[0]), /^Start, phone · .* · \d+ of \d+ set up/);

  const o = await buildContext(rcIn(ctxFor()), page("other", [{ kind: "thread", id: C1 }], { route: "billing" }));
  assert.deepEqual(
    o.blocks.map((x) => [x.source, textOf(x)]),
    [["page://other", "This page: billing · nothing on it is read here"]],
  );
  const unknown = await buildContext(rcIn(ctxFor()), page("nowhere", [], { route: "nowhere" }));
  assert.deepEqual(
    unknown.blocks.map((x) => x.source),
    ["page://nowhere"],
    "a surface no provider knows reads nothing",
  );
});

test("Reports: the period the page shows, its tiles and lines, as get_report says them, and no row", async () => {
  const series = (a) => ({
    tenant_id: A,
    days: a.p_days,
    timezone: TZ,
    since: "2026-08-16",
    until: "2026-09-14",
    series: [],
    escalation_reasons: {},
    reply_time: { count: 0, median_seconds: null, p90_seconds: null, buckets: [] },
  });
  const b = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, report_series: series })),
    page("reports", [], { view: "7" }),
  );
  assert.deepEqual(
    b.blocks.map((x) => x.source),
    ["page://reports"],
  );
  assert.match(textOf(b.blocks[0]), /^Reports, 7 days · /);
});

test("a provider whose read fails costs its blocks and never the build: the page's aggregate says it could not be read, and that build is not kept", async () => {
  const rpcs = { ...RPCS, metrics_summary: () => ({ error: "not modelled here" }) };
  const ctx = ctxFor(tables(), rpcs);
  const { result: b } = await logs(() => buildContext(rcIn(ctx), page("today", [{ kind: "thread", id: C2 }])));
  assert.deepEqual(
    b.blocks.map((x) => [x.source, textOf(x)]),
    [["page://today", "Today: could not be read just now"]],
  );
  const before = ctx.supabase.seen.length;
  await logs(() => buildContext(rcIn(ctx), page("today", [{ kind: "thread", id: C2 }])));
  assert.ok(ctx.supabase.seen.length > before, "a failed build is read again");
});

/* ------------------------------------------------------------------ the cache */

test("a second build within the minute reads nothing and says it was a hit; another person's, another row set's or a changed view reads again; the focus and when the tab asked are not in the key", async () => {
  const ctx = ctxFor();
  const first = await buildContext(rcIn(ctx), page("inbox", [{ kind: "thread", id: C1 }], { view: "all" }));
  assert.ok(ctx.supabase.seen.length > 0);
  ctx.supabase.seen.length = 0;
  const again = await buildContext(
    rcIn(ctx),
    page("inbox", [{ kind: "thread", id: C1 }], {
      view: "all",
      askedAt: 999,
      focus: { kind: "thread", id: C1, label: "Rosa" },
    }),
  );
  assert.deepEqual(ctx.supabase.seen, [], "nothing read: the focus and askedAt changed, the key did not");
  assert.equal(again.warm, "hit");
  assert.deepEqual(again.blocks, first.blocks);
  assert.equal(again.stamp, first.stamp, "the kept build's own stamp");

  await buildContext(
    rcIn(ctx),
    page(
      "inbox",
      [
        { kind: "thread", id: C1 },
        { kind: "thread", id: C2 },
      ],
      { view: "all" },
    ),
  );
  assert.ok(ctx.supabase.seen.length > 0, "a changed row set reads again");
  ctx.supabase.seen.length = 0;
  const other = await buildContext(rcIn(ctx), page("inbox", [{ kind: "thread", id: C1 }], { view: "needs_you" }));
  assert.equal(other.warm, "miss");
  assert.ok(ctx.supabase.seen.length > 0, "a changed view reads again");
  ctx.supabase.seen.length = 0;
  const someoneElse = { ...ctx, userId: "u2" };
  const theirs = await buildContext(
    readerContext(someoneElse, { tenantId: A, role: "operator" }, NOW, { keep: true }),
    page("inbox", [{ kind: "thread", id: C1 }], { view: "all" }),
  );
  assert.equal(theirs.warm, "miss", "per person");
  assert.ok(CONTEXT_TTL_MS === 60_000);
});

/* ------------------------------------------------------------------ the caps */

test("forty rows and eight thousand characters at most, cut in the page's order, the aggregate saying how many rows were left out; a row's line is 160 characters at most and keeps where it opens", async () => {
  const long = "Can you fit me in on Saturday morning, or failing that on Sunday? ".repeat(6);
  const ids = Array.from({ length: 45 }, (_, i) => `cccccccc-cccc-4ccc-8ccc-${String(i).padStart(12, "0")}`);
  const t = tables({
    conversations: ids.map((id, i) =>
      conversation(id, A, `p-${i}`, `Customer number ${i} with a long display name`, {
        last_message_at: iso(NOW.getTime() - (i + 1) * 60_000),
      }),
    ),
    messages: ids.map((id, i) => message(`m-${i}`, id, A, long)),
    escalations: [],
  });
  const b = await buildContext(
    rcIn(ctxFor(t)),
    page(
      "inbox",
      ids.map((id) => ({ kind: "thread", id })),
      { view: "all" },
    ),
  );
  assert.ok(b.chars <= 8_000, `${b.chars} characters`);
  assert.equal(
    b.chars,
    b.blocks.reduce((n, x) => n + x.source.length + x.title.length + textOf(x).length, 0),
  );
  assert.ok(b.rows < 40, "the characters cut before the rows did");
  assert.deepEqual(
    b.blocks.slice(1).map((x) => x.source),
    ids.slice(0, b.rows).map((id) => `thread://${id}`),
    "the first rows the page showed, in its order",
  );
  for (const x of b.blocks.slice(1)) {
    assert.ok(textOf(x).length <= 160, textOf(x));
    assert.match(textOf(x), /route: inbox\/th-cccccccc-[0-9a-f-]+$/);
  }
  assert.ok(textOf(b.blocks[0]).length <= 1_200);
  assert.match(textOf(b.blocks[0]), new RegExp(`${45 - b.rows} more rows on screen left out of this context$`));

  // Short rows: the forty are the cap.
  clearContextCache();
  const short = tables({
    conversations: ids.map((id, i) =>
      conversation(id, A, `p-${i}`, `C${i}`, { last_message_at: iso(NOW.getTime() - (i + 1) * 60_000) }),
    ),
    messages: [],
    escalations: [],
  });
  const forty = await buildContext(
    rcIn(ctxFor(short)),
    page(
      "inbox",
      ids.map((id) => ({ kind: "thread", id })),
    ),
  );
  assert.equal(forty.rows, 40);
  assert.match(textOf(forty.blocks[0]), / · 5 more rows on screen left out of this context$/);
  assert.ok(forty.chars <= 8_000);
});

/* ------------------------------------------------------------------ the shape */

const shapeTables = (over = {}) =>
  tables({
    tenant_config: [{ tenant_id: A, config: { brain: brain() }, version: 1 }],
    tenant_channels: [
      { tenant_id: A, kind: "whatsapp", status: "active", number_e164: "+15555550199" },
      { tenant_id: A, kind: "sms", status: "pending", number_e164: "+15555550198" },
    ],
    segments: [
      { id: "s2", tenant_id: A, name: "Regulars", rule: null, archived_at: null },
      { id: "s1", tenant_id: A, name: "Brides", rule: null, archived_at: "2026-09-01T00:00:00Z" },
    ],
    playbooks: [
      {
        id: "pb2",
        tenant_id: A,
        kind: "moment",
        name: "Win-back",
        trigger: "quiet_30",
        state: "running",
        created_at: "2026-09-02T00:00:00Z",
      },
      {
        id: "pb1",
        tenant_id: A,
        kind: "moment",
        name: "Reminder",
        trigger: "visit_tomorrow",
        state: "paused",
        created_at: "2026-09-01T00:00:00Z",
      },
    ],
    ...over,
  });

test("the shape block: sorted and byte-stable -- the same workspace read in another row order writes the same bytes -- unchanged by a counter (a new message, a run's send), and 1,500 characters at most", async () => {
  const one = shapeBlock((await load(rcIn(ctxFor(shapeTables()), A, { keep: false }), shape, undefined)).data);
  const t = shapeTables();
  t.tenant_channels.reverse();
  t.segments.reverse();
  t.playbooks.reverse();
  const two = shapeBlock((await load(rcIn(ctxFor(t), A, { keep: false }), shape, undefined)).data);
  assert.equal(two, one, "the same bytes for a reordered fixture");
  assert.match(one, /^The workspace: Harbor · zone America\/New_York\nLines: sms pending, whatsapp active\n/);
  assert.match(one, /booking link set/);
  assert.match(one, /Lists: Brides \(archived\), Regulars\n/);
  assert.match(one, /Playbooks: Reminder \(visit_tomorrow, paused\); Win-back \(quiet_30, running\)$/);

  const busier = shapeTables({
    messages: [...tables().messages, message("m9", C1, A, "One more")],
    broadcasts: [
      {
        id: "b1",
        tenant_id: A,
        playbook_id: "pb2",
        name: "Win-back",
        state: "sent",
        recipient_count: 9,
        created_at: iso(NOW.getTime()),
      },
    ],
    broadcast_recipients: [
      { tenant_id: A, broadcast_id: "b1", contact_id: P1, state: "sent", sent_at: iso(NOW.getTime()) },
    ],
  });
  const three = shapeBlock((await load(rcIn(ctxFor(busier), A, { keep: false }), shape, undefined)).data);
  assert.equal(three, one, "a message and a run's send change nothing");

  const many = shapeBlock({
    name: "Harbor",
    timezone: TZ,
    deals_on: false,
    calendar_feed: false,
    booking_link: false,
    channels: [],
    mailbox: false,
    google: false,
    lists: Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, name: `A saved list called ${i}`, archived: false })),
    playbooks: [],
  });
  assert.ok(many.length <= 1_500, `${many.length}`);
  assert.ok(many.endsWith("…"), "the cut is said");
});

test("the shape reader is kept across turns for a context that keeps, and read every time for one that does not", async () => {
  const ctx = ctxFor(shapeTables());
  await load(rcIn(ctx, A, { keep: true }), shape, undefined);
  const after = ctx.supabase.seen.length;
  assert.ok(after > 0);
  await load(rcIn(ctx, A, { keep: true }), shape, undefined);
  assert.equal(ctx.supabase.seen.length, after, "the second turn read the kept shape");
  await load(rcIn(ctx, A, { keep: false }), shape, undefined);
  assert.ok(ctx.supabase.seen.length > after, "a route's context reads it again");
});

/* ------------------------------------------------------------------ the tab's warm */

test("the tab's warm (D6): the page's context posted to ask/warm for the named workspace, raw -- no refresh runs -- and a warm that fails, or a network that is down, costs nothing", async () => {
  const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));
  const { askApi } = await import(at("apps/dashboard/src/legacy-bridge/ask/api.ts"));
  const sent = [];
  let refreshed = 0;
  let answer = () => new Response(JSON.stringify({ ok: true, data: { stamp: 1 } }), { status: 200 });
  const client = createApi({
    fetch: async (url, init) => {
      sent.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
      return answer();
    },
    workspace: () => A,
    onSignedOut() {},
    onChooseWorkspace() {},
    refresh: async () => {
      refreshed++;
    },
    now: () => 1_000,
  });
  const api = askApi(client);
  const context = page("inbox", [{ kind: "thread", id: C1 }], { view: "all" });
  assert.equal(await api.warm(context), undefined);
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /\/api\/v1\/ask\/warm\?workspace=aaaaaaaa-/);
  assert.equal(sent[0].method, "POST");
  assert.deepEqual(sent[0].body, context);
  assert.equal(refreshed, 0, "raw: the tab's surfaces are not refreshed for a warm");
  answer = () => new Response(JSON.stringify({ ok: false, error: { code: "rate_limited" } }), { status: 429 });
  assert.equal(await api.warm(context), undefined, "a refusal is swallowed");
  answer = () => {
    throw new TypeError("Failed to fetch");
  };
  assert.equal(await api.warm(context), undefined, "and so is a network that is down");
});

test("an id that is not a uuid never reaches a read by id: Postgres would refuse the whole query, and the page's good rows with it", async () => {
  const ctx = ctxFor();
  const cv = await buildContext(
    rcIn(ctx),
    page(
      "conversations",
      [
        { kind: "conversation", id: "not-a-uuid" },
        { kind: "conversation", id: C1 },
      ],
      { route: "conversations/all", view: "all" },
    ),
  );
  assert.deepEqual(
    cv.blocks.map((b) => b.source),
    ["page://conversations", `conversation://${C1}`],
    "the good row is kept",
  );
  assert.ok(!JSON.stringify(ctx.supabase.seen).includes("not-a-uuid"), "the bad id was never read");
});
