/**
 * Which channel a campaign reaches each person on (One message, every channel, step 3; the campaigns-on-every-channel
 * spec, 4.2, 4.5, 4.8): whether the workspace can send on each channel and why not, what a channel never carries, the
 * pick (the channel they last wrote on first, then WhatsApp, text, email; held with the strictest reason), the split a
 * composer says, the audience enrolled with each person's channel, and the month's allowance line.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_MONTH_ALLOWANCE,
  CHANNEL_WORDS,
  DEFAULT_CAMPAIGN_CHANNELS,
  HELD_ON,
  allowanceBeforeSend,
  allowanceLine,
  allowanceLines,
  allowanceRoom,
  audienceTrigger,
  channelChoices,
  channelNeverCarries,
  channelRefuses,
  channelsReady,
  enrolFor,
  heldByAllowance,
  offersNote,
  pastAllowance,
  reachFor,
  reachSplit,
  reachSplitWords,
} from "@chanlytics/contracts";

const READY = channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
const ALL = ["whatsapp", "sms", "email"];

/**
 * A person as the pick reads them: a yes on WhatsApp and by text kept, a number, an address, where they last wrote. They
 * have a relationship on record, as a customer does (they wrote, called, or have a deal), which is what lets an email the
 * business chose to send reach them with no yes covering email (decision D1, consent.ts mayMessageFor): the pick's subject
 * here is the order and the split, not the rule that asks it.
 */
const YES = {
  state: "opted_in",
  dnc: false,
  marketing: "unknown",
  channels: ["whatsapp", "sms"],
  marketingChannels: null,
  relationship: true,
};
const person = ({ consent, ...over } = {}) => ({
  id: "p1",
  phone: "+15550100",
  email: "dani@example.com",
  lastChannel: null,
  ...over,
  consent: { ...YES, ...consent },
});

test("whether the workspace can send on each channel, and the sentence that says why not", () => {
  assert.deepEqual(READY, {
    whatsapp: { ready: true, why: null },
    sms: { ready: true, why: null },
    email: { ready: true, why: null },
  });
  const none = channelsReady({ whatsapp: null, textLine: null, email: { mailbox: false, domain: false } });
  assert.deepEqual(none, {
    whatsapp: { ready: false, why: CHANNEL_WORDS.noWhatsApp },
    sms: { ready: false, why: CHANNEL_WORDS.noTextLine },
    email: { ready: false, why: CHANNEL_WORDS.noEmailDomain },
  });
  const flagged = channelsReady({
    whatsapp: { canSend: false, refusal: "Your number is flagged by WhatsApp." },
    textLine: { sms_state: "active", reg_mock: true },
    email: { mailbox: false, domain: true },
  });
  assert.equal(flagged.whatsapp.why, "Your number is flagged by WhatsApp.", "the number's own refusal");
  assert.equal(flagged.sms.why, CHANNEL_WORDS.textLineMock, "a test filing sends nothing");
  assert.equal(flagged.email.why, CHANNEL_WORDS.noMailbox);
  assert.equal(
    channelsReady({
      whatsapp: null,
      textLine: { sms_state: "registering", reg_mock: false },
      email: { mailbox: true, domain: true },
    }).sms.why,
    CHANNEL_WORDS.textLineNotActive,
  );
  assert.deepEqual([...DEFAULT_CAMPAIGN_CHANNELS], ["whatsapp"], "a campaign made before goes as it went");
});

test("what a channel carries: texts never carry offers; offers by email only once the workspace can send them", () => {
  assert.equal(channelRefuses("sms", "marketing", READY), CHANNEL_WORDS.noOffersByText);
  assert.equal(channelNeverCarries("sms", "marketing"), CHANNEL_WORDS.noOffersByText);
  // A read with no facts about offers (the WhatsApp-alone reading, Ask's) says the campaigns domain: offers by email are closed.
  assert.equal(channelRefuses("email", "marketing", READY), CHANNEL_WORDS.noOffersByEmailYet);
  assert.equal(channelNeverCarries("email", "marketing"), null, "never is only what no workspace can change");
  assert.equal(channelRefuses("whatsapp", "marketing", READY), null);
  for (const c of ALL) assert.equal(channelRefuses(c, "conversational", READY), null, `${c} carries a visit's message`);
  assert.deepEqual(
    channelChoices(READY, "marketing").map((x) => [x.channel, x.ok]),
    [
      ["whatsapp", true],
      ["sms", false],
      ["email", false],
    ],
  );
});

