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
      says: `All 212, back to ${back} · 9 wait for a reply`,
      stand: "In",
      state: "done",
      retry: false,
    },
  );
  assert.equal(
    importLineOf(row("calendar", "done", { past: 412, coming: 9 }, { oldest: "2026-03-07T00:00:00Z" })).says,
    `412 back to ${back}, 9 coming up`,
  );
  assert.equal(
    importLineOf(row("clients_file", "done", { people: 640 }, { via: "vagaro" })).says,
    "640, from Vagaro's file",
  );
  assert.equal(importLineOf(row("clients_file", "done", { people: 1 })).says, "1, from your file");
  assert.equal(
    importLineOf(row("mailbox", "running", { messages: 300, dropped: 1200 }, { oldest: "2026-03-07T00:00:00Z" })).says,
    `Email from people, back to ${back} · 1,200 others dropped`,
  );
  assert.equal(importLineOf(row("whatsapp_contacts", "done", { people: 30 })).says, "30, into People");
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

test("where a run stands: Meta's three parts as parts, a mailbox's pages as a share that never says 100 before it is in", () => {
  assert.equal(importLineOf(row("whatsapp_history", "running", {}, { parts_done: 2, parts_total: 3 })).stand, "2 of 3");
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
    importLineOf(row("calendar", "failed")).says,
    "Reading your calendar",
    "no words of its own: what it was doing",
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
    { text: "Your inbox: Email from people · 25%", live: true },
    { text: "Your contacts: 80, from Google", live: true },
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

test("Today's Brought in card: the people and the reviews, how far back email reached, the calendar, and what is still coming", () => {
  const rows = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 412, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  assert.deepEqual(broughtInCardOf(rows, 640), {
    title: "Brought in",
    lines: [
      "640 people · 212 reviews",
      `Email back to ${dayWords("2026-03-07T00:00:00Z")}`,
      "412 on your calendar before today · 9 coming up",
    ],
    coming: "WhatsApp chats · 1 of 3 parts",
  });
  assert.deepEqual(broughtInCardOf([row("contacts", "done", { people: 1 })], 1), {
    title: "Brought in",
    lines: ["1 person"],
    coming: null,
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
