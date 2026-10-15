/**
 * Ask's skills by id (skill.ts): what the guide tool reads one by, and what a question's own words ask for, so its guide
 * can be put into the turn before the model asks for it (the way server/ask/cross-page.ts reads another page ahead).
 */
import { CUSTOMER_MESSAGE_SKILL } from "./customer-message/skill";
import { guideBlock, type AskSkill } from "./skill";

const ASK_SKILLS = { customer_message: CUSTOMER_MESSAGE_SKILL } as const satisfies Record<string, AskSkill>;
export type AskSkillId = keyof typeof ASK_SKILLS;
export const ASK_SKILL_IDS = Object.keys(ASK_SKILLS) as AskSkillId[];

/**
 * A skill's guide, as a block of Ask's turn (skill.ts guideBlock): what the prefetch puts in when skillsAsked names it,
 * and what the guide read answers for its id.
 */
export function skillGuide(id: AskSkillId): string {
  return guideBlock(ASK_SKILLS[id]);
}

/** Whether a string names one of Ask's skills. */
export function isAskSkillId(v: unknown): v is AskSkillId {
  return typeof v === "string" && Object.hasOwn(ASK_SKILLS, v);
}

/** The skills a question's own words ask for (each skill's `when.asked`), in the registry's order; none for most. */
export function skillsAsked(question: string): AskSkillId[] {
  return ASK_SKILL_IDS.filter((id) => ASK_SKILLS[id].when.asked.test(question));
}
