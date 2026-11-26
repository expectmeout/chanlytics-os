/**
 * The page's context each turn rides with: Today, the Inbox, People, the Pipeline, Campaigns, Reports and the rest,
 * each as the page drew it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { leadQuestionRoute, leadsRoute } from "@chanlytics/contracts";
import { PLAN } from "../../_lead-fixtures.mjs";
import {
  A,
  B,
  C1,
  C2,
  CB,
  CONTEXT_TTL_MS,
  HOUR,
  K1,
  KB,
  NOW,
  P1,
  P2,
  PB,
  RPCS,
  TZ,
  USER,
  brain,
  buildContext,
  clearContextCache,
  ctxFor,
  forgetFeeds,
  iso,
  logs,
  page,
  personRow,
  rcIn,
  readerCache,
  readerContext,
  tables,
  textOf,
} from "./_context.mjs";

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
  assert.match(textOf(b.blocks[0]), /1 person/, "the queue's own parts");
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

test("Today: a search waiting for the owner's answer is a row a citation names, opened where every search opens; its line keeps the queue's button, the question", async () => {
  const S1 = "34343434-3434-4343-8343-343434343435";
  const waiting = {
    id: S1,
    tenant_id: A,
    name: "Trainers in Austin",
    asked: "trainers",
    via: "people",
    plan: PLAN,
    removed_at: null,
    created_at: "2026-09-12T09:00:00Z",
    round_id: "56565656-5656-4565-8565-565656565656",
    seq: 1,
    purpose: "probe",
    state: "waiting_on_owner",
    ending: null,
    question: { sentence: "Leave out the chains?", criterionKey: "chains", dropTerm: null, asked_at: iso(NOW - HOUR) },
    answered: null,
    target: 20,
    plan_version: 1,
    qualified: 12,
    review: 0,
    excluded: 13,
    counted: 12,
    judge_tokens: 900,
    ending_pending: null,
    waiting_since: iso(NOW - HOUR),
    ended_at: null,
    emails_checked: 0,
    with_phone: 0,
    undo_op_id: null,
    undo_version: null,
  };
  const b = await buildContext(
    rcIn(ctxFor(tables({ lead_searches_view: [waiting] }))),
    page("today", [{ kind: "search", id: S1 }]),
  );
  assert.deepEqual(
    b.blocks.map((x) => x.source),
    ["page://today", `search://${S1}`],
  );
  assert.ok(textOf(b.blocks[1]).endsWith(`route: ${leadQuestionRoute(S1)}`), textOf(b.blocks[1]));
  assert.deepEqual(b.refs.at(-1), {
    kind: "search",
    id: S1,
    route: leadsRoute({ searchId: S1 }),
    label: b.blocks[1].title,
  });
  assert.equal(b.refs.at(-1).route, `clients/leads:s-${S1}`, "the searches reader's route: one route per kind of row");
});

test("the Inbox: the threads in the bucket the page drew, each in inbox.list's words, and every bucket counted as inbox.list counts it; Conversations: its threads and calls; Live: its calls -- another workspace's rows absent from each", async () => {
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
    /^Inbox, all: 2 conversations on screen · needs you: 1 · held: 0 · you have it: 0/,
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

test("People: the people the page drew, each as people.search says them, and how many there are in all; the Pipeline of a workspace with no deal draws its board, nobody on it; another workspace's person is absent", async () => {
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

  // Every workspace has the Pipeline (0008, amended 18 Oct 2026): one with no deal draws its board, which holds nobody,
  // so the person the page names is not on it.
  const board = await buildContext(
    rcIn(ctxFor()),
    page("pipeline", [{ kind: "person", id: P1 }], { route: "clients/pipeline", view: "all" }),
  );
  assert.deepEqual(
    board.blocks.map((x) => x.source),
    ["page://pipeline"],
  );
  assert.match(textOf(board.blocks[0]), /^Pipeline, .*: 0 on screen/);
});

test("the Pipeline: each row in its group with its service and value, and the line over the table and the groups' counts, as the page builds them", async () => {
  const t = tables({
    tenants: [
      { id: A, name: "Harbor", timezone: TZ, appointment_word: "meeting" },
      { id: B, name: "Bayside", timezone: "Europe/Madrid" },
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

test("the Calendar page context leaves a cancelled visit out, as the board's record strikes it: not under what a person has on, not in taken, and a person with only a cancelled visit is absent (1.6)", async () => {
  const event = (uid, summary, phone, day, from, to) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${phone}`,
    `DTSTART;TZID=America/New_York:${day}T${from}00`,
    `DTEND;TZID=America/New_York:${day}T${to}00`,
    "END:VEVENT",
  ];
  const ics = [
    "BEGIN:VCALENDAR",
    ...event("a1", "Ana Ruiz · Balayage", "Ana Ruiz +1 (917) 555-0100", "20260915", "1400", "1530"),
    ...event("a2", "Ana Ruiz · Gloss", "Ana Ruiz +1 (917) 555-0100", "20260916", "1000", "1100"),
    ...event("b1", "Bea Cole · Cut", "Bea Cole +1 (917) 555-0111", "20260917", "1000", "1100"),
    "END:VCALENDAR",
  ].join("\r\n");
  const ANA = { id: "k-ana", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null };
  const BEA = { id: "k-bea", display_name: "Bea Cole", wa_profile_name: null, phone_e164: "+19175550111", email: null };
  const cancelled = (id, external_id, start, end) => ({
    id,
    tenant_id: A,
    source: "calendar_feed",
    external_id,
    status: "cancelled",
    starts_at: start,
    ends_at: end,
    vanished_at: null,
  });
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
    appointments: [
      cancelled("ap-a2", "a2", "2026-09-16T14:00:00Z", "2026-09-16T15:00:00Z"),
      cancelled("ap-b1", "b1", "2026-09-17T14:00:00Z", "2026-09-17T15:00:00Z"),
    ],
  });
  const was = globalThis.fetch;
  globalThis.fetch = async () => new Response(ics, { status: 200, headers: { "content-type": "text/calendar" } });
  forgetFeeds();
  try {
    const b = await buildContext(
      rcIn(ctxFor(t, { ...RPCS, people_list: (a) => (a.p_tenant_id === A ? [ANA, BEA] : []) })),
      page(
        "calendar",
        [
          { kind: "person", id: "k-ana" },
          { kind: "person", id: "k-bea" },
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
      "Bea has only a cancelled visit on the board: she is not named by it",
    );
    assert.match(textOf(b.blocks[1]), /Balayage/);
    assert.ok(!/Gloss/.test(textOf(b.blocks[1])), `a cancelled visit under what she has on: ${textOf(b.blocks[1])}`);
    assert.match(textOf(b.blocks[0]), /taken: 1 /, "REGRESSION: it counted the two cancelled visits as taken");
  } finally {
    globalThis.fetch = was;
    forgetFeeds();
  }
});

test("Leads: the leads the page drew, each as its row says it and opened where the page opens it, the rail's counts and the searches waiting for an answer; a lead the Leads read did not return is absent, and each lead is a row a citation names", async () => {
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
    b.refs,
    [
      { kind: "page", id: "clients/leads", route: "clients/leads", label: "Leads" },
      {
        kind: "lead",
        id: LEAD,
        route: `clients/leads:l-ready:p-${LEAD}`,
        label: "Travis Heights Coaching",
      },
    ],
    "a lead is a row a citation names, as the Leads read gave it: its peek, on the view it was read on",
  );
});

/* ------------------------------------------------------------------ the rest */

