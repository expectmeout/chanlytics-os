import "server-only";
import { z } from "zod";
import {
  ASK_ANSWERS_ROWS,
  type ASK_REACH_OUT_ROWS,
  isReachOutChange,
  REPLY_OFFERS,
  ASK_GOAL_MAX,
  ASK_STYLE_MAX,
  AskSettingsChangeSchema,
  FALLBACK_ROWS,
  GREETING_TEMPLATE,
  PHONE_PACES,
  PHONE_VOICES,
  WALK_INS_CHOICES,
  answerStyleOf,
  describeSettingsChange,
  proposalBelowNeeds,
  recordOrEmpty,
} from "@chanlytics/contracts";
import {
  actAction,
  defineActions,
  offeredTo,
  type ActDef,
  type ProposalOutcome,
  type ToolContext,
} from "../context/tool-defs";
import { approvalWords, propose, refuse } from "../context/context";
import { autonomyAction } from "./policy";
import { load } from "../../../shared/reader";
import { memberViews } from "../../../readers/notifications";

/**
 * Each change's card title, in the person's words: every change the card's schema carries. A rehearsal's fix
 * (AskFixChange, decision 0069) is kept from its review, never proposed here, so it has no card and no title. A note's
 * is its own name (noteCardTitle).
 */
const SETTINGS_TITLE: Record<Exclude<z.infer<typeof AskSettingsChangeSchema>["op"], "add_note">, string> = {
  add_closure: "Close for a day",
  set_hours: "Change the hours",
  add_service: "Add a service",
  set_goal: "Your goal",
  set_tone: "Its voice",
  set_languages: "The languages it speaks",
  set_phone_greeting: "What callers hear first",
  set_phone_voice: "The voice callers hear",
  set_transfer_number: "Who callers reach",
  add_own_words: "In your own words",
  set_message: "When it can't answer",
  set_photos: "Photos",
  set_booking_link: "Your booking link",
  set_assistant_name: "Its name",
  set_phone_pace: "How fast it speaks",
  set_walk_ins: "Walk-ins",
  set_offer: "What you offer",
  set_who_for: "Who it's for",
  set_fixes: "What you fix for them",
  add_claim: "A claim you stand behind",
  remove_claim: "A claim taken away",
  set_cold_tone: "How cold emails sound",
  set_signed_by: "Who cold emails sign as",
  set_signature: "Your signature",
  set_reply_offer: "What an answer to a lead offers",
};

/** What the model sent for what the receptionist knows, its fields copied as each op takes them. */
function knowsChangeOf(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { op: raw.op };
  for (const k of ["date", "until", "note", "day", "open", "close", "title", "text", "name"])
    if (typeof raw[k] === "string" && raw[k]) clean[k] = raw[k];
  // A goal may be empty: that clears it.
  if (raw.op === "set_goal") clean.goal = typeof raw.goal === "string" ? raw.goal : "";
  if (typeof raw.duration_min === "number") clean.duration_min = raw.duration_min;
  if (raw.op === "set_hours") {
    clean.open = typeof raw.open === "string" && raw.open ? raw.open : null;
    clean.close = typeof raw.close === "string" && raw.close ? raw.close : null;
  }
  return clean;
}

/** A voice as the model names it, by its id or its name ("Claudia"), as the list's id; another word as it came. */
const voiceIdOf = (sentence: string): string =>
  PHONE_VOICES.find((v) => v.id === sentence || v.name.toLowerCase() === sentence.trim().toLowerCase())?.id ?? sentence;

/**
 * What the model sent for a row of How it answers: the one field its op takes, an empty word kept, since it empties the
 * row (no voice, the standard greeting, a message instead of a transfer, the product's wording).
 */
