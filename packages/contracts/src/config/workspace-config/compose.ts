/**
 * The composer: the receptionist's instructions built from the business's facts (composeSystemPrompt), a section at a
 * time (PROMPT_SECTIONS), how each part of them opens (PROMPT_OPENINGS), and the clock and the closures it is told
 * beside them (describeNow).
 * Which instructions a workspace is actually given is resolve.ts; the week's lines are prompt-hours.ts.
 */
import {
  NO_LINK_DETAILS,
  callLinkWays,
  cannotSendLink,
  offersBookingLink,
  offersLinkOn,
  priceNextStep,
} from "../no-booking-link";
import type { BookingRules, BusinessProfile, Closure, Note, WalkIns } from "./business-profile";
import { guardrailsInForce } from "./config-rules";
import { bookingHeld, policyRules } from "./policy-classes";
import { DATA_NOT_INSTRUCTIONS } from "../../ai/fence";
import { offersAskRule } from "./offers-ask";
import { CONVERSATION_UNDER_WAY } from "./assistant-disclosure";
import { hoursLines, joinList } from "./prompt-hours";
import { dateFormat } from "../../shared/time";

/**
 * The receptionist's instructions, composed from the business's facts.
 *
 * ONE function, so the WhatsApp prompt and the voice prompt are built from the
 * same source and cannot describe two different businesses. Channel shapes the
 * delivery, never the facts: `channel` only changes the medium-specific lines
 * at the end — how long a reply should be, what to do with a voice note.
 *
 * The rules are appended LAST, where no earlier instruction can read as
 * overriding them, and the last of them says so (RULES_WIN). Which rules are
 * in force is the owner's, through the switches (guardrailsInForce); that it
 * is an automated assistant, the Autonomy rows and the fence on a customer's
 * words are said to every prompt (standingRules, decision 0051).
 */
/**
 * What the receptionist is told when it has no clock.
 *
 * Silence would be worse than this. A model given opening hours and no date
 * will answer "are you open right now?" anyway, confidently, from nothing.
 */
/** "YYYY-MM-DD" for an instant, as the business experiences it. */
function dateKeyInZone(tz: string, at: Date): string | null {
  try {
    const parts = dateFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const y = get("year"),
      m = get("month"),
      d = get("day");
    return y && m && d ? `${y}-${m}-${d}` : null;
  } catch {
    return null;
  }
}

/**
 * A stored date is only named if it is a real day.
 *
 * The regex on the read path accepts 2026-11-31, which does not exist. Date
 * parsing rolls it forward to 1 December — so the receptionist would announce
 * a closure on a day the business is OPEN, and then drop the row on the very
 * day it claimed. Rather than confidently name the wrong date, an impossible
 * one is printed exactly as stored, where it reads as the mistake it is.
 */