test("the pick: where they last wrote first, then WhatsApp, text, email; each as the campaign ticks and their yes covers", () => {
  // A campaign's own pick: its message is the business's news, ours (decision D1).
  const how = { channels: ALL, ready: READY, about: "ours" };
  assert.deepEqual(reachFor(person(), "conversational", how), { channel: "whatsapp", held: null });
  assert.deepEqual(reachFor(person({ lastChannel: "sms" }), "conversational", how), { channel: "sms", held: null });
  assert.deepEqual(
    reachFor(person({ lastChannel: "email" }), "conversational", how),
    { channel: "email", held: null },
    "an email of the business's own needs a yes covering email or a relationship on record: this person has one (D1)",
  );
  // The channel they last wrote on is first only where the campaign ticks it.
  assert.deepEqual(
    reachFor(person({ lastChannel: "sms" }), "conversational", {
      channels: ["whatsapp", "email"],
      ready: READY,
      about: "ours",
    }),
    {
      channel: "whatsapp",
      held: null,
    },
  );
  // Their yes covers only text: WhatsApp is passed over for the text.
  assert.deepEqual(reachFor(person({ consent: { channels: ["sms"] } }), "conversational", how), {
    channel: "sms",
    held: null,
  });
  // A yes to nothing yet: their relationship still carries an email to them (D1); with no address, held for the yes.
  const noYes = person({ consent: { state: "unknown", channels: null } });
  assert.deepEqual(reachFor(noYes, "conversational", how), { channel: "email", held: null });
  assert.deepEqual(reachFor({ ...noYes, email: null }, "conversational", how), { channel: null, held: "no_yes" });
  // A STOP stops every channel, and is the strictest reason.
  assert.deepEqual(reachFor(person({ consent: { state: "opted_out" } }), "conversational", how), {
    channel: null,
    held: "stopped",
  });
  // Nowhere to send on the only channel ticked.
  assert.deepEqual(
    reachFor({ ...person(), email: null }, "conversational", { channels: ["email"], ready: READY, about: "ours" }),
    {
      channel: null,
      held: "no_address",
    },
  );
  // An offer by text or email is never a channel: only WhatsApp is left, and their yes to offers is missing.
  assert.deepEqual(reachFor(person(), "marketing", how), { channel: null, held: "no_yes" });
  assert.deepEqual(reachFor(person(), "marketing", { channels: ["sms", "email"], ready: READY, about: "ours" }), {
    channel: null,
    held: "no_channel",
  });
  // A channel the workspace cannot send on now is passed over, never sent on.
  const noLine = { ...READY, sms: { ready: false, why: CHANNEL_WORDS.noTextLine } };
  assert.deepEqual(
    reachFor(person({ lastChannel: "sms" }), "conversational", { channels: ALL, ready: noLine, about: "ours" }),
    {
      channel: "whatsapp",
      held: null,
    },
  );
});

