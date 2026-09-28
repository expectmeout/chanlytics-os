/**
 * The composer: the receptionist's instructions built from the business's facts (composeSystemPrompt), how each
 * part of them opens (PROMPT_OPENINGS), and the clock and the closures it is told beside them (describeNow).
 * Which instructions a workspace is actually given is resolve.ts; the week's lines are prompt-hours.ts.
 */
import { NO_LINK_DETAILS, offersBookingLink, priceNextStep } from "../no-booking-link";
import { guardrailsInForce, type BusinessProfile, type Closure } from "./business-profile";
import { policyRules } from "./policy-classes";
import { hoursLines, joinList } from "./prompt-hours";

/**
 * The receptionist's instructions, composed from the business's facts.
 *
 * ONE function, so the WhatsApp prompt and the voice prompt are built from the
 * same source and cannot describe two different businesses. Channel shapes the
 * delivery, never the facts: `channel` only changes the medium-specific lines
 * at the end — how long a reply should be, what to do with a voice note.
 *
 * The guardrails are appended LAST and unconditionally. They are not the
 * owner's to remove, and putting them last means no earlier instruction can
 * read as overriding them.
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
    const parts = new Intl.DateTimeFormat("en-US", {
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
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...(withWeekday ? { weekday: "long" as const } : {}),
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(at);
}

/** The closures still ahead of the business, oldest first. */
function upcomingClosures(closures: Closure[] | undefined, tz: string | null | undefined, at: Date): Closure[] {
  if (!closures?.length) return [];
  // No zone means we do not know what day it is there. Err toward stating a
  // closure a day longer rather than hiding one that is live.
  const today = (tz && dateKeyInZone(tz, at)) || dateKeyInZone("UTC", new Date(at.getTime() - 86400000));
  if (!today) return closures;
  return closures
    .filter((c) => (c.until && c.until >= c.date ? c.until : c.date) >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
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
    const stamp = new Intl.DateTimeFormat("en-US", {
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
  /** `booking_link` null for a business that quotes each job: the prompt then says what the receptionist takes instead. */
  base: { business_name: string; phone_display?: string | null; booking_link: string | null },
  profile: BusinessProfile,
  channel: "whatsapp" | "voice" = "whatsapp",
  /** IANA zone from `tenants.timezone`, so stated hours are unambiguous. */
  tz?: string | null,
  /**
   * Only used to drop closures that have already passed.
   *
   * No cron, no nightly prune: the composer already runs per message and
   * already knows the zone, so "has this gone by?" is a string comparison.
   * Rows that have passed stay in the config and simply stop being said.
   */
  now: Date = new Date(),
  /** The workspace's Autonomy rows (class → mode): Booking and FAQ under "ask" become rules here. */
  policy?: Record<string, { mode: string }> | null,
): string {
  return composeSystemPromptWith(base, profile, channel, tz, now, policy);
}

function composeSystemPromptWith(
  base: { business_name: string; phone_display?: string | null; booking_link: string | null },
  profile: BusinessProfile,
  channel: "whatsapp" | "voice",
  tz: string | null | undefined,
  now: Date,
  policy: Record<string, { mode: string }> | null | undefined,
): string {
  const s: string[] = [];
  // A business that quotes each job has no booking link (the first run's decision 2). Each place below that offers
  // the link says instead what the receptionist takes for the team (NO_LINK_DETAILS). With a link, every word is as
  // it was.
  const link = offersBookingLink(base) ? base.booking_link : null;
  const medium = channel === "voice" ? "on the phone" : "over WhatsApp";
  s.push(`You are the assistant for ${base.business_name}, answering customers ${medium}.`);
  if (profile.tone) s.push(`Tone: ${profile.tone}`);
  if (profile.languages?.length) {
    s.push(
      `You speak: ${profile.languages.join(", ")}.` +
        // A caller picks the language by speaking it; nobody asks a phone
        // agent to "reply in Spanish".
        (channel === "voice" ? " Answer in whichever of these the caller uses, and switch if they do." : ""),
    );
  }

  if (profile.address) s.push(`\nAddress: ${profile.address}`);
  // Omitted when there is none. A receptionist that has no number to give is
  // not improved by being told to say "undefined"; it answers, offers the
  // booking link, and does not invent a way to be phoned.
  if (base.phone_display) s.push(`Phone: ${base.phone_display}`);
  if (link) s.push(`Booking link: ${link}`);
  if (profile.website) s.push(`Website: ${profile.website}`);

  const hrs = hoursLines(profile.hours);
  if (hrs.length) {
    // "09:30–18:00" is not a fact until you say where. A customer calling from
    // another state gets a straight answer either way; the model needs the zone
    // to reconcile these with the clock it is given separately.
    const where = tz ? ` (all times ${tz})` : "";
    s.push(`\n${PROMPT_OPENINGS.hours}${where}:\n${hrs.map((l) => `- ${l}`).join("\n")}`);
  }

  // EVERY upcoming closure, not the first handful. A cap here and a larger cap
  // on the schema is a silent divergence between what an owner can store and
  // what the receptionist will ever say — and because the list is sorted
  // oldest-first, the ones a cap drops are the furthest out: exactly the dates
  // customers book against months ahead.
  const closed = closureLines(upcomingClosures(profile.closures, tz, now));
  if (closed.length) {
    s.push(
      `\n${PROMPT_OPENINGS.closures}, whatever the opening hours above say:\n${closed
        .map((l) => `- ${l}`)
        .join(
          "\n",
        )}\nIf someone asks about one of these dates, say the business is closed that day and offer the next day it is open.`,
    );
  }

  if (profile.services?.length) {
    const lines = profile.services.map((sv) => {
      const bits = [sv.name];
      if (sv.duration_min) bits.push(`about ${sv.duration_min} minutes`);
      if (sv.price_note) bits.push(sv.price_note);
      return `- ${bits.join(" — ")}`;
    });
    s.push(`\n${PROMPT_OPENINGS.services}\n${lines.join("\n")}`);
  }

  if (profile.notes?.length) {
    s.push(`\n${PROMPT_OPENINGS.notes}\n${profile.notes.map((n) => `- ${n.title}: ${n.text}`).join("\n")}`);
  }

  const br = profile.booking_rules;
  if (
    br &&
    (br.lead_hours !== undefined || br.consult_first?.length || br.party_max || br.notes?.length || br.ask_email)
  ) {
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
    if (br.party_max)
      lines.push(
        `Up to ${br.party_max} ${br.party_max === 1 ? "person" : "people"} per booking; larger groups go to a person.`,
      );
    // The receptionist never books: the visit is made on the business's own site, so "ask when booking" is "ask when
    // the link goes out". Once, and only where no address is on file (what is on file is the lead's description).
    if (br.ask_email)
      lines.push(
        "When you send the booking link and no email address is on file for them, ask once for the best email for their booking confirmation, then move on. Never insist; thank them if they give one.",
      );
    for (const n of br.notes ?? []) lines.push(n);
    s.push(`\n${PROMPT_OPENINGS.bookingRules}\n${lines.map((l) => `- ${l}`).join("\n")}`);
  }

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
    s.push(
      `\n${PROMPT_OPENINGS.handoffChat}\n` +
        `Put the exact token [[HUMAN]] at the very end of your reply. It is removed ` +
        `before the customer sees it, and it is the only thing that alerts a human — ` +
        `saying you will fetch someone does nothing on its own. Write the reply you ` +
        `would normally send, then add the token.\n` +
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
    // The booking link is a WhatsApp message and nothing else: retell-fn
    // delivers it on channel "whatsapp", and texting is not sold until the
    // carriers approve a line (capabilities.ts). This used to say the tool
    // "texts" the link, so a caller could be promised a text and get a
    // WhatsApp message -- or nothing, on a number with no WhatsApp.
    s.push(
      `\n${PROMPT_OPENINGS.callTools} before offering a time — it reads the calendar as it is at that moment (a list at the end of these instructions, if any, is from the start of the call). Ask which service first when you can, so only windows long enough are offered.\n` +
        (link
          ? "Booking: when the caller wants to book, use send_booking_link — it sends the booking link to the caller's WhatsApp, on the number they are calling from, " +
            "so do not ask them for a number unless they want it sent somewhere else. " +
            "Tell them it comes by WhatsApp, not as a text message: it only arrives if that number has WhatsApp. Then confirm it was sent. " +
            "If it fails, or they do not have WhatsApp on that number, give the phone number above and offer to have someone follow up.\n"
          : `${noLinkBooking("voice")}\n`) +
        "Ending: once the caller has said goodbye, use end_call.",
    );
  }

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

  // Medium, not facts. A phone caller cannot re-read a paragraph.
  const callMedium = link
    ? "Keep answers to one or two sentences, never read a URL out character by character, and offer to send the booking link to the caller's WhatsApp instead."
    : "Keep answers to one or two sentences, and never read a URL out character by character.";
  const chatMedium = link ? "Send the booking link rather than describing how to book." : noLinkBooking("whatsapp");
  s.push(
    channel === "voice"
      ? `\n${PROMPT_OPENINGS.callMedium} ${callMedium}`
      : `\n${PROMPT_OPENINGS.chatMedium} ${chatMedium}`,
  );

  // Open times, when the workspace has a calendar feed, arrive AFTER these
  // instructions (with the clock: they change by the minute and must not
  // evict the cached profile). The receptionist names them; it never books.
  s.push(
    `\n${PROMPT_OPENINGS.openTimes}, offer up to three that fit what the customer wants, ` +
      (link
        ? "then send the booking link — the calendar decides, never you. If none are listed, do not guess at open times; send the link."
        : `then take ${NO_LINK_DETAILS} so the team can confirm one — the calendar decides, never you. If none are listed, do not guess at open times.`),
  );

  // LAST, and never optional.
  const g = guardrailsInForce(profile.guardrails);
  const rules: string[] = [];
  if (g.never_quote_prices) {
    rules.push(
      `Never quote or confirm a price. Say it is quoted in person or at a consult, and ${priceNextStep(!!link)}.`,
    );
  }
  if (g.never_confirm_booking) {
    rules.push(
      `Never promise or confirm an appointment yourself. Booking happens ${link ? "on the booking link or " : ""}with staff.`,
    );
  }
  if (g.disclose_ai) {
    rules.push(
      "If asked whether you are a bot, a person, or AI, say plainly that you are the business's automated assistant and offer to bring in a person.",
    );
  }
  rules.push(
    "If a message is only the words YES OFFERS or SI OFERTAS, the customer is saying yes to offers and news by WhatsApp: thank them in one short line, say they can reply STOP at any time, and ask nothing else.",
  );
  if (g.no_health_advice) {
    rules.push(
      `Never give medical or health advice — for anything about skin reactions, allergies, pregnancy or medication, say a professional will advise at the appointment${link ? " and offer the booking link" : ""}.`,
    );
  }
  // The Autonomy pane's Booking and FAQ rows, as rules — the same words on
  // both channels' prompts, so a switch flipped once changes both.
  rules.push(...policyRules(policy, channel));
  if (rules.length) s.push(`\n${PROMPT_OPENINGS.rules}\n${rules.map((r) => `- ${r}`).join("\n")}`);

  return s.join("\n");
}
