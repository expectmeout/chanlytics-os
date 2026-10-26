/**
 * The calendar a connected mailbox's grant reads (decision 0073, R20; apps/edge/lib/calendar/mailbox-calendar.ts over
 * channels mailbox-calendar.ts), run over a database in memory with Google's and Microsoft's calendars answered by the
 * test: every calendar of the account but the ones made for everyone, page by page, each occurrence apart, written out
 * as the iCal the account's own link would give, which the feed's reader (contracts parseIcs) takes exactly as it takes a
 * link; a calendar that cannot be read leaves the feed unread rather than half. Then the door the dashboard reads it by
 * (POST /api/admin/calendar/feed), and the history import's calendar part, which reads it once, now, when the mailbox
 * connects (imports/calendar-part.ts).
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { signEdgeToken } from "@chanlytics/channels";
import { DAY_MS, HOUR_MS, IMPORT_STOPPED_WORDS, parseIcs } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";
import { MAILBOX_ENV, liveCredentials, providers, vault, withEnv } from "../email/mailboxes/_mailbox-world.mjs";

const SECRET = "edge-secret-for-this-file";
const restore = withEnv({ ...MAILBOX_ENV, EDGE_CALL_SECRET: SECRET });
after(restore);
const { setPg } = await importSrc("apps/edge/lib/pg.ts");
const { mailboxCalendarText } = await importSrc("apps/edge/lib/calendar/mailbox-calendar.ts");
const { forgetFeeds } = await importSrc("apps/edge/lib/calendar/availability.ts");
const { historyImports } = await importSrc("apps/edge/lib/imports/history-import.ts");
const door = await importSrc("apps/edge/api/admin/calendar/feed.ts");
after(() => setPg(null));
beforeEach(() => forgetFeeds());

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "11111111-1111-4111-8111-111111111111";
const OWN = "sam@getharbor.example";
const AUD = "/api/admin/calendar/feed";
const CAL = "https://www.googleapis.com/calendar/v3";
const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = {
  google: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.readonly"],
  microsoft: ["Mail.Read", "Calendars.Read"],
};
const NOW = Date.now();
const WINDOW = { from: NOW - 180 * DAY_MS, to: NOW + 60 * DAY_MS };
/** An instant a whole number of hours from now, as both providers write one. */
const hoursOn = (h) => new Date(Math.floor(NOW / HOUR_MS) * HOUR_MS + h * HOUR_MS);

/** The world: the mailbox, its token, the settings naming its calendar, and what a read of the calendar writes. */
function world({ provider = "google", box = {}, credentials = liveCredentials("ya29.sam"), grant = true } = {}) {
  const mailbox = rows.mailboxConnection({
    tenant_id: T,
    provider,
    address: OWN,
    scopes: SCOPES[provider],
    ...box,
  });
  const v = vault(credentials ? { [mailbox.id]: credentials } : {});
  const notes = [];
  const kept = [];
  const tables = {
    tenants: [{ id: T, name: "Harbor Salon", timezone: "America/New_York", status: "active" }],
    tenant_config: [{ tenant_id: T, config: grant ? { calendar_grant: { mailbox_id: mailbox.id, provider } } : {} }],
    mailbox_connections: [mailbox],
    contacts: [],
    events: [],
    notifications: [],
    imports: [],
    jobs: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      ...v.rpcs,
      import_ledger_note: (a) => {
        notes.push(a);
        return null;
      },
      people_list: () => [],
      reach_out_booked: () => 0,
      appointments_feed_sync: (a) => {
        kept.push(a);
        return { added: a.p_rows.length, moved: 0, back: 0, vanished: 0, seen: a.p_rows.length, stale: false };
      },
    },
  );
  setPg(db);
  return { db, tables, notes, kept, mailbox };
}

/* ------------------------------------------------------------------ Google */