test("decision D1 in the pick: by email a campaign's own news needs a yes covering email or a relationship, a visit's message needs an address; an unsubscribe holds the first and not the second", () => {
  const onEmail = (consent, over) =>
    person({
      phone: null,
      lastChannel: null,
      consent: { state: "unknown", channels: null, relationship: false, ...consent },
      ...over,
    });
  const pick = (r, about, channels = ["email"]) => reachFor(r, "conversational", { channels, ready: READY, about });
  const email = { channel: "email", held: null };
  // An address and nothing else (the finder's lead, an address typed in): their visit's message goes, the business's news is held.
  assert.deepEqual(pick(onEmail(), "theirs"), email, "a message about their visit asks no yes");
  assert.deepEqual(
    pick(onEmail(), "ours"),
    { channel: null, held: "no_yes" },
    "the business's news is no visit reminder",
  );
  // A relationship on record (they wrote, called, or have a deal) carries the news with no yes at all.
  assert.deepEqual(pick(onEmail({ relationship: true }), "ours"), email);
  // So does a yes covering email; a yes from before the channels were covers WhatsApp alone, and a yes to texts is not email's.
  assert.deepEqual(pick(onEmail({ state: "opted_in", channels: ["email"] }), "ours"), email);
  assert.deepEqual(pick(onEmail({ state: "opted_in", channels: null }), "ours"), { channel: null, held: "no_yes" });
  assert.deepEqual(pick(onEmail({ state: "opted_in", channels: ["whatsapp", "sms"] }), "ours"), {
    channel: null,
    held: "no_yes",
  });
  // Their unsubscribe from email holds the news, whatever else is on record, and leaves their visit's message alone.
  const unsubscribed = onEmail({
    emailMarketing: "opted_out",
    relationship: true,
    state: "opted_in",
    channels: ["email"],
  });
  assert.deepEqual(pick(unsubscribed, "ours"), { channel: null, held: "unsubscribed" });
  assert.deepEqual(pick(unsubscribed, "theirs"), email);
  // A STOP holds both.
  const stopped = onEmail({ state: "opted_out", relationship: true });
  assert.deepEqual(pick(stopped, "ours"), { channel: null, held: "stopped" });
  assert.deepEqual(pick(stopped, "theirs"), { channel: null, held: "stopped" });
  // Where email is not the only channel, the news falls to the channel their yes covers and never asks email's yes of it.
  const both = person({ lastChannel: "email", consent: { relationship: false } });
  assert.deepEqual(pick(both, "ours", ALL), { channel: "whatsapp", held: null }, "email is passed over for WhatsApp");
  assert.deepEqual(pick(both, "theirs", ALL), email, "their visit's message goes where they last wrote");
  // The split and the enrolment say the same: one pick, three readings.
  const rows = [
    onEmail({}, { id: "a" }),
    onEmail({ relationship: true }, { id: "b" }),
    onEmail({ state: "opted_in", channels: ["email"] }, { id: "c" }),
    onEmail({ emailMarketing: "opted_out", relationship: true }, { id: "d" }),
  ];
  const ours = { channels: ["email"], ready: READY, about: "ours" };
  const theirs = { ...ours, about: "theirs" };
  assert.deepEqual(reachSplit(rows, "conversational", ours), {
    reached: 2,
    byChannel: { whatsapp: 0, sms: 0, email: 2 },
    held: 2,
    heldBy: { no_yes: 1, unsubscribed: 1 },
  });
  assert.deepEqual(reachSplit(rows, "conversational", theirs).byChannel.email, 4, "about their visit, all four");
  assert.deepEqual(
    enrolFor(rows, "everyone", null, null, "conversational", ours).map((e) => [e.row.id, e.channel]),
    [
      ["b", "email"],
      ["c", "email"],
    ],
  );
  assert.deepEqual(
    enrolFor(rows, "everyone", null, null, "conversational", theirs).map((e) => e.row.id),
    ["a", "b", "c", "d"],
  );
});

test("an address that has bounced is no way to reach them: the pick falls back to another channel instead of choosing email and being refused at the door", () => {
  const how = { channels: ALL, ready: READY, about: "ours" };
  const bounced = (over) => person({ emailSuppressed: true, ...over });
  // They last wrote by email, but that address is dead: WhatsApp, where their yes covers it.
  assert.deepEqual(reachFor(bounced({ lastChannel: "email" }), "conversational", how), {
    channel: "whatsapp",
    held: null,
  });
  // No yes on WhatsApp or by text, and their relationship would carry an email (D1): with the address dead, nothing is left.
  const onlyEmail = bounced({ consent: { state: "unknown", channels: null } });
  assert.deepEqual(reachFor(onlyEmail, "conversational", how), { channel: null, held: "no_yes" });
  // The only channel ticked is email: held for the address, which is the owner's to fix. The address is on file and mail
  // to it has stopped, so the reason is not "no address": it says so, and words a correction (heldWords).
  assert.deepEqual(reachFor(bounced(), "conversational", { channels: ["email"], ready: READY, about: "ours" }), {
    channel: null,
    held: "address_stopped",
  });
  assert.deepEqual(reachFor({ ...bounced(), email: null }, "conversational", { channels: ["email"], ready: READY }), {
    channel: null,
    held: "no_address",
  });
  // Among several channels' reasons the strictest is kept (HELD_ON is that order, every reason in it once): a missing yes
  // outranks a missing number, and a number outranks an address that stopped.
  const noYes = bounced({ consent: { state: "unknown", channels: null } });
  const two = { channels: ["whatsapp", "email"], ready: READY };
  assert.deepEqual(reachFor(noYes, "conversational", two), { channel: null, held: "no_yes" });
  assert.deepEqual(reachFor({ ...noYes, phone: null }, "conversational", two), { channel: null, held: "no_number" });
  assert.deepEqual(HELD_ON, [
    "stopped",
    "unsubscribed",
    "no_yes",
    "no_number",
    "no_address",
    "address_stopped",
    "no_channel",
  ]);
  // A good address is still picked (the same person, the flag false or absent).
  assert.deepEqual(reachFor(person({ emailSuppressed: false, lastChannel: "email" }), "conversational", how), {
    channel: "email",
    held: null,
  });
  assert.deepEqual(reachSplit([bounced({ lastChannel: "email" })], "conversational", how).byChannel, {
    whatsapp: 1,
    sms: 0,
    email: 0,
  });
});

