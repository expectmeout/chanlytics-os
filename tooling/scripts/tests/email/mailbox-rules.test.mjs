/**
 * A workspace's email address, before there is a row: what may be typed, what
 * is offered, and what Setup and Connections say in each state. Pure, so every
 * sentence an owner reads is pinned by value.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  connectionRows,
  setupSteps,
  suggestLocalPart,
  whyNotAFromName,
  whyNotALocalPart,
  normalizeLocalPart,
  EMAIL_ELSEWHERE_SENTENCE,
  EMAIL_NOT_ANSWERED_SENTENCE,
  MAILBOX_RESERVED,
  emailDomainOf,
} from "@chanlytics/contracts";

const NOW = Date.parse("2026-09-17T15:00:00Z");
const MAILBOX = {
  id: "mb1",
  address: "bestmovers@mail.chanlytics.com",
  from_name: "Best Movers",
  last_received_at: new Date(NOW - 2 * 3_600_000).toISOString(),
  last_error: null,
};

test("what may be an address: letters, numbers and hyphens, a letter or number at each end, forty at most, and not a word the mail system owns", () => {
  for (const ok of ["bestmovers", "best-movers", "b", "a1", "marisas-beauty-salon", "  BestMovers  ", "x".repeat(40)])
    assert.equal(whyNotALocalPart(ok), null, ok);
  assert.equal(
    normalizeLocalPart("  BestMovers "),
    "bestmovers",
    "stored in one spelling; nothing else is guessed or stripped",
  );
  assert.match(whyNotALocalPart(""), /part before the @/);
  assert.match(whyNotALocalPart("x".repeat(41)), /40 characters/);
  for (const marks of ["best movers", "best.movers", "best_movers", "best@movers", "bést"])
    assert.match(whyNotALocalPart(marks), /letters, numbers and hyphens only/, marks);
  for (const ends of ["-best", "best-"])
    assert.match(whyNotALocalPart(ends), /Start and end with a letter or a number/, ends);
  for (const word of MAILBOX_RESERVED) assert.match(whyNotALocalPart(word), /kept for the mail system/, word);
  assert.match(whyNotALocalPart("Postmaster"), /kept for the mail system/, "whatever its case");
});

test("the name beside it: something, and no longer than the table holds", () => {
  assert.equal(whyNotAFromName("Best Movers"), null);
  assert.match(whyNotAFromName("   "), /name customers should see/);
  assert.match(whyNotAFromName("x".repeat(81)), /80 characters/);
});

test("an address is offered from the business's name, and nothing is offered when nothing usable is left", () => {
  assert.equal(suggestLocalPart("Best Movers"), "best-movers");
  assert.equal(
    suggestLocalPart("Marisa's Beauty Salon"),
    "marisas-beauty-salon",
    "an apostrophe joins, it does not split",
  );
  assert.equal(suggestLocalPart("Café Nuño & Sons"), "cafe-nuno-sons");
  assert.equal(
    suggestLocalPart("The Very Long Name Of A Business That Goes On And On"),
    "the-very-long-name-of-a-business-that-go",
  );
  assert.equal(suggestLocalPart("Support"), null, "a reserved word is not offered");
  for (const none of [null, undefined, "", "!!!", "美容院"]) assert.equal(suggestLocalPart(none), null, String(none));
  for (const name of ["Best Movers", "Marisa's Beauty Salon", "The Very Long Name Of A Business That Goes On And On"])
    assert.equal(whyNotALocalPart(suggestLocalPart(name)), null, "what is offered is always accepted");
});

const connections = (email) =>
  connectionRows(
    {
      channels: [],
      whatsapp: null,
      lines: { rows: [], ready: false },
      lineRequestedAt: null,
      google: null,
      calendar: null,
      email,
    },
    NOW,
  ).find((r) => r.kind === "email");

test("Connections: later where the deployment has no email, a form where it has, the address once it is the workspace's; and it never says the receptionist answers", () => {
  for (const off of [undefined, null, { ready: false, domain: null, mailbox: null }]) {
    assert.deepEqual([connections(off).state, connections(off).verb, connections(off).body], ["later", null, null]);
  }
  const open = connections({ ready: true, domain: "mail.chanlytics.com", mailbox: null });
  assert.deepEqual(
    [open.state, open.group, open.stateWords, open.body],
    ["none", "available", "Not set up", "email_setup"],
  );
  assert.deepEqual(open.verb, { label: "Choose the address", to: "verb:email-setup", who: "owner" });
  assert.ok(open.sentence.endsWith(EMAIL_NOT_ANSWERED_SENTENCE));

  const on = connections({ ready: true, domain: "mail.chanlytics.com", mailbox: MAILBOX });
  assert.deepEqual([on.state, on.group, on.detail, on.stateWords], ["connected", "connected", MAILBOX.address, "On"]);
  assert.equal(
    on.sentence,
    "Customers write to this address and you reply from the Inbox, as Best Movers. Last email 2h ago.",
  );
  assert.deepEqual(on.verb, { label: "Change the name", to: "verb:email-setup", who: "owner" });
  assert.doesNotMatch(
    connections({ ready: true, domain: "mail.chanlytics.com", mailbox: { ...MAILBOX, last_received_at: null } })
      .sentence,
    /Last email/,
  );
  for (const r of [connections(undefined), open, on])
    assert.doesNotMatch(
      r.sentence,
      /receptionist answers/,
      "REGRESSION guard: the row used to promise an address the receptionist answers",
    );
});

/** The least a workspace is, for Setup: nothing connected, nothing asked. */
const bare = (email) => ({
  business: {
    name: "Best Movers",
    hours: false,
    services: 0,
    bookingLink: false,
    address: false,
    handoff: null,
    broken: false,
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: false, active: false, number: null, lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0 },
  requests: { line: null, port: null, repair: null },
  lines: { rows: [], ready: false },
  later: [],
  ...(email === undefined ? {} : { email }),
});
const setupRow = (email) => setupSteps(bare(email), NOW).rows.find((r) => r.id === "email");

