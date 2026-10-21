/**
 * New's one-off says what the send screen said (decision 0065 step 7: the screen left, its words moved here), run on the
 * counts as GET playbooks answers them (PoolRead, each moment's, list's and everyone's): who it reaches on the channels it
 * goes by (lib/new-checks.ts newReachOf), and where nobody can, why, by the cure each asks for -- everyone heard from you
 * this week, no channel it goes by can carry it, those who said yes can't be reached, nobody said yes. A closed channel
 * takes back no one's yes (campaign-channels.ts readingFor's fallback keeps it), and a one-off of a message that is no
 * offer to a list, or to everyone, is counted by no yes rather than the wrong one.
 *
 * Then the draft as the page holds it (sequences/new/new-model.ts): the card over a one-off nobody can hear says the
 * cause in contracts' sentences and offers its one door (Get their yes only where the yes itself is missing, never to
 * people who gave it: the #663 regression the send screen held); the count, the twin and the checks follow the owner's
 * picks, where Ask's answer stands until something it was counted for changes; the foot says a paused workspace first,
 * then what to connect where none of the ways a message can go is (never Pick how, with nothing to tick), a blank value,
 * a time gone by or further ahead than a send may wait, and why nobody can hear a one-off to people (a one-off to leads
 * takes the leads found from now); and a first message ticks only what can carry it, as a draft opened from before
 * (Send it again, a kept one-off) keeps only what is connected and what can carry it, and the checks name only those.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVERYONE_LABEL,
  NEW_ONCE_AHEAD_DAYS,
  NEW_WORDS,
  NO_CHANNEL_REACH,
  allLeftOutWords,
  campaignMessagesOf,
  emptyAudienceRefusal,
  noChannelWords,
  noYesWords,
  saidYesWords,
} from "@chanlytics/contracts";

const { newChecksOf, newReachOf, runningOf } = await import("../../../../apps/dashboard/src/lib/new-checks.ts");
const { readingFor } = await import("../../../../apps/dashboard/src/lib/campaign-channels.ts");
const M = await import("../../../../apps/dashboard/src/surfaces/campaigns/sequences/new/new-model.ts");

const ID = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const ALL = ["whatsapp", "email", "sms"];
/**
 * A count as GET playbooks answers one (server/campaigns/playbook-pools.ts PoolCounts): who can hear it of everyone it
 * names, why the rest cannot, and by channel; for WhatsApp alone, with `by` holding each other set it could tick.
 */
const pool = (candidates, more = {}) => ({
  candidates,
  held: 0,
  pool: candidates,
  noYes: 0,
  stopped: 0,
  noNumber: 0,
  saidYes: candidates,
  no_address: 0,
  address_stopped: 0,
  no_channel: 0,
  by_channel: { whatsapp: candidates, sms: 0, email: 0 },
  ...more,
});
const POOLS = {
  visited: pool(6),
  quiet_30: pool(14, { pool: 15, stopped: 1 }),
  // Walk-ins: five on it, not one said yes to offers.
  "seg:walkins": pool(0, { pool: 5, noYes: 5, saidYes: 0 }),
  // Regulars: three said yes, none with a number, nor (by email too) an address.
  "list:regulars": pool(0, {
    pool: 4,
    noYes: 1,
    noNumber: 3,
    saidYes: 3,
    by: [{ ...pool(0, { pool: 4, noYes: 1, saidYes: 3, no_address: 3 }), channels: ["whatsapp", "email"] }],
  }),
  // VIP clients: 38 who said yes by WhatsApp, and no other set the workspace could tick for an offer (none by email).
  "seg:vip": pool(38),
  // Everyone who said yes to offers: 236 by WhatsApp or email, 141 by email alone, 31 more held back by the week.
  everyone_monthly: pool(236, {
    held: 31,
    pool: 267,
    by_channel: { whatsapp: 200, email: 36, sms: 0 },
    by: [
      {
        ...pool(236, { held: 31, pool: 267, by_channel: { whatsapp: 200, email: 36, sms: 0 } }),
        channels: ["whatsapp", "email"],
      },
      { ...pool(141, { pool: 267, by_channel: { whatsapp: 0, email: 141, sms: 0 } }), channels: ["email"] },
    ],
  }),
};
const SEARCHES = [{ id: ID(9), ready: 2, checking: 3 }];
const COUNTS = { pools: POOLS, searches: SEARCHES };
const how = (over = {}) => ({ kind: "once", channels: ["whatsapp"], offer: true, review: false, ...over });

const list = (token, label) => ({ kind: "list", token, label });
const WALKINS = list("seg:walkins", "Walk-ins");
const REGULARS = list("list:regulars", "Regulars");
const VIP = list("seg:vip", "VIP clients");

/** A message the workspace holds, as New holds it (heldMessageOf): an offer by WhatsApp or email, and news by WhatsApp or text. */
const OFFER = {
  template_id: ID(2),
  title: "Spring offer",
  body: "Hi {{1}}, {{2}}",
  channels: ["whatsapp", "email"],
  params: [{ kind: "first_name" }, { kind: "text", value: "A chair is free this week" }],
  offer: true,
  written: null,
  labels: ["First name", "The offer"],
};
const NEWS = {
  template_id: ID(1),
  title: "Visit follow-up",
  body: "Hi {{1}}, thanks for coming in!",
  channels: ["whatsapp", "sms"],
  params: [{ kind: "first_name" }],
  offer: false,
  written: null,
};

