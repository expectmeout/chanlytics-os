// Chanlytics — Settings › Business: what the folds share. Each fold's id, the shape of the draft it opens with, the
// tables every fold reads (the days, the booking rules' ranges, the caps the save takes, the paths each fold writes),
// and the small readers of a box. Split from folds.ts, which has the three helpers of each fold; see it for how a fold
// uses them. Pure, and no JSX.

import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import type { BookingRuleKey, ProfileLimitKey, ProfileRefusalKey } from "@chanlytics/contracts";
import { BOOKS_BY_HAND, booksWithOf, isBookingTool } from "@chanlytics/contracts";
import { trimmed, type Config, type StoredNote } from "./save";

/** The folds, each named by its id. */
export type FoldName =
  | "tone"
  | "hours"
  | "closures"
  | "services"
  | "languages"
  | "notes"
  | "escalate_when"
  | "booking_rules"
  | "consult_first"
  | "guardrails"
  | "extra_instructions"
  | "fallbacks"
  | "calendar"
  | "receptionist";

/** Every problem with a draft at once, by the field it is under. */
export type Problems = Record<string, string>;

/** One shift of a day, as its two boxes hold it. */
export interface ShiftDraft {
  open: string;
  close: string;
}

/** A day of the hours fold's draft: open or closed, and its shifts. */
export interface DayDraft {
  isOpen: boolean;
  shifts: ShiftDraft[];
}

/** A closure's row in the draft. */
export interface ClosureRow {
  date?: string;
  until?: string;
  note?: string;
}

/** A service's row in the draft: the minutes as its box holds them (a number as stored, a string as typed). */
export interface ServiceRow {
  name?: string;
  duration_min?: number | string;
  price_note?: string;
}

/** The booking rules fold's draft: each number as its box holds it, the notes one to a line, the email switch. */
export interface RulesDraft {
  [key: string]: string | boolean;
  notes: string;
  ask_email: boolean;
}

/** The instructions fold's draft: the owner's words, and whether they were carried from the prompt written before the form. */
export interface InstructionsDraft {
  text: string;
  carried: boolean;
}

/** The create card's draft: the name, the number as the Who you are row holds it, and the booking link. */
export interface ReceptionistDraft {
  name: string;
  own: boolean;
  typed: string;
  link: string;
  sells_by?: string | null;
}

/** What each fold opens with, by its id. */
export interface DraftOf {
  tone: string;
  hours: Record<string, DayDraft>;
  closures: ClosureRow[];
  services: ServiceRow[];
  languages: string[];
  notes: StoredNote[];
  escalate_when: string;
  booking_rules: RulesDraft;
  consult_first: string;
  guardrails: Record<string, boolean>;
  extra_instructions: InstructionsDraft;
  fallbacks: Record<string, string>;
  calendar: CalendarDraft;
  receptionist: ReceptionistDraft;
}

/**
 * The Booking tool fold's draft: what the owner books with, as the picker holds it (a tool of contracts
 * BOOKING_TOOL_IDS, "calendar" for a calendar with no tool behind it, "hand" for nothing at all, "" for nothing said
 * yet: contracts booksWithOf), and the calendar link's address as its box holds it.
 */
export interface CalendarDraft {
  with: string;
  ical_url: string;
}

// The days of the week in the schema's order (contracts DAYS): the hours fold writes every one of them.
export const BT_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// The lines of a box, one rule or reason each: those with something on them, trimmed.
export const btLines = (text: unknown) =>
  String((text == null ? "" : text) as string)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * The booking rules the booking_rules fold edits, each with the range the schema allows (contracts
 * BookingRulesSchema, whose bounds a folds test holds these to), as a plain [key, least, most]. One table, so the range
 * a save writes and the range a check refuses are never two. Its notes are the fold's too; consult_first is a fold of
 * its own.
 *
 * The sentence for a number outside a rule's range is contracts' (bookingRuleRefusal, through the bridge), asked for
 * when the check runs: it states the range and what an empty box uses, with its unit ("…leave it empty to use 2 hours."),
 * and a sentence with a number in it is contracts' (spec §3).
 */
