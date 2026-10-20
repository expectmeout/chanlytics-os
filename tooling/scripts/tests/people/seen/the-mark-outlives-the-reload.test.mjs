/**
 * The reader's own mark outlives the reload (20 Oct 2026).
 *
 * Seen on the desk and the phone: F5 on the Inbox or People painted every person opened since the list was last read
 * as unread again, then the read took the dots away. The tab's cache paints the surfaces' values, which are the server's
 * last word, and the mark a person's opening makes (PUT contacts/:id/seen, which re-reads nothing by design) lived only
 * in the tab's own store (surfaces/seen.ts `mine`), gone with the page. Now the door's answer is carried into the rows
 * it is about, in the Inbox, Conversations and People, and the cache follows, so the next load paints what the tab
 * showed: a person opened is read, one put back is unread, and nothing is known of the tab's own.
 *
 * Run over the real surfaces, the real seen store and the real cache, on a window with local storage and a fake wire
 * that answers the mark as the door does (server/people/person-seen.ts markPersonSeen).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toConversationVM, toInboxThreadVM } from "@chanlytics/contracts";

const ZONE = "America/New_York";
const NOW = new Date("2026-10-20T19:00:00Z");
const ago = (min) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ms = (iso) => Date.parse(iso);
const TID = "t-salon";
/** The workspace's slot in the browser's local storage, by its address's word (surface-cache.ts). */
const CACHE = "chanlytics.surfaces.v2:salon";

/** A store as the browser's are. */
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
globalThis.document = { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };

/* ---------------------------------- the people ---------------------------------- */

// Each test opens a person of its own: a mark the door stamped is carried for the tab's life, as it is in the app.
const SAM = "11111111-1111-4111-8111-111111111111";
const ROSA = "22222222-2222-4222-8222-222222222222";
const KIM = "33333333-3333-4333-8333-333333333333";
const LEE = "44444444-4444-4444-8444-444444444444";
/** When each last wrote: what the reader's opening says they have seen up to. */
const HEARD = { [SAM]: ago(40), [ROSA]: ago(30), [KIM]: ago(20), [LEE]: ago(10) };
/** What each read said of the reader: looked before they wrote, so both are new to them. */
const LOOKED = ago(60);

const contact = (id, name) => ({
  id,
  display_name: name,
  wa_profile_name: null,
  phone_e164: "+16465550123",
  email: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  proposal_url: null,
});
const wrote = (id, body, at) => ({
  id,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body,
  media: null,
  meta: null,
  status: "received",
  created_at: at,
  channel_ts: at,
});
/** A conversation as GET conversations answers it, with the reader's reading on it. */
const conv = (id, who, name, over = {}) => ({
  id,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  assignee_is_me: false,
  last_wa_inbound_at: HEARD[who],
  last_message_at: HEARD[who],
  last_inbound_at: HEARD[who],
  contact: contact(who, name),
  messages: [wrote(`m-${id}`, "Can I move my appointment?", HEARD[who])],
  seen_at: LOOKED,
  ...over,
});
/** A person as GET contacts answers them, with the reader's reading on them. */
const personRow = (id, name, over = {}) => ({
  ...contact(id, name),
  consent_source: null,
  created_at: ago(5000),
  has_chat: true,
  latest_conversation_id: `c-${id.slice(0, 1)}`,
  latest_state: "open",
  latest_paused_until: null,
  latest_snooze_until: null,
  latest_assignee_user_id: null,
  last_message_at: HEARD[id],
  last_inbound_at: HEARD[id],
  last_inbound_text: "Can I move my appointment?",
  last_outbound_at: null,
  conversation_count: 1,
  call_count: 0,
  escalation_count: 0,
  call_seconds: 0,
  open_escalation_since: null,
  seen_at: LOOKED,
  ...over,
});

/* ----------------------------------- the wire ----------------------------------- */

