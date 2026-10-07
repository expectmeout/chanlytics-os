/**
 * One received email, taken in: the verb, run over fakes that record their
 * calls, so what is proved is what it does, in what order, and what it never
 * does -- not the adapter's text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { ingestEmail, EMAIL_REVIEW_WORDS, EMAIL_BODY_MAX } = await importSrc(
  "packages/core/src/messages/email-ingest.ts",
);

const T = "t1";
const NOW = Date.parse("2026-09-17T12:00:00Z");
const MAILBOX = { id: "mb1", tenant_id: T, address: "bestmovers@mail.chanlytics.com" };
const email = (over = {}) => ({
  id: "rcv_1",
  from: { address: "Ana@Example.com", name: "Ana Reyes" },
  to: [MAILBOX.address],
  cc: [],
  subject: "Quote for Saturday",
  text: "Can you do Saturday at 9?",
  messageId: "<q1@customer.example>",
  inReplyTo: null,
  references: [],
  receivedAt: "2026-09-17T11:59:00Z",
  claim: "person",
  attachments: [],
  // The receiving side proved the sender (channels senderAuthenticated): a normal email here; a case that says no overrides it.
  senderAuthenticated: true,
  ...over,
});

/** Ports that answer what they are told and log every call by name. */
function world(over = {}) {
  const log = [];
  const answers = {
    mailbox: MAILBOX,
    fetch: email(),
    erasedBefore: false,
    ours: false,
    record: { message_id: "m1", conversation_id: "c1", is_new: true, processed: false },
    escalate: "opened",
    tell: undefined,
    // Not a reach-out's reply: the intake as it was before Part 5 (reach-out-replies/reply-intake.test.mjs has the rest).
    reachOutReply: false,
    readReply: undefined,
    markProcessed: undefined,
    received: undefined,
    // A booking tool's notice (00345): the read scheduled once per delivery, and whether a forward's sender is a member.
    readBooking: undefined,
    memberAddress: false,
    // Gmail's confirmation of a forward here, kept on the mailbox for Settings to show.
    keepForwarding: undefined,
    ...over,
  };
  const ports = { now: () => NOW };
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, log, ops: () => log.map((l) => l[0]), call: (name) => log.find((l) => l[0] === name) };
}
const run = (w) => ingestEmail(w.ports, { payload: { mailbox_id: "mb1", received_id: "rcv_1" } });

test("an email from a person is kept under their address in one spelling, flagged for a person, told once, and only then marked handled", async () => {
  const w = world();
  assert.equal(await run(w), "kept_for_a_person");
  assert.deepEqual(w.ops(), [
    "mailbox",
    "fetch",
    "ours",
    "erasedBefore",
    "record",
    "reachOutReply",
    "escalate",
    "tell",
    "markProcessed",
    "received",
  ]);
  const [, kept] = w.call("record");
  assert.equal(kept.address, "ana@example.com", "normalizeEmail's spelling, which is what a person is stored under");
  assert.equal(kept.receivedId, "rcv_1", "the provider's id is the replay gate, never the sender's own Message-ID");
  assert.equal(kept.body, "Can you do Saturday at 9?");
  assert.equal(kept.channelTs, "2026-09-17T11:59:00Z");
  assert.deepEqual(kept.meta.email, {
    subject: "Quote for Saturday",
    message_id: "<q1@customer.example>",
    in_reply_to: null,
    references: [],
    from: "Ana@Example.com",
    from_name: "Ana Reyes",
    to: [MAILBOX.address],
    cc: [],
    claim: "person",
    attachments: [],
    more_attachments: 0,
    truncated: false,
  });
  assert.deepEqual(w.call("escalate"), ["escalate", T, "c1", "email_review", EMAIL_REVIEW_WORDS.person]);
  assert.deepEqual(w.call("tell")[2], {
    conversationId: "c1",
    from: "ana@example.com",
    fromName: "Ana Reyes",
    subject: "Quote for Saturday",
    preview: "Can you do Saturday at 9?",
    claim: "person",
  });
  assert.deepEqual(w.call("erasedBefore"), ["erasedBefore", T, "ana@example.com", "2026-09-17T11:59:00Z"]);
});

