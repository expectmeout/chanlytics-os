/**
 * What was brought in (decision 0073, R23; contracts imports/ledger.ts), as each page says it: a line per source with
 * where it stands (the first run's "Bringing it in", Today's "Brought in"), Connections' notes on each row, Meta's three
 * parts of the kept app's chats, Today's card and how long it stays. Everything brought is before Chanlytics: said, never
 * counted as today's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_STOPPED_WORDS,
  MAILBOX_LEFT_ROW,
  broughtInCardOf,
  broughtInShown,
  dayWords,
  importLineOf,
  importLinesOf,
  importNotesOf,
  whatsappPartsOf,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-07T15:00:00Z");
const DAY = 86_400_000;
/** A ledger row, every column the page reads, as the table keeps it. */
const row = (source, state = "done", counts = {}, over = {}) => ({
  source,
  state,
  counts,
  parts_done: state === "done" ? 1 : 0,
  parts_total: 1,
  oldest: null,
  started_at: "2026-09-07T14:00:00Z",
  finished_at: state === "done" ? "2026-09-07T14:05:00Z" : null,
  last_error: null,
  via: null,
  ...over,
});

test("a source's line says what came and how far back, in its own words, and where it stands", () => {
  const back = dayWords("2026-03-07T00:00:00Z");
  assert.deepEqual(
    importLineOf(row("google_reviews", "done", { reviews: 212, unanswered: 9 }, { oldest: "2026-03-07T00:00:00Z" })),
    {
      source: "google_reviews",
      title: "Reviews",
      says: `212 reviews · since ${back} · 9 wait for a reply`,
      stand: "In",
      state: "done",
      retry: false,
      share: null,
      aside: null,
      door: "reports/reviews",
      asideDoor: null,
      count: 212,
    },
  );
  assert.equal(
    importLineOf(row("calendar", "done", { past: 412, coming: 9 })).says,
    "412 past appointments · 9 coming up",
  );
  assert.equal(
    importLineOf(row("calendar", "done", { past: 0, coming: 0 })).says,
    "No past appointments",
    "a calendar with nothing before today says so in words, never a bare 0",
  );
  assert.equal(importLineOf(row("calendar", "done", { past: 1, coming: 2 })).says, "1 past appointment · 2 coming up");
  assert.equal(
    importLineOf(row("clients_file", "done", { people: 640 }, { via: "vagaro" })).says,
    "640 people · from Vagaro's file",
  );
  assert.equal(importLineOf(row("clients_file", "done", { people: 1 })).says, "1 person · from your file");
  assert.equal(
    importLineOf(row("contacts", "done", { people: 2490 }, { via: "google" })).says,
    "2,490 people · Google",
  );
  assert.equal(
    importLineOf(row("mailbox", "running", { messages: 300, dropped: 1200 }, { oldest: "2026-03-07T00:00:00Z" })).says,
    `300 emails so far · since ${back}`,
  );
  assert.equal(
    importLineOf(row("mailbox", "done", { messages: 96, dropped: 4, unreadable: 1 })).says,
    "96 emails · 1 couldn't be read",
    "a message the mailbox refused to hand over, counted apart",
  );
  assert.equal(importLineOf(row("mailbox", "running", {})).says, "Reading your inbox");
  assert.equal(importLineOf(row("mailbox", "done", { dropped: 3 })).says, "No email from people");
  assert.equal(importLineOf(row("whatsapp_contacts", "done", { people: 30 })).says, "30 people");
  assert.equal(importLineOf(row("whatsapp_history", "running")).says, "Chats from the last six months");
  assert.equal(
    importLineOf(row("whatsapp_history", "running", {}, { oldest: "2026-03-07T00:00:00Z" })).says,
    `Back to ${back} so far`,
  );
  // Before anything came: what it is reading.
  assert.equal(importLineOf(row("google_reviews", "running")).says, "Reading them");
  assert.equal(importLineOf(row("calendar", "queued")).says, "Reading your calendar");
  assert.equal(importLineOf(row("calendar", "queued")).stand, "Starting");
});