/** The sequences that run, as GET sequences lists them: a reminder, a win-back on the quiet ones, and one that ended. */
const ROWS = [
  { id: ID(7), name: "Day-before reminder", state: "on", starts: "moment", first: { trigger: "visit_tomorrow" } },
  { id: ID(6), name: "Win-back", state: "on", starts: "moment", first: { trigger: "quiet_30" } },
  { id: ID(5), name: "Old thank-you", state: "ended", starts: "moment", first: { trigger: "visited" } },
  {
    id: ID(4),
    name: "VIP welcome",
    state: "paused",
    starts: "list",
    first: { trigger: "saved_list", list_key: "vip" },
  },
];
const reads = (over = {}) => ({ counts: COUNTS, running: runningOf(ROWS), ready: ALL, ...over });
const AT = { paused: false, localNow: "2026-10-20T14:30", ready: ALL };

/** A one-off by hand to `who` with `message` first, counted as the page counts it as it changes. */
function once(who, message, { ready = ALL, channels = null, r = reads({ ready }) } = {}) {
  let d = M.setWho(M.draftByHand("once", "people", "Harbor Studio"), who);
  d = M.setMessage(d, 0, message, ready);
  if (channels) d = M.setChannels(d, channels);
  return M.recounted(null, d, r);
}

/* ---------------------------------- who it reaches, and why nobody can ---------------------------------- */

test("who it reaches is the count's for the channels it goes by; why nobody can is said only where nobody can", () => {
  const none = { whatsapp: 0, sms: 0, email: 0 };
  assert.deepEqual(newReachOf({ kind: "moment", trigger: "visited", label: "x" }, COUNTS, how()), {
    can: 6,
    of: null,
    left: null,
    by: { ...none, whatsapp: 6 },
  });
  // Nobody said the yes it needs: the door is their yes.
  assert.deepEqual(newReachOf(WALKINS, COUNTS, how()), {
    can: 0,
    of: 5,
    left: NEW_WORDS.reach.neverYes(5),
    by: none,
    nobody: "no_yes",
  });
  // Three said yes and none has a number: what they lack, with how many said it.
  const regulars = newReachOf(REGULARS, COUNTS, how());
  assert.deepEqual([regulars.can, regulars.nobody, regulars.said_yes], [0, "no_reach", 3]);
  assert.equal(regulars.left, NEW_WORDS.reach.noNumber(3), "the most of why the rest can't, said once");
  // By WhatsApp or email, the set the count kept for both: the same three, with no address either.
  const both = newReachOf(REGULARS, COUNTS, how({ channels: ["whatsapp", "email"] }));
  assert.deepEqual([both.nobody, both.said_yes], ["no_reach", 3]);
  // Everyone it reaches heard from you this week: the breath, never a missing yes.
  const heard = { ...COUNTS, pools: { everyone_monthly: pool(0, { held: 3, pool: 3, saidYes: 3 }) } };
  assert.deepEqual(newReachOf({ kind: "everyone", label: "everyone" }, heard, how()), {
    can: 0,
    of: 3,
    left: null,
    held: 3,
    by: none,
    nobody: "breath",
  });
});

test("REGRESSION: a closed channel takes back no one's yes -- no channel it goes by can carry it, and those who said yes are kept", () => {
  // An offer ticked to go by email alone where the workspace counts no email set for offers: everyone is held for the
  // channel, and the 38 who said yes are still the 38 (readingFor's fallback said 0, so New offered their yes again).
  const r = readingFor(POOLS["seg:vip"], ["email"]);
  assert.deepEqual([r.candidates, r.no_channel, r.saidYes], [0, 38, 38]);
  const vip = newReachOf(VIP, COUNTS, how({ channels: ["email"] }));
  assert.deepEqual([vip.can, vip.nobody, vip.said_yes], [0, "no_channel", 38]);
  // Meta's pause on offers to US numbers: the count by WhatsApp alone holds the 26 who said yes for the channel.
  const paused = { ...COUNTS, pools: { everyone_monthly: pool(0, { pool: 26, saidYes: 26, no_channel: 26 }) } };
  const everyone = newReachOf({ kind: "everyone", label: "everyone" }, paused, how());
  assert.deepEqual([everyone.can, everyone.nobody, everyone.said_yes], [0, "no_channel", 26]);
  // No channel, and nobody said yes either: said as no channel, with no count of a yes.
  const none = { ...COUNTS, pools: { "seg:walkins": pool(0, { pool: 5, noYes: 5, saidYes: 0, no_channel: 5 }) } };
  const walkins = newReachOf(WALKINS, none, how());
  assert.deepEqual([walkins.nobody, "said_yes" in walkins], ["no_channel", false]);
});

