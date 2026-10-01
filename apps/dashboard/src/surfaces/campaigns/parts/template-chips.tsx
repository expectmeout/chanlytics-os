/**
 * Which message a campaign sends, picked once (moved from legacy/components/template-chips.jsx, decision 0015).
 *
 * Templates are stored one row per (name, language), and both composers drew
 * one chip per ROW titled with `templateTitle(name)`, which takes no language.
 * So a workspace that installed the starter set in English and Spanish -- which
 * Messages advertises as the default -- saw seven PAIRS of identical chips,
 * adjacent, with nothing on either to tell them apart. `defaultTemplate` opened
 * on whichever of the pair the query returned first.
 *
 * The Inbox composer had already answered this: `inboxTemplates` labels every
 * row "<title> · <language>". Here there is room to do better than a label --
 * one chip per message, and inside it the language it would go in, which opens
 * its other languages: the same picker a template's row on Campaigns › Templates
 * opens (LanguagePicker). It was a toggle, "English | Spanish" in every chip,
 * every language of every message spelled out side by side.
 *
 * The "starter" / category word gives up its place to the language when a
 * message has more than one: which language leaves is load-bearing, and where a
 * template came from is not. A message with one language keeps the word.
 */
import type { TemplateGroup } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { starters } from "../templates/verbs";
import { LanguagePicker } from "./picker";

const tcKind = (t: TemplateDto) => (starters.byName(t.name) ? "starter" : t.category || "");
const tcTag = (code: string, among: readonly string[]) => starters.langTag(code, among);
// A composer offers approved rows only, so every language here is one WhatsApp
// holds: the list needs no headings and no state, only the words and the tick.
const tcChoices = (g: TemplateGroup<TemplateDto>) =>
  g.rows.map((r) => {
    const known = starters.allLanguages.find((l) => l.id === r.language);
    return {
      id: r.language,
      label: g.labels[r.language] || r.language,
      name: known ? known.name : g.labels[r.language] || r.language,
      native: known ? known.native : "",
    };
  });

interface TemplateChipsProps {
  templates: readonly TemplateDto[];
  value: string;
  onPick: (id: string) => void;
  testid: string;
}

/**
 * templates  the approved rows, in any order
 * value      the id of the row picked, or ""
 * onPick     called with a row's id
 * testid     the page's own name for a chip ("bc-template", "pb-template")
 */
export function TemplateChips({ templates, value, onPick, testid }: TemplateChipsProps) {
  const groups = starters.group(templates);
  return (
    <>
      {groups.map((g) => {
        // The row in view for this message: the one picked, else the first --
        // which is a language order now, not the order a query happened to give.
        const picked = g.rows.find((r) => r.id === value) || null;
        const row = picked || g.rows[0];
        if (!row) return null;
        const many = g.rows.length > 1;
        return (
          <span key={g.name} className={"bc-chip tpl-chip" + (picked ? " active" : "")}>
            <button
              type="button"
              className="tpl-chip-name"
              aria-pressed={!!picked}
              onClick={() => onPick(row.id)}
              title={row.body_preview || ""}
              data-testid={testid}
            >
              {g.title}
            </button>
            {many ? (
              <LanguagePicker
                size="sm"
                /* Ticked only once this message is the one picked: until then it
                   says the language it WOULD go in, and nothing is chosen yet. */
                value={picked ? row.language : null}
                choices={tcChoices(g)}
                tag={tcTag(
                  row.language,
                  g.rows.map((r) => r.language),
                )}
                label={`Language for ${g.title}`}
                search={false}
                onPick={(lang) => {
                  const r = g.rows.find((x) => x.language === lang);
                  if (r) onPick(r.id);
                }}
                testid={`${testid}-lang`}
              />
            ) : tcKind(row) ? (
              <span className="bc-chip-count">{tcKind(row)}</span>
            ) : null}
          </span>
        );
      })}
    </>
  );
}
