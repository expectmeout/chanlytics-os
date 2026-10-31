/**
 * What the customer message writer is handed and answers (skill.ts): the business as its settings say it, the message
 * Ask's card asked for (its name, kind, language and values, and the versions Ask wrote, its first draft), and the room a
 * text has. One builder for the dashboard's craft call (server/ask/skills/customer-message.ts) and the skill's eval
 * (tooling/scripts/evals/customer-message.mjs), so the eval judges the question production asks.
 */
import { z } from "zod";
import { fenced } from "../../ai/fence";
import type { AppointmentWord } from "../../journey/appointment-word";
import { smsStopLine } from "../../templates/message-versions";
import { PARAM_SOURCE_LABELS, type ParamSourceKind } from "../../templates/templates";

/** The channels a message has versions on, in the order a card quotes them. */
export const CRAFT_CHANNELS = ["whatsapp", "email", "sms"] as const;
export type CraftChannel = (typeof CRAFT_CHANNELS)[number];

/** A message's versions as a card holds them (POST templates/message's body): each optional, at least one. */
export interface CraftVersions {
  whatsapp?: { body: string } | undefined;
  email?: { subject: string; body: string } | undefined;
  sms?: { body: string } | undefined;
}

/** One of a message's values, as the card names it: its number, the name a person sees, and what fills it. */
export interface BriefValue {
  position: number;
  label: string;
  kind: ParamSourceKind;
}

export interface MessageBrief {
  business: {
    name: string;
    /** Its tone line (Settings › How it answers, "How it talks"), or null with none. */
    tone: string | null;
    /** Its services' names, the first dozen. */
    services: readonly string[];
    /** The notes the receptionist is told today, each "title: text": context, never content to add. */
    notes: readonly string[];
    /** What it calls a booking (contracts appointmentWordOf). */
    word: AppointmentWord;
  };
  message: {
    name: string;
    category: "marketing" | "utility";
    language: "en" | "es";
    values: readonly BriefValue[];
    /** A plan's offer message, which every later offer sends with its own words in the typed value. */
    reused: boolean;
    draft: CraftVersions;
    /**
     * What the owner asked, in their own words, where a turn asked it (the turn's question): Ask's draft is its reading of
     * them, and a fact they gave may be said. Absent or null outside a turn.
     */
    asked?: string | null;
  };
}

/** The most of the owner's words a brief carries: a question, never a pasted document. */
const ASKED_CHARS = 1_200;

/** The owner's words as a brief holds them: trimmed, at most ASKED_CHARS; "" where none were given. */
export const ownerWords = (b: MessageBrief): string => (b.message.asked ?? "").trim().slice(0, ASKED_CHARS);

/** The channels the draft has a version on: the ones the writer writes, in the card's order. */
const draftChannels = (b: MessageBrief): CraftChannel[] => CRAFT_CHANNELS.filter((c) => !!b.message.draft[c]);

/**
 * How long a value is when it is filled, for a text's room: a long first name, the business's own name, a link as a
 * booking page writes one, a time as a reminder says it, a typed sentence. What a carrier counts is what is filled in.
 */
function craftValueLength(kind: ParamSourceKind, business: string): number {
  const typical: Record<ParamSourceKind, number> = {
    first_name: 9,
    business_name: business.length,
    booking_link: 30,
    review_link: 34,
    visit_when: 21,
    visit_service: 20,
    proposal_link: 30,
    freed_when: 22,
    text: 40,
  };
  return typical[kind];
}

/** A text's own room: one part's characters less the STOP line the sender adds and the line break before it. */
const CRAFT_PART_CHARS = { plain: 160, unicode: 70, unicodeTwo: 134 } as const;

/**
 * The characters a text version has for its own words, its values filled at a typical length and the STOP line in: one
 * part in plain characters, one in the larger alphabet an accent such as á or an emoji moves it to, and two parts there.
 * Never below zero.
 */
export function textRoom(b: MessageBrief): { plain: number; unicode: number; unicodeTwo: number } {
  const stop = 1 + smsStopLine(b.message.language).length;
  const values = b.message.values.reduce((n, v) => n + craftValueLength(v.kind, b.business.name), 0);
  const left = (part: number) => Math.max(0, part - stop - values);
  return {
    plain: left(CRAFT_PART_CHARS.plain),
    unicode: left(CRAFT_PART_CHARS.unicode),
    unicodeTwo: left(CRAFT_PART_CHARS.unicodeTwo),
  };
}

/** A text filled as a carrier counts it: each value at its typical length, in plain characters, then the STOP line. */
export function textAsSent(body: string, b: MessageBrief): string {
  const filled = body.replace(/\{\{(\d+)\}\}/g, (slot, n: string) => {
    const v = b.message.values.find((x) => x.position === Number(n));
    return "x".repeat(v ? craftValueLength(v.kind, b.business.name) : slot.length);
  });
  return `${filled}\n${smsStopLine(b.message.language)}`;
}

/** The parts a text may take: one in English; in Spanish two, since an accent such as á halves a part. */
export const textPartsAllowed = (language: MessageBrief["message"]["language"]): number => (language === "es" ? 2 : 1);

const CRAFT_LANGUAGE_WORDS: Record<MessageBrief["message"]["language"], string> = { en: "English", es: "Spanish" };

const CRAFT_CATEGORY_WORDS: Record<MessageBrief["message"]["category"], string> = {
  marketing: "marketing: an offer, news or an invitation, sent to people who said yes to offers",
  utility: "utility: about the person's own booking, order or account, promoting nothing",
};