test("what the mailbox set aside is said apart, under its line, and only for the mailbox", () => {
  assert.equal(
    importLineOf(row("mailbox", "done", { messages: 414, dropped: 195 })).aside,
    "195 newsletters and notices set aside",
  );
  assert.equal(
    importLineOf(row("mailbox", "running", { messages: 3, dropped: 1200 })).aside,
    "1,200 newsletters and notices set aside",
  );
  assert.equal(importLineOf(row("mailbox", "done", { messages: 4 })).aside, null, "nothing set aside: no line");
  assert.equal(
    importLineOf(row("mailbox", "failed", { messages: 130, dropped: 111 })).aside,
    null,
    "stopped: the line says what it kept and Try again, nothing more",
  );
  assert.equal(importLineOf(row("contacts", "done", { people: 4, dropped: 2 })).aside, null);
});

test("each line opens the page what it brought is on, and what the mailbox set aside opens where it is listed", () => {
  const doorOf = (source, state = "done", counts = {}) => importLineOf(row(source, state, counts)).door;
  assert.equal(doorOf("calendar"), "calendar");
  assert.equal(doorOf("contacts"), "clients", "People");
  assert.equal(doorOf("clients_file"), "clients");
  assert.equal(doorOf("whatsapp_contacts"), "clients");
  assert.equal(doorOf("mailbox"), "inbox");
  assert.equal(doorOf("whatsapp_history"), "inbox");
  assert.equal(doorOf("google_reviews"), "reports/reviews", "the Reviews lens");
  assert.equal(doorOf("mailbox", "failed"), "inbox", "a stopped line still opens what it kept");
  const mail = importLineOf(row("mailbox", "done", { messages: 414, dropped: 195 }));
  assert.equal(mail.asideDoor, "admin/integrations/left", "Connections, with Left in your mailbox open");
  assert.equal(MAILBOX_LEFT_ROW, "left", "the row Settings' address names (settings/frame/tabs.ts)");
  assert.equal(importLineOf(row("mailbox", "done", { messages: 4 })).asideDoor, null, "nothing set aside: no door");
});

test("a line's count is the number its words open with, for a page to let glide; none where they open with words", () => {
  const countOf = (source, state, counts, over) => importLineOf(row(source, state, counts, over));
  for (const [line, n] of [
    [countOf("mailbox", "running", { messages: 214 }), 214],
    [countOf("mailbox", "done", { messages: 4140 }), 4140],
    [countOf("contacts", "done", { people: 249 }, { via: "google" }), 249],
    [countOf("google_reviews", "done", { reviews: 1284 }), 1284],
    [countOf("calendar", "done", { past: 12, coming: 3 }), 12],
  ]) {
    assert.equal(line.count, n);
    assert.ok(line.says.startsWith(`${n.toLocaleString("en-US")} `), `${line.says} opens with ${n}`);
  }
  assert.equal(countOf("calendar", "done", { past: 0 }).count, null, "No past appointments");
  assert.equal(countOf("mailbox", "running", {}).count, null, "Reading your inbox");
  assert.equal(countOf("mailbox", "failed", { messages: 130 }).count, null, "Stopped part way · 130 emails kept");
  assert.equal(countOf("whatsapp_history", "running", {}, { oldest: "2026-03-07T00:00:00Z" }).count, null);
});

test("how far a run has come: the mailbox by how far back it has read of its six months, never whole before it is in", () => {
  const started = "2026-10-27T00:37:00Z";
  const mail = (oldest, state = "running") =>
    importLineOf(row("mailbox", state, { messages: 214 }, { started_at: started, oldest, parts_total: null }));
  const at = mail("2026-07-01T00:00:00Z");
  const days = (Date.parse(started) - Date.parse("2026-07-01T00:00:00Z")) / DAY;
  assert.ok(Math.abs(at.share - days / 180) < 1e-9, `read back ${days} of 180 days: ${at.share}`);
  assert.equal(at.stand, "66%");
  assert.equal(mail(null).share, null, "nothing kept yet: nothing to say how far");
  assert.equal(mail(null).stand, "…");
  assert.equal(mail("2026-01-01T00:00:00Z").share, 0.99, "past the six months it reaches: never 100 before it is in");
  assert.equal(mail("2026-07-01T00:00:00Z", "done").share, null, "in: the tick says it");
  assert.equal(importLineOf(row("contacts", "running")).share, null, "a source with one part says nothing of how far");
});

