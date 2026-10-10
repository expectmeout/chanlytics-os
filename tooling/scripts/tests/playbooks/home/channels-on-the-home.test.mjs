/**
 * A campaign says where it goes (the spec of 8 October 2026): the channel facts Campaigns' home draws, EXECUTED over the
 * surfaces' own shapes. The head says where the workspace stands on its channels (channels-standing.ts); a moment's card
 * and a line under the rail carry a mark per channel, from the one reading of a playbook's channels that its drawer and
 * its composer read too (playbook-channels.ts playbookChannelsRead); the ladder's "Can get your messages" rung is cut by
 * channel, each person once, on the channel a send would reach them by (reach-any.ts reachedOn, counted by
 * reachCountsOf); What came back says what each channel sent where more than one did (0030). Every word is one the
 * product already says of a channel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const WA = { canSend: true, refusal: null };
const LINE = { sms_state: "active", reg_mock: false };
/** Offers by email can go: the campaigns domain verified, the business's address on file, no pause. */
const OFFERS_OPEN = { campaigns: true, address: true, paused: null };
/**
 * What the workspace can send on, as channelsReady says it, on a deployment whose email wire is up (a closed email is a
 * missing mailbox). `offers`: the facts offers by email are judged by, or null for a read that carries none.
 */
const ready = ({ whatsapp = true, text = false, email = false, offers = OFFERS_OPEN, paused = false } = {}) =>
  C.channelsReady({
    whatsapp: whatsapp ? WA : null,
    textLine: text ? LINE : null,
    email: { mailbox: email, domain: true, ...(offers ? { offers } : {}) },
    ...(paused ? { paused: true } : {}),
  });

test("the head's channel line: the open channels as one clause, each closed one with its reason and a door where a setting mends it", () => {
  const parts = C.channelsStandingParts(ready({ whatsapp: true, email: true }));
  assert.ok(parts);
  assert.deepEqual(
    parts.map((p) => [p.channel, p.open, p.words, p.door]),
    [
      [null, true, "Sending on WhatsApp and by email", null],
      ["sms", false, "Text: No texting line yet", C.CHANNELS_DOOR],
    ],
  );
  assert.equal(C.channelsStandingWords(parts), "Sending on WhatsApp and by email · Text: No texting line yet");
  // Every channel open: one clause, with the three in the product's order.
  const all = C.channelsStandingParts(ready({ whatsapp: true, text: true, email: true }));
  assert.deepEqual(
    all.map((p) => p.words),
    ["Sending on WhatsApp, by text and by email"],
  );
  // Nothing open: said as that, every channel closed after it.
  const none = C.channelsStandingParts(ready({ whatsapp: false }));
  assert.equal(none[0].words, "Nothing can send yet");
  assert.deepEqual(
    none.slice(1).map((p) => [p.channel, p.door]),
    [
      ["whatsapp", C.CHANNELS_DOOR],
      ["sms", C.CHANNELS_DOOR],
      ["email", C.CHANNELS_DOOR],
    ],
  );
  // What no setting of the workspace mends has no door: a check that could not be made, a deployment with no email wire.
  const unchecked = C.channelsStandingParts(C.READY_WHATSAPP_ALONE);
  assert.deepEqual(
    unchecked.slice(1).map((p) => [p.words, p.door]),
    [
      ["Text: This could not be checked just now", null],
      ["Email: This could not be checked just now", null],
    ],
  );
  const noWire = C.channelsStandingParts(
    C.channelsReady({ whatsapp: WA, textLine: null, email: { mailbox: true, domain: false } }),
  );
  assert.deepEqual(
    noWire.filter((p) => p.channel === "email").map((p) => [p.words, p.door]),
    [["Email: Email is not switched on for this deployment yet", null]],
  );
  // Nor has a texting line that waits on the carriers, or is a test filing: Connections holds nothing to press for either.
  const line = (textLine) =>
    C.channelsStandingParts(C.channelsReady({ whatsapp: WA, textLine, email: { mailbox: true, domain: true } }))
      .filter((p) => p.channel === "sms")
      .map((p) => [p.words, p.door]);
  assert.deepEqual(line({ sms_state: "pending", reg_mock: false }), [
    ["Text: Your texting line is not approved by the carriers yet", null],
  ]);
  assert.deepEqual(line({ sms_state: "active", reg_mock: true }), [
    ["Text: Your texting line is a test filing: it sends nothing", null],
  ]);
  // A read that could not say: nothing is said.
  assert.equal(C.channelsStandingParts(null), null);
  assert.equal(C.channelsStandingParts(undefined), null);
});

