/**
 * Ask's skills by id (skill.ts): what the guide tool reads one by, and what a question's own words ask for, so its guide
 * can be put into the turn before the model asks for it (the way server/ask/cross-page.ts reads another page ahead).
 */
import { CUSTOMER_MESSAGE_SKILL } from "./customer-message/skill";
import { VIDEO_SKILL } from "./video/skill";
import { guideBlock, type AskSkill, keysOf } from "@chanlytics/contracts";

/**
 * What the registry reads of a skill: its guide, and the words that ask for it. A skill with a craft call holds more
 * (customer-message/skill.ts); one Ask does itself is only this (video/skill.ts).
 */
type GuidedSkill = Pick<AskSkill, "id" | "title" | "when" | "guide">;

const ASK_SKILLS = {
  customer_message: CUSTOMER_MESSAGE_SKILL,
  video: VIDEO_SKILL,
} as const satisfies Record<string, GuidedSkill>;
export type AskSkillId = keyof typeof ASK_SKILLS;
export const ASK_SKILL_IDS = keysOf(ASK_SKILLS);

/**
 * A skill's guide, as a block of Ask's turn (skill.ts guideBlock): what the prefetch puts in when skillsAsked names it,
 * and what the guide read answers for its id.
 */
export function skillGuide(id: AskSkillId): string {
  return guideBlock(ASK_SKILLS[id]);
}

/** Whether a string names one of Ask's skills. */
export function isAskSkillId(value: unknown): value is AskSkillId {
  return typeof value === "string" && Object.hasOwn(ASK_SKILLS, value);
}

/** The skills a question's own words ask for (each skill's `when.asked`), in the registry's order; none for most. */
export function skillsAsked(question: string): AskSkillId[] {
  return ASK_SKILL_IDS.filter((id) => ASK_SKILLS[id].when.asked.test(question));
}
