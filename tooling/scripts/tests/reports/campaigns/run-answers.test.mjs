/**
 * A yes or a stop is the answer to a campaign run, by one rule (contracts broadcasts/run-answers.ts, `answersToRuns`).
 *
 * The run sheet reads it (server/campaigns/broadcasts.ts, consentAfter), and Task 2 restates it in SQL
 * (`campaign_answers`, 00403), which a database test holds equal to this one over one world. So this file says the rule
 * once, in cases: which events count, which run each belongs to (a key where the event carries one that names a send,
 * else the 72 hours after it), and which one stands for a person on a run (the latest).
 *
 * Pure: sends and events in, answers out.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { answersToRuns, REPLY_WINDOW_MS } from "@chanlytics/contracts";

const T0 = Date.parse("2026-09-01T09:00:00Z");
const SECOND = 1_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms) => new Date(T0 + ms).toISOString();

/** A campaign send as the rule reads one: a person reached by WhatsApp at T0 on run A, a live person. */
const send = (over = {}) => ({
  runId: "run-a",
  contactId: "p1",
  sentAt: at(0),
  byEmail: false,
  live: true,
  messageId: null,
  messageExternalId: null,
  ...over,
});
/** A `contact.consent_changed` event as the rule reads one: the person, the instant, and `data` as the ledger keeps it. */
const event = (id, ms, data, over = {}) => ({ id, contactId: "p1", at: at(ms), data, ...over });
/** The rows by run and person, so a case compares what was found and not the order it came in. */
const sorted = (rows) =>
  [...rows].sort((a, b) => `${a.runId}|${a.contactId}`.localeCompare(`${b.runId}|${b.contactId}`));
/** What a case needs of each answer: the run, the person, the event, and whether it was found by a key. */
const found = (rows) => sorted(rows).map((r) => [r.runId, r.contactId, r.eventId, r.exact]);

test("an answer is the person's latest consent event in the 72 hours after the send, per run", () => {
  assert.equal(REPLY_WINDOW_MS, 72 * HOUR, "the window the rule counts in is the reply window");
  const events = [
    event("e-at-send", 0, { consent: "opted_in" }), // at the send, not after it
    event("e-1s", SECOND, { consent: "opted_in" }),
    event("e-edge", 72 * HOUR, { consent: "opted_out" }), // the last instant that counts
    event("e-out", 72 * HOUR + SECOND, { consent: "opted_in" }),
    event("e-before", -HOUR, { consent: "opted_in" }),
  ];
  assert.deepEqual(answersToRuns([send()], events), [
    {
      runId: "run-a",
      contactId: "p1",
      consent: "opted_out",
      purpose: "conversational",
      at: at(72 * HOUR),
      eventId: "e-edge",
      exact: false,
    },
  ]);
  assert.deepEqual(
    found(answersToRuns([send()], [events[0], events[3], events[4]])),
    [],
    "at the send, a second past the window and before the send: none of them is an answer",
  );
  assert.deepEqual(
    found(answersToRuns([send()], events.slice(0, 2))),
    [["run-a", "p1", "e-1s", false]],
    "the first instant after the send counts",
  );
  // The same instant twice: the event whose id sorts last stands, whichever came first in the list.
  const tied = [
    event("e-b", HOUR, { consent: "opted_in" }),
    event("e-a", HOUR, { consent: "opted_out" }),
    event("e-c", HOUR - SECOND, { consent: "opted_in" }),
  ];
  assert.deepEqual(found(answersToRuns([send()], tied)), [["run-a", "p1", "e-b", false]]);
  assert.deepEqual(found(answersToRuns([send()], [...tied].reverse())), [["run-a", "p1", "e-b", false]]);
  // Instants are compared to the millisecond, both sides truncated (SQL: date_trunc('milliseconds', ...)): an event 0.8 ms
  // after the send is not after it, and of two events inside one millisecond the id alone tells which is later, though the
  // greater id is the earlier by microseconds.
  const sub = (id, micros, consent) => ({
    ...event(id, 0, { consent }),
    at: `2026-09-01T09:00:01.${String(micros).padStart(6, "0")}Z`,
  });
  const sentJustBefore = send({ sentAt: "2026-09-01T09:00:01.000100Z" });
  assert.deepEqual(
    answersToRuns([sentJustBefore], [sub("e", 900, "opted_in")]),
    [],
    "the same millisecond is not after",
  );
  assert.deepEqual(
    found(answersToRuns([send()], [sub("e-b", 100, "opted_in"), sub("e-a", 900, "opted_out")])),
    [["run-a", "p1", "e-b", false]],
    "one millisecond: the greater id stands",
  );
  assert.deepEqual(
    found(answersToRuns([send()], [sub("e-b", 100, "opted_in"), sub("e-a", 1100, "opted_out")])),
    [["run-a", "p1", "e-a", false]],
    "the next millisecond is later whatever the id",
  );
});

