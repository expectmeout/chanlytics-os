import { DATA_NOT_INSTRUCTIONS } from "../ai/fence.js";
export const SKILL_CRAFT_PURPOSES = ["message_draft"];
export const SKILL_CRAFT_MAX_TOKENS = 8e3;
const skillBullets = (lines) => lines.map((l) => `- ${l}`).join("\n");
export function craftSystem(skill) {
  return [
    skill.role,
    `What you write:
${skillBullets(skill.when.jobs)}`,
    ...skill.rules.map((s) => `${s.title}:
${skillBullets(s.lines)}`),
    `Never:
${skillBullets(skill.never)}`,
    ...skill.examples.map((e, i) => `Example ${i + 1}, ${e.title}.
Given:
${e.given}
A good answer:
${e.answer}`),
    DATA_NOT_INSTRUCTIONS
  ].join("\n\n");
}
export const SKILL_GUIDE_MAX = 1200;
export function guideBlock(skill) {
  return [`Skill: ${skill.title}. It is used for: ${skill.when.jobs.join(" ")}`, skillBullets(skill.guide)].join("\n");
}
