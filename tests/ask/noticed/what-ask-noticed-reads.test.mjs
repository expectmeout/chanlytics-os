/**
 * What Ask noticed (GET ask/notice, server/ask/notice/notices.ts listNotices): the same notices, in the same words and the
 * same order, read with only what each notice needs (16 Nov 2026). It read the whole workspace first, as Ask's model is
 * told it (signals.ts seeAll: everyone in People with their appointments, every list with its members, the playbooks with
 * their pools, the cold emails with their reports), on every open of the AI and every business's morning: 52 reads on
 * production's demo workspace, and People's whole book, which grows with the business. Here a workspace in which every
 * notice stands, and the reads the route makes, pinned: none of them pages People, so a business of thousands asks what
 * one of twenty does. People are made up: 555-01xx numbers, example.com addresses.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ASK_NOTICES_SENT, pickCurrentDeal } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const route = await import(at("apps/dashboard/app/api/v1/ask/notice/route.ts"));
const { listNotices } = await import(at("apps/dashboard/src/server/ask/notice/notices.ts"));
const { newToolContext, runTool } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { readerCache, readerContext } = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));

beforeEach(() => readerCache.clear());

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "u1";
const TZ = "America/New_York";
/** A Monday at ten in New York. */
const NOW = new Date("2026-09-14T14:00:00.000Z");
const DAY = 86_400_000;
const ago = (days) => new Date(NOW.getTime() - days * DAY).toISOString();

/** A person's id, by their number in the world: 0001 to 9999. */
const pid = (n) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;
const uid = (kind, n) =>
  `${kind}${kind}${kind}${kind}${kind}${kind}${kind}${kind}-${kind}${kind}${kind}${kind}-4${kind}${kind}${kind}-8${kind}${kind}${kind}-${String(n).padStart(12, "0")}`;

/**
 * Someone in People, as `contacts` holds them, with the channels they reach the business on (`contact_identities`, nested
 * as the fake reads an embed) and when they were first and last in touch (people_list's own columns, kept beside the row
 * for the stand-in below, never read off contacts).
 */
const person = (n, over = {}) => ({
  id: pid(n),
  tenant_id: A,
  display_name: `Person ${n}`,
  wa_profile_name: null,
  phone_e164: `+1555555${String(100 + (n % 100)).padStart(4, "0")}`,
  email: `person${n}@example.com`,
  consent: "opted_in",
  dnc: false,
  marketing_consent: "unknown",
  marketing_channels: null,
  offers_asked_at: ago(40),
  erased_at: null,
  erasing_since: null,
  merged_into_contact_id: null,
  created_at: ago(90),
  contact_identities: [{ channel: "whatsapp" }],
  ...over,
});

/** A deal on a person: `stage` and when it was made. */
const deal = (n, contact, stage, daysAgo) => ({
  id: uid("d", n),
  tenant_id: A,
  contact_id: pid(contact),
  stage,
  service: "Balayage",
  created_at: ago(daysAgo),
});
/** A step of a sequence on a moment (a playbook): `over` says its trigger, its list and its state. */
const moment = (n, over = {}) => ({
  id: uid("b", n + 10),
  tenant_id: A,
  sequence_id: uid("b", n + 10),
  kind: "moment",
  name: `Moment ${n}`,
  trigger: "quiet_30",
  list_id: null,
  list_key: null,
  template_id: null,
  template_name: null,
  template_language: null,
  params: [],
  policy_class: "marketing",
  state: "running",
  run_hour: 10,
  cap_per_run: 50,
  gap_days: null,
  cadence_days: null,
  last_run_for: null,
  last_run_at: null,
  created_at: ago(30 - n),
  channels: ["whatsapp"],
  until: null,
  words_ok_at: null,
  place: 0,
  ...over,
});
/** A note with a day on a person: their next step, while it is not done. */
const step = (n, contact, done = false) => ({
  id: uid("e", n),
  tenant_id: A,
  contact_id: pid(contact),
  body: "Call back",
  due_on: "2026-09-20",
  done_at: done ? ago(1) : null,
  created_at: ago(3),
});

/**
 * people_list as the database answers it (00112, 0021), for what the notices read off a row: the people people_page
 * lists (live, not merged, not being erased for under a day), each with the channels of their identities, the deal the
 * pages show (contracts pickCurrentDeal, which people_list's lateral orders the same way) and their next step (the
 * earliest open note with a day), a page of a thousand at a time after the cursor.
 */