function answersChangeOf(raw: Record<string, unknown>): Record<string, unknown> {
  const said = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : "";
  };
  switch (raw.op) {
    case "set_tone":
      return { op: raw.op, tone: said("tone") };
    case "set_languages":
      return {
        op: raw.op,
        languages: Array.isArray(raw.languages) ? raw.languages.filter((l) => typeof l === "string") : [],
      };
    case "set_phone_greeting": {
      // The standard line typed out is the standard line, stored as none, as the row's own save stores it.
      const line = said("greeting").trim();
      return { op: raw.op, greeting: line === GREETING_TEMPLATE ? "" : line };
    }
    case "set_phone_voice":
      return { op: raw.op, voice: voiceIdOf(said("voice")) };
    case "set_transfer_number":
      return { op: raw.op, number: said("number") };
    case "set_message":
      return { op: raw.op, which: raw.which, text: said("text") };
    case "set_photos":
      return { op: raw.op, on: raw.on };
    case "set_assistant_name":
      return { op: raw.op, name: said("name") };
    case "set_phone_pace":
      return { op: raw.op, pace: said("pace") };
    case "set_walk_ins":
      return { op: raw.op, walk_ins: said("walk_ins") };
    default:
      return { op: raw.op, text: said("text") };
  }
}

/**
 * A note's card says which note, as Ask calls it ("Parking note"): "Remember this" read as Ask's own memory, whose card
 * asks the same, and an answer told to name a card by its title had no title to name it by (the weekly run, 2 November 2026).
 */
const noteCardTitle = (title: string): string =>
  /\bnote$/i.test(title.trim()) ? title.trim() : `${title.trim()} note`;

function proposeSettings(
  toolContext: ToolContext,
  input: { change: Record<string, unknown> },
): Promise<ProposalOutcome> {
  // Below the card's role, by the one predicate the registry offers it by (context.ts offeredTo).
  if (!offeredTo(settingsAct, toolContext.role)) return Promise.resolve(refuse(proposalBelowNeeds("settings")));
  const raw = input.change && typeof input.change === "object" ? recordOrEmpty(input.change) : null;
  if (!raw) return Promise.resolve(refuse("change is required"));
  const answers = typeof raw.op === "string" && raw.op in ASK_ANSWERS_ROWS;
  // A row of How it reaches out (decision 0113) carries each op's own field, judged by the schema as it was sent.
  const parsed = AskSettingsChangeSchema.safeParse(
    typeof raw.op === "string" && isReachOutChange({ op: raw.op })
      ? raw
      : answers
        ? answersChangeOf(raw)
        : knowsChangeOf(raw),
  );
  if (!parsed.success)
    return Promise.resolve(
      refuse(`change rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`),
    );
  const change = parsed.data;
  return Promise.resolve(
    propose({
      kind: "settings",
      title: change.op === "add_note" ? noteCardTitle(change.title) : SETTINGS_TITLE[change.op],
      summary: describeSettingsChange(change),
      payload: { change },
    }),
  );
}

/**
 * The flat shape the model is shown, as before: every field of every op, the op required (`until` is a closure's last
 * day and a note's alike). The change itself is judged by AskSettingsChangeSchema (contracts) in the handler, op by op,
 * whose words the refusal carries.
 */
const SETTINGS_INPUT = z.object({
  change: z.object({
    op: z.enum(["add_closure", "set_hours", "add_note", "add_service"]),
    date: z.string().optional(),
    until: z.string().optional(),
    note: z.string().optional(),
    day: z.string().optional(),
    open: z.string().optional(),
    close: z.string().optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    name: z.string().optional(),
    duration_min: z.number().int().optional(),
  }),
});

/**
 * A settings change as a card, propose_settings' one definition: also a plan's note for the receptionist (act/plan.ts),
 * built by this same handler.
 */
export const settingsAct: ActDef<typeof SETTINGS_INPUT> = {
  kind: "settings",
  input: SETTINGS_INPUT,
  examples: [
    { change: { op: "add_closure", date: "2026-12-24", until: "2026-12-26", note: "Holidays" } },
    { change: { op: "set_hours", day: "sat", open: "10:00", close: "14:00" } },
    { change: { op: "add_service", name: "Deep clean", duration_min: 90 } },
  ],
  label: "Preparing a settings change",
  build: proposeSettings,
};

/** The ops of How it answers, as the model is shown them. */
const ANSWERS_OPS = [
  "set_tone",
  "set_languages",
  "set_phone_greeting",
  "set_phone_voice",
  "set_transfer_number",
  "add_own_words",
  "set_message",
  "set_photos",
  "set_assistant_name",
  "set_phone_pace",
  "set_walk_ins",
] as const satisfies readonly (keyof typeof ASK_ANSWERS_ROWS)[];

