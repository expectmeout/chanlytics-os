/**
 * The settings change a card may apply: its shape, the change applied to a parsed config (applySettingsChange) and
 * the card's one line (describeSettingsChange). The workspace's cards propose it (ask-proposals/workspace.ts); its
 * schema is ask-schemas.ts's.
 */
// The whole-word cut the thread's lines use; Ask's own `clip` (ask-answer.ts) reaches this module through the
// proposals, so importing it here would close a cycle.
import { clipAtWord } from "../conversations/message-words";
import { VISION_SWITCH_WORDS } from "../config/business-tab/abilities";
import { newReceptionistDefaults } from "../config/workspace-config/brain-config";
import { FALLBACK_DEFAULTS, FALLBACK_ROWS } from "../config/workspace-config/fallbacks";
import { instructionsDraft } from "../config/workspace-config/resolve";
import { formatPhoneDisplay, handoffE164 } from "../shared/phone";
import { phoneVoiceOf } from "../voice/phone-voices";

/** How much of a note's text its card quotes, in characters, before it is cut on a whole word. */
const NOTE_TEXT_SAID_MAX = 160;

/* ------------------------------------------------------- settings changes */

/**
 * The few settings an owner changes from the floor, as a change the model
 * may propose and a card may apply: a closure, a day's hours, a note the
 * receptionist will read, a service, and every row of How it answers (the
 * Settings wiring review, item 14, 18 Oct 2026). Applied to a parsed config,
 * never to the row, so the settings route's own validation still decides.
 */
export type AskSettingsChange =
  | { op: "add_closure"; date: string; until?: string; note?: string }
  | { op: "set_hours"; day: string; open: string | null; close: string | null }
  | { op: "add_note"; title: string; text: string; until?: string }
  | { op: "add_service"; name: string; duration_min?: number }
  | { op: "set_goal"; goal: string }
  | AskAnswersChange;

/** Which of the three messages sent in the business's name a change rewrites. */
export type AskMessageKey = (typeof FALLBACK_ROWS)[number]["key"];

/**
 * A change to a row of How it answers, as its fold saves it: its voice (tone), the languages, what callers hear first,
 * the voice they hear it in, the transfer number, words added to the owner's own, one of the three messages, and the
 * photo switch. An empty value is the row emptied: no voice, the standard greeting, a message instead of a transfer,
 * the product's wording.
 */
export type AskAnswersChange =
  | { op: "set_tone"; tone: string }
  | { op: "set_languages"; languages: string[] }
  | { op: "set_phone_greeting"; greeting: string }
  | { op: "set_phone_voice"; voice: string }
  | { op: "set_transfer_number"; number: string }
  | { op: "add_own_words"; text: string }
  | { op: "set_message"; which: AskMessageKey; text: string }
  | { op: "set_photos"; on: boolean };

/**
 * Each op of How it answers, with the row its card opens (Settings' address, admin/receptionist/<row>), or none: the
 * photo switch is a line of What it can do, which is no row.
 */
export const ASK_ANSWERS_ROWS: Readonly<Record<AskAnswersChange["op"], string | null>> = {
  set_tone: "tone",
  set_languages: "languages",
  set_phone_greeting: "phone_greeting",
  set_phone_voice: "phone_voice",
  set_transfer_number: "handoff_number",
  add_own_words: "extra_instructions",
  set_message: "fallbacks",
  set_photos: null,
};

/** A list of languages as a row keeps it: each trimmed, none twice, none empty. */
const languagesOf = (list: readonly string[]): string[] => [
  ...new Set(list.map((l) => l.trim()).filter((l) => l !== "")),
];