const googleEvent = (over) => ({
  status: "confirmed",
  iCalUID: `${over.id}@google.com`,
  organizer: { email: "Sam@GetHarbor.example" },
  ...over,
});
/** Sam's calendar, in two pages; the team's in one; Google's holidays and a calendar taken away, never asked. */
const GOOGLE = {
  list: {
    items: [
      { id: OWN },
      { id: "en.usa#holiday@group.v.calendar.google.com" },
      { id: "team@group.calendar.google.com" },
      { id: "old@group.calendar.google.com", deleted: true },
    ],
  },
  [OWN]: {
    first: {
      items: [
        googleEvent({
          id: "cut",
          summary: "Cut and colour; Rosa, 2h",
          description: "Client: 305-555-0101\nAsked for the window seat",
          location: "Chair 2",
          start: { dateTime: hoursOn(30).toISOString() },
          end: { dateTime: hoursOn(32).toISOString() },
          attendees: [
            { email: "Rosa@Example.com", displayName: 'Rosa "Ro" Diaz' },
            { email: OWN, displayName: "Sam" },
          ],
        }),
        googleEvent({
          id: "weekly_20261103",
          iCalUID: "weekly@google.com",
          recurringEventId: "weekly",
          summary: "Standing trim",
          start: { dateTime: hoursOn(50).toISOString() },
          end: { dateTime: hoursOn(51).toISOString() },
          originalStartTime: { dateTime: hoursOn(48).toISOString() },
        }),
        googleEvent({
          id: "gone",
          status: "cancelled",
          summary: "Cancelled",
          start: { dateTime: hoursOn(5).toISOString() },
          end: { dateTime: hoursOn(6).toISOString() },
        }),
      ],
      nextPageToken: "page-2",
    },
    second: {
      items: [
        googleEvent({
          id: "closed",
          summary: "Closed for the holiday",
          start: { date: "2026-11-26" },
          end: { date: "2026-11-27" },
        }),
        googleEvent({
          id: "lunch",
          summary: "Lunch",
          transparency: "transparent",
          start: { dateTime: hoursOn(28).toISOString() },
          end: { dateTime: hoursOn(29).toISOString() },
        }),
      ],
    },
  },
  "team@group.calendar.google.com": {
    first: {
      items: [
        googleEvent({
          id: "staff",
          summary: "Staff meeting",
          start: { dateTime: hoursOn(-72).toISOString() },
          end: { dateTime: hoursOn(-71).toISOString() },
        }),
      ],
    },
  },
};
/** Google's calendars, as the account above answers; `refuse` names a calendar whose events are refused, and how. */
const google =
  ({ refuse = {} } = {}) =>
  (c) => {
    const u = new URL(c.url);
    if (u.href.startsWith(`${CAL}/users/me/calendarList`)) return { json: GOOGLE.list };
    const m = u.pathname.match(/\/calendar\/v3\/calendars\/([^/]+)\/events$/);
    if (!m) return { status: 404 };
    const id = decodeURIComponent(m[1]);
    if (refuse[id]) return { status: refuse[id], json: { error: { code: refuse[id] } } };
    const cal = GOOGLE[id];
    if (!cal) return { status: 404 };
    return { json: u.searchParams.get("pageToken") === "page-2" ? cal.second : cal.first };
  };
const eventCalls = (net) => net.calls.filter((c) => c.url.includes("/events?"));

test("a Google account's calendars: every one but the holidays, page by page, each occurrence apart, written as its own link would say them", async () => {
  const w = world();
  const net = providers(google());
  let text;
  try {
    text = await mailboxCalendarText(w.db, T, w.mailbox.id, WINDOW);
  } finally {
    net.restore();
  }
  const asked = eventCalls(net).map((c) => {
    const u = new URL(c.url);
    return [decodeURIComponent(u.pathname.split("/")[4]), u.searchParams.get("pageToken")];
  });
  assert.deepEqual(asked, [
    [OWN, null],
    [OWN, "page-2"],
    ["team@group.calendar.google.com", null],
  ]);
  const q = new URL(eventCalls(net)[0].url).searchParams;
  assert.deepEqual(
    [q.get("singleEvents"), q.get("timeMin"), q.get("timeMax")],
    ["true", new Date(WINDOW.from).toISOString(), new Date(WINDOW.to).toISOString()],
    "each occurrence of a series apart, over the window asked",
  );
  assert.ok(
    net.calls.every((c) => c.headers.Authorization === "Bearer ya29.sam"),
    "the grant's own token",
  );
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /RECURRENCE-ID:/, "an occurrence says the instant it was due");

  // What the feed's reader takes from it is what it would take from the account's own link.
  const feed = parseIcs(text, "America/New_York", { horizon: WINDOW });
  const by = Object.fromEntries(feed.items.map((i) => [i.uid, i]));
  assert.deepEqual(Object.keys(by).sort(), [
    "closed@google.com",
    "cut@google.com",
    "staff@google.com",
    "weekly@google.com",
  ]);
  assert.deepEqual(
    [by["cut@google.com"].title, by["cut@google.com"].description, by["cut@google.com"].location],
    ["Cut and colour; Rosa, 2h", "Client: 305-555-0101\nAsked for the window seat", "Chair 2"],
    "the words as the owner wrote them, through iCal's escapes",
  );
  assert.deepEqual(
    [by["cut@google.com"].start, by["cut@google.com"].end],
    [hoursOn(30).getTime(), hoursOn(32).getTime()],
  );
  assert.deepEqual(
    by["cut@google.com"].attendees.map((a) => a.email),
    ["rosa@example.com", OWN],
    "the guests, lower-cased",
  );
  assert.equal(by["cut@google.com"].organizer, OWN);
  assert.equal(by["weekly@google.com"].occurrence, hoursOn(48).getTime(), "the occurrence keys by when it was due");
  assert.equal(by["closed@google.com"].allDay, true);
  assert.ok(!feed.items.some((i) => i.title === "Lunch"), "time marked free takes none");
  assert.ok(!feed.items.some((i) => i.title === "Cancelled"));
});