function labelDate(key: string, withWeekday: boolean): string {
  const at = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(at.getTime()) || dateKeyInZone("UTC", at) !== key) return key;
  return dateFormat("en-US", {
    timeZone: "UTC",
    ...(withWeekday ? { weekday: "long" as const } : {}),
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(at);
}

/**
 * The business's day, "YYYY-MM-DD", for what the prompt says only while it lasts: a closure, and a note with a last
 * day. Worked out once per prompt, so the two can never disagree on what day it is.
 */
function businessToday(tz: string | null | undefined, at: Date): string | null {
  // No zone means we do not know what day it is there. Err toward stating a
  // closure (or a note) a day longer rather than hiding one that is live.
  return (tz && dateKeyInZone(tz, at)) || dateKeyInZone("UTC", new Date(at.getTime() - 86400000));
}

/** The closures still ahead of the business on its day (businessToday), oldest first. */
function upcomingClosures(closures: Closure[] | undefined, today: string | null): Closure[] {
  if (!closures?.length) return [];
  if (!today) return closures;
  return closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The owner's notes the receptionist is still told on the business's day `today` (businessToday): every note with no
 * last day, and one with a last day through that day, in the stored order. One whose day has passed stays in the config
 * and simply stops being said, as a closure does.
 */
function notesInForceOn<N extends Pick<Note, "until">>(notes: readonly N[] | undefined, today: string | null): N[] {
  if (!notes?.length) return [];
  if (!today) return [...notes];
  return notes.filter((n) => !n.until || n.until >= today);
}

/**
 * Which of the owner's notes still hold at `now`, on the business's day in `tz` (the closures' day, businessToday,
 * with its fallback for no zone): the one rule the composer says notes by, for anything else that says what the
 * receptionist is told (Ask's facts), so neither claims a note whose last day has passed.
 */
export function notesInForce<N extends Pick<Note, "until">>(
  notes: readonly N[] | undefined,
  tz: string | null | undefined,
  now: Date,
): N[] {
  return notesInForceOn(notes, businessToday(tz, now));
}

/**
 * A note as the receptionist is told it: "Parking: …", or with its last day, named as a single closed day is,
 * "Holiday hours (until Saturday, October 10, 2026): …". The prompt's line after its "- ", and Ask's facts' alike.
 */
export function noteAsTold(n: Pick<Note, "title" | "text" | "until">): string {
  return n.until ? `${n.title} (until ${labelDate(n.until, true)}): ${n.text}` : `${n.title}: ${n.text}`;
}

function closureLines(closures: Closure[]): string[] {
  return closures.map((c) => {
    const when =
      c.until && c.until !== c.date && c.until > c.date
        ? `${labelDate(c.date, false)} – ${labelDate(c.until, false)}`
        : labelDate(c.date, true);
    return c.note ? `${when} — ${c.note}` : when;
  });
}

/** Is the business shut on the date `at` falls on, in its own zone? */
function closedToday(closures: Closure[] | undefined, tz: string | null | undefined, at: Date): Closure | null {
  if (!closures?.length || !tz) return null;
  const today = dateKeyInZone(tz, at);
  if (!today) return null;
  return (
    closures.find((c) => {
      const end = c.until && c.until >= c.date ? c.until : c.date;
      return c.date <= today && today <= end;
    }) ?? null
  );
}

const NO_CLOCK =
  "You do not know today's date or the current time. If a customer asks whether the business is open right now, or about today or tomorrow, state the opening hours and let them compare — never guess which day it is.";

/**
 * The current moment, in the business's own timezone.
 *
 * Deliberately NOT part of composeSystemPrompt. That output is cached with the
 * request; this changes every minute, and folding it in would evict the whole
 * business profile from the prompt cache on every single message. It belongs
 * in its own uncached block, next to the lead note that changes per contact.
 *
 * The timezone is `tenants.timezone` — the one the metrics RPCs and the Today
 * surface already use. There is no second copy of it on the profile.
 */
export function describeNow(
  tz: string | null | undefined,
  now: Date = new Date(),
  /**
   * The workspace's closures, so a shut day is stated HERE.
   *
   * It matters that it is here and not only in the composed block above. This
   * is the last thing the model reads, and on a closure day the weekly grid
   * says open while the closure list says shut. Leaving the tie to block order
   * would decide the single highest-stakes question — "are you open today?" —
   * by accident.
   */
  closures?: Closure[],
): string {
  if (!tz) return NO_CLOCK;
  try {
    const stamp = dateFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz,
    }).format(now);
    const shut = closedToday(closures, tz, now);
    const today = shut
      ? ` The business is CLOSED today${shut.note ? ` — ${shut.note}` : ""}, whatever the weekly hours say. Do not offer today; offer the next day it is open.`
      : "";
    return `Right now it is ${stamp} (${tz}).${today} Use this for anything about today, tomorrow, or whether the business is open at this moment — compare it against the opening hours and the closed dates, and treat a closed date as final.`;
  } catch {
    // An unknown IANA zone throws. A wrong clock is worse than no clock.
    return NO_CLOCK;
  }
}

/**
 * How each part of the composed prompt opens, said once.
 *
 * Every value is the start of a line the composer writes: a section's heading,
 * the first words of a paragraph Chanlytics writes for every workspace, or one
 * of the two lines that can sit above the owner's own words. The composer
 * writes them from here, and the Business tab's prompt view (prompt-blocks.ts)
 * cuts the prompt on them from here. They were literal copies in two files, and
 * a copy that drifted folded one block into its neighbour without failing
 * anything: a closure list into the hours, the medium line into the owner's own
 * words.
 *
 * These are words the live receptionist reads. Changing one changes its prompt.
 */
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
  ownWordsOnACall: "Some of it was written for text conversations",
} as const;

/**
 * What a receptionist with no booking link does when someone wants to book, change a booking or get a quote, per
 * channel: it takes the details for the team (NO_LINK_DETAILS). In chat, escalating is what tells the team; on a call,
 * the call's analysis does (callback_needed). The shell every workspace shares still carries send_booking_link, so a
 * call names it to be left alone -- retell-fn answers the same if it is used anyway. Said by a composed prompt (the
 * call's booking line, the chat's medium line) and after a stored one (resolveSystemPrompt), in the same words.
 */
export function noLinkBooking(channel: "whatsapp" | "voice"): string {
  return channel === "voice"
    ? `Booking: there is no booking link, so never use send_booking_link. When the caller wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}, and say the team will follow up.`
    : `There is no booking link to send. When someone wants to book, change or cancel a booking, or get a quote, take ${NO_LINK_DETAILS}; once they have told you, say the team will follow up and set escalate to true.`;
}