/** Every mark asked of the server: the person, which way, and how far the reader said they had seen. */
const marks = [];
/** The door's clock, and what it holds of each person's mark; `answer` stands in for the door when a test sets it. */
const wire = { stamp: NOW.getTime(), seen: {}, answer: null };
const iso = (at) => new Date(at).toISOString();
globalThis.window = {
  location: {
    pathname: "/w/salon",
    search: "",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  sessionStorage: globalThis.sessionStorage,
  localStorage: globalThis.localStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  __WORKSPACES: [{ id: TID, slug: "salon", name: "Salon", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  fetch: async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    const mark = /^\/api\/v1\/contacts\/([^/]+)\/seen$/.exec(u.pathname);
    if (mark && init.method === "PUT") {
      const who = mark[1];
      const body = JSON.parse(String(init.body));
      marks.push([who, body.seen, body.heard_at ?? null]);
      if (wire.answer) return wire.answer();
      // The door (contact_mark, 00349): seen up to what they said, never earlier than before; put back keeps seen_at and
      // stamps unread_at; either way marked_at is the database's clock, later than the last.
      wire.stamp += 1000;
      const held = wire.seen[who] ?? null;
      const seenAt = body.seen
        ? held && held > (body.heard_at ?? "")
          ? held
          : (body.heard_at ?? iso(wire.stamp))
        : held;
      wire.seen[who] = seenAt;
      return json(200, {
        ok: true,
        data: { contact_id: who, seen_at: seenAt, marked_unread: !body.seen, marked_at: iso(wire.stamp) },
      });
    }
    if (u.pathname === "/api/v1/contacts")
      return json(200, {
        ok: true,
        data: {
          people: [personRow(SAM, "Sam Example"), personRow(ROSA, "Rosa Example")],
          page: { q: null, offset: 0, limit: 1000, total: 2, has_more: false },
          calendar: { state: "none", source: "your calendar" },
          booking_link: null,
        },
      });
    if (u.pathname === "/api/v1/segments") return json(200, { ok: true, data: { lists: [] } });
    if (u.pathname === "/api/v1/views") return json(200, { ok: true, data: { views: {} } });
    return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
  },
};
const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const S = "../../../../../apps/dashboard/src";
// The three surfaces that draw the dot: imported as the app imports them, so each says how a mark is carried into its rows.
const { inboxOverride } = await quietly(() => import(`${S}/surfaces/inbox/surface.ts`));
const { conversationsOverride } = await quietly(() => import(`${S}/surfaces/inbox/conversations-surface.ts`));
const { peopleOverride } = await quietly(() => import(`${S}/surfaces/people/surface.ts`));
const { setSurfaceValue, surfaceValue } = await import(`${S}/surfaces/surface-values.ts`);
const { snapshotSurface, hydrateSurfaceCache, clearSurfaceCache, flushSurfaceCache } = await import(
  `${S}/legacy-bridge/surface-cache.ts`
);
const { seePerson, unseePerson, threadUnread, threadWhose, threadReading } = await import(`${S}/surfaces/seen.ts`);

// The door's answer is read over a few turns of the loop (the request, its body, the client's own steps): wait them out.
const settle = async () => {
  for (let turn = 0; turn < 8; turn += 1) await new Promise((r) => setImmediate(r));
};
/** The cache's slot as the next load reads it: after the page's hide, which writes what waits. */
const stored = () => (flushSurfaceCache(), JSON.parse(globalThis.localStorage.getItem(CACHE) ?? "null"));
/** A surface's rows as the next load would paint them: the cache restored over nothing, as straight after F5. */
const painted = (key, rows) => {
  setSurfaceValue(key, undefined);
  hydrateSurfaceCache();
  return rows(surfaceValue(key));
};
/** Published and cached as the runner does after a read lands (surface-runner.ts persistSurface). */
const landed = (override, value) => {
  setSurfaceValue(override.value, value);
  snapshotSurface(override.key, override.globals ?? [], TID, override.trimSnapshot, override.value);
};

/** The Inbox's threads as its read makes them: Sam and Rosa, both new to the reader. */
const inboxThreads = () => [
  toInboxThreadVM(conv("c-1", SAM, "Sam Example"), null, ZONE, NOW),
  toInboxThreadVM(conv("c-2", ROSA, "Rosa Example"), null, ZONE, NOW),
];
const inboxValue = (threads) => ({
  INBOX_BUCKETS: [],
  INBOX_VIEWS: [],
  THREADS: threads,
  CHANNEL_LABELS: {},
  INBOX_BASELINE: { doneThisWeek: 0 },
});
const sam = (value) => value.THREADS.find((t) => t.clientId === SAM);
const rosa = (value) => value.THREADS.find((t) => t.clientId === ROSA);

test("a person opened is read on the next load: the Inbox's row carries the mark, and so does the cache the next load paints", async () => {
  clearSurfaceCache();
  const threads = inboxThreads();
  landed(inboxOverride, inboxValue(threads));
  assert.equal(sam(surfaceValue("inbox")).unread, true, "the read's word: new to the reader");
  const was = { sam: sam(surfaceValue("inbox")), rosa: rosa(surfaceValue("inbox")) };

  seePerson(threadWhose(was.sam), threadReading(was.sam));
  await settle();
  assert.deepEqual(marks.splice(0), [[SAM, true, HEARD[SAM]]], "the mark went, up to what Sam last wrote");

  const now = surfaceValue("inbox");
  assert.equal(
    sam(now).unread,
    false,
    "REGRESSION: the row kept the read's word, so the cache painted Sam unread again",
  );
  assert.equal(
    sam(now).markAtMs,
    wire.stamp,
    "and carries the stamp of the mark, which a later read is judged against",
  );
  assert.equal(sam(now).heardAtMs, was.sam.heardAtMs, "nothing else of the row moves");
  assert.equal(rosa(now), was.rosa, "Rosa's row is the object it was: her row is not drawn again");
  assert.equal(now.THREADS.length, 2);

  assert.equal(sam(stored().surfaces.inbox.$value).unread, false, "the cache holds the row as carried");
  const next = painted("inbox", (v) => v);
  assert.equal(sam(next).unread, false, "so the next load paints Sam read");
  assert.equal(sam(next).markAtMs, wire.stamp);
  assert.equal(threadUnread(sam(next)), false, "and the page's own rule agrees, with nothing of this tab's left");
});

test("put back as unread, the same way: the row and the cache say unread, as the next load will", async () => {
  clearSurfaceCache();
  const threads = inboxThreads().map((t) => (t.clientId === SAM ? { ...t, unread: false, markAtMs: 1 } : t));
  landed(inboxOverride, inboxValue(threads));
  assert.equal(sam(surfaceValue("inbox")).unread, false, "the read's word: seen");

  unseePerson(SAM);
  await settle();
  assert.deepEqual(marks.splice(0), [[SAM, false, null]]);
  assert.equal(sam(surfaceValue("inbox")).unread, true, "put back: the row says so");
  assert.equal(sam(surfaceValue("inbox")).markAtMs, wire.stamp);
  assert.equal(sam(painted("inbox", (v) => v)).unread, true, "and so will the next load");
});

test("Conversations' rows carry it too, each row a person's row stands for among them", async () => {
  clearSurfaceCache();
  const newest = toConversationVM(conv("c-1", SAM, "Sam Example"), null, ZONE, NOW);
  const older = toConversationVM(conv("c-3", SAM, "Sam Example", { last_inbound_at: ago(400) }), null, ZONE, NOW);
  const other = toConversationVM(conv("c-2", ROSA, "Rosa Example"), null, ZONE, NOW);
  // One row per person (cv-rules.ts cvOnePerPerson): Sam's row is his newest, with every row it stands for under parts.
  const samRow = { ...newest, parts: [newest, older] };
  landed(conversationsOverride, {
    CONVERSATIONS: [samRow, other],
    CV_CHANNELS: [{ id: "all", label: "All" }],
    CALLS_READ: true,
  });
  assert.equal(surfaceValue("conversations").CONVERSATIONS[0].unseen, true);

  seePerson({ personId: SAM, conversationId: "c-1" }, { unseen: true, heardAtMs: ms(HEARD[SAM]), markAtMs: 0 });
  await settle();
  marks.splice(0);
  const rows = surfaceValue("conversations").CONVERSATIONS;
  assert.equal(rows[0].unseen, false, "REGRESSION: Conversations painted Sam new again on the next load");
  assert.equal(rows[0].markAtMs, wire.stamp);
  assert.deepEqual(
    rows[0].parts.map((p) => [p.unseen, p.markAtMs]),
    [
      [false, wire.stamp],
      [false, wire.stamp],
    ],
    "every row his stands for: the page judges his row by any of them (cvSeenOf)",
  );
  assert.equal(rows[1], other, "Rosa's row is the object it was");
  const next = painted("conversations", (v) => v.CONVERSATIONS);
  assert.equal(next[0].unseen, false, "the next load paints Sam read");
  assert.equal(next[0].parts[1].unseen, false);
});

test("People's row says it from its own record, so its facts agree: new to the reader, how far they had seen, the mark's stamp; and the cache follows", async () => {
  clearSurfaceCache();
  await peopleOverride.apply();
  snapshotSurface(peopleOverride.key, peopleOverride.globals ?? [], TID, peopleOverride.trimSnapshot, "people");
  const rowOf = (value, id) => value.rows.find((r) => r.id === id);
  const before = rowOf(surfaceValue("people"), ROSA);
  assert.equal(before.unseen, true, "the read's word: new to the reader");
  const samBefore = rowOf(surfaceValue("people"), SAM);

  seePerson(
    { personId: ROSA, conversationId: before.conversationId },
    { unseen: true, heardAtMs: ms(HEARD[ROSA]), markAtMs: 0 },
  );
  await settle();
  marks.splice(0);
  const after = rowOf(surfaceValue("people"), ROSA);
  assert.equal(after.unseen, false, "REGRESSION: People painted Rosa new again on the next load");
  assert.equal(after.markAtMs, wire.stamp, "the stamp of the mark");
  assert.equal(
    after.seenAtMs,
    ms(HEARD[ROSA]),
    "how far the reader had seen: what their page's 'new since you last looked' reads",
  );
  assert.equal(rowOf(surfaceValue("people"), SAM), samBefore, "Sam's row is the object it was");
  assert.equal(rowOf(stored().surfaces.people.$value, ROSA).unseen, false, "the cache holds it");
  assert.equal(painted("people", (v) => rowOf(v, ROSA)).unseen, false, "so the next load paints Rosa read");

  // Put back from People: the same row, the other way.
  unseePerson(ROSA);
  await settle();
  marks.splice(0);
  assert.equal(rowOf(surfaceValue("people"), ROSA).unseen, true, "put back: new again");
  assert.equal(painted("people", (v) => rowOf(v, ROSA)).unseen, true);
});

test("a read that left before the mark and lands after it does not put the old word back; one that carries a later mark is believed", async () => {
  clearSurfaceCache();
  const lee = (value) => value.THREADS.find((t) => t.clientId === LEE);
  const read = () => [...inboxThreads(), toInboxThreadVM(conv("c-5", LEE, "Lee Example"), null, ZONE, NOW)];
  landed(inboxOverride, inboxValue(read()));
  seePerson(threadWhose(lee(surfaceValue("inbox"))), threadReading(lee(surfaceValue("inbox"))));
  await settle();
  assert.deepEqual(marks.splice(0), [[LEE, true, HEARD[LEE]]]);
  const mine = wire.stamp;
  assert.equal(lee(surfaceValue("inbox")).unread, false);

  // The read that was out as Lee was opened lands: its rows are the server's word from before the mark.
  landed(inboxOverride, inboxValue(read()));
  assert.equal(
    lee(surfaceValue("inbox")).unread,
    false,
    "REGRESSION: the late read put 'unread' back into the value, and the cache painted it on the next load",
  );
  assert.equal(lee(surfaceValue("inbox")).markAtMs, mine);
  assert.equal(lee(painted("inbox", (v) => v)).unread, false, "the next load paints Lee read still");

  // Their phone put Lee back after this tab opened them: a read carrying that later mark is the server's word.
  const phone = read().map((t) => (t.clientId === LEE ? { ...t, unread: true, markAtMs: mine + 60_000 } : t));
  landed(inboxOverride, inboxValue(phone));
  assert.equal(lee(surfaceValue("inbox")).unread, true, "put back elsewhere, later: unread, as the read says");
  assert.equal(lee(surfaceValue("inbox")).markAtMs, mine + 60_000, "and the later stamp stands");
  assert.equal(lee(painted("inbox", (v) => v)).unread, true);
});

test("a mark that did not land carries nothing: the rows say what the server says, as the tab's own word is let go", async () => {
  clearSurfaceCache();
  const kim = (value) => value.THREADS.find((t) => t.clientId === KIM);
  landed(
    inboxOverride,
    inboxValue([...inboxThreads(), toInboxThreadVM(conv("c-4", KIM, "Kim Example"), null, ZONE, NOW)]),
  );
  wire.answer = () => json(503, { ok: false, error: { code: "unavailable", message: "Try again." } });
  try {
    seePerson(threadWhose(kim(surfaceValue("inbox"))), threadReading(kim(surfaceValue("inbox"))));
    await settle();
    await settle();
  } finally {
    wire.answer = null;
  }
  marks.splice(0);
  assert.equal(kim(surfaceValue("inbox")).unread, true, "nothing carried: the read's word stands");
  assert.equal(kim(surfaceValue("inbox")).markAtMs, 0);
  assert.equal(kim(painted("inbox", (v) => v)).unread, true);
});
