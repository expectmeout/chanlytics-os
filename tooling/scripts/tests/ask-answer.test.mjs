/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): every
 * answer made today read back in the prose form, one door per place, and the three quick answers from Today's queue.
 * Run on the contract itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_ANSWER_CAPS,
  answerFromV1,
  answerText,
  askIntent,
  callsAnswer,
  callsToday,
  cardOpenRoute,
  needsAnswer,
  oneDoor,
  openingsAnswer,
  rightNowLine,
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

test("a card's Open is the contract's: its page, the person's, or none, never a route with a hole in it", () => {
  assert.equal(cardOpenRoute({ kind: "settings", payload: {} }), "admin/workspace");
  assert.equal(cardOpenRoute({ kind: "policy", payload: {} }), "admin/autonomy");
  assert.equal(cardOpenRoute({ kind: "deal", payload: { contact_id: ID } }), `clients/${ID}`);
  assert.equal(cardOpenRoute({ kind: "deal", payload: {} }), null, "REGRESSION: it opened clients/undefined");
  assert.equal(cardOpenRoute({ kind: "broadcast", payload: {} }), "broadcasts");
  assert.equal(cardOpenRoute({ kind: "lead_search", payload: {} }), "clients/leads");
  assert.equal(cardOpenRoute({ kind: "thread_verb", payload: { conversation_id: ID } }), `inbox/th-${ID}`);
  for (const k of ["reply", "steer", "whisper", "invite"])
    assert.equal(cardOpenRoute({ kind: k, payload: {} }), null, k);
});

const waiting = (people, runs = 0) => ({
  people: people.map((who, i) => ({
    id: `c${i}`,
    kind: "thread",
    who,
    channel: "WhatsApp",
    when: "waited 3d",
    line: "“Can I come at 3?”",
    to: `inbox/th-c${i}`,
  })),
  runs: Array.from({ length: runs }, (_, i) => ({
    id: `r${i}`,
    label: "Win-back · quiet 30 days",
    line: "1 person. Nothing sends until you say so.",
    to: `broadcasts/run:r${i}`,
  })),
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
});

test("who needs me: the sentence, then the people and the runs as their own doors, and the Inbox only for the people past the cap", () => {
  const a = needsAnswer(waiting(["Ana", "Sam"], 1), "en");
  assert.equal(a.form, "structured");
  assert.equal(a.say.headline, "Ana and Sam are waiting on you; one playbook run is waiting for your approval.");
  assert.deepEqual(
    a.show.items.map((i) => [i.title, i.meta, i.line, i.source.to]),
    [
      ["Ana", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c0"],
      ["Sam", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c1"],
      ["Win-back · quiet 30 days", "Playbook", "1 person. Nothing sends until you say so.", "broadcasts/run:r0"],
    ],
  );
  assert.equal(a.do.open, null, "each item is already a door");
  const many = needsAnswer(waiting(["A", "B", "C", "D", "E", "F", "G"]), "en");
  assert.equal(many.show.items.length, ASK_ANSWER_CAPS.items);
  assert.deepEqual(many.do.open, { to: "inbox", label: "See all 7 in the Inbox", now: false });
  assert.equal(answerText(needsAnswer(waiting([]), "en")), "Nobody is waiting on you right now.");
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