export function composeSystemPrompt(
  /**
   * `booking_link` null for a business that quotes each job: the prompt then says what the receptionist takes instead.
   * `whatsapp_line` is the WhatsApp number the platform provisioned (facts.ts), or null: only a workspace with one is
   * told to ask for the yes to offers, which goes by WhatsApp alone (offers-ask.ts). Required, so a caller says.
   * `booking_message` is whether Meta approved the message a call sends the link in (facts.ts; R14): false, a call
   * offers no link by WhatsApp; absent or null, not read, and offered as before. `texting_line` is whether a texting
   * line the carriers approved is there (facts.ts): only true lets a call send the link by text.
   */
  base: {
    business_name: string;
    phone_display?: string | null;
    booking_link: string | null;
    whatsapp_line: string | null;
    booking_message?: boolean | null;
    texting_line?: boolean | null;
  },
  profile: BusinessProfile,
  /** Where it answers: a text and a DM are chats, as WhatsApp is, and each is told the wire it is answering on. */
  channel: PromptWire = "whatsapp",
  /** IANA zone from `tenants.timezone`, so stated hours are unambiguous. */
  tz?: string | null,
  /**
   * Only used to drop closures, and notes with a last day, that have already passed.
   *
   * No cron, no nightly prune: the composer already runs per message and
   * already knows the zone, so "has this gone by?" is a string comparison.
   * Rows that have passed stay in the config and simply stop being said.
   */
  now: Date = new Date(),
  /** The workspace's Autonomy rows (class → mode): Booking and FAQ under "ask" become rules here. */
  policy?: Record<string, { mode: string }> | null,
  /** Who reads what it writes: a customer, or a person's draft, which says nothing of being an assistant. */
  audience: PromptAudience = "customer",
): string {
  return composeSystemPromptWith(base, profile, channel, tz, now, policy, audience);
}

function composeSystemPromptWith(
  base: {
    business_name: string;
    phone_display?: string | null;
    booking_link: string | null;
    whatsapp_line: string | null;
    booking_message?: boolean | null;
    texting_line?: boolean | null;
  },
  profile: BusinessProfile,
  wire: PromptWire,
  tz: string | null | undefined,
  now: Date,
  policy: Record<string, { mode: string }> | null | undefined,
  audience: PromptAudience,
): string {
  // A text and a DM are chats: every section reads them as WhatsApp's, and only the line saying where it answers names the wire.
  const channel = wire === "voice" ? "voice" : "whatsapp";
  // A business that quotes each job has no booking link (the first run's decision 2). Each place below that offers
  // the link says instead what the receptionist takes for the team (NO_LINK_DETAILS). With a link, every word is as
  // it was.
  const link = offersBookingLink(base) ? base.booking_link : null;
  // The link it may offer to hand over here: in chat any link, on a call one WhatsApp or a text can carry (offersLinkOn).
  const handed = offersLinkOn(
    channel === "voice" ? "call" : "chat",
    base,
    base.whatsapp_line,
    base.booking_message,
    base.texting_line,
  )
    ? link
    : null;
  const hrs = hoursLines(profile.hours);
  // EVERY upcoming closure, not the first handful. A cap here and a larger cap
  // on the schema is a silent divergence between what an owner can store and
  // what the receptionist will ever say — and because the list is sorted
  // oldest-first, the ones a cap drops are the furthest out: exactly the dates
  // customers book against months ahead.
  const today = businessToday(tz, now);
  const closed = closureLines(upcomingClosures(profile.closures, today));
  const notes = notesInForceOn(profile.notes, today).map(noteAsTold);
  const facts: SectionFacts = { base, profile, channel, wire, tz, policy, link, handed, hrs, closed, notes, audience };
  return PROMPT_SECTIONS.flatMap((section) => section(facts)).join("\n");
}

/**
 * What every section of the prompt is built from: the composer's arguments, the facts worked out once because more
 * than one section reads them (the chat-or-call channel, the link and the link it may hand over, the week's lines and
 * the closures), and the notes, worked out on the same day as the closures.
 */
