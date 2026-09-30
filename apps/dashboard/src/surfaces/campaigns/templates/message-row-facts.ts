/**
 * What one message's row knows before it draws (moved from MessageRow in legacy/pages/messages.jsx, decision 0015):
 * which language is in view and what is written in it, what its words are, what sends it and how much of it went out,
 * the mark it wears and whether it asks for attention. Each is a plain function over the row's group and its state; the
 * two that read a surface (`usageOf`) read what the surface holds now, as the JSX read `window.__TEMPLATE_USE`,
 * `__TEMPLATE_SENT` and `__PLAYBOOKS` with no surface argument.
 */
import type { TemplateSentWords } from "@chanlytics/contracts";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import { surfaceValue } from "../../surface-values";
import type { PresentRow, TemplateGroup, TemplateRow, TplLang } from "./group";
import type { StarterLibrary } from "./verbs";
import { tplLangLabel, tplOneLine, tplOwn, tplSaid, tplSlotWord } from "./words";

/** The first language a message has on file, else the set's first: where a row opens. */
export function firstLang(present: PresentRow[], langs: readonly TplLang[]): string {
  return present[0] ? present[0].lang.id : langs[0] ? langs[0].id : "en_US";
}

interface LanguageInput {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  canAdd: boolean;
  present: PresentRow[];
  langId: string;
  back: string | null;
  adding: string | null;
  sentLang: string | null;
}

/** Where a new language of this message is written from: the row on file, or the library's English. */
interface TranslationSource {
  ref: { id: string } | { starter: string; from: string };
  from: string;
  name: string;
}

/** The language in view, and what is on file or written in it. */
export function languageFacts(p: LanguageInput) {
  const { g, langs, S, canAdd, present, langId, back, adding, sentLang } = p;
  // The language in view: the one picked while it is on file, written by the
  // library, being written or just sent; otherwise the message's first.
  const known = (id: string) =>
    present.some((r) => r.lang.id === id) || !!(g.starter && g.starter.texts && g.starter.texts[id]);
  const view = known(langId) || langId === adding || langId === sentLang ? langId : firstLang(present, langs);
  // Any language WhatsApp takes, not only one of the message's own: a new one has
  // no row and no library words until it is written.
  const cur: TemplateRow = g.rows.find((r) => r.lang.id === view) || {
    lang: { id: view, label: tplLangLabel(view) },
    row: null,
  };
  const row = cur.row;
  // The library's words ONLY where it wrote them: `starterText` answers English for
  // a language it has not, and English under a Portuguese heading is not Portuguese.
  const written = !!(g.starter && g.starter.texts && g.starter.texts[view]);
  const starterText = g.starter && written ? S.text(g.starter, view) : null;
  // What a new language is written from: the language that was in view when it
  // was picked, else the first WhatsApp approved, else the first on file; a
  // starter nobody added, the library's English.
  const fromRow =
    (back && present.find((r) => r.lang.id === back)) ||
    present.find((r) => r.row.meta_status === "approved") ||
    present[0] ||
    null;
  const source: TranslationSource | null = fromRow
    ? { ref: { id: fromRow.row.id }, from: fromRow.lang.id, name: fromRow.row.name }
    : g.starter
      ? { ref: { starter: g.starter.key, from: "en_US" }, from: "en_US", name: g.starter.name }
      : null;
  // Why Chanlytics cannot write it in another language: a heading, or a button
  // other than one link, would not come with it (contracts templateUntranslatable).
  const untranslatable = fromRow ? S.untranslatable(fromRow.row) : null;
  const mayAdd = !!(canAdd && source && !untranslatable);
  return { view, cur, row, written, starterText, fromRow, source, untranslatable, mayAdd };
}

type StarterText = ReturnType<StarterLibrary["text"]>;