test("a workspace paused for billing: the head says the pause, with its door to Billing, and never 'Sending on'", () => {
  const parts = C.channelsStandingParts(ready({ whatsapp: true, email: true, paused: true }));
  assert.deepEqual(
    parts.map((p) => [p.channel, p.open, p.words, p.door]),
    [[null, false, "This workspace is paused, so nothing is sent until billing resumes", "admin/billing"]],
  );
  // The sentence every campaign says of the pause is that fact and where it is resumed: one spelling.
  assert.equal(
    C.CAMPAIGNS_PAUSED_WORDS,
    "This workspace is paused, so nothing is sent until billing resumes. Resume it from Settings › Billing.",
  );
});

/** A message as the playbooks surface offers it: its name, its category, and the versions it holds. */
const version = (over = {}) => ({
  whatsapp: { id: "t-wa", status: "approved", hidden: false, blocked: null, reason: null },
  email: null,
  sms: null,
  ...over,
});
const message = (name, category, versions) => ({ name, language: "en_US", category, message: { versions } });
const EMAIL = { email: { id: "t-em" } };
const TEXT = { sms: { id: "t-sms" } };

/** The home over a workspace that sends on WhatsApp and by email, its visit reminder going by both and its win-back by WhatsApp alone. */
const ZONE = "America/New_York";
const NOW = Date.parse("2026-10-03T01:44:00Z");
const playbook = (over = {}) => ({
  id: "pb-visit",
  name: "Visit reminder",
  trigger: "visit_tomorrow",
  policy_class: "booking",
  template_name: "visit_reminder",
  template_language: "en_US",
  state: "running",
  run_hour: 9,
  cadence_days: 30,
  last_run_for: "2026-10-01",
  next: "tomorrow 9:00 AM",
  triggerLabel: "Visit reminder",
  candidates: 3,
  held: 0,
  named: { pool: 3, saidYes: 3 },
  off: null,
  totals: { waiting: null },
  channels: ["whatsapp", "email"],
  ...over,
});
/** The win-back: an offer, so a yes to offers, and no text ever carries it. */
const winBack = (over = {}) =>
  playbook({
    id: "pb-wb",
    name: "Win-back",
    trigger: "quiet_30",
    policy_class: "reengage",
    template_name: "win_back",
    run_hour: 10,
    channels: ["whatsapp"],
    ...over,
  });