interface SectionFacts {
  /** The business as the composer is handed it: its name, its phone number and its booking link. */
  base: Parameters<typeof composeSystemPromptWith>[0];
  profile: BusinessProfile;
  /** A chat (WhatsApp or a text) or a call: what every section but the first decides by. */
  channel: "whatsapp" | "voice";
  /** The wire itself, which the first line names. */
  wire: PromptWire;
  tz: string | null | undefined;
  policy: Record<string, { mode: string }> | null | undefined;
  /** The booking link, or null for a business that quotes each job: a fact the prompt states. */
  link: string | null;
  /** The link it may offer to hand over here, or null: on a call, only one WhatsApp or a text can carry (offersLinkOn). */
  handed: string | null;
  /** The week's lines (hoursLines): the hours section says them, and the owner's words are told it did. */
  hrs: string[];
  /** The closures still ahead, a line each: the closures section says them, and the owner's words are told it did. */
  closed: string[];
  /** The notes still in force on the business's day, a line each (noteAsTold): the notes section says them. */
  notes: string[];
  /** A customer reads it, or a person's draft: the rules say it is an assistant only to a customer. */
  audience: PromptAudience;
}

/**
 * One section of the prompt: what it adds, in order, each joined to the next by a newline; nothing when it has
 * nothing to say.
 */
type PromptSection = (facts: SectionFacts) => string[];

/**
 * The prompt, section by section, in the order the receptionist reads it: who it is and how to reach the business,
 * the business's facts, how to hand over, the owner's own words, the medium, the open times, and the rules LAST,
 * where no earlier instruction can read as overriding them.
 */
const PROMPT_SECTIONS: readonly PromptSection[] = [
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
  rulesSection,
];

/** Who the receptionist is and where it answers, its tone, and the languages it speaks. */
function identitySection({ base, profile, channel, wire }: SectionFacts): string[] {
  const s: string[] = [];
  // The wire it answers on, never one it does not: a text was told it answered over WhatsApp until 11 Oct 2026.
  const medium =
    wire === "voice"
      ? "on the phone"
      : wire === "sms"
        ? "by text message"
        : wire === "instagram"
          ? "in Instagram direct messages"
          : "over WhatsApp";
  s.push(`You are the assistant for ${base.business_name}, answering customers ${medium}.`);
  // The receptionist's own name (decision 0073): said in the greeting, and how it introduces itself; never a claim to
  // be a person (standingRules says it is the business's automated assistant, whatever its name).
  const named = (profile.assistant_name ?? "").trim();
  if (named) s.push(`Your name is ${named}. Introduce yourself by it, as the business's automated assistant.`);
  if (profile.tone) s.push(`Tone: ${profile.tone}`);
  if (profile.languages?.length) {
    const list = profile.languages.join(", ");
    s.push(
      channel === "voice"
        ? // A call hears only these: the line listens for its workspace's languages (voice-converge's locales). A caller
          // picks the language by speaking it; nobody asks a phone agent to "reply in Spanish".
          `You speak: ${list}. Answer in whichever of these the caller uses, and switch if they do.`
        : // In writing the list is a preference, not a limit (the Settings wiring review, item 13, 18 Oct 2026; the
          // owner's rule that language is the model's to follow): the customer's own language comes first.
          `The business serves customers in: ${list}. Reply in the language the customer writes in, and switch if they do.`,
    );
  }
  return s;
}

/** How to reach the business: its address, phone number, booking link and website, each only when there is one. */
function contactSection({ base, profile, link }: SectionFacts): string[] {
  const s: string[] = [];
  if (profile.address) s.push(`\nAddress: ${profile.address}`);
  // Omitted when there is none. A receptionist that has no number to give is
  // not improved by being told to say "undefined"; it answers, offers the
  // booking link, and does not invent a way to be phoned.
  if (base.phone_display) s.push(`Phone: ${base.phone_display}`);
  if (link) s.push(`Booking link: ${link}`);
  if (profile.website) s.push(`Website: ${profile.website}`);
  return s;
}

/** The opening hours, a line for each run of days that share them, in the business's zone when it is known. */
function hoursSection({ tz, hrs }: SectionFacts): string[] {
  const s: string[] = [];
  if (hrs.length) {
    // "09:30–18:00" is not a fact until you say where. A customer calling from
    // another state gets a straight answer either way; the model needs the zone
    // to reconcile these with the clock it is given separately.
    const where = tz ? ` (all times ${tz})` : "";
    s.push(`\n${PROMPT_OPENINGS.hours}${where}:\n${hrs.map((l) => `- ${l}`).join("\n")}`);
  }
  return s;
}

/** The dates still ahead that the business is shut, whatever its hours say. */
function closuresSection({ closed }: SectionFacts): string[] {
  const s: string[] = [];
  if (closed.length) {
    s.push(
      `\n${PROMPT_OPENINGS.closures}, whatever the opening hours above say:\n${closed
        .map((l) => `- ${l}`)
        .join(
          "\n",
        )}\nIf someone asks about one of these dates, say the business is closed that day and offer the next day it is open.`,
    );
  }
  return s;
}

