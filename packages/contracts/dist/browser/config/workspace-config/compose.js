import {
  callBookingLine,
  callLinkWays,
  cannotSendLink,
  NO_LINK_DETAILS,
  offersBookingLink,
  offersLinkOn,
  priceNextStep
} from "../no-booking-link.js";
import { guardrailsInForce } from "./config-rules.js";
import { bookingHeld, policyRules } from "./policy-classes.js";
import { DATA_NOT_INSTRUCTIONS } from "../../ai/fence.js";
import { offersAskRule } from "./offers-ask.js";
import { CONVERSATION_UNDER_WAY } from "./assistant-disclosure.js";
import { hoursLines, joinList } from "./prompt-hours.js";
import { dateFormat } from "../../shared/time.js";
function dateKeyInZone(tz, at) {
  try {
    const parts = dateFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(at);
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year"), m = get("month"), d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}
function labelDate(key, withWeekday) {
  const at = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || dateKeyInZone("UTC", at) !== key) return key;
  return dateFormat("en-US", {
    timeZone: "UTC",
    ...withWeekday ? { weekday: "long" } : {},
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(at);
}
function businessToday(tz, at) {
  return tz && dateKeyInZone(tz, at) || dateKeyInZone("UTC", new Date(at.getTime() - 864e5));
}
function upcomingClosures(closures, today) {
  if (!closures?.length) return [];
  if (!today) return closures;
  return closures.filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function notesInForceOn(notes, today) {
  if (!notes?.length) return [];
  if (!today) return [...notes];
  return notes.filter((n) => !n.until || n.until >= today);
}
export function notesInForce(notes, tz, now) {
  return notesInForceOn(notes, businessToday(tz, now));
}
export function noteAsTold(n) {
  return n.until ? `${n.title} (until ${labelDate(n.until, true)}): ${n.text}` : `${n.title}: ${n.text}`;
}
function closureLines(closures) {
  return closures.map((c) => {
    const when = c.until && c.until !== c.date && c.until > c.date ? `${labelDate(c.date, false)} \u2013 ${labelDate(c.until, false)}` : labelDate(c.date, true);
    return c.note ? `${when} \u2014 ${c.note}` : when;
  });
}
function closedToday(closures, tz, at) {
  if (!closures?.length || !tz) return null;
  const today = dateKeyInZone(tz, at);
  if (!today) return null;
  return closures.find((c) => {
    const end = c.until && c.until >= c.date ? c.until : c.date;
    return c.date <= today && today <= end;
  }) ?? null;
}
const NO_CLOCK = "You do not know today's date or the current time. If a customer asks whether the business is open right now, or about today or tomorrow, state the opening hours and let them compare \u2014 never guess which day it is.";
export function describeNow(tz, now = /* @__PURE__ */ new Date(), closures) {
  if (!tz) return NO_CLOCK;
  try {
    const stamp = dateFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz
    }).format(now);
    const shut = closedToday(closures, tz, now);
    const today = shut ? ` The business is CLOSED today${shut.note ? ` \u2014 ${shut.note}` : ""}, whatever the weekly hours say. Do not offer today; offer the next day it is open.` : "";
    return `Right now it is ${stamp} (${tz}).${today} Use this for anything about today, tomorrow, or whether the business is open at this moment \u2014 compare it against the opening hours and the closed dates, and treat a closed date as final.`;
  } catch {
    return NO_CLOCK;
  }
}
export const PROMPT_OPENINGS = {
  hours: "Opening hours",
  closures: "Closed on these dates",
  services: "Services:",
  notes: "Other things to know:",
  bookingRules: "Booking rules:",
  handoffChat: "Handing the conversation to a person:",
  handoffCall: "Handing the caller to a person:",
  /** The call's tool mechanics: check_availability, send_booking_link, end_call. */
  callTools: "Open times: use check_availability",
  callMedium: "You are speaking aloud.",
  chatMedium: "Keep replies short enough to read on a phone.",
  openTimes: "If open times are listed after these instructions",
  /** The rules, last: the guardrails in a composed prompt, Autonomy's alone after a prompt nothing composed. */
  rules: "Rules you must follow:",
  /** Above the owner's own words, when there are details above for them to disagree with. */
  ownWordsUnderDetails: "Further instructions from the business.",
  /** Above the owner's own words on a call, alone or after the line above. */
  ownWordsOnACall: "Some of it was written for text conversations"
};
export function noLinkBooking(channel) {
  return channel === "voice" ? `Booking: there is no booking link, so never use send_booking_link. When the caller wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}, and say the team will follow up.` : `There is no booking link to send. When someone wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}; once they have told you, say the team will follow up and set escalate to true.`;
}
export function composeSystemPrompt(base, profile, channel = "whatsapp", tz, now = /* @__PURE__ */ new Date(), policy, audience = "customer") {
  return composeSystemPromptWith(base, profile, channel, tz, now, policy, audience);
}
function composeSystemPromptWith(base, profile, wire, tz, now, policy, audience) {
  const channel = wire === "voice" ? "voice" : "whatsapp";
  const link = offersBookingLink(base) ? base.booking_link : null;
  const handed = offersLinkOn(
    channel === "voice" ? "call" : "chat",
    base,
    base.whatsapp_line,
    base.booking_message,
    base.texting_line
  ) ? link : null;
  const hrs = hoursLines(profile.hours);
  const today = businessToday(tz, now);
  const closed = closureLines(upcomingClosures(profile.closures, today));
  const notes = notesInForceOn(profile.notes, today).map(noteAsTold);
  const facts = { base, profile, channel, wire, tz, policy, link, handed, hrs, closed, notes, audience };
  return PROMPT_SECTIONS.flatMap((section) => section(facts)).join("\n");
}
const PROMPT_SECTIONS = [
  identitySection,
  contactSection,
  hoursSection,
  closuresSection,
  servicesSection,
  notesSection,
  bookingRulesSection,
  handoffSection,
  callToolsSection,
  ownWordsSection,
  mediumSection,
  openTimesSection,
  rulesSection
];
function identitySection({ base, profile, channel, wire }) {
  const s = [];
  const medium = wire === "voice" ? "on the phone" : wire === "sms" ? "by text message" : wire === "instagram" ? "in Instagram direct messages" : "over WhatsApp";
  s.push(`You are the assistant for ${base.business_name}, answering customers ${medium}.`);
  const named = (profile.assistant_name ?? "").trim();
  if (named) s.push(`Your name is ${named}. Introduce yourself by it, as the business's automated assistant.`);
  if (profile.tone) s.push(`Tone: ${profile.tone}`);
  if (profile.languages?.length) {
    const list = profile.languages.join(", ");
    s.push(
      channel === "voice" ? (
        // A call hears only these: the line listens for its workspace's languages (voice-converge's locales). A caller
        // picks the language by speaking it; nobody asks a phone agent to "reply in Spanish".
        `You speak: ${list}. Answer in whichever of these the caller uses, and switch if they do.`
      ) : (
        // In writing the list is a preference, not a limit (the Settings wiring review, item 13, 18 Oct 2026; the
        // owner's rule that language is the model's to follow): the customer's own language comes first.
        `The business serves customers in: ${list}. Reply in the language the customer writes in, and switch if they do.`
      )
    );
  }
  return s;
}
function contactSection({ base, profile, link }) {
  const s = [];
  if (profile.address) s.push(`
Address: ${profile.address}`);
  if (base.phone_display) s.push(`Phone: ${base.phone_display}`);
  if (link) s.push(`Booking link: ${link}`);
  if (profile.website) s.push(`Website: ${profile.website}`);
  return s;
}
function hoursSection({ tz, hrs }) {
  const s = [];
  if (hrs.length) {
    const where = tz ? ` (all times ${tz})` : "";
    s.push(`
${PROMPT_OPENINGS.hours}${where}:
${hrs.map((l) => `- ${l}`).join("\n")}`);
  }
  return s;
}
function closuresSection({ closed }) {
  const s = [];
  if (closed.length) {
    s.push(
      `
${PROMPT_OPENINGS.closures}, whatever the opening hours above say:
${closed.map((l) => `- ${l}`).join(
        "\n"
      )}
If someone asks about one of these dates, say the business is closed that day and offer the next day it is open.`
    );
  }
  return s;
}
function servicesSection({ profile }) {
  const s = [];
  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" \u2014 ")}`;
    });
    s.push(`
${PROMPT_OPENINGS.services}
${lines.join("\n")}`);
  }
  return s;
}
function notesSection({ notes }) {
  const s = [];
  if (notes.length) s.push(`
${PROMPT_OPENINGS.notes}
${notes.map((l) => `- ${l}`).join("\n")}`);
  return s;
}
function bookingRulesSection({ profile }) {
  const s = [];
  const br = profile.booking_rules;
  if (br && (br.lead_hours !== void 0 || br.consult_first?.length || br.party_max || br.notes?.length || br.ask_email || br.walk_ins)) {
    const lines = bookingRuleLines(br);
    s.push(`
${PROMPT_OPENINGS.bookingRules}
${lines.map((l) => `- ${l}`).join("\n")}`);
  }
  return s;
}
const WALK_IN_LINES = {
  yes: "Walk-ins are welcome during opening hours.",
  room: "Walk-ins are taken when there's room; never promise one. Suggest booking ahead to be sure.",
  no: "No walk-ins: customers book ahead."
};
function bookingRuleLines(br) {
  const lines = [];
  if (br.lead_hours !== void 0) {
    lines.push(
      br.lead_hours === 0 ? "Same-day bookings are fine, right up to the time." : `At least ${br.lead_hours} hour${br.lead_hours === 1 ? "" : "s"}' notice for any appointment.`
    );
  }
  if (br.consult_first?.length)
    lines.push(`These need a consultation before they can be booked: ${br.consult_first.join(", ")}.`);
  if (br.walk_ins) lines.push(WALK_IN_LINES[br.walk_ins]);
  if (br.party_max)
    lines.push(
      `Up to ${br.party_max} ${br.party_max === 1 ? "person" : "people"} per booking; larger groups go to a person.`
    );
  if (br.ask_email)
    lines.push(
      "When you send the booking link and no email address is on file for them, ask once for their best email address, then move on. Never insist; thank them if they give one."
    );
  for (const n of br.notes ?? []) lines.push(n);
  return lines;
}
function handoffSection({ profile, channel }) {
  const s = [];
  if (channel === "whatsapp") {
    const when = profile.escalate_when?.length ? `
${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    s.push(
      `
${PROMPT_OPENINGS.handoffChat}
Set escalate to true: that is what tells a person and holds the conversation for them \u2014 saying you will fetch someone does nothing on its own. Write the reply you would normally send. If you ever answer in plain words, without that record, put the exact token [[HUMAN]] at the very end of your reply instead; it is removed before the customer sees it.
Do this whenever the customer asks for a person, is upset, or asks something these instructions do not cover${when ? ", and whenever:" : "."}${when}`
    );
  } else {
    const when = profile.escalate_when?.length ? `
${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    const staffed = profile.handoff_number ? "Use transfer_to_staff during opening hours \u2014 it rings the line a person answers, and you stay on until they pick up. Outside opening hours, or if the transfer does not connect, take the caller's name and a short message and say the team will follow up." : "There is no line to transfer to. Take the caller's name and a short message and say the team will follow up.";
    s.push(
      `
${PROMPT_OPENINGS.handoffCall}
${staffed}
Do this whenever the caller asks for a person, is upset, or asks something these instructions do not cover${when ? ", and whenever:" : "."}${when}`
    );
  }
  return s;
}
function callToolsSection({ base, channel, link, handed }) {
  const s = [];
  if (channel !== "whatsapp") {
    s.push(
      `
${PROMPT_OPENINGS.callTools} before offering a time \u2014 it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.
${handed ? callBookingLine(base) : link ? cannotSendLink(base.whatsapp_line) : noLinkBooking("voice")}
Ending: once the caller has said goodbye, use end_call.`
    );
  }
  return s;
}
function ownWordsSection({ profile, channel, hrs, closed }) {
  const s = [];
  if (profile.extra_instructions?.trim()) {
    const above = [
      profile.address ? "address" : "",
      hrs.length ? "hours" : "",
      closed.length ? "closed dates" : "",
      profile.services?.length ? "services" : ""
    ].filter(Boolean);
    const stated = above.length > 0;
    const text = profile.extra_instructions.trim();
    const header = [
      stated ? `${PROMPT_OPENINGS.ownWordsUnderDetails} Where these disagree with the ${joinList(above)} above, the details above are current and correct.` : "",
      channel === "voice" ? `${PROMPT_OPENINGS.ownWordsOnACall}; you are on a phone call.` : ""
    ].filter(Boolean).join(" ");
    s.push(header ? `
${header}
${text}` : `
${text}`);
  }
  return s;
}
function mediumSection({ base, channel, link, handed }) {
  const s = [];
  const ways = callLinkWays(base, base.whatsapp_line, base.booking_message, base.texting_line);
  const by = ways.whatsapp ? ways.text ? "to the caller's WhatsApp or by text" : "to the caller's WhatsApp" : "by text";
  const callMedium = handed ? `Keep answers to one or two sentences, never read a URL out character by character, and offer to send the booking link ${by} instead.` : "Keep answers to one or two sentences, and never read a URL out character by character.";
  const chatMedium = link ? "Send the booking link rather than describing how to book." : noLinkBooking("whatsapp");
  s.push(
    channel === "voice" ? `
${PROMPT_OPENINGS.callMedium} ${callMedium}` : `
${PROMPT_OPENINGS.chatMedium} ${chatMedium}`
  );
  return s;
}
function openTimesSection({ handed, policy }) {
  const s = [];
  s.push(
    `
${PROMPT_OPENINGS.openTimes}, offer up to three that fit what the customer wants, ` + (handed && bookingHeld(policy) ? "then say a member of the team will call or text them to confirm one, and take their name \u2014 the calendar decides, never you. If none are listed, do not guess at open times." : handed ? "then send the booking link \u2014 the calendar decides, never you. If none are listed, do not guess at open times; send the link." : `then take ${NO_LINK_DETAILS} so the team can confirm one \u2014 the calendar decides, never you. If none are listed, do not guess at open times.`)
  );
  return s;
}
const ASSISTANT_RULE = {
  always: "You are the business's automated assistant: never claim or hint that you are a person. If anyone asks whether you are a bot, a person or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
  textOpening: `Unless the facts about them say "${CONVERSATION_UNDER_WAY}", open your reply by saying, in a few words, that you are the business's automated assistant.`
};
const RULES_WIN = "Where anything above disagrees with these rules, the rules win.";
export function standingRules(policy, channel, audience) {
  const assistant = audience === "draft" ? [] : channel === "voice" ? [ASSISTANT_RULE.always] : [ASSISTANT_RULE.always, ASSISTANT_RULE.textOpening];
  return [...policyRules(policy, channel), ...assistant, RULES_WIN, DATA_NOT_INSTRUCTIONS];
}
function rulesSection({ base, profile, channel, policy, link, handed, audience }) {
  const s = [];
  const g = guardrailsInForce(profile.guardrails);
  const rules = [];
  if (g.never_quote_prices) {
    rules.push(
      `Never quote or confirm a price. Say it is quoted in person or at a consult, and ${priceNextStep(!!handed)}.`
    );
  } else {
    rules.push(
      `Say a price only as the business wrote it in the details above, exactly as written and in digits; never work one out or estimate one. For any other price, say it is quoted in person or at a consult, and ${priceNextStep(!!handed)}.`
    );
  }
  if (g.never_confirm_booking) {
    rules.push(
      `Never promise or confirm an appointment yourself. Booking happens ${link ? "on the booking link or " : ""}with staff.`
    );
  }
  rules.push(
    base.whatsapp_line ? "If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else." : "If a message is only the words YES OFFERS or SI OFERTAS, thank them in one short line and promise nothing: this business sends no offers or news by message."
  );
  if (channel === "whatsapp" && base.whatsapp_line) rules.push(offersAskRule());
  if (g.no_health_advice) {
    rules.push(
      `Never give medical or health advice \u2014 for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment${handed ? " and offer the booking link" : ""}.`
    );
  }
  rules.push(...standingRules(policy, channel, audience));
  if (rules.length) s.push(`
${PROMPT_OPENINGS.rules}
${rules.map((r) => `- ${r}`).join("\n")}`);
  return s;
}
