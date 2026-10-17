import { starterByName, startersForTrigger } from "./starter-lookup.js";
export const TEMPLATE_TITLE_MAX = 60;
export function templateTitle(name, title) {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (given) return given.slice(0, TEMPLATE_TITLE_MAX);
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "").replace(/_v\d+$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
}
export function playbookName(trigger, tpl) {
  return startersForTrigger(trigger.id).some((s) => s.name === tpl.name) ? trigger.label : `${trigger.label} \xB7 ${templateTitle(tpl.name, tpl.title)}`;
}
