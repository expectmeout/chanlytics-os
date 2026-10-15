/**
 * How the customer message writer is judged (its eval, tooling/scripts/evals/customer-message.mjs): code first, the same
 * checks a card makes (checks.ts), then a judge model reads the brief and the words against the rubric below, one verdict
 * per criterion with a line why. The hard criteria are what must never fail a customer: WhatsApp would approve it, its
 * kind is right, it says nothing the draft does not hold. The soft ones are the craft: one call to act, the business's
 * voice, its language, each channel's fit. A case passes when every check and every hard criterion passes; the soft ones
 * are reported as a share.
 */
import { z } from "zod";
import { DATA_NOT_INSTRUCTIONS, fenced } from "../../ai/fence";
import { messageBriefText } from "./brief";
import type { CraftVersions, MessageBrief } from "./brief";
import type { CraftIssue } from "./checks";

export interface RubricCriterion {
  id: string;
  hard: boolean;
  ask: string;
}

export const MESSAGE_RUBRIC = [
  {
    id: "approvable",
    hard: true,
    ask: "WhatsApp's reviewers would approve its WhatsApp version as written, in its kind: its point is in its own words, each value has words around it, it is not vague, misleading or pressuring, and it asks for no payment detail. Pass where it has no WhatsApp version.",
  },
  {
    id: "category",
    hard: true,
    ask: "Its kind is right for what it says: utility only about the person's own booking, order or account and promoting nothing at all; marketing for an offer, news or an invitation, its WhatsApp version ending on the opt-out line.",
  },
  {
    id: "facts",
    hard: true,
    ask: "It holds no price, share, discount, free thing, date, deadline, number, promise or claim that the draft does not hold, and leaves out none of the draft's own facts (an offer, its figure, its days, who it is for).",
  },
  {
    id: "one_action",
    hard: false,
    ask: "It asks for one thing, once: one call to act, easy to see.",
  },
  {
    id: "voice",
    hard: false,
    ask: "It reads in the business's voice as its tone line says (warmth, formality, exclamation marks, emoji; warm, brief and plain with no tone line), the way the business writes to someone it knows: never generic, stiff or salesy.",
  },
  {
    id: "language",
    hard: false,
    ask: "It is natural in its language, never a word-for-word translation: Spanish neutral for Latin America and the US, one register (tú or usted) throughout, with ¿ and ¡ where they belong; English plain and idiomatic.",
  },
  {
    id: "channel_fit",
    hard: false,
    ask: "Each version fits its channel: WhatsApp conversational and easy to scan on a phone; an email's subject specific and its body in short paragraphs; a text short, naming the business first.",
  },
] as const satisfies readonly RubricCriterion[];
export type RubricId = (typeof MESSAGE_RUBRIC)[number]["id"];

/** The judge's system prompt: who it is, each criterion with its id, and how to answer. */
export function messageJudgeSystem(): string {
  return [
    "You judge a message a small business will send its own customers, against the brief it was written from. Be strict: a customer reads these words under the business's name, and WhatsApp reviews them before they can be sent.",
    "Give one verdict for each criterion below, by its id: pass or not, and why in one short line. Judge only what the words say, never what the writer might have meant.",
    MESSAGE_RUBRIC.map((c) => `- ${c.id}${c.hard ? " (must pass)" : ""}: ${c.ask}`).join("\n"),
    DATA_NOT_INSTRUCTIONS,
  ].join("\n\n");
}

/** The words being judged, under their channels' names. */
function craftJudgedLines(v: CraftVersions, couldNot: string | null): string {
  return [
    ...(v.whatsapp ? [`WhatsApp:\n${v.whatsapp.body}`] : []),
    ...(v.email ? [`Email subject: ${v.email.subject}\nEmail body:\n${v.email.body}`] : []),
    ...(v.sms ? [`Text (the sender adds its STOP line):\n${v.sms.body}`] : []),
    ...(couldNot ? [`What the writer says it left out: ${couldNot}`] : []),
  ].join("\n\n");
}

/** The judge's question: the brief the writer was handed, then the words to judge, fenced. */
export function messageJudgeQuestion(b: MessageBrief, v: CraftVersions, couldNot: string | null): string {
  return [
    `The brief the message was written from:\n${messageBriefText(b)}`,
    `The message to judge:\n${fenced("record", craftJudgedLines(v, couldNot))}`,
  ].join("\n\n");
}

export const MESSAGE_JUDGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdicts"],
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "pass", "why"],
        properties: {
          id: { type: "string", enum: MESSAGE_RUBRIC.map((c) => c.id) },
          pass: { type: "boolean" },
          why: { type: "string" },
        },
      },
    },
  },
} as const;

export const MessageJudgeAnswerSchema = z.object({
  verdicts: z.array(z.object({ id: z.string(), pass: z.boolean(), why: z.string() })),
});
export type MessageJudgeAnswer = z.infer<typeof MessageJudgeAnswerSchema>;

export interface MessageVerdict {
  pass: boolean;
  /** What failed that must not: each check's code, and each hard criterion with the judge's why. */
  failed: string[];
  /** The soft criteria that passed, of how many. */
  soft: { passed: number; of: number };
  /** Each soft criterion that did not pass, with the judge's why. */
  notes: string[];
}

/**
 * A case's verdict: every code check and every hard criterion must pass. A criterion the judge left out is a failure of
 * the judge's answer, said as one, never a pass.
 */
export function messageVerdict(issues: readonly CraftIssue[], judged: MessageJudgeAnswer): MessageVerdict {
  const failed = issues.map((i) => `${i.channel} ${i.code}: ${i.words}`);
  const notes: string[] = [];
  let passed = 0;
  let of = 0;
  for (const c of MESSAGE_RUBRIC) {
    const v = judged.verdicts.find((x) => x.id === c.id);
    const ok = v?.pass === true;
    const why = v ? v.why : "the judge gave no verdict";
    if (c.hard) {
      if (!ok) failed.push(`${c.id}: ${why}`);
    } else {
      of += 1;
      if (ok) passed += 1;
      else notes.push(`${c.id}: ${why}`);
    }
  }
  return { pass: failed.length === 0, failed, soft: { passed, of }, notes };
}
