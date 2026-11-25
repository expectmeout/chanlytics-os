/**
 * The world the tests of people/ share. Split by behaviour from calendar-people.test.mjs on 25 Nov 2026 (layer 14: a test file
 * over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
/**
 * The people in the calendar: who an appointment is for, read from the
 * words a booking tool wrote into the owner's calendar.
 *
 * The feed now carries the description, the place and the guests; a phone
 * found anywhere in the event beats a name; a name only counts whole and
 * four letters or more. The same match feeds the board's panel, the
 * person's profile and both receptionists — one person everywhere.
 */
import { parseIcs, stateOf, ROLE_PERMS } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { fakeDb } from "../../_fake-db.mjs";
import { fieldsOf, logLineOf } from "../../_log-lines.mjs";
import { installStubReact, installRoleStore, fresh, again } from "../../_stub-react.mjs";

// The profile's route runs below over a database in memory; a module that ever builds a service client reads these,
// and nothing dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const personRoute = await importSrc("apps/dashboard/app/api/v1/contacts/[id]/route.ts");

export const reportsRoute = await importSrc("apps/dashboard/app/api/v1/reports/route.ts");

// The reports route counts against its bucket: this instance's memory, never a store dialled.
export const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");

setRateStore(memoryStore());

/**
 * People's page, drawn rather than read: the real TSX (apps/dashboard/src/surfaces/people/) on the shared stub React
 * (_stub-react.mjs), over the sample business's people (sample.ts) through the surface's own mapping (surface-map.ts).
 * The page was one legacy file (people.jsx, with people-table.jsx beside it) that these pins scanned; it is a folder of
 * TSX now, and what it shows is asked of what it draws. Installed on first use, so the tests that do not draw it keep the
 * bare node they had: the role store (who is acting), the toast and the shell's move (CHANLY.nav, recorded in `went`).
 */
/** The shell's moves (`CHANLY.nav`) both worlds below record: one window, so the last to install its `nav` is the one called. */
export const moved = [];

export let harness = null;

export async function peopleHarness() {
  if (harness) return harness;
  installStubReact();
  installRoleStore(globalThis.window);
  const went = moved;
  Object.assign(globalThis.window, {
    mayAtLeast: (rung) => globalThis.window.ST_STORE.mayAtLeast(rung),
    canDo: (action) => !!ROLE_PERMS[globalThis.window.__ME.role]?.[action],
    gate: () => ({}),
    usePPToast: () => [null, () => {}],
    CHANLY: { nav: (route) => went.push(route) },
  });
  const src = (p) => importSrc(`apps/dashboard/src/surfaces/${p}`);
  const { setSurfaceValue } = await src("surface-values.ts");
  const { peopleSample } = await src("people/sample.ts");
  const { PeopleReal } = await src("people/page/people-real.tsx");
  const drawn = (props = {}, { role = "owner" } = {}) => {
    globalThis.window.__ME = { role };
    setSurfaceValue("people", peopleSample(new Date(NOW)));
    fresh();
    const draw = (over = {}) => again(() => PeopleReal({ onNavigate() {}, onOpenProfile() {}, ...props, ...over }));
    return { draw, tree: draw() };
  };
  const { PeopleRoute } = await src("people/people-route.tsx");
  // The frame's route for an address of People's: the page it draws for the params the address names.
  const routed = (pathname) => {
    globalThis.window.__ME = { role: "owner" };
    setSurfaceValue("people", peopleSample(new Date(NOW)));
    fresh();
    return again(() => globalThis.React.createElement(PeopleRoute, { pathname }));
  };
  /**
   * What `run` sends, recorded as { method, route, body } (the route as the client names it, `views/people`), each answered as
   * the server does: a batch done for every id it was sent, anything else `{}`. The wire is the tab's fetch, put back after.
   */
  const onTheWire = async (run) => {
    const sent = [];
    const fetched = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      sent.push({
        method: init.method || "GET",
        route: new URL(url, "https://app.chanlytics.com").pathname.replace(/^\/api\/v1\//, ""),
        body,
      });
      const data = Array.isArray(body?.ids) ? { done: body.ids.length, failed: [], skipped: [] } : {};
      return new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      await run();
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      globalThis.fetch = fetched;
    }
    return sent;
  };
  harness = { went, drawn, routed, onTheWire, setSurfaceValue, sample: () => peopleSample(new Date(NOW)) };
  return harness;
}

/**
 * The business's own addresses, for the cases below that are not about them:
 * matching by number, address and name is the same with an empty set. The
 * cases that ARE about them are at the end of this file.
 */
export const NO_OWN = new Set();

export const TZ = "America/New_York";