test("a one-off is counted by the yes it needs or not at all: a list and everyone by a yes to offers, a search and leads as they stand", () => {
  // GET playbooks counts a list for a campaign's yes, to offers: news sent once to it is not counted by the wrong yes.
  assert.equal(newReachOf(VIP, COUNTS, how({ offer: false })), null);
  assert.equal(
    newReachOf(VIP, COUNTS, how({ kind: "sequence", offer: false })).can,
    38,
    "a sequence on it runs by its count",
  );
  // Everyone is the month's offer's pool, of everyone it names, with the week's breath and each channel's share.
  const everyone = { kind: "everyone", label: "everyone who said yes to offers" };
  const offers = newReachOf(everyone, COUNTS, how({ channels: ["whatsapp", "email"] }));
  assert.deepEqual([offers.can, offers.of, offers.held, offers.by.email], [236, 267, 31, 36]);
  assert.equal(newReachOf(everyone, COUNTS, how({ channels: ["email"] })).can, 141, "by email alone, the email set");
  assert.equal(
    newReachOf(everyone, COUNTS, how({ offer: false })),
    null,
    "news to everyone: no count of the wrong yes",
  );
  // Where a WhatsApp version is new, who hears it only by WhatsApp: left out until Meta approves it.
  const review = newReachOf(everyone, COUNTS, how({ channels: ["whatsapp", "email"], review: true }));
  assert.equal(review.only_whatsapp, 236 - 141);
  // A search counts its ready leads and the addresses still being checked; leads picked are who they are.
  assert.deepEqual(newReachOf({ kind: "search", id: ID(9), label: "Trainers" }, COUNTS, how()), {
    can: 2,
    of: null,
    left: NEW_WORDS.reach.checking(3),
  });
  assert.equal(newReachOf({ kind: "search", id: ID(8), label: "Gone" }, COUNTS, how()), null, "a search not counted");
  assert.deepEqual(newReachOf({ kind: "leads", ids: ["l1", "l2", "l3"], label: "3 leads" }, COUNTS, how()), {
    can: 3,
    of: null,
    left: null,
  });
  assert.equal(newReachOf(null, COUNTS, how()), null, "no one picked is no one counted");
  assert.equal(newReachOf(VIP, { pools: null, searches: [] }, how()), null, "a workspace not counted yet");
});

/* ------------------------------- the card over a one-off nobody can hear ------------------------------- */

test("REGRESSION: nobody said yes is a door to getting their yes, naming the list in quotes and the yes by what the message is", () => {
  const offer = once(WALKINS, OFFER);
  assert.deepEqual(M.nobodyOf(offer, ALL), { words: noYesWords("“Walk-ins”", "marketing"), door: { kind: "yes" } });
  assert.match(M.nobodyOf(offer, ALL).words, /“Walk-ins” has said yes to offers/);
  // A message that is no offer needs a yes to messages, and says so (Ask's count, as it answered it, stands).
  const news = {
    ...M.setMessage(M.setWho(M.draftByHand("once", "people", "Harbor Studio"), WALKINS), 0, NEWS, ALL),
    reach: { can: 0, of: 5, left: NEW_WORDS.reach.neverYes(5), nobody: "no_yes" },
  };
  assert.equal(M.recounted(null, news, reads()), news, "Ask's count stands until something it was counted for changes");
  assert.deepEqual(M.nobodyOf(news, ALL), {
    words: noYesWords("“Walk-ins”", "conversational"),
    door: { kind: "yes" },
  });
  assert.match(M.nobodyOf(news, ALL).words, /has said yes to messages/);
});

test("REGRESSION (#663): said yes with no number never asks for their yes again; it says who said it and what they lack", () => {
  // News by WhatsApp to Regulars, Ask's count standing: three said yes, none with a number. Its text version is a way the
  // workspace can send that the draft doesn't tick, so How it goes is the door; never Get their yes.
  const news = {
    ...M.setChannels(M.setMessage(M.setWho(M.draftByHand("once", "people", "x"), REGULARS), 0, NEWS, ALL), [
      "whatsapp",
    ]),
    reach: { can: 0, of: 4, left: NEW_WORDS.reach.noNumber(3), nobody: "no_reach", said_yes: 3 },
  };
  const said = M.nobodyOf(news, ALL);
  assert.deepEqual(said, { words: saidYesWords("“Regulars”", "conversational", 0, 3), door: { kind: "how" } });
  assert.match(said.words, /none with a number to send to$/);
  // Counted as the page counts it: an offer by WhatsApp alone, its email version unticked.
  const offer = once(REGULARS, OFFER, { channels: ["whatsapp"] });
  assert.deepEqual([offer.reach.nobody, offer.reach.said_yes], ["no_reach", 3]);
  assert.deepEqual(M.nobodyOf(offer, ALL), {
    words: saidYesWords("“Regulars”", "marketing", 0, 3),
    door: { kind: "how" },
  });
  // Ticked by every way it holds, nothing else to try: the words alone.
  const all = once(REGULARS, OFFER);
  assert.deepEqual(all.channels, ["whatsapp", "email"]);
  // Email ticked: said as the send's own refusal says it, by what each channel asks of a person, never "a number" alone.
  assert.deepEqual(M.nobodyOf(all, ALL), {
    words: emptyAudienceRefusal("marketing", "Regulars", [], { channels: ["whatsapp", "email"], about: "ours" }),
    door: null,
  });
  assert.match(M.nobodyOf(all, ALL).words, /^Nobody on “Regulars” can be sent this yet\./);
  for (const d of [news, offer, all]) assert.notDeepEqual(M.nobodyOf(d, ALL).door, { kind: "yes" });
});