/**
 * The ops of How it reaches out (decision 0113), in the same row: each takes its own field, the one its branch of
 * AskSettingsChangeSchema names (offer, who_for, fixes, claim, tone, name, signature), said in one sentence of the
 * answers action's words.
 */
const REACH_OUT_OPS = [
  "set_offer",
  "set_who_for",
  "set_fixes",
  "add_claim",
  "remove_claim",
  "set_cold_tone",
  "set_signed_by",
  "set_signature",
  "set_reply_offer",
] as const satisfies readonly (keyof typeof ASK_REACH_OUT_ROWS)[];

/** The voices a line may speak in, as the model is told them: a name and what the provider says of it. */
const VOICES_SAID = PHONE_VOICES.map((v) => `${v.name} (${v.says})`).join(", ");
/** The three messages, by the key the model sends and when each goes out. */
const MESSAGES_SAID = FALLBACK_ROWS.map((r) => `${r.key} (${r.label.toLowerCase()})`).join(", ");
/** What an answer to a lead may offer, by the key the model sends (How it reaches out, decision 0113). */
const REPLY_OFFERS_SAID = REPLY_OFFERS.join(", ");

/**
 * A row of How it answers as a card (the Settings wiring review, item 14, 18 Oct 2026): every row the page has, through
 * the one handler and the one card, judged by the same schema op by op; and a row of How it reaches out the same way
 * (decision 0113), each op's own field.
 */
const answersAction = actAction({
  kind: "settings",
  input: z.object({
    row: z.object({
      op: z.enum([...ANSWERS_OPS, ...REACH_OUT_OPS]),
      tone: z.string().optional(),
      languages: z.array(z.string()).optional(),
      greeting: z.string().optional(),
      voice: z.string().optional(),
      number: z.string().optional(),
      text: z.string().optional(),
      which: z.enum(["error", "non_text", "greeting"]).optional(),
      on: z.boolean().optional(),
      name: z.string().optional(),
      pace: z.enum(PHONE_PACES).optional(),
      walk_ins: z.enum(WALK_INS_CHOICES).optional(),
      offer: z.string().optional(),
      who_for: z.string().optional(),
      fixes: z.string().optional(),
      claim: z.string().optional(),
      signature: z.string().optional(),
    }),
  }),
  examples: [
    { row: { op: "set_languages", languages: ["English", "Spanish"] } },
    { row: { op: "add_claim", claim: "Every cleaner is insured." } },
  ],
  label: "Preparing a change to how it answers",
  words: `Action answers takes one row object, a row of How it answers and what it becomes: set_tone (tone, how it sounds in a line; empty takes it away), set_languages (languages, the whole list it speaks, replacing the one it has; empty for none), set_phone_greeting (greeting, what callers hear first, {business} for the name; empty for the standard line; one that never says it is automated gets the product's clause when spoken), set_phone_voice (voice, one of ${VOICES_SAID}), set_transfer_number (number, with country code like +1 212 555 0143, a line a person answers; empty takes a message instead), add_own_words (text, added after the owner's own words, which it reads on every reply), set_message (which, one of ${MESSAGES_SAID}, and text, with {business}, {booking link} and {phone} filled as it goes out; empty for the product's wording), set_photos (on, whether it looks at the photos customers send on WhatsApp), set_assistant_name (name, what it introduces itself as, at most 40 characters, beside "the automated assistant", which always stays; empty for none), set_phone_pace (pace on calls, slower to faster), set_walk_ins (walk_ins: yes, no, room when there's room, or unset to say nothing of them). A row of How it reaches out, its cold emails, takes its own field: set_offer (offer), set_who_for (who_for), set_fixes (fixes), add_claim or remove_claim (claim, a true sentence word for word: a number comes only from one), set_cold_tone (tone), set_signed_by (name), set_signature (signature, no link), set_reply_offer (offer, one of ${REPLY_OFFERS_SAID}: what an answer to a lead offers); empty takes a row away. Read workspace.settings first for what each row holds: a list replaces, so keep the languages they did not ask to drop. Call it when they want it to sound, speak, greet, put callers through or answer differently, be called something, speak faster or slower, take walk-ins or not, or change how cold emails read. ${approvalWords("settings")}.`,
  build: (t, input) => proposeSettings(t, { change: input.row }),
});