const pool = (pool, candidates = 0, held = 0, saidYes = pool) => ({ candidates, held, pool, saidYes });
const trigger = (id, over = {}) => ({ id, offered: true, candidates: 0, named: null, ...over });
const playbooks = (over = {}) => ({
  rows: [
    playbook(),
    winBack(),
    playbook({
      id: "pb-month",
      name: "The month's offer",
      trigger: "everyone_monthly",
      policy_class: "campaign",
      template_name: "months_offer",
      channels: null,
    }),
  ],
  pools: {
    new_week: pool(0),
    visit_tomorrow: pool(3, 3),
    visited: pool(0),
    quiet_30: pool(5, 5),
    everyone_monthly: pool(9, 9),
  },
  triggers: ["visit_tomorrow", "visited", "quiet_30", "everyone_monthly", "new_week"].map((id) => trigger(id)),
  timezone: ZONE,
  countsRead: true,
  ready: ready({ whatsapp: true, email: true }),
  // Each message holds WhatsApp and email; none was written for a text.
  templates: [
    message("visit_reminder", "utility", version(EMAIL)),
    message("win_back", "marketing", version(EMAIL)),
    message("months_offer", "marketing", version(EMAIL)),
  ],
  ...over,
});
const broadcasts = (over = {}) => ({
  rows: [],
  number: { present: true },
  optIn: { phrase: "YES OFFERS", link: "https://wa.me/15550100?text=YES%20OFFERS" },
  // Each of the 24 once, on the channel a send would reach them by: 17 and 7 are the 24.
  reach: { people: 29, canHear: 24, saidMessages: 24, saidOffers: 5, byChannel: { whatsapp: 17, sms: 0, email: 7 } },
  ready: ready({ whatsapp: true, email: true }),
  ...over,
});
/** Campaigns' own 30 days (the campaign_results surface's report): what each channel sent among them. */
const report = (over = {}) => ({
  days: 30,
  totals: { sent: 132, delivered: 129, read: 53, replied: 32, optIns: 2, optOuts: 1, readOf: 84 },
  byChannel: [
    { channel: "whatsapp", sent: 84 },
    { channel: "email", sent: 48 },
  ],
  sources: [],
  ...over,
});
const home = (over = {}) =>
  C.campaignsHomeOf({
    nowMs: NOW,
    tz: ZONE,
    playbooks: playbooks(),
    broadcasts: broadcasts(),
    library: [],
    messages: [],
    reachOuts: [],
    report: report(),
    // A calendar connected and deals off (no follow-up among the moments), in the word these sentences were written in.
    shape: { calendar: "feed", dealsOn: false, word: "visit" },
    chains: undefined,
    ...over,
  });

/** The marks one playbook carries on the home: `row` on its stage, over what the workspace can send on and the messages it offers. */
const marksOf = (row, readiness, templates = playbooks().templates) => {
  const h = home({ playbooks: playbooks({ rows: [row], ready: readiness, templates }), broadcasts: undefined });
  const stage = h.rail.stages.find((s) => s.playbookId === row.id);
  return (stage ?? h.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === row.id)).channels.map((m) => m.state);
};

