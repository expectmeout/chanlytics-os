import "server-only";
import { z } from "zod";
import {
  ASK_ANSWERS_ROWS,
  ASK_GOAL_MAX,
  ASK_STYLE_MAX,
  AskSettingsChangeSchema,
  FALLBACK_ROWS,
  PHONE_VOICES,
  answerStyleOf,
  describeSettingsChange,
  proposalBelowNeeds,
  type AskSettingsChange,
} from "@chanlytics/contracts";
import {
  actAction,
  approvalWords,
  defineActions,
  offeredTo,
  propose,
  refuse,
  type ActDef,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { autonomyAction } from "./policy";
import { load } from "../../../readers";
import { memberViews } from "../../../readers/notifications";

/** Each change's card title, in the person's words. */
const SETTINGS_TITLE: Record<AskSettingsChange["op"], string> = {
  add_closure: "Close for a day",
  set_hours: "Change the hours",
  add_note: "Remember this",
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
const voiceIdOf = (said: string): string =>
  PHONE_VOICES.find((v) => v.id === said || v.name.toLowerCase() === said.trim().toLowerCase())?.id ?? said;

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
    case "set_phone_greeting":
      return { op: raw.op, greeting: said("greeting") };
    case "set_phone_voice":
      return { op: raw.op, voice: voiceIdOf(said("voice")) };
    case "set_transfer_number":
      return { op: raw.op, number: said("number") };
    case "set_message":
      return { op: raw.op, which: raw.which, text: said("text") };
    case "set_photos":
      return { op: raw.op, on: raw.on };
    default:
      return { op: raw.op, text: said("text") };
  }
}