/** The owner's goal for Ask (the operator, 15 Oct 2026, D13): one line Ask weighs every plan against, or cleared. */
const goalAction = actAction({
  kind: "settings",
  input: z.object({
    goal: z
      .string()
      .describe(`The goal in the owner's own words, such as "twenty new clients a month"; empty clears it.`),
  }),
  examples: [{ goal: "Twenty new clients a month" }],
  label: "Preparing your goal",
  words: `Action goal keeps the owner's goal in one line (at most ${ASK_GOAL_MAX} characters), which you read on every question and weigh every suggestion and plan against; empty clears it. Call it when they say what they want the business to reach, or ask you to aim for something; the receptionist never reads it. ${approvalWords("settings")}.`,
  build: (t, input) => proposeSettings(t, { change: { op: "set_goal", goal: input.goal } }),
});

/**
 * How this member likes your answers, kept as their own note (the answer canvas, D, 16 Oct 2026): their length, format
 * and language, which comes with each of their questions. Theirs alone, in their views (contracts ASK_STYLE_PAGE): the
 * card writes the whole note, and its undo the one it replaced, read here as it stands.
 */
const answerStyleAction = actAction({
  kind: "answer_style",
  input: z.object({
    words: z.string().describe(`The note in their own terms, at most ${ASK_STYLE_MAX} characters; empty clears it.`),
  }),
  examples: [{ words: "Short answers, the key numbers in bold" }],
  label: "Keeping how you like answers",
  words: `Action answer_style keeps how this person likes your answers (length, format, language) as their own note, which comes with each of their questions from then on; it replaces the one they keep, and empty clears it. Call it when they want answers a way beyond this conversation ("always bullets", "every time in Spanish"); a shape asked for within one conversation is kept there without it. Theirs alone, never a teammate's; they see and change it in Settings › Profile.`,
  build: async (context, input) => {
    const words = input.words.trim().slice(0, ASK_STYLE_MAX);
    const previous = context.ctx.userId ? answerStyleOf((await load(context.rc, memberViews, undefined)).data) : "";
    if (words === previous) return refuse(words ? "that is already their note" : "they keep no note to clear");
    return propose({
      kind: "answer_style",
      title: "How you like answers",
      summary: words ? `Kept for your answers from now on: ${words}` : "Your note cleared: answers as Ask writes them",
      payload: { words, previous },
    });
  },
});

/**
 * What the workspace is set to (D11, the operator, 15 Oct 2026): a change the receptionist follows (change, once the one
 * definition), how it answers and how it reaches out (answers, a row each of the pages', item 14 and decision 0113), what
 * it may do alone for a class of message
 * (autonomy, once propose_autonomy) and the owner's goal for Ask (goal).
 */
export const propose_settings = defineActions({
  name: "propose_settings",
  description:
    "Propose a settings change as a card the person approves, by action: what the receptionist knows (closed days, hours, a note, a service), how it answers (voice, name, languages, what callers hear, its pace and who they reach, walk-ins, your own words, the messages when it can't answer, photos), how it reaches out (its cold emails), what it may do alone for a class of message (autonomy), or the business's goal for you.",
  actions: {
    change: actAction({
      ...settingsAct,
      words: `Action change takes one change object: add_closure (date, an optional until for a range, an optional note), set_hours (one weekday's day with open and close, or both empty for closed), add_note (title, the text the receptionist reads, an optional until, its last day) or add_service (name, an optional duration_min in minutes). Dates are YYYY-MM-DD, days mon..sun, times HH:MM. Call it when they say they are closed, their hours change, the receptionist should know something, or they offer a new service. ${approvalWords("settings")}.`,
    }),
    answers: answersAction,
    autonomy: autonomyAction,
    goal: goalAction,
    answer_style: answerStyleAction,
  },
});