test("a merge restating an answer, a stop that ended a yes, a consent of unknown and an event with no consent are no answer; an event naming no source is one", () => {
  const none = (data) => answersToRuns([send()], [event("e", HOUR, data)]);
  assert.deepEqual(none({ consent: "opted_in", source: "merge" }), [], "a merge restating a yes");
  assert.deepEqual(none({ consent: "opted_out", source: "merge" }), [], "a merge restating a stop");
  assert.deepEqual(none({ consent: "opted_out", source: "stop" }), [], "a stop that ended a yes");
  assert.deepEqual(none({ consent: "unknown", source: "customer_message" }), [], "a consent of unknown");
  assert.deepEqual(none({ source: "customer_message" }), [], "an event with no consent");
  assert.deepEqual(none({ consent: "OPTED_IN" }), [], "a consent that is not one of the two");
  assert.deepEqual(none(null), [], "an event with no data");
  assert.deepEqual(none("opted_in"), [], "data that is not an object");
  assert.deepEqual(none(["opted_in"]), [], "data that is a list");
  assert.deepEqual(
    answersToRuns([send()], [{ ...event("e", HOUR, { consent: "opted_in" }), at: "the day before yesterday" }]),
    [],
    "an event with no instant cannot be placed after a send",
  );

  const one = (data) => answersToRuns([send()], [event("e", HOUR, data)]).map((a) => [a.consent, a.eventId]);
  assert.deepEqual(one({ consent: "opted_in" }), [["opted_in", "e"]], "an event naming no source is an answer");
  assert.deepEqual(one({ consent: "opted_out", source: null }), [["opted_out", "e"]], "a null source names none");
  assert.deepEqual(one({ consent: "opted_in", source: "in_person" }), [["opted_in", "e"]], "a desk yes");
  assert.deepEqual(one({ consent: "opted_out", source: "customer_message" }), [["opted_out", "e"]], "their own words");

  // What does not count never stands in the way of what does: the merge after a yes, and the stop after it, change nothing.
  const events = [
    event("yes", HOUR, { consent: "opted_in", source: "in_person" }),
    event("merge", 2 * HOUR, { consent: "opted_out", source: "merge" }),
    event("stop", 3 * HOUR, { consent: "opted_out", source: "stop" }),
    event("unknown", 4 * HOUR, { consent: "unknown" }),
  ];
  assert.deepEqual(found(answersToRuns([send()], events)), [["run-a", "p1", "yes", false]]);
});

test("an answer about offers by email counts for a person the run reached by email and for no one else; the other purposes count for anyone", () => {
  const purposes = [
    ["email_marketing", "email_marketing"], // the unsubscribe door's, with no key here
    ["marketing", "marketing"],
    [undefined, "conversational"],
    ["something_else", "conversational"],
  ];
  for (const [named, purpose] of purposes) {
    for (const byEmail of [true, false]) {
      const data = { consent: "opted_out", ...(named === undefined ? {} : { purpose: named }) };
      const got = answersToRuns([send({ byEmail })], [event("e", HOUR, data)]);
      const counts = named !== "email_marketing" || byEmail;
      assert.deepEqual(
        got.map((a) => [a.purpose, a.exact]),
        counts ? [[purpose, false]] : [],
        `${named ?? "no purpose"}, reached ${byEmail ? "by email" : "another way"}`,
      );
    }
  }
  // A yes to offers by email is the same: only the person the run reached by email gave one.
  const yes = event("e", HOUR, { consent: "opted_in", purpose: "email_marketing" });
  assert.equal(answersToRuns([send({ byEmail: true })], [yes]).length, 1);
  assert.equal(answersToRuns([send({ byEmail: false })], [yes]).length, 0);
  // On two runs, the one reached by email takes the answer and the one reached by WhatsApp does not.
  const two = [send({ runId: "run-mail", byEmail: true }), send({ runId: "run-wa", sentAt: at(HOUR / 2) })];
  assert.deepEqual(found(answersToRuns(two, [yes])), [["run-mail", "p1", "e", false]]);
});