test("where a run stands: Meta's three parts as parts, a mailbox's pages as a share that never says 100 before it is in", () => {
  const chats = importLineOf(row("whatsapp_history", "running", {}, { parts_done: 2, parts_total: 3 }));
  assert.deepEqual([chats.stand, Math.round(chats.share * 100)], ["2 of 3", 67]);
  assert.equal(importLineOf(row("mailbox", "running", {}, { parts_done: 3, parts_total: 5 })).stand, "60%");
  assert.equal(importLineOf(row("mailbox", "running", {}, { parts_done: 199, parts_total: 200 })).stand, "99%");
  assert.equal(importLineOf(row("contacts", "running")).stand, "…", "one part: nothing to count");
});

test("a run that stopped says why, offers Try again -- except what Meta offers once, while the number connects", () => {
  const stopped = importLineOf(row("mailbox", "failed", {}, { last_error: IMPORT_STOPPED_WORDS.signedOut }));
  assert.deepEqual([stopped.says, stopped.stand, stopped.retry], [IMPORT_STOPPED_WORDS.signedOut, "Stopped", true]);
  for (const once of ["whatsapp_contacts", "whatsapp_history"]) {
    const l = importLineOf(row(once, "failed", {}, { last_error: IMPORT_STOPPED_WORDS.offeredOnce }));
    assert.equal(l.retry, false, `${once}: no Try again Meta would refuse`);
    assert.equal(l.says, IMPORT_STOPPED_WORDS.offeredOnce);
  }
  assert.equal(
    importLineOf(row("mailbox", "failed", { messages: 130, dropped: 111 }, { last_error: IMPORT_STOPPED_WORDS.failed }))
      .says,
    "Stopped part way · 130 emails kept",
    "stopped part way: said with what it kept, never the run's sentence in place of it",
  );
  assert.equal(importLineOf(row("calendar", "failed")).says, "Stopped part way", "no words of its own, nothing kept");
  assert.equal(
    importLineOf(row("contacts", "failed", { people: 12 }, { last_error: IMPORT_STOPPED_WORDS.failed })).says,
    "Stopped part way · 12 people kept",
  );
});

test("Bringing it in: a line a source in the order they are said, WhatsApp's waiting line where it was chosen, and the count", () => {
  const rows = [
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
    row("mailbox", "done", { messages: 300 }),
    row("google_reviews", "done", { reviews: 212 }),
  ];
  const got = importLinesOf(rows);
  assert.deepEqual(
    got.lines.map((l) => l.source),
    ["google_reviews", "mailbox", "whatsapp_history"],
    "what came first, then what is still coming",
  );
  assert.deepEqual([got.done, got.of, got.running], [2, 3, true]);
  // WhatsApp chosen and not started: it starts at Go live, said as waiting.
  const waiting = importLinesOf([row("google_reviews", "done", { reviews: 3 })], { whatsappWaiting: true });
  assert.deepEqual(waiting.lines.at(-1), {
    source: "whatsapp_history",
    title: "WhatsApp",
    says: "Contacts and chats, once you approve",
    stand: "At Go live",
    state: "waiting",
    retry: false,
    share: null,
    aside: null,
    door: null,
    asideDoor: null,
    count: null,
  });
  assert.deepEqual([waiting.done, waiting.of, waiting.running], [1, 2, false]);
  assert.equal(
    importLinesOf([row("whatsapp_contacts", "running")], { whatsappWaiting: true }).lines.length,
    1,
    "already started: no waiting line besides it",
  );
  assert.deepEqual(importLinesOf(null), { lines: [], done: 0, of: 0, running: false });
});

test("Connections' notes: a line a source the connection brought, where it stands while it is still coming", () => {
  const rows = [
    row("mailbox", "running", { messages: 40 }, { parts_done: 1, parts_total: 4 }),
    row("contacts", "done", { people: 80 }, { via: "google" }),
    row("google_reviews", "done", { reviews: 5 }),
  ];
  assert.deepEqual(importNotesOf(["mailbox", "contacts"], rows), [
    { text: "Your inbox: 40 emails so far · 25%", live: true },
    { text: "Your contacts: 80 people · Google", live: true },
  ]);
  assert.deepEqual(importNotesOf(undefined, rows), [], "a row that brings nothing in");
  assert.deepEqual(importNotesOf(["mailbox"], null), []);
});