/** The words in view: the body with its slots still in it, what fills them, and the line under them. */
export function rowWords(p: {
  g: TemplateGroup;
  S: StarterLibrary;
  row: TemplateDto | null;
  starterText: StarterText | null;
  view: string;
}) {
  const { g, S, row, starterText, view } = p;
  const own = tplOwn();
  // The body with its slots still in it, and the words that fill them: the
  // preview marks what varies per person, which a filled string cannot.
  const body = row ? row.body_preview || "" : starterText ? starterText.body : "";
  const values = row
    ? S.rowValues(row, own)
    : g.starter
      ? S.starterValues(g.starter, view, own.business_name, own.booking_link)
      : null;
  // The line under the words. `public.templates` does have one on file -- Meta's
  // components, kept since 00045 -- and nothing read it, so this said a starter's
  // footer and nothing else. A row the workspace wrote now shows its own; a
  // starter not yet added shows the library's, which is what WhatsApp would see.
  const footer = row ? S.footer(row) : starterText ? starterText.footer : null;
  return { body, values, footer };
}

/** What sends this message, how much of it went out, and what the running playbooks do with the language in view. */
export function usageOf(p: { g: TemplateGroup; present: PresentRow[]; row: TemplateDto | null }) {
  const { g, present, row } = p;
  const settings = surfaceValue("settings");
  const playbooks = surfaceValue("playbooks");
  // What sends this MESSAGE, in the words the bridge composed: the playbooks,
  // the broadcasts a person sent and the Inbox's booking template, joined on the
  // server. Keyed by name, because a message is one thing in several languages.
  // Null: the usage was not read, and the row says nothing rather than guessing.
  const named = g.rows.find((r): r is PresentRow => !!r.row);
  const gName = g.starter ? g.starter.name : named ? named.row.name : null;
  const useMap = settings ? settings.templateUse : null;
  const use = gName && useMap ? useMap[gName] || null : null;
  // How many of it went out and when the latest did, in the words the bridge
  // composed: the people a run SENT to and what the Inbox sent on it, never the
  // audience a run was scheduled for. Keyed by name like the usage; null is not read.
  // A starter with no row has no entry -- the map is one per message ON FILE -- and
  // says it was never added, when the sends were read at all.
  const sentMap = settings ? settings.templateSent : null;
  const notAdded: TemplateSentWords = { count: null, when: "Not added" };
  const sent: TemplateSentWords | null =
    gName && sentMap ? sentMap[gName] || (g.starter && !present.length ? notAdded : null) : null;
  // The playbooks that send the template in view, found the way a run finds it: by name and language. Null: not read.
  // Per ROW, not per message: this is what a delete of ONE language must refuse on.
  const pbRows = playbooks ? playbooks.rows || [] : null;
  const users =
    row && pbRows ? pbRows.filter((p) => p.template_name === row.name && p.template_language === row.language) : [];
  const sending = users.filter((p) => p.state === "running").map((p) => p.name);
  const paused = users.filter((p) => p.state !== "running").map((p) => p.name);
  const quoted = (names: string[]) => names.map((n) => `“${n}”`).join(", ");
  const pausedWords = !pbRows
    ? " Chanlytics couldn't check which playbooks send it."
    : paused.length === 1
      ? ` ${quoted(paused)} is paused and sends it: if it resumes, its runs skip until it has another template.`
      : paused.length > 1
        ? ` ${quoted(paused)} are paused and send it: if they resume, their runs skip until they have another template.`
        : "";
  // The languages a running playbook sends this message in (a run sends its one
  // `template_language` to everyone on it, run-playbook.ts), and the first of them
  // WhatsApp does not hold approved: every run of that playbook is skipped until it
  // is. Null when the playbooks were not read.
  const sentIn =
    pbRows && gName
      ? [
          ...new Set(
            pbRows.filter((p) => p.template_name === gName && p.state === "running").map((p) => p.template_language),
          ),
        ]
      : null;
  const skipped = sentIn
    ? sentIn.find((id) => {
        const r = g.rows.find((x) => x.lang.id === id);
        return !r || !r.row || r.row.meta_status !== "approved";
      }) || null
    : null;
  const skippedAt = skipped ? g.rows.find((x) => x.lang.id === skipped) || null : null;
  const skippedMissing = !!skipped && !(skippedAt && skippedAt.row);
  return { gName, use, sent, sending, pausedWords, sentIn, skipped, skippedAt, skippedMissing };
}