test("an unsubscribe, a complaint or a reply no is the answer to the email it names, however late, and to no other run; a key that finds no campaign send is no answer", () => {
  const late = 10 * DAY;
  const a = send({ runId: "run-a", byEmail: true, messageId: "msg-a" });
  // The same person was sent run B by email a day before the event: by time, B would take it.
  const b = send({ runId: "run-b", byEmail: true, messageId: "msg-b", sentAt: at(late - DAY) });
  for (const source of ["unsubscribe", "complaint", "reply"]) {
    const named = event("e", late, { consent: "opted_out", purpose: "email_marketing", source, message_id: "msg-a" });
    assert.deepEqual(
      answersToRuns([a, b], [named]),
      [
        {
          runId: "run-a",
          contactId: "p1",
          consent: "opted_out",
          purpose: "email_marketing",
          at: at(late),
          eventId: "e",
          exact: true,
        },
      ],
      `${source}: run A only, found by its key`,
    );
    // Run B's own email named: B, and not A (A's window ended a week ago).
    const second = { ...named, data: { ...named.data, message_id: "msg-b" } };
    assert.deepEqual(found(answersToRuns([a, b], [second])), [["run-b", "p1", "e", true]], `${source}: run B's`);
    // A key that names no campaign send (an Inbox email, say) answers something else: not A, and not B by its time.
    const other = { ...named, data: { ...named.data, message_id: "msg-inbox" } };
    assert.deepEqual(answersToRuns([a, b], [other]), [], `${source}: a key that finds no send is no answer`);
  }
  // The key names a send of this person: an email sent to someone else is not this person's answer to anything.
  const unsubscribe = event("e", late, {
    consent: "opted_out",
    purpose: "email_marketing",
    source: "unsubscribe",
    message_id: "msg-a",
  });
  const theirs = send({ contactId: "p2", runId: "run-a", messageId: "msg-a", byEmail: true });
  assert.deepEqual(answersToRuns([theirs], [unsubscribe]), [], "the key names a send of someone else");
  assert.deepEqual(found(answersToRuns([theirs], [{ ...unsubscribe, contactId: "p2" }])), [["run-a", "p2", "e", true]]);
  // A key is compared as text, exactly: another case names no send (it is a key, so it is not run B's by its time either).
  const upper = { ...unsubscribe, data: { ...unsubscribe.data, message_id: "MSG-A" } };
  assert.deepEqual(answersToRuns([a, b], [upper]), [], "a key is case-sensitive");
  // The key outranks the clock: an exact answer, then a later yes by time, the later of the two stands for the run.
  const both = [
    event("unsub", 2 * HOUR, {
      consent: "opted_out",
      purpose: "email_marketing",
      source: "unsubscribe",
      message_id: "msg-a",
    }),
    event("back", 30 * HOUR, { consent: "opted_in", purpose: "email_marketing" }),
  ];
  assert.deepEqual(found(answersToRuns([a], both)), [["run-a", "p1", "back", false]]);
  // A key does not bring an event the rule leaves out back in.
  const merged = event("e", late, {
    consent: "opted_out",
    purpose: "email_marketing",
    source: "merge",
    message_id: "msg-a",
  });
  assert.deepEqual(answersToRuns([a], [merged]), []);
  // Only a stop is keyed: a yes to offers by email carrying a message id belongs by its time, and ten days is past it.
  const yes = event("e", late, {
    consent: "opted_in",
    purpose: "email_marketing",
    source: "unsubscribe",
    message_id: "msg-a",
  });
  assert.deepEqual(answersToRuns([a], [yes]), []);
});

test("a carrier's or WhatsApp's stop is the answer to the send it names by its provider id", () => {
  const fortnight = 14 * DAY;
  const a = send({ runId: "run-a", messageExternalId: "SM-A" });
  const b = send({ runId: "run-b", messageExternalId: "wamid.B", sentAt: at(fortnight - DAY) });
  for (const [source, id, run] of [
    ["carrier", "SM-A", "run-a"],
    ["whatsapp", "SM-A", "run-a"],
    ["carrier", "wamid.B", "run-b"],
    ["whatsapp", "wamid.B", "run-b"],
  ]) {
    const stop = event("e", fortnight, { consent: "opted_out", purpose: "marketing", source, message_external_id: id });
    assert.deepEqual(
      answersToRuns([a, b], [stop]),
      [
        {
          runId: run,
          contactId: "p1",
          consent: "opted_out",
          purpose: "marketing",
          at: at(fortnight),
          eventId: "e",
          exact: true,
        },
      ],
      `${source} naming ${id}: ${run}, however late`,
    );
  }
  // The rule does not ask a carrier's or WhatsApp's event to be a stop: either consent is exact by its provider id.
  for (const source of ["carrier", "whatsapp"]) {
    const yes = event("e", fortnight, { consent: "opted_in", source, message_external_id: "SM-A" });
    assert.deepEqual(found(answersToRuns([a, b], [yes])), [["run-a", "p1", "e", true]], `${source}: a yes, exact too`);
  }
  const lower = event("e", fortnight, { consent: "opted_out", source: "carrier", message_external_id: "sm-a" });
  assert.deepEqual(answersToRuns([a, b], [lower]), [], "a provider id is case-sensitive");
  const none = event("e", fortnight, { consent: "opted_out", source: "carrier", message_external_id: "SM-nothing" });
  assert.deepEqual(answersToRuns([a, b], [none]), [], "a provider id that finds no send is no answer, not B's by time");
  // No id (an empty one is none): the stop is a stop by its time, as any other.
  const bare = event("e", fortnight - HOUR, { consent: "opted_out", source: "carrier" });
  assert.deepEqual(found(answersToRuns([a, b], [bare])), [["run-b", "p1", "e", false]]);
  const empty = event("e", fortnight - HOUR, { consent: "opted_out", source: "whatsapp", message_external_id: "" });
  assert.deepEqual(found(answersToRuns([a, b], [empty])), [["run-b", "p1", "e", false]]);
});