/** The services, each with how long it takes and its price note when it has them. */
function servicesSection({ profile }: SectionFacts): string[] {
  const s: string[] = [];
  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" — ")}`;
    });
    s.push(`\n${PROMPT_OPENINGS.services}\n${lines.join("\n")}`);
  }
  return s;
}

/**
 * The owner's notes: what the receptionist should know that fits no field, a topic each, while each lasts. When every
 * note has ended there is no heading over an empty list.
 */
function notesSection({ notes }: SectionFacts): string[] {
  const s: string[] = [];
  if (notes.length) s.push(`\n${PROMPT_OPENINGS.notes}\n${notes.map((l) => `- ${l}`).join("\n")}`);
  return s;
}

/**
 * The booking rules, when one that speaks is set: the least notice, a consultation first, the party size, the email,
 * the notes.
 */
function bookingRulesSection({ profile }: SectionFacts): string[] {
  const s: string[] = [];
  const br = profile.booking_rules;
  if (
    br &&
    (br.lead_hours !== undefined ||
      br.consult_first?.length ||
      br.party_max ||
      br.notes?.length ||
      br.ask_email ||
      br.walk_ins)
  ) {
    const lines = bookingRuleLines(br);
    s.push(`\n${PROMPT_OPENINGS.bookingRules}\n${lines.map((l) => `- ${l}`).join("\n")}`);
  }
  return s;
}

/** Walk-ins, in a line each answer says (booking_rules.walk_ins). */
const WALK_IN_LINES: Readonly<Record<WalkIns, string>> = {
  yes: "Walk-ins are welcome during opening hours.",
  room: "Walk-ins are taken when there's room; never promise one. Suggest booking ahead to be sure.",
  no: "No walk-ins: customers book ahead.",
};

/** What each booking rule that is set says, a line each, in the order the section lists them. */
function bookingRuleLines(br: BookingRules): string[] {
  const lines: string[] = [];
  if (br.lead_hours !== undefined) {
    lines.push(
      br.lead_hours === 0
        ? "Same-day bookings are fine, right up to the time."
        : `At least ${br.lead_hours} hour${br.lead_hours === 1 ? "" : "s"}' notice for any appointment.`,
    );
  }
  if (br.consult_first?.length)
    lines.push(`These need a consultation before they can be booked: ${br.consult_first.join(", ")}.`);
  // Walk-ins (decision 0073): the owner's answer at the first run, said as it is, never a promise of a free chair.
  if (br.walk_ins) lines.push(WALK_IN_LINES[br.walk_ins]);
  if (br.party_max)
    lines.push(
      `Up to ${br.party_max} ${br.party_max === 1 ? "person" : "people"} per booking; larger groups go to a person.`,
    );
  // The receptionist never books: the visit is made on the business's own site, so "ask when booking" is "ask when
  // the link goes out". Once, and only where no address is on file (what is on file is the lead's description).
  // No confirmation is promised: nothing sends one yet (the engine review's second pass, 11 Oct 2026).
  if (br.ask_email)
    lines.push(
      "When you send the booking link and no email address is on file for them, ask once for their best email address, then move on. Never insist; thank them if they give one.",
    );
  for (const n of br.notes ?? []) lines.push(n);
  return lines;
}

