/**
 * One reachability rule everywhere (One message, every channel, the review's item 7). People's rows and lists, Today's
 * leaks, the empty-audience refusal and the proposal follow-up's stand each asked WhatsApp alone (a constant of consent-channels.ts, gone);
 * each now asks what a send asks (contracts reachFor), of every channel at once, against what the workspace can send on
 * now (reach-any.ts). Over real rows -- the database's columns through toPersonRowVM -- so what is proved is the page's
 * own answer: an email-only person is reachable for a message where email is set up and not where it is not, a text-only
 * yes counts where the text line is active, a read that failed counts WhatsApp alone as every page did, and an offer
 * still needs WhatsApp (texts carry none, email's wait for their release).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { daysAgo, personDto, personRow, ROW_NOW, ROW_TZ } from "./_person-row.mjs";

import {
  NO_CHANNEL_REACH,
  NO_NUMBER_REACH,
  PEOPLE_LISTS,
  READY_WHATSAPP_ALONE,
  answeredYes,
  channelsReady,
  emptyAudienceRefusal,
  noChannelWords,
  noNumberWords,
  peopleListAction,
  personReachOf,
  reachCountsOf,
  readyOrWhatsApp,
  savedListAction,
} from "@chanlytics/contracts";

const { peopleSurfaceOf } = await importSrc("apps/dashboard/src/surfaces/people/surface-map.ts");
const { cmReadyOf } = await importSrc("apps/dashboard/src/surfaces/campaigns/parts/channels.ts");

const WA = { canSend: true, refusal: null };
const LINE = { sms_state: "active", reg_mock: false };
/** What the workspace can send on, as channelsReady says it: WhatsApp by default, a texting line and a mailbox when asked. */
const ready = ({ whatsapp = true, text = false, email = false, offers = false } = {}) =>
  channelsReady({
    whatsapp: whatsapp ? WA : null,
    textLine: text ? LINE : null,
    // `offers`: the campaigns domain verified, the address on file, no pause: what the business's own news by email waits for
    // as an offer does (decision D2).
    email: {
      mailbox: email,
      domain: email,
      ...(offers ? { offers: { campaigns: true, address: true, paused: null } } : {}),
    },
  });

/** A person with an address and no number, whose only way to be reached is email. */
const emailOnly = (over = {}) => ({ phone_e164: null, email: "ana@example.com", ...over });
/** A yes to hearing from the business, given by a START on a text: it covers the text line alone. */
const TEXT_YES = { consent: "opted_in", consent_source: "customer_message", consent_channels: ["sms"] };
/** A yes to offers, in writing, on the sign-up form: it covers WhatsApp (and, by a text of theirs, the text too). */
const OFFERS_YES = {
  marketing_consent: "opted_in",
  marketing_consent_source: "form",
  marketing_consent_updated_at: "2026-09-10T00:00:00.000Z",
  marketing_channels: ["whatsapp"],
};

const list = (id) => PEOPLE_LISTS.find((l) => l.id === id);

test("the constant that made every page ask WhatsApp alone is gone, and the one fallback for channels not read is WhatsApp alone", () => {
  // Spelled in pieces, so the name is written nowhere in the tree.
  const gone = ["CAMPAIGNS", "CHANNEL"].join("_");
  assert.equal(gone in contracts, false, "no page asks WhatsApp by a constant any more");
  assert.deepEqual(
    [readyOrWhatsApp(null), readyOrWhatsApp(undefined)],
    [READY_WHATSAPP_ALONE, READY_WHATSAPP_ALONE],
    "a read that failed, or a page cached before the read was published",
  );
  const read = ready({ email: true });
  assert.equal(readyOrWhatsApp(read), read, "a read stands as it is");
  assert.deepEqual(
    cmReadyOf(null),
    READY_WHATSAPP_ALONE,
    "the composers count a failed read the same way: one fallback",
  );
  assert.equal(cmReadyOf(read), read);
  assert.deepEqual(
    Object.entries(READY_WHATSAPP_ALONE).map(([c, r]) => [c, r.ready]),
    [
      ["whatsapp", true],
      ["sms", false],
      ["email", false],
    ],
    "WhatsApp can send, and the others are not checked, so not counted",
  );
});

