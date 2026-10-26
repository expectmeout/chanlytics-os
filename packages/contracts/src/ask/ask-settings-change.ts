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
import { PHONE_PACE_WORDS, type PhonePace } from "../voice/phone-pace";
import { WALK_IN_WORDS, type WalkInsChoice } from "../config/business-tab/choices";

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
  | { op: "add_service"; name: string; duration_min?: number; price_note?: string }
  | { op: "set_goal"; goal: string }
  /** The booking link {{booking link}} fills (a sequence to leads' step sheet puts it in where it is not set). */
  | { op: "set_booking_link"; link: string }
  | AskFixChange
  | AskAnswersChange;

/**
 * The changes a rehearsal's fix makes beside the cards' (decision 0069, R4: rehearsal/fix-router.ts): a service already
 * listed given its minutes or its price, a reason a customer must reach a person, and one of the owner's switches.
 */
export type AskFixChange =
  | { op: "set_service"; name: string; duration_min?: number; price_note?: string }
  | { op: "add_escalate_when"; reason: string }
  | { op: "set_guardrail"; rule: GuardrailRule; on: boolean };

/** The owner's switches a fix may flip (business-profile.ts GuardrailsSchema): `disclose_ai` is never the owner's to flip. */
export const GUARDRAIL_RULES = ["never_quote_prices", "never_confirm_booking", "no_health_advice"] as const;
export type GuardrailRule = (typeof GUARDRAIL_RULES)[number];

/** Each switch as the owner reads it: what it does when on. */
export const GUARDRAIL_RULE_WORDS: Record<GuardrailRule, { on: string; off: string }> = {
  never_quote_prices: { on: "It never says a price", off: "It says the prices on your list" },
  never_confirm_booking: { on: "It never confirms a booking itself", off: "It may confirm a booking itself" },
  no_health_advice: { on: "It gives no health advice", off: "It may answer health questions" },
};

/** Which of the three messages sent in the business's name a change rewrites. */
export type AskMessageKey = (typeof FALLBACK_ROWS)[number]["key"];

/**
 * A change to a row of How it answers, as its fold saves it: its voice (tone), the languages, what callers hear first,
 * the voice they hear it in, the transfer number, words added to the owner's own, one of the three messages, and the
 * photo switch; and the first run's three (decision 0073, R7): its name, how fast it speaks on calls, and walk-ins. An
 * empty value is the row emptied: no voice, the standard greeting, a message instead of a transfer, the product's
 * wording, no name; natural is the line's own pace, and "unset" says nothing of walk-ins.
 */
export type AskAnswersChange =
  | { op: "set_tone"; tone: string }
  | { op: "set_languages"; languages: string[] }
  | { op: "set_phone_greeting"; greeting: string }
  | { op: "set_phone_voice"; voice: string }
  | { op: "set_transfer_number"; number: string }
  | { op: "add_own_words"; text: string }
  | { op: "set_message"; which: AskMessageKey; text: string }
  | { op: "set_photos"; on: boolean }
  | { op: "set_assistant_name"; name: string }
  | { op: "set_phone_pace"; pace: PhonePace }
  | { op: "set_walk_ins"; walk_ins: WalkInsChoice };

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
  set_assistant_name: "assistant_name",
  set_phone_pace: "phone_pace",
  set_walk_ins: "walk_ins",
};

/** The page a row of How it answers is on when it is not How it answers itself: walk-ins is Hours & booking's. */
export const ASK_ANSWERS_PANE: Readonly<Partial<Record<AskAnswersChange["op"], string>>> = { set_walk_ins: "hours" };

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
  // The booking link is the business's own (brain.booking_link), beside its profile: set, or taken away when empty.
  if (change.op === "set_booking_link") {
    const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]> & Record<string, unknown>;
    const link = change.link.trim();
    if (link) brain.booking_link = link;
    else delete brain.booking_link;
    return { ...config, brain };
  }
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]>;
  const profile = { ...((brain.profile ?? {}) as Record<string, unknown>) };
  if (isFixChange(change)) {
    brain.profile = profileWithFix(profile, change);
    return { ...config, brain };
  }
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
      services.push({
        name: change.name,
        ...(change.duration_min ? { duration_min: change.duration_min } : {}),
        ...(change.price_note ? { price_note: change.price_note } : {}),
      });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}

/** A stored object as its keys, and anything else as none. */
const storedKeysOf = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
/** A stored value's words when it is a string, and none otherwise. */
const storedWordsOf = (v: unknown): string => (typeof v === "string" ? v : "");