export const BT_RULES: [BookingRuleKey, number, number][] = [
  ["lead_hours", 0, 168],
  // The slot length has a field of its own now (S2): 15 to 240 minutes, as the schema allows; blank is the calendar's
  // default.
  ["slot_min", 15, 240],
  ["buffer_min", 0, 120],
  ["max_days_ahead", 1, 90],
  ["party_max", 1, 20],
];
export const btRuleRefusal = (key: BookingRuleKey) => BUSINESS_TAB.bookingRuleRefusal(key);
// A blank box stores no rule, never zero, and the default applies where the rule has one; anything that is not a whole
// number in the rule's range would store none either, which is why problemsOf refuses it first. Digits only: parseInt
// read "2.5" as 2, "30min" as 30 and "1e2" as 1, and stored a rule nobody typed.
export const btRuleNumber = (v: unknown, lo: number, hi: number) => {
  const typed = trimmed(v);
  if (!/^[0-9]+$/.test(typed)) return undefined;
  const n = parseInt(typed, 10);
  return n >= lo && n <= hi ? n : undefined;
};

// The four rules it always keeps (contracts GUARDRAIL_KEYS), and the three messages sent in the business's name (S5).
export const BT_GUARDRAILS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"];
export const BT_FALLBACKS = ["greeting", "error", "non_text"];

/**
 * How much of each thing the save's schema takes (contracts BusinessProfileSchema and its parts), once, for the folds:
 * a list offers no "Add" past its count, a box says its length before a round trip, and a number input takes its range
 * from RULES. The old form enforced one of these in its own markup (ten notes) and none of the rest, so a name of 81
 * characters was refused by the server under no field at all.
 *
 * The closures and shifts caps are contracts' (PROFILE_LIMITS, which carries MAX_CLOSURES and MAX_INTERVALS_PER_DAY),
 * read when asked.
 */
export const BT_LIMITS = new Proxy({} as Record<ProfileLimitKey, number>, {
  get(_t, key) {
    const limits = BUSINESS_TAB.PROFILE_LIMITS;
    return key in limits ? limits[key as ProfileLimitKey] : Infinity;
  },
});
// A refusal that names a cap is written from that same cap, once, in contracts (profileRefusal): the page held both,
// so every number was typed twice -- "At most 2,000 characters" stood beside a check reading `t.length > 2000` on the
// line above it. `seen` is what was measured; `of` names what it was measured on (a day, the word itself).
export const btRefusalOf = (key: ProfileRefusalKey, seen?: number, of?: string) =>
  BUSINESS_TAB.profileRefusal(key, seen, of);
// A service's minutes as its box holds them: a whole number, 0 for an empty box, NaN for anything else.
export const btMinutes = (v: unknown) => {
  const typed = trimmed(v);
  if (typed === "") return 0;
  return /^[0-9]+$/.test(typed) ? parseInt(typed, 10) : NaN;
};
export const BT_DAY_NAMES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/**
 * Exactly what each fold writes, as dotted paths into the whole config: nothing outside them is the fold's to change.
 * Two folds share booking_rules, each with only its own of its keys, and three write beside the profile: the rules
 * write the photos switch (features.vision), the instructions write the stored prompt, and the fallbacks and the
 * calendar write nothing in the profile at all. The calendar's are its address and what the owner books with (the
 * tool, or their own hands), each a key of its own section: whatever else a section comes to hold is kept, as it is
 * under the rules, the messages and the features.
 */
export const BT_PATHS_OF: Record<FoldName, string[]> = {
  tone: ["brain.profile.tone"],
  hours: ["brain.profile.hours"],
  closures: ["brain.profile.closures"],
  services: ["brain.profile.services"],
  languages: ["brain.profile.languages"],
  notes: ["brain.profile.notes"],
  escalate_when: ["brain.profile.escalate_when"],
  booking_rules: BT_RULES.map(([key]) => `brain.profile.booking_rules.${key}`).concat([
    "brain.profile.booking_rules.notes",
    "brain.profile.booking_rules.ask_email",
  ]),
  consult_first: ["brain.profile.booking_rules.consult_first"],
  guardrails: BT_GUARDRAILS.map((key) => `brain.profile.guardrails.${key}`).concat(["features.vision"]),
  extra_instructions: ["brain.profile.extra_instructions", "brain.system_prompt"],
  fallbacks: BT_FALLBACKS.map((key) => `brain.fallbacks.${key}`),
  // The link's address, and what the owner books with (00345): the second a section of its own, which a build from
  // before it leaves out and reads on. One fold since 7 Oct 2026, where each was a row of its own that sent the owner
  // to the other.
  calendar: ["calendar.ical_url", "bookings.tool", "bookings.by_hand"],
  // The first save a workspace makes, where it has no receptionist (create.tsx): the three things it
  // cannot answer anyone without, and the product's own prompt and messages, which the schema needs and nobody should
  // have to write (contracts newReceptionistDefaults), written only where none is stored.
  receptionist: [
    "brain.business_name",
    "brain.phone_display",
    "brain.booking_link",
    "brain.system_prompt",
    "brain.fallbacks",
  ],
};