test("Setup: no row where the deployment has no email; never required; the same two sentences Connections reads", () => {
  assert.equal(setupRow(undefined), undefined, "a row must never draw a verb that cannot work");
  assert.equal(setupRow({ ready: false, domain: null, mailbox: null }), undefined);
  const open = setupRow({ ready: true, domain: "mail.chanlytics.com", mailbox: null });
  assert.deepEqual([open.state, open.required, open.details], ["not_started", false, [EMAIL_NOT_ANSWERED_SENTENCE]]);
  assert.deepEqual(open.verb, { label: "Choose the address", to: "admin/integrations" });
  const on = setupRow({ ready: true, domain: "mail.chanlytics.com", mailbox: MAILBOX });
  assert.deepEqual([on.state, on.required], ["ready", false]);
  assert.equal(on.sentence, `Customers write to ${MAILBOX.address}, and their emails arrive in your Inbox.`);
  assert.deepEqual(
    on.details,
    ["Last email 2h ago", EMAIL_ELSEWHERE_SENTENCE],
    "what the product cannot see is said where email is set up",
  );
  const before = setupSteps(bare(undefined), NOW);
  const after = setupSteps(bare({ ready: true, domain: "mail.chanlytics.com", mailbox: null }), NOW);
  assert.equal(
    after.readiness.answering,
    before.readiness.answering,
    "email does not decide whether the receptionist answers",
  );
});

/**
 * An email that could not be taken in. The mailbox carries the sentence (jobs
 * settle.ts writes it, db stampMailboxReceived clears it on the next email in),
 * and the two surfaces read the same fact for their two different questions.
 */
const TROUBLE = "An email could not be taken in. Anything since then is in your Inbox as usual.";

test("a mailbox that could not take an email in says so on Connections, and keeps the verb it had", () => {
  const hurt = connections({
    ready: true,
    domain: "mail.chanlytics.com",
    mailbox: { ...MAILBOX, last_error: TROUBLE },
  });
  assert.deepEqual([hurt.state, hurt.stateWords, hurt.detail], ["attention", "Waiting on us", MAILBOX.address]);
  assert.equal(
    hurt.sentence,
    `${TROUBLE} Customers write to this address and you reply from the Inbox, as Best Movers. Last email 2h ago.`,
  );
  assert.deepEqual(
    hurt.verb,
    { label: "Change the name", to: "verb:email-setup", who: "owner" },
    "it is ours to fix: the owner is told, not given a job",
  );
  // Nothing wrong reads exactly as it did before there was a column to read.
  const well = connections({ ready: true, domain: "mail.chanlytics.com", mailbox: MAILBOX });
  assert.deepEqual([well.state, well.stateWords], ["connected", "On"]);
  assert.doesNotMatch(well.sentence, /could not be taken in/);
});

test("Setup keeps saying the channel is set up, because it is, and carries the trouble as a detail", () => {
  const hurt = setupRow({ ready: true, domain: "mail.chanlytics.com", mailbox: { ...MAILBOX, last_error: TROUBLE } });
  assert.equal(hurt.state, "ready", "Setup answers whether it is SET UP; Connections answers whether it is working");
  assert.deepEqual(hurt.details, [TROUBLE, "Last email 2h ago", EMAIL_ELSEWHERE_SENTENCE]);
  // A mailbox with trouble and nothing ever received still says both things.
  const never = setupRow({
    ready: true,
    domain: "mail.chanlytics.com",
    mailbox: { ...MAILBOX, last_received_at: null, last_error: TROUBLE },
  });
  assert.deepEqual(never.details, [TROUBLE, "Nothing received yet", EMAIL_ELSEWHERE_SENTENCE]);
});

test("the deployment's mail domain: one reading for the edge and the dashboard, lower-cased, or off", () => {
  assert.equal(emailDomainOf("mail.chanlytics.com"), "mail.chanlytics.com");
  assert.equal(emailDomainOf("  Mail.Chanlytics.COM \n"), "mail.chanlytics.com", "as a variable is often pasted");
  for (const off of [undefined, null, "", "   ", "localhost", "https://mail.chanlytics.com", "sam@mail.chanlytics.com"])
    assert.equal(emailDomainOf(off), null, String(off));
});
