/**
 * Campaigns > Templates, the messages as rows (moved from MessagesReal in legacy/pages/messages.jsx, decision 0015): the
 * starter set in the library's order, each with the set's languages, then what the workspace wrote or synced, by name,
 * then what it hid. A message is one row in every language it has, and a language nobody wrote is a row with no words.
 *
 * What the Library lists are the workspace's messages (contracts campaignMessagesOf: a name in a language, with a version
 * on each channel it was written for), not its WhatsApp rows: a message written for email or text alone is a row, as one
 * with a WhatsApp version is. A row of a language keeps the WhatsApp version where there is one (`row`) and the message
 * it is a version of (`message`).
 */
import { isLibrarySample } from "@chanlytics/contracts";
import type { CampaignMessage, StarterTemplate } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { tplAnd, tplLangLabel } from "./words";
import type { StarterLibrary } from "./verbs";

/** A language by the words the list gives it ("Portuguese (Brazil)"), or the set's own ("English", "Spanish"). */
export interface TplLang {
  id: string;
  label: string;
}

/**
 * One language of one message: its WhatsApp version where the workspace has one, and the message in that language,
 * with its versions on every channel, where it has any. A language with neither is a row with no words.
 */
export interface TemplateRow {
  lang: TplLang;
  row: TemplateDto | null;
  message: CampaignMessage | null;
}

/** A language of a message that WhatsApp holds: its row is there. */
export interface PresentRow extends TemplateRow {
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

/** Everything the page lists and counts, worked out from the templates read, the messages and the library. */
export interface TemplateListing {
  langs: readonly TplLang[];
  list: TemplateDto[];
  starters: StarterGroup[];
  hiddenMessages: CampaignMessage[];
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

/** The languages a message holds a version in, on any channel: WhatsApp's, an email's or a text's. */
export const onFileOf = (g: TemplateGroup): TemplateRow[] => g.rows.filter((r) => r.row || r.message);

/**
 * The page's listing. `templates` are the workspace's WhatsApp rows (the head's approved and in-review counts and the sync
 * time are theirs); `messages` are every message it holds, one a name and language, and are what the groups and the count
 * of what is left of the starter set are made of.
 */
export function listingOf(
  templates: TemplateDto[],
  messages: readonly CampaignMessage[],
  S: StarterLibrary,
): TemplateListing {
  const langs: readonly TplLang[] = S.languages;
  const list = templates.filter((t) => !isLibrarySample(t.name));
  const held = messages.filter((m) => !isLibrarySample(m.name));
  const rowFor = (name: string, lang: string) => list.find((t) => t.name === name && t.language === lang) || null;
  const messageFor = (name: string, lang: string) => held.find((m) => m.name === name && m.language === lang) || null;
  // A language by the words the list gives it ("Portuguese (Brazil)"); the starter
  // set's own two keep the set's words ("English", "Spanish").
  const langOf = (id: string): TplLang => langs.find((l) => l.id === id) || { id, label: tplLangLabel(id) };
  const rowOf = (name: string, lang: TplLang): TemplateRow => ({
    lang,
    row: rowFor(name, lang.id),
    message: messageFor(name, lang.id),
  });
  // The languages of one name on any channel, WhatsApp's first in the order they were read.
  const languagesOf = (name: string): string[] => [
    ...new Set([
      ...list.filter((t) => t.name === name).map((t) => t.language),
      ...held.filter((m) => m.name === name).map((m) => m.language),
    ]),
  ];
  const groupsOf = (of: CampaignMessage[], purposeOf: (rows: TemplateRow[]) => string): CustomGroup[] =>
    [...new Set(of.map((m) => m.name))].flatMap((name) => {
      const mine = of.filter((m) => m.name === name);
      const first = mine[0];
      if (!first) return [];
      const rows = mine.map((m) => rowOf(name, langOf(m.language)));
      return [{ key: `c:${name}`, title: first.title, purpose: purposeOf(rows), starter: null, rows }];
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
      ...langs.map((l) => rowOf(s.name, l)),
      ...languagesOf(s.name)
        .filter((id) => !langs.some((l) => l.id === id))
        .map((id) => rowOf(s.name, langOf(id))),
    ],
  }));
  const starterNames = new Set(starters.map((g) => g.starter.name));
  const rest = held.filter((m) => !starterNames.has(m.name));
  const hiddenMessages = rest.filter((m) => m.hidden);
  // Where a message came from: WhatsApp Manager for a WhatsApp row synced from there, here for the rest (an email or a
  // text is always written here).
  const writtenWhere = (rows: TemplateRow[]) => {
    const whatsapp = rows.find((r) => r.row)?.row;
    return whatsapp && whatsapp.source !== "chanlytics" ? "from WhatsApp Manager" : "written here";
  };
  const customGroups = groupsOf(
    rest.filter((m) => !m.hidden),
    writtenWhere,
  );
  const hiddenGroups = groupsOf(hiddenMessages, () => "hidden from the composers");
  // A starter language is on file when its message exists on any channel: an email alone is as much a message as a
  // WhatsApp version is.
  const missing = langs.map((l) => ({
    lang: l,
    n: starters.filter((g) => {
      const there = g.rows.find((r) => r.lang.id === l.id);
      return !(there?.row || there?.message);
    }).length,
  }));
  const missingTotal = missing.reduce((a, m) => a + m.n, 0);
  const shown = list.filter((t) => !t.hidden_at);
  return {
    langs,
    list,
    starters,
    hiddenMessages,
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