// The keys of the profile each fold writes into, read off its paths so the two maps never disagree.
export const BT_KEYS_OF = Object.fromEntries(
  Object.entries(BT_PATHS_OF).map(([fold, paths]) => [
    fold,
    paths
      .filter((p) => p.startsWith("brain.profile."))
      .map((p) => p.split(".")[2])
      .filter((k, i, all) => all.indexOf(k) === i),
  ]),
);

// The page is untyped, so a name no fold has is said, rather than found on Object.prototype ("toString") or ignored.
export function btFoldNamed(fold: string): asserts fold is FoldName {
  if (!Object.prototype.hasOwnProperty.call(BT_PATHS_OF, fold)) {
    throw new TypeError(
      `The Business tab has no fold named ${JSON.stringify(fold)}. It has ${Object.keys(BT_PATHS_OF).join(", ")}.`,
    );
  }
}

/* ---------------------------- what every fold's writer uses, and the calendar fold's own ---------------------------- */

// A key is written with a value, and removed without one: nothing is stored as an empty string or an empty list.
export const btPut = (o: Record<string, unknown>, key: string, value: unknown) => {
  if (value === undefined) delete o[key];
  else o[key] = value;
};
// A draft the page built with a part missing is said, naming the part: written as it stood, a missing switch was stored
// as off, the opposite of the schema's "absent means on", and a missing message as "", which the save refuses.
export const btWhole = (fold: string, draft: unknown, parts: string[], kind: "boolean" | "string") => {
  const held = (draft || {}) as Record<string, unknown>;
  parts.forEach((key) => {
    if (typeof held[key] !== kind) {
      throw new TypeError(
        `The ${fold} fold's draft needs ${JSON.stringify(key)} as a ${kind}; it holds ${JSON.stringify(held[key])}.`,
      );
    }
  });
};

/** The calendar fold opens with what the owner books with, as the picker holds it (contracts booksWithOf), and the link's address. */
export const btCalendarDraft = (config: Config): CalendarDraft => {
  const ical_url = (config.calendar && config.calendar.ical_url) || "";
  return { with: booksWithOf({ ...(config.bookings || {}), ical_url }), ical_url };
};

/**
 * Two top-level sections, one fold. The calendar's is read by the edge: the address is written onto what the section
 * holds, and an emptied one removes it, and the section with it once nothing else is in it. What the owner books with
 * is a section of its own (00345), never a key of the calendar's: a calendar section with a tool and no address is one
 * a build from before this could not read, and its whole config with it. A tool of the list is written as the tool;
 * "by hand" as its own switch; a calendar with no tool behind it is the address and nothing more, so neither key is
 * kept for it.
 */
export const btWriteCalendar = (next: Config, draft: unknown) => {
  btWhole("calendar", draft, ["with", "ical_url"], "string");
  const d = draft as CalendarDraft;
  const feed = trimmed(d.ical_url);
  const calendar = { ...(next.calendar || {}) };
  btPut(calendar, "ical_url", feed || undefined);
  if (Object.keys(calendar).length) next.calendar = calendar;
  else delete next.calendar;
  const bookings = { ...(next.bookings || {}) };
  btPut(bookings, "tool", isBookingTool(d.with) ? d.with : undefined);
  btPut(bookings, "by_hand", d.with === BOOKS_BY_HAND ? true : undefined);
  if (Object.keys(bookings).length) next.bookings = bookings;
  else delete next.bookings;
};

/**
 * What the owner books with is picked from a list, never typed: nothing to refuse. The address is judged as typed,
 * except one the server masked (only an owner is sent it whole): it is the stored one, kept as it is, and judging the
 * mask would refuse a non-owner's change of the tool beside it.
 */
export const btCalendarProblems = (draft: unknown): Problems => {
  const feed = trimmed(draft && (draft as CalendarDraft).ical_url);
  return feed && !feed.includes("…") && !/^(https?|webcal):\/\/\S+$/i.test(feed)
    ? { ical_url: "The calendar link needs to be a full address, starting with https:// or webcal://" }
    : {};
};

/**
 * The calendar fold's part of a config, as the save's schema is to judge it: the link's section and what the owner
 * books with. A masked address (a non-owner's) is left out, as the page's own check leaves it: it is the stored one,
 * and the mask is no address to judge.
 */
export const btCalendarPart = (next: Config) => {
  const masked = !!next.calendar && String(next.calendar.ical_url || "").includes("…");
  return masked ? { bookings: next.bookings } : { calendar: next.calendar, bookings: next.bookings };
};
