/**
 * The owner's receptionist, so far (moved whole from first-run.ts with decision 0073): who it is, whether it answers,
 * the greeting every caller hears and what it knows, beside the first run's step on a desk and under its strip on a
 * phone. Since decision 0073 it has a name of its own where the owner gave one, and the card says it, the voice and the
 * personality it speaks in.
 */
import { formatPhoneDisplay } from "../shared/phone";
import { greetingOf } from "../voice/greeting-owner";
import { initialsOf } from "../conversations/thread-contact";
import { openWeekWords } from "../config/business-tab/open-week";
import { servicesWords, type ServiceWordsInput } from "../config/business-tab/services-words";
import { TONE_PRESETS, personalityOf } from "../config/business-tab/how-it-answers";
import type { Hours } from "../config/workspace-config/business-profile";
import { phoneVoiceShown } from "../voice/phone-voices";
import type { SetupDto, SetupState } from "./setup";

/** What the business goes by here: the receptionist's own name, else the workspace's (typed at sign-up). */
export function businessNameOf(
  receptionistName: string | null | undefined,
  workspaceName: string | null | undefined,
): string | null {
  return (receptionistName ?? "").trim() || (workspaceName ?? "").trim() || null;
}

export interface ReceptionistCardInputs {
  setup: SetupDto;
  answering: boolean;
  /** The receptionist's brain as the settings read has it; null until that read lands. */
  brain: {
    business_name?: string | null;
    booking_link?: string | null;
    profile?: {
      hours?: Partial<Record<string, Hours>> | null;
      services?: readonly ServiceWordsInput[] | null;
      languages?: readonly string[] | null;
      /** The business's own phone greeting (decision 0051); absent for the standard one. */
      phone_greeting?: string | null;
      /** The receptionist's own name (decision 0073); absent for none. */
      assistant_name?: string | null;
      phone_voice?: string | null;
      /** How fast it speaks (decision 0073, R7); absent for the line's own pace. */
      phone_pace?: string | null;
      tone?: string | null;
      /** The booking rules, for walk-ins (decision 0073) beside the rest. */
      booking_rules?: { walk_ins?: string | null } | null;
      /** The business's website, which Where it answers looks for a booking tool on and the first run reads (R10). */
      website?: string | null;
    } | null;
  } | null;
  /** The numbers as the settings read resolved them (facts.ts); null until that read lands. */
  numbers: { voiceLine: string | null; keptLine: string | null; handoff: string | null } | null;
  /** The workspace's own name, for a receptionist with none yet. */
  workspaceName: string | null;
  /** The workspace's clock, which the hours are in. */
  tz: string;
}

export interface ReceptionistCardVM {
  caption: string;
  initials: string;
  name: string;
  /** The receptionist's own name where it has one ("Ava"), else null: the step's words say "your receptionist". */
  assistant: string | null;
  /** Whether it answers, as Setup's own states say it (the page's StatePill tones them): not yet, not tried, answering. */
  status: { state: SetupState; words: string };
  /** The phone's one line for the card: "Your receptionist · Answering". */
  strip: string;
  greetingLabel: string;
  greeting: string;
  /** "Tamsin · Warm · Ava": how it sounds, in one line (the first run's How it sounds, decision 0073). */
  sounds: string;
  rows: Array<{
    key: "open" | "knows" | "books" | "speaks" | "answers" | "through";
    label: string;
    value: string | null;
  }>;
  foot: string;
}

/** A link as a person reads it: no scheme, no "www.", no trailing slash. */
const linkShown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

/**
 * What the card says every caller hears: the business's own greeting where it wrote one, read from the settings once
 * they have arrived and from Setup until then, through the one function the call itself asks (greetingOf), with the
 * receptionist's own name where it has one.
 */
function cardGreeting(
  spoken: string,
  profile: { phone_greeting?: string | null; assistant_name?: string | null } | null,
  setup: Pick<SetupDto, "business">,
): string {
  const stored = profile?.phone_greeting ?? setup.business.phone_greeting ?? null;
  return greetingOf({ name: spoken, stored, paused: false, assistant: profile?.assistant_name ?? null }).text;
}

/** "Tamsin · Warm · Ava": the voice, the personality where the tone is one of them, and the name where it has one. */
export function soundsWords(
  profile: { phone_voice?: string | null; tone?: string | null; assistant_name?: string | null } | null,
): string {
  const voice = phoneVoiceShown(profile?.phone_voice).name;
  const p = personalityOf(profile?.tone);
  const personality = p
    ? (TONE_PRESETS.find((t) => t.key === p)?.label ?? null)
    : profile?.tone
      ? "Your own words"
      : null;
  const name = (profile?.assistant_name ?? "").trim() || null;
  return [voice, personality, name].filter(Boolean).join(" · ");
}

/** Whether it answers, and whether anyone has tried it yet. */
function cardStatusOf(i: ReceptionistCardInputs): ReceptionistCardVM["status"] {
  if (!i.answering) return { state: "not_started", words: "Not answering yet" };
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  return tried ? { state: "ready", words: "Answering" } : { state: "waiting_you", words: "Answering · not tried yet" };
}

/** A number as the card shows it. */
const shownNumber = (n: string | null) => (n ? (formatPhoneDisplay(n) ?? n) : null);

/**
 * The card's rows: when it is open, what it knows, how it books, what it speaks, the line it answers, and who it puts
 * through to.
 */
function cardRowsOf(i: ReceptionistCardInputs): ReceptionistCardVM["rows"] {
  const b = i.brain;
  const p = b?.profile ?? null;
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = shownNumber;
  // With no link, whether the business books or quotes, its receptionist takes their details (decision 2; 0008, amended
  // 18 Oct 2026).
  const takesDetails = !!b && !b.booking_link;
  return [
    { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
    {
      key: "knows",
      label: "Knows",
      value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null,
    },
    takesDetails
      ? { key: "books", label: "To book", value: "Takes their details" }
      : { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
    { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
    // The line it answers, and the number set to forward to it, as recorded: no claim about when a call forwards.
    {
      key: "answers",
      label: "Answers",
      value: line ? (kept ? `${show(line)}, and calls forwarded from ${show(kept)}` : show(line)) : null,
    },
    { key: "through", label: "Puts through to", value: show(through) },
  ];
}

/** The owner's receptionist, so far: who it is, whether it answers, what it greets with and what it knows. */
export function receptionistCardOf(i: ReceptionistCardInputs): ReceptionistCardVM {
  const b = i.brain;
  const p = b?.profile ?? null;
  // The name the phone greets with is the receptionist's own (voice call-start reads the brain), never the
  // workspace's: the card's title may borrow the workspace's until there is one, the greeting may not.
  const spoken = (b?.business_name || i.setup.business.name || "").trim();
  const name = businessNameOf(spoken, i.workspaceName) ?? "";
  const assistant = (p?.assistant_name ?? "").trim() || null;
  const status = cardStatusOf(i);
  return {
    caption: "Your receptionist, so far",
    initials: assistant ? initialsOf(assistant) : name ? initialsOf(name) : "",
    name: name || "Your receptionist",
    assistant,
    status,
    strip: `${assistant ?? "Your receptionist"} · ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: cardGreeting(spoken, p, i.setup),
    sounds: soundsWords(p),
    rows: cardRowsOf(i),
    foot: "Fills in as you go. You can change any of it later in Settings.",
  };
}