test("a claim decides how LITTLE is done: an automatic reply is kept and never flagged; an automated email is flagged in its own words; a report is not a conversation", async () => {
  const auto = world({ fetch: email({ claim: "auto_reply" }) });
  assert.equal(await run(auto), "kept_quietly");
  assert.deepEqual(
    auto.ops(),
    ["mailbox", "fetch", "ours", "erasedBefore", "record", "reachOutReply", "markProcessed", "received"],
    "kept, handled, nobody paged: two responders answering each other is a loop",
  );

  const form = world({ fetch: email({ claim: "automated" }) });
  assert.equal(await run(form), "kept_for_a_person");
  assert.equal(form.call("escalate")[4], EMAIL_REVIEW_WORDS.automated);

  const bounce = world({
    fetch: email({ claim: "report", from: { address: "mailer-daemon@mx.example", name: null } }),
  });
  assert.equal(await run(bounce), "not_a_conversation");
  assert.equal(
    bounce.ops().includes("record"),
    false,
    "nothing is kept as a person's words, and nothing here suppresses an address: that is the provider's signed receipt",
  );
});

test("a booking tool's notice is read into an appointment, never kept as a thread: trusted from the tool's own proved sender, or from a member's forward by hand; anything else is the automated email it looks like", async () => {
  const notice = (over = {}) =>
    email({
      from: { address: "no-reply@booksy.com", name: "Booksy" },
      subject: "Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
      text: "Dana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM - 5:00 PM\nHair Color: Partial highlight\nwith Sam Ortiz",
      claim: "booking_notice",
      ...over,
    });
  // The tool's own sender, proved by the receiving side: one read scheduled for the delivery, the mailbox stamped, no row.
  const direct = world({ fetch: notice() });
  assert.equal(await run(direct), "kept_as_booking");
  assert.deepEqual(direct.ops(), ["mailbox", "fetch", "ours", "erasedBefore", "readBooking", "received"]);
  assert.deepEqual(direct.call("readBooking"), ["readBooking", T, "mb1", "rcv_1", "booksy"]);
  // The same From, unproved: a forged "booking" writes no visit. It is taken in as an automated email for a person to read.
  const forged = world({ fetch: notice({ senderAuthenticated: false }) });
  assert.equal(await run(forged), "kept_for_a_person");
  assert.equal(forged.ops().includes("readBooking"), false);
  assert.equal(forged.call("escalate")[4], EMAIL_REVIEW_WORDS.automated);
  assert.equal(forged.call("record")[1].meta.email.claim, "booking_notice", "what it claimed is kept beside it");
  // A forward by hand: trusted when the sender is a member of the workspace, whatever the receiving side proved.
  const forwarded = (over = {}) =>
    notice({
      from: { address: "owner@example.com", name: "Owner" },
      subject: "Fwd: Dana Rivera: new booking Thursday, October 8, 2026 3:00 PM",
      text: "---------- Forwarded message ---------\nFrom: Booksy <no-reply@booksy.com>\nDate: Tue, Oct 6, 2026\n\nDana Rivera\n(305) 555-0144\nThursday, October 8, 2026, 3:00 PM - 5:00 PM",
      senderAuthenticated: false,
      ...over,
    });
  const member = world({ fetch: forwarded(), memberAddress: true });
  assert.equal(await run(member), "kept_as_booking");
  assert.deepEqual(member.call("memberAddress"), ["memberAddress", T, "owner@example.com"]);
  const stranger = world({
    fetch: forwarded({ from: { address: "someone@example.net", name: null } }),
    memberAddress: false,
  });
  assert.equal(await run(stranger), "kept_for_a_person");
  assert.equal(stranger.ops().includes("readBooking"), false);
});

test("Gmail asking whether it may forward here is kept on the mailbox for Settings to show, never as a thread: from Google's own proved sender only", async () => {
  const confirmation = (over = {}) =>
    email({
      from: { address: "forwarding-noreply@google.com", name: "Gmail Team" },
      subject: "(#4815162) Gmail Forwarding Confirmation - Receive Mail from owner@example.com",
      text: "owner@example.com has requested to automatically forward mail to your email address salon@mail.example.com.\nConfirmation code: 4815162\n\nhttps://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc",
      claim: "forwarding_confirmation",
      ...over,
    });
  const proved = world({ fetch: confirmation() });
  assert.equal(await run(proved), "kept_as_confirmation");
  assert.deepEqual(proved.ops(), ["mailbox", "fetch", "ours", "erasedBefore", "keepForwarding", "received"]);
  assert.deepEqual(proved.call("keepForwarding"), [
    "keepForwarding",
    "mb1",
    {
      account: "owner@example.com",
      code: "4815162",
      link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ8%5D-abc",
    },
  ]);
  // Unproved, a forged one would put a stranger's code in front of the owner: taken in as an automated email instead.
  const forged = world({ fetch: confirmation({ senderAuthenticated: false }) });
  assert.equal(await run(forged), "kept_for_a_person");
  assert.equal(forged.ops().includes("keepForwarding"), false);
  assert.equal(forged.call("escalate")[4], EMAIL_REVIEW_WORDS.automated);
  assert.equal(
    forged.call("record")[1].meta.email.claim,
    "forwarding_confirmation",
    "what it claimed is kept beside it",
  );
});