test("a key of another kind is no key", () => {
  const a = send({ runId: "run-a", byEmail: true, messageId: "msg-a", messageExternalId: "SM-A" });
  const b = send({ runId: "run-b", byEmail: true, sentAt: at(10 * DAY - 2 * HOUR) });
  const when = 10 * DAY;
  const by = (data, ms = when) => found(answersToRuns([a, b], [event("e", ms, data)]));
  // A desk yes carrying a message id belongs by its time: to the run that reached them two hours before.
  assert.deepEqual(by({ consent: "opted_in", source: "in_person", message_id: "msg-a" }), [
    ["run-b", "p1", "e", false],
  ]);
  // A yes to offers by email is not an unsubscribe, a complaint or a reply no: its message id names nothing.
  assert.deepEqual(
    by({ consent: "opted_in", purpose: "email_marketing", source: "unsubscribe", message_id: "msg-a" }),
    [["run-b", "p1", "e", false]],
  );
  // An unsubscribe of another purpose, or a source that is neither of the three: no key either.
  assert.deepEqual(by({ consent: "opted_out", purpose: "marketing", source: "unsubscribe", message_id: "msg-a" }), [
    ["run-b", "p1", "e", false],
  ]);
  assert.deepEqual(
    by({ consent: "opted_out", purpose: "email_marketing", source: "customer_message", message_id: "msg-a" }),
    [["run-b", "p1", "e", false]],
  );
  // The email's key on a carrier's stop, and the provider's id on an unsubscribe: each is the other kind's.
  assert.deepEqual(by({ consent: "opted_out", source: "carrier", message_id: "msg-a" }), [["run-b", "p1", "e", false]]);
  assert.deepEqual(
    by({ consent: "opted_out", purpose: "email_marketing", source: "unsubscribe", message_external_id: "SM-A" }),
    [["run-b", "p1", "e", false]],
  );
  // And a key that is not a word names nothing: a number, an object or '' is no key, and the event goes by its time.
  assert.deepEqual(by({ consent: "opted_out", source: "carrier", message_external_id: 42 }), [
    ["run-b", "p1", "e", false],
  ]);
  for (const message_id of [42, "", { id: "msg-a" }, ["msg-a"], null, true]) {
    assert.deepEqual(
      by({ consent: "opted_out", purpose: "email_marketing", source: "unsubscribe", message_id }),
      [["run-b", "p1", "e", false]],
      `message_id ${JSON.stringify(message_id)}`,
    );
  }
  // With the key of its own kind, the same events are exact: the proof that the cases above differ in that and no more.
  assert.deepEqual(
    by({ consent: "opted_out", purpose: "email_marketing", source: "unsubscribe", message_id: "msg-a" }),
    [["run-a", "p1", "e", true]],
  );
  assert.deepEqual(by({ consent: "opted_out", source: "carrier", message_external_id: "SM-A" }), [
    ["run-a", "p1", "e", true],
  ]);
});