async function proposeSettings(t: ToolContext, input: { change: Record<string, unknown> }): Promise<ProposalOutcome> {
  // Below the card's role, by the one predicate the registry offers it by (context.ts offeredTo).
  if (!offeredTo(settingsAct, t.role)) return refuse(proposalBelowNeeds("settings"));
  const raw = input.change && typeof input.change === "object" ? (input.change as Record<string, unknown>) : null;
  if (!raw) return refuse("change is required");
  const answers = typeof raw.op === "string" && raw.op in ASK_ANSWERS_ROWS;
  const parsed = AskSettingsChangeSchema.safeParse(answers ? answersChangeOf(raw) : knowsChangeOf(raw));
  if (!parsed.success)
    return refuse(`change rejected: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  const change = parsed.data;
  return propose({
    kind: "settings",
    title: SETTINGS_TITLE[change.op],
    summary: describeSettingsChange(change),
    payload: { change },
  });
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
] as const satisfies readonly (keyof typeof ASK_ANSWERS_ROWS)[];

/** The voices a line may speak in, as the model is told them: a name and what the provider says of it. */
const VOICES_SAID = PHONE_VOICES.map((v) => `${v.name} (${v.says})`).join(", ");
/** The three messages, by the key the model sends and when each goes out. */
const MESSAGES_SAID = FALLBACK_ROWS.map((r) => `${r.key} (${r.label.toLowerCase()})`).join(", ");

/**
 * A row of How it answers as a card (the Settings wiring review, item 14, 18 Oct 2026): every row the page has, through
 * the one handler and the one card, judged by the same schema op by op.
 */
const answersAction = actAction({
  kind: "settings",
  input: z.object({
    row: z.object({
      op: z.enum(ANSWERS_OPS),
      tone: z.string().optional(),
      languages: z.array(z.string()).optional(),
      greeting: z.string().optional(),
      voice: z.string().optional(),
      number: z.string().optional(),
      text: z.string().optional(),
      which: z.enum(["error", "non_text", "greeting"]).optional(),
      on: z.boolean().optional(),
    }),
  }),
  examples: [
    { row: { op: "set_languages", languages: ["English", "Spanish"] } },
    { row: { op: "set_phone_voice", voice: "Claudia" } },
    { row: { op: "set_transfer_number", number: "+1 212 555 0143" } },
  ],
  label: "Preparing a change to how it answers",
  words: `Action answers takes one row object, a row of How it answers and what it becomes: set_tone (tone, how it sounds in a line; empty takes it away), set_languages (languages, the whole list it speaks, which replaces the one it has; empty for none), set_phone_greeting (greeting, the line callers hear first, {business} for the name; empty for the standard one; a line that never says it is automated has the product's clause added when spoken), set_phone_voice (voice, one of ${VOICES_SAID}), set_transfer_number (number, with its country code like +1 212 555 0143, a line a person answers; empty and it takes a message instead), add_own_words (text, added after the owner's own words, which it reads on every reply), set_message (which, one of ${MESSAGES_SAID}, and text, with {business}, {booking link} and {phone} filled as it goes out; empty for the product's wording), set_photos (on, whether it looks at the photos customers send on WhatsApp). Read workspace.settings first for what each row holds now: a list replaces, so keep the languages they did not ask to drop. Call it when they want it to sound, speak, greet, put callers through or answer differently. ${approvalWords("settings")}.`,
  build: (t, input) => proposeSettings(t, { change: input.row }),
});

/** The owner's goal for Ask (the operator, 15 Oct 2026, D13): one line Ask weighs every plan against, or cleared. */
const goalAction = actAction({
  kind: "settings",
  input: z.object({
    goal: z
      .string()
      .describe(
        `The goal in the owner's own words, at most ${ASK_GOAL_MAX} characters, such as "twenty new clients a month"; empty clears it.`,
      ),
  }),
  examples: [{ goal: "Twenty new clients a month" }],
  label: "Preparing your goal",
  words: `Action goal keeps the owner's goal in one line (at most ${ASK_GOAL_MAX} characters), which you read on every question and weigh every suggestion and plan against; empty clears it. Call it when they say what they want the business to reach, or ask you to aim for something. The receptionist never reads it. ${approvalWords("settings")}.`,
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
    words: z
      .string()
      .describe(
        `The note in their own terms, at most ${ASK_STYLE_MAX} characters, such as "Short answers, the numbers in bold, in Spanish"; empty clears it.`,
      ),
  }),
  examples: [{ words: "Short answers, the key numbers in bold" }],
  label: "Keeping how you like answers",
  words: `Action answer_style keeps how this person likes your answers (length, format, language) as their own note, which comes with each of their questions from then on; empty clears it, and it replaces the one they keep. Call it when they want answers a way beyond this conversation ("always bullets", "every time in Spanish", "next time, shorter"); a shape asked for within one conversation is kept there without it. Theirs alone, never a teammate's, and they see and change it in Settings › Profile.`,
  build: async (t, input) => {
    const words = input.words.trim().slice(0, ASK_STYLE_MAX);
    const previous = t.ctx.userId ? answerStyleOf((await load(t.rc, memberViews, undefined)).data) : "";
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
 * definition), how it answers (answers, a row each of the page's, item 14), what it may do alone for a class of message
 * (autonomy, once propose_autonomy) and the owner's goal for Ask (goal).
 */
export const propose_settings = defineActions({
  name: "propose_settings",
  description:
    "Propose a settings change as a card the person approves, by action: what the receptionist knows (closed days, hours, a note, a service), how it answers (its voice, languages, what callers hear and who they reach, your own words, the messages when it can't answer, photos), what it may do alone for a class of message (autonomy), or the business's goal for you.",
  actions: {
    change: actAction({
      ...settingsAct,
      words: `Action change takes one change object: add_closure (date, an optional until for a range, and an optional note), set_hours (one weekday's day with open and close, or both empty for closed), add_note (a title, the text the receptionist reads, and an optional until, its last day), or add_service (name, and an optional duration_min in minutes). Dates are YYYY-MM-DD, days mon..sun, times HH:MM. Call it when they say they are closed, their hours change, the receptionist should know something, or they offer a new service. ${approvalWords("settings")}.`,
    }),
    answers: answersAction,
    autonomy: autonomyAction,
    goal: goalAction,
    answer_style: answerStyleAction,
  },
});