test("no channel can carry it: Connect a channel the message holds that isn't connected, else How it goes; who said yes said with it", () => {
  // WhatsApp not connected: the offer goes by email, which the workspace counts no set for, so nothing carries it.
  const ready = ["email", "sms"];
  const vip = once(VIP, OFFER, { ready });
  assert.deepEqual(vip.channels, ["email"], "the first message ticks only what can send now");
  assert.deepEqual([vip.reach.nobody, vip.reach.said_yes], ["no_channel", 38]);
  assert.deepEqual(M.nobodyOf(vip, ready), {
    words: saidYesWords("“VIP clients”", "marketing", 0, 38, NO_CHANNEL_REACH),
    door: { kind: "connect", channel: "whatsapp" },
  });
  // Everything connected, WhatsApp unticked by the owner: How it goes is the cure.
  const unticked = once(VIP, OFFER, { channels: ["email"] });
  assert.deepEqual(M.nobodyOf(unticked, ALL), {
    words: saidYesWords("“VIP clients”", "marketing", 0, 38, NO_CHANNEL_REACH),
    door: { kind: "how" },
  });
  // Meta's pause on offers to US numbers: everyone, by WhatsApp alone, the one way it holds, so no door; 26 said yes.
  const usPause = reads({
    counts: { ...COUNTS, pools: { everyone_monthly: pool(0, { pool: 26, saidYes: 26, no_channel: 26 }) } },
  });
  const waOnly = { ...OFFER, channels: ["whatsapp"] };
  const everyone = once(M.everyoneOf(true), waOnly, { r: usPause });
  assert.deepEqual(M.nobodyOf(everyone, ALL), {
    words: saidYesWords(`“${EVERYONE_LABEL}”`, "marketing", 0, 26, NO_CHANNEL_REACH),
    door: null,
  });
  // No channel, and nobody said yes: the channel is still what is missing, said without a count of a yes.
  const none = reads({
    counts: { ...COUNTS, pools: { "seg:walkins": pool(0, { pool: 5, noYes: 5, saidYes: 0, no_channel: 5 }) } },
  });
  assert.equal(M.nobodyOf(once(WALKINS, waOnly, { r: none }), ALL).words, noChannelWords("“Walk-ins”", "marketing"));
});

test("REGRESSION: an offer whose one way is WhatsApp, not connected, ticks nothing and says what to connect -- never Pick how", () => {
  const W = NEW_WORDS.draft;
  const ready = ["email"];
  const foot = { ...AT, ready };
  const waOnly = { ...OFFER, channels: ["whatsapp"] };
  // Before who: the parts still to pick, and how is not one of them, since How has nothing it could tick.
  const picked = M.setMessage(M.draftByHand("once", "people", "x"), 0, waOnly, ready);
  assert.deepEqual(picked.channels, [], "nothing it can go by is connected: nothing ticked");
  assert.deepEqual(M.notReady(picked, foot), { lead: W.pick([W.parts.who]), sub: W.thenItCanGo });
  // VIP picked: counted on no channel, so the 38 who said yes are held for it, and the foot says what to connect.
  const vip = once(VIP, waOnly, { ready });
  assert.deepEqual(vip.channels, []);
  assert.deepEqual([vip.reach.can, vip.reach.nobody, vip.reach.said_yes], [0, "no_channel", 38]);
  assert.deepEqual(M.notReady(vip, foot), {
    lead: NEW_WORDS.reach.why.no_channel,
    sub: NEW_WORDS.reach.connect("whatsapp"),
  });
  assert.deepEqual(M.nobodyOf(vip, ready), {
    words: saidYesWords("“VIP clients”", "marketing", 0, 38, NO_CHANNEL_REACH),
    door: { kind: "connect", channel: "whatsapp" },
  });
  // Nobody on it said yes either: the channel is still what is missing, said without a count of a yes.
  assert.deepEqual(M.nobodyOf(once(WALKINS, waOnly, { ready }), ready), {
    words: noChannelWords("“Walk-ins”", "marketing"),
    door: { kind: "connect", channel: "whatsapp" },
  });
  // A way it can go is connected and the owner unticked it: How has something to tick, so the foot asks how, no card.
  const byEmail = once(VIP, OFFER, { ready });
  assert.deepEqual(byEmail.channels, ["email"]);
  const unticked = M.recounted(byEmail, M.setChannels(byEmail, []), reads({ ready }));
  assert.deepEqual([unticked.reach.can, unticked.reach.nobody], [0, "no_channel"]);
  assert.deepEqual(M.notReady(unticked, foot), { lead: W.pick([W.parts.how]), sub: W.thenItCanGo });
  assert.equal(M.nobodyOf(unticked, ready), null);
});

