/**
 * A message's other versions, as the Templates page reads them (One message, every channel, step 1): the email and text
 * rows of its name beside its WhatsApp rows, which channels it has, what an email or a text version says, and the words
 * a new one starts from. The rules are contracts' (message-versions.ts): this reads the rows the settings surface holds
 * and draws nothing.
 */
import {
  EMAIL_SUBJECT_MAX,
  VERSION_CHANNELS,
  VERSION_CHANNEL_WORDS,
  numberedSlots,
  smsVersionSegments,
  starterEmailText,
  starterSmsText,
  versionWords,
  versionsOf,
} from "@chanlytics/contracts";
import type { OwnVersionChannel, SlotSet, VersionChannel, VersionWords } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { PresentRow, TemplateGroup } from "./group";
import type { StarterLibrary } from "./verbs";
import { tplOwn } from "./words";

/** A message's rows on each channel: WhatsApp's are the message's own, the others are the workspace's email and text rows of its name. */
type MessageVersions = Record<VersionChannel, TemplateDto[]>;

/** The name the message's rows are filed under: the starter's, else its first WhatsApp row's; null for a message with no row. */
export function messageName(g: TemplateGroup): string | null {
  if (g.starter) return g.starter.name;
  const first = g.rows.find((r) => r.row);
  return first?.row ? first.row.name : null;
}

/** The message's versions among the rows read: its WhatsApp rows, and its email and text rows (a reach-out's are no message's). */
export function versionsOfMessage(g: TemplateGroup, versions: readonly TemplateDto[]): MessageVersions {
  const name = messageName(g);
  const own = name ? versionsOf(versions, name) : { whatsapp: [], email: [], sms: [] };
  return { ...own, whatsapp: g.rows.flatMap((r) => (r.row ? [r.row] : [])) };
}

/** The channels a message has a version on, said as a row says them: "WhatsApp · Email · Text"; null where it has none. */
export function channelsWords(has: MessageVersions): string | null {
  const words = VERSION_CHANNELS.filter((c) => has[c].length > 0).map((c) => VERSION_CHANNEL_WORDS[c]);
  return words.length ? words.join(" · ") : null;
}

/** A version on file as the version view needs it: which row it is, and the words it says. */
export interface VersionRow {
  id: string;
  words: VersionWords;
}

/**
 * What an email or text version row says: the words read back from it (contracts versionWords, which reads the
 * heading the templates read sends as an email's subject).
 */
export function versionRowOf(row: TemplateDto): VersionRow {
  return { id: row.id, words: versionWords(row) };
}

/**
 * Where writing a version starts, when none is on file: the starter's own words in the language, where the library wrote
 * it (never its English under another language's heading), else a copy of the WhatsApp words, an email under the
 * message's title as its subject.
 */
export function startingWords(p: {
  channel: OwnVersionChannel;
  g: TemplateGroup;
  language: string;
  whatsapp: string;
}): VersionWords {
  const { channel, g, language, whatsapp } = p;
  const s = g.starter;
  if (channel === "email") {
    const own = s && s.email && s.email[language] ? starterEmailText(s, language) : null;
    return own
      ? { subject: own.subject, body: own.body }
      : { subject: g.title.slice(0, EMAIL_SUBJECT_MAX), body: whatsapp };
  }
  const own = s && s.sms && s.sms[language] ? starterSmsText(s, language) : null;
  return { subject: null, body: own ? own.body : whatsapp };
}

/**
 * Whether the message is an offer, which texts never carry: a starter's own kind, else the category of the row in view
 * (or, with none in that language, of one it has), else what it says it is for.
 */
export function isOffer(g: TemplateGroup, row: TemplateDto | null, present: readonly PresentRow[]): boolean {
  if (g.starter) return g.starter.category === "marketing";
  const category = (row ?? present[0]?.row)?.category;
  return /market/i.test(String(category || g.purpose || ""));
}

/**
 * What a version of the message in this language is filled from, whichever channel it is on: its slots, numbered and
 * called what each is (the starter's, or the labels the WhatsApp row was filed with), and the example that fills each in
 * a preview, which is the WhatsApp preview's own (`values`: the row's or the starter's, this business's name and link in
 * the slots that name them), or another language's where this one has none.
 */
export function versionFills(p: {
  g: TemplateGroup;
  S: StarterLibrary;
  present: readonly PresentRow[];
  row: TemplateDto | null;
  view: string;
  values: string[] | null;
}): { slots: SlotSet; values: string[] } {
  const { g, S, present, row, view, values } = p;
  const filed = row ?? present[0]?.row ?? null;
  const like = filed ?? (g.starter ? { name: g.starter.name, language: view, variables: [] } : null);
  const first = present[0];
  return {
    slots: numberedSlots(like ? S.slotLabels(like) : []),
    values: values ?? (first ? S.rowValues(first.row, tplOwn()) : []),
  };
}

/** What a text comes to on the wire, the STOP line the sender adds included, in characters and parts (contracts' count). */
export function textCount(body: string, language: string): { chars: number; parts: number } {
  const sent = smsVersionSegments(body, language);
  return { chars: sent.chars, parts: sent.segments };
}