/** How to hand the customer to a person, and when: in chat the [[HUMAN]] token, on a call the transfer or a message. */
function handoffSection({ profile, channel }: SectionFacts): string[] {
  const s: string[] = [];
  // HOW to hand off, not just when — and unconditionally, because the product
  // promise depends on it.
  //
  // The composer told the model WHEN to fetch a human and never how. The only
  // mechanism the runtime honours is the literal [[HUMAN]] token appended to a
  // reply, and that was taught nowhere except inside one salon's hand-written
  // prose. So a composed prompt — the only kind a new workspace can get —
  // produced a receptionist that answers "let me get someone for you" and does
  // nothing: no escalation row, no pause, no staff email, no row on Today. The
  // core promise, that anything it should not decide reaches a person, silently
  // did not exist. It is latent for the live tenant too: her prompt carries the
  // token only until she writes her own extra instructions.
  //
  // WhatsApp only. On the phone there is no token to emit — Retell has its own
  // transfer tool — and a model reading "[[HUMAN]]" aloud to a caller is worse
  // than no handoff at all.
  if (channel === "whatsapp") {
    const when = profile.escalate_when?.length ? `\n${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    // Said around escalate, the record's own field, which every answer carries and the rules below name: it read
    // as though the token were the only way, a few lines above rules that say to set escalate (the engine review's
    // second pass, 11 Oct 2026). The token stays for the one reply read without its record (brain.ts legacyReply).
    s.push(
      `\n${PROMPT_OPENINGS.handoffChat}\n` +
        `Set escalate to true: that is what tells a person and holds the conversation for ` +
        `them — saying you will fetch someone does nothing on its own. Write the reply you ` +
        `would normally send. If you ever answer in plain words, without that record, put ` +
        `the exact token [[HUMAN]] at the very end of your reply instead; it is removed ` +
        `before the customer sees it.\n` +
        `Do this whenever the customer asks for a person, is upset, or asks something ` +
        `these instructions do not cover${when ? ", and whenever:" : "."}${when}`,
    );
  } else {
    // The phone has real mechanics where WhatsApp has a token: a transfer
    // tool, a booking-link tool and an end-call tool, all defined on the Retell
    // shell (packages/channels/src/voice/voice-shell.ts). The prompt has to name
    // them and say when, or the model reads "hand the caller to a person",
    // has no idea how, and says "let me get someone" to nobody.
    //
    // Only a workspace WITH a handoff line is told to transfer. The tool
    // exists on the shell regardless, dialling `{{handoff_number}}`; with no
    // line the variable is empty, and an agent told to use it would ring
    // nothing and go quiet on the caller.
    const when = profile.escalate_when?.length ? `\n${profile.escalate_when.map((e) => `- ${e}`).join("\n")}` : "";
    const staffed = profile.handoff_number
      ? "Use transfer_to_staff during opening hours — it rings the line a person answers, and you stay on until they pick up. " +
        "Outside opening hours, or if the transfer does not connect, take the caller's name and a short message and say the team will follow up."
      : "There is no line to transfer to. Take the caller's name and a short message and say the team will follow up.";
    s.push(
      `\n${PROMPT_OPENINGS.handoffCall}\n${staffed}\n` +
        `Do this whenever the caller asks for a person, is upset, or asks something these instructions do not cover${when ? ", and whenever:" : "."}${when}`,
    );
  }
  return s;
}

/**
 * On a call, after its hand-off, the call's tools: check_availability, send_booking_link (or, with no link, what to
 * take) and end_call.
 */
function callToolsSection({ base, channel, link, handed }: SectionFacts): string[] {
  const s: string[] = [];
  if (channel !== "whatsapp") {
    s.push(
      `\n${PROMPT_OPENINGS.callTools} before offering a time — it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.\n` +
        `${callBookingLine(base, link, handed)}\n` +
        "Ending: once the caller has said goodbye, use end_call.",
    );
  }
  return s;
}

/**
 * What a call does when the caller wants to book, by the ways it has to send the link (callLinkWays). The link goes by
 * WhatsApp, or by text from the business's texting line, and the call says which: this used to say the tool "texts" the
 * link while it sent a WhatsApp message, so a caller could be promised a text and get a WhatsApp message -- or nothing,
 * on a number with no WhatsApp. WhatsApp is asked about first (decision 0073, R14): a caller who says no is never sent
 * a message that cannot reach them, and is sent a text where there is a line for it (the live walk's SET-2, 28 Oct
 * 2026); the tool also texts by itself when WhatsApp cannot carry it, and says so. With a texting line alone nothing is
 * asked. A workspace with a link and no way to send it is told it cannot.
 */
function callBookingLine(base: SectionFacts["base"], link: string | null, handed: string | null): string {
  if (!handed) return link ? cannotSendLink(base.whatsapp_line) : noLinkBooking("voice");
  const ways = callLinkWays(base, base.whatsapp_line, base.booking_message, base.texting_line);
  const ours = "so do not ask them for a number unless they want it sent somewhere else. ";
  // A number to give only where there is one other than the line they are ringing (resolveSystemPrompt).
  const followUp = base.phone_display
    ? `take ${NO_LINK_DETAILS}, give the phone number above, and offer to have someone follow up.`
    : `take ${NO_LINK_DETAILS} and offer to have someone follow up.`;
  const said = "Then say what the tool answers: it tells you how the link went and whether it arrived. ";
  if (!ways.whatsapp)
    return (
      "Booking: when the caller wants to book, use send_booking_link — it sends the booking link by text message to the number they are calling from, " +
      `${ours}Tell them it comes as a text message. ${said}If it fails, ${followUp}`
    );
  const asked =
    'Booking: when the caller wants to book, first ask "Do you use WhatsApp on this number?" ' +
    `If they do, use send_booking_link — it sends the booking link to the caller's WhatsApp, on the number they are calling from, ${ours}`;
  if (!ways.text)
    return (
      `${asked}Tell them it comes by WhatsApp, not as a text message. Then say what the tool answers: it waits a moment for WhatsApp's own answer, so it tells you whether it arrived. ` +
      `If they do not use WhatsApp there, or it fails, ${followUp}`
    );
  return (
    `${asked}Tell them it comes by WhatsApp. If they do not use WhatsApp there, use send_booking_link with by set to "text", and tell them it comes as a text message. ` +
    `When WhatsApp cannot deliver it, the tool sends it by text instead. ${said}If it fails, ${followUp}`
  );
}

/** The owner's own words, under a line saying which details above win and, on a call, where the words came from. */
function ownWordsSection({ profile, channel, hrs, closed }: SectionFacts): string[] {
  const s: string[] = [];
  if (profile.extra_instructions?.trim()) {
    // A business's own prose almost always restates the address, the hours or
    // the services. Once a form fills those in structurally there are two
    // sources for one fact, and they DID disagree on a live line: the grid
    // said open Sunday, the prose said closed Sunday, and nothing told the
    // receptionist which to believe. The fields above are the ones an owner
    // can see and correct in one click, so those are the ones that win.
    // Named from what was ACTUALLY emitted above, not from a fixed list. The
    // sentence used to say "the address, hours or services above" whatever was
    // there — so a profile carrying only closures pointed the model at three
    // things the prompt did not contain, and never mentioned the one it did.
    const above = [
      profile.address ? "address" : "",
      hrs.length ? "hours" : "",
      closed.length ? "closed dates" : "",
      profile.services?.length ? "services" : "",
    ].filter(Boolean);
    const stated = above.length > 0;
    const text = profile.extra_instructions.trim();
    // This block is often a prompt that was written for ONE channel before the
    // business had fields — the pilot's opens "You are the WhatsApp assistant".
    // Read down a phone line that is a false identity statement, and the fix
    // is not to strip it (whose sentence would we delete?) but to say where it
    // came from. The channel line below and the rules after it still win.
    const header = [
      stated
        ? `${PROMPT_OPENINGS.ownWordsUnderDetails} Where these disagree with the ${joinList(above)} above, the details above are current and correct.`
        : "",
      channel === "voice" ? `${PROMPT_OPENINGS.ownWordsOnACall}; you are on a phone call.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    s.push(header ? `\n${header}\n${text}` : `\n${text}`);
  }
  return s;
}

/** How to speak on this medium: short, with no URL read out, on a call; the booking link (or what to take) in chat. */
function mediumSection({ base, channel, link, handed }: SectionFacts): string[] {
  const s: string[] = [];
  // Medium, not facts. A phone caller cannot re-read a paragraph. The link is offered the ways the call can send it.
  const ways = callLinkWays(base, base.whatsapp_line, base.booking_message, base.texting_line);
  const by = ways.whatsapp
    ? ways.text
      ? "to the caller's WhatsApp or by text"
      : "to the caller's WhatsApp"
    : "by text";
  const callMedium = handed
    ? `Keep answers to one or two sentences, never read a URL out character by character, and offer to send the booking link ${by} instead.`
    : "Keep answers to one or two sentences, and never read a URL out character by character.";
  const chatMedium = link ? "Send the booking link rather than describing how to book." : noLinkBooking("whatsapp");
  s.push(
    channel === "voice"
      ? `\n${PROMPT_OPENINGS.callMedium} ${callMedium}`
      : `\n${PROMPT_OPENINGS.chatMedium} ${chatMedium}`,
  );
  return s;
}

/** What to do with the open times listed after these instructions: offer up to three, then the link or the details. */
function openTimesSection({ handed, policy }: SectionFacts): string[] {
  const s: string[] = [];
  // Open times, when the workspace has a calendar feed, arrive AFTER these
  // instructions (with the clock: they change by the minute and must not
  // evict the cached profile). The receptionist names them; it never books.
  // Under a booking hold a person confirms, as the openings block and the Autonomy rule say: never the link here. A
  // business with no link to hand over has nothing to hold back, as the openings block reads it (describeOpenings).
  s.push(
    `\n${PROMPT_OPENINGS.openTimes}, offer up to three that fit what the customer wants, ` +
      (handed && bookingHeld(policy)
        ? "then say a member of the team will call or text them to confirm one, and take their name — the calendar decides, never you. If none are listed, do not guess at open times."
        : handed
          ? "then send the booking link — the calendar decides, never you. If none are listed, do not guess at open times; send the link."
          : `then take ${NO_LINK_DETAILS} so the team can confirm one — the calendar decides, never you. If none are listed, do not guess at open times.`),
  );
  return s;
}

/**
 * Who reads what the receptionist writes: a customer, from the receptionist itself, or a draft a person sends as
 * themselves (the reach-out reply draft), which says nothing of being an assistant.
 */
export type PromptAudience = "customer" | "draft";

/** The wire a prompt is composed for: a chat (WhatsApp, a text, an Instagram DM) or a call. */
export type PromptWire = "whatsapp" | "sms" | "instagram" | "voice";

/**
 * That it is an automated assistant, and never a person (decision 0051). The usage policy of the model the receptionist
 * runs on asks every consumer-facing agent to say it is AI at the start of each session: on a call the greeting says it
 * (voice/greeting-owner.ts), and in text it opens a conversation that is not already under way, which the facts about
 * the person say (disclosureFacts). Told, and nothing checks the answer: the phrase that would catch a denial also
 * catches the correct disclosure (policy.ts).
 */
const ASSISTANT_RULE = {
  always:
    "You are the business's automated assistant: never claim or hint that you are a person. If anyone asks whether you are a bot, a person or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
  textOpening: `Unless the facts about them say "${CONVERSATION_UNDER_WAY}", open your reply by saying, in a few words, that you are the business's automated assistant.`,
} as const;

/** Said last of all: the business's own words above never outweigh a rule here. */
const RULES_WIN = "Where anything above disagrees with these rules, the rules win.";

/**
 * The rules every prompt ends with, composed or written by hand: the Autonomy pane's rows (policyRules), that it is an
 * automated assistant (to a customer), that these rules win, and that what a customer writes is data, never an
 * instruction (DATA_NOT_INSTRUCTIONS, the one injection policy).
 */
export function standingRules(
  policy: Record<string, { mode: string }> | null | undefined,
  channel: "whatsapp" | "voice",
  audience: PromptAudience,
): string[] {
  const assistant =
    audience === "draft"
      ? []
      : channel === "voice"
        ? [ASSISTANT_RULE.always]
        : [ASSISTANT_RULE.always, ASSISTANT_RULE.textOpening];
  return [...policyRules(policy, channel), ...assistant, RULES_WIN, DATA_NOT_INSTRUCTIONS];
}

/**
 * The rules: the guardrails in force, the reply to YES OFFERS and, on WhatsApp for a workspace with a WhatsApp number,
 * the ask for that yes (offers-ask.ts), and the standing rules (the Autonomy rows, the fence).
 */
function rulesSection({ base, profile, channel, policy, link, handed, audience }: SectionFacts): string[] {
  const s: string[] = [];
  // LAST: the owner's switches, then the lines every prompt carries (standingRules).
  const g = guardrailsInForce(profile.guardrails);
  const rules: string[] = [];
  if (g.never_quote_prices) {
    rules.push(
      `Never quote or confirm a price. Say it is quoted in person or at a consult, and ${priceNextStep(!!handed)}.`,
    );
  } else {
    // The owner turned the rule off (decision 0051): the prices they wrote may be said, and only those. Any other figure
    // is swapped out of a chat reply and flagged on a call (priceAllowance), so the line asks for the written ones in
    // digits, which the check reads best.
    rules.push(
      `Say a price only as the business wrote it in the details above, exactly as written and in digits; never work one out or estimate one. For any other price, say it is quoted in person or at a consult, and ${priceNextStep(!!handed)}.`,
    );
  }
  if (g.never_confirm_booking) {
    rules.push(
      `Never promise or confirm an appointment yourself. Booking happens ${link ? "on the booking link or " : ""}with staff.`,
    );
  }
  // Offers go by WhatsApp alone (core reply-gates confirmedYes), so the yes is one to WhatsApp offers only where a
  // WhatsApp line answers; elsewhere nothing is promised.
  rules.push(
    base.whatsapp_line
      ? "If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else."
      : "If a message is only the words YES OFFERS or SI OFERTAS, thank them in one short line and promise nothing: this business sends no offers or news by message.",
  );
  // The ask for that yes, once: offers go by WhatsApp alone, so the voice prompt and a workspace with no WhatsApp number
  // are never told to ask, and the person's own facts (describeLead) say whether they have been.
  if (channel === "whatsapp" && base.whatsapp_line) rules.push(offersAskRule());
  if (g.no_health_advice) {
    rules.push(
      `Never give medical or health advice — for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment${handed ? " and offer the booking link" : ""}.`,
    );
  }
  // The Autonomy pane's Booking, FAQ and Money rows, as rules — the same words
  // on both channels' prompts, so a switch flipped once changes both — and the
  // one line every agent is given about someone else's words (ai/fence.ts).
  rules.push(...standingRules(policy, channel, audience));
  if (rules.length) s.push(`\n${PROMPT_OPENINGS.rules}\n${rules.map((r) => `- ${r}`).join("\n")}`);
  return s;
}