test("a person who is not live has no answer", () => {
  const events = [
    event("by-time", HOUR, { consent: "opted_in" }),
    event("by-mail", 5 * DAY, {
      consent: "opted_out",
      purpose: "email_marketing",
      source: "unsubscribe",
      message_id: "msg-a",
    }),
    event("by-wire", 6 * DAY, { consent: "opted_out", source: "carrier", message_external_id: "SM-A" }),
  ];
  const gone = send({ live: false, byEmail: true, messageId: "msg-a", messageExternalId: "SM-A" });
  assert.deepEqual(answersToRuns([gone], events), []);
  assert.deepEqual(
    found(answersToRuns([send({ byEmail: true, messageId: "msg-a", messageExternalId: "SM-A" })], events)),
    [["run-a", "p1", "by-wire", true]],
    "the same world with the person live: the latest is the provider's stop, and it is exact",
  );
  // One person erased does not take another's answer with it.
  const two = [gone, send({ contactId: "p2" })];
  const both = [...events, event("p2-yes", HOUR, { consent: "opted_in" }, { contactId: "p2" })];
  assert.deepEqual(found(answersToRuns(two, both)), [["run-a", "p2", "p2-yes", false]]);
});

test("a person on two runs has an answer for each, from the one event when it falls in both windows", () => {
  const a = send({ runId: "run-a" });
  const b = send({ runId: "run-b", sentAt: at(DAY) });
  const yes = event("yes", 30 * HOUR, { consent: "opted_in", source: "in_person" });
  assert.deepEqual(found(answersToRuns([a, b], [yes])), [
    ["run-a", "p1", "yes", false],
    ["run-b", "p1", "yes", false],
  ]);
  // Past A's window it is B's alone; a stop inside both then stands for each of them, the latest per run.
  const late = event("late", 4 * DAY, { consent: "opted_out" });
  assert.deepEqual(found(answersToRuns([a, b], [yes, late])), [
    ["run-a", "p1", "yes", false],
    ["run-b", "p1", "late", false],
  ]);
  // One row for a run and a person, whatever the people on it: P2 is on A as well and said nothing.
  const rows = answersToRuns([a, b, send({ contactId: "p2" })], [yes, late]);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((r) => `${r.runId}|${r.contactId}`)).size, 2);
});

test("the order of the input changes nothing", () => {
  const sends = [
    send({ runId: "run-a", contactId: "p1", byEmail: true, messageId: "msg-p1-a" }),
    send({ runId: "run-b", contactId: "p1", sentAt: at(DAY), messageExternalId: "SM-p1-b" }),
    send({ runId: "run-a", contactId: "p2", messageExternalId: "SM-p2-a" }),
    send({ runId: "run-c", contactId: "p2", sentAt: at(2 * DAY), byEmail: true, messageId: "msg-p2-c" }),
    send({ runId: "run-a", contactId: "p3", live: false }),
    send({ runId: "run-b", contactId: "p4", sentAt: at(DAY) }),
  ];
  const events = [
    event("e1", HOUR, { consent: "opted_in" }),
    event("e2", 30 * HOUR, { consent: "opted_out", purpose: "marketing" }),
    event("e3", 9 * DAY, {
      consent: "opted_out",
      purpose: "email_marketing",
      source: "unsubscribe",
      message_id: "msg-p1-a",
    }),
    event(
      "e4",
      9 * DAY,
      { consent: "opted_out", source: "carrier", message_external_id: "SM-p2-a" },
      { contactId: "p2" },
    ),
    event("e5", 2 * DAY + HOUR, { consent: "opted_in", purpose: "email_marketing" }, { contactId: "p2" }),
    event("e6", HOUR, { consent: "opted_in" }, { contactId: "p3" }),
    event("e7", DAY + HOUR, { consent: "opted_in" }, { contactId: "p4" }),
    event("e8", DAY + HOUR, { consent: "opted_out" }, { contactId: "p4" }), // the same instant as e7: the id breaks the tie
    event("e9", 2 * HOUR, { consent: "opted_in", source: "merge" }),
  ];
  const forward = sorted(answersToRuns(sends, events));
  assert.ok(forward.length >= 5, "the world has answers to compare");
  assert.deepEqual(sorted(answersToRuns([...sends].reverse(), [...events].reverse())), forward);
  assert.deepEqual(sorted(answersToRuns([...sends].reverse(), events)), forward);
  assert.deepEqual(sorted(answersToRuns(sends, [...events].reverse())), forward);
  const rotated = (list) => [...list.slice(3), ...list.slice(0, 3)];
  assert.deepEqual(sorted(answersToRuns(rotated(sends), rotated(events))), forward);
  assert.deepEqual(
    forward.map((r) => [r.runId, r.contactId, r.eventId, r.exact]),
    [
      ["run-a", "p1", "e3", true],
      ["run-a", "p2", "e4", true],
      ["run-b", "p1", "e2", false],
      ["run-b", "p4", "e8", false],
      ["run-c", "p2", "e5", false],
    ],
  );
});