test("everyone heard from you this week is said as the week's breath, with no door; everyone is named Everyone", () => {
  const heard = reads({
    counts: { ...COUNTS, pools: { everyone_monthly: pool(0, { held: 3, pool: 3, saidYes: 3 }) } },
  });
  const d = once(M.everyoneOf(true), OFFER, { r: heard });
  assert.equal(d.who.label, NEW_WORDS.draft.everyoneOffers, "the draft says who it is by the yes");
  assert.deepEqual(M.nobodyOf(d, ALL), { words: allLeftOutWords(EVERYONE_LABEL, 3), door: null });
  // Nobody of everyone said yes to offers: their yes, by the list's own name.
  const noYes = reads({
    counts: { ...COUNTS, pools: { everyone_monthly: pool(0, { pool: 9, noYes: 9, saidYes: 0 }) } },
  });
  assert.deepEqual(M.nobodyOf(once(M.everyoneOf(true), OFFER, { r: noYes }), ALL), {
    words: noYesWords(`“${EVERYONE_LABEL}”`, "marketing"),
    door: { kind: "yes" },
  });
});

test("no card where someone can hear it, where how is still to pick, or where it is no one-off to people", () => {
  assert.equal(M.nobodyOf(once(VIP, OFFER), ALL), null, "38 can hear it");
  // How still to pick: counted, nothing carries it, and the foot already says so (the send screen's rule).
  const walkins = once(WALKINS, OFFER);
  const noHow = M.recounted(walkins, M.setChannels(walkins, []), reads());
  assert.deepEqual([noHow.reach.can, noHow.reach.nobody], [0, "no_channel"]);
  assert.equal(M.nobodyOf(noHow, ALL), null);
  assert.deepEqual(M.notReady(noHow, AT), {
    lead: NEW_WORDS.draft.pick([NEW_WORDS.draft.parts.how]),
    sub: NEW_WORDS.draft.thenItCanGo,
  });
  assert.equal(M.nobodyOf(M.draftByHand("once", "people", "x"), ALL), null, "no one picked");
  const sequence = {
    ...M.setWho(M.draftByHand("sequence", "people", "x"), WALKINS),
    channels: ["whatsapp"],
    reach: { can: 0, of: 5, left: null, nobody: "no_yes" },
  };
  assert.equal(M.nobodyOf(sequence, ALL), null, "a sequence runs on: nobody today still starts");
});

/* ------------------------------------- counted again as it changes ------------------------------------- */

test("who, how and the message picked count it again: its reach, its twin and its checks follow the choice in front of the owner", () => {
  const C = NEW_WORDS.checks;
  const r = reads();
  let prev = M.recounted(null, M.setMessage(M.draftByHand("sequence", "people", "x"), 0, NEWS, ALL), r);
  assert.equal(prev.reach, null, "no one picked yet");
  // A win-back runs on the quiet ones already: a second would send twice.
  let next = M.recounted(prev, M.setWho(prev, { kind: "moment", trigger: "quiet_30", label: "when they go quiet" }), r);
  assert.deepEqual(next.reach, {
    can: 14,
    of: 15,
    left: NEW_WORDS.reach.saidStop(1),
    by: { whatsapp: 14, sms: 0, email: 0 },
  });
  assert.deepEqual(next.twin, { id: ID(6), name: "Win-back" });
  assert.deepEqual(next.checks[0], { tone: "warn", words: C.twin("Win-back"), detail: C.twinDetail });
  // The day after a visit: only an ended sequence was on it, so nothing doubles it.
  prev = next;
  next = M.recounted(prev, M.setWho(prev, { kind: "moment", trigger: "visited", label: "the day after a visit" }), r);
  assert.deepEqual([next.reach.can, next.twin], [6, null]);
  assert.deepEqual(next.checks[0], { tone: "ok", words: C.noTwin("starts on “the day after a visit”"), detail: null });
  // A list's sequence finds its twin by the list's token, a paused one too.
  next = M.recounted(next, M.setWho(next, VIP), r);
  assert.deepEqual(next.twin, { id: ID(4), name: "VIP welcome" });

  // A one-off to everyone: email unticked and ticked again moves the count and its share by email.
  let off = once(M.everyoneOf(true), OFFER);
  assert.deepEqual([off.reach.can, off.reach.by.email], [236, 36]);
  assert.ok(off.checks.some((c) => c.words === C.byEmail(36)));
  assert.ok(
    off.checks.some((c) => c.words === C.breath(31)),
    "the week's breath, said once with its count",
  );
  const byEmail = M.recounted(off, M.setChannels(off, ["email"]), r);
  assert.deepEqual([byEmail.reach.can, byEmail.reach.held], [141, undefined]);
  assert.ok(byEmail.checks.some((c) => c.words === C.byEmail(141)));
  // The message turned news: everyone is said by the yes it needs, and is no longer counted by the yes to offers.
  off = M.recounted(off, M.setMessage(off, 0, NEWS, ALL), r);
  assert.deepEqual([off.who.label, off.reach, off.channels], [NEW_WORDS.draft.everyoneNews, null, ["whatsapp", "sms"]]);
  assert.equal(
    off.checks.some((c) => c.words === C.offersOnly),
    false,
  );
});

