/**
 * How the ad writer is judged (its eval, tooling/scripts/evals/ad.mjs; the Ads plan's 6.7): code first, the same checks
 * a draft makes (checks.ts), then a judge model reads the brief and the words against the rubric below (judge.ts). The
 * hard criteria are what must never fail an owner: Meta would approve the ad, it holds nothing the brief does not, and
 * it never speaks about the person reading. The soft ones are the craft: one thing to do, the business's voice, each
 * version its own angle, the language.
 */
import { DATA_NOT_INSTRUCTIONS, fenced } from "../../../ai/fence";
import { JUDGE_HOW, JudgeAnswerSchema, judgeJsonSchema, rubricLines, rubricVerdict } from "../judge";
import type { JudgeAnswer, RubricCriterion, RubricVerdict } from "../judge";
import { adBriefText } from "./brief";
import type { AdBrief, AdVersion } from "./brief";

export const AD_RUBRIC = [
  {
    id: "approvable",
    hard: true,
    ask: "Meta's reviewers would approve every version as written: it describes the service, makes no health, appearance or income claim, promises no sure result, shows no before-and-after in words, does not pressure or mislead, and is not an ad Meta asks to be declared (a job, housing, financial products, politics, gambling).",
  },
  {
    id: "facts",
    hard: true,
    ask: "No version holds a price, share, discount, free thing, date, deadline, number, promise, result or claim that the brief's facts, its service and its price line do not hold; and where the business never quotes prices, no version says one.",
  },
  {
    id: "reader",
    hard: true,
    ask: "No version speaks about the person reading: no question about who they are or how they feel, nothing about their body, health, age, money or any trait, said or implied. Speaking to them about the service ('message us to pick a time') is fine.",
  },
  {
    id: "one_action",
    hard: false,
    ask: "Each version asks for one thing, once: to message the business on WhatsApp. No call, website, form or second ask.",
  },
  {
    id: "voice",
    hard: false,
    ask: "It reads in the business's voice as its tone line says (warm, brief and plain with no tone line), specific to this service, never generic ad copy.",
  },
  {
    id: "angles",
    hard: false,
    ask: "The versions are different angles on the same facts, not one sentence reworded: a reader of all of them learns something from each.",
  },
  {
    id: "language",
    hard: false,
    ask: "It is natural in its language, never a word-for-word translation: Spanish neutral for Latin America and the US with ¿ and ¡ where they belong; English plain and idiomatic.",
  },
] as const satisfies readonly RubricCriterion[];

/** The judge's system prompt: who it is, each criterion with its id, and how to answer. */
export function adJudgeSystem(): string {
  return [
    "You judge the words of a paid ad a small business will run on Facebook and Instagram, against the brief they were written from. Be strict: Meta reviews every ad and turns down what breaks its rules, and the business's name is on it.",
    JUDGE_HOW,
    rubricLines(AD_RUBRIC),
    DATA_NOT_INSTRUCTIONS,
  ].join("\n\n");
}

/** The judge's question: the brief the writer was handed, then the versions to judge, fenced. */
export function adJudgeQuestion(adBrief: AdBrief, versions: readonly AdVersion[], couldNot: string | null): string {
  const judged = [
    ...versions.map((version, nth) => `Version ${nth + 1}\nHeadline: ${version.headline}\nText: ${version.text}`),
    ...(couldNot ? [`What the writer says it left out: ${couldNot}`] : []),
  ].join("\n\n");
  return [
    `The brief the ad was written from:\n${adBriefText(adBrief)}`,
    `The ad to judge:\n${fenced("record", judged)}`,
  ].join("\n\n");
}

export const AD_JUDGE_JSON_SCHEMA = judgeJsonSchema(AD_RUBRIC);
export const AdJudgeAnswerSchema = JudgeAnswerSchema;

/** A case's verdict (judge.ts rubricVerdict): every check of the draft's and every hard criterion must pass. */
export function adVerdict(
  issues: readonly { version: number; code: string; words: string }[],
  judged: JudgeAnswer,
): RubricVerdict {
  return rubricVerdict(
    AD_RUBRIC,
    issues.map((issue) => `version ${issue.version} ${issue.code}: ${issue.words}`),
    judged,
  );
}