test("a playbook's marks are its drawer's reading: on, waits, could and off by its purpose, its message and the workspace", () => {
  const both = ready({ whatsapp: true, email: true });
  const all = ready({ whatsapp: true, text: true, email: true });
  // A visit's reminder that goes by WhatsApp and email, where both can send and its message holds both.
  assert.deepEqual(marksOf(playbook(), both), ["on", "off", "on"]);
  // A texting line that is active opens nothing for a message with no text version: one more tick would not carry it.
  assert.deepEqual(marksOf(playbook(), all), ["on", "off", "on"]);
  // With a text version it could: that is what "could" promises.
  const withText = [message("visit_reminder", "utility", version({ ...EMAIL, ...TEXT }))];
  assert.deepEqual(marksOf(playbook(), all, withText), ["on", "could", "on"]);
  // A channel it keeps and cannot go by yet waits: no line, or no version of its message there.
  assert.deepEqual(marksOf(playbook({ channels: ["whatsapp", "sms", "email"] }), both, withText), [
    "on",
    "waits",
    "on",
  ]);
  assert.deepEqual(marksOf(playbook(), both, [message("visit_reminder", "utility", version())]), [
    "on",
    "off",
    "waits",
  ]);
  // A WhatsApp version still in review: it keeps WhatsApp, and waits there too.
  const inReview = version({ ...EMAIL, whatsapp: { ...version().whatsapp, status: "pending" } });
  assert.deepEqual(marksOf(playbook(), both, [message("visit_reminder", "utility", inReview)]), ["waits", "off", "on"]);

  // An offer: no text carries one, so Text is never "could", whatever line the workspace has and whatever it once ticked.
  const offerEverywhere = [message("win_back", "marketing", version({ ...EMAIL, ...TEXT }))];
  assert.deepEqual(marksOf(winBack(), all, offerEverywhere), ["on", "off", "could"]);
  assert.deepEqual(marksOf(winBack({ channels: ["whatsapp", "sms"] }), all, offerEverywhere), ["on", "off", "could"]);
  // By email an offer goes only once the workspace can send offers there: closed, a tick waits and no tick is promised.
  const closed = ready({ whatsapp: true, email: true, offers: { campaigns: false, address: true, paused: null } });
  assert.deepEqual(marksOf(winBack(), closed), ["on", "off", "off"]);
  assert.deepEqual(marksOf(winBack({ channels: ["whatsapp", "email"] }), closed), ["on", "off", "waits"]);
  // A read that carries no facts about offers is not a yes.
  assert.deepEqual(marksOf(winBack(), ready({ whatsapp: true, email: true, offers: null })), ["on", "off", "off"]);
  // A reminder about their own visit goes by email whatever the workspace's offers are doing.
  assert.deepEqual(marksOf(playbook(), closed), ["on", "off", "on"]);

  // A playbook made before the channels names none and goes by WhatsApp alone.
  assert.deepEqual(marksOf(playbook({ channels: null }), both), ["on", "off", "could"]);
  assert.deepEqual(marksOf(playbook({ channels: [] }), both), ["on", "off", "could"]);

  // The page claims nothing it does not know. The message not read (the templates failed, or it was deleted): what it
  // ticks is said, by the workspace alone, and nothing of what one more tick would open.
  assert.deepEqual(marksOf(playbook({ channels: ["whatsapp"] }), both, null), ["on", "off", "off"]);
  assert.deepEqual(marksOf(playbook({ channels: ["whatsapp", "sms"] }), both, []), ["on", "waits", "off"]);
  // The readiness not read: a channel it ticks is on, the rest off.
  assert.deepEqual(marksOf(playbook({ channels: ["sms"] }), null), ["off", "on", "off"]);

  // A paused workspace sends nothing: what it keeps waits, and what it could tick is still said.
  const paused = ready({ whatsapp: true, text: true, email: true, paused: true });
  assert.deepEqual(marksOf(playbook(), paused, withText), ["waits", "could", "waits"]);
  // A playbook that runs nothing here carries none, as its drawer draws no Goes by row.
  assert.deepEqual(marksOf(playbook({ off: "Deals are off here" }), both), []);
});

test("the marks' words to a screen reader, and what the page says once a playbook's channels changed", () => {
  const W = C.LIFECYCLE_WORDS.channels;
  assert.equal(W.marks(["WhatsApp", "Email"], ["Text"], []), "Goes by WhatsApp and Email; Text waits");
  assert.equal(W.marks(["WhatsApp"], [], ["Email"]), "Goes by WhatsApp; could also go by Email");
  assert.equal(W.marks(["WhatsApp", "Text", "Email"], [], []), "Goes by WhatsApp, Text and Email");
  // Nothing it keeps can go yet (a paused workspace): what waits is the sentence, with its verb in number.
  assert.equal(W.marks([], ["WhatsApp", "Email"], ["Text"]), "WhatsApp and Email wait; could also go by Text");
  assert.equal(W.marks([], [], []), "Goes by nothing yet");
  assert.deepEqual(C.LIFECYCLE_TOAST.channels("Visit reminder", ["whatsapp", "email"], false), [
    { b: "Visit reminder" },
    " goes by WhatsApp and Email now",
  ]);
  // A run of it already waits: it was made with the channels the playbook had, and the sentence says so.
  assert.deepEqual(C.LIFECYCLE_TOAST.channels("Win-back", ["whatsapp"], true), [
    { b: "Win-back" },
    " goes by WhatsApp now · the run that waits keeps the channels it was made with",
  ]);
});