test("an email-only person can be sent a message where email is set up, and is not where it is not: the row says why, in reachFor's reasons", () => {
  const mail = personRow(emailOnly(), { ready: ready({ email: true }) });
  assert.deepEqual(
    [mail.canReceive.messages, mail.whyNot.messages],
    [true, null],
    "an address the mailbox can send to is a way to reach them: no number is not what is missing",
  );
  const noMailbox = personRow(emailOnly(), { ready: ready() });
  assert.deepEqual(
    [noMailbox.canReceive.messages, noMailbox.whyNot.messages],
    [false, "no_number"],
    "email is not set up: WhatsApp needs a number, and they have none",
  );
  // A page that could not read the workspace's channels counts as before the channels were: WhatsApp alone.
  const unread = personRow(emailOnly(), { ready: null });
  assert.deepEqual([unread.canReceive.messages, unread.whyNot.messages], [false, "no_number"]);
  // An address that has bounced is no address: the door would refuse it.
  const bounced = personRow(emailOnly({ email_suppressed_at: "2026-09-12T00:00:00.000Z" }), {
    ready: ready({ email: true }),
  });
  assert.equal(bounced.canReceive.messages, false);
  assert.equal(bounced.whyNot.messages, "no_number");
  // Their yes is still theirs: it does not move with the workspace's channels (answeredYes), nor does a stop.
  const asked = personRow(emailOnly({ consent: "unknown" }), { ready: ready({ email: true }) });
  assert.deepEqual(
    [asked.saidYes.messages, asked.canReceive.messages],
    [false, true],
    "an email about a visit asks no yes",
  );
  // A row's "can get your messages" is the visit and proposal moments' (theirs, decision D1). The business's own news by
  // email, a broadcast's, asks more of the same person, a yes covering email or dealings with the business, and says so.
  const byEmail = { channels: ["email"], ready: ready({ email: true, offers: true }) };
  assert.deepEqual(contracts.reachFor(asked, "conversational", { ...byEmail, about: "theirs" }), {
    channel: "email",
    held: null,
  });
  assert.deepEqual(contracts.reachFor(asked, "conversational", { ...byEmail, about: "ours" }), {
    channel: null,
    held: "no_yes",
  });
  // Where the workspace's offers by email are not open, the news has no channel at all (decision D2): it waits for them as an
  // offer does, and their visit's message does not.
  const closed = { channels: ["email"], ready: ready({ email: true }) };
  assert.deepEqual(contracts.reachFor(asked, "conversational", { ...closed, about: "ours" }), {
    channel: null,
    held: "no_channel",
  });
  assert.deepEqual(contracts.reachFor(asked, "conversational", { ...closed, about: "theirs" }), {
    channel: "email",
    held: null,
  });
  const stopped = personRow(emailOnly({ consent: "opted_out", dnc: true }), { ready: ready({ email: true }) });
  assert.deepEqual([stopped.canReceive.messages, stopped.whyNot.messages], [false, "stopped"]);
});

test("a text-only yes counts where the text line is active, and is still a yes where it is not", () => {
  const active = personRow(TEXT_YES, { ready: ready({ text: true }) });
  assert.deepEqual([active.canReceive.messages, active.whyNot.messages], [true, null], "their yes covers the line");
  const noLine = personRow(TEXT_YES, { ready: ready() });
  assert.deepEqual(
    [noLine.canReceive.messages, noLine.whyNot.messages],
    [false, "no_yes"],
    "WhatsApp is not what they said yes to",
  );
  assert.equal(noLine.saidYes.messages, true, "they said yes: what they said does not move with the workspace's lines");
  // Counted by WhatsApp alone where the channels were not read: the text yes is not WhatsApp's.
  assert.equal(personRow(TEXT_YES, { ready: null }).canReceive.messages, false);
  // The list is what they said (it was WhatsApp's yes alone before), whatever the workspace can send on.
  assert.equal(list("opted_in").test(noLine), true, "Said yes to messages: they did");
  // A person whose yes covers WhatsApp reaches there on a workspace with WhatsApp, as before.
  const wa = personRow({ consent: "opted_in" }, { ready: null });
  assert.deepEqual([wa.canReceive.messages, wa.whyNot.messages], [true, null]);
});