const CONTACTS_ONLY = new Set([
  "contact_identities",
  "tenant_id",
  "erased_at",
  "erasing_since",
  "merged_into_contact_id",
  "created_at",
]);
function peopleList(tables) {
  return (args) => {
    const listed = (tables.contacts ?? []).filter(
      (c) =>
        c.tenant_id === args.p_tenant_id &&
        !c.erased_at &&
        !c.merged_into_contact_id &&
        (!c.erasing_since || Date.parse(c.erasing_since) < Date.now() - DAY),
    );
    const rows = listed.map((c, i) => {
      const current = pickCurrentDeal((tables.deals ?? []).filter((d) => d.contact_id === c.id));
      const next = (tables.person_notes ?? [])
        .filter((n) => n.contact_id === c.id && n.due_on && !n.done_at)
        .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.created_at.localeCompare(b.created_at))
        .at(0);
      // The row people_list answers: the person's own columns, less what contacts keeps that the list does not say.
      const row = Object.fromEntries(Object.entries(c).filter(([k]) => !CONTACTS_ONLY.has(k)));
      return {
        ...row,
        channels: [...new Set((c.contact_identities ?? []).map((x) => x.channel))].sort(),
        conversation_count: 0,
        first_contact_at: c.created_at,
        deal_id: current?.id ?? null,
        deal_stage: current?.stage ?? null,
        step_id: next?.id ?? null,
        in_touch_at: new Date(Date.parse(c.created_at) + i).toISOString(),
        added_at: c.created_at,
      };
    });
    rows.sort((a, b) => b.in_touch_at.localeCompare(a.in_touch_at) || b.id.localeCompare(a.id));
    const after = args.p_after_at
      ? rows.findIndex((r) => r.in_touch_at === args.p_after_at && r.id === args.p_after_id) + 1
      : (args.p_offset ?? 0);
    return rows.slice(after, after + 1000);
  };
}