type Usage = ReturnType<typeof usageOf>;

/** What the row says beside its title, and whether it asks for attention or stands quiet. */
export function marksOf(p: { g: TemplateGroup; row: TemplateDto | null; usage: Usage }) {
  const { g, row, usage } = p;
  const { use, sentIn, skipped, skippedAt, skippedMissing } = usage;
  // Marketing or not is a RULE, not a label: a marketing message may only go to
  // people who said yes to offers, so it rides the row as its own mark rather
  // than being discovered at send time. A starter declares its purpose; a row
  // carries Meta's own category.
  const offer = /market/i.test(String((row && row.category) || g.purpose || ""));
  // Said in words beside the title, once per MESSAGE, when a language of it is
  // not simply approved: "Spanish in review", "Spanish rejected". It was the state
  // of whichever language was in view, so a message half in review read as fine
  // until its other language was pressed. It is the ONE place a language rides the
  // closed row: the languages themselves are the open row's, where a message is
  // read and written, and where it came from (WhatsApp Manager) is its foot's.
  const flagged = g.rows
    .map(({ lang, row: r }) => {
      const said = r && r.meta_status !== "approved" ? tplSaid(r.meta_status) : null;
      return said ? { lang, said } : null;
    })
    .find(Boolean);
  const tag: { words: string; tone: string } | null = flagged
    ? { words: `${flagged.lang.label} ${flagged.said.label.toLowerCase()}`, tone: flagged.said.tone }
    : skipped && skippedMissing
      ? { words: `${skippedAt ? skippedAt.lang.label : tplLangLabel(skipped)} missing`, tone: "warn" }
      : null;
  // The row asks for attention when a language something sends is not one WhatsApp
  // holds approved: those sends are refused or skipped. A language nobody sends is
  // not that -- written or not, it holds nobody back -- and neither is a language in
  // review beside the approved one a playbook sends. Without the playbooks read, a
  // language on file that is not approved, on a message something sends. A message
  // nothing sends is the other way round -- quiet, its title dimmed -- because
  // nothing is happening with it at all.
  const refused = g.rows.some(({ row: r }) => r && r.meta_status !== "approved");
  const attn = sentIn ? !!skipped : !!(use && !use.unused && refused);
  const dim = !!(use && use.unused);
  return { offer, tag, attn, dim };
}

/**
 * A line of the words with its slots NAMED -- "Hi {first name} -- it's been a
 * while" -- in quotes, so a row reads as the message it is and shows at a glance
 * what varies per person. The whole of it, filled with this business's own
 * name and link, is in the fold.
 */
export function lineWords(p: {
  g: TemplateGroup;
  S: StarterLibrary;
  row: TemplateDto | null;
  starterText: StarterText | null;
  fromRow: PresentRow | null;
  view: string;
}): string {
  const { g, S, row, starterText, fromRow, view } = p;
  // A language nobody has written yet quotes the words it is being written from,
  // so the row still reads as the message while its new language is drafted.
  const lineRow = row || (!starterText && fromRow ? fromRow.row : null);
  const lineText = lineRow
    ? lineRow.body_preview || ""
    : starterText
      ? starterText.body
      : g.starter
        ? S.text(g.starter, "en_US").body
        : "";
  const tplLike =
    lineRow || (g.starter ? { name: g.starter.name, language: starterText ? view : "en_US", variables: [] } : null);
  const kinds = tplLike ? S.slotKinds(tplLike) : [];
  const labels = tplLike ? S.slotLabels(tplLike) : [];
  return tplOneLine(
    String(lineText || "").replace(
      /\{\{(\d+)\}\}/g,
      (_: string, n: string) => `{${tplSlotWord(kinds[Number(n) - 1], labels[Number(n) - 1], n)}}`,
    ),
  );
}