test("an offer still needs WhatsApp: texts carry none, and email's wait for their release", () => {
  const yes = { ...OFFERS_YES, marketing_channels: ["whatsapp", "sms"], email: "ana@example.com" };
  const everything = ready({ text: true, email: true });
  const all = personRow(yes, { ready: everything });
  assert.deepEqual([all.canReceive.offers, all.whyNot.offers, all.saidYes.offers], [true, null, true], "by WhatsApp");
  // WhatsApp cannot send (no number connected, or one Meta will not let send): the text line is open, and carries none.
  const textOnly = personRow(yes, { ready: ready({ whatsapp: false, text: true, email: true }) });
  assert.deepEqual(
    [textOnly.canReceive.offers, textOnly.whyNot.offers],
    [false, "no_channel"],
    "no channel this offer can go by: not for want of a number, nor of a yes",
  );
  assert.equal(textOnly.saidYes.offers, true, "their yes to offers stands");
  assert.equal(textOnly.canReceive.messages, true, "a message about a visit still goes, by the address they have");
  // Someone who can only be reached by email gets no offer: it needs WhatsApp, and a number for it.
  const byMail = personRow(emailOnly({ ...OFFERS_YES, marketing_consent_source: "customer_message" }), {
    ready: everything,
  });
  assert.deepEqual([byMail.canReceive.offers, byMail.whyNot.offers], [false, "no_number"]);
  // A page that could not read the channels counts as before: WhatsApp alone, so an offer reaches whoever it did.
  const unread = personRow(yes, { ready: null });
  assert.deepEqual([unread.canReceive.offers, unread.whyNot.offers], [true, null]);
});

test("the rows' facts are one derivation: reachability, the answer given, and why not, from the same call", () => {
  for (const over of [
    {},
    emailOnly(),
    TEXT_YES,
    OFFERS_YES,
    { consent: "opted_out", dnc: true },
    { phone_e164: null },
  ]) {
    for (const r of [null, ready(), ready({ text: true, email: true }), ready({ whatsapp: false, email: true })]) {
      const row = personRow(over, { ready: r });
      for (const kind of ["offers", "messages"]) {
        assert.equal(row.canReceive[kind], row.whyNot[kind] === null, `${kind}: can receive is no reason against`);
      }
      assert.deepEqual(row.saidYes, personReachOf(row, r).saidYes, "the row's facts are personReachOf's");
      assert.equal(row.saidYes.offers, answeredYes(row, "marketing"));
      assert.equal(row.saidYes.messages, answeredYes(row, "conversational"));
    }
  }
});

test("the channel a message would reach them on is the send's own pick, so who can hear, by channel, adds up: each person once", () => {
  const everything = ready({ text: true, email: true });
  // A number and an address: one person, reached once, on WhatsApp (the first channel that reaches them).
  const both = personRow({ email: "ana@example.com" }, { ready: everything });
  assert.equal(both.reachedOn, "whatsapp");
  // They last wrote by email: reached there, as a send would reach them (reachFor's order).
  const wroteByMail = personRow({ email: "ana@example.com", last_inbound_channel: "email" }, { ready: everything });
  assert.equal(wroteByMail.reachedOn, "email");
  const mailOnly = personRow(emailOnly(), { ready: everything });
  assert.equal(mailOnly.reachedOn, "email");
  const textOnly = personRow(TEXT_YES, { ready: everything });
  assert.equal(textOnly.reachedOn, "sms");
  // No channel reaches them: none is named, and no message can be received.
  const none = personRow(emailOnly(), { ready: ready() });
  assert.deepEqual([none.reachedOn, none.canReceive.messages], [null, false]);
  // What Campaigns' home counts on: a person is under a channel exactly where a message can be received, and under one.
  const rows = [both, wroteByMail, mailOnly, textOnly, none];
  for (const r of rows) assert.equal(r.reachedOn !== null, r.canReceive.messages);
  const counts = reachCountsOf(rows);
  assert.deepEqual([counts.canHear, counts.byChannel], [4, { whatsapp: 1, sms: 1, email: 2 }]);
  // Where the workspace has no mailbox, WhatsApp still reaches the one with a number, and nothing the one without.
  assert.deepEqual(
    [
      personRow({ email: "ana@example.com" }, { ready: ready() }).reachedOn,
      personRow(emailOnly(), { ready: ready() }).reachedOn,
    ],
    ["whatsapp", null],
  );
});