/** A value as the writer is told it: its number, what fills it, and a typed value's own name. */
function craftValueLine(v: BriefValue): string {
  const what =
    v.kind === "text"
      ? `typed for each send, "${v.label}"`
      : PARAM_SOURCE_LABELS[v.kind].replace(/^\w/, (c) => c.toLowerCase());
  return `- {{${v.position}}}: ${what}`;
}

/** The draft's versions, as the writer reads them: each channel's words under its name. */
function craftDraftLines(d: CraftVersions): string {
  return [
    ...(d.whatsapp ? [`WhatsApp:\n${d.whatsapp.body}`] : []),
    ...(d.email ? [`Email subject: ${d.email.subject}\nEmail body:\n${d.email.body}`] : []),
    ...(d.sms ? [`Text:\n${d.sms.body}`] : []),
  ].join("\n\n");
}

/**
 * What the writer is told of the room a text has: one part in plain characters; in Spanish, where an accent such as á is
 * often the right spelling, what it costs, and the two parts it may take then (textPartsAllowed).
 */
function craftRoomLine(b: MessageBrief): string {
  const r = textRoom(b);
  const plain = `The text's room: about ${r.plain} characters besides its values for one part in plain characters`;
  if (b.message.language === "en") return `${plain}, so no curly quotes and no emoji.`;
  const accented =
    r.unicode >= 30
      ? `about ${r.unicode} with an accent such as á or an emoji in it`
      : `with an accent such as á it cannot be one part: keep it to two, about ${r.unicodeTwo}`;
  return `${plain}; ${accented}.`;
}

/**
 * The writer's question: the business (its name, tone, word for a booking, services, and its notes, fenced: context it
 * may not add to the message), the message (its kind, language, values, the opt-out line and a text's room where they
 * apply, and whether later offers reuse it), and the first draft, fenced, since it may quote what someone else wrote.
 */
export function messageBriefText(b: MessageBrief): string {
  const { business: biz, message: m } = b;
  const channels = draftChannels(b);
  const es = m.language === "es";
  const business = [
    `The business: ${biz.name}.`,
    biz.tone ? `Its tone, in its own words: ${biz.tone}` : "It has no tone line.",
    `It calls a booking: ${biz.word}${es ? " (say it in Spanish)" : ""}.`,
    ...(biz.services.length ? [`Its services: ${biz.services.join(", ")}.`] : []),
    ...(biz.notes.length
      ? [
          `Its notes in force, for context only (the message says none of them unless the draft does):\n${fenced("record", biz.notes.map((n) => `- ${n}`).join("\n"))}`,
        ]
      : []),
  ];
  const message = [
    `The message: "${m.name}", ${CRAFT_CATEGORY_WORDS[m.category]}, in ${CRAFT_LANGUAGE_WORDS[m.language]}.`,
    m.values.length ? `Its values:\n${m.values.map(craftValueLine).join("\n")}` : "It has no values.",
    ...(m.reused
      ? [
          "This message is reused for every later offer, each typing its own words into the typed value: write around that value, never about one offer.",
        ]
      : []),
    ...(m.category === "marketing" && m.draft.whatsapp ? [`The opt-out line: ${smsStopLine(m.language)}`] : []),
    ...(m.draft.sms ? [craftRoomLine(b)] : []),
  ];
  const owner = ownerWords(b);
  return [
    business.join("\n"),
    message.join("\n"),
    ...(owner
      ? [
          `What the owner asked Ask, in their own words: "${owner}"\nA fact they give here may be said though the draft left it out, and how they want it to sound is theirs to ask.`,
        ]
      : []),
    `The first draft, written by Ask from what the owner asked:\n${fenced("record", craftDraftLines(m.draft))}`,
    `Write every version the draft has (${channels.join(", ")}), and leave the others empty.`,
  ].join("\n\n");
}

/** The writer's answer, for the API's structured output: every channel, an empty one where the draft has none. */
export const MESSAGE_CRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["whatsapp", "email", "sms", "could_not"],
  properties: {
    whatsapp: {
      type: "object",
      additionalProperties: false,
      required: ["body"],
      properties: { body: { type: "string" } },
    },
    email: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "body"],
      properties: { subject: { type: "string" }, body: { type: "string" } },
    },
    sms: { type: "object", additionalProperties: false, required: ["body"], properties: { body: { type: "string" } } },
    could_not: { type: "string" },
  },
} as const;

export const MessageCraftAnswerSchema = z.object({
  whatsapp: z.object({ body: z.string() }),
  email: z.object({ subject: z.string(), body: z.string() }),
  sms: z.object({ body: z.string() }),
  could_not: z.string(),
});
export type MessageCraftAnswer = z.infer<typeof MessageCraftAnswerSchema>;

/** Words as the card keeps them: line endings as LF, the ends trimmed. */
const craftClean = (s: string): string => s.replace(/\r\n/g, "\n").trim();

/**
 * The versions the writer wrote, for the channels the draft has and no other, each cleaned; and the channels it left
 * empty that the draft has (a version missing is the writer's failure, never a channel dropped).
 */
export function craftedVersions(
  a: MessageCraftAnswer,
  b: MessageBrief,
): { versions: CraftVersions; missing: CraftChannel[]; couldNot: string | null } {
  const versions: CraftVersions = {};
  const missing: CraftChannel[] = [];
  for (const c of draftChannels(b)) {
    if (c === "email") {
      const subject = craftClean(a.email.subject).replace(/\s+/g, " ");
      const body = craftClean(a.email.body);
      if (subject && body) versions.email = { subject, body };
      else missing.push(c);
    } else {
      const body = craftClean(a[c].body);
      if (body) versions[c] = { body };
      else missing.push(c);
    }
  }
  return { versions, missing, couldNot: craftClean(a.could_not) || null };
}