/** A rehearsal's fix (AskFixChange, decision 0069), told apart from the cards' changes by its op. */
function isFixChange(change: AskSettingsChange): change is AskFixChange {
  return change.op === "set_service" || change.op === "add_escalate_when" || change.op === "set_guardrail";
}

/** A fix on the profile: a listed service's minutes or price, a reason a customer must reach a person, a switch. */
function profileWithFix(profile: Record<string, unknown>, change: AskFixChange): Record<string, unknown> {
  switch (change.op) {
    case "set_service":
      return { ...profile, services: servicesWith(profile.services, change) };
    case "add_escalate_when": {
      const reasons = [...((profile.escalate_when as string[] | undefined) ?? [])];
      const reason = change.reason.trim();
      if (reason && !reasons.some((r) => r.trim().toLowerCase() === reason.toLowerCase())) reasons.push(reason);
      return { ...profile, escalate_when: reasons };
    }
    case "set_guardrail":
      return { ...profile, guardrails: { ...storedKeysOf(profile.guardrails), [change.rule]: change.on } };
  }
}

/**
 * The services with one already listed given its minutes or its price: found by its name as the owner reads it (case
 * and spacing aside); a name not listed is added, as add_service would.
 */
function servicesWith(list: unknown, change: Extract<AskFixChange, { op: "set_service" }>): unknown[] {
  const services = [...((list as unknown[] | undefined) ?? [])];
  const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const at = services.findIndex(
    (s) => !!s && typeof s === "object" && key(storedWordsOf((s as { name?: unknown }).name)) === key(change.name),
  );
  const fields = {
    ...(change.duration_min ? { duration_min: change.duration_min } : {}),
    ...(change.price_note ? { price_note: change.price_note } : {}),
  };
  if (at < 0) services.push({ name: change.name, ...fields });
  else services[at] = { ...(services[at] as Record<string, unknown>), ...fields };
  return services;
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
  "set_assistant_name",
  "set_phone_pace",
  "set_walk_ins",
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
    case "set_assistant_name":
      putKey(profile, "assistant_name", change.name.replace(/\s+/g, " ").trim() || undefined);
      break;
    // Natural is no key: the line keeps its own pace (phone-pace.ts), as Settings' row stores it.
    case "set_phone_pace":
      putKey(profile, "phone_pace", change.pace === "natural" ? undefined : change.pace);
      break;
    // One key of the booking rules, the rest kept; "unset" takes it away (choices.ts WALK_INS_CHOICES).
    case "set_walk_ins": {
      const rules = { ...storedKeysOf(profile.booking_rules) };
      putKey(rules, "walk_ins", change.walk_ins === "unset" ? undefined : change.walk_ins);
      putKey(profile, "booking_rules", Object.keys(rules).length ? rules : undefined);
      break;
    }
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
    case "set_assistant_name": {
      const name = change.name.replace(/\s+/g, " ").trim();
      return name ? `It introduces itself as ${name}` : "It has no name: it says it's the automated assistant";
    }
    case "set_phone_pace":
      return PHONE_PACE_WORDS.saved(change.pace).replace(/\.$/, "");
    case "set_walk_ins":
      return WALK_IN_WORDS.saved(change.walk_ins).replace(/\.$/, "");
  }
}

/** A service's minutes and price, as its line says them after its name: " · $180 · about 3 h". */
export function serviceTail(s: { duration_min?: number; price_note?: string }): string {
  const minutes = s.duration_min
    ? s.duration_min >= 60 && s.duration_min % 30 === 0
      ? `about ${s.duration_min / 60} h`
      : `${s.duration_min} min`
    : null;
  return [s.price_note?.trim() || null, minutes]
    .filter(Boolean)
    .map((p) => ` · ${p}`)
    .join("");
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
      return `New service: ${change.name}${serviceTail(change)}`;
    case "set_service":
      return `${change.name}${serviceTail(change) || ", as it is"}`;
    case "add_escalate_when":
      return `Put through to you: ${quoted(change.reason)}`;
    case "set_guardrail":
      return GUARDRAIL_RULE_WORDS[change.rule][change.on ? "on" : "off"];
    case "set_goal":
      return change.goal.trim() ? `Your goal: “${change.goal.trim()}”` : "Your goal, taken away";
    case "set_booking_link":
      return change.link.trim() ? `Your booking link: ${change.link.trim()}` : "Your booking link, taken away";
    default:
      return describeAnswersChange(change);
  }
}
