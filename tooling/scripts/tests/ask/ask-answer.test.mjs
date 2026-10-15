/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): every
 * answer made before the Line read back in the prose form, one door per place, the three quick answers from Today's
 * queue, and the model's own: the format it writes, how the server reads it back, its Say while it streams, and the
 * v1 fields it is stored beside. Run on the contract itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_ANSWER_CAPS,
  ASK_ANSWER_FORMAT,
  ASK_CAPS,
  ASK_CITATION_KINDS,
  answerForCards,
  answerFromV1,
  answerSpoken,
  answerText,
  answerWords,
  askIntent,
  callsAnswer,
  callsToday,
  cardOpenRoute,
  claimsWrite,
  emptyReadSet,
  failedAnswer,
  leadQuestionRoute,
  needsAnswer,
  normalizeAnswer,
  noteRows,
  oneDoor,
  openingsAnswer,
  partialSay,
  proseAnswer,
  rightNowCounts,
  rightNowLine,
  storedAnswer,
  v1FromAnswer,
} from "@chanlytics/contracts";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const v1 = (over = {}) => ({
  text: "Nora asked about Saturday; nobody else is waiting.",
  citations: [
    { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}` },
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
  ],
  navigate: null,
  followups: ["Reply to Nora?", "What did the receptionist tell Nora?"],
  language: "en",
  ...over,
});

test("an answer made before the Line reads back as prose: its rows are items, a page it rested on is its Open, the follow-ups are next", () => {
  const a = answerFromV1(v1());
  assert.equal(a.v, 2);
  assert.equal(a.form, "prose");
  assert.deepEqual(a.say, { headline: "", detail: "Nora asked about Saturday; nobody else is waiting." });
  assert.deepEqual(
    a.show.items.map((i) => [i.title, i.meta, i.source.to, i.source.door]),
    [["Nora", "Thread", `inbox/th-${ID}`, true]],
  );
  assert.deepEqual(
    a.do.open,
    { to: "reports", label: "Reports", now: false },
    "a page citation was a door to its page",
  );
  assert.deepEqual(a.do.next, ["Reply to Nora?", "What did the receptionist tell Nora?"]);
  const nav = answerFromV1(v1({ navigate: { to: `conversations/cv-${ID2}`, label: "Open", now: true } }));
  assert.deepEqual(
    nav.do.open,
    { to: `conversations/cv-${ID2}`, label: "Open the call", now: true },
    "navigate wins, in the app's words",
  );
  assert.equal(answerFromV1(v1({ language: "es" })).show.items[0].meta, "Hilo");
  // A playbook a person reads as a campaign (the moment spec, D19), in both languages.
  const pb = [{ kind: "playbook", id: ID2, label: "Win-back", to: `campaigns/moment:${ID2}` }];
  assert.equal(answerFromV1(v1({ citations: pb })).show.items[0].meta, "Campaign");
  assert.equal(answerFromV1(v1({ citations: pb, language: "es" })).show.items[0].meta, "Campaña");
  assert.equal(answerText(a), "Nora asked about Saturday; nobody else is waiting.");
});

test("one door: an item keeps its door, Open goes when an item has its route, a card's Open hides behind either, a receipt's door shows once, and a next question that points at an offered place goes", () => {
  const src = (kind, id, to) => ({ kind, id, label: id, to, door: true });
  const a = {
    v: 2,
    form: "structured",
    say: { headline: "Two people are waiting on you.", detail: "" },
    show: {
      figures: [
        { value: "5", label: "times it needed you", note: "up from 1", source: src("page", "reports", "reports") },
        { value: "1 min", label: "median reply", note: "", source: src("page", "reports", "reports") },
      ],
      items: [{ title: "Nora", meta: "WhatsApp · 3 days", line: "", source: src("thread", ID, `inbox/th-${ID}`) }],
      breakdown: null,
    },
    do: {
      open: { to: `inbox/th-${ID}`, label: "Open the thread", now: false },
      next: ["Show me Nora's thread", "What did the receptionist tell Nora?", "what did the receptionist tell nora"],
    },
    language: "en",
  };
  const cards = [
    { id: "p1", kind: "thread_verb", payload: { conversation_id: ID } },
    { id: "p2", kind: "playbook", payload: {} },
    { id: "p3", kind: "reply", payload: { conversation_id: ID } },
  ];
  const { answer, cardOpen } = oneDoor(a, cards);
  assert.equal(answer.do.open, null, "the item is already the door to the thread");
  assert.deepEqual(
    cardOpen,
    { p1: false, p2: true, p3: false },
    "the thread's card hides its Open; a reply never had one",
  );
  assert.deepEqual(
    answer.show.figures.map((f) => f.source.door),
    [true, false],
    "the first receipt that points at Reports draws the door; the second says where it comes from without one",
  );
  assert.deepEqual(
    answer.do.next,
    ["What did the receptionist tell Nora?"],
    "the echo of an offered thread goes, and so does a repeat",
  );
  const routes = [
    ...answer.show.items.map((i) => i.source.to),
    ...(answer.do.open ? [answer.do.open.to] : []),
    ...cards.filter((c) => cardOpen[c.id]).map((c) => cardOpenRoute(c)),
    ...answer.show.figures.filter((f) => f.source && f.source.door).map((f) => f.source.to),
  ];
  assert.equal(new Set(routes).size, routes.length, `no route offered twice: ${routes.join(", ")}`);
});

test("one door among the items too: a later item to a place an earlier one opens is said without a door", () => {
  const cal = (title) => ({
    title,
    meta: "",
    line: "",
    source: { kind: "page", id: "calendar", label: "Calendar", to: "calendar", door: true },
  });
  const { answer } = oneDoor({
    v: 2,
    form: "structured",
    say: { headline: "Two walk-ins tomorrow.", detail: "" },
    show: { figures: [], items: [cal("10:00 walk-in"), cal("2:00 walk-in")], breakdown: null },
    do: { open: { to: "calendar", label: "Open the Calendar", now: false }, next: [] },
    language: "en",
  });
  assert.deepEqual(
    answer.show.items.map((i) => [i.title, i.source.door]),
    [
      ["10:00 walk-in", true],
      ["2:00 walk-in", false],
    ],
  );
  assert.equal(answer.do.open, null, "and the Calendar is not offered again as Open");
});

test("a card's Open is the contract's: its page, the person's, or none, never a route with a hole in it", () => {
  assert.equal(cardOpenRoute({ kind: "settings", payload: {} }), "admin/workspace");
  assert.equal(cardOpenRoute({ kind: "policy", payload: {} }), "admin/autonomy");
  assert.equal(cardOpenRoute({ kind: "deal", payload: { contact_id: ID } }), `clients/${ID}`);
  assert.equal(cardOpenRoute({ kind: "deal", payload: {} }), null, "REGRESSION: it opened clients/undefined");
  assert.equal(cardOpenRoute({ kind: "broadcast", payload: {} }), "broadcasts");
  assert.equal(cardOpenRoute({ kind: "lead_search", payload: {} }), "clients/leads");
  const done = (undo) => ({ state: "done", receipt: "Finding 50 dentists.", atMs: 1, undo });
  assert.equal(
    cardOpenRoute({ kind: "lead_search", payload: {}, outcome: done({ search_id: ID }) }),
    `clients/leads:s-${ID}`,
    "approved: Open lands on the search the commit made, not on All leads",
  );
  assert.equal(cardOpenRoute({ kind: "lead_search", payload: {}, outcome: done(null) }), "clients/leads");
  assert.equal(
    cardOpenRoute({ kind: "lead_search", payload: {}, outcome: done({ search_id: "" }) }),
    "clients/leads",
    "never a route with a hole in it",
  );
  assert.equal(
    cardOpenRoute({ kind: "lead_search", payload: { plan: {}, amends: { search_id: "s9" } } }),
    leadQuestionRoute("s9"),
    "a card that answers a search opens on that search, on the pile it asked about",
  );
  assert.equal(
    cardOpenRoute({
      kind: "lead_search",
      payload: { plan: {}, amends: { search_id: "s9" } },
      outcome: done({ search_id: ID }),
    }),
    leadQuestionRoute("s9"),
    "and the amended search wins over the outcome's",
  );
  assert.equal(cardOpenRoute({ kind: "thread_verb", payload: { conversation_id: ID } }), `inbox/th-${ID}`);
  for (const k of ["reply", "steer", "whisper", "invite"])
    assert.equal(cardOpenRoute({ kind: k, payload: {} }), null, k);
});

const SEARCH = {
  id: "q-s-s1",
  name: "personal trainers",
  question: "Most of the first 25 are gyms, not trainers. Keep them?",
  to: "clients/leads:s-s1:c-excluded",
};

const waiting = (people, runs = 0, more = 0, searches = []) => ({
  people: people.map((who, i) => ({
    id: `c${i}`,
    kind: "thread",
    who,
    channel: "WhatsApp",
    when: "waited 3d",
    line: "“Can I come at 3?”",
    to: `inbox/th-c${i}`,
  })),
  more,
  runs: Array.from({ length: runs }, (_, i) => ({
    id: `r${i}`,
    label: "Win-back · quiet 30 days",
    reach: 1,
    to: `broadcasts/run:r${i}`,
  })),
  searches,
  windows: [],
});
/** A reply window closing, in the people's row shape. */
const closing = (who, i = 0) => ({
  id: `w${i}`,
  kind: "thread",
  who,
  channel: "WhatsApp",
  when: "closes in 2h",
  line: "",
  to: `inbox/th-w${i}`,
});

test("Right now is Today's queue in a sentence: the people waiting, then the runs waiting for a yes, in English and Spanish", () => {
  assert.equal(rightNowLine(waiting([]), "en"), "Nobody needs you right now.");
  assert.equal(rightNowLine(waiting(["Ana"]), "en"), "Ana needs you.");
  assert.equal(
    rightNowLine(waiting(["Ana", "Sam"], 1), "en"),
    "Ana and Sam need you; a campaign run is waiting for your say.",
  );
  assert.equal(rightNowLine(waiting(["Ana", "Sam", "Lee", "Kai"]), "en"), "Ana, Sam and 2 others need you.");
  // A person reads "campaign", never "playbook" (the moment spec, D19), in both languages.
  assert.equal(rightNowLine(waiting([], 2), "en"), "2 campaign runs are waiting for your say.");
  assert.equal(rightNowLine(waiting([], 1), "es"), "Un envío de campaña espera tu decisión.");
  assert.equal(rightNowLine(waiting([], 2), "es"), "2 envíos de campaña esperan tu decisión.");
  assert.equal(rightNowLine(waiting([]), "es"), "Nadie te espera ahora mismo.");
  assert.equal(rightNowLine(waiting(["Ana", "Sam"]), "es"), "Ana y Sam te esperan.");
  assert.equal(
    rightNowLine(waiting(["A", "B", "C", "D", "E", "F"], 0, 4), "en"),
    "A, B and 8 others need you.",
    "REGRESSION: the queue draws six rows; the people past them wait too",
  );
  assert.equal(
    rightNowLine(null, "en"),
    "Today's queue hasn't been read yet.",
    "REGRESSION: a queue not read yet said nobody was waiting",
  );
  assert.equal(rightNowLine(null, "es"), "La cola de hoy aún no se ha leído.");
});

test("Right now names the one search waiting for an answer, counts several, after the people and the runs", () => {
  assert.equal(
    rightNowLine(waiting(["Ana"], 0, 0, [SEARCH]), "en"),
    "Ana needs you; your search for personal trainers is waiting for your answer.",
  );
  assert.equal(
    rightNowLine(waiting([], 0, 0, [SEARCH, { ...SEARCH, id: "q-s-s2", name: "yoga studios" }]), "en"),
    "2 searches are waiting for your answer.",
  );
  assert.equal(
    rightNowLine(waiting(["Ana"], 1, 0, [SEARCH]), "en"),
    "Ana needs you; a campaign run is waiting for your say; your search for personal trainers is waiting for your answer.",
    "three populations, three clauses, in this order",
  );
  assert.equal(
    rightNowLine(waiting([], 0, 0, [SEARCH]), "es"),
    "Tu búsqueda de personal trainers espera tu respuesta.",
  );
  assert.equal(
    rightNowLine(waiting([], 0, 0, [SEARCH, { ...SEARCH, id: "q-s-s2" }]), "es"),
    "2 búsquedas esperan tu respuesta.",
  );
});

test("rightNowCounts: the people, the runs and the searches the sentence counts; zeros for a queue not read", () => {
  assert.deepEqual(rightNowCounts(null), { people: 0, runs: 0, searches: 0, windows: 0 });
  const w = {
    people: [
      { id: "c1", kind: "thread", who: "Nora", channel: "WhatsApp", when: "2h", line: "", to: "inbox/th-c1" },
      { id: "c2", kind: "call", who: "Emily", channel: "Phone", when: "3d", line: "", to: "conversations/cv-c2" },
    ],
    more: 1,
    runs: [{ id: "r1", label: "Win-back", reach: 1, to: "broadcasts/run:r1" }],
    searches: [SEARCH],
    windows: [closing("Eve")],
  };
  assert.deepEqual(rightNowCounts(w), { people: 3, runs: 1, searches: 1, windows: 1 });
  assert.equal(
    rightNowLine(w, "en"),
    "Nora, Emily and 1 other need you; a campaign run is waiting for your say; your search for personal trainers is waiting for your answer; Eve's reply window is closing.",
  );
});

test("Right now says a reply window closing as a window, never as someone who needs you (S7-8)", () => {
  const one = { ...waiting([]), windows: [closing("Eve")] };
  assert.equal(
    rightNowLine(one, "en"),
    "Eve's reply window is closing.",
    "REGRESSION: a closing window was said as 'Eve needs you', and nobody had asked for a person",
  );
  assert.equal(rightNowLine(one, "es"), "La ventana de respuesta de Eve se está cerrando.");
  const two = { ...waiting(["Ana"]), windows: [closing("Eve"), closing("Bo", 1)] };
  assert.equal(rightNowLine(two, "en"), "Ana needs you; 2 reply windows are closing.");
  assert.equal(rightNowLine(two, "es"), "Ana te espera; 2 ventanas de respuesta se están cerrando.");
  assert.deepEqual(rightNowCounts(two), { people: 1, runs: 0, searches: 0, windows: 2 });
});

test("who needs me: the sentence, then the people, the searches and the runs as their own doors, and the Inbox only for the people past the cap", () => {
  const a = needsAnswer(waiting(["Ana", "Sam"], 1, 0, [SEARCH]), "en");
  assert.equal(a.form, "structured");
  assert.equal(
    a.say.headline,
    "Ana and Sam need you; a campaign run is waiting for your say; your search for personal trainers is waiting for your answer.",
  );
  assert.deepEqual(
    a.show.items.map((i) => [i.title, i.meta, i.line, i.source.to]),
    [
      ["Ana", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c0"],
      ["Sam", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c1"],
      [
        "personal trainers",
        "Leads",
        "Most of the first 25 are gyms, not trainers. Keep them?",
        "clients/leads:s-s1:c-excluded",
      ],
      ["Win-back · quiet 30 days", "Campaign", "1 person", "broadcasts/run:r0"],
    ],
    "the search's door is its question, opened where the answer row is (leadQuestionRoute)",
  );
  assert.equal(a.show.items[2].source.kind, "page", "a search's door is a page, so the Inbox count never includes it");
  assert.equal(a.do.open, null, "each item is already a door");
  assert.equal(needsAnswer(waiting([], 1), "es").show.items[0].line, "1 persona", "a run's reach, in Spanish too");
  assert.equal(needsAnswer(waiting([], 1), "es").show.items[0].meta, "Campaña", "and its word, as a citation's is");
  const esSearch = needsAnswer(waiting([], 0, 0, [SEARCH]), "es");
  assert.equal(esSearch.say.headline, "Tu búsqueda de personal trainers espera tu respuesta.");
  assert.equal(esSearch.show.items[0].meta, "Leads", "a search's door says where it lives, in either language");
  const many = needsAnswer(waiting(["A", "B", "C", "D", "E", "F"], 0, 3), "en");
  assert.equal(many.show.items.length, ASK_ANSWER_CAPS.items);
  assert.deepEqual(
    many.do.open,
    { to: "inbox", label: "See all 9 in the Inbox", now: false },
    "the Inbox, for everyone waiting, not only the six rows drawn",
  );
  assert.equal(answerText(needsAnswer(waiting([]), "en")), "Nobody needs you right now.");
  const unread = needsAnswer(null, "en");
  assert.deepEqual(
    [unread.say.headline, unread.show.items.length, unread.do.open],
    ["Today's queue hasn't been read yet.", 0, { to: "today", label: "Open Today", now: false }],
  );
});

test("did anyone call: today's missed calls by the business's clock as doors, or none with the call on the line; Do opens Live", () => {
  const NOW = Date.parse("2026-09-05T16:00:00Z");
  const calls = [
    { callId: "k1", who: "+1 917 555 0100", missed: true, live: false, startedAtMs: NOW - 3_600_000 },
    { callId: "k2", who: "Old", missed: true, live: false, startedAtMs: NOW - 3 * 86_400_000 },
    { callId: "k3", who: "Live", missed: false, live: true, startedAtMs: NOW },
  ];
  const { missed, live } = callsToday(calls, NOW, "America/New_York");
  assert.deepEqual([missed.map((c) => c.callId), live.map((c) => c.callId)], [["k1"], ["k3"]]);
  const a = callsAnswer(missed, live, "en");
  assert.equal(a.say.headline, "One missed call today.");
  assert.deepEqual(
    a.show.items.map((i) => i.source.to),
    ["conversations/cv-k1"],
  );
  assert.deepEqual(a.do.open, { to: "live", label: "See the calls", now: false });
  const quiet = callsAnswer([], live, "en");
  assert.equal(quiet.say.headline, "No missed calls today; one call is on the line now.");
  assert.deepEqual(quiet.do.open, { to: "live", label: "See the calls", now: false });
  // On the line by the heartbeat (liveStillUp), as Live and the strip count it: the read the palette keeps between
  // refreshes still says `live` of a call the provider went quiet on ten minutes ago, and Ask counted it.
  const quietLine = {
    callId: "k4",
    who: "Gone",
    missed: false,
    live: true,
    startedAtMs: NOW - 900_000,
    heartbeatAtMs: NOW - 600_000,
  };
  assert.deepEqual(
    callsToday([...calls, quietLine], NOW, "America/New_York").live.map((c) => c.callId),
    ["k3"],
    "REGRESSION: a call nobody had heard from in ten minutes was on the line now",
  );
});

test("what is open: the days with open times as items, each a door to its day, said from the days (never the receptionist's instruction); no calendar points at where to connect one", () => {
  const ok = openingsAnswer(
    {
      state: "ok",
      text: "Open times (from the calendar…): Offer up to three of these that fit what they want…",
      days: [
        { key: "2026-09-24", label: "Thursday, September 24", windows: ["9:30–10:30 AM", "4:30–6 PM"] },
        { key: "2026-09-26", label: "Saturday, September 26", windows: [] },
      ],
    },
    "en",
  );
  assert.equal(ok.say.headline, "The calendar has 2 open times on Thursday, September 24.");
  assert.ok(!answerText(ok).includes("Offer"), "the route's words are the receptionist's, not the owner's");
  assert.deepEqual(
    ok.show.items.map((i) => [i.title, i.line, i.source.to]),
    [["Thursday, September 24", "9:30–10:30 AM · 4:30–6 PM", "calendar/2026-09-24"]],
  );
  assert.deepEqual(ok.do.open, { to: "calendar", label: "Open the Calendar", now: false });
  assert.equal(
    openingsAnswer({ state: "ok", days: [] }, "en").say.headline,
    "Nothing is open on the calendar in the days ahead.",
  );
  assert.equal(
    openingsAnswer({ state: "ok", days: [] }, "en", "2026-09-24").say.headline,
    "Nothing is open on the calendar that day.",
    "REGRESSION: the route reads only the day asked about; a full day said the whole calendar was",
  );
  const none = openingsAnswer({ state: "no_calendar", days: [] }, "en");
  assert.equal(none.say.headline, "No calendar is connected, so I can't see open times.");
  // The Business row that connects one, opened: it went to Connections, whose own row then sent the owner on.
  assert.deepEqual(none.do.open, { to: "admin/workspace/calendar", label: "Connect a calendar", now: false });
  // REGRESSION: a business whose bookings arrive by email was told it had no calendar, beside a board that showed
  // them. It is told what it has, and the door is that board.
  const byEmail = openingsAnswer({ state: "no_calendar", days: [], instead: { by: "emails", tool: "Booksy" } }, "en");
  assert.equal(
    byEmail.say.headline,
    "Bookings arrive by email from Booksy and are on the Calendar, but without a calendar link I can't see open times.",
  );
  assert.deepEqual(byEmail.do.open, { to: "calendar", label: "Open the Calendar", now: false });
  const byHand = openingsAnswer({ state: "no_calendar", days: [], instead: { by: "hand" } }, "es");
  assert.equal(byHand.say.headline, "Tomas las reservas tú, así que no hay calendario del que leer horas libres.");
  assert.equal(byHand.do.open.to, "admin/workspace/calendar");
  assert.equal(
    openingsAnswer({ state: "unavailable", days: [] }, "es").say.headline,
    "No se pudo leer el calendario ahora.",
  );
});

test("a quick question is one of three, by its words; the long tail is the model's", () => {
  const NOW = Date.parse("2026-09-05T16:00:00Z");
  assert.deepEqual(askIntent("who needs me right now?", NOW, "America/New_York"), { kind: "needs" });
  assert.deepEqual(askIntent("¿quién me necesita?", NOW, "America/New_York"), { kind: "needs" });
  assert.deepEqual(askIntent("did anyone call while I was busy?", NOW, "America/New_York"), { kind: "calls" });
  assert.deepEqual(askIntent("what's open saturday for a balayage", NOW, "America/New_York"), {
    kind: "openings",
    day: "sat",
    service: "what's open saturday for a balayage",
  });
  assert.equal(askIntent("qué hay libre mañana", NOW, "America/New_York").day, "2026-09-06");
  assert.equal(askIntent("what did the receptionist tell Dani?", NOW, "America/New_York"), null);
});

/* ------------------------------------------------------------ what the model writes */

const C = ASK_ANSWER_CAPS;
const CALL = ID2;
const PERSON = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const UNREAD = "44444444-4444-4444-8444-444444444444";
/** A row as a reader returns it (contracts AskRowRef): where it opens is the reader's to say. */
const ref = (kind, id, route, label = "") => ({ kind, id, route, label });
/** A thread's RowRef, as the Inbox's read gives it. */
const threadRef = (id) => ref("thread", id, `inbox/th-${id}`);
/** The read set holding these rows, each as its reader gave it: a thread, its conversation, a call, a person, and more. */
const reads = (...more) => {
  const read = emptyReadSet();
  noteRows(read, [
    threadRef(ID),
    ref("conversation", ID, `conversations/${ID}`),
    ref("call", CALL, `conversations/cv-${CALL}`),
    ref("person", PERSON, `clients/${PERSON}`),
    ...more,
  ]);
  return read;
};
const NONE = { kind: "none", id: "", label: "" };
const BREAKDOWN = {
  label: "customer messages",
  total: 16,
  parts: [
    { label: "answered", value: 12, warn: false },
    { label: "handed over", value: 3, warn: true },
    { label: "unanswered", value: 1, warn: false },
  ],
  source: { kind: "page", id: "reports", label: "Reports" },
};
/** An answer as the model writes it: every key the format names, every list with an entry. */
const written = (over = {}) => ({
  say: { headline: "Nora and Sam are waiting on you.", detail: "Nora asked about Saturday; Sam's call was missed." },
  show: {
    figures: [
      { value: "2", label: "waiting on you", note: "up from 1", source: { kind: "page", id: "inbox", label: "Inbox" } },
    ],
    items: [
      {
        title: "Nora",
        meta: "WhatsApp · 2h",
        line: "Asked about Saturday.",
        source: { kind: "thread", id: ID, label: "Nora" },
      },
    ],
    breakdown: BREAKDOWN,
    list: { style: "numbers", entries: ["Reply to Nora.", "Call Sam back."] },
  },
  do: {
    open: { source: { kind: "call", id: CALL, label: "Sam's call" }, label: "Open it", now: false },
    next: ["Reply to Nora?"],
  },
  language: "en",
  ...over,
});
const withShow = (show) => written({ show: { ...written().show, ...show } });
const withOpen = (open) => written({ do: { open, next: [] } });
const read1 = (raw, language = "en", set = reads()) => {
  const r = normalizeAnswer(JSON.stringify(raw), set, language);
  assert.equal(r.ok, true, r.error);
  return r;
};
const at = (...path) => path.reduce((s, k) => (k === "[]" ? s.items : s.properties[k]), ASK_ANSWER_FORMAT);

/** The keys and leaf types of a schema, or of a value, as one tree; a list is its first entry's. */
const schemaShape = (s) =>
  s.type === "object"
    ? Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, schemaShape(v)]))
    : s.type === "array"
      ? [schemaShape(s.items)]
      : s.type;
const valueShape = (v) =>
  Array.isArray(v)
    ? [valueShape(v[0])]
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valueShape(x)]))
      : typeof v;

test("the format the model writes: every key required, nothing else allowed, each limit said from the caps, under the gateway's 8,000 characters", () => {
  const walk = (s, path) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, `${path}: nothing else allowed`);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: every key required`);
      for (const [k, v] of Object.entries(s.properties)) walk(v, `${path}.${k}`);
    }
    if (s.type === "array") walk(s.items, `${path}[]`);
  };
  walk(ASK_ANSWER_FORMAT, "answer");
  assert.deepEqual(Object.keys(ASK_ANSWER_FORMAT.properties)[0], "say", "say is written first, so it streams first");
  assert.ok(
    JSON.stringify(ASK_ANSWER_FORMAT).length < 8000,
    "the edge refuses an Ask format of 8,000 characters or more",
  );
  for (const [path, cap] of [
    [["say", "headline"], C.headline],
    [["say", "detail"], C.detail],
    [["show", "figures"], C.figures],
    [["show", "figures", "[]", "value"], C.value],
    [["show", "figures", "[]", "label"], C.label],
    [["show", "figures", "[]", "note"], C.note],
    [["show", "figures", "[]", "source", "label"], C.label],
    [["show", "items"], C.items],
    [["show", "items", "[]", "title"], C.title],
    [["show", "items", "[]", "meta"], C.meta],
    [["show", "items", "[]", "line"], C.line],
    [["show", "breakdown"], C.parts],
    [["show", "breakdown", "label"], C.label],
    [["show", "list", "entries"], C.entries],
    [["show", "list", "entries"], C.entry],
    [["do", "open", "label"], C.label],
    [["do", "next"], C.next],
    [["do", "next"], C.question],
  ])
    assert.match(at(...path).description ?? "", new RegExp(`\\b${cap}\\b`), `${path.join(".")} says ${cap}`);
});