test("the split a composer says, and the people a send enrols with each one's channel", () => {
  const how = { channels: ALL, ready: READY, about: "ours" };
  const rows = [
    person({ id: "a" }),
    person({ id: "b", lastChannel: "email" }),
    person({ id: "c", lastChannel: "email" }),
    person({ id: "d", consent: { state: "opted_out" } }),
  ];
  const s = reachSplit(rows, "conversational", how);
  assert.deepEqual(s, { reached: 3, byChannel: { whatsapp: 1, sms: 0, email: 2 }, held: 1, heldBy: { stopped: 1 } });
  assert.equal(reachSplitWords(s), "Reaches 3: 1 on WhatsApp, 2 by email · 1 can't be reached");
  assert.equal(reachSplitWords(reachSplit([person()], "conversational", how)), "Reaches 1 on WhatsApp");
  assert.equal(reachSplitWords(reachSplit([], "conversational", how)), "Reaches nobody");
  assert.deepEqual(
    enrolFor(rows, "everyone", null, null, "conversational", how).map((e) => [e.row.id, e.channel]),
    [
      ["a", "whatsapp"],
      ["b", "email"],
      ["c", "email"],
    ],
  );
});

test("the month's allowance by email and by text, said once half is used", () => {
  assert.deepEqual(CAMPAIGN_MONTH_ALLOWANCE, { email: 2000, sms: 500 });
  assert.equal(allowanceLine("email", 999), null, "under half: a quiet page");
  assert.equal(allowanceLine("email", 1240), "1,240 of 2,000 emails used this month");
  assert.equal(allowanceLine("email", 1000), "1,000 of 2,000 emails used this month", "from exactly half");
  assert.equal(allowanceLine("sms", 250), "250 of 500 texts used this month");
});

test("the head's lines for the month: each channel from half its allowance, emails first, and nothing while both are under or unread", () => {
  assert.deepEqual(allowanceLines(null), [], "a count that could not be read says nothing");
  assert.deepEqual(allowanceLines({ email: 999, sms: 249 }), [], "a quiet page under half");
  assert.deepEqual(allowanceLines({ email: 1240, sms: 249 }), ["1,240 of 2,000 emails used this month"]);
  assert.deepEqual(allowanceLines({ email: 10, sms: 250 }), ["250 of 500 texts used this month"]);
  assert.deepEqual(allowanceLines({ email: 2000, sms: 500 }), [
    "2,000 of 2,000 emails used this month",
    "500 of 500 texts used this month",
  ]);
});

test("the month's allowance holds a broadcast and every moment but a booking one's message about a visit: that always goes, an offer on a booking moment is metered", () => {
  for (const purpose of ["conversational", "marketing"])
    assert.equal(heldByAllowance(null, purpose), true, `a broadcast has no moment, and is held (${purpose})`);
  for (const held of ["quiet_30", "lapsed", "everyone_monthly", "saved_list", "proposal_waiting", "new_week"])
    for (const purpose of ["conversational", "marketing"]) assert.equal(heldByAllowance(held, purpose), true, held);
  // A booking moment's message about a visit is never held: holding one loses it, as the visit passes before the month does.
  for (const free of ["visit_tomorrow", "visited"]) assert.equal(heldByAllowance(free, "conversational"), false, free);
  // The exemption is the MESSAGE's, not the moment's: an offer sent from a booking moment (a playbook made before messages were
  // checked against their moments) is an offer like any other, and is metered.
  for (const booking of ["visit_tomorrow", "visited"])
    assert.equal(heldByAllowance(booking, "marketing"), true, `${booking}: an offer is metered`);
  assert.equal(
    heldByAllowance("a_moment_nobody_made", "conversational"),
    true,
    "a moment this build does not know is held as every run was",
  );
  assert.equal(audienceTrigger({ kind: "playbook", trigger: "visited" }), "visited");
  assert.equal(audienceTrigger({ kind: "everyone" }), null, "a broadcast keeps none");
  assert.equal(audienceTrigger(null), null);
  assert.equal(audienceTrigger("visited"), null, "an audience that is no object names none");
});