/* ------------------------------------------------------------------ Microsoft */

test("a Microsoft 365 account's calendars: its calendar view in UTC, the next page where Graph says, an all-day event by the day it names", async () => {
  const w = world({ provider: "microsoft", credentials: liveCredentials("eyJ.sam") });
  const NEXT = `${GRAPH}/me/calendars/AAA/calendarView?$skiptoken=two`;
  const net = providers((c) => {
    if (c.url.startsWith(`${GRAPH}/me/calendars?`)) return { json: { value: [{ id: "AAA" }] } };
    if (c.url === NEXT)
      return {
        json: {
          value: [
            {
              iCalUId: "closed-ms",
              subject: "Closed",
              isAllDay: true,
              // Midnight in New York, said in UTC: the day it names is the 26th.
              start: { dateTime: "2026-11-26T05:00:00.0000000" },
              end: { dateTime: "2026-11-27T05:00:00.0000000" },
            },
          ],
        },
      };
    if (c.url.startsWith(`${GRAPH}/me/calendars/AAA/calendarView?`))
      return {
        json: {
          value: [
            {
              iCalUId: "visit-ms",
              subject: "Blow-dry",
              bodyPreview: "Client: 305-555-0102",
              start: { dateTime: hoursOn(26).toISOString().replace("Z", "") },
              end: { dateTime: hoursOn(27).toISOString().replace("Z", "") },
              location: { displayName: "" },
              attendees: [{ emailAddress: { name: "Ana", address: "Ana@Example.com" } }],
              organizer: { emailAddress: { address: OWN } },
              type: "occurrence",
              originalStart: hoursOn(24).toISOString(),
            },
            {
              iCalUId: "off-ms",
              subject: "Off",
              isCancelled: true,
              start: { dateTime: "2026-11-01T10:00:00" },
              end: { dateTime: "2026-11-01T11:00:00" },
            },
          ],
          "@odata.nextLink": NEXT,
        },
      };
    return { status: 404 };
  });
  let text;
  try {
    text = await mailboxCalendarText(w.db, T, w.mailbox.id, WINDOW);
  } finally {
    net.restore();
  }
  const views = net.calls.filter((c) => c.url.includes("calendarView"));
  assert.equal(views.length, 2);
  assert.equal(views[1].url, NEXT, "the next page as Graph gave it");
  assert.ok(
    views.every((c) => c.headers.Prefer === 'outlook.timezone="UTC"'),
    "times asked in UTC",
  );
  const items = parseIcs(text, "America/New_York", { horizon: WINDOW }).items;
  const by = Object.fromEntries(items.map((i) => [i.uid, i]));
  assert.deepEqual(Object.keys(by).sort(), ["closed-ms", "visit-ms"]);
  assert.deepEqual(
    [by["visit-ms"].start, by["visit-ms"].occurrence, by["visit-ms"].description, by["visit-ms"].location],
    [hoursOn(26).getTime(), hoursOn(24).getTime(), "Client: 305-555-0102", null],
  );
  assert.deepEqual(by["visit-ms"].attendees, [{ name: "Ana", email: "ana@example.com" }]);
  assert.match(text, /DTSTART;VALUE=DATE:20261126\r\n/, "the all-day event on the day it names");
});

/* ------------------------------------------------------------------ what cannot be read */

