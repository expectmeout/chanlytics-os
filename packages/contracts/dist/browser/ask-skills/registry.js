import { CUSTOMER_MESSAGE_SKILL } from "./customer-message/skill.js";
import { guideBlock } from "./skill.js";
const ASK_SKILLS = { customer_message: CUSTOMER_MESSAGE_SKILL };
export const ASK_SKILL_IDS = Object.keys(ASK_SKILLS);
export function skillGuide(id) {
  return guideBlock(ASK_SKILLS[id]);
}
export function isAskSkillId(v) {
  return typeof v === "string" && Object.hasOwn(ASK_SKILLS, v);
}
export function skillsAsked(question) {
  return ASK_SKILL_IDS.filter((id) => ASK_SKILLS[id].when.asked.test(question));
}