test("what Ask answered stands until something it was counted for changes; a draft with no count yet is counted as it opens", () => {
  const r = reads();
  // Ask's draft, as it answered: its count kept, though the page would count it otherwise.
  const asked = {
    ...M.setWho(M.setMessage(M.draftByHand("once", "people", "x"), 0, OFFER, ALL), VIP),
    reach: { can: 99, of: null, left: null },
  };
  assert.equal(M.recounted(null, asked, r), asked);
  // Its name changed: nothing it was counted for, so the same count.
  const named = M.setName(asked, "VIP spring");
  assert.equal(M.recounted(asked, named, r), named);
  // A typed value is part of the message: counted again.
  assert.equal(M.recounted(asked, M.setTyped(asked, 0, 1, "Two chairs free"), r).reach.can, 38);
  // Built by hand, Send it again, a kept one-off: no count, so it is counted as it opens.
  const opened = { ...asked, reach: null, checks: [] };
  const counted = M.recounted(null, opened, r);
  assert.equal(counted.reach.can, 38);
  assert.ok(counted.checks.some((c) => c.words === NEW_WORDS.checks.offersOnly));
  assert.equal(counted.twin, null, "a one-off has no twin");
});

/* ------------------------------ the foot, and the channels a message ticks ------------------------------ */

test("the foot says a paused workspace first, whatever else is still to do", () => {
  const paused = { ...AT, paused: true };
  const want = { lead: NEW_WORDS.paused.lead, sub: NEW_WORDS.paused.sub };
  assert.deepEqual(M.notReady(M.draftByHand("once", "people", "x"), paused), want, "over the parts still to pick");
  assert.deepEqual(M.notReady(once(VIP, OFFER), paused), want, "over a draft that could go");
  assert.equal(M.notReady(once(VIP, OFFER), AT), null);
});

test("then a value left blank, by its name where it has one; then a time gone by while the draft waited", () => {
  const W = NEW_WORDS.draft;
  const blank = M.setTyped(once(VIP, OFFER), 0, 1, "  ");
  assert.deepEqual(M.notReady(blank, AT), { lead: W.fill("The offer"), sub: W.thenItCanGo });
  const nameless = M.setTyped(once(VIP, { ...OFFER, labels: ["First name", "Value 2"] }), 0, 1, "");
  assert.deepEqual(M.notReady(nameless, AT), { lead: W.fill(null), sub: W.thenItCanGo }, "“Value 2” is no name");
  const sequence = M.setTyped(
    M.setMessage(M.setWho(M.draftByHand("sequence", "people", "x"), VIP), 0, OFFER, ALL),
    0,
    1,
    "",
  );
  assert.deepEqual(M.notReady(sequence, AT), { lead: W.fill("The offer"), sub: W.thenItCanStart });
  // A one-off set for a time: gone by (or this very minute), it says so; still ahead, it can go.
  const passed = { lead: W.passed, sub: W.passedSub };
  assert.deepEqual(M.notReady(M.setAt(once(VIP, OFFER), "2026-10-20T09:00"), AT), passed);
  assert.deepEqual(M.notReady(M.setAt(once(VIP, OFFER), AT.localNow), AT), passed);
  assert.equal(M.notReady(M.setAt(once(VIP, OFFER), "2026-10-21T09:00"), AT), null);
});

test("and a time further ahead than a send may wait, said with its days; within them, to the minute, it goes", () => {
  const W = NEW_WORDS.draft;
  // The times below are written from AT's clock (Tue 20 Oct, 2:30 PM) for a send that may wait thirty days.
  assert.equal(NEW_ONCE_AHEAD_DAYS, 30);
  const tooFar = { lead: W.tooFar(NEW_ONCE_AHEAD_DAYS), sub: W.thenItCanGo };
  assert.deepEqual(M.notReady(M.setAt(once(VIP, OFFER), "2026-11-20T14:30"), AT), tooFar, "31 days on");
  assert.deepEqual(M.notReady(M.setAt(once(VIP, OFFER), "2026-11-19T14:31"), AT), tooFar, "a minute past 30 days");
  assert.equal(M.notReady(M.setAt(once(VIP, OFFER), "2026-11-19T14:30"), AT), null, "30 days on, to the minute");
  assert.equal(M.notReady(M.setAt(once(VIP, OFFER), "2026-11-18T14:30"), AT), null, "29 days on");
  // Sent now, no time to hold it to.
  assert.equal(M.notReady(M.setAt(once(VIP, OFFER), null), AT), null);
});