test("the one reading of a playbook's channels: what it keeps, what it goes by now, and what a new one opens on", () => {
  const all = ready({ whatsapp: true, text: true, email: true });
  const everywhere = { category: "utility", versions: version({ ...EMAIL, ...TEXT }) };
  const visit = { trigger: "visit_tomorrow" };
  // A new playbook opens on every channel its message can go by (decision 5: the one switch).
  assert.equal(C.NEW_PLAYBOOK_TICKS_EVERY_CHANNEL, true);
  assert.deepEqual(C.playbookChannelsRead(visit, "new", everywhere, all).ticked, ["whatsapp", "sms", "email"]);
  // Less what the message holds no version of, and what the workspace cannot send on.
  assert.deepEqual(
    C.playbookChannelsRead(visit, "new", { category: "utility", versions: version(EMAIL) }, all).ticked,
    ["whatsapp", "email"],
  );
  assert.deepEqual(C.playbookChannelsRead(visit, "new", everywhere, ready({ email: true })).ticked, [
    "whatsapp",
    "email",
  ]);
  // An offer never opens on a text, and by email only where offers can go.
  const offer = { category: "marketing", versions: version({ ...EMAIL, ...TEXT }) };
  assert.deepEqual(C.playbookChannelsRead({ trigger: "quiet_30" }, "new", offer, all).ticked, ["whatsapp", "email"]);
  const closed = ready({
    whatsapp: true,
    text: true,
    email: true,
    offers: { campaigns: true, address: false, paused: null },
  });
  assert.deepEqual(C.playbookChannelsRead({ trigger: "quiet_30" }, "new", offer, closed).ticked, ["whatsapp"]);
  // A message written for email alone, in a workspace with no number: it opens on Email.
  const emailOnly = { category: "utility", versions: { whatsapp: null, email: { id: "t-em" }, sms: null } };
  assert.deepEqual(C.playbookChannelsRead(visit, "new", emailOnly, ready({ whatsapp: false, email: true })).ticked, [
    "email",
  ]);
  // No message in view, or nothing open: WhatsApp alone, as every campaign went before.
  assert.deepEqual(C.playbookChannelsRead(visit, "new", null, all).ticked, ["whatsapp"]);
  assert.deepEqual(C.playbookChannelsRead(visit, "new", everywhere, ready({ whatsapp: false })).ticked, ["whatsapp"]);
  // A broadcast goes now, on the first that can send; a playbook on every one.
  assert.deepEqual(C.newCampaignChannels("broadcast", ["sms", "email"]), ["sms"]);
  assert.deepEqual(C.newCampaignChannels("playbook", ["sms", "email"]), ["sms", "email"]);
  assert.deepEqual(C.newCampaignChannels("playbook", []), ["whatsapp"]);
  assert.deepEqual(C.newCampaignChannels("playbook", null), ["whatsapp"]);

  // What it keeps is what a save sends and a press starts from: a tick its purpose never carries is not kept, one that
  // only waits is.
  const kept = C.playbookChannelsRead({ trigger: "quiet_30" }, ["whatsapp", "sms", "email"], offer, closed);
  assert.deepEqual(
    [kept.ticked, kept.kept, kept.on],
    [["whatsapp", "sms", "email"], ["whatsapp", "email"], ["whatsapp"]],
  );
  assert.deepEqual(kept.stands, { whatsapp: "on", sms: "off", email: "waits" });
  // A playbook on a list sends under the class it names: an offer, or a win-back.
  const onList = C.playbookChannelsRead(
    { trigger: "saved_list", policy_class: "campaign" },
    ["whatsapp"],
    everywhere,
    all,
  );
  assert.equal(onList.purpose, "marketing");
  assert.deepEqual(onList.stands, { whatsapp: "on", sms: "off", email: "could" });
  // The channels a stored row names: its own in the product's order, WhatsApp alone where it names none.
  assert.deepEqual(C.campaignChannelsOf(["email", "whatsapp"]), ["whatsapp", "email"]);
  assert.deepEqual(
    [C.campaignChannelsOf(null), C.campaignChannelsOf([]), C.campaignChannelsOf(["fax"])],
    [["whatsapp"], ["whatsapp"], ["whatsapp"]],
  );
});

