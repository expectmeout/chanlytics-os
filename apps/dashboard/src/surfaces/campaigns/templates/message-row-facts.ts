/**
 * What one message's row knows before it draws (moved from MessageRow in legacy/pages/messages.jsx, decision 0015):
 * which language is in view and what is written in it, what its words are, what sends it and how much of it went out,
 * the mark it wears and whether it asks for attention. Each is a plain function over the row's group and its state; the
 * two that read a surface (`usageOf`) read what the surface holds now, as the JSX read `window.__TEMPLATE_USE`,
 * `__TEMPLATE_SENT` and `__PLAYBOOKS` with no surface argument.
 */
import {
  CHANNEL_WORDS,
  channelChoices,
  messageHolds,
  messageStandingWords,
  messageWhyNot,
  NUMBERED_SLOT,
  readyForMessage,
} from "@chanlytics/contracts";
import type { CampaignMessage, TemplateSentWords } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import { surfaceValue } from "../../surface-values";
import { onFileOf } from "./group";
import type { PresentRow, TemplateGroup, TemplateRow, TplLang } from "./group";
import type { StarterLibrary } from "./verbs";
import { channelsWords, messageName, purposeOfMessage, versionsOfMessage } from "./versions";
import { TPL_LIST_WORDS, tplLangLabel, tplOneLine, tplOwn, tplSaid, tplSampleWord } from "./words";

/**
 * The first language a message has on file, else the set's first: where a row opens. The first WhatsApp holds, as it
 * always was, and for a message WhatsApp holds none of, the first it has a version in on any channel.
 */
function firstLang(present: readonly TemplateRow[], onFile: readonly TemplateRow[], langs: readonly TplLang[]): string {
  const first = present[0] ?? onFile[0];
  return first ? first.lang.id : langs[0] ? langs[0].id : "en_US";
}

/**
 * Where a language stands, for the glyph and the picker's state: WhatsApp's status where WhatsApp holds it, "approved" for
 * one written as an email or a text alone (an own version is approved the moment it is saved), null for none.
 */
export const languageStatus = (r: TemplateRow): string | null =>
  r.row ? r.row.meta_status : r.message ? "approved" : null;