test("then no one to send to, said by why: each cause its own line under it", () => {
  const R = NEW_WORDS.reach;
  const d = once(VIP, OFFER);
  for (const nobody of Object.keys(R.why))
    assert.deepEqual(M.notReady({ ...d, reach: { can: 0, of: null, left: null, nobody } }, AT), {
      lead: R.nobody,
      sub: R.why[nobody],
    });
  // A count from before the cause was kept says the one way it always said.
  assert.deepEqual(M.notReady({ ...d, reach: { can: 0, of: null, left: null } }, AT), {
    lead: R.nobody,
    sub: R.pickAWay,
  });
  // As counted: Walk-ins never said yes; Regulars said it with no number.
  assert.equal(M.notReady(once(WALKINS, OFFER), AT).sub, R.why.no_yes);
  assert.equal(M.notReady(once(REGULARS, OFFER, { channels: ["whatsapp"] }), AT).sub, R.why.no_reach);
});

test("a one-off to leads on a search with none ready yet is not stopped: it takes the leads found from now, with no card", () => {
  const trainers = { kind: "search", id: ID(8), label: "Trainers" };
  const r = reads({ counts: { ...COUNTS, searches: [...SEARCHES, { id: ID(8), ready: 0, checking: 3 }] } });
  const d = M.recounted(null, M.setWho(M.draftByHand("once", "leads", "x"), trainers), r);
  assert.deepEqual(d.reach, { can: 0, of: null, left: NEW_WORDS.reach.checking(3) });
  assert.equal(M.notReady(d, AT), null, "no one to send to stops a one-off to people alone");
  assert.equal(M.nobodyOf(d, ALL), null);
  // The same nobody on a one-off to people stops it.
  assert.equal(M.notReady(once(WALKINS, OFFER), AT).lead, NEW_WORDS.reach.nobody);
});

test("a person's first message ticks the channels it holds that can send now, never one nothing can carry", () => {
  const d = M.setWho(M.draftByHand("once", "people", "x"), M.everyoneOf(false));
  const picked = M.setMessage(d, 0, OFFER, ["email", "sms"]);
  assert.deepEqual(picked.channels, ["email"]);
  assert.equal(picked.who.label, NEW_WORDS.draft.everyoneOffers, "everyone is said by the offer's yes");
  assert.deepEqual(M.setMessage(d, 0, OFFER, ALL).channels, ["whatsapp", "email"]);
  assert.deepEqual(M.setMessage(d, 0, OFFER).channels, ["whatsapp", "email"], "with no ready read, what it holds");
  assert.deepEqual(
    M.setMessage(d, 0, NEWS, ["email"]).channels,
    [],
    "nothing it holds can go: none, and the foot asks how",
  );
});

test("REGRESSION: a text never carries an offer -- an offer with a text version is not ticked by text, nor offered Connect texting", () => {
  const withText = { ...OFFER, channels: ["whatsapp", "sms"] };
  const d = M.setWho(M.draftByHand("once", "people", "x"), M.everyoneOf(true));
  assert.deepEqual(M.setMessage(d, 0, withText, ALL).channels, ["whatsapp"], "its text version is no way to send it");
  assert.deepEqual(M.setMessage(d, 0, NEWS, ALL).channels, ["whatsapp", "sms"], "news goes by text as by WhatsApp");
  // Meta's pause on offers to US numbers, texting not connected: connecting it would carry no offer, so no door.
  const usPause = reads({
    ready: ["whatsapp"],
    counts: { ...COUNTS, pools: { everyone_monthly: pool(0, { pool: 26, saidYes: 26, no_channel: 26 }) } },
  });
  const everyone = once(M.everyoneOf(true), withText, { ready: ["whatsapp"], r: usPause });
  assert.equal(M.nobodyOf(everyone, ["whatsapp"]).door, null);
});

test("REGRESSION: Step 1 can go by what the draft ticks, of what can send now -- an offer holding a text version never says “or text”", () => {
  const C = NEW_WORDS.checks;
  const allThree = { ...OFFER, channels: ["whatsapp", "email", "sms"] };
  const d = once(M.everyoneOf(true), allThree);
  assert.deepEqual(d.channels, ["whatsapp", "email"]);
  assert.deepEqual(d.checks, [
    { tone: "ok", words: C.canGo(1, "WhatsApp or email"), detail: null },
    { tone: "ok", words: C.offersOnly, detail: null },
    { tone: "ok", words: C.breath(31), detail: C.breathDetail },
    { tone: "ok", words: C.byEmail(36), detail: C.byEmailDetail },
  ]);
  // WhatsApp unticked by the owner: the check says email alone, as the count does.
  const byEmail = M.recounted(d, M.setChannels(d, ["email"]), reads());
  assert.deepEqual(byEmail.checks, [
    { tone: "ok", words: C.canGo(1, "email"), detail: null },
    { tone: "ok", words: C.offersOnly, detail: null },
    { tone: "ok", words: C.byEmail(141), detail: C.byEmailDetail },
  ]);
  // Of what it ticks, what the workspace sends on now; nothing it ticks connected, no step said to go.
  assert.deepEqual(newChecksOf(d, ["email", "sms"])[0], { tone: "ok", words: C.canGo(1, "email"), detail: null });
  assert.deepEqual(newChecksOf(d, ["sms"]), d.checks.slice(1));
});

/* ------------------------------- a draft opened from before, on what goes now ------------------------------- */