test("it resumes: a run that died after the row was stored finishes it; a row already handled ends there; a second email on a waiting thread is quiet", async () => {
  const interrupted = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: false } });
  assert.equal(await run(interrupted), "kept_for_a_person");
  assert.deepEqual(
    interrupted.ops().slice(-4),
    ["escalate", "tell", "markProcessed", "received"],
    "REGRESSION guard: 'seen it, skip it' would have left this email stored and shown to nobody",
  );

  const done = world({ record: { message_id: "m1", conversation_id: "c1", is_new: false, processed: true } });
  assert.equal(await run(done), "already_handled");
  assert.equal(done.ops().includes("escalate"), false);

  const second = world({ escalate: "refreshed" });
  assert.equal(await run(second), "kept_for_a_person");
  assert.equal(second.ops().includes("tell"), false, "told once per hold, not once per email");
});

test("kept and not flagged is an email nobody will be shown: the job fails, the row stays unhandled, and the next try flags it", async () => {
  const w = world({ escalate: "failed" });
  await assert.rejects(run(w), /could not be flagged for a person/);
  assert.equal(w.ops().includes("markProcessed"), false);
});

test("what is not taken in, and why: our own email coming back, an email that belongs to an erasure, one with no sender, one the provider no longer has, a mailbox that is gone", async () => {
  const byId = world({ ours: true });
  assert.equal(await run(byId), "our_own");
  assert.deepEqual(byId.call("ours"), ["ours", T, "<q1@customer.example>"]);
  const bySender = world({
    fetch: email({ from: { address: "BestMovers@mail.chanlytics.com", name: null }, messageId: null }),
  });
  assert.equal(await run(bySender), "our_own");
  assert.equal(bySender.ops().includes("ours"), false, "no Message-ID to look up, and none needed");

  const erased = world({ erasedBefore: true });
  assert.equal(await run(erased), "erased_person");
  assert.equal(
    erased.ops().includes("record"),
    false,
    "received before they asked to be forgotten: taking it in late would make them again",
  );

  for (const from of [null, { address: "not an address", name: null }])
    assert.equal(await run(world({ fetch: email({ from }) })), "no_sender");
  assert.equal(await run(world({ fetch: null })), "gone");
  assert.equal(await run(world({ mailbox: null })), "gone");
  await assert.rejects(ingestEmail(world().ports, { payload: { mailbox_id: "mb1" } }), /received_id are required/);
  await assert.rejects(
    run(
      world({
        fetch: () => {
          throw new Error("resend: 503");
        },
      }),
    ),
    /resend: 503/,
    "could not ask is not gone: the job fails and the ledger tries again",
  );
});

test("a thread keeps a bounded amount of one email's words and attachments, and says when it kept less than there was", async () => {
  const many = Array.from({ length: 8 }, (_, i) => ({
    filename: `f${i}.pdf`,
    contentType: "application/pdf",
    size: 1000,
  }));
  const w = world({ fetch: email({ text: "x".repeat(EMAIL_BODY_MAX + 50), attachments: many }) });
  await run(w);
  const [, kept] = w.call("record");
  assert.equal(kept.body.length, EMAIL_BODY_MAX);
  assert.equal(kept.meta.email.truncated, true);
  assert.equal(kept.meta.email.attachments.length, 5);
  assert.equal(kept.meta.email.more_attachments, 3);
  assert.equal(w.call("tell")[2].preview.length, 280);
});