test("a calendar that cannot be read now is a feed that cannot be read: not granted, one calendar refused (never half), signed out, removed", async () => {
  // The grant never held the calendar: nothing asked of the provider.
  const unticked = world({ box: { scopes: [SCOPES.google[0]] } });
  const none = providers(() => ({ status: 500 }));
  try {
    assert.equal(await mailboxCalendarText(unticked.db, T, unticked.mailbox.id, WINDOW), null);
  } finally {
    none.restore();
  }
  assert.equal(none.calls.length, 0);

  // The team's calendar refused: the feed is not read at all, since one missing a calendar offers its taken times as open.
  const half = world();
  const refused = providers(google({ refuse: { "team@group.calendar.google.com": 403 } }));
  try {
    assert.equal(await mailboxCalendarText(half.db, T, half.mailbox.id, WINDOW), null);
  } finally {
    refused.restore();
  }

  // Signed out: the refresh refused for good, and the mailbox says connect it again.
  const out = world({ credentials: { ...liveCredentials(), expires_at: Date.now() - 60_000 } });
  const grantRefused = providers((c) =>
    c.url === "https://oauth2.googleapis.com/token"
      ? { status: 400, json: { error: "invalid_grant", error_description: "Token has been expired or revoked." } }
      : { status: 500 },
  );
  try {
    assert.equal(await mailboxCalendarText(out.db, T, out.mailbox.id, WINDOW), null);
  } finally {
    grantRefused.restore();
  }
  assert.equal(out.tables.mailbox_connections[0].state, "reconnect");
  assert.ok(!grantRefused.calls.some((c) => c.url.includes("/calendar/")), "no calendar asked without a token");

  const removed = world({ box: { state: "removed" } });
  assert.equal(await mailboxCalendarText(removed.db, T, removed.mailbox.id, WINDOW), null);
});

/* ------------------------------------------------------------------ the dashboard's door */

async function ask(body = {}, { workspace = T } = {}) {
  const raw = JSON.stringify({ tenant_id: T, user_id: U, ...body });
  const res = await door.POST(
    new Request(`http://edge${AUD}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-edge-token": signEdgeToken(SECRET, AUD, { workspace, user: U, body: raw }),
      },
      body: raw,
    }),
  );
  return [res.status, await res.json()];
}

test("the dashboard's door: the calendar the settings name, as iCal, over the window asked (at most a season and a year); none named, or unreadable, said", async () => {
  world();
  const net = providers(google());
  let answered;
  try {
    answered = await ask({ from: WINDOW.from, to: WINDOW.from + 900 * DAY_MS });
  } finally {
    net.restore();
  }
  assert.equal(answered[0], 200);
  assert.equal(answered[1].ok, true);
  assert.equal(parseIcs(answered[1].text, "America/New_York", { horizon: WINDOW }).items.length, 4);
  assert.equal(
    new URL(eventCalls(net)[0].url).searchParams.get("timeMax"),
    new Date(WINDOW.from + 550 * DAY_MS).toISOString(),
    "a window past a season and a year is cut to it",
  );

  world({ grant: false });
  assert.deepEqual(await ask(), [
    404,
    { ok: false, error: "not_connected", detail: "this workspace reads no calendar through a mailbox" },
  ]);
  world();
  const down = providers(() => ({ status: 503, json: {} }));
  try {
    assert.deepEqual((await ask())[0], 502);
  } finally {
    down.restore();
  }
  assert.equal((await ask({}, { workspace: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }))[0], 403);
});

/* ------------------------------------------------------------------ the history import's part */

const calendarPartOf = (w) =>
  historyImports(w.db).part(
    {
      id: "job-calendar-1",
      tenant_id: T,
      kind: "history_import",
      payload: { source: "calendar", seq: "run:1", connection_id: w.mailbox.id },
    },
    Date.now() + 30_000,
  );

test("the history import's calendar part reads the calendar once, now: its visits kept and counted on the ledger as the mailbox's; none named, or unreadable, said on its row", async () => {
  const w = world();
  const net = providers(google());
  try {
    await calendarPartOf(w);
  } finally {
    net.restore();
  }
  assert.ok(eventCalls(net).length > 0, "read now, whatever the hour");
  assert.ok(w.kept.length > 0, "the visits handed to the appointments door");
  const done = w.notes.find((n) => n.p_source === "calendar" && n.p_state === "done");
  assert.deepEqual([done.p_counts, done.p_via], [{ past: 1, coming: 3 }, "google"], "counted, and read through Google");
  assert.ok(
    w.tables.tenant_config[0].calendar_checked_at,
    "stamped as read, so the hour's sweep does not read it again",
  );

  const unticked = world({ grant: false });
  await calendarPartOf(unticked);
  assert.deepEqual(
    unticked.notes.map((n) => [n.p_source, n.p_state, n.p_error]),
    [["calendar", "failed", IMPORT_STOPPED_WORDS.notTicked("Your calendars")]],
  );
  const down = world();
  const refused = providers(() => ({ status: 503, json: {} }));
  try {
    await calendarPartOf(down);
  } finally {
    refused.restore();
  }
  assert.deepEqual(
    down.notes.filter((n) => n.p_state === "failed").map((n) => n.p_error),
    [IMPORT_STOPPED_WORDS.failed],
  );
});