test("a draft opened from before goes by what is connected now: a closed channel is unticked for people, a lead's email kept", () => {
  const people = once(VIP, OFFER);
  assert.deepEqual(people.channels, ["whatsapp", "email"]);
  assert.deepEqual(M.onReadyChannels(people, ["email", "sms"]).channels, ["email"]);
  assert.equal(M.onReadyChannels(people, ALL).channels.join(), "whatsapp,email", "all still connected: as it was");
  // Its one way closed since: nothing ticked, and the foot says what to connect rather than asking how.
  const waOnly = once(VIP, { ...OFFER, channels: ["whatsapp"] });
  const closed = M.onReadyChannels(waOnly, ["email"]);
  const reopened = M.recounted(waOnly, closed, reads({ ready: ["email"] }));
  assert.deepEqual(reopened.channels, []);
  assert.deepEqual(M.notReady(reopened, { ...AT, ready: ["email"] }), {
    lead: NEW_WORDS.reach.why.no_channel,
    sub: NEW_WORDS.reach.connect("whatsapp"),
  });
  // A one-off to leads goes from the mailbox by email whatever the people channels are.
  const leads = M.setWho(M.draftByHand("once", "leads", "x"), { kind: "search", id: ID(9), label: "Trainers" });
  assert.equal(M.onReadyChannels(leads, ["whatsapp"]), leads);
  assert.deepEqual(leads.channels, ["email"]);
});

/**
 * The Library as New reads it (new-model.ts Library): the messages the workspace's template rows make (contracts
 * campaignMessagesOf), and the rows their values are read from. An offer with a WhatsApp version Meta approved and a text
 * version of its own beside it.
 */
const offerRow = (id, channel) => ({
  id,
  name: "spring_chair",
  language: "en_US",
  channel,
  meta_status: channel === "whatsapp" ? "approved" : null,
  category: "marketing",
  variables: [
    { position: 1, label: "First name", example: "Maya" },
    { position: 2, label: "The offer", example: "A chair is free this week" },
  ],
  title: "Spring offer",
  hidden_at: null,
  blocked: null,
  body_preview: "Hi {{1}}, {{2}}",
});
const OFFER_ROWS = [offerRow(ID(3), "whatsapp"), offerRow(ID(4), "sms")];
const LIBRARY = { messages: campaignMessagesOf(OFFER_ROWS), rows: OFFER_ROWS };

test("REGRESSION: a send kept from before never goes by text for an offer -- Send it again and a kept one-off drop the text it ticked", () => {
  // Send it again of a run to everyone (page/runs.tsx bcAgainOf's keys), one kept from the send screen with the channels
  // it ticked, WhatsApp and text: the message still holds its text version.
  const run = {
    aud: "everyone:",
    tplId: ID(3),
    sources: { [ID(3)]: ["first_name", "text"] },
    params: { [ID(3)]: ["", "A chair is free this week"] },
    name: "",
  };
  const again = M.againOf({ ...run, channels: ["whatsapp", "sms"] }, LIBRARY, [], "Harbor Studio");
  assert.deepEqual(again.steps[0].message.channels, ["whatsapp", "sms"], "the message holds its text version");
  assert.deepEqual(again.channels, ["whatsapp"], "a text never carries an offer");
  assert.deepEqual(again.who, { kind: "everyone", label: NEW_WORDS.draft.everyoneOffers });
  assert.deepEqual(again.steps[0].message.params, [
    { kind: "first_name" },
    { kind: "text", value: "A chair is free this week" },
  ]);
  // Kept with no channels (as Send it again keeps one now): what the message holds, of what can carry it.
  assert.deepEqual(M.againOf(run, LIBRARY, [], "Harbor Studio").channels, ["whatsapp"]);
  // Counted as it opens, its checks say WhatsApp alone.
  const counted = M.recounted(null, again, reads());
  assert.deepEqual(counted.checks[0], { tone: "ok", words: NEW_WORDS.checks.canGo(1, "WhatsApp"), detail: null });

  // A one-off kept as a draft (00465 `sequences.once`) that ticked text: opened, the text is dropped, the rest kept.
  const row = {
    name: "Spring offer",
    once: {
      who: { kind: "everyone", label: NEW_WORDS.draft.everyoneOffers },
      at: "2026-10-23T09:00",
      channels: ["whatsapp", "sms"],
      step: {
        name: "",
        after_days: null,
        only_if: [],
        does: "message",
        message: {
          template_id: ID(3),
          params: [{ kind: "first_name" }, { kind: "text", value: "A chair is free this week" }],
          written: null,
        },
        email: null,
        hand: "",
      },
    },
  };
  const opened = M.onceKeptOf(row, LIBRARY, "Harbor Studio");
  assert.deepEqual(
    [opened.channels, opened.at, opened.steps[0].message.offer],
    [["whatsapp"], "2026-10-23T09:00", true],
  );
  // News kept the same way keeps its text: only an offer is never carried by one.
  const news = M.onceKeptOf(
    row,
    { messages: campaignMessagesOf(OFFER_ROWS.map((r) => ({ ...r, category: "utility" }))), rows: OFFER_ROWS },
    "Harbor Studio",
  );
  assert.deepEqual(news.channels, ["whatsapp", "sms"]);
});