type Cfg = { brain?: { profile?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C {
  // The photo switch is a feature, beside the brain (What it can do's switch writes it there).
  if (change.op === "set_photos")
    return {
      ...config,
      features: { ...(config.features ?? {}), vision: change.on },
    };
  if (isAnswersBrainChange(change)) return applyAnswersChange(config, change);
  // The owner's goal is Ask's own section, never the receptionist's profile: set, or taken away when empty.
  if (change.op === "set_goal") {
    const ask = { ...((config.ask as Record<string, unknown> | undefined) ?? {}) };
    const goal = change.goal.trim();
    if (goal) ask.goal = goal;
    else delete ask.goal;
    return { ...config, ask };
  }
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]>;
  const profile = { ...((brain.profile ?? {}) as Record<string, unknown>) };
  switch (change.op) {
    case "add_closure": {
      const closures = [...((profile.closures as unknown[]) ?? [])];
      closures.push({
        date: change.date,
        ...(change.until ? { until: change.until } : {}),
        ...(change.note ? { note: change.note } : {}),
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...((profile.hours as Record<string, unknown>) ?? {}) };
      hours[change.day] =
        change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...((profile.notes as unknown[]) ?? [])];
      // Its last day only when it has one: a note with none is said for good, as every note was before it had one.
      notes.push({ title: change.title, text: change.text, ...(change.until ? { until: change.until } : {}) });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...((profile.services as unknown[]) ?? [])];
      services.push({ name: change.name, ...(change.duration_min ? { duration_min: change.duration_min } : {}) });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}

type BrainChange = Exclude<AskAnswersChange, { op: "set_photos" }>;
const BRAIN_OPS: ReadonlySet<string> = new Set<BrainChange["op"]>([
  "set_tone",
  "set_languages",
  "set_phone_greeting",
  "set_phone_voice",
  "set_transfer_number",
  "add_own_words",
  "set_message",
]);
const isAnswersBrainChange = (change: AskSettingsChange): change is BrainChange => BRAIN_OPS.has(change.op);

/** A key of the profile set to a value, or taken away where the value is none. */
const putKey = (profile: Record<string, unknown>, key: string, value: unknown) => {
  if (value === undefined) delete profile[key];
  else profile[key] = value;
};

/**
 * How it answers' rows on the brain, each as its fold saves it (business/folds.ts): the owner's own words are what the
 * box opens with (the prompt carried from before the form among them) with the new words after, and the prompt the
 * product's opening lines, as a save of the box writes them; a message emptied is the product's wording.
 */
function applyAnswersChange<C extends Cfg>(config: C, change: BrainChange): C {
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]> & {
    system_prompt?: string | null;
    business_name?: string;
    fallbacks?: Record<string, string>;
  };
  const profile = { ...(brain.profile ?? {}) };
  switch (change.op) {
    case "set_tone":
      putKey(profile, "tone", change.tone.trim() || undefined);
      break;
    case "set_languages": {
      const list = languagesOf(change.languages);
      putKey(profile, "languages", list.length ? list : undefined);
      break;
    }
    // Emptied, the standard greeting. The standard line typed out is made empty by the tool that proposes it (act/settings.ts),
    // as the row's own save stores it: the check reads the greeting's disclosure rules, which stay out of the tab's bundle.
    case "set_phone_greeting":
      putKey(profile, "phone_greeting", change.greeting.trim() || undefined);
      break;
    case "set_phone_voice":
      putKey(profile, "phone_voice", change.voice);
      break;
    case "set_transfer_number":
      putKey(profile, "handoff_number", handoffE164(change.number) ?? undefined);
      break;
    case "add_own_words": {
      const now = instructionsDraft({ ...brain, profile }).text.trim();
      putKey(profile, "extra_instructions", [now, change.text.trim()].filter(Boolean).join("\n\n"));
      brain.system_prompt = newReceptionistDefaults(brain.business_name || "").system_prompt;
      break;
    }
    case "set_message":
      brain.fallbacks = {
        ...FALLBACK_DEFAULTS,
        ...(brain.fallbacks ?? {}),
        [change.which]: change.text.trim() || FALLBACK_DEFAULTS[change.which],
      };
      break;
  }
  brain.profile = profile;
  return { ...config, brain };
}

/** How much of the owner's words a card quotes, before it is cut on a whole word. */
const WORDS_SAID_MAX = 160;
const quoted = (text: string) => `“${clipAtWord(text.trim().replace(/\s+/g, " "), WORDS_SAID_MAX)}”`;
const firstLower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** How it answers' line for a card, in the row's own words. */
function describeAnswersChange(change: AskAnswersChange): string {
  switch (change.op) {
    case "set_tone":
      return change.tone.trim() ? `Its voice: ${quoted(change.tone)}` : "Its voice, taken away";
    case "set_languages": {
      const list = languagesOf(change.languages);
      return list.length ? `It speaks ${list.join(", ")}` : "No languages set";
    }
    case "set_phone_greeting":
      return change.greeting.trim()
        ? `Callers hear first: ${quoted(change.greeting)}`
        : "Callers hear the standard greeting";
    case "set_phone_voice": {
      const v = phoneVoiceOf(change.voice);
      return v ? `Callers hear ${v.name} (${v.says}) from their next call` : `Callers hear ${change.voice}`;
    }
    case "set_transfer_number": {
      const n = handoffE164(change.number);
      return n
        ? `Callers who insist on a person reach ${formatPhoneDisplay(n) ?? n}`
        : "Callers who insist on a person leave a message";
    }
    case "add_own_words":
      return `Added to your own words: ${quoted(change.text)}`;
    case "set_message": {
      const name = firstLower(FALLBACK_ROWS.find((r) => r.key === change.which)?.label ?? change.which);
      return change.text.trim() ? `When ${name}: ${quoted(change.text)}` : `When ${name}: the product's wording`;
    }
    case "set_photos":
      return VISION_SWITCH_WORDS.saved(change.on);
  }
}

/** One line for a card: what the change does, in the person's words. */
export function describeSettingsChange(change: AskSettingsChange): string {
  switch (change.op) {
    case "add_closure":
      return change.until
        ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}`
        : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}–${change.close}` : `${change.day}: closed`;
    case "add_note": {
      // Its last day as the closure's line above says a day: the date as typed. Then the text the receptionist will be
      // told, quoted on one line and cut on a whole word, as the closure quotes its note: what is approved is what it
      // reads, an offer's price among it.
      const text = clipAtWord(change.text.replace(/\s+/g, " "), NOTE_TEXT_SAID_MAX);
      return `Note for the receptionist: “${change.title}”${change.until ? `, until ${change.until}` : ""}${text ? ` — “${text}”` : ""}`;
    }
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
    case "set_goal":
      return change.goal.trim() ? `Your goal: “${change.goal.trim()}”` : "Your goal, taken away";
    default:
      return describeAnswersChange(change);
  }
}