test("the kept app's chats in Meta's three parts: in, coming in, next, each said with how far back it reaches", () => {
  const r = row(
    "whatsapp_history",
    "running",
    {},
    { parts_done: 1, parts_total: 3, started_at: "2026-09-07T14:00:00Z" },
  );
  const parts = whatsappPartsOf(r);
  assert.deepEqual(
    parts.map((p) => [p.key, p.state, p.stand]),
    [
      ["day", "done", "In"],
      ["quarter", "running", "Coming in"],
      ["half", "next", "Next"],
    ],
  );
  assert.equal(parts[0].says, "Chats from the last 24 hours");
  assert.equal(parts[1].says, `Back to ${dayWords(new Date(Date.parse(r.started_at) - 90 * DAY).toISOString())}`);
  assert.equal(parts[2].says, `Back to ${dayWords(new Date(Date.parse(r.started_at) - 180 * DAY).toISOString())}`);
  assert.deepEqual(
    whatsappPartsOf({ ...r, state: "done" }).map((p) => p.state),
    ["done", "done", "done"],
  );
  assert.deepEqual(whatsappPartsOf({ ...r, state: "failed" }), [], "a run that stopped: its row says why");
  assert.deepEqual(whatsappPartsOf(row("mailbox")), []);
  assert.deepEqual(whatsappPartsOf(null), []);
});

test("Today's Brought in card: where it all stands in one place, and closed, the people, how far back email reached, the calendar", () => {
  const rows = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 0, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  assert.deepEqual(broughtInCardOf(rows, 640), {
    title: "Brought in",
    state: { tone: "live", words: "Bringing it in · 3 of 4" },
    facts: [
      { key: "people", text: "640 people · 212 reviews" },
      { key: "mail", text: `Email since ${dayWords("2026-03-07T00:00:00Z")}` },
      { key: "calendar", text: "No past appointments · 9 coming up" },
    ],
  });
  assert.deepEqual(broughtInCardOf([row("contacts", "done", { people: 1 })], 1), {
    title: "Brought in",
    state: { tone: "ok", words: "All in" },
    facts: [{ key: "people", text: "1 person" }],
  });
  assert.deepEqual(
    broughtInCardOf([row("mailbox", "failed"), row("calendar", "failed"), row("contacts", "running")], 3).state,
    { tone: "stopped", words: "2 stopped" },
    "a source stopped is said before one still coming: its Try again is the act",
  );
  assert.deepEqual(broughtInCardOf([row("calendar", "queued")], null).state, {
    tone: "live",
    words: "Bringing it in · 0 of 1",
  });
  assert.equal(broughtInCardOf([], 10), null, "nothing came: no card");
});

test("Today keeps the card while anything is coming or stopped, and a week after the last source finished", () => {
  const done = row("google_reviews", "done", {}, { finished_at: new Date(NOW - 2 * DAY).toISOString() });
  assert.equal(broughtInShown([done], NOW), true, "two days after");
  assert.equal(
    broughtInShown([done], NOW + 6 * DAY),
    false,
    "past the week: People's, the Inbox's, the Calendar's own",
  );
  assert.equal(broughtInShown([done, row("mailbox", "running")], NOW + 30 * DAY), true, "still coming");
  assert.equal(
    broughtInShown([row("calendar", "failed")], NOW + 30 * DAY),
    true,
    "stopped: its Try again stays in reach",
  );
  assert.equal(broughtInShown([], NOW), false);
});

test("counting again what every mailbox brought (ops imports-recount-mail): the kept mail and the contacts' people, nothing else", async () => {
  const { planRecount } = await import("../../ops/imports-recount-mail.mjs");
  const rows = [
    {
      source: "mailbox",
      state: "done",
      counts: { messages: 222, people: 47, dropped: 4706 },
      oldest: "2026-05-01T07:51:00Z",
    },
    { source: "contacts", state: "done", counts: { people: 0 }, oldest: null },
  ];
  const counted = { messages: 706, oldest: "2026-05-01T07:51:00Z", contactsPeople: 249 };
  assert.deepEqual(planRecount(rows, counted), [
    {
      source: "mailbox",
      state: "done",
      was: { messages: 222, people: 47, dropped: 4706 },
      counts: { messages: 706, people: 47, dropped: 4706 },
      oldest: "2026-05-01T07:51:00Z",
    },
    { source: "contacts", state: "done", was: { people: 0 }, counts: { people: 249 }, oldest: null },
  ]);
  const done = [
    { ...rows[0], counts: { messages: 706, people: 47, dropped: 4706 } },
    { ...rows[1], counts: { people: 249 } },
  ];
  assert.deepEqual(planRecount(done, counted), [], "a second run finds nothing to change");
  assert.deepEqual(planRecount([], counted), [], "a source with no row is left alone");
});