test("People's lists count the rows' facts: who can be sent an offer moves with what the workspace can send on, and who said yes does not", () => {
  const rosa = (r) => personRow({ ...OFFERS_YES, id: "rosa" }, { ready: r });
  assert.equal(list("offers_ok").test(rosa(ready())), true);
  assert.equal(list("offers_ok").test(rosa(ready({ whatsapp: false, email: true }))), false, "WhatsApp cannot send");
  assert.equal(list("opted_in").test(rosa(ready({ whatsapp: false }))), true, "she still said yes to messages");
  // The step under the list says which it is: a number missing, or no channel to send an offer on now.
  const step = (r, members) =>
    peopleListAction(
      "offers_ok",
      members.map((m) => personRow(m, { ready: r })),
    );
  assert.equal(
    step(ready(), [{ ...OFFERS_YES }]).text,
    "1 of 1 on this list said yes to offers — an offer reaches them.",
  );
  assert.equal(
    step(ready(), [{ ...OFFERS_YES, phone_e164: null }]).text,
    noNumberWords("this list", "marketing"),
    "a yes with no number: said as before, and no door to the yes they gave",
  );
  const noChannel = step(ready({ whatsapp: false, text: true }), [{ ...OFFERS_YES }]);
  assert.equal(noChannel.text, noChannelWords("this list", "marketing"));
  assert.equal(noChannel.text.includes(NO_CHANNEL_REACH), true);
  assert.equal(noChannel.text.includes(NO_NUMBER_REACH), false, "it has a number: that is not what is missing");
  assert.equal(noChannel.enabled, false, "and the broadcast waits");
  // A list kept by hand says it the same way.
  assert.equal(
    savedListAction("s1", [rosa(ready({ whatsapp: false }))]).text,
    noChannelWords("this list", "marketing"),
  );
});

test("the empty-audience refusal says a yes was given by what they said, on any channel: a text-only yes is a yes, with no number to send to", () => {
  const dto = (over) => personRow(over, { ready: ready({ text: true }) });
  assert.equal(
    emptyAudienceRefusal("conversational", "Regulars", [dto(TEXT_YES)], { channels: ["whatsapp"], about: "ours" }),
    noNumberWords("“Regulars”", "conversational"),
    "somebody said yes: what is missing is a way to reach them (it was WhatsApp's yes alone before)",
  );
  assert.match(
    emptyAudienceRefusal("conversational", "Regulars", [dto({ consent: "unknown" })], {
      channels: ["whatsapp"],
      about: "ours",
    }),
    /yes to messages/i,
  );
  assert.match(
    emptyAudienceRefusal("marketing", "Regulars", [dto(TEXT_YES)], { channels: ["whatsapp"], about: "ours" }),
    /yes to offers/i,
    "a yes to messages is not one to offers",
  );
});

test("the People page counts against what the workspace can send on: its lists, their steps and Today's rows are the one answer", () => {
  // Gone quiet, so she is on a list with a broadcast step.
  const rosa = personDto({
    id: "rosa",
    ...OFFERS_YES,
    last_message_at: daysAgo(40),
    last_inbound_at: daysAgo(40),
  });
  const loaded = (channelsReady) => ({
    tz: ROW_TZ,
    people: [rosa],
    page: null,
    saved: [],
    calendar: { state: "none", source: "your calendar" },
    bookingLink: null,
    dealsOn: false,
    consultFirst: false,
    dealPace: null,
    followUp: null,
    channelsReady,
    views: {},
    viewsRead: true,
  });
  const page = (r) => peopleSurfaceOf(loaded(r), null, new Date(ROW_NOW));
  const listed = (p, id) => p.lists.find((l) => l.id === id);
  const sendable = page(ready());
  assert.deepEqual([listed(sendable, "offers_ok").count, listed(sendable, "quiet").action.enabled], [1, true]);
  assert.equal(sendable.rows[0].canReceive.offers, true);
  const noWhatsApp = page(ready({ whatsapp: false, text: true }));
  assert.equal(listed(noWhatsApp, "offers_ok").count, 0, "WhatsApp cannot send: nobody can receive an offer");
  assert.equal(listed(noWhatsApp, "opted_in").count, 1, "and she still said yes to messages");
  const step = listed(noWhatsApp, "quiet").action;
  assert.deepEqual([step.enabled, step.text], [false, noChannelWords("this list", "marketing")]);
  // A read that failed counts as before the channels were: WhatsApp alone, so the page says what it always said.
  assert.equal(listed(page(null), "offers_ok").count, 1);
  assert.equal(listed(page(null), "quiet").action.enabled, true);
});
