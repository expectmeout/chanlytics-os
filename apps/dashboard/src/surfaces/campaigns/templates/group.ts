/**
 * Campaigns > Templates, the messages as rows (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015): the
 * starter set in the library's order, each with the set's languages, then what the workspace wrote or synced, by name,
 * then what it hid. A message is one row in every language it has, and a language nobody wrote is a row with no words.
 */
import type { StarterTemplate } from "@chanlytics/contracts";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import { TPL_SAMPLES, tplAnd, tplLangLabel, tplTitle } from "./words";
import type { StarterLibrary } from "./verbs";

/** A language by the words the list gives it ("Portuguese (Brazil)"), or the set's own ("English", "Spanish"). */
export interface TplLang {
  id: string;
  label: string;
}

/** One language of one message: its row where the workspace has one, nothing where it has not. */
export interface TemplateRow {
  lang: TplLang;
  row: TemplateDto | null;
}

/** A language of a message the workspace has a row for. */
export interface PresentRow {
  lang: TplLang;
  row: TemplateDto;
}

/** One message as the page lists it: a starter of the library's set... */
export interface StarterGroup {
  key: string;
  title: string;
  purpose: string;
  starter: StarterTemplate;
  rows: TemplateRow[];
}

/** ...or what the workspace wrote or synced, which has no starter. */
interface CustomGroup {
  key: string;
  title: string;
  purpose: string;
  starter: null;
  rows: TemplateRow[];
}

export type TemplateGroup = StarterGroup | CustomGroup;

/** Everything the page lists and counts, worked out from the templates read and the library. */
export interface TemplateListing {
  langs: readonly TplLang[];
  list: TemplateDto[];
  starters: StarterGroup[];
  hiddenRows: TemplateDto[];
  customGroups: CustomGroup[];
  hiddenGroups: CustomGroup[];
  missingTotal: number;
  allMissing: boolean;
  leftToAdd: string;
  shown: TemplateDto[];
  approved: number;
  pending: number;
  lastSync: string | null;
}

export function listingOf(templates: TemplateDto[], S: StarterLibrary): TemplateListing {
  const langs: readonly TplLang[] = S.languages;
  const list = templates.filter((t) => !TPL_SAMPLES.has(t.name));
  const rowFor = (name: string, lang: string) => list.find((t) => t.name === name && t.language === lang) || null;
  // A language by the words the list gives it ("Portuguese (Brazil)"); the starter
  // set's own two keep the set's words ("English", "Spanish").
  const langOf = (id: string): TplLang => langs.find((l) => l.id === id) || { id, label: tplLangLabel(id) };
  const groupsOf = (rows: TemplateDto[], purposeOf: (t: TemplateDto) => string): CustomGroup[] =>
    [...new Set(rows.map((t) => t.name))].flatMap((name) => {
      const mine = rows.filter((x) => x.name === name);
      const t = mine[0];
      return t
        ? [
            {
              key: `c:${name}`,
              title: tplTitle(t),
              purpose: purposeOf(t),
              starter: null,
              rows: mine.map((x) => ({ lang: langOf(x.language), row: x })),
            },
          ]
        : [];
    });
  // The starters in the library's order, each with the set's languages -- on file
  // or not -- and then any other language the workspace has written it in; then
  // what the workspace wrote or synced, by name; then a fold for what it hid.
  const starters: StarterGroup[] = S.list.map((s) => ({
    key: s.key,
    title: s.title,
    purpose: s.purpose,
    starter: s,
    rows: [
      ...langs.map((l) => ({ lang: l, row: rowFor(s.name, l.id) })),
      ...list
        .filter((t) => t.name === s.name && !langs.some((l) => l.id === t.language))
        .map((t) => ({ lang: langOf(t.language), row: t })),
    ],
  }));
  const starterNames = new Set(starters.map((g) => g.starter.name));
  const rest = list.filter((t) => !starterNames.has(t.name));
  const hiddenRows = rest.filter((t) => !!t.hidden_at);
  const customGroups = groupsOf(
    rest.filter((t) => !t.hidden_at),
    (t) => (t.source === "chanlytics" ? "written here" : "from WhatsApp Manager"),
  );
  const hiddenGroups = groupsOf(hiddenRows, () => "hidden from the composers");
  const missing = langs.map((l) => ({
    lang: l,
    n: starters.filter((g) => !g.rows.find((r) => r.lang.id === l.id)?.row).length,
  }));
  const missingTotal = missing.reduce((a, m) => a + m.n, 0);
  const shown = list.filter((t) => !t.hidden_at);
  return {
    langs,
    list,
    starters,
    hiddenRows,
    customGroups,
    hiddenGroups,
    missingTotal,
    // A workspace with none of the set is starting, not broken: it is offered the
    // set. One part-way through has what is left to add at the list's foot.
    allMissing: missingTotal > 0 && missingTotal === starters.length * langs.length,
    // What is left of the set, by language -- "3 in English and 7 in Spanish" -- the foot's act's detail.
    leftToAdd: tplAnd(missing.filter((m) => m.n > 0).map((m) => `${m.n} in ${m.lang.label}`)),
    shown,
    approved: shown.filter((t) => t.meta_status === "approved").length,
    pending: shown.filter((t) => t.meta_status === "pending").length,
    lastSync: list.reduce<string | null>((m, t) => (t.synced_at && (!m || t.synced_at > m) ? t.synced_at : m), null),
  };
}