const ICS = (busy) =>
  [
    "BEGIN:VCALENDAR",
    ...busy.flatMap(([from, to], i) => [
      "BEGIN:VEVENT",
      `UID:busy-${i}`,
      "SUMMARY:Taken",
      `DTSTART;TZID=${TZ}:${from}`,
      `DTEND;TZID=${TZ}:${to}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
/** Open on Tuesdays alone, ten to eleven: two half hours a week, one of them taken next Tuesday. */
const FEED = ICS([["20260915T100000", "20260915T103000"]]);
/** For the route, which reads on the real clock: open an hour every day (room, whatever the day), or never (none). */
const DAILY = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "10:00", close: "11:00" }]),
);
const CLOSED = { mon: {}, tue: {}, wed: {}, thu: {}, fri: {}, sat: {}, sun: {} };
const withHours = (tables, hours) => {
  const [row] = tables.tenant_config;
  const brain = { ...row.config.brain, profile: { ...row.config.brain.profile, hours } };
  return { ...tables, tenant_config: [{ ...row, config: { ...row.config, brain } }] };
};
const HOURS = { mon: {}, tue: { open: "10:00", close: "11:00" }, wed: {}, thu: {}, fri: {}, sat: {}, sun: {} };

/** The workspace's WhatsApp number: not a US one, so an offer is not held by Meta's pause on US marketing messages. */
const WHATSAPP = {
  id: "ch-wa",
  tenant_id: A,
  kind: "whatsapp",
  number_e164: "+442079460958",
  status: "active",
  created_at: "2026-08-01T00:00:00Z",
  config: { quality_rating: "GREEN", messaging_limit: "TIER_1K" },
};

const S_FOUND = uid("5", 1);
const S_WRITTEN = uid("5", 2);
const S_ASKS = uid("5", 3);
const searchRow = (id, name, qualified, state = "done") => ({
  id,
  tenant_id: A,
  name,
  purpose: "find",
  state,
  round_id: `${id.slice(0, 30)}r`,
  round_state: state,
  qualified,
  created_at: ago(5),
});

/**
 * Harbor, in which every notice stands but the gap (a workspace that can send offers has none): twenty-four people, a
 * paused sequence with replies and a batch waiting, two lists nothing runs on, three searches (one written to, one asking),
 * proposals out with no next step, four cancellations nothing offers, room for two and three who can hear an offer, the
 * last offer Ask sent, and two review replies written.
 */
function harbor(over = {}) {
  const people = [
    // Twenty who were asked about offers, and four never asked on WhatsApp.
    ...Array.from({ length: 20 }, (_, i) => person(i + 1)),
    ...[21, 22, 23, 24].map((n) => person(n, { offers_asked_at: null, created_at: ago(10) })),
    // Three who said yes to offers, with a number: whom an offer goes to.
    ...[25, 26, 27].map((n) =>
      person(n, { marketing_consent: "opted_in", marketing_channels: ["whatsapp"], offers_asked_at: ago(10) }),
    ),
    // Never asked, but not on WhatsApp, on the do-not-contact list, or gone: none of them counts.
    person(30, { offers_asked_at: null, contact_identities: [{ channel: "sms" }] }),
    person(31, { offers_asked_at: null, dnc: true }),
    person(32, { offers_asked_at: null, erased_at: ago(2) }),
    // Being erased since a moment ago (people_page reads it by the database's clock, so by the real one here).
    person(33, { offers_asked_at: null, erasing_since: new Date(Date.now() - DAY / 2).toISOString() }),
    person(34, { offers_asked_at: null, merged_into_contact_id: pid(1) }),
  ];
  const tables = {
    memberships: [
      {
        user_id: USER,
        tenant_id: A,
        role: "owner",
        tenants: { slug: "harbor" },
        created_at: "2026-01-01T00:00:00Z",
        views: {},
      },
    ],
    tenants: [{ id: A, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
    tenant_config: [
      {
        tenant_id: A,
        version: 1,
        config: {
          calendar: { ical_url: "https://cal.example/harbor.ics" },
          brain: {
            business_name: "Harbor",
            booking_link: "https://book.example/harbor",
            system_prompt: "Answer as the front desk of Harbor: brief and warm.",
            fallbacks: { greeting: "g", error: "e", non_text: "n" },
            profile: {
              hours: HOURS,
              closures: [],
              services: [{ name: "Balayage", duration_min: 30 }],
              booking_rules: { lead_hours: 2, max_days_ahead: 7, slot_min: 30 },
            },
          },
        },
      },
    ],
    tenant_channels: [WHATSAPP],
    policies: [],
    contacts: people,
    deals: [
      // Out with no next step: two. Out with one: one. A client since, over an older proposal: not out.
      deal(1, 1, "proposed", 9),
      deal(2, 2, "proposed", 8),
      deal(3, 3, "proposed", 7),
      deal(4, 4, "proposed", 9),
      deal(5, 4, "won", 2),
      // A proposal whose step is done is out with no next step; one to someone erased is nobody's.
      deal(6, 5, "proposed", 6),
      deal(7, 32, "proposed", 6),
      // A pass is history.
      deal(8, 6, "lost", 6),
    ],
    person_notes: [step(1, 3), step(2, 5, true)],
    segments: [
      { id: uid("f", 1), tenant_id: A, name: "Regulars", rule: null, archived_at: null, created_at: ago(30) },
      { id: uid("f", 2), tenant_id: A, name: "Spring brides", rule: null, archived_at: null, created_at: ago(29) },
      { id: uid("f", 3), tenant_id: A, name: "Old list", rule: null, archived_at: ago(3), created_at: ago(28) },
      { id: uid("f", 4), tenant_id: A, name: "Win-back", rule: null, archived_at: null, created_at: ago(27) },
    ],
    segment_members: [
      { tenant_id: A, segment_id: uid("f", 1), contact_id: pid(1) },
      { tenant_id: A, segment_id: uid("f", 4), contact_id: pid(2) },
    ],
    sequences: [],
    sequence_steps: [
      // A moment on the Win-back list, and one on a freed time that is paused: neither runs on Regulars or Spring brides,
      // and nothing offers a time that opens.
      moment(1, { list_id: uid("f", 4), trigger: "saved_list" }),
      moment(2, { trigger: "slot_opened", state: "paused" }),
      // A cold email on the bakeries' search: its leads are written to.
      { ...moment(3, { trigger: "lead_first", lead_search_id: S_WRITTEN }), kind: "reach_out", name: "Bakeries" },
    ],
    lead_searches_view: [
      searchRow(S_FOUND, "Florists in Queens", 7),
      searchRow(S_WRITTEN, "Bakeries in Brooklyn", 4),
      searchRow(S_ASKS, "Salons in Harlem", 0, "waiting_on_owner"),
    ],
    events: [1, 2, 3, 4].map((n) => ({
      id: uid("9", n),
      tenant_id: A,
      kind: "appointment.changed",
      subject_type: "appointment",
      subject_id: uid("7", n),
      data: { change: "cancelled", by: "service" },
      created_at: ago(n),
    })),
    appointments: [1, 2, 3, 4].map((n) => ({
      id: uid("7", n),
      tenant_id: A,
      contact_id: pid(n),
      source: "calendar_feed",
      status: "cancelled",
      starts_at: ago(n - 3),
      ends_at: ago(n - 3),
      all_day: false,
      timezone: TZ,
    })),
    ask_actions: [
      {
        id: uid("6", 1),
        tenant_id: A,
        user_id: USER,
        kind: "broadcast",
        state: "done",
        at: ago(3),
        finished_at: ago(3),
      },
    ],
    // The offer Ask sent three days ago, after the press: two sent, one replied.
    sequence_batches: [
      {
        id: uid("3", 1),
        tenant_id: A,
        name: "Tuesday offer",
        template_id: null,
        template_name: "offer",
        template_language: "en",
        params: [{ kind: "text", value: "20% off Tuesdays" }],
        audience: { kind: "list", list: "seg:offers_ok" },
        state: "done",
        step_id: null,
        sequence_id: null,
        run_for: null,
        recipient_count: 2,
        created_at: ago(2),
        started_at: ago(2),
        finished_at: ago(2),
      },
    ],
    broadcast_recipients: [25, 26].map((n) => ({
      id: uid("2", n),
      tenant_id: A,
      broadcast_id: uid("3", 1),
      contact_id: pid(n),
      state: "sent",
      channel: "whatsapp",
      sent_at: ago(2),
      message_id: null,
    })),
    google_reviews: [
      { id: uid("4", 1), tenant_id: A, draft_text: "Thank you!", reply_text: null },
      { id: uid("4", 2), tenant_id: A, draft_text: "So glad you came.", reply_text: null },
      { id: uid("4", 3), tenant_id: A, draft_text: "Thanks", reply_text: "Thanks" },
    ],
    ...over,
  };
  return joined(tables);
}

/**
 * The world's rows joined as PostgREST embeds them, which the fake reads as the fixture nests them: each deal with its
 * person (a deal's read keeps those People lists).
 */
function joined(tables) {
  const byId = new Map(tables.contacts.map((c) => [c.id, c]));
  const personOf = (id) => {
    const c = byId.get(id);
    return c
      ? {
          id: c.id,
          erased_at: c.erased_at,
          merged_into_contact_id: c.merged_into_contact_id,
          erasing_since: c.erasing_since,
        }
      : null;
  };
  return { ...tables, deals: tables.deals.map((d) => ({ ...d, contacts: personOf(d.contact_id) })) };
}

/** The sequences as sequence_overview answers them: one paused, with two replies and one batch waiting for an OK. */
const overview = () => [
  {
    id: uid("b", 1),
    name: "Welcome",
    state: "paused",
    starts: "moment",
    mode: "ask",
    created_at: ago(20),
    next: null,
    first: null,
    needs: {
      replies: 2,
      waiting: 1,
      waiting_people: 3,
      batches: [
        { id: uid("a", 1), step_id: uid("b", 1), run_for: "2026-09-15", audience: { kind: "reach_out" }, people: 3 },
      ],
    },
  },
];

const rpcsOf = (tables) => ({
  people_list: peopleList(tables),
  people_reply_modes: () => [],
  sequence_overview: overview,
  lead_list_counts: () => ({ all: 0, ready: 0, nurture: 0, converted: 0, said_no: 0, not_a_fit: 0 }),
  lead_cards_live: () => ["local_businesses"],
  reach_out_people_counts: () => ({}),
});

const ctxOf = (tables) => ({
  supabase: fakeDb(tables, {}, rpcsOf(tables)),
  userId: USER,
  email: "ada@example.com",
  params: {},
});

/** The network: the calendar's feed (`feed`, a slot open by default), and nothing else. */
async function withFeed(fn, feed = FEED) {
  const was = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!String(url).startsWith("https://cal.example/")) throw new Error(`no network here: ${url}`);
    return new Response(feed, { status: 200, headers: { "content-type": "text/calendar" } });
  };
  forgetFeeds();
  try {
    return await fn();
  } finally {
    globalThis.fetch = was;
    forgetFeeds();
  }
}

/** Every notice, in the order the route says them, in `language`, at `now`. */
async function noticed(tables, language = "en", now = NOW) {
  const ctx = ctxOf(tables);
  const rc = readerContext(ctx, { tenantId: A, role: "owner" }, now);
  const t = { ...newToolContext(ctx, A, "owner", TZ, now, rc), language };
  return withFeed(() => listNotices(t, language, {}));
}

test("every notice a workspace holds, in its words and its order, with its numbers and where each opens; in Spanish too; and the gap where no channel can carry an offer", async () => {
  assert.deepEqual(await noticed(harbor()), [
    {
      key: "search_asks",
      says: "A search waits for your answer.",
      figures: [],
      ask: "What is my search asking me?",
      fill: null,
      to: null,
    },
    {
      key: "freed_times_unoffered",
      says: "A time opened, and nobody has been offered it.",
      figures: [],
      ask: "Offer the time that opened to the people who asked about times.",
      fill: null,
      to: null,
    },
    {
      key: "replies_waiting",
      says: "2 replies wait from your cold email.",
      figures: [],
      ask: "Draft answers to the replies to my cold email.",
      fill: null,
      to: null,
    },
    {
      key: "batches_waiting",
      says: "1 send waits for your approval.",
      figures: [],
      ask: "Show me what is waiting for my approval before it sends.",
      fill: null,
      to: null,
    },
    {
      key: "reviews_written",
      says: "2 review replies are written and waiting for your word.",
      figures: [],
      ask: null,
      fill: null,
      to: "reports/reviews",
    },
    {
      key: "room_and_yes",
      says: "1 open slot, and 3 said yes to offers.",
      figures: [
        {
          value: "1",
          label: "open slots",
          to: "calendar",
        },
        {
          value: "3",
          label: "said yes",
          to: "clients/seg:offers_ok",
        },
      ],
      ask: "Offer “20% off Tuesdays” to everyone who said yes, paced to the room.",
      fill: "Offer ",
      to: null,
    },
    {
      key: "offer_result",
      says: "Tuesday offer: 2 sent, 0 replied.",
      figures: [],
      ask: "How did “Tuesday offer” go, and what should I do next?",
      fill: null,
      to: null,
    },
    {
      key: "leads_not_written_to",
      says: "Your search found 7 leads. Nobody has been written to.",
      figures: [],
      ask: "Write a first email to the best of the leads I found.",
      fill: null,
      to: null,
    },
    {
      key: "nothing_sends_on_its_own",
      says: "29 people, and nothing sends on its own.",
      figures: [],
      ask: "Set up what should go out on its own: a welcome and a monthly offer.",
      fill: null,
      to: null,
    },
    {
      key: "deals_without_a_step",
      says: "3 proposals are out with no next step.",
      figures: [],
      ask: "Add a next step to my open proposals.",
      fill: null,
      to: null,
    },
    {
      key: "lists_feed_nothing",
      says: "2 lists feed nothing: Regulars and Spring brides.",
      figures: [],
      ask: "Start a campaign on the best of my lists.",
      fill: null,
      to: null,
    },
    {
      key: "offers_never_asked",
      says: "4 people were never asked about offers.",
      figures: [],
      ask: "How do I get more people to say yes to offers?",
      fill: null,
      to: null,
    },
  ]);
  assert.deepEqual(
    (await noticed(harbor(), "es")).map((n) => [n.key, n.says]),
    [
      ["search_asks", "Una búsqueda espera tu respuesta."],
      ["freed_times_unoffered", "Se liberó un hueco y nadie lo ha ofrecido."],
      ["replies_waiting", "2 respuestas esperan en tus secuencias."],
      ["batches_waiting", "1 envío espera tu visto bueno."],
      ["reviews_written", "2 respuestas a reseñas están escritas y esperan tu palabra."],
      ["room_and_yes", "1 hueco libre, y 3 dijeron que sí a las ofertas."],
      ["offer_result", "Tuesday offer: 2 enviados, 0 respondieron."],
      ["leads_not_written_to", "Tus búsquedas encontraron 7 leads. Nadie les ha escrito."],
      ["nothing_sends_on_its_own", "29 personas, y nada sale por su cuenta."],
      ["deals_without_a_step", "3 propuestas están fuera sin siguiente paso."],
      ["lists_feed_nothing", "2 listas no alimentan nada: Regulars y Spring brides."],
      ["offers_never_asked", "A 4 personas nunca se les preguntó por ofertas."],
    ],
  );
  // No channel set up: the gap stands, and the room is not said, since nobody can be sent an offer.
  assert.deepEqual(
    (await noticed(harbor({ tenant_channels: [] }))).map((n) => [n.key, n.says]),
    [
      ["search_asks", "A search waits for your answer."],
      ["freed_times_unoffered", "A time opened, and nobody has been offered it."],
      ["replies_waiting", "2 replies wait from your cold email."],
      ["batches_waiting", "1 send waits for your approval."],
      ["reviews_written", "2 review replies are written and waiting for your word."],
      ["offer_result", "Tuesday offer: 2 sent, 0 replied."],
      ["leads_not_written_to", "Your search found 7 leads. Nobody has been written to."],
      ["nothing_sends_on_its_own", "29 people, and nothing sends on its own."],
      ["deals_without_a_step", "3 proposals are out with no next step."],
      ["channel_gap", "Email is not set up, so offers cannot go that way yet."],
      ["lists_feed_nothing", "2 lists feed nothing: Regulars and Spring brides."],
      ["offers_never_asked", "4 people were never asked about offers."],
    ],
  );
});

test("Ask's own read of what stands out (the signals tool) says what it said, with its fuller sentences for the model", async () => {
  const tables = harbor();
  const ctx = ctxOf(tables);
  const rc = readerContext(ctx, { tenantId: A, role: "owner" }, NOW);
  const tc = newToolContext(ctx, A, "owner", TZ, NOW, rc);
  const out = await withFeed(() => runTool(tc, { name: "signals", input: {} }));
  assert.equal(out.isError, false, out.result);
  assert.deepEqual(JSON.parse(out.result).signals, [
    {
      key: "nothing_sends_on_its_own",
      says: "29 people are in People (4 new in the last 30 days) and nothing sends on its own.",
      next: "propose_plan with action steps: lists that group them (propose_list make), then a campaign for the strongest group (propose_sequence make); or propose_plan with action offer, intent cover_journey",
    },
    {
      key: "leads_not_written_to",
      says: "7 leads were found in 1 search no cold email writes to (Florists in Queens: 7).",
      next: "leads with action leads (list ready) to pick the best, propose_leads with action list, then propose_sequence with action cold_email on it, in one propose_plan with action steps",
    },
    {
      key: "search_asks",
      says: "1 search waits for an answer: Salons in Harlem.",
      next: "leads with action search for its question, then propose_lead_search with action find and amends",
    },
    {
      key: "replies_waiting",
      says: "2 replies wait in the campaigns.",
      next: "inbox with action list, then propose_reply for each; for a business that wrote back interested, propose_leads with action said and propose_deal",
    },
    {
      key: "batches_waiting",
      says: "1 send waits for an OK before it sends.",
      next: "sequences with action sent, then propose_sequence with action batch (approve or skip)",
    },
    {
      key: "lists_feed_nothing",
      says: "2 lists feed no campaign: Regulars, Spring brides.",
      next: "propose_sequence with action moment on the list (trigger saved_list), after sequences with action lists counts who it reaches",
    },
    {
      key: "deals_without_a_step",
      says: "3 proposals are out with no next step.",
      next: "people with action pipeline, then propose_deal with a next step for each",
    },
    {
      key: "freed_times_unoffered",
      says: "4 appointments were cancelled in the last 30 days and the time was offered to nobody.",
      next: "propose_sequence with action moment on slot_opened (Fill a cancellation): each time a cancellation frees goes to the people who asked and never booked",
    },
    {
      key: "offers_never_asked",
      says: "4 people on WhatsApp have never been asked for the yes to offers (3 said yes so far).",
      next: "never a message whose purpose is the ask: AI asks once at the natural end of a conversation they started; offer the sign-up link and its QR for the counter, and campaigns after a booking to people with a messages yes (propose_sequence with action moment)",
    },
  ]);
});

/** Everyone in Harbor and `more` people besides, none of them standing out: a business of that many more. */
const grown = (more) =>
  harbor({ contacts: [...harbor().contacts, ...Array.from({ length: more }, (_, i) => person(1000 + i))] });

/** The route's reads of `tables`, as the database was asked them: a door by name, a table by what was done to it. */
async function readsOf(tables) {
  const ctx = ctxOf(tables);
  const res = await withFeed(() =>
    route.GET.run(new Request(`http://localhost/api/v1/ask/notice?workspace=${A}`), ctx),
  );
  return { res, asked: ctx.supabase.seen.map((q) => (q.rpc ? `rpc:${q.rpc}` : `${q.table}.${q.op}`)) };
}

/** What only everyone in People with their appointments answers: their rows, a page at a time, and a season of the calendar. */
const WHOLE = ["rpc:people_list", "rpc:people_reply_modes", "segment_members.select"];

test("the route reads only what its notices need, each once: never People's book, a list's members or a season of appointments", async () => {
  const tables = withHours(harbor(), CLOSED);
  const { res, asked } = await readsOf(tables);
  assert.deepEqual(
    res.notices,
    (await noticed(tables, "en", new Date())).slice(0, ASK_NOTICES_SENT),
    "the first five, as listed: three past the two the home may pass over",
  );
  for (const whole of WHOLE) assert.ok(!asked.includes(whole), `${whole}: read where a count says it`);
  assert.deepEqual(
    [...asked].sort(),
    [
      // Who is asking, and their rests (the route's own).
      "memberships.select",
      "memberships.select",
      // The workspace's clock and settings, once for every part that reads them.
      "tenants.select",
      "tenant_config.select",
      // People, counted: everyone People lists, who was never asked on WhatsApp, the deals open and, of whose shown deal
      // is a proposal out, who has a next step.
      "contacts.select",
      "contacts.select",
      "deals.select",
      "person_notes.select",
      // The lists by name, the moments' steps and their sequences' modes, the cold emails' steps, the searches.
      "segments.select",
      "sequence_steps.select",
      "sequences.select",
      "sequence_steps.select",
      "lead_searches_view.select",
      // The sequences, once, as sequence_overview answers them.
      "rpc:sequence_overview",
      // The cancellations, and the room: the calendar's taken time over the days on offer.
      "events.select",
      "appointments.select",
      // What Ask did, the channels an offer can go by, the review replies written.
      "ask_actions.select",
      "tenant_channels.select",
      "lines.select",
      "google_reviews.select",
    ].sort(),
    "each read, once",
  );
});

test("with a slot open, who said yes to offers is everyone in People counted, read once: what the room's notice turns on", async () => {
  const full = (await readsOf(withHours(harbor(), CLOSED))).asked;
  const tables = withHours(harbor(), DAILY);
  const { res, asked } = await readsOf(tables);
  assert.deepEqual(
    res.notices,
    (await noticed(tables, "en", new Date())).slice(0, ASK_NOTICES_SENT),
    "the first five, as listed: three past the two the home may pass over",
  );
  const added = [...asked];
  for (const a of full) added.splice(added.indexOf(a), 1);
  assert.deepEqual(
    added.sort(),
    // Everyone in People with their reply modes, whether a deal was ever recorded, and the calendar's season their
    // appointments are read from (readers/audience-pool.ts): the pool a send counts, once.
    ["rpc:people_list", "policies.select", "deals.select", "appointments.select", "appointments.select"].sort(),
    "the audience pool's reads, and nothing else",
  );
});

test("a business of thousands asks what one of thirty does: with no slot open, no read pages People, so none grows with it", async () => {
  const small = await readsOf(withHours(harbor(), CLOSED));
  const big = await readsOf(withHours(grown(2500), CLOSED));
  assert.deepEqual([...big.asked].sort(), [...small.asked].sort(), "the same reads, as many");
  assert.deepEqual(
    big.res.notices.map((n) => [n.key, n.says]),
    small.res.notices.map((n) => [n.key, n.says]),
  );
});