test("who can hear you, by channel: each person once, on the channel a send would reach them by, so the channels add up", () => {
  const row = (reachedOn) => ({
    saidYes: { offers: false, messages: true },
    canReceive: { offers: false, messages: reachedOn !== null },
    reachedOn,
  });
  const rows = [row("whatsapp"), row("whatsapp"), row("email"), row(null)];
  const counts = C.reachCountsOf(rows);
  assert.deepEqual([counts.people, counts.canHear, counts.byChannel], [4, 3, { whatsapp: 2, sms: 0, email: 1 }]);
  assert.equal(counts.byChannel.whatsapp + counts.byChannel.sms + counts.byChannel.email, counts.canHear);
  // Rows from before the channels carry no pick: the count says nothing of channels.
  const before = C.reachCountsOf(rows.map(({ saidYes, canReceive }) => ({ saidYes, canReceive })));
  assert.equal(before.byChannel, undefined);
});

test("the home draws the channel facts: the head's line, a mark per channel on each card and line, the rung's parts, the funnel's line", () => {
  const h = home();
  // The head: facts, no lede (the receptionist, the visit reminder and the win-back cover three of four); the channel line
  // from the playbooks surface's readiness.
  assert.deepEqual(h.head.sentence.slice(0, 2), [{ b: "3 of 4" }, " moments are covered"]);
  assert.equal(
    C.channelsStandingWords(h.head.channels),
    "Sending on WhatsApp and by email · Text: No texting line yet",
  );
  // The rail: the receptionist carries no marks; the visit reminder goes by both; the win-back goes by WhatsApp and could
  // go by email (offers are open); the off moment carries none (what Turn on ticks is the composer's to say).
  const states = Object.fromEntries(h.rail.stages.map((s) => [s.id, s.channels.map((m) => m.state)]));
  assert.deepEqual(states, {
    first_contact: [],
    before: ["on", "off", "on"],
    after: [],
    quiet: ["on", "off", "could"],
  });
  // The month's offer names no channels: WhatsApp alone, as it was made; one more tick would open email.
  const month = h.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === "pb-month");
  assert.deepEqual(
    month.channels.map((m) => [m.word, m.state]),
    [
      ["WhatsApp", "on"],
      ["Text", "off"],
      ["Email", "could"],
    ],
  );
  // The call's text carries none.
  assert.deepEqual(h.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === "call_text").channels, []);
  // The ladder's "messages" rung in parts, the rung's own bar cut by channel (24 of 29: 17 and 7), its words beside the
  // count. The parts are shares of everyone, so they are the bar: 17/29 and 7/29, never a share of a sum that overlaps.
  const rung = h.reach.rungs.find((r) => r.id === "messages");
  assert.deepEqual(
    rung.parts.map((p) => [p.channel, p.share]),
    [
      ["whatsapp", 17 / 29],
      ["email", 7 / 29],
    ],
  );
  assert.equal(rung.share, 24 / 29);
  assert.equal(rung.byWords, "17 on WhatsApp, 7 by email");
  assert.equal(rung.meter, "Can get your messages: 24 of 29 · 17 on WhatsApp, 7 by email");
  // The other rungs stay one part.
  assert.equal(h.reach.rungs.find((r) => r.id === "offers").parts, null);
  // One channel alone reaches anyone: one part in the ink, and no words a number did not already say.
  const one = home({
    broadcasts: broadcasts({ reach: { ...broadcasts().reach, byChannel: { whatsapp: 24, sms: 0, email: 0 } } }),
  });
  const alone = one.reach.rungs.find((r) => r.id === "messages");
  assert.deepEqual([alone.parts, alone.byWords, alone.meter], [null, null, "Can get your messages: 24 of 29"]);
  // What came back: what each channel sent, where more than one did.
  assert.equal(h.results.byChannel, "84 on WhatsApp, 48 by email");
});

