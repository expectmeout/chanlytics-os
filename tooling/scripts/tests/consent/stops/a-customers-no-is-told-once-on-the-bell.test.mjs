/**
 * A customer's no is told once, on the bell (decision 0048; NS-6 and S1-07 of the wiring plan, task 1.8).
 *
 * A typed STOP is recorded by ingest_inbound with its contact.consent_changed event in the message's own transaction, and the
 * receptionist opens no hold for it (the gate, run here; the whole path in whatsapp/inbound-executed.test.mjs). The owner is
 * told from the event, whichever door wrote it, in the Inbox's words: a kind of its own, a line on the bell whose mail is the
 * business's choice and never always, and no phone. Run on the pure half (contracts optOutOf and optOutNotice), the kind's
 * place in the table the page draws, and the receptionist's gate; the subscriber that tells it is run in
 * events/an-event-is-delivered-to-its-subscriber.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALERT_TOPICS,
  BELL_LINE_KINDS,
  EMAIL_ALWAYS_KINDS,
  EMAILED_NOTIFICATION_KINDS,
  PUSH_KINDS,
  SERVER_NOTIFICATION_KINDS,
  STOP_WORDS,
  emailsFor,
  emailsNotificationKind,
  isPushKind,
  optOutNotice,
  optOutOf,
  serverNotificationRows,
} from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { firstGates } = await importSrc("packages/core/src/inbound/gates.ts");

const PERSON = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";

test("what a consent event says of a no: only the customer's own or a provider's report, and what it ends", () => {
  assert.deepEqual(optOutOf({ consent: "opted_out", source: "customer_message", channel: "sms", words: " STOP " }), {
    how: "stop",
    scope: "everything",
    channel: "sms",
    words: "STOP",
  });
  assert.deepEqual(optOutOf({ consent: "opted_out", source: "carrier", channel: "sms" }), {
    how: "carrier",
    scope: "everything",
    channel: "sms",
    words: null,
  });
  assert.deepEqual(
    optOutOf({ purpose: "email_marketing", consent: "opted_out", source: "unsubscribe", channel: "email" }),
    { how: "unsubscribe", scope: "offers", channel: "email", words: null },
  );
  assert.deepEqual(
    optOutOf({ purpose: "email_marketing", consent: "opted_out", source: "complaint", channel: "email" }),
    { how: "complaint", scope: "offers", channel: "email", words: null },
  );
  assert.deepEqual(optOutOf({ purpose: "marketing", consent: "opted_out", source: "whatsapp", channel: "whatsapp" }), {
    how: "whatsapp",
    scope: "offers",
    channel: "whatsapp",
    words: null,
  });
  assert.deepEqual(
    optOutOf({ purpose: "marketing", consent: "opted_out", source: "customer_message" }),
    { how: "stop", scope: "offers", channel: null, words: null },
    "a customer's own no to offers alone ends offers alone",
  );
  // Not news to anyone: a yes, a reset, a member's own record, a merge, the end of a yes by a STOP, and what is not a change.
  for (const data of [
    { consent: "opted_in", source: "customer_message" },
    { consent: "unknown", source: "operator" },
    { consent: "opted_out", source: "operator", by: "u1" },
    { consent: "opted_out", source: "in_person" },
    { consent: "opted_out", source: "phone" },
    { consent: "opted_out", source: "merge" },
    { purpose: "marketing", consent: "unknown", source: "stop" },
    { consent: "opted_out", source: "constructor" },
    { consent: "opted_out" },
    null,
    undefined,
    "opted_out",
    [],
  ]) {
    assert.equal(optOutOf(data), null, JSON.stringify(data));
  }
});

test("the notice says it in the Inbox's words, on the person's page, and names no one erased; the platform's copy holds no customer", () => {
  const person = { who: "Dulce Amaro", address: "+13055550142", erased: false, contactId: PERSON };
  const typed = optOutNotice({ ...person, how: "stop", scope: "everything", channel: "sms", words: "STOP" });
  assert.deepEqual(
    [typed.kind, typed.route, typed.about],
    ["opted_out", `clients/${PERSON}`, { type: "contact", id: PERSON }],
  );
  // The headline is the one the Inbox's composer and the person's page say (STOP_WORDS), with the name.
  assert.equal(typed.subject, STOP_WORDS.said("Dulce Amaro"));
  assert.equal(typed.subject, "Dulce Amaro asked to stop receiving messages");
  assert.equal(
    typed.body,
    [
      "They wrote: “STOP”",
      "Nothing more will be sent to them. They can text START to opt back in.",
      "",
      "Text · +1 (305) 555-0142",
    ].join("\n"),
  );
  assert.equal(typed.redactedBody, "A customer asked to stop, and nobody could be told.");

  const offers = optOutNotice({ ...person, how: "stop", scope: "offers", channel: null, words: null });
  assert.equal(offers.subject, "Dulce Amaro asked to stop offers");
  assert.match(offers.body, /^Offers to them have stopped\. Reminders and confirmations still reach them./);
  const spam = optOutNotice({ ...person, how: "complaint", scope: "offers", channel: "email", words: null });
  assert.equal(spam.subject, "Dulce Amaro reported one of your emails as spam");
  assert.equal(spam.redactedBody, "A customer reported an email as spam, and nobody could be told.");
  const numberless = optOutNotice({
    ...person,
    who: null,
    address: "dulce@example.com",
    how: "unsubscribe",
    scope: "offers",
    channel: "email",
    words: null,
  });
  assert.equal(numberless.subject, "dulce@example.com unsubscribed from your emails");
  assert.ok(numberless.body.endsWith("\n\nEmail · dulce@example.com"));

  const erased = optOutNotice({
    ...person,
    erased: true,
    how: "stop",
    scope: "everything",
    channel: "sms",
    words: "STOP",
  });
  assert.equal(erased.subject, "A customer asked to stop receiving messages");
  assert.doesNotMatch(erased.body, /Dulce|305|wrote|STOP/, "no name, no words, no number of someone erased");
});

test("the kind is the bell's line with a mail as the business chooses: never always, no phone, on the page's table once, and not a warning", () => {
  assert.ok(SERVER_NOTIFICATION_KINDS.includes("opted_out"));
  assert.ok(emailsNotificationKind("opted_out") && EMAILED_NOTIFICATION_KINDS.includes("opted_out"));
  assert.ok(
    !EMAIL_ALWAYS_KINDS.includes("opted_out"),
    "the receptionist's must-reach-someone mail is a handoff's, not a STOP's",
  );
  assert.equal(isPushKind("opted_out"), false);
  assert.ok(!PUSH_KINDS.includes("opted_out"));
  assert.ok(!BELL_LINE_KINDS.includes("opted_out"), "it has a tick on the page (the mail is a choice)");
  const topics = ALERT_TOPICS.filter((t) => t.kinds.includes("opted_out"));
  assert.equal(topics.length, 1, "said once");
  assert.deepEqual([topics[0].email, topics[0].phone], ["choice", false]);
  // The business chooses: mailed until it turns the kind off, as every choice is.
  assert.equal(emailsFor({ email_off: [] }, "opted_out"), true);
  assert.equal(emailsFor({ email_off: ["opted_out"] }, "opted_out"), false);
  assert.equal(emailsFor({ email_off: ["handoff", "deadman"] }, "handoff"), true, "and the always are always");

  // On the bell: a line that is news (neutral, like STOP_WORDS.tone), on the person's page.
  const [row] = serverNotificationRows({
    seen_at: null,
    notifications: [
      {
        id: "n1",
        kind: "opted_out",
        title: "Dulce Amaro asked to stop receiving messages",
        body: "…",
        route: `clients/${PERSON}`,
        subject_type: "contact",
        subject_id: PERSON,
        created_at: "2026-10-11T10:00:00Z",
        read: false,
        dismissed: false,
      },
    ],
  });
  assert.deepEqual(
    [row.kind, row.tone, row.to, row.action, row.about],
    ["opted_out", "", `clients/${PERSON}`, "Open their page", { type: "contact", id: PERSON }],
  );
});

test("the receptionist's gate: a STOP opens no hold, tells nobody itself, sends nothing, and the message is handled as blocked; a later message from the same person asks nobody either", async () => {
  const run = async (n, ing = null) => {
    const seen = { escalated: [], told: [], processed: [] };
    const out = await firstGates({
      thread: {},
      L: { info() {}, warn() {}, error() {} },
      sink: {
        escalate: async (...a) => (seen.escalated.push(a), "opened"),
        processed: async (...a) => seen.processed.push(a),
      },
      tell: async (...a) => seen.told.push(a),
      // The one inbound shape (decision 0001): the message says its own consent.
      n: {
        kind: "text",
        body: "STOP",
        rawType: "text",
        ...n,
        consent: { optOut: false, optIn: false, optInMarketing: false, ...n.consent },
      },
      ing,
      carrier: undefined,
    });
    return { out, seen };
  };

  const stop = await run({ consent: { optOut: true } });
  assert.equal(stop.out, undefined, "the message stops here: nothing else answers it");
  assert.deepEqual(stop.seen.escalated, [], "no hold: nothing in Needs you, Today's queue or the badge");
  assert.deepEqual(stop.seen.told, [], "and no handoff notice: the consent event tells the owner, once, on the bell");
  assert.deepEqual(stop.seen.processed, [["blocked", null]], "it is handled, and nobody was asked");

  // They opted out earlier, per Postgres (ing.dnc): the message is held out the same way, with nothing opened.
  const later = await run({ body: "hello?" }, { dnc: true, consent: "opted_out", is_new: true });
  assert.equal(later.out, undefined);
  assert.deepEqual([later.seen.escalated, later.seen.told], [[], []]);
  assert.deepEqual(later.seen.processed, [["blocked", null]]);
});