test("Campaigns: the playbooks, the broadcasts or the messages the page drew, by its tab, each in its page's words and each a row a citation names, a run as a broadcast; Reports, Settings, Start and any other page are their aggregate alone", async () => {
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
  const { result: pb, lines: unread } = await logs(() =>
    buildContext(
      rcIn(ctxFor(t)),
      page("campaigns", [{ kind: "playbook", id: PB1 }], { route: "outbound", view: "playbooks" }),
    ),
  );
  assert.deepEqual(
    pb.blocks.map((x) => [x.source, x.title]),
    [
      ["page://campaigns", "Campaigns"],
      [`playbook://${PB1}`, "Win-back"],
    ],
  );
  // Its last 30 days, as its row on Campaigns says them, straight after its name, so no cut reaches them (this world
  // models no campaign_series, so said unread, and the failed read logged); then its state and its next run; its moment
  // only where it is not its name (a Win-back on the Win-back moment says it once); and where its drawer opens (the
  // moment spec, A6).
  const pbLine = textOf(pb.blocks[1]);
  assert.match(
    pbLine,
    /^Win-back · 30d: not read · On · daily [^·]+ · next run [^·]+ · route: campaigns\/sequences\//,
    pbLine,
  );
  assert.ok(pbLine.endsWith(`route: campaigns/sequences/${PB1}`), pbLine);
  assert.match(textOf(pb.blocks[0]), /^Campaigns, playbooks: 1 on screen · playbooks: 1, 1 running/);
  assert.equal(unread.filter((l) => l.includes('"campaign_last_days_read_failed"')).length, 1, unread.join("\n"));
  // Read, its numbers are its row's (contracts sentResultsOfSource): a reply to an older send, with nothing sent in these
  // days, is nothing sent, as the ledger says it.
  const sources = (sent, replied, id = PB1) => ({
    ...RPCS,
    campaign_series: (a) => ({
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today: "2026-09-14",
      series: [],
      sources: [
        { id, kind: "playbook", name: "Win-back", template_name: "winback_offer", runs: 1, sent, delivered: sent },
      ].map((s) => ({ ...s, read: 0, replied, last_at: "2026-09-10T12:00:00Z" })),
      by_channel: [],
    }),
  });
  for (const [sent, replied, said] of [
    [0, 2, "Win-back · 30d: nothing sent · On · daily "],
    [4, 1, "Win-back · 30d: 4 sent, 1 replied · On · daily "],
  ]) {
    clearContextCache();
    readerCache.clear();
    const got = await buildContext(
      rcIn(ctxFor(t, sources(sent, replied))),
      page("campaigns", [{ kind: "playbook", id: PB1 }], { route: "outbound", view: "playbooks" }),
    );
    assert.ok(textOf(got.blocks[1]).startsWith(said), textOf(got.blocks[1]));
  }
  // A long name on a moment of its own: its numbers come whole, the line is cut after them (CONTEXT_CAPS.text), and
  // where it opens is never the part cut.
  const PB2 = "77777777-7777-4777-8777-7777777777a2";
  const long = tables({
    playbooks: [
      {
        ...t.playbooks[0],
        id: PB2,
        name: "The reminder our studio sends the day before every visit",
        trigger: "visit_tomorrow",
      },
    ],
    templates: t.templates,
  });
  clearContextCache();
  readerCache.clear();
  const longRow = await buildContext(
    rcIn(ctxFor(long, sources(0, 0, PB2))),
    page("campaigns", [{ kind: "playbook", id: PB2 }], { route: "campaigns", view: "playbooks:all" }),
  );
  const longLine = textOf(longRow.blocks[1]);
  assert.ok(
    longLine.startsWith("The reminder our studio sends the day before every visit · 30d: nothing sent · "),
    longLine,
  );
  assert.ok(longLine.endsWith(`… · route: campaigns/sequences/${PB2}`), longLine);
  assert.equal(longLine.length, 160, "cut at the cap");

  // The home's ledger (the moment spec, A2): its view says its status, group and search; its rows are its campaigns and
  // its one-off sends, each as its own page says it, and each a row a citation names.
  const ledger = await buildContext(
    rcIn(ctxFor(t)),
    page(
      "campaigns",
      [
        { kind: "playbook", id: PB1 },
        { kind: "run", id: BC1 },
      ],
      { route: "campaigns", view: "playbooks:needs:in:quiet" },
    ),
  );
  assert.deepEqual(
    ledger.blocks.map((x) => x.source),
    ["page://campaigns", `playbook://${PB1}`, `run://${BC1}`],
  );
  assert.match(textOf(ledger.blocks[0]), /^Campaigns, playbooks:needs:in:quiet: 2 on screen · playbooks: 1, 1 running/);
  assert.deepEqual(
    ledger.refs.slice(1).map((r) => [r.kind, r.id]),
    [
      ["playbook", PB1],
      ["broadcast", BC1],
    ],
  );

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
  assert.match(
    textOf(bc.blocks[1]),
    /^September offer · .* · 3 people · 0 sent · route: campaigns\/sequences\/[^/]+\/runs\//,
  );

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
  assert.equal(
    textOf(msgs.blocks[1]),
    "Win-back offer · MARKETING · approved · en_US · route: campaigns/messages/winback_offer",
    "the message's own address, not the Library's list",
  );
  // Each row as its page's reader gave it; a Broadcasts row, which the page calls a run, is cited as a broadcast.
  assert.deepEqual(
    [pb, bc, msgs].map((b) => b.refs.slice(1)),
    [
      [{ kind: "playbook", id: PB1, route: `campaigns/sequences/${PB1}`, label: "Win-back" }],
      [{ kind: "broadcast", id: BC1, route: `campaigns/sequences/${BC1}/runs/${BC1}`, label: "September offer" }],
      [{ kind: "template", id: T1, route: "campaigns/messages/winback_offer", label: "Win-back offer" }],
    ],
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
    /^Settings, hours · Harbor · America\/New_York · lines: whatsapp active · what it calls a booking: appointment$/,
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

test("Campaigns' reach-outs (A2): each one the ledger shows is a row of its own, read again as GET reach-outs lists it, its last 30 days what its row says (written, wrote back), its state and a run waiting; in the ledger's order among its campaigns; a citation names it as its first step's playbook", async () => {
  const PB = "77777777-7777-4777-8777-7777777777a1";
  const ROOT = "88888888-8888-4888-8888-8888888888a1";
  const STEP2 = "88888888-8888-4888-8888-8888888888a2";
  const PAUSED = "88888888-8888-4888-8888-8888888888b1";
  const SEARCH = "99999999-9999-4999-8999-9999999999a1";
  const RUN = "99999999-9999-4999-8999-9999999999b1";
  const EMAIL = "99999999-9999-4999-8999-9999999999c1";
  const step = (id, name, over = {}) => ({
    id,
    tenant_id: A,
    kind: "reach_out",
    name,
    state: "running",
    trigger: "lead_first",
    lead_search_id: SEARCH,
    after_playbook_id: null,
    after_days: null,
    gap_minutes: 12,
    mailbox_ids: [],
    signed_by: "Sam",
    include_unconfirmed: false,
    template_id: EMAIL,
    run_hour: 9,
    last_run_for: null,
    created_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  const t = tables({
    billing_accounts: [{ tenant_id: A, mode: "direct", status: "active" }],
    policies: [{ tenant_id: A, class: "outreach", mode: "ask", subject_type: null }],
    lead_searches: [{ id: SEARCH, tenant_id: A, name: "Movers · Austin", via: "people" }],
    playbooks: [
      {
        id: PB,
        tenant_id: A,
        kind: "moment",
        name: "Win-back",
        trigger: "quiet_30",
        list_id: null,
        list_key: null,
        template_id: null,
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
      step(ROOT, "Movers in Austin"),
      step(STEP2, "Movers in Austin · a nudge", {
        trigger: "after_step",
        lead_search_id: null,
        after_playbook_id: ROOT,
        after_days: 4,
      }),
      step(PAUSED, "Gyms nearby", { state: "paused", created_at: "2026-09-02T00:00:00Z" }),
    ],
    templates: [
      {
        id: EMAIL,
        tenant_id: A,
        channel: "email",
        components: [{ type: "BODY", text: "{{opening}}" }],
        body_preview: "{{opening}}",
      },
    ],
    broadcasts: [
      {
        id: RUN,
        tenant_id: A,
        name: "Movers in Austin",
        state: "pending_approval",
        audience: { kind: "reach_out", root_id: ROOT, step_id: ROOT, search_id: SEARCH },
        playbook_id: ROOT,
        run_for: "2026-09-15",
        recipient_count: 3,
      },
    ],
    mailbox_connections: [],
  });
  // Campaigns' own 30 days of the reach-outs (GET reports/reach-outs?period=30d): the report, and each chain's own totals.
  const reach = {
    ...RPCS,
    reach_out_report: () => ({ chains: [] }),
    // Twelve emails to five businesses, two of whom wrote back (00404 counts the businesses).
    reach_out_chain_totals: () => ({ [ROOT]: { written: 12, businesses: 5, wrote_back: 2 } }),
  };
  const ledger = (rpcs) =>
    buildContext(
      rcIn(ctxFor(t, rpcs)),
      page(
        "campaigns",
        [
          { kind: "reach_out", id: ROOT },
          { kind: "playbook", id: PB },
          { kind: "reach_out", id: PAUSED },
        ],
        { route: "campaigns", view: "playbooks:all" },
      ),
    );
  const got = await ledger(reach);
  assert.deepEqual(
    got.blocks.map((b) => [b.source, b.title]),
    [
      ["page://campaigns", "Campaigns"],
      [`reach_out://${ROOT}`, "Movers in Austin"],
      [`playbook://${PB}`, "Win-back"],
      [`reach_out://${PAUSED}`, "Gyms nearby"],
    ],
    "the ledger's order, every row it showed",
  );
  assert.equal(
    textOf(got.blocks[1]),
    `Movers in Austin · 30d: 5 businesses, 2 wrote back · Waiting for your approval · route: campaigns/sequences/${ROOT}`,
  );
  // Every chain was counted, so one with no totals wrote nothing in these days.
  assert.equal(
    textOf(got.blocks[3]),
    `Gyms nearby · 30d: nothing sent · Paused · route: campaigns/sequences/${PAUSED}`,
  );
  assert.match(
    textOf(got.blocks[0]),
    /^Campaigns, playbooks:all: 3 on screen · playbooks: 1, 1 running · reach-outs: 2/,
  );
  assert.deepEqual(
    got.refs.slice(1).map((r) => [r.kind, r.id, r.route]),
    [
      ["playbook", ROOT, `campaigns/sequences/${ROOT}`],
      ["playbook", PB, `campaigns/sequences/${PB}`],
      ["playbook", PAUSED, `campaigns/sequences/${PAUSED}`],
    ],
  );
  // A database before 00404 counts no businesses: the old line, in the emails written. One business is one business.
  clearContextCache();
  readerCache.clear();
  const old = await ledger({
    ...RPCS,
    reach_out_report: () => ({ chains: [] }),
    reach_out_chain_totals: () => ({ [ROOT]: { written: 12, wrote_back: 2 } }),
  });
  assert.ok(
    textOf(old.blocks[1]).startsWith("Movers in Austin · 30d: 12 written, 2 wrote back · Waiting for your approval"),
    textOf(old.blocks[1]),
  );
  clearContextCache();
  readerCache.clear();
  const one = await ledger({
    ...RPCS,
    reach_out_report: () => ({ chains: [] }),
    reach_out_chain_totals: () => ({ [ROOT]: { written: 3, businesses: 1, wrote_back: 1 } }),
  });
  assert.ok(
    textOf(one.blocks[1]).startsWith("Movers in Austin · 30d: 1 business, 1 wrote back · Waiting for your approval"),
    textOf(one.blocks[1]),
  );
  // Totals that could not be read are said so, and logged; never "nothing sent".
  clearContextCache();
  readerCache.clear();
  const { result: unread, lines } = await logs(() =>
    ledger({ ...RPCS, reach_out_report: () => ({ chains: [] }), reach_out_chain_totals: () => [] }),
  );
  assert.ok(
    textOf(unread.blocks[1]).startsWith("Movers in Austin · 30d: not read · Waiting for your approval"),
    textOf(unread.blocks[1]),
  );
  assert.equal(lines.filter((l) => l.includes('"reach_out_last_days_read_failed"')).length, 0, "a report that answers");
  clearContextCache();
  readerCache.clear();
  const timeout = () => {
    throw new Error("canceling statement due to statement timeout");
  };
  const { result: failed, lines: failedLines } = await logs(() =>
    ledger({ ...RPCS, reach_out_report: timeout, reach_out_chain_totals: timeout }),
  );
  assert.ok(
    textOf(failed.blocks[1]).startsWith("Movers in Austin · 30d: not read · Waiting for your approval"),
    textOf(failed.blocks[1]),
  );
  assert.equal(
    failedLines.filter((l) => l.includes('"reach_out_last_days_read_failed"')).length,
    1,
    failedLines.join("\n"),
  );
});

test("Reports: the period the page shows, its tiles and lines, as the report tool says them, and no row", async () => {
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
  // A page on Month shows however many days the month has run: described over those, not over thirty.
  clearContextCache();
  const month = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, report_series: series })),
    page("reports", [], { view: "5" }),
  );
  assert.match(textOf(month.blocks[0]), /^Reports, 5 days · /);
  // Month on the 1st: one day, said as one.
  clearContextCache();
  const first = await buildContext(
    rcIn(ctxFor(tables(), { ...RPCS, report_series: series })),
    page("reports", [], { view: "1" }),
  );
  assert.match(textOf(first.blocks[0]), /^Reports, 1 day · /);
});

test("Reports over days a member picked: Ask reads the days on screen, named by their dates, and the booking line that is not counted for them says so; days that are no window read as thirty days", async () => {
  const asked = [];
  // The report as 00359 answers it: the workspace's today, and the window's last day where one was named.
  const series = (a) => {
    asked.push(a);
    return {
      timezone: TZ,
      days: a.p_days,
      span_days: a.p_days * 2,
      today: "2026-09-14",
      ...(a.p_end ? { end: a.p_end } : {}),
      series: [],
      reasons: {},
      reply_seconds: [],
      sentiments: {},
      voicemail: 0,
    };
  };
  const said = async (view) => {
    clearContextCache();
    asked.length = 0;
    const rc = rcIn(ctxFor(tables(), { ...RPCS, report_series: series }));
    return textOf((await buildContext(rc, page("reports", [], { view }))).blocks[0]);
  };
  // What the page says it shows is the days' one name (bridge/ask/context.ts): a week that ended a week ago.
  const week = await said("2026-09-01~2026-09-07");
  assert.deepEqual(
    asked,
    [{ p_tenant_id: A, p_days: 7, p_end: "2026-09-07" }],
    "REGRESSION: Ask read the seven days to today under a page showing the first week of the month",
  );
  assert.match(week, /^Reports, Sep 1 – Sep 7 · /, "named by their dates, never as the last 7 days");
  assert.ok(week.includes("Booked: Not counted for these days"), week);
  // Days that end today name no day to the database, and are said as the period they are.
  assert.match(await said("2026-09-08~2026-09-14"), /^Reports, 7 days · /);
  assert.deepEqual(asked, [{ p_tenant_id: A, p_days: 7 }]);
  // Days to come, or more than a report reads: no window, so thirty days, as a view that says nothing is.
  for (const view of ["2030-01-01~2030-01-05", "2026-01-01~2026-09-01", "2026-09-07~2026-09-01"]) {
    assert.match(await said(view), /^Reports, 30 days · /, view);
    assert.deepEqual(asked, [{ p_tenant_id: A, p_days: 30 }], view);
  }
});

test("Reports: the reply time's line names the hold it includes where replies waited one, and says what it said before where none did", async () => {
  const replies = Array.from({ length: 14 }, () => ({ day: "2026-09-14", s: 63, hold: 60 }));
  const report = (rs) => (a) => ({
    timezone: TZ,
    days: a.p_days,
    span_days: a.p_days * 2,
    today: "2026-09-14",
    series: [],
    reasons: {},
    reply_seconds: rs.map((r) => r.s),
    sentiments: {},
    voicemail: 0,
    replies: rs,
  });
  const said = async (rs) => {
    // A page's context is kept for a minute: each payload is its own build.
    clearContextCache();
    const rc = rcIn(ctxFor(tables(), { ...RPCS, report_series: report(rs) }));
    return textOf((await buildContext(rc, page("reports", [], { view: "7" }))).blocks[0]);
  };
  assert.ok(
    (await said(replies)).includes(
      "Median reply time: 1m 3s (slowest tenth 1m 3s · 14 replies · includes your 1-minute hold)",
    ),
  );
  const unheld = await said(replies.map(({ day, s: secs }) => ({ day, s: secs })));
  assert.ok(
    unheld.includes("Median reply time: 1m 3s (slowest tenth 1m 3s · 14 replies)"),
    "the old line, no hold said",
  );
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
      asked_at: 999,
      focus: { kind: "thread", id: C1, label: "Rosa" },
    }),
  );
  assert.deepEqual(ctx.supabase.seen, [], "nothing read: the focus and asked_at changed, the key did not");
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
