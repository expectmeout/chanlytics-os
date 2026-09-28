/**
 * What a template is called for people: the title the workspace gave it, the starter's, or its name made words;
 * and a playbook's name when it was given none. A language's words are message-languages.ts.
 */
import { starterByName, starterForTrigger } from "./starter-lookup";

export const TEMPLATE_TITLE_MAX = 60;

/**
 * Words for people: the title the workspace gave it, else the starter's,
 * else the name made words — a trailing version (_v1) is not a word.
 */
export function templateTitle(name: string | null | undefined, title?: string | null): string {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (given) return given.slice(0, TEMPLATE_TITLE_MAX);
  const s = starterByName(name);
  if (s) return s.title;
  const words = String(name ?? "")
    .replace(/_v\d+$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : String(name ?? "");
}

/**
 * A playbook's name when it was given none: its moment's own ("Win-back")
 * when it sends the moment's own starter, else with the message's title
 * ("Win-back · Autumn offer"). The route names it so, and the composer says
 * so before it is saved.
 */
export function playbookName(
  trigger: { id: string; label: string },
  tpl: { name: string; title?: string | null },
): string {
  return starterForTrigger(trigger.id)?.name === tpl.name
    ? trigger.label
    : `${trigger.label} · ${templateTitle(tpl.name, tpl.title)}`;
}