test("a STOP by email is passed to the ingest as the opt-out, as a text's is: judged on the reply's own words, never the history under them", async () => {
  const optOutOf = async (text) => {
    const w = world({ fetch: email({ text }) });
    await run(w);
    return w.call("record")[1].optOut;
  };
  const history = "On Tue, Sep 16, 2026 at 10:44 AM Best Movers <bestmovers@mail.chanlytics.com> wrote:";

  for (const [words, text] of [
    ["STOP alone", "STOP"],
    ["any case, with a full stop", "  Stop. "],
    ["BAJA, the Spanish word", "baja"],
    ["ALTO", "alto"],
    ["above the quoted appointment email", `STOP\n\n${history}\n> Your appointment is tomorrow at 9.`],
    ["above a signature", "STOP\n\nSent from my iPhone"],
    ["above a sign-off rule", "STOP\n-- \nAna Reyes"],
    ["above Outlook's divider", "STOP\n\n-----Original Message-----\nFrom: Best Movers\nYour appointment is tomorrow."],
  ])
    assert.equal(await optOutOf(text), true, words);

  for (const [words, text] of [
    ["a booking sentence", "stop by at 4?"],
    ["words around it", "Please stop"],
    ["a thank-you over a quoted STOP: the quote is not theirs", `Thanks!\n\n${history}\n> STOP`],
    ["a quote line alone is nobody's words", "> STOP"],
    ["CANCEL and END are a text line's words; by email they are a booking", "Cancel"],
    ["UNSUBSCRIBE is not a STOP: it ends offers, and nothing else (the spec's decision 12)", "Unsubscribe"],
    ["no words", ""],
    ["no text at all", null],
  ])
    assert.equal(await optOutOf(text), false, words);
});

test("a START by email is the way back from a STOP: taken as the yes a text's START is, from a proven sender alone, on the reply's own words", async () => {
  const optInOf = async (text, over = {}) => {
    const w = world({ fetch: email({ text, senderAuthenticated: true, ...over }) });
    await run(w);
    return w.call("record")[1].optIn;
  };
  const history = "On Tue, Sep 16, 2026 at 10:44 AM Best Movers <bestmovers@mail.chanlytics.com> wrote:";
  for (const [words, text] of [
    ["START alone", "START"],
    ["any case, with a full stop", "  Start. "],
    ["UNSTOP", "unstop"],
    ["RESUME", "Resume"],
    ["ALTA, the Spanish word", "alta"],
    ["above the quoted email", `START\n\n${history}\n> You will not hear from us again.`],
  ])
    assert.equal(await optInOf(text), true, words);
  for (const [words, text] of [
    ["a sentence", "When do you start?"],
    ["a quote of an earlier START is not theirs", `Thanks!\n\n${history}\n> START`],
    ["YES OFFERS is the yes to offers, another answer", "YES OFFERS"],
    ["STOP", "STOP"],
    ["no words", ""],
  ])
    assert.equal(await optInOf(text), false, words);
  // A yes widens what may be sent: a From anyone can write does not give it, and neither does a program's mail.
  assert.equal(
    await optInOf("START", { senderAuthenticated: false }),
    false,
    "an unproven sender's START is not taken",
  );
  assert.equal(await optInOf("START", { senderAuthenticated: undefined }), false, "nor one nothing was said about");
  assert.equal(await optInOf("START", { claim: "auto_reply" }), false, "nor a responder's");
});

test("a person's own email from a proven sender says their address works, whatever it says: that is what lifts a hard bounce, and a program's or an unproven sender's mail does not", async () => {
  const provenOf = async (over) => {
    const w = world({ fetch: email({ text: "Can I come Saturday?", ...over }) });
    await run(w);
    return w.call("record")[1].fromThemProven;
  };
  assert.equal(await provenOf({ senderAuthenticated: true }), true);
  assert.equal(
    await provenOf({ senderAuthenticated: true, text: "STOP" }),
    true,
    "a STOP came from a working address too",
  );
  assert.equal(await provenOf({ senderAuthenticated: false }), false, "a From anyone can write proves nothing");
  assert.equal(await provenOf({ senderAuthenticated: undefined }), false, "nor one nothing was said about");
  assert.equal(
    await provenOf({ senderAuthenticated: true, claim: "auto_reply" }),
    false,
    "a responder is not the person",
  );
  assert.equal(await provenOf({ senderAuthenticated: true, claim: "automated" }), false);
});

/** What the intake handed the ingest for an email's words: the three answers it may carry, and the words quoted. */
const saidOf = async (text, over = {}) => {
  const w = world({ fetch: email({ text, ...over }) });
  await run(w);
  const { optOut, unsubscribe, optInOffers, words } = w.call("record")[1];
  return { optOut, unsubscribe, optInOffers, words };
};
const HISTORY = "On Tue, Sep 16, 2026 at 10:44 AM Best Movers <bestmovers@mail.chanlytics.com> wrote:";