test("a reach-out's mark: it goes by email alone, on where the workspace can send email and waiting where it cannot", () => {
  const chain = {
    root_id: "ro-1",
    name: "Cold email to studios",
    search: { id: "s-1", name: "Studios near us" },
    state: "running",
    steps: [{}, {}],
    next: { waiting_run_id: null },
  };
  const mark = (readiness) =>
    home({
      playbooks: playbooks({ ready: readiness }),
      broadcasts: broadcasts({ ready: readiness }),
      reachOuts: [chain],
    })
      .ledger.groups.flatMap((g) => g.rows)
      .find((r) => r.id === "ro-1")
      .channels.map((m) => m.state);
  assert.deepEqual(mark(ready({ whatsapp: true, email: true })), ["off", "off", "on"]);
  assert.deepEqual(mark(ready({ whatsapp: true, email: false })), ["off", "off", "waits"]);
  assert.deepEqual(mark(ready({ whatsapp: true, email: true, paused: true })), ["off", "off", "waits"]);
  // The readiness not read: nothing says it cannot.
  assert.deepEqual(mark(null), ["off", "off", "on"]);
  // The two surfaces disagree (one read before billing paused the workspace): the pause is either surface's
  // (workspacePausedOf), as every other row and Coming up read it, so the mark waits whichever surface says it.
  const marks = (pbReady, bcReady) =>
    home({ playbooks: playbooks({ ready: pbReady }), broadcasts: broadcasts({ ready: bcReady }), reachOuts: [chain] })
      .ledger.groups.flatMap((g) => g.rows)
      .find((r) => r.id === "ro-1")
      .channels.map((m) => m.state);
  const open = ready({ whatsapp: true, email: true });
  const pausedHere = ready({ whatsapp: true, email: true, paused: true });
  assert.deepEqual(marks(open, pausedHere), ["off", "off", "waits"], "the broadcasts surface says paused");
  assert.deepEqual(marks(pausedHere, open), ["off", "off", "waits"], "the playbooks surface says paused");
  assert.deepEqual(marks(null, pausedHere), ["off", "off", "waits"], "one unread, the other paused");
});

test("where the readiness is unread and the counts predate the channels, the home says nothing of them", () => {
  const h = home({
    playbooks: playbooks({ ready: null }),
    broadcasts: broadcasts({
      ready: null,
      reach: { people: 29, canHear: 7, saidMessages: 7, saidOffers: 0 },
    }),
    report: { days: 30, totals: { sent: 8, delivered: 8, read: 5, replied: 3, optIns: 0, optOuts: 0 }, sources: [] },
  });
  assert.equal(h.head.channels, null);
  const rung = h.reach.rungs.find((r) => r.id === "messages");
  assert.equal(rung.parts, null);
  assert.equal(rung.byWords, null);
  assert.equal(rung.meter, "Can get your messages: 7 of 29");
  assert.equal(h.results.byChannel, null);
  // A ticked channel reads as on where nothing says it is closed.
  assert.deepEqual(
    h.rail.stages.find((s) => s.id === "before").channels.map((m) => m.state),
    ["on", "off", "on"],
  );
  // The playbooks surface carries no readiness and the broadcasts' does: the home reads that one.
  const fromRuns = home({
    playbooks: playbooks({ ready: null }),
    broadcasts: broadcasts({ ready: ready({ email: true }) }),
  });
  assert.equal(
    C.channelsStandingWords(fromRuns.head.channels),
    "Sending on WhatsApp and by email · Text: No texting line yet",
  );
  // One channel alone sent: no line under the funnel.
  const one = home({ report: report({ byChannel: [{ channel: "whatsapp", sent: 132 }] }) });
  assert.equal(one.results.byChannel, null);
});
