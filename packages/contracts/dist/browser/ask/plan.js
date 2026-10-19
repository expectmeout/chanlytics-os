import { isDayKey, shiftKey } from "../calendar/day-keys.js";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules.js";
import { BROADCAST_NAME_MAX } from "../broadcasts/broadcasts.js";
import { OFFER_PLAN_WORDS, dayReadWrong, isTheAsk } from "../broadcasts/offer-plan-words.js";
import { CHANNEL_WORDS } from "../broadcasts/reach-for.js";
import { JOURNEY_PLAN_WORDS, journeyPlan } from "../journey/journey-plan.js";
import { parseListToken } from "../people/lists/list-token.js";
import { campaignDayWords, campaignRunsOn, localDate } from "../playbooks/playbook-schedule.js";
import { PLAYBOOK_DEFAULTS, PLAYBOOK_LIMITS, PLAYBOOK_NAME_MAX } from "../playbooks/playbook-triggers.js";
import { wallClockAt } from "../shared/clock.js";
import { LIVE_VERSION_STATES, VERSION_CHANNEL_WORDS } from "../templates/message-versions.js";
import { SENDER_WORDS } from "../templates/sender-words.js";
import { starterByName, starterText } from "../templates/starter-lookup.js";
import { messageLanguageCode } from "../templates/starter-templates.js";
import { languageBase } from "../templates/template-languages.js";
import { clip } from "./ask-answer.js";
import { sendWaitsForReview, stepToken } from "./plan-steps.js";
const SEND_HOUR = PLAYBOOK_DEFAULTS.runHour;
const REMINDER_AFTER_DAYS = 19;
const OFFER_CHANNELS = ["whatsapp", "email"];
const PER_PERSON = /* @__PURE__ */ new Set(["first_name", "business_name", "booking_link", "review_link"]);
const LIVE = LIVE_VERSION_STATES;
const SENDS_NOW = /* @__PURE__ */ new Set(["approved"]);
const WRITTEN_NAME = /^offer(?:_\d+)?$/;
const SILENT = {
  message: true,
  note: true,
  change: true,
  broadcast: false,
  playbook: false
};
const OFFER_MESSAGE = {
  en: {
    whatsapp: `Hi {{1}}, an offer from {{2}}: {{3}} Book here: {{4}} or reply with a day that suits you.

${SENDER_WORDS.en.textStop}`,
    subject: "An offer from {{2}}",
    email: "Hi {{1}},\n\nAn offer from {{2}}: {{3}}\n\nBook here: {{4}}, or reply with a day that suits you."
  },
  es: {
    whatsapp: `Hola {{1}}, una oferta de {{2}}: {{3}} Reserva aqu\xED: {{4}} o responde con el d\xEDa que mejor te venga.

${SENDER_WORDS.es.textStop}`,
    subject: "Una oferta de {{2}}",
    email: "Hola {{1}}:\n\nUna oferta de {{2}}: {{3}}\n\nReserva aqu\xED: {{4}}, o responde con el d\xEDa que mejor te venga."
  }
};
const whyOf = (why) => OFFER_PLAN_WORDS.en.reason(why);
const capOf = (room) => Math.min(
  PLAYBOOK_LIMITS.cap_per_run.max,
  Math.max(PLAYBOOK_LIMITS.cap_per_run.min, Math.ceil(room.open / Math.max(1, room.days)))
);
const unreadWords = (what) => `${what} could not be read just now, so nothing was proposed: say so, and ask again in a moment.`;
export const PLAN_WORDS = {
  noOffer: "intent offer takes offer: its words, from and until, the offer's first and last day. Ask what the offer is and when it runs.",
  noWords: "words is the offer in the owner's words: ask what the offer is.",
  /** The offer's words say a day from today that its message, note and send, first read on its first day, misread. */
  dayFromToday: (phrase, from) => `\u201C${phrase}\u201D is said from today, and the offer is first read on ${from}, when it means another day: give words (and say) its days as a customer reads them then (\u201Call November\u201D, never \u201Cnext month\u201D), and call again.`,
  notADay: "from and until are days on the business's calendar, written YYYY-MM-DD: ask for them again.",
  fromAfterUntil: "until comes before from: an offer's last day is its first day or later. Ask which dates they meant.",
  fromPast: "from is a day already past on the business's calendar: an offer starts today or later. Ask when it starts.",
  /** None asked for can carry it: each closed one given, why; an open one not asked, to name; else what to set up. */
  noChannel: (closed, open) => [
    `Nothing ${open.length ? "asked for" : "here"} can carry this offer.`,
    ...closed.map((c) => `${VERSION_CHANNEL_WORDS[c.channel]} cannot: ${whyOf(c.why)}`),
    ...open.map((c) => `${VERSION_CHANNEL_WORDS[c]} can carry it: name it, or leave channels out.`),
    ...open.length ? [] : [`${CHANNEL_WORDS.noOffersByText} Say so, and what to set up first.`]
  ].join(" "),
  noChannelNamed: "channels names no channel: name WhatsApp, email or both, or leave channels out for every one the workspace sends offers on.",
  /** Texts asked for alone: never a channel an offer goes by, whatever the workspace can send. */
  textOnly: `${CHANNEL_WORDS.noOffersByText} An offer goes by WhatsApp or email: say so, and name either, or leave channels out for every one the workspace sends offers on.`,
  noOffersList: "who is not a list this workspace has: name one people with action lists gives, or leave who out for everyone who can receive offers.",
  journeyUnread: JOURNEY_PLAN_WORDS.journeyUnread,
  /** A read the plan is made against that failed (Task 17's world): never a plan on a guess of what it would have said. */
  channelsUnread: unreadWords("Which channels can send"),
  libraryUnread: unreadWords("The message library"),
  playbooksUnread: unreadWords("The campaigns, and so whether the month's offer runs,"),
  listsUnread: unreadWords("The lists an offer goes to"),
  notesUnread: unreadWords("The receptionist's notes"),
  nothingToCover: JOURNEY_PLAN_WORDS.nothingToCover,
  /** What an offer is called: the receptionist's note, the send and the campaign. */
  offerTitle: (words) => `Offer: ${words}`,
  /** What the receptionist's note says: the offer as the message says it, its dates, and what it is for. */
  noteText: (line, from, until, service) => `The offer: ${line} It runs from ${from} to ${until}.${service ? ` It is for ${service}.` : ""}`,
  /** That message, WhatsApp the one channel it goes by: no twin; email named where open (never channels left out). */
  reviewRefused: (name, emailOpen) => `\u201C${name}\u201D, the one message here that carries an offer, waits on WhatsApp's review of its WhatsApp version, and WhatsApp is the one channel ${emailOpen ? "asked for" : "this offer may go by"}: say so, and ${emailOpen ? "that email can carry it now (name it), or " : ""}ask again once WhatsApp has reviewed it.`,
  notOffered: JOURNEY_PLAN_WORDS.notOffered,
  /**
   * What a card says of what an earlier step of its plan makes, named by its token (`@step:n`): not filed yet, so not
   * quoted, and filled in by the commit once that step is approved.
   */
  stepMessage: (n) => `the message made by step ${n}`,
  stepCampaign: (n) => `the campaign made by step ${n}`,
  /** A change to a campaign a step makes: what is said without the campaign's row (its other fields are its step's). */
  stepChangeOnly: (n) => `A change to the campaign made by step ${n} takes state paused, params or until: the rest is the step's own to say.`,
  why: {
    message: "None of your messages carries an offer on every channel this one goes by.",
    // What the note does, never what the receptionist will say of it: a discount in a reply is a person's whatever the
    // price switch says (decision 0051, price-allowance.ts), so the reply that names it may be held for one.
    note: "So the receptionist knows the offer and when it runs.",
    pause: "So nobody gets the month's offer and this one.",
    first: "The offer, on its first day.",
    paced: "The offer, as fast as the calendar can take it.",
    stage: JOURNEY_PLAN_WORDS.whyStage,
    resume: JOURNEY_PLAN_WORDS.whyResume
  }
};
const SAY = PLAN_WORDS;
function planSteps() {
  const steps = [];
  const add = (kind, input, why) => {
    const n = steps.length + 1;
    const after = SILENT[kind] ? [] : steps.filter((s) => s.silent).map((s) => s.n);
    steps.push({ n, kind, silent: SILENT[kind], input, why, after });
    return n;
  };
  return { steps, add };
}
function firstFree(named, taken) {
  for (let i = 1; ; i += 1) {
    const name = named(i);
    if (!taken(name)) return name;
  }
}
function audienceOf(token) {
  const ref = parseListToken(token);
  if (!ref) return null;
  return { audience_kind: ref.kind === "builtin" ? "list" : "saved", audience_id: ref.id };
}
function offerDates(offer, world) {
  if (!isDayKey(offer.from) || !isDayKey(offer.until)) return { refused: SAY.notADay };
  if (offer.until < offer.from) return { refused: SAY.fromAfterUntil };
  const today = localDate(world.tz, world.now);
  if (offer.from < today) return { refused: SAY.fromPast };
  const at = wallClockAt(world.tz, offer.from, SEND_HOUR, 0);
  const S = OFFER_PLAN_WORDS[world.says];
  return {
    today,
    from: offer.from,
    until: offer.until,
    firstAt: at > world.now.getTime() ? at : null,
    fromWords: campaignDayWords(offer.from, world.tz, world.now),
    untilWords: campaignDayWords(offer.until, world.tz, world.now),
    fromSaid: S.day(offer.from, world.tz, world.now),
    untilSaid: S.day(offer.until, world.tz, world.now)
  };
}
function offerChannels(asked, can, S) {
  const want = asked ?? OFFER_CHANNELS;
  const shut = OFFER_CHANNELS.filter((c) => want.includes(c) && !can[c].ok);
  const unasked = OFFER_CHANNELS.filter((c) => !want.includes(c) && can[c].ok);
  const told = unasked.length ? shut : OFFER_CHANNELS.filter((c) => !can[c].ok);
  return {
    on: OFFER_CHANNELS.filter((c) => want.includes(c) && can[c].ok),
    unasked,
    said: [...want.includes("sms") ? [S.noText] : [], ...shut.map((c) => S.without(c, can[c].why))],
    refused: SAY.noChannel(
      told.map((c) => ({ channel: c, why: can[c].why })),
      unasked
    )
  };
}
const offerLine = (words) => {
  const t = words.trim();
  return /[.!?…]$/.test(t) ? t : `${t}.`;
};
function offerValue(offer, say, dates) {
  const wrong = (text) => dayReadWrong(text, dates.from, dates.until);
  const day = wrong(offer.words);
  if (day) return { refused: SAY.dayFromToday(day, dates.fromWords) };
  const own = say?.trim();
  return { line: offerLine(own && !isTheAsk(own) && !wrong(own) ? own : offer.words) };
}
const valuesOf = (slots, line) => [...slots].sort((a, b) => a.position - b.position).map((s) => s.kind === "text" ? line : `@${s.kind}`);
function offerSlots(language) {
  const starter = starterByName("this_months_offer");
  if (!starter) throw new Error("the month's offer starter is gone from the starter set");
  return starterText(starter, messageLanguageCode(language)).slots.map((s, i) => ({
    position: i + 1,
    label: s.label,
    kind: s.kind
  }));
}
const versionOn = (m, c, states) => m.versions.find((v) => v.channel === c && states.has(v.state));
function offerFits(world, on, held) {
  const offer = offerSlots(world.language).find((s) => s.kind === "text");
  const takes = (m) => {
    const typed = m.slots.filter((s) => s.kind === "text");
    return typed.length === 1 && typed.every((s) => s.label === offer?.label) && m.slots.every((s) => s.kind === "text" || PER_PERSON.has(s.kind));
  };
  const states = (c) => held && c === "whatsapp" ? SENDS_NOW : LIVE;
  const fits = world.messages.filter(
    (m) => (
      // A starter the set replaced is never sent anew (the earlier month's offer carries the same offer value).
      !starterByName(m.name)?.retired && m.category === "marketing" && languageBase(m.language) === world.language && takes(m) && on.every((c) => versionOn(m, c, states(c)))
    )
  );
  const rank = (m) => m.name === "this_months_offer" ? 0 : WRITTEN_NAME.test(m.name) ? 1 : 2;
  return [...fits].sort((a, b) => rank(a) - rank(b));
}
function reusedMessage(m, on, line) {
  const version = on.map((c) => versionOn(m, c, LIVE)).find((v) => v !== void 0);
  if (!version) throw new Error(`a message that fits has a version on ${on.join(", ")}: ${m.name}`);
  return {
    made: false,
    name: m.name,
    id: version.id,
    params: valuesOf(m.slots, line),
    inReview: on.includes("whatsapp") && versionOn(m, "whatsapp", LIVE)?.state === "pending"
  };
}
function writtenMessage(world, on, line) {
  const slots = offerSlots(world.language);
  const words = OFFER_MESSAGE[world.language];
  const versions = {
    ...on.includes("whatsapp") ? { whatsapp: { body: words.whatsapp } } : {},
    ...on.includes("email") ? { email: { subject: words.subject, body: words.email } } : {}
  };
  const held = new Set(world.messages.map((m) => m.name));
  const name = firstFree(
    (i) => i === 1 ? "offer" : `offer_${i}`,
    (n) => held.has(n) || starterByName(n) !== null
  );
  return {
    made: true,
    name,
    input: { name, language: world.language, category: "marketing", versions, slots },
    params: valuesOf(slots, line)
  };
}
function offerMessage(world, on, line, kind, unasked) {
  const held = sendWaitsForReview(kind, on);
  const [ready] = offerFits(world, on, held);
  if (ready) return { message: reusedMessage(ready, on, line), on, said: [] };
  const [waiting] = held ? offerFits(world, on, false) : [];
  if (!waiting) return { message: writtenMessage(world, on, line), on, said: [] };
  const rest = on.filter((c) => c !== "whatsapp");
  if (rest.length === 0) return { refused: SAY.reviewRefused(waiting.name, unasked.includes("email")) };
  const S = OFFER_PLAN_WORDS[world.says];
  return {
    message: reusedMessage(waiting, rest, line),
    on: rest,
    said: [S.without("whatsapp", S.reviewing(waiting.name))]
  };
}
function offerNote(offer, line, dates, notes) {
  const title = clip(SAY.offerTitle(offer.words), PROFILE_LIMITS.noteTitle);
  if (notes.some((n) => n.title === title && n.until === dates.until)) return null;
  const service = offer.service?.trim().replace(/[.!?…]+$/, "") || null;
  const text = SAY.noteText(line, dates.fromWords, dates.untilWords, service);
  return { change: { op: "add_note", title, text: clip(text, PROFILE_LIMITS.noteText), until: dates.until } };
}
function monthsOfferPauses(world, until) {
  const at = { tz: world.tz, now: world.now };
  return world.playbooks.filter((p) => p.trigger === "everyone_monthly" && campaignRunsOn(p, at)).map((p) => ({
    input: { playbook_id: p.id, state: "paused" },
    said: OFFER_PLAN_WORDS[world.says].monthsOfferPaused(p.name, until)
  }));
}
function reminderDay(world, dates, paced) {
  if (paced || !world.journey?.some((s) => s.id === "before" || s.id === "after")) return null;
  const nineteen = shiftKey(dates.from, REMINDER_AFTER_DAYS);
  const day = nineteen <= dates.until ? nineteen : dates.until;
  return day > dates.from ? day : null;
}
function receptionistNote(offer, line, dates, world) {
  const S = OFFER_PLAN_WORDS[world.says];
  const input = offerNote(offer, line, dates, world.notes);
  if (!input) return { input: null, said: S.noteKnown };
  return world.canNote ? { input, said: S.noteMade(dates.untilSaid) } : { input: null, said: S.noteLeftOut };
}
function offerRead(offer, say, world) {
  if (!offer.words.trim()) return { refused: SAY.noWords };
  const dates = offerDates(offer, world);
  if ("refused" in dates) return dates;
  if (offer.channels?.length === 0) return { refused: SAY.noChannelNamed };
  if (offer.channels?.every((c) => c === "sms")) return { refused: SAY.textOnly };
  const channels = offerChannels(offer.channels, world.channels, OFFER_PLAN_WORDS[world.says]);
  if (channels.on.length === 0) return { refused: channels.refused };
  const audience = world.lists.find((l) => l.token === (offer.who ?? world.offersList));
  const to = audience ? audienceOf(audience.token) : null;
  if (!audience || !to) return { refused: SAY.noOffersList };
  const value = offerValue(offer, say, dates);
  if ("refused" in value) return value;
  const { line } = value;
  const room = world.room;
  const tight = room && audience.count !== null && room.open * 2 < audience.count ? { room, audience: audience.count } : null;
  const cap = tight && dates.from === dates.today ? capOf(tight.room) : null;
  const kind = cap === null ? "broadcast" : "playbook";
  const picked = offerMessage(world, channels.on, line, kind, channels.unasked);
  if ("refused" in picked) return picked;
  return {
    offer,
    dates,
    on: picked.on,
    onSaid: [...channels.said, ...picked.said],
    audience,
    to,
    message: picked.message,
    tight,
    cap,
    kind,
    reminder: reminderDay(world, dates, cap !== null),
    note: receptionistNote(offer, line, dates, world),
    pauses: monthsOfferPauses(world, dates.untilSaid)
  };
}
const awaitsReview = (r) => r.on.includes("whatsapp") && (r.message.made || r.message.inReview);
function sendUnseen(r, world) {
  const S = OFFER_PLAN_WORDS[world.says];
  const room = r.tight ? [
    r.cap !== null ? S.paced(r.tight.room, r.tight.audience, r.cap) : S.roomTight(r.tight.room, r.tight.audience, r.dates.fromSaid)
  ] : [];
  return [
    ...room,
    ...awaitsReview(r) && !sendWaitsForReview(r.kind, r.on) ? [S.whatsappReview] : [],
    ...r.reminder ? [S.reminderAsk(S.day(r.reminder, world.tz, world.now), r.audience.name)] : []
  ];
}
function sendDay(r, S) {
  if (r.cap !== null) return [];
  const hour = S.hour(SEND_HOUR);
  return [
    r.dates.firstAt === null ? S.firstAtApprove(r.audience.name, hour) : S.firstSend(r.audience.name, r.dates.fromSaid, hour)
  ];
}
function offerPlan(r, world) {
  const { steps, add } = planSteps();
  const template_id = r.message.made ? stepToken(add("message", r.message.input, SAY.why.message)) : r.message.id;
  if (r.note.input) add("note", r.note.input, SAY.why.note);
  for (const p of r.pauses) add("change", p.input, SAY.why.pause);
  const sends = { template_id, params: r.message.params };
  const title = SAY.offerTitle(r.offer.words);
  if (r.cap !== null)
    add(
      "playbook",
      {
        trigger: "saved_list",
        list: r.audience.token,
        policy_class: "campaign",
        ...sends,
        cap_per_run: r.cap,
        name: clip(title, PLAYBOOK_NAME_MAX),
        channels: r.on,
        until: r.dates.until
      },
      SAY.why.paced
    );
  else
    add(
      "broadcast",
      {
        ...sends,
        ...r.to,
        ...r.dates.firstAt === null ? {} : { scheduled_for: new Date(r.dates.firstAt).toISOString() },
        name: clip(title, BROADCAST_NAME_MAX),
        channels: r.on
      },
      SAY.why.first
    );
  const S = OFFER_PLAN_WORDS[world.says];
  const words = [
    ...r.onSaid,
    ...r.note.input ? [] : [r.note.said],
    ...r.pauses.map((p) => p.said),
    ...sendUnseen(r, world),
    // A send WhatsApp's review holds, approved once it is reviewed, as its card says too (plan-steps.ts reviewedStep).
    ...awaitsReview(r) && sendWaitsForReview(r.kind, r.on) ? [S.reviewFirst] : [],
    r.message.made ? S.writeMessage(r.message.name, r.on) : S.reuseMessage(r.message.name),
    ...r.note.input ? [r.note.said] : [],
    ...sendDay(r, S)
  ];
  return { steps, words: words.join(" ") };
}
export function planOf(intent, world) {
  if (intent.intent === "cover_journey") return journeyPlan(intent, world);
  const read = offerRead(intent.offer, intent.say, world);
  return "refused" in read ? read : offerPlan(read, world);
}