interface LanguageInput {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  canAdd: boolean;
  present: PresentRow[];
  onFile: TemplateRow[];
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
function languageFacts(p: LanguageInput) {
  const { g, langs, S, canAdd, present, onFile, langId, back, adding, sentLang } = p;
  // The language in view: the one picked while it is on file (on any channel), written by the
  // library, being written or just sent; otherwise the message's first.
  const known = (id: string) =>
    onFile.some((r) => r.lang.id === id) || !!(g.starter && g.starter.texts && g.starter.texts[id]);
  const view = known(langId) || langId === adding || langId === sentLang ? langId : firstLang(present, onFile, langs);
  // Any language WhatsApp takes, not only one of the message's own: a new one has
  // no version and no library words until it is written.
  const cur: TemplateRow = g.rows.find((r) => r.lang.id === view) || {
    lang: { id: view, label: tplLangLabel(view) },
    row: null,
    message: null,
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
  return { view, cur, row, message: cur.message, written, starterText, fromRow, source, untranslatable, mayAdd };
}

type StarterText = ReturnType<StarterLibrary["text"]>;

/** The words in view: the body with its slots still in it, what fills them, and the line under them. */
function rowWords(p: {
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
function usageOf(p: { g: TemplateGroup; row: TemplateDto | null }) {
  const { g, row } = p;
  const settings = surfaceValue("settings");
  const playbooks = surfaceValue("playbooks");
  // What sends this MESSAGE, in the words the bridge composed: the playbooks,
  // the broadcasts a person sent and the Inbox's booking template, joined on the
  // server. Keyed by name, because a message is one thing in several languages.
  // Null: the usage was not read, and the row says nothing rather than guessing.
  const gName = messageName(g);
  const useMap = settings ? settings.templateUse : null;
  const use = gName && useMap ? useMap[gName] || null : null;
  // How many of it went out and when the latest did, in the words the bridge
  // composed: the people a run SENT to and what the Inbox sent on it, never the
  // audience a run was scheduled for. Keyed by name like the usage; null is not read.
  // A starter with no version has no entry -- the map is one per message ON FILE -- and says
  // nothing: it is there to use, and nothing about it is missing (it said "Not added").
  const sentMap = settings ? settings.templateSent : null;
  const sent: TemplateSentWords | null = gName && sentMap ? sentMap[gName] || null : null;
  // The playbooks that send the template in view, found the way a run finds it: by name and language. Null: not read.
  // Per ROW, not per message: this is what a delete of ONE language must refuse on.
  const pbRows = playbooks ? playbooks.rows || [] : null;
  const users =
    row && pbRows ? pbRows.filter((p) => p.template_name === row.name && p.template_language === row.language) : [];
  // Sending is the one rule's (each card's `runs`, contracts campaignRunsOn, made again each minute): a campaign past its last
  // day, or whose moment runs nothing here, sends it on no day to come, and is neither sending nor paused (the wiring's second
  // audit, S1-3). Paused is its state.
  const sending = users.filter((p) => p.runs).map((p) => p.name);
  const paused = users.filter((p) => p.state === "paused").map((p) => p.name);
  const quoted = (names: string[]) => names.map((n) => `“${n}”`).join(", ");
  const pausedWords = !pbRows
    ? " Chanlytics couldn't check which campaigns send it."
    : paused.length === 1
      ? ` ${quoted(paused)} is paused and sends it: if it resumes, its runs skip until it has another template.`
      : paused.length > 1
        ? ` ${quoted(paused)} are paused and send it: if they resume, their runs skip until they have another template.`
        : "";
  // The languages a running playbook sends this message in (a run sends its one
  // `template_language` to everyone on it, run-playbook.ts), and the first of them
  // the message holds on no channel (WhatsApp's version not approved, and no email or text beside it): every run of
  // that playbook is skipped until it does. Null when the playbooks were not read.
  const sentIn =
    pbRows && gName
      ? [...new Set(pbRows.filter((p) => p.template_name === gName && p.runs).map((p) => p.template_language))]
      : null;
  const skipped = sentIn
    ? sentIn.find((id) => {
        const m = g.rows.find((x) => x.lang.id === id)?.message;
        return !m || !Object.values(messageHolds(m)).some(Boolean);
      }) || null
    : null;
  const skippedAt = skipped ? g.rows.find((x) => x.lang.id === skipped) || null : null;
  const skippedMissing = !!skipped && !(skippedAt && (skippedAt.row || skippedAt.message));
  return { gName, use, sent, sending, pausedWords, sentIn, skipped, skippedAt, skippedMissing };
}

type Usage = ReturnType<typeof usageOf>;

/** What the row says beside its title, and whether it asks for attention or stands quiet. */
function marksOf(p: { g: TemplateGroup; message: CampaignMessage | null; usage: Usage }) {
  const { g, message, usage } = p;
  const { use, sentIn, skipped, skippedAt, skippedMissing } = usage;
  // Marketing or not is a RULE, not a label: a marketing message may only go to
  // people who said yes to offers, so it rides the row as its own mark rather
  // than being discovered at send time. It is the message's purpose (contracts rule 4: Meta's category where there is
  // a WhatsApp version, else the category its own versions were filed with); a starter not on file declares its own.
  const offer = purposeOfMessage(g, message) === "marketing";
  // Said in words beside the title, once per MESSAGE, when a language of it is
  // not simply approved: "Spanish in review", "Spanish rejected". It was the state
  // of whichever language was in view, so a message half in review read as fine
  // until its other language was pressed. It is the ONE place a language rides the
  // closed row: the languages themselves are the open row's, where a message is
  // read and written, and where it came from (WhatsApp Manager) is its foot's.
  const flagged = g.rows
    .map(({ lang, row: r }) => {
      const standing = r && r.meta_status !== "approved" ? tplSaid(r.meta_status) : null;
      return r && standing ? { lang, standing, words: TPL_LIST_WORDS.standing[r.meta_status] ?? standing.label } : null;
    })
    .find(Boolean);
  const several = g.rows.filter(({ row: r }) => r).length > 1;
  const tag: { words: string; tone: string } | null = flagged
    ? {
        words: several ? `${flagged.lang.label}: ${flagged.words.toLowerCase()}` : flagged.words,
        // What needs the owner is amber, as every "needs you" is: red is for what failed.
        tone: flagged.standing.tone === "danger" ? "warn" : flagged.standing.tone,
      }
    : skipped && skippedMissing
      ? { words: `${skippedAt ? skippedAt.lang.label : tplLangLabel(skipped)} missing`, tone: "warn" }
      : null;
  // The row asks for attention when a language something sends is not one WhatsApp
  // holds approved: those sends are refused or skipped. (A language of a message with no WhatsApp version says nothing
  // of WhatsApp: only its tag, above, names one WhatsApp has.) A language nobody sends is
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

/** Which language of a message is in view, and where Cancel goes back to: what the open message's pane keeps. */
interface LangView {
  langId: string;
  back: string | null;
  adding: string | null;
  sentLang: string | null;
}

const presentOf = (g: TemplateGroup): PresentRow[] => g.rows.filter((r): r is PresentRow => !!r.row);

/** Where a message opens: on the first language it has a version in, nothing being written. */
export const firstView = (g: TemplateGroup, langs: readonly TplLang[]): LangView => ({
  langId: firstLang(presentOf(g), onFileOf(g), langs),
  back: null,
  adding: null,
  sentLang: null,
});

interface FactsInput {
  g: TemplateGroup;
  langs: readonly TplLang[];
  S: StarterLibrary;
  view: LangView;
  /** Whether this member may add a language, and why not: the open message's (a row has no use for either). */
  canAdd?: boolean;
  addWhy?: string | null;
  /** The workspace's email and text rows, from which the message's own are found: none where the page has read none. */
  versions?: readonly TemplateDto[];
}

/**
 * What a message's row and the pane it opens both read, worked out from its group and the language in view: the
 * language's facts, the words in it, the one line of them, what sends it and how much went out, the marks it wears,
 * the note a refused language carries, and its versions: its rows on each channel, which channels they say, and where
 * the language in view stands on each (contracts messageStandingWords). The row reads it for the language it opens on;
 * the pane for the one picked.
 */
export function messageFacts({ g, langs, S, view, canAdd = false, addWhy = null, versions = [] }: FactsInput) {
  const present = presentOf(g);
  const onFile = onFileOf(g);
  const lang = languageFacts({ g, langs, S, canAdd, present, onFile, ...view });
  const { row, message, starterText, fromRow, untranslatable } = lang;
  const has = versionsOfMessage(g, versions);
  const words = rowWords({ g, S, row, starterText, view: lang.view });
  // What sends it is found by its name and language, which every version shares: a message with no WhatsApp version is
  // found by its email's or its text's.
  const named = row ?? [...has.email, ...has.sms].find((r) => r.language === lang.view) ?? null;
  const usage = usageOf({ g, row: named });
  const marks = marksOf({ g, message, usage });
  const own = [...has.email, ...has.sms];
  const line = lineWords({ g, S, row, starterText, fromRow, view: lang.view, own });
  const note =
    addWhy ||
    (untranslatable
      ? `Chanlytics can’t write this one in another language: ${untranslatable}. Add its other languages in WhatsApp Manager.`
      : null);
  // Where the language in view stands on each channel; a language the message has no version in says none, and that a
  // text of an offer can never be written.
  const standing = messageStandingWords(
    message ?? { versions: { whatsapp: null, email: null, sms: null }, purpose: purposeOfMessage(g, null) },
  );
  return { present, onFile, lang, words, usage, marks, line, note, has, channels: channelsWords(has), standing };
}

/**
 * A line of the words as one person would get them -- "Hi Dana, a reminder of your visit tomorrow at 2:00 PM" -- in
 * quotes, so a row reads as the message it is: each value by its sample, the business's own name and link where it has
 * given them, and plain words for one it has not (words.ts tplSampleWord). It named its slots in braces ("Hi {first
 * name}"), which is our notation and nobody's message (the clean list, 13 Nov 2026). What varies per person is marked
 * in the pane, where the whole of it is.
 */
function lineWords(p: {
  g: TemplateGroup;
  S: StarterLibrary;
  row: TemplateDto | null;
  starterText: StarterText | null;
  fromRow: PresentRow | null;
  view: string;
  /** The message's email and text rows: a message with no WhatsApp version quotes the words it has. */
  own: readonly TemplateDto[];
}): string {
  const { g, S, row, starterText, fromRow, view, own } = p;
  // A language nobody has written yet quotes the words it is being written from,
  // so the row still reads as the message while its new language is drafted. A message
  // WhatsApp holds no version of quotes its email's or its text's, in this language where it has one.
  const lineRow =
    row ||
    (!starterText && fromRow ? fromRow.row : null) ||
    (!starterText ? (own.find((r) => r.language === view) ?? own[0] ?? null) : null);
  const lineText = lineRow
    ? lineRow.body_preview || ""
    : starterText
      ? starterText.body
      : g.starter
        ? S.text(g.starter, "en_US").body
        : "";
  const from = starterText ? view : "en_US";
  const tplLike = lineRow || (g.starter ? { name: g.starter.name, language: from, variables: [] } : null);
  const kinds = tplLike ? S.slotKinds(tplLike) : [];
  const business = tplOwn();
  const values = lineRow
    ? S.rowValues(lineRow, business)
    : g.starter
      ? S.starterValues(g.starter, from, business.business_name, business.booking_link)
      : [];
  return tplOneLine(
    String(lineText || "").replace(NUMBERED_SLOT, (_: string, n: string) =>
      tplSampleWord(values[Number(n) - 1], kinds[Number(n) - 1]),
    ),
  );
}

/**
 * Where a message stands in the list (Messages, the canvas of 10 Nov 2026; the clean list, 13 Nov 2026): it needs you
 * (WhatsApp said no to it, paused it or turned it off, or a running sequence sends a language it cannot send: each with
 * one press that mends it), something sends it (a step that runs, or the Inbox's booking), it is the business's own and
 * nothing sends it now, it is a starter nothing sends (ready-made, there to use), or it was put away. One reading, for
 * its row and for its pane's head.
 */
export type MessagePlace = "need" | "going" | "idle" | "made" | "away";

/** A message as the list sets it: where it stands, the line under its name, and what stands at its right. */
export interface MessageSetting {
  place: MessagePlace;
  /** The line under its name: why it needs you, what sends it, or what it is for. */
  said: string;
  /** That line says what sends it (the row's "what sends it", which a test finds by its id). */
  saysUse: boolean;
  /** At its right: how many went out, or when the last did; null for nothing. */
  aside: string | null;
  /**
   * Something sends it and no channel can carry it here yet: it waits, with a quiet word, and is never "Needs you" (there
   * is nothing on this page to press for it). Each channel's tab in its pane says its own why.
   */
  waiting: boolean;
  /**
   * Not a row of the list: made in WhatsApp's own tools in a shape this product cannot send whole, with nothing else
   * written for it and nothing sending it (Ruben, 13 Nov 2026). Its address still opens it.
   */
  unlisted: boolean;
}

type Facts = ReturnType<typeof messageFacts>;

/** WhatsApp's states that stop a version for good until someone acts: refused, paused, turned off. */
const STOPPED: ReadonlySet<string> = new Set(["rejected", "paused", "disabled"]);

/** The language the message has on file but put away: its WhatsApp row's, else its message's. */
const isAway = (r: TemplateRow): boolean => (r.message ? r.message.hidden : !!r.row?.hidden_at);

/** Who a message is about, as the channel rules read it: an offer is the business's news, a note is theirs. */
export const aboutOfMessage = (message: Pick<CampaignMessage, "purpose">): "ours" | "theirs" =>
  message.purpose === "marketing" ? "ours" : "theirs";

/**
 * Whether no channel can carry a message here now: every channel refused for it (contracts channelChoices over what the
 * message holds on each, readyForMessage: Meta's pause on offers to US numbers, email not set up for offers, no texting
 * line, a version not written or not approved). Never where the business's channels were not read (the sequences' read),
 * nor where it has an email and email could not be asked about just now: a question nobody answered is not a no, and
 * says nothing.
 */
function nothingCarries(message: CampaignMessage | null): boolean {
  const ready = surfaceValue("playbooks")?.ready ?? null;
  if (!ready || !message) return false;
  // A WhatsApp version WhatsApp is reviewing is read as the approved one it will be: what would hold it after (Meta's
  // pause on offers) still holds it.
  const whatsapp = message.versions.whatsapp;
  const judged =
    whatsapp && whatsapp.status === "pending"
      ? { ...message, versions: { ...message.versions, whatsapp: { ...whatsapp, status: "approved" as const } } }
      : message;
  const choices = channelChoices(readyForMessage(ready, judged), message.purpose, aboutOfMessage(message));
  if (choices.some((c) => c.ok)) return false;
  const unasked =
    !!message.versions.email &&
    (!!ready.email.unchecked || choices.some((c) => c.channel === "email" && c.why === CHANNEL_WORDS.unchecked));
  return !unasked;
}

/** It has only a WhatsApp version this product cannot send whole (made in WhatsApp's own tools), in every language on file. */
function onlyUnsendable(group: TemplateGroup): boolean {
  const onFile = onFileOf(group);
  return (
    !group.starter &&
    onFile.length > 0 &&
    onFile.every((r) => {
      const has = r.message?.versions;
      return !!has?.whatsapp?.blocked && !has.email && !has.sms;
    })
  );
}

/** WhatsApp stopped it, a running sequence sends a language it lacks, or a version it cannot send whole: why, or null. */
function stoppedWords(group: TemplateGroup, facts: Facts): string | null {
  for (const r of group.rows) {
    const w = r.message?.versions.whatsapp ?? null;
    if (r.message && w && !w.hidden && STOPPED.has(w.status)) return w.reason ?? messageWhyNot(r.message, "whatsapp");
  }
  const { usage, marks } = facts;
  if (marks.attn && usage.skipped)
    return TPL_LIST_WORDS.sendsMissing(usage.skippedAt ? usage.skippedAt.lang.label : tplLangLabel(usage.skipped));
  // A version this product cannot send whole needs you only where something sends it.
  const sends = !!(usage.use && (usage.use.running || usage.use.booking));
  const blocked = sends ? group.rows.find((r) => r.message?.versions.whatsapp?.blocked) : undefined;
  return blocked?.message ? messageWhyNot(blocked.message, "whatsapp") : null;
}

/** What sends it, as its row and its pane say it: the sequences, the one-offs and the Inbox, and what they are doing. */
export const sentByWords = (use: { words: string; note: string | null }): string =>
  use.note ? `${use.words} · ${use.note}` : use.words;

/**
 * What a message nothing sends now says under its name: what last sent it, what a starter is for, or its own first
 * words. Never a channel's reason: why a version cannot go is its tab's to say, in its pane.
 */
function idleWords(g: TemplateGroup, facts: Facts): { said: string; saysUse: boolean } {
  const use = facts.usage.use;
  if (use && !use.unused) return { said: sentByWords(use), saysUse: true };
  if (g.starter) return { said: g.purpose.charAt(0).toUpperCase() + g.purpose.slice(1), saysUse: false };
  return { said: facts.line ? `“${facts.line}”` : g.purpose, saysUse: false };
}

/** What stands at a row's right: how many went out, of one something sends; when the last did, of one nothing does. */
function asideOf(place: MessagePlace, sent: Facts["usage"]["sent"]): string | null {
  if (place === "need" || !sent) return null;
  if (place === "going") return sent.count ? TPL_LIST_WORDS.sentCount(sent.count) : TPL_LIST_WORDS.notSentYet;
  if (sent.count) return sent.when ? TPL_LIST_WORDS.sentWhen(sent.when) : TPL_LIST_WORDS.sentCount(sent.count);
  // One on file that never went out says nothing more than its line.
  return null;
}

/** Where a message stands, and what its row says of it. */
export function placeOfMessage(group: TemplateGroup, facts: Facts): MessageSetting {
  const onFile = onFileOf(group);
  const away = onFile.length > 0 && onFile.every(isAway);
  const need = away ? null : stoppedWords(group, facts);
  const use = facts.usage.use;
  const sends = !!(use && (use.running || use.booking));
  // A starter nothing has ever named is ready-made; one a sequence of theirs names, running or not, is the business's own.
  const readyMade = !!group.starter && (!use || use.unused);
  const place: MessagePlace = away ? "away" : need ? "need" : sends ? "going" : readyMade ? "made" : "idle";
  const line =
    place === "need"
      ? { said: need ?? "", saysUse: false }
      : place === "going" && use
        ? { said: sentByWords(use), saysUse: true }
        : idleWords(group, facts);
  return {
    place,
    ...line,
    aside: asideOf(place, facts.usage.sent),
    waiting: place === "going" && nothingCarries(facts.lang.message),
    unlisted: place === "idle" && onlyUnsendable(group),
  };
}
