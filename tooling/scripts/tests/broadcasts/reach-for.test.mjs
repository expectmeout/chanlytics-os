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

/** A person as the pick reads them: a yes on WhatsApp and by text kept, a number, an address, where they last wrote. */
const YES = {
  state: "opted_in",
  dnc: false,
  marketing: "unknown",
  channels: ["whatsapp", "sms"],
  marketingChannels: null,
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
  const how = { channels: ALL, ready: READY };
  assert.deepEqual(reachFor(person(), "conversational", how), { channel: "whatsapp", held: null });
  assert.deepEqual(reachFor(person({ lastChannel: "sms" }), "conversational", how), { channel: "sms", held: null });
  assert.deepEqual(
    reachFor(person({ lastChannel: "email" }), "conversational", how),
    { channel: "email", held: null },
    "an email about their visit needs no yes, only an address",
  );
  // The channel they last wrote on is first only where the campaign ticks it.
  assert.deepEqual(
    reachFor(person({ lastChannel: "sms" }), "conversational", { channels: ["whatsapp", "email"], ready: READY }),
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
  // A yes to nothing yet: an email about their visit still reaches them; with no address, held for the yes.
  const noYes = person({ consent: { state: "unknown", channels: null } });
  assert.deepEqual(reachFor(noYes, "conversational", how), { channel: "email", held: null });
  assert.deepEqual(reachFor({ ...noYes, email: null }, "conversational", how), { channel: null, held: "no_yes" });
  // A STOP stops every channel, and is the strictest reason.
  assert.deepEqual(reachFor(person({ consent: { state: "opted_out" } }), "conversational", how), {
    channel: null,
    held: "stopped",
  });
  // Nowhere to send on the only channel ticked.
  assert.deepEqual(reachFor({ ...person(), email: null }, "conversational", { channels: ["email"], ready: READY }), {
    channel: null,
    held: "no_address",
  });
  // An offer by text or email is never a channel: only WhatsApp is left, and their yes to offers is missing.
  assert.deepEqual(reachFor(person(), "marketing", how), { channel: null, held: "no_yes" });
  assert.deepEqual(reachFor(person(), "marketing", { channels: ["sms", "email"], ready: READY }), {
    channel: null,
    held: "no_channel",
  });
  // A channel the workspace cannot send on now is passed over, never sent on.
  const noLine = { ...READY, sms: { ready: false, why: CHANNEL_WORDS.noTextLine } };
  assert.deepEqual(reachFor(person({ lastChannel: "sms" }), "conversational", { channels: ALL, ready: noLine }), {
    channel: "whatsapp",
    held: null,
  });
});

test("an address that has bounced is no address: the pick falls back to another channel instead of choosing email and being refused at the door", () => {
  const how = { channels: ALL, ready: READY };
  const bounced = (over) => person({ emailSuppressed: true, ...over });
  // They last wrote by email, but that address is dead: WhatsApp, where their yes covers it.
  assert.deepEqual(reachFor(bounced({ lastChannel: "email" }), "conversational", how), {
    channel: "whatsapp",
    held: null,
  });
  // No yes on WhatsApp or by text, and an email about their visit needs none: with the address dead, nothing is left.
  const onlyEmail = bounced({ consent: { state: "unknown", channels: null } });
  assert.deepEqual(reachFor(onlyEmail, "conversational", how), { channel: null, held: "no_yes" });
  // The only channel ticked is email: held for the address, which is the owner's to fix.
  assert.deepEqual(reachFor(bounced(), "conversational", { channels: ["email"], ready: READY }), {
    channel: null,
    held: "no_address",
  });
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
  const how = { channels: ALL, ready: READY };
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
