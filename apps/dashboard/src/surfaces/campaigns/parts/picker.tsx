/**
 * One drawing for a language, and the language list the kit's picker opens (moved from legacy/components/campaign-bits.jsx,
 * decision 0015; its own picker -- the placement, the click-outside, the keys and the phone sheet of a 770-line
 * CmPicker -- is the kit's Picker now, surfaces/kit/picker/picker.tsx).
 *
 * A message is one thing in every language it has, so it has ONE language control: a token that says the language in
 * view and opens every language there is -- the ones WhatsApp holds, with their state; the ones the starter library has
 * written; and every other language WhatsApp takes -- found by typing a name in English or in its own words, a place,
 * or a code. This file draws a language's state (`CmLangGlyph`) and hands the kit's Picker the languages: their groups
 * under their headings, and the search that finds one by more than its label (`cmLanguageSearch`).
 */
import { stateOf } from "@chanlytics/contracts";
import type { TemplateLanguage } from "@chanlytics/contracts";
import type { PickerGroup, PickerSearch } from "../../kit";
import { starters } from "../templates/verbs";
import { cmGroups, cmSearch } from "./picks";

/**
 * One language of one message, drawn: filled when WhatsApp approved it, dotted
 * while WhatsApp reads it, struck through when WhatsApp refused it, and an open
 * dashed ring for a language the message does not exist in. The colour is the
 * vocabulary's (tone.ts); `status` null is absence.
 */
export const CmLangGlyph = ({ status = null, size = 12 }: { status?: string | null; size?: number }) => {
  const said = status ? stateOf("template", status) : null;
  const tone = said ? said.tone : "none";
  return (
    <svg className="cm-lang-glyph" data-tone={tone} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5.1"
        fill={tone === "ok" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeDasharray={!said ? "2 2.1" : tone === "info" ? "1.3 2.3" : undefined}
      />
      {tone === "danger" && (
        <path d="M3.8 10.2 L10.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      )}
    </svg>
  );
};

/**
 * One line the list offers: a language (contracts messageLanguageChoices, or any list of languages), in the group
 * whose heading stands over it. `status` is its state at WhatsApp, null for "not on WhatsApp", absent for no glyph.
 */
type LanguageChoice = TemplateLanguage & { group?: string; status?: string | null };

/**
 * What stands at the right of a language: its state at WhatsApp in the app's one vocabulary (tone.ts), else its own name
 * when that is not its English one -- "Deutsch" beside German, nothing beside English.
 */
const languageHint = (c: LanguageChoice) =>
  c.status ? stateOf("template", c.status).label : c.native && c.native !== c.name ? c.native : null;

/** The languages as the picker takes them: each with its state drawn before it, in its group under its heading. */
export function cmLanguages(
  choices: readonly LanguageChoice[],
  headings: Readonly<Record<string, string>> = {},
): PickerGroup<string>[] {
  return cmGroups(
    choices.map((c) => ({
      id: c.id,
      label: c.label,
      hint: languageHint(c),
      ...(c.status !== undefined ? { glyph: <CmLangGlyph status={c.status} size={12} /> } : {}),
      ...(c.group ? { group: c.group } : {}),
    })),
    headings,
  );
}

/**
 * The search over a long list of languages: the contracts' (findLanguages), which finds one by a code, an English name,
 * its own name or a place, not by the words the list draws alone.
 */
export function cmLanguageSearch(choices: readonly LanguageChoice[]): PickerSearch {
  return {
    ...cmSearch("Search languages", "No language by that name."),
    match: (option, query) => {
      const one = choices.find((c) => c.id === option.value);
      return one !== undefined && starters.findLanguages(query, [one]).length > 0;
    },
  };
}