test("an UNSUBSCRIBE by email ends offers through the unsubscribe door, and is no STOP: the reply's own words only, quoted as they were", async () => {
  for (const [words, text, quoted] of [
    ["alone", "Unsubscribe", "Unsubscribe"],
    ["politely", "  Please unsubscribe me. ", "Please unsubscribe me."],
    ["in Spanish", "desuscribirme", "desuscribirme"],
    ["above the quoted offer", `unsubscribe\n\n${HISTORY}\n> Our October offer`, "unsubscribe"],
  ])
    assert.deepEqual(
      await saidOf(text),
      { optOut: false, unsubscribe: true, optInOffers: false, words: quoted },
      words,
    );
  // A sentence about something else, a quote of an earlier unsubscribe, and no words at all are no unsubscribe.
  for (const [words, text] of [
    ["a question", "Can I unsubscribe from the monthly one only?"],
    ["a quote line", "> unsubscribe"],
    ["a thank-you over a quoted unsubscribe", `Thanks!\n\n${HISTORY}\n> unsubscribe`],
    ["no words", ""],
  ])
    assert.equal((await saidOf(text)).unsubscribe, false, words);
  // A STOP is the all-channel stop, alone: it says nothing of offers.
  const stop = await saidOf("STOP");
  assert.deepEqual([stop.optOut, stop.unsubscribe, stop.optInOffers], [true, false, false]);
});

test("YES OFFERS by email is the yes to offers by email, from a person and nobody else: not a list, not a program, not a From the receiving side did not PROVE (failed, absent or unreadable); never a START", async () => {
  for (const text of ["YES OFFERS", "  yes offers. ", "SÍ OFERTAS", "si ofertas"])
    assert.equal((await saidOf(text)).optInOffers, true, text);
  assert.equal(
    (await saidOf(`YES OFFERS\n\n${HISTORY}\n> Reply YES OFFERS for our deals`)).optInOffers,
    true,
    "above the quoted offer",
  );
  // Their words only: a quoted invitation, a sentence, a bare yes, or a START is no yes to offers.
  for (const [words, text] of [
    ["the quoted invitation under their thanks", `Thanks\n\n${HISTORY}\n> Reply YES OFFERS for our deals`],
    ["a sentence", "yes offers please"],
    ["a bare yes", "yes"],
    ["START, which a header anyone can forge does not give", "START"],
  ])
    assert.equal((await saidOf(text)).optInOffers, false, words);
  // From a person only, and never from an address whose authentication failed: a yes widens what may be sent.
  assert.equal((await saidOf("YES OFFERS", { claim: "automated" })).optInOffers, false, "a list or a program");
  assert.equal((await saidOf("YES OFFERS", { claim: "auto_reply" })).optInOffers, false);
  assert.equal(
    (await saidOf("YES OFFERS", { senderAuthenticated: false })).optInOffers,
    false,
    "a From the receiving side did not prove: failed, or nothing said",
  );
  assert.equal(
    (await saidOf("YES OFFERS", { senderAuthenticated: undefined })).optInOffers,
    false,
    "FAILS CLOSED: an email with no proof recorded is not a proven one",
  );
  assert.equal((await saidOf("YES OFFERS", { senderAuthenticated: true })).optInOffers, true);
  // A no only narrows, so it is taken whoever the sender claims to be, proved or not.
  assert.equal((await saidOf("Unsubscribe", { senderAuthenticated: false })).unsubscribe, true);
  assert.equal((await saidOf("Unsubscribe", { claim: "automated" })).unsubscribe, true);
  assert.equal((await saidOf("STOP", { senderAuthenticated: false })).optOut, true);
});

test("a yes that is not recorded for want of a proven sender is said in the log, once, by name; a proven one, a no and plain mail say nothing", async () => {
  const said = [];
  const warn = console.warn;
  console.warn = (...args) => said.push(args);
  try {
    const run1 = (text, over) => {
      said.length = 0;
      return saidOf(text, over).then(() => said.map((a) => JSON.parse(a[0])));
    };
    const unproven = await run1("YES OFFERS", { senderAuthenticated: false });
    assert.deepEqual(
      unproven.map((l) => [l.event, l.tenant_id, l.message_id]),
      [["email_yes_unauthenticated", T, "m1"]],
    );
    assert.deepEqual(await run1("YES OFFERS", { senderAuthenticated: true }), [], "a proven yes is recorded, quietly");
    assert.deepEqual(await run1("Unsubscribe", { senderAuthenticated: false }), [], "a no is never refused for it");
    assert.deepEqual(await run1("Can you do Saturday?", { senderAuthenticated: false }), [], "plain mail says no yes");
    assert.deepEqual(
      await run1("YES OFFERS", { claim: "automated", senderAuthenticated: false }),
      [],
      "a program's mail is not a yes",
    );
    assert.deepEqual(await run1("STOP", { senderAuthenticated: false }), []);
  } finally {
    console.warn = warn;
  }
});