export const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:b1",
  "SUMMARY:Maria Lopez - Balayage",
  "DESCRIPTION:Booked via Booksy\\nPhone: (305) 555-0134\\nEmail: maria.lopez",
  " @gmail.com\\nNotes: first time\\, wants ash tones",
  "LOCATION:Marisa's Beauty Salon\\, 123 Main St",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T170000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b2",
  "SUMMARY:Haircut",
  'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="Ruiz, Ana: VIP";X-NUM-GUESTS=0:mailto:ana@example.com',
  "ATTENDEE;CN=Marisa Owner:mailto:owner@salon.com",
  "DTSTART;TZID=America/New_York:20260910T100000",
  "DTEND;TZID=America/New_York:20260910T110000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b3",
  "SUMMARY:Daniela Ruiz · Colour",
  "DTSTART;TZID=America/New_York:20260820T100000",
  "DTEND;TZID=America/New_York:20260820T120000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b4",
  "SUMMARY:Lunch",
  "DESCRIPTION:Order #2026-09-08 14:00 confirmed 123456789012",
  "DTSTART;TZID=America/New_York:20260909T130000",
  "DTEND;TZID=America/New_York:20260909T133000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const NOW = Date.parse("2026-09-06T16:00:00.000Z");

export const feed = () => parseIcs(ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

/** Harbor, its owner, and Maria Lopez in its People: her profile's route runs over them (profileOf). */
export const HARBOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const MARIA = "11111111-1111-4111-8111-111111111111";

export const BRAIN = {
  business_name: "Harbor",
  system_prompt: "Answer as the front desk of Harbor: brief and warm.",
  fallbacks: { greeting: "g", error: "e", non_text: "n" },
};

/**
 * Maria's profile as GET contacts/:id answers it, run over a database in memory holding her row, her workspace and
 * `tables` beside them, `faults` failing a read the way PostgREST fails: what it answered, every query it asked, and
 * what it logged, by event.
 */
export async function profileOf(tables = {}, faults = {}) {
  const supabase = fakeDb(
    {
      memberships: [
        {
          user_id: "u1",
          tenant_id: HARBOR,
          role: "owner",
          tenants: { slug: "harbor" },
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      tenants: [{ id: HARBOR, name: "Harbor", timezone: TZ }],
      contacts: [
        {
          id: MARIA,
          tenant_id: HARBOR,
          phone_e164: "+13055550134",
          display_name: "Maria Lopez",
          notes: null,
          proposal_url: null,
        },
      ],
      tenant_config: [{ tenant_id: HARBOR, config: { brain: BRAIN } }],
      ...tables,
    },
    faults,
    {
      people_list: (a) =>
        a.p_tenant_id === HARBOR && a.p_contact_id === MARIA
          ? [{ id: MARIA, display_name: "Maria Lopez", phone_e164: "+13055550134", consent: "opted_in", dnc: false }]
          : [],
    },
  );
  const lines = [];
  const was = console.error;
  console.error = (...args) => {
    const line = logLineOf(args);
    lines.push(line ? { event: line.event, rest: [fieldsOf(line)] } : { event: args[0], rest: args.slice(1) });
  };
  try {
    const { person } = await personRoute.GET.run(
      new Request(`http://localhost/api/v1/contacts/${MARIA}?workspace=${HARBOR}`),
      { supabase, userId: "u1", email: "owner@example.com", params: { id: MARIA } },
    );
    const logged = (event) => lines.filter((l) => l.event === event).map((l) => l.rest);
    return { person, seen: supabase.seen, logged };
  } finally {
    console.error = was;
  }
}

/** Whether `q` is a select on `table` filtered by every `[column, value]` named. */
export const selectOn = (q, table, ...eqs) =>
  q.table === table &&
  q.op === "select" &&
  eqs.every(([col, val]) => q.filters.some(([op, c, v]) => op === "eq" && c === col && v === val));

export const PEOPLE = [
  { id: "p-maria", name: "Maria Lopez", phone: "+13055550134" },
  { id: "p-dani", name: "Dani", phone: "+13055550100" },
  { id: "p-daniela", name: "Daniela Ruiz", phone: null },
  { id: "p-ana", name: "Ana", phone: null },
  { id: "p-num", name: "", phone: "+13055550199" },
];

/**
 * An appointment booked through Google: the customer is a guest, and the only
 * thing the event says about them is their address. People holds an email
 * since 00125, so that is enough to know whose appointment it is.
 */
export const GUEST_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:g1",
  "SUMMARY:Colour touch-up",
  "ATTENDEE;CN=Front Desk:mailto:owner@salon.com",
  "ATTENDEE:mailto:Sofia.Perez@Gmail.com",
  "DTSTART;TZID=America/New_York:20260911T090000",
  "DTEND;TZID=America/New_York:20260911T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g2",
  "SUMMARY:Blow-dry",
  "DESCRIPTION:Phone: (305) 555-0134\nEmail: maria.lopez@gmail.com",
  "DTSTART;TZID=America/New_York:20260912T090000",
  "DTEND;TZID=America/New_York:20260912T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g3",
  "SUMMARY:Daniela Ruiz \u00b7 Colour",
  "DTSTART;TZID=America/New_York:20260913T090000",
  "DTEND;TZID=America/New_York:20260913T100000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:g4",
  "SUMMARY:Gel manicure",
  "ORGANIZER;CN=Marisa Owner:mailto:Marisa@Example.com",
  "ATTENDEE;CN=Marisa Owner;PARTSTAT=ACCEPTED:mailto:marisa@example.com",
  "ATTENDEE;CN=Ana Gomez;PARTSTAT=NEEDS-ACTION:mailto:ana.gomez@gmail.com",
  "DTSTART;TZID=America/New_York:20260914T090000",
  "DTEND;TZID=America/New_York:20260914T100000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const guestFeed = () =>
  parseIcs(GUEST_ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });

export const GUESTS = [
  { id: "p-sofia", name: "Sofia Perez", phone: null, email: "sofia.perez@gmail.com" },
  { id: "p-maria2", name: "Maria Lopez", phone: "+13055550134", email: "maria.lopez@gmail.com" },
  { id: "p-daniela2", name: "Daniela Ruiz", phone: null, email: null },
];

/**
 * The owner is on every event their own calendar carries: Google writes them
 * as ORGANIZER and lists them among the guests as well. They are not the
 * customer, and the day they are in People -- which the email channel makes
 * likely, since testing a new inbox means writing to it from your own address
 * -- matching them would hand them every appointment on the calendar.
 */
export const OWNER = { id: "p-marisa", name: "Marisa Owner", phone: null, email: "marisa@example.com" };

export const ANA = { id: "p-ana-g", name: "Ana Gomez", phone: null, email: "ana.gomez@gmail.com" };

export const ROW = {
  id: "p-maria",
  display_name: "Maria Lopez",
  wa_profile_name: null,
  phone_e164: "+13055550134",
  consent: "unknown",
  consent_source: null,
  consent_updated_at: null,
  dnc: false,
  channels: ["whatsapp"],
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
  last_call_at: null,
  last_inbound_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: null,
  earliest_row_at: null,
  has_backfill: false,
  has_chat: false,
  queued_reply_at: null,
};

/** What People has loaded, for the surface's mapping (surfaces/people/surface-map.ts): `ROW` in Harbor's zone, a calendar that reads, no deal on file. */
export const peopleLoaded = (over = {}) => ({
  tz: TZ,
  people: [ROW],
  page: null,
  saved: [],
  calendar: { state: "ok", source: "Google Calendar" },
  bookingLink: null,
  hasDeals: false,
  word: "appointment",
  consultFirst: false,
  dealPace: null,
  followUp: null,
  // The workspace's channels as People read them: none read, so counted by WhatsApp alone, as before the channels.
  channelsReady: null,
  views: {},
  viewsRead: true,
  ...over,
});

export const detail = (visits) => ({
  row: ROW,
  identities: [],
  conversations: [],
  calls: [],
  escalations: [],
  decisions: [],
  receptionist_mode: null,
  workspace_reply_mode: "auto",
  ...(visits ? { visits } : {}),
});

export const detail_ = (over = {}) => ({
  row: { ...ROW, ...over },
  identities: [],
  conversations: [],
  calls: [],
  escalations: [],
  decisions: [],
  receptionist_mode: null,
  workspace_reply_mode: "auto",
});

/**
 * The person's page as TSX (surfaces/people/person), drawn on the stub React the page tests share, for the cases below that
 * read what the profile draws or asks: the parts it is made of, each drawn over a person's view model, and its courier run
 * over a wire that records the write. Nothing else in this file draws, so the stub is installed when it is first asked for.
 */
export let profileWorld = null;

export async function profileUi() {
  if (profileWorld) return profileWorld;
  const LR = await import("../../_stub-react.mjs");
  LR.installStubReact({ __chrome: { state: stateOf } });
  const went = moved;
  Object.assign(globalThis, {
    __WORKSPACES: [{ id: HARBOR, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
    __ACTIVE_WORKSPACE: HARBOR,
    CHANLY: { nav: (to) => went.push(to) },
  });
  const P = "apps/dashboard/src/surfaces/people";
  const { hero, openWith } = await importSrc(`${P}/person/hero.tsx`);
  const { PersonNotes } = await importSrc(`${P}/person/notes.tsx`);
  const { PersonTimeline } = await importSrc(`${P}/person/timeline.tsx`);
  const { setPersonDetails } = await importSrc(`${P}/people-detail.ts`);
  const { Icon } = await importSrc("apps/dashboard/src/surfaces/kit/icon/icon.tsx");
  const quietly = async (fn) => {
    const was = console.error;
    console.error = () => {};
    try {
      return await fn();
    } finally {
      console.error = was;
    }
  };
  // What a write reads again after it lands (loaded by the client on a first write): loaded now, so a write's answer is
  // not waiting on a module's first load while the test waits on the write.
  await quietly(() => importSrc("apps/dashboard/src/bridge/refresh-map.ts"));
  /** What the page hands each of its parts: the person, and who is looking. */
  const ctx = (p, over = {}) => ({
    p,
    dealP: p,
    first: "Maria",
    who: "Maria",
    isOwner: true,
    canRecord: true,
    flash() {},
    load() {},
    error: null,
    onBack() {},
    del: { open: false, typed: "", busy: false, error: null },
    setDel() {},
    // Two records of one person becoming one (0028, #1419): not asked, and People not read, so nothing to merge with.
    merge: { open: false, pick: null, typed: "", busy: false, error: null },
    setMerge() {},
    others: null,
    // The member's own call (0052, call.tsx): nothing asked yet, and no number to ring on these fixtures.
    call: { vm: null, open: false, asking: false, setOpen() {}, dialled() {}, logPast() {}, close() {} },
    ...over,
  });
  /** The writes a courier's call made over a wire that takes every write, with what each carried. */
  const writes = async (call) => {
    const asked = [];
    const kept = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || "GET";
      asked.push([
        method,
        new URL(String(url), "https://app.chanlytics.com").pathname,
        init.body ? JSON.parse(init.body) : null,
      ]);
      const body =
        method === "GET" ? { ok: false, error: { code: "not_found", message: "not here" } } : { ok: true, data: {} };
      return new Response(JSON.stringify(body), {
        status: method === "GET" ? 404 : 200,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      await quietly(async () => {
        await call();
        for (let i = 0; i < 12; i += 1) await LR.settle();
      });
    } finally {
      globalThis.fetch = kept;
    }
    return asked.filter(([method]) => method !== "GET");
  };
  /** A tree drawn afresh, and the way to draw it again over the state it kept, as React does after a press. */
  const drawn = (thunk) => {
    LR.fresh();
    return { tree: LR.again(thunk), again: () => LR.again(thunk) };
  };
  profileWorld = { LR, went, ctx, writes, drawn, hero, openWith, PersonNotes, PersonTimeline, setPersonDetails, Icon };
  return profileWorld;
}

/* -------------------------------------------------------------------------- *
 * The business's own addresses: never a customer's.
 *
 * FOUND LIVE, 18 Sep 2026. The owner wrote to their salon's new email address
 * to test it -- the first thing anybody does with a new inbox -- and so became
 * a person in People. Their workspace reads their own Google Calendar, and #626
 * had taken the ORGANISER off every event, which covered them only where they
 * were the organiser. On every meeting somebody else had sent them they were a
 * GUEST, so each became one of their "visits": "Visited · New voicemail
 * notification received", "Last visit: Today". And the playbooks read visits
 * the same way, to decide who is thanked after a visit.
 * -------------------------------------------------------------------------- */

export const OWNER_ADDR = "ruben@rjcapital.example";

export const OWNER_URL =
  "https://calendar.google.com/calendar/ical/ruben%40rjcapital.example/private-0123456789/basic.ics";

/** Meetings on the owner's own calendar, organised by other people, with the owner invited. */
export const MEETINGS_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:m1",
  "DTSTART:20260908T160000Z",
  "DTEND:20260908T170000Z",
  "SUMMARY:Amazon Review",
  "ORGANIZER;CN=Greg Man:mailto:greg@agency.example",
  "ATTENDEE;CN=Ruben Segura:mailto:ruben@rjcapital.example",
  "ATTENDEE;CN=Greg Man:mailto:greg@agency.example",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:m2",
  "DTSTART:20260909T140000Z",
  "DTEND:20260909T143000Z",
  "SUMMARY:Meeting with Ruben Segura",
  "ORGANIZER:mailto:calendly@notify.example",
  "ATTENDEE;CN=Ruben:mailto:RUBEN@rjcapital.example",
  "END:VEVENT",
  // A real appointment: a customer, with the owner copied on it.
  "BEGIN:VEVENT",
  "UID:m3",
  "DTSTART:20260910T180000Z",
  "DTEND:20260910T190000Z",
  "SUMMARY:Balayage",
  "ORGANIZER:mailto:bookings@salon-tool.example",
  "ATTENDEE;CN=Ana Gomez:mailto:ana.gomez@gmail.com",
  "ATTENDEE;CN=Ruben:mailto:ruben@rjcapital.example",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

export const meetings = () =>
  parseIcs(MEETINGS_ICS, TZ, { horizon: { from: NOW - 90 * 86_400_000, to: NOW + 60 * 86_400_000 } });