test("who of a send is past the month's room: the first keep what room there is, the rest are held on their channel", () => {
  assert.equal(allowanceRoom("email", 1992), 8);
  assert.equal(allowanceRoom("sms", 500), 0);
  assert.equal(allowanceRoom("sms", 700), 0, "never below none");
  const on = (channel, n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `${channel}${from + i}`, channel }));
  const people = [...on("email", 3), ...on("whatsapp", 2), ...on("sms", 2), ...on("email", 2, 3)];
  const ids = (xs) => xs.map((p) => p.id);
  // Room for two emails and one text: the third email on is past it, and so is the second text; WhatsApp is no one's here.
  assert.deepEqual(ids(pastAllowance(people, { email: 1998, sms: 499 }, null, "marketing")), [
    "email2",
    "sms1",
    "email3",
    "email4",
  ]);
  assert.deepEqual(pastAllowance(people, { email: 0, sms: 0 }, null, "marketing"), [], "plenty of room: nobody");
  assert.deepEqual(
    ids(pastAllowance(on("whatsapp", 5), { email: 2000, sms: 500 }, null, "marketing")),
    [],
    "WhatsApp is Meta's tier, never this",
  );
  assert.deepEqual(
    pastAllowance(people, { email: 2000, sms: 500 }, "visit_tomorrow", "conversational"),
    [],
    "a visit reminder always goes",
  );
  assert.deepEqual(
    pastAllowance(people, { email: 2000, sms: 500 }, "visited", "conversational"),
    [],
    "and so does the check after it",
  );
  assert.equal(
    pastAllowance(people, { email: 2000, sms: 500 }, "visited", "marketing").length,
    7,
    "but an offer sent from a booking moment is metered like any other",
  );
  assert.equal(
    pastAllowance(people, { email: 2000, sms: 500 }, "quiet_30", "marketing").length,
    7,
    "a win-back is held",
  );
});

test("said before sending: how many will be held back for want of the month's room, in the product's words", () => {
  const none = { email: 0, sms: 0 };
  const sent = { email: 1992, sms: 100 };
  assert.equal(
    allowanceBeforeSend({ email: 8, sms: 400 }, sent, null, "marketing"),
    null,
    "room for all of it: nothing to say",
  );
  assert.equal(
    allowanceBeforeSend({ email: 12, sms: 0 }, sent, null, "marketing"),
    "Only 8 emails are left this month: 4 of these people will be held back.",
  );
  assert.equal(
    allowanceBeforeSend({ email: 9, sms: 0 }, sent, null, "marketing"),
    "Only 8 emails are left this month: 1 of these people will be held back.",
  );
  assert.equal(
    allowanceBeforeSend({ email: 3, sms: 0 }, { email: 1999, sms: 0 }, null, "marketing"),
    "Only 1 email is left this month: 2 of these people will be held back.",
  );
  assert.equal(
    allowanceBeforeSend({ email: 0, sms: 12 }, { email: 0, sms: 500 }, null, "marketing"),
    "This month's 500 texts are used up: 12 people will be held back.",
  );
  assert.equal(
    allowanceBeforeSend({ email: 1, sms: 0 }, { email: 2000, sms: 0 }, null, "marketing"),
    "This month's 2,000 emails are used up: 1 person will be held back.",
  );
  assert.equal(
    allowanceBeforeSend({ email: 1204, sms: 12 }, { email: 1000, sms: 500 }, null, "marketing"),
    "Only 1,000 emails are left this month: 204 of these people will be held back. This month's 500 texts are used up: 12 people will be held back.",
    "both channels short say both, emails first",
  );
  assert.equal(allowanceBeforeSend(none, sent, null, "marketing"), null, "nobody on either channel");
  assert.equal(
    allowanceBeforeSend({ email: 50, sms: 50 }, null, null, "marketing"),
    null,
    "a count that could not be read says nothing",
  );
  assert.equal(
    allowanceBeforeSend({ email: 50, sms: 50 }, { email: 2000, sms: 500 }, "visit_tomorrow", "conversational"),
    null,
    "a visit's message is never held",
  );
  assert.equal(
    allowanceBeforeSend({ email: 50, sms: 0 }, { email: 2000, sms: 500 }, "visit_tomorrow", "marketing"),
    "This month's 2,000 emails are used up: 50 people will be held back.",
    "an offer from a booking moment is, and the page says so before it goes",
  );
  assert.equal(
    allowanceBeforeSend({ email: 50, sms: 0 }, { email: 2000, sms: 500 }, "quiet_30", "marketing"),
    "This month's 2,000 emails are used up: 50 people will be held back.",
  );
});

