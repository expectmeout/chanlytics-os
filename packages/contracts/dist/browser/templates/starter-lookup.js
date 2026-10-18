import { triggerOf, triggerOffered } from "../playbooks/playbook-triggers.js";
import { STARTER_TEMPLATES } from "./starter-templates.js";
export function starterByName(name) {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}
export function starterByKey(key) {
  return STARTER_TEMPLATES.find((s) => s.key === key) ?? null;
}
const STARTER_OF = { lapsed: "quiet_30" };
export function startersOffered(here) {
  return STARTER_TEMPLATES.filter((s) => {
    if (s.retired) return false;
    if (!here.reviewLink && starterText(s, "en_US").slots.some((x) => x.kind === "review_link")) return false;
    const t = s.trigger ? triggerOf(s.trigger) : null;
    return !t || triggerOffered(t);
  });
}
export function starterForTrigger(trigger) {
  return startersForTrigger(trigger)[0] ?? null;
}
export function startersForTrigger(trigger) {
  if (!trigger) return [];
  const own = STARTER_OF[trigger] ?? trigger;
  const all = STARTER_TEMPLATES.filter((s) => s.trigger === own);
  return [...all.filter((s) => !s.retired), ...all.filter((s) => s.retired)];
}
export function starterSmsText(s, language) {
  return s.sms?.[language] ?? s.sms?.en_US ?? null;
}
export function starterEmailText(s, language) {
  return s.email?.[language] ?? s.email?.en_US ?? null;
}
export function starterText(s, language) {
  return s.texts[language] ?? s.texts.en_US;
}
export function starterDraft(s, language) {
  const t = starterText(s, language);
  return {
    name: s.name,
    language,
    category: s.category,
    body: t.body,
    footer: t.footer,
    examples: t.slots.map((x) => x.example)
  };
}