test("the server reads every key the format names: a whole answer as written comes back key for key, its sources with the app's routes", () => {
  assert.deepEqual(valueShape(written()), schemaShape(ASK_ANSWER_FORMAT), "the answer below is the format's shape");
  const r = read1(written());
  assert.equal(r.dropped, 0);
  assert.deepEqual(r.answer, {
    v: 2,
    form: "structured",
    say: { headline: "Nora and Sam are waiting on you.", detail: "Nora asked about Saturday; Sam's call was missed." },
    show: {
      figures: [
        {
          value: "2",
          label: "waiting on you",
          note: "up from 1",
          source: { kind: "page", id: "inbox", label: "Inbox", to: "inbox", door: true },
        },
      ],
      items: [
        {
          title: "Nora",
          meta: "WhatsApp · 2h",
          line: "Asked about Saturday.",
          source: { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}`, door: true },
        },
      ],
      breakdown: { ...BREAKDOWN, source: { kind: "page", id: "reports", label: "Reports", to: "reports", door: true } },
      list: { style: "numbers", entries: ["Reply to Nora.", "Call Sam back."] },
    },
    do: { open: { to: `conversations/cv-${CALL}`, label: "Open the call", now: false }, next: ["Reply to Nora?"] },
    language: "en",
  });
  assert.equal(read1(written({ language: "es" })).answer.language, "es");
  assert.equal(read1(written({ language: "other" }), "es").answer.language, "es", "other is the turn's own");
  assert.equal(read1(written({ language: "fr" }), "es").answer.language, "es", "and so is one the format lacks");
});

test("every string is one line of words without tags, and every string and list is cut to its cap", () => {
  const long = (n) => "word ".repeat(n);
  const threads = Array.from({ length: 7 }, (_, i) => `5555555${i}-5555-4555-8555-555555555555`);
  const a = read1(
    written({
      say: { headline: '<answer>Nora is\n\n waiting.</answer><parameter name="citations">[]', detail: long(400) },
      show: {
        figures: Array.from({ length: 6 }, (_, i) => ({ value: `${i + 1}`, label: long(40), note: "", source: NONE })),
        items: threads.map((id, i) => ({
          title: `Person ${i}`,
          meta: "",
          line: long(60),
          source: { kind: "thread", id, label: `Person ${i}` },
        })),
        breakdown: BREAKDOWN,
      },
      do: { open: { source: NONE, label: "", now: false }, next: ["One?", "Two?", "Three?"] },
    }),
    "en",
    reads(...threads.map(threadRef)),
  ).answer;
  assert.equal(a.say.headline, "Nora is waiting.");
  assert.ok(a.say.detail.length <= C.detail && a.say.detail.endsWith("word…"), "cut on a whole word, and says so");
  assert.equal(a.show.figures.length, C.figures);
  assert.ok(a.show.figures.every((f) => f.label.length <= C.label));
  assert.equal(a.show.items.length, C.items);
  assert.ok(a.show.items.every((i) => i.line.length <= C.line));
  assert.deepEqual(a.do.next, ["One?", "Two?"]);
  assert.equal(a.do.open, null, "kind none is no Open");
});

test("a list is read as the Line draws it: its style one of three (bullets for any other), each entry one point without the bullet or number the model wrote, no emphasis marks, empty entries gone, at most its caps", () => {
  const list = (l) => read1(withShow({ list: l })).answer.show.list;
  assert.deepEqual(
    list({ style: "numbers", entries: ["1. Open Settings.", "2) Paste the link.", "- Save it.", "• **Done**."] }),
    { style: "numbers", entries: ["Open Settings.", "Paste the link.", "Save it.", "Done."] },
  );
  assert.deepEqual(list({ style: "lines", entries: ["thanks", " ", "for"] }), {
    style: "lines",
    entries: ["thanks", "for"],
  });
  assert.deepEqual(
    list({ style: "table", entries: ["a"] }),
    { style: "bullets", entries: ["a"] },
    "a style the format lacks",
  );
  assert.deepEqual(list(undefined), { style: "bullets", entries: [] }, "no list is none");
  // A sign or a count that is the point stays: "-5%" and "3 people" are words, not marks; emoji and capitals are words.
  assert.deepEqual(
    list({ style: "bullets", entries: ["-5% this week", "3 people waiting", "🙂 NEVER A PRICE"] }).entries,
    ["-5% this week", "3 people waiting", "🙂 NEVER A PRICE"],
  );
  const long = list({
    style: "bullets",
    entries: Array.from({ length: 20 }, (_, i) => `point ${i} ${"word ".repeat(60)}`),
  });
  assert.equal(long.entries.length, C.entries);
  assert.ok(long.entries.every((e) => e.length <= C.entry && e.endsWith("…")));
});

test("the detail keeps its lines and the headline is one: spaces run together within a line, one empty line at most between two, markdown's emphasis is the word", () => {
  const say = read1(
    written({
      say: { headline: "Two **people**\nneed you.", detail: "  First   line.\r\n\n\n\nSecond\t line.  \nThird." },
    }),
  ).answer.say;
  assert.deepEqual(say, { headline: "Two people need you.", detail: "First line.\n\nSecond line.\nThird." });
});

test("an answer's words with its list: copy and the history take a line an entry with its mark, a voice an entry a sentence with its number", () => {
  const a = read1(written()).answer;
  const say = "Nora and Sam are waiting on you. Nora asked about Saturday; Sam's call was missed.";
  assert.equal(answerText(a), `${say}\n1. Reply to Nora.\n2. Call Sam back.`);
  assert.equal(answerSpoken(a), `${say} 1. Reply to Nora. 2. Call Sam back.`);
  const shaped = (list, detail = "") => ({
    ...a,
    say: { headline: "Three rules.", detail },
    show: { ...a.show, list },
  });
  const bullets = shaped({ style: "bullets", entries: ["No prices", "No bookings", "No advice"] });
  assert.equal(answerText(bullets), "Three rules.\n• No prices\n• No bookings\n• No advice");
  assert.equal(answerSpoken(bullets), "Three rules. No prices. No bookings. No advice.");
  assert.equal(answerText(shaped({ style: "lines", entries: ["thanks", "for"] })), "Three rules.\nthanks\nfor");
  // A detail's lines are said one after another, each ending as a sentence does.
  assert.equal(answerSpoken(shaped({ style: "bullets", entries: [] }, "Ana\nSam")), "Three rules. Ana. Sam.");
  assert.equal(v1FromAnswer(a).text, answerText(a), "the history's words are the copy's");
  assert.ok(
    answerWords(a).includes("Call Sam back."),
    "a list's words are checked for a figure with no read behind it",
  );
});

test("an answer stored before the list part reads as having none wherever it is read (the store, one door, its words), and one with a list keeps it", () => {
  const kept = read1(written()).answer;
  const show = { ...kept.show };
  delete show.list;
  const old = { ...kept, show };
  assert.deepEqual(storedAnswer(old).show.list, { style: "bullets", entries: [] });
  assert.equal(storedAnswer(kept), kept);
  assert.deepEqual(oneDoor(old).answer.show.list, { style: "bullets", entries: [] });
  assert.deepEqual(oneDoor(kept).answer.show.list, kept.show.list);
  const say = "Nora and Sam are waiting on you. Nora asked about Saturday; Sam's call was missed.";
  assert.equal(answerText(old), say);
  assert.equal(answerSpoken(old), say);
});

test("a source is a row read this turn however the model spelled it, or a page of the app; never a route the model wrote, and never a row not read", () => {
  const open = (source) => read1(withOpen({ source, label: "", now: true })).answer.do.open;
  assert.deepEqual(open({ kind: "call", id: CALL, label: "Sam" }), {
    to: `conversations/cv-${CALL}`,
    label: "Open the call",
    now: true,
  });
  assert.equal(open({ kind: "call", id: `conversations/cv-${CALL}`, label: "Sam" }).to, `conversations/cv-${CALL}`);
  assert.equal(open({ kind: "person", id: `/clients/${PERSON.toUpperCase()}`, label: "Dana" }).to, `clients/${PERSON}`);
  assert.equal(
    open({ kind: "person", id: CALL, label: "Sam" }).to,
    `conversations/cv-${CALL}`,
    "the kind that read it",
  );
  assert.equal(open({ kind: "page", id: `inbox/th-${ID}`, label: "Nora" }).to, `inbox/th-${ID}`, "a row read");
  assert.equal(open({ kind: "page", id: `inbox/th-${UNREAD}`, label: "Someone" }), null, "a row not read, as a page");
  assert.equal(open({ kind: "thread", id: UNREAD, label: "Someone" }), null);
  assert.deepEqual(open({ kind: "page", id: "#/calendar", label: "Calendar" }), {
    to: "calendar",
    label: "Calendar",
    now: true,
  });
  assert.equal(open({ kind: "thread", id: "reports", label: "Reports" }).to, "reports", "a page under a row's kind");
  assert.equal(open({ kind: "page", id: "https://example.com/x", label: "Elsewhere" }), null, "only the app's pages");
  assert.equal(open({ kind: "page", id: "inbox/th-3f2a9c1e", label: "Someone" }), null, "a row's route cut short");
  assert.equal(open({ kind: "person", id: "clients/12ab", label: "Someone" }), null, "is no row read, and no page");
  assert.equal(open({ kind: "page", id: "clients/leads", label: "Leads" }).to, "clients/leads", "a list is a page");
  assert.equal(open({ kind: "page", id: "clients/seg:new_week", label: "New" }).to, "clients/seg:new_week");
  assert.equal(open({ kind: "none", id: CALL, label: "Sam" }), null, "kind none, whatever the id");

  const item = read1(
    withShow({
      items: [
        {
          title: "Nora",
          meta: "",
          line: "",
          source: { kind: "thread", id: ID, label: "Nora", to: "https://example.com" },
        },
      ],
    }),
  ).answer.show.items[0];
  assert.equal(item.source.to, `inbox/th-${ID}`, "a route the model writes is never taken");
});

/* ------------------------------------------------- fifteen names (Ask Rewired, PR 4.2; a visit and a review, 15 Oct) */

const LEAD = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SEARCH_ID = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
const DEAL = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const SAVED = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
const RUN = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";
const PLAYBOOK = "f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6";
const TEMPLATE = "a7a7a7a7-a7a7-4a7a-8a7a-a7a7a7a7a7a7";
const DOMAIN = "b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8";
const VISIT = "c9c9c9c9-c9c9-4c9c-8c9c-c9c9c9c9c9c9";
const REVIEW = "dadadada-dada-4ada-8ada-dadadadadada";
/** One row of each new kind, as its reader returns it: the route is the reader's, never one the grammar derives. */
const NEW_ROWS = [
  ref("lead", LEAD, `clients/leads:s-${SEARCH_ID}:p-${LEAD}`, "Bright Movers"),
  ref("search", SEARCH_ID, `clients/leads:s-${SEARCH_ID}`, "Movers in Queens"),
  ref("deal", DEAL, `clients/${PERSON}`, "Dana's move"),
  ref("list", "quiet", "clients/seg:quiet", "Gone quiet"),
  ref("list", SAVED, `clients/list:${SAVED}`, "Regulars"),
  ref("broadcast", RUN, `broadcasts/run:${RUN}`, "Monday offer"),
  ref("playbook", PLAYBOOK, `outbound/${PLAYBOOK}`, "Win-back"),
  ref("template", TEMPLATE, "messages", "spring_offer"),
  ref("mailbox", DOMAIN, "admin/integrations", "sam@mail.example.com"),
  // 15 Oct 2026: a visit opens on its day with its sheet, and a review on the Reviews lens with its reply box.
  ref("visit", VISIT, `calendar/2026-10-16:a-${VISIT}`, "Dana Example · Thursday, October 16, 3:00 PM"),
  ref("review", REVIEW, `reports/reviews:${REVIEW}`, "Ana P. · ★★★★★"),
];

test("fifteen names: the format's kinds are a page and fourteen rows, and a run is none of them; the format is measured under the edge's 8,000", () => {
  const kinds = at("show", "items", "[]", "source").properties.kind.enum;
  assert.deepEqual(kinds, [...ASK_CITATION_KINDS, "none"], "the format writes the grammar's kinds, and none");
  assert.deepEqual(
    [...ASK_CITATION_KINDS],
    [
      "thread",
      "conversation",
      "call",
      "person",
      "page",
      "lead",
      "search",
      "deal",
      "list",
      "broadcast",
      "playbook",
      "template",
      "mailbox",
      "visit",
      "review",
    ],
  );
  assert.ok(!kinds.includes("run"), "a Broadcasts row is cited as a broadcast; run is its address's word");
  assert.match(at("show", "items", "[]", "source").description, /a run is kind broadcast/);
  // A source is a row read this turn, or one an earlier answer in this thread named (the Phase 5 plan, D5), as the
  // rules say: a model that followed "read this turn" alone would read the row again, or write kind none and lose it.
  const said = at("show", "items", "[]", "source").description;
  assert.match(said, /^A row or a page read this turn \(.*\), or a row an earlier answer in this thread named, with/);
  assert.match(said, /kind none when it rests on nothing read or named\.$/);
  for (const part of [
    ["show", "figures", "[]"],
    ["show", "breakdown"],
    ["do", "open"],
  ])
    assert.deepEqual(at(...part, "source"), at("show", "items", "[]", "source"), `${part.join(".")}: the same source`);
  const size = JSON.stringify(ASK_ANSWER_FORMAT).length;
  assert.ok(size > 5_385 && size < 8_000, `the format is ${size} characters: more than main's 5,385, under 8,000`);
});

test("a row of each new kind a reader returned is kept and opens where the reader said; one not read goes and is counted; a deal opens its person, a People list grounds by its name, a run is cited as a broadcast", () => {
  const set = reads(...NEW_ROWS);
  const item = (source, read = set) => {
    const r = read1(withShow({ items: [{ title: "x", meta: "", line: "", source }] }), "en", read);
    return { source: r.answer.show.items[0]?.source ?? null, dropped: r.dropped };
  };
  for (const row of NEW_ROWS) {
    const kept = item({ kind: row.kind, id: row.id, label: row.label });
    assert.deepEqual(
      kept,
      { source: { kind: row.kind, id: row.id, label: row.label, to: row.route, door: true }, dropped: 0 },
      `a ${row.kind} read opens at its reader's route`,
    );
    assert.deepEqual(
      item({ kind: row.kind, id: row.id, label: row.label }, reads()),
      { source: null, dropped: 1 },
      `a ${row.kind} not read goes, counted`,
    );
  }
  assert.equal(
    item({ kind: "deal", id: DEAL, label: "Dana's move" }).source.to,
    `clients/${PERSON}`,
    "its person's page",
  );
  assert.equal(item({ kind: "list", id: "quiet", label: "Quiet" }).source.to, "clients/seg:quiet", "a name, no uuid");
  assert.deepEqual(item({ kind: "list", id: "nobody_list", label: "x" }), { source: null, dropped: 1 });
  assert.equal(
    item({ kind: "search", id: "quiet", label: "Quiet" }).source.kind,
    "list",
    "a People list's name under another kind is the list that read it",
  );
  assert.deepEqual(
    item({ kind: "broadcast", id: `broadcasts/run:${RUN}`, label: "Monday offer" }).source,
    { kind: "broadcast", id: RUN, label: "Monday offer", to: `broadcasts/run:${RUN}`, door: true },
    "a run spelled by its address is the broadcast",
  );
  assert.deepEqual(
    item({ kind: "run", id: RUN, label: "Monday offer" }),
    { source: null, dropped: 1 },
    "run is no citation's kind: one written goes, counted",
  );
  assert.equal(
    item({ kind: "page", id: `clients/list:${SAVED}`, label: "Regulars" }).source.kind,
    "list",
    "a list's address is its row",
  );
  assert.deepEqual(
    item({ kind: "page", id: `clients/list:${UNREAD}`, label: "x" }),
    { source: null, dropped: 1 },
    "never a page",
  );
  assert.equal(
    item({ kind: "page", id: "clients/seg:new_week", label: "New" }).source.to,
    "clients/seg:new_week",
    "a People list's view is a page",
  );
  for (const cut of ["outbound/12ab", "broadcasts/run:12ab", "clients/leads:s-12ab", "clients/list:12ab"])
    assert.equal(
      item({ kind: "page", id: cut, label: "x" }).source,
      null,
      `${cut}: a row's route cut short is no page`,
    );
  assert.equal(
    item({ kind: "page", id: "clients/leads:l-ready", label: "Ready" }).source.to,
    "clients/leads:l-ready",
    "a Leads view is a page",
  );
  assert.equal(
    item({ kind: "page", id: "broadcasts/get-yes", label: "Get their yes" }).source.to,
    "broadcasts/get-yes",
  );
});

test("REGRESSION (PR 4.2 review): People's page is People, never the built-in list of the same name; a list's own spelling still reaches the list", () => {
  const set = reads(
    ref("list", "clients", "clients/seg:clients", "Clients"),
    ref("list", "quiet", "clients/seg:quiet"),
  );
  const source = (s) =>
    read1(withShow({ items: [{ title: "x", meta: "", line: "", source: s }] }), "en", set).answer.show.items[0]?.source;
  assert.deepEqual(
    source({ kind: "page", id: "clients", label: "People" }),
    { kind: "page", id: "clients", label: "People", to: "clients", door: true },
    "REGRESSION: a page citation of clients grounded as the Clients list, clients/seg:clients",
  );
  assert.equal(
    source({ kind: "list", id: "clients", label: "Clients" }).to,
    "clients/seg:clients",
    "written as the list",
  );
  assert.equal(source({ kind: "page", id: "quiet", label: "Quiet" }).kind, "list", "no page is called quiet");
});

test("REGRESSION (PR 4.2 review): a lead cited by its route on a search's view is the lead, the route's last id; every other spelling grounds as before", () => {
  const LEAD_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a2";
  const SEARCH = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b3";
  const leadRoute = `clients/leads:s-${SEARCH}:p-${LEAD_ID}`;
  const lead = ref("lead", LEAD_ID, leadRoute, "Bright Movers");
  const search = ref("search", SEARCH, `clients/leads:s-${SEARCH}`, "Movers in Queens");
  const grounded = (s, set = reads(lead, search)) =>
    read1(withShow({ items: [{ title: "x", meta: "", line: "", source: s }] }), "en", set).answer.show.items[0]
      ?.source ?? null;
  for (const kind of ["lead", "page"]) {
    const g = grounded({ kind, id: leadRoute, label: "Bright Movers" });
    assert.deepEqual(
      [g?.kind, g?.id, g?.to],
      ["lead", LEAD_ID, leadRoute],
      `REGRESSION: written as a ${kind}, the lead's route grounded as its search, or not at all`,
    );
  }
  assert.equal(grounded({ kind: "lead", id: leadRoute, label: "x" }, reads(search)), null, "a lead not read goes");
  assert.equal(grounded({ kind: "search", id: `clients/leads:s-${SEARCH}`, label: "x" }).kind, "search");
  assert.equal(grounded({ kind: "page", id: `clients/leads:s-${SEARCH}:l-ready`, label: "x" }).kind, "search");
  assert.equal(grounded({ kind: "thread", id: PERSON, label: "x" }).kind, "person", "a person written as a thread");
  assert.equal(grounded({ kind: "page", id: "reports", label: "Reports" }).to, "reports");
  assert.equal(grounded({ kind: "page", id: "outbound/1234", label: "x" }), null, "a playbook's route cut short");
});

test("an item is its row, so one not read goes; a figure keeps its words and loses its receipt; the rows not read are counted", () => {
  const r = read1(
    withShow({
      figures: [
        { value: "", label: "no value", note: "", source: NONE },
        { value: "3", label: "handed over", note: "", source: { kind: "thread", id: UNREAD, label: "Ghost" } },
      ],
      items: [
        { title: "", meta: "", line: "", source: { kind: "thread", id: ID, label: "Nora" } },
        { title: "Ghost", meta: "", line: "", source: { kind: "thread", id: UNREAD, label: "Ghost" } },
        { title: "Nora", meta: "", line: "", source: { kind: "thread", id: ID, label: "Nora" } },
      ],
    }),
  );
  assert.deepEqual(r.answer.show.figures, [{ value: "3", label: "handed over", note: "", source: null }]);
  assert.deepEqual(
    r.answer.show.items.map((i) => i.title),
    ["Nora"],
  );
  assert.equal(r.dropped, 2, "the figure's row and the item's row");
});

test("a breakdown draws only when it says what the whole is and two to four parts add up exactly to its total", () => {
  const b = (breakdown) => read1(withShow({ breakdown })).answer.show.breakdown;
  const part = (label, value) => ({ label, value, warn: false });
  assert.equal(b(BREAKDOWN).parts[1].warn, true);
  assert.equal(b({ ...BREAKDOWN, parts: [...BREAKDOWN.parts, part("spam", 0)] }).parts.length, 4);
  assert.equal(b({ ...BREAKDOWN, total: 17 }), null, "12 + 3 + 1 is not 17");
  assert.equal(b({ ...BREAKDOWN, total: 12, parts: [part("answered", 12)] }), null, "one part is not a breakdown");
  assert.equal(b({ ...BREAKDOWN, parts: [...BREAKDOWN.parts, part("a", 0), part("b", 0)] }), null, "five is too many");
  assert.equal(b({ ...BREAKDOWN, parts: [part("in", 20), part("out", -4)] }), null, "no part below zero");
  assert.equal(b({ ...BREAKDOWN, parts: [part("", 12), part("rest", 4)] }), null, "every part is named");
  assert.equal(b({ ...BREAKDOWN, label: " " }), null, "the whole is named");
  assert.equal(b({ ...BREAKDOWN, total: "16" }), null, "numbers are numbers");
  assert.equal(b({ label: "", total: 0, parts: [], source: NONE }), null, "nothing splits");
  assert.equal(
    b({ ...BREAKDOWN, source: { kind: "person", id: UNREAD, label: "x" } }).source,
    null,
    "a receipt not read",
  );
});

test("no headline is no answer, and neither is text that is not JSON, such as an answer cut off by the cap", () => {
  const full = JSON.stringify(written());
  const cut = normalizeAnswer(full.slice(0, full.length - 40), reads(), "en");
  assert.equal(cut.ok, false);
  assert.match(cut.error, /^not JSON/);
  assert.deepEqual(
    normalizeAnswer(
      JSON.stringify(written({ say: { headline: " <answer></answer> ", detail: "Words." } })),
      reads(),
      "en",
    ),
    { ok: false, error: "no headline" },
  );
  assert.deepEqual(normalizeAnswer("[]", reads(), "en"), { ok: false, error: "no headline" });
  assert.equal(normalizeAnswer(written(), reads(), "en").ok, true, "an object reads as its JSON does");
});

test("Say streams from every prefix of the answer, never backwards, whether say is written first or last, drawn as the final draws it: a line the preview shows is a line the answer keeps", () => {
  const w = written({ say: { headline: 'Sí: Nora said "yes" \\ twice.', detail: "Tab\there; line\nbreak." } });
  const { say: asWritten, ...rest } = w;
  // The answer as it lands: spaces run together within a line, the line break kept (15 Oct: the final folded it away).
  const say = read1(w).answer.say;
  assert.deepEqual(say, { headline: asWritten.headline, detail: "Tab here; line\nbreak." });
  const escaped = (s) => s.replace("í", "\\u00ed");
  for (const text of [escaped(JSON.stringify(w)), escaped(JSON.stringify({ ...rest, say: asWritten }))]) {
    const from = text.indexOf('"say"') + '"say"'.length;
    let prev = { headline: "", detail: "" };
    for (let i = 0; i <= text.length; i++) {
      const p = partialSay(text.slice(0, i));
      if (i < from) {
        assert.equal(p, null, `nothing before say, at ${i}`);
        continue;
      }
      assert.ok(say.headline.startsWith(p.headline), `headline at ${i}: ${JSON.stringify(p.headline)}`);
      assert.ok(say.detail.startsWith(p.detail), `detail at ${i}: ${JSON.stringify(p.detail)}`);
      assert.ok(p.headline.length >= prev.headline.length && p.detail.length >= prev.detail.length, `at ${i}`);
      prev = p;
    }
    assert.deepEqual(partialSay(text), say);
  }
});

test("cards only: the cards are the Do, said in a sentence, in English and Spanish", () => {
  const one = answerForCards([{ title: "Send Nora the Saturday times" }], "en", null);
  assert.equal(one.form, "structured");
  assert.equal(one.say.headline, "One card to review: Send Nora the Saturday times.");
  assert.equal(one.say.detail, "Approve it, change it or dismiss it: nothing happens until you do.");
  assert.deepEqual([one.show.items, one.show.figures, one.do.open, one.do.next], [[], [], null, []]);
  assert.equal(
    answerForCards([{ title: "Move Sam to Friday?" }], "en", null).say.headline,
    "One card to review: Move Sam to Friday?",
  );
  const es = answerForCards([{ title: "a" }, { title: "b" }], "es", null);
  assert.equal(es.say.headline, "2 tarjetas para revisar.");
  // Several cards are several presses (the moment spec, A7): a setup's cards are each approved apart.
  assert.equal(
    es.say.detail,
    "Cada una se aprueba por separado: apruébala, cámbiala o descártala; nada pasa hasta que lo hagas.",
  );
  assert.equal(
    answerForCards([{ title: "a" }, { title: "b" }], "en", null).say.detail,
    "Each is its own press: approve, change or dismiss each one; nothing happens until you do.",
  );
  assert.equal(es.language, "es");
});

test("a plan's cards are said as a plan (the marketing manager's spec §5.8): every card a step, as each card's head counts them, and how many send nothing and how many send, in English and Spanish; cards of no one plan are counted as cards", () => {
  const stamp = (step, silent, id = "plan-1") => ({
    title: `Step ${step}`,
    plan: { id, step, of: 6, silent, after: silent ? [] : [1, 2, 3, 4] },
  });
  const six = [1, 2, 3, 4].map((n) => stamp(n, true)).concat([stamp(5, false), stamp(6, false)]);
  const en = answerForCards(six, "en", null);
  // "Step 6 of 6" on the last card, and six steps in the headline above it.
  assert.equal(en.say.headline, "A plan of 6 steps to review: 4 send nothing, then 2 send.");
  assert.equal(
    en.say.detail,
    "The steps that send nothing are approved with one press; each send is its own press once the steps it waits for are done. Nothing happens until you do.",
  );
  const es = answerForCards(six, "es", null);
  assert.equal(es.say.headline, "Un plan de 6 pasos para revisar: 4 no envían nada y luego 2 envían.");
  assert.equal(
    es.say.detail,
    "Los pasos que no envían nada se aprueban con un toque; cada envío se aprueba aparte cuando estén hechos los pasos que espera. Nada pasa hasta que lo hagas.",
  );
  assert.equal(
    answerForCards([stamp(1, true), stamp(2, false)], "en", null).say.headline,
    "A plan of 2 steps to review: 1 sends nothing, then 1 sends.",
  );
  assert.equal(
    answerForCards([stamp(1, true), stamp(2, false)], "es", null).say.headline,
    "Un plan de 2 pasos para revisar: 1 no envía nada y luego 1 envía.",
  );
  // Steps that all send (no plan stamps such cards since D3, but the count holds): no "send nothing" part, and each is
  // its own press, as several cards are.
  const sends = answerForCards([stamp(1, false), stamp(2, false), stamp(3, false)], "en", null);
  assert.equal(sends.say.headline, "A plan of 3 steps to review: 3 send.");
  assert.equal(sends.say.detail, answerForCards([{ title: "a" }, { title: "b" }], "en", null).say.detail);
  // A plan of steps that send nothing alone says nothing of sends.
  const quiet = [stamp(1, true), stamp(2, true)];
  assert.deepEqual(
    [answerForCards(quiet, "en", null).say.headline, answerForCards(quiet, "en", null).say.detail],
    [
      "A plan of 2 steps to review: 2 send nothing.",
      "The steps that send nothing are approved with one press. Nothing happens until you do.",
    ],
  );
  assert.deepEqual(
    [answerForCards(quiet, "es", null).say.headline, answerForCards(quiet, "es", null).say.detail],
    [
      "Un plan de 2 pasos para revisar: 2 no envían nada.",
      "Los pasos que no envían nada se aprueban con un toque. Nada pasa hasta que lo hagas.",
    ],
  );
  // Not one plan's cards: a card of no plan beside it, or two plans, are cards.
  assert.equal(answerForCards([...six, { title: "Reply to Nora" }], "en", null).say.headline, "7 cards to review.");
  assert.equal(
    answerForCards([stamp(1, true), stamp(2, false, "plan-2")], "en", null).say.headline,
    "2 cards to review.",
  );
});

test("a round that made a plan answers with the plan's words as its detail, in place of the press sentence: stamped or not (a setup with no silent step, D3), in English in a Spanish answer (Task 18), cut on a whole word at the detail's cap", () => {
  const stamp = (step, silent) => ({
    title: `Step ${step}`,
    plan: { id: "plan-1", step, of: 3, silent, after: silent ? [] : [1, 2] },
  });
  const words =
    "Pauses the month's offer, “This month's offer”, from when you approve it, so nobody gets two offers; resume it after Nov 30.";
  const plan = answerForCards([stamp(1, true), stamp(2, true), stamp(3, false)], "en", words);
  assert.deepEqual(
    [plan.say.headline, plan.say.detail],
    ["A plan of 3 steps to review: 2 send nothing, then 1 sends.", words],
  );
  // A setup's campaigns, unstamped: counted as cards, the plan's words their detail.
  const setup = answerForCards([{ title: "a" }, { title: "b" }, { title: "c" }], "en", "Starts 3 campaigns.");
  assert.deepEqual([setup.say.headline, setup.say.detail], ["3 cards to review.", "Starts 3 campaigns."]);
  // A Spanish answer counts in Spanish and carries the plan's words as the plan says them.
  const es = answerForCards([stamp(1, true), stamp(2, true), stamp(3, false)], "es", words);
  assert.deepEqual(
    [es.say.headline, es.say.detail],
    ["Un plan de 3 pasos para revisar: 2 no envían nada y luego 1 envía.", words],
  );
  // Words past the detail's cap end on a whole word, with an ellipsis, within it.
  const long = Array.from({ length: 250 }, (_, i) => `word${i}`).join(" ");
  assert.ok(long.length > ASK_ANSWER_CAPS.detail, "longer than the detail holds");
  const cut = answerForCards([stamp(1, true), stamp(3, false)], "en", long).say.detail;
  assert.ok(cut.length <= ASK_ANSWER_CAPS.detail, `${cut.length}`);
  assert.ok(cut.endsWith("…") && long.startsWith(cut.slice(0, -1)), cut);
  assert.match(cut, /word\d+…$/, "cut after a whole word");
});

test("a turn that could not be answered says why as its headline; words the format could not shape are prose", () => {
  assert.deepEqual(failedAnswer("The answer took too long. Ask again.", "en"), {
    v: 2,
    form: "structured",
    say: { headline: "The answer took too long. Ask again.", detail: "" },
    show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
    do: { open: null, next: [] },
    language: "en",
  });
  const p = proseAnswer("<answer>Nora is waiting.\nSam called twice.</answer>", "es");
  assert.deepEqual(
    [p.form, p.say.headline, p.say.detail, p.language],
    ["prose", "", "Nora is waiting.\nSam called twice.", "es"],
  );
  assert.equal(answerText(p), "Nora is waiting.\nSam called twice.");
  assert.equal(proseAnswer("x".repeat(3000), "en").say.detail.length, 1500);
});

test("every word an answer says is checked for a figure with no read behind it", () => {
  const words = answerWords(read1(written()).answer);
  for (const s of [
    "Nora and Sam are waiting",
    "Sam's call was missed",
    "up from 1",
    "Asked about",
    "handed over",
    "16",
  ])
    assert.ok(words.includes(s), s);
});

test("the v1 fields a v2 answer is stored beside: its words, each place it rests on once with its route, Open as navigate, next as the follow-ups; read back as the same answer's", () => {
  const a = read1(
    written({
      show: {
        figures: [{ value: "2", label: "waiting", note: "", source: { kind: "thread", id: ID, label: "Nora" } }],
        items: [
          { title: "Nora", meta: "", line: "", source: { kind: "thread", id: ID, label: "Nora" } },
          { title: "Dana", meta: "", line: "", source: { kind: "person", id: PERSON, label: "Dana" } },
        ],
        breakdown: BREAKDOWN,
      },
      do: {
        open: { source: { kind: "call", id: CALL, label: "Sam" }, label: "", now: true },
        next: ["Reply to Nora?"],
      },
    }),
  ).answer;
  const v = v1FromAnswer(a);
  assert.equal(v.text, "Nora and Sam are waiting on you. Nora asked about Saturday; Sam's call was missed.");
  assert.deepEqual(v.citations, [
    { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}` },
    { kind: "person", id: PERSON, label: "Dana", to: `clients/${PERSON}` },
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
  ]);
  assert.deepEqual(v.navigate, { to: `conversations/cv-${CALL}`, label: "Open the call", now: true });
  assert.deepEqual(v.followups, ["Reply to Nora?"]);

  const back = answerFromV1({ ...v, language: a.language });
  assert.equal(answerText(back), v.text);
  assert.deepEqual(
    back.show.items.map((i) => i.source.to),
    [`inbox/th-${ID}`, `clients/${PERSON}`],
  );
  assert.deepEqual(back.do.open, v.navigate);
  assert.deepEqual(back.do.next, v.followups);

  const threads = Array.from({ length: 5 }, (_, i) => `6666666${i}-6666-4666-8666-666666666666`);
  const many = read1(
    withShow({
      items: threads.map((id) => ({ title: "x", meta: "", line: "", source: { kind: "thread", id, label: "x" } })),
      figures: ["today", "live", "calendar"].map((id) => ({
        value: "1",
        label: "",
        note: "",
        source: { kind: "page", id, label: id },
      })),
    }),
    "en",
    reads(...threads.map(threadRef)),
  ).answer;
  assert.equal(v1FromAnswer(many).citations.length, ASK_CAPS.citations);
});

test("a write claimed is one predicate (the moment spec, A4): what the eval judged, the loop now catches; a quote claims nothing", () => {
  for (const said of [
    "I've set up your win-back.",
    "I started the follow-up for you.",
    "I paused it.",
    "I have resumed the offer.",
    "I renamed it to Past clients.",
    "I turned on the reminder.",
    "I've scheduled it for 9am.",
    "He configurado tus campañas.",
    "He pausado la campaña.",
    "I sent it.",
  ])
    assert.equal(claimsWrite(said), true, said);
  for (const said of [
    "Two cards to review: a win-back and a follow-up.",
    "Once you approve it, it starts running.",
    "The card is waiting for your approval.",
    'Here is the reply, ready to approve: "I\'ve set up your visit."',
  ])
    assert.equal(claimsWrite(said), false, said);
});