test("an email wire the dashboard could not ask the edge about is not offered, and is not guessed ready", () => {
  const f = { whatsapp: null, textLine: null };
  assert.deepEqual(channelsReady({ ...f, email: { mailbox: true, domain: null } }).email, {
    ready: false,
    why: CHANNEL_WORDS.unchecked,
  });
  assert.equal(CHANNEL_WORDS.unchecked, "This could not be checked just now.");
  assert.equal(channelsReady({ ...f, email: { mailbox: true, domain: true } }).email.ready, true);
  assert.equal(channelsReady({ ...f, email: { mailbox: true, domain: false } }).email.why, CHANNEL_WORDS.noEmailDomain);
});

test("a campaign's appointment email is a campaign's, though it carries no unsubscribe: its failure is never a reply's", async () => {
  const { isCampaignEmail, CAMPAIGN_EMAIL_TAG } = await import("@chanlytics/contracts");
  const reply = { headers: {}, tags: [{ name: "cl_message", value: "m1" }] };
  const offer = { headers: { "List-Unsubscribe": "<https://example.com/u/t>" }, tags: [] };
  const reminder = {
    headers: {},
    tags: [
      { name: "cl_message", value: "m2" },
      { name: CAMPAIGN_EMAIL_TAG, value: "broadcast" },
    ],
  };
  assert.equal(isCampaignEmail(reply), false, "a reply to someone who wrote");
  assert.equal(isCampaignEmail(offer), true, "an offer, by its unsubscribe");
  assert.equal(isCampaignEmail(reminder), true, "a broadcast's reminder, by its tag");
  assert.equal(isCampaignEmail(null), false);
});

test("the note under an offer says which channels carry offers, as the workspace's channels make it true: WhatsApp alone until offers by email can go", () => {
  const withOffers = (offers) =>
    channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: { sms_state: "active", reg_mock: false },
      email: { mailbox: true, domain: true, ...(offers ? { offers } : {}) },
    });
  const OPEN = { campaigns: true, address: true, paused: null };
  const alone = offersNote(READY);
  assert.match(alone, /^Offers and news go by WhatsApp only\./);
  assert.match(alone, /registered with the carriers for replies and appointment messages/);
  assert.match(alone, /nothing promotional is sent by text/);
  assert.match(alone, /once they say yes on WhatsApp\.$/);
  // Each way offers by email can be closed leaves the note as it was: the campaigns domain, the address, a pause, a read that failed.
  for (const [what, offers] of [
    ["the campaigns domain is not set up", { ...OPEN, campaigns: false }],
    ["the domain could not be asked", { ...OPEN, campaigns: null }],
    ["the business has no postal address", { ...OPEN, address: false }],
    ["the workspace's offers are paused", { ...OPEN, paused: { at: "2026-10-01T10:00:00Z", reason: "complaints" } }],
  ])
    assert.equal(offersNote(withOffers(offers)), alone, what);
  // Once offers by email can go the note says so, and still says a text carries none: it was false the day the domain verified.
  const open = offersNote(withOffers(OPEN));
  assert.match(open, /^Offers and news go by WhatsApp and by email\./);
  assert.match(open, /nothing promotional is sent by text/);
  assert.match(open, /by email if you have their address/);
  assert.doesNotMatch(open, /WhatsApp only/);
  // It is the ticks' own question, not a second reading of the facts: it says email exactly where the email tick is open for an offer.
  for (const ready of [READY, withOffers(OPEN), withOffers({ ...OPEN, address: false })])
    assert.equal(offersNote(ready).includes("and by email"), channelRefuses("email", "marketing", ready) === null);
});
