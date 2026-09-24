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
  answerForCards,
  answerFromV1,
  answerText,
  answerWords,
  askIntent,
  callsAnswer,
  callsToday,
  cardOpenRoute,
  failedAnswer,
  leadQuestionRoute,
  needsAnswer,
  normalizeAnswer,
  oneDoor,
  openingsAnswer,
  partialSay,
  proseAnswer,
  rightNowCounts,
  rightNowLine,
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
});

test("Right now is Today's queue in a sentence: the people waiting, then the runs waiting for a yes, in English and Spanish", () => {
  assert.equal(rightNowLine(waiting([]), "en"), "Nobody is waiting on you right now.");
  assert.equal(rightNowLine(waiting(["Ana"]), "en"), "Ana is waiting on you.");
  assert.equal(
    rightNowLine(waiting(["Ana", "Sam"], 1), "en"),
    "Ana and Sam are waiting on you; one playbook run is waiting for your approval.",
  );
  assert.equal(rightNowLine(waiting(["Ana", "Sam", "Lee", "Kai"]), "en"), "Ana, Sam and 2 others are waiting on you.");
  assert.equal(rightNowLine(waiting([], 2), "en"), "2 playbook runs are waiting for your approval.");
  assert.equal(rightNowLine(waiting([]), "es"), "Nadie te espera ahora mismo.");
  assert.equal(rightNowLine(waiting(["Ana", "Sam"]), "es"), "Ana y Sam te esperan.");
  assert.equal(
    rightNowLine(waiting(["A", "B", "C", "D", "E", "F"], 0, 4), "en"),
    "A, B and 8 others are waiting on you.",
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
    "Ana is waiting on you; your search for personal trainers is waiting for your answer.",
  );
  assert.equal(
    rightNowLine(waiting([], 0, 0, [SEARCH, { ...SEARCH, id: "q-s-s2", name: "yoga studios" }]), "en"),
    "2 searches are waiting for your answer.",
  );
  assert.equal(
    rightNowLine(waiting(["Ana"], 1, 0, [SEARCH]), "en"),
    "Ana is waiting on you; one playbook run is waiting for your approval; your search for personal trainers is waiting for your answer.",
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
  assert.deepEqual(rightNowCounts(null), { people: 0, runs: 0, searches: 0 });
  const w = {
    people: [
      { id: "c1", kind: "thread", who: "Nora", channel: "WhatsApp", when: "2h", line: "", to: "inbox/th-c1" },
      { id: "c2", kind: "call", who: "Emily", channel: "Phone", when: "3d", line: "", to: "conversations/cv-c2" },
    ],
    more: 1,
    runs: [{ id: "r1", label: "Win-back", reach: 1, to: "broadcasts/run:r1" }],
    searches: [SEARCH],
  };
  assert.deepEqual(rightNowCounts(w), { people: 3, runs: 1, searches: 1 });
  assert.equal(
    rightNowLine(w, "en"),
    "Nora, Emily and 1 other are waiting on you; one playbook run is waiting for your approval; your search for personal trainers is waiting for your answer.",
  );
});

test("who needs me: the sentence, then the people, the searches and the runs as their own doors, and the Inbox only for the people past the cap", () => {
  const a = needsAnswer(waiting(["Ana", "Sam"], 1, 0, [SEARCH]), "en");
  assert.equal(a.form, "structured");
  assert.equal(
    a.say.headline,
    "Ana and Sam are waiting on you; one playbook run is waiting for your approval; your search for personal trainers is waiting for your answer.",
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
      ["Win-back · quiet 30 days", "Playbook", "1 person", "broadcasts/run:r0"],
    ],
    "the search's door is its question, opened where the answer row is (leadQuestionRoute)",
  );
  assert.equal(a.show.items[2].source.kind, "page", "a search's door is a page, so the Inbox count never includes it");
  assert.equal(a.do.open, null, "each item is already a door");
  assert.equal(needsAnswer(waiting([], 1), "es").show.items[0].line, "1 persona", "a run's reach, in Spanish too");
  const many = needsAnswer(waiting(["A", "B", "C", "D", "E", "F"], 0, 3), "en");
  assert.equal(many.show.items.length, ASK_ANSWER_CAPS.items);
  assert.deepEqual(
    many.do.open,
    { to: "inbox", label: "See all 9 in the Inbox", now: false },
    "the Inbox, for everyone waiting, not only the six rows drawn",
  );
  assert.equal(answerText(needsAnswer(waiting([]), "en")), "Nobody is waiting on you right now.");
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
  assert.equal(none.do.open.to, "admin/integrations");
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
const reads = (over = {}) => ({
  thread: new Set([ID]),
  conversation: new Set([ID]),
  call: new Set([CALL]),
  person: new Set([PERSON]),
  ...over,
});
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
    reads({ thread: new Set(threads) }),
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

test("Say streams from every prefix of the answer, never backwards, whether say is written first or last", () => {
  const w = written({ say: { headline: 'Sí: Nora said "yes" \\ twice.', detail: "Tab\there; line\nbreak." } });
  const { say, ...rest } = w;
  const escaped = (s) => s.replace("í", "\\u00ed");
  for (const text of [escaped(JSON.stringify(w)), escaped(JSON.stringify({ ...rest, say }))]) {
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
  const one = answerForCards([{ title: "Send Nora the Saturday times" }], "en");
  assert.equal(one.form, "structured");
  assert.equal(one.say.headline, "One card to review: Send Nora the Saturday times.");
  assert.equal(one.say.detail, "Approve it, change it or dismiss it: nothing happens until you do.");
  assert.deepEqual([one.show.items, one.show.figures, one.do.open, one.do.next], [[], [], null, []]);
  assert.equal(
    answerForCards([{ title: "Move Sam to Friday?" }], "en").say.headline,
    "One card to review: Move Sam to Friday?",
  );
  const es = answerForCards([{ title: "a" }, { title: "b" }], "es");
  assert.equal(es.say.headline, "2 tarjetas para revisar.");
  assert.equal(es.say.detail, "Aprueba, cambia o descarta cada una: nada pasa hasta que lo hagas.");
  assert.equal(es.language, "es");
});

test("a turn that could not be answered says why as its headline; words the format could not shape are prose", () => {
  assert.deepEqual(failedAnswer("The answer took too long. Ask again.", "en"), {
    v: 2,
    form: "structured",
    say: { headline: "The answer took too long. Ask again.", detail: "" },
    show: { figures: [], items: [], breakdown: null },
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
    reads({ thread: new Set(threads) }),
  ).answer;
  assert.equal(v1FromAnswer(many).citations.length, ASK_CAPS.citations);
});
