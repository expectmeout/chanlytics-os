/**
 * Ask's skills (docs: Claude Video/docs/2026-10-15-ask-skills-customer-message-writer.md): instructions written for one
 * job, kept apart from Ask's always-loaded prompt and used only when the job comes up. Our own format, on our own server:
 * Anthropic's API Agent Skills load a folder into a code-execution container, which fits making files, not a palette turn.
 *
 * A skill is a folder under ask-skills/: its words (`skill.ts`: when it applies, its rules, worked examples, what it never
 * does, its guide), what a craft call is handed and answers (`brief.ts`), what code holds the answer to (`checks.ts`), and
 * its eval's judge (`rubric.ts`). It is used two ways:
 *
 *   - craft: the system prompt of a call made only to do the job, at the skill's own effort, through the gateway under
 *     the skill's purpose (craftSystem). Its answer is checked in code before anything is shown.
 *   - guide: a short block put into Ask's own turn when the job comes up (guideBlock), prefetched where the question's
 *     words ask for it (skillsAsked, registry.ts) or read by the guide tool, by the skill's id.
 */
import type { ModelEffort } from "../ai/models";
import { DATA_NOT_INSTRUCTIONS } from "../ai/fence";

/**
 * The gateway purposes a craft call is made under, one per craft skill: what the edge lets through and counts in Ask's
 * daily budget (apps/edge/lib/ask-gateway.ts GATEWAY_PURPOSES), so the usage of each skill can be read apart from Ask's
 * rounds.
 */
export const SKILL_CRAFT_PURPOSES = ["message_draft"] as const;
export type SkillCraftPurpose = (typeof SKILL_CRAFT_PURPOSES)[number];

/**
 * The most a craft call may write, its thinking included (Opus 5.5 thinks on every request, and its thinking counts toward
 * max_tokens): the edge's ceiling for a craft purpose. The small drafts' 2,000 would cut a high-effort answer short.
 */
export const SKILL_CRAFT_MAX_TOKENS = 8_000;

/** A titled group of a skill's rules, said in its order. */
export interface SkillSection {
  title: string;
  lines: readonly string[];
}

/** A worked example: what the call is handed, shortly, and what a good answer is. */
export interface SkillExample {
  title: string;
  given: string;
  answer: string;
}

export interface AskSkill<Id extends string = string> {
  /** What the guide tool and the eval name it by. */
  id: Id;
  /** What it is, in a few words: "Customer message writer". */
  title: string;
  /** Who the craft call is, in one paragraph: the first words of its system prompt. */
  role: string;
  /** When it applies: the jobs, one line each, and the words in a question that ask for one (English and Spanish). */
  when: { jobs: readonly string[]; asked: RegExp };
  rules: readonly SkillSection[];
  examples: readonly SkillExample[];
  /** What it never does, whatever it is handed. */
  never: readonly string[];
  /** Its short form, for Ask's own turn: what Ask hands the skill and decides itself, in a few lines. */
  guide: readonly string[];
  craft: {
    effort: ModelEffort;
    /** What it may write, its thinking included (at most SKILL_CRAFT_MAX_TOKENS). */
    maxTokens: number;
    purpose: SkillCraftPurpose;
  };
}

const skillBullets = (lines: readonly string[]): string => lines.map((l) => `- ${l}`).join("\n");

/**
 * The system prompt of a skill's craft call: its role, the jobs it does, each section of its rules, what it never does,
 * its worked examples, and the one rule line for words someone else wrote (contracts ai/fence.ts), since the draft it is
 * handed is fenced.
 */
export function craftSystem(skill: AskSkill): string {
  return [
    skill.role,
    `What you write:\n${skillBullets(skill.when.jobs)}`,
    ...skill.rules.map((s) => `${s.title}:\n${skillBullets(s.lines)}`),
    `Never:\n${skillBullets(skill.never)}`,
    ...skill.examples.map((e, i) => `Example ${i + 1}, ${e.title}.\nGiven:\n${e.given}\nA good answer:\n${e.answer}`),
    DATA_NOT_INSTRUCTIONS,
  ].join("\n\n");
}

/** The most a guide block may hold: a short form, so a turn that loads it still has its cache and its room. */
export const SKILL_GUIDE_MAX = 1_200;

/** A skill's guide, as a block of Ask's turn: its title and when it applies, then what Ask does about it. */
export function guideBlock(skill: AskSkill): string {
  return [`Skill: ${skill.title}. It is used for: ${skill.when.jobs.join(" ")}`, skillBullets(skill.guide)].join("\n");
}
