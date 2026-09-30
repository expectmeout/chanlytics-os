/**
 * Campaigns > Templates, the small words a page and its rows say (moved from the head of legacy/pages/messages.jsx,
 * decision 0015): when a message last synced, a list said the way a person says it, a number as a word, the state of a
 * language in the app's one vocabulary, a body on one line with its slots named, and what the business says of itself.
 * All of it is pure but for the two reads of the settings surface (`brainOf` of what it is given, `tplOwn` of what the
 * surface holds now, as the JSX read `window.__SETTINGS`).
 */
import { DAY_MS, HOUR_MS, MIN_MS, stateOf } from "@chanlytics/contracts";
import type { SettingsRecord, WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { surfaceValue } from "../../surface-values";
import { starters } from "./verbs";

export const tplAgo = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  if (diff < MIN_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.round(diff / MIN_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.round(diff / HOUR_MS)}h ago`;
  return `${Math.round(diff / DAY_MS)}d ago`;
};

// "English", "English and Spanish", "English, Spanish and Portuguese" -- the
// languages a workspace answers in, said the way a person says a list. The line
// under the messages named English and Spanish in the markup, so a workspace
// that answers in neither read a sentence about two languages it does not have.
export const tplAnd = (words: string[]): string =>
  words.length < 2 ? words[0] || "" : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

// A number said as a word inside a sentence -- "the starter set is eight messages"
// -- the way a person says it; past twelve, the figure.
const TPL_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];
export const tplSpell = (n: number): string => TPL_WORDS[n] || String(n);

// Words for people: a starter's title, the workspace's own, or the name with its underscores made spaces.
export const tplTitle = (t: Parameters<typeof starters.title>[0]): string => starters.title(t);

// Meta's own sample lives in every account and is nobody's message: never shown, whatever the sync keeps.
export const TPL_SAMPLES = new Set(["hello_world"]);

/** What the workspace says of its business in Settings (`__SETTINGS.config.brain`): nothing where it has said nothing. */
export const brainOf = (settings: SettingsRecord | null | undefined): NonNullable<WorkspaceSettings["brain"]> =>
  (settings && settings.config && settings.config.brain) || {};

// What this business says about itself, for the slots that name it. A preview puts its own name and
// booking link there, and a blank for what it has not given -- never the sample filed with Meta (the
// starters' "Luna Studio"). The rule and the slots are the contracts' (templatePreview, starterPreview).
export const tplOwn = () => {
  const brain = brainOf(surfaceValue("settings")?.settings);
  return { business_name: brain.business_name || null, booking_link: brain.booking_link || null };
};

// A message's state in ONE language, in the app's one vocabulary (tone.ts): a tone this file never picks for itself. A
// language Meta has never seen has no state -- it is an absence, and absence is drawn, not coloured.
export const tplSaid = (status: string | null | undefined) => (status ? stateOf("template", status) : null);

// "EN", "PT" -- the chip's letters, with the place only beside another code of the
// same language ("EN-US" and "EN-GB"). A label ("English (US)") is the list's.
export const tplTag = (id: string, among: readonly string[]): string => starters.langTag(id, among);
export const tplLangLabel = (id: string): string => starters.langLabel(id);

// One line, whatever the message does with newlines and tabs: a row is one line
// tall, and a template written in WhatsApp Manager can be six paragraphs.
export const tplOneLine = (s: string | null | undefined): string =>
  String(s || "")
    .replace(/\s+/g, " ")
    .trim();

// A slot by name inside a one-line quote -- "{first name}", "{business}", "{link}" --
// by what fills it where the library knows, else by the label it was given.
const TPL_SLOT_WORDS: Record<string, string> = {
  first_name: "first name",
  business_name: "business",
  booking_link: "link",
  visit_when: "time",
  visit_service: "service",
  proposal_link: "proposal link",
};
export const tplSlotWord = (kind: string | undefined, label: string | undefined, n: string): string =>
  (kind && TPL_SLOT_WORDS[kind]) ||
  String(label || `value ${n}`)
    .toLowerCase()
    .replace(/^(the|la|el|los|las) /, "");
