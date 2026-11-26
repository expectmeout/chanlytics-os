/**
 * What was brought in (decision 0073, R23; contracts imports/ledger.ts), as each page says it: a line per source with
 * where it stands (the first run's "Bringing it in"), Connections' notes on each row, Meta's three parts of the kept
 * app's chats, and Today's rows in the setting-up card while the history is coming in or a part of it stopped. Everything
 * brought is before Chanlytics: said, never counted as today's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_STOPPED_WORDS,
  MAILBOX_LEFT_ROW,
  billingDayWords,
  historyOnTodayOf,
  importLineOf,
  importLinesOf,
  importNotesOf,
  sourceRowsOf,
  whatsappPartsOf,
} from "@chanlytics/contracts";

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
  const back = billingDayWords("2026-03-07T00:00:00Z");
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

test("the strangers the six months found asking about the business, and never answered, are said on the mailbox's line (decision 0080)", () => {
  const says = (counts, state = "done") => importLineOf(row("mailbox", state, counts)).says;
  assert.match(says({ messages: 414, asked: 4 }), /^414 emails · 4 asked about your services and never got an answer/);
  assert.match(says({ messages: 30, asked: 1 }, "running"), /^30 emails so far · 1 asked about your services/);
  assert.doesNotMatch(says({ messages: 414 }), /asked/, "none found: nothing said");
});

test("what the mailbox set aside is said apart, under its line, and only for the mailbox", () => {
  assert.equal(
    importLineOf(row("mailbox", "done", { messages: 414, dropped: 195 })).aside,
    "195 newsletters, notices and pitches set aside",
  );
  assert.equal(
    importLineOf(row("mailbox", "running", { messages: 3, dropped: 1200 })).aside,
    "1,200 newsletters, notices and pitches set aside",
  );
  assert.equal(importLineOf(row("mailbox", "done", { messages: 4 })).aside, null, "nothing set aside: no line");
  assert.equal(
    importLineOf(row("mailbox", "failed", { messages: 130, dropped: 111 })).aside,
    null,
    "stopped: the line says what it kept and Try again, nothing more",
  );
  assert.equal(importLineOf(row("contacts", "done", { people: 4, dropped: 2 })).aside, null);
});

test("Left in your mailbox is the row Settings' address names", () => {
  assert.equal(MAILBOX_LEFT_ROW, "left", "settings/frame/tabs.ts");
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
  assert.equal(
    importLineOf(row("google_photos", "failed", { photos: 40 }, { last_error: IMPORT_STOPPED_WORDS.failed })).says,
    "Stopped part way · 40 photos kept",
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
  const waiting = importLinesOf([row("google_reviews", "done", { reviews: 3 })], "UTC", { whatsappWaiting: true });
  assert.deepEqual(waiting.lines.at(-1), {
    source: "whatsapp_history",
    title: "WhatsApp",
    says: "Contacts and chats, once you approve",
    stand: "At Go live",
    state: "waiting",
    retry: false,
    share: null,
    aside: null,
    count: null,
  });
  assert.deepEqual([waiting.done, waiting.of, waiting.running], [1, 2, false]);
  assert.equal(
    importLinesOf([row("whatsapp_contacts", "running")], "UTC", { whatsappWaiting: true }).lines.length,
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
    { text: "Email: 40 emails so far · 25%", live: true },
    { text: "Contacts: 80 people · Google", live: true },
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
  assert.equal(
    parts[1].says,
    `Back to ${billingDayWords(new Date(Date.parse(r.started_at) - 90 * DAY).toISOString())}`,
  );
  assert.equal(
    parts[2].says,
    `Back to ${billingDayWords(new Date(Date.parse(r.started_at) - 180 * DAY).toISOString())}`,
  );
  assert.deepEqual(
    whatsappPartsOf({ ...r, state: "done" }).map((p) => p.state),
    ["done", "done", "done"],
  );
  assert.deepEqual(whatsappPartsOf({ ...r, state: "failed" }), [], "a run that stopped: its row says why");
  assert.deepEqual(whatsappPartsOf(row("mailbox")), []);
  assert.deepEqual(whatsappPartsOf(null), []);
});

test("Today says the history only while it helps: one line while any of it is coming in, a row a source Try again can bring in, nothing once it is all in", () => {
  const rows = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 0, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  assert.deepEqual(historyOnTodayOf(rows), {
    coming: { name: "Bringing in your history", says: "3 of 4 in · Keeps going if you leave." },
    stopped: [],
  });
  assert.deepEqual(
    historyOnTodayOf([row("calendar", "queued")])?.coming?.says,
    "0 of 1 in · Keeps going if you leave.",
  );
  // All in is said nowhere on Today (18 Nov 2026): a fact with nothing to do beside the queue, the minute it finished too.
  assert.equal(historyOnTodayOf([row("contacts", "done", { people: 1 })]), null, "all in: nothing");
  assert.equal(historyOnTodayOf([]), null, "nothing came: nothing");
  assert.equal(historyOnTodayOf(null), null);
  // A source that stopped: what happened, then why where the run said a reason the owner acts on, else what it kept.
  assert.deepEqual(
    historyOnTodayOf([
      row("mailbox", "failed", { messages: 130 }, { last_error: IMPORT_STOPPED_WORDS.failed }),
      row("google_reviews", "failed", {}, { last_error: IMPORT_STOPPED_WORDS.googleSignedOut }),
      row("calendar", "failed"),
      row("contacts", "running"),
    ]),
    {
      coming: { name: "Bringing in your history", says: "0 of 4 in · Keeps going if you leave." },
      stopped: [
        { source: "google_reviews", name: "Reviews stopped coming in", says: IMPORT_STOPPED_WORDS.googleSignedOut },
        { source: "calendar", name: "Calendar stopped coming in", says: "What came in is kept." },
        { source: "mailbox", name: "Email stopped coming in", says: "130 emails kept" },
      ],
    },
    "in the order the sources are said, each with its own words",
  );
});

test("Today never asks for what Try again cannot give, and never counts what Content reads for itself", () => {
  const stopped = (source, last_error) => row(source, "failed", {}, { last_error });
  // Stopped by the owner, or what it came through is gone: Connections says each on its row.
  for (const why of ["byYou", "removed", "numberGone", "googleGone"])
    assert.equal(historyOnTodayOf([stopped("mailbox", IMPORT_STOPPED_WORDS[why])]), null, why);
  // Meta offers the kept app's history once; the clients' file is added again from People.
  assert.equal(historyOnTodayOf([stopped("whatsapp_history", IMPORT_STOPPED_WORDS.notShared)]), null);
  assert.equal(historyOnTodayOf([stopped("whatsapp_contacts", IMPORT_STOPPED_WORDS.offeredOnce)]), null);
  assert.equal(historyOnTodayOf([stopped("clients_file", IMPORT_STOPPED_WORDS.clientsAgain)]), null);
  // A website read again each month, an Instagram, a profile's photos: Content's own, coming in or stopped (a website's
  // read brought "Your history · All in" back to Today, and one that stopped kept "1 stopped" there for good).
  for (const source of ["website_media", "instagram", "google_photos"]) {
    assert.equal(historyOnTodayOf([row(source, "running")]), null, `${source} coming in`);
    assert.equal(historyOnTodayOf([row(source, "failed")]), null, `${source} stopped`);
  }
  assert.deepEqual(
    historyOnTodayOf([row("website_media", "done", { photos: 12 }), row("mailbox", "running")])?.coming?.says,
    "0 of 1 in · Keeps going if you leave.",
    "the count is the history's own",
  );
});

test("every mailbox's row of a source is said as the one source (decision 0086): its counts added, its stand the most pressing, its reach the furthest", () => {
  const first = row(
    "mailbox",
    "done",
    { messages: 414, asked: 4 },
    { connection_id: "box-1", oldest: "2026-05-01T00:00:00Z", finished_at: "2026-09-07T14:05:00Z" },
  );
  const second = row(
    "mailbox",
    "running",
    { messages: 130 },
    { connection_id: "box-2", oldest: "2026-07-02T00:00:00Z", parts_done: 3, parts_total: null },
  );
  const [mail] = sourceRowsOf([first, second]);
  assert.deepEqual(
    [mail.source, mail.connection_id, mail.state, mail.counts, mail.oldest, mail.parts_done, mail.finished_at],
    ["mailbox", null, "running", { messages: 544, asked: 4 }, "2026-05-01T00:00:00.000Z", 4, null],
    "one still coming says the inbox is",
  );
  const stopped = row("mailbox", "failed", { messages: 2 }, { connection_id: "box-2", last_error: "Signed out." });
  assert.deepEqual(
    (({ state, last_error, finished_at }) => [state, last_error, finished_at])(sourceRowsOf([first, stopped])[0]),
    ["failed", "Signed out.", null],
    "one stopped says why, its Try again the act",
  );
  const later = { ...second, state: "done", finished_at: "2026-09-07T15:00:00Z" };
  assert.equal(sourceRowsOf([first, later])[0].finished_at, "2026-09-07T15:00:00.000Z", "in when the last one was");
  assert.equal(sourceRowsOf([first])[0], first, "a source with one row is that row");
  assert.deepEqual(sourceRowsOf(null), []);
  assert.equal(
    historyOnTodayOf([first, second])?.coming?.says,
    "0 of 1 in · Keeps going if you leave.",
    "Today's line: two mailboxes are one inbox, still coming",
  );
  assert.deepEqual(
    importLinesOf([first, second], "UTC").lines.map((l) => [l.source, l.count]),
    [["mailbox", 544]],
    "Bringing it in: one line",
  );
});

test("counting again what every mailbox brought (ops imports-recount-mail): the kept mail and the contacts' people, nothing else", async () => {
  const { planRecount } = await import("../../tooling/scripts/ops/imports-recount-mail.mjs");
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
  assert.deepEqual(
    planRecount([{ ...rows[0], connection_id: "box-1" }], counted),
    [],
    "each mailbox counting its own (0086): nothing written whole on the workspace's row",
  );
});
