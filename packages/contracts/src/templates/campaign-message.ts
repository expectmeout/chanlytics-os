/**
 * A campaign message, read once: what a broadcast or a playbook sends is a name in a language, and its versions are the
 * workspace's template rows of that name and language, one a channel (message-versions.ts). WhatsApp's is Meta's, with
 * Meta's status; an email's and a text's are written here and are approved the moment they are saved. A message needs no
 * WhatsApp version: any non-empty set of the three is a message, and each channel it is sent by needs only its own.
 *
 * This is the one reading of it, so every page, verb and send that asks "which version anchors it, which channels does
 * it hold, what is it for, how many values does it fill" gets one answer:
 *
 *  1. The input is the workspace's rows. A reach-out's email (a name of its own, edited in place) and a row on a channel
 *     a message has no version on (voice, Instagram) belong to no message.
 *  2. The anchor, which any campaign's `template_id` may point at, is the WhatsApp row if there is one, else the email,
 *     else the text.
 *  3. The slots are the WhatsApp row's `variables`, else the anchor's: the highest numbered slot a row names, or the
 *     slots it lists.
 *  4. The category is the WhatsApp row's, in any status: it is Meta's word, and it stands even when the row is
 *     waiting, refused or paused. With no WhatsApp row it is the category the own rows carry, the strictest of them:
 *     marketing beats utility, and a row with none is marketing, as the send reads it (consent purposeOfTemplate).
 *     The purpose is that category's. Nobody declares a custom message utility here: the door that files an email or a
 *     text decides the category it writes.
 *  5. A channel is held when the message can be sent on it now: WhatsApp when its row is approved and this product can
 *     put it on the wire whole (templateBlocked, of the WhatsApp row alone: an email's subject may carry a value, which
 *     the reader reads as "a heading that takes a value" on every row, and that is no reason to hold the email); email
 *     and text when the row exists. Whether the workspace is ready on a channel is channelsReady's, not this module's.
 *  6. The message is hidden when its anchor is, and offered when it is not hidden and holds at least one channel.
 *  7. A channel the message does not hold has one sentence for it (messageWhyNot), whichever page or verb says it.
 */
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { purposeOfTemplate, type AskedPurpose } from "../consent/consent";
import { TEMPLATE_STATUSES, type TemplateStatus } from "../shared/enums";
import {
  VERSION_CHANNEL_WORDS,
  isReachOutRow,
  versionsOf,
  type OwnVersionChannel,
  type VersionChannel,
} from "./message-versions";
import { refusedWords, templateBlocked } from "./template-parts";
import type { VariableLike } from "./template-slots";
import { templateTitle } from "./template-titles";

/**
 * A template row as a reader hands it down (apps/dashboard server/readers/templates.ts) or the database holds it: the
 * columns a message is read from. A row that carries `blocked` is believed (the reader worked it out where it still had
 * the components); one with only `components` is judged here (templateBlocked).
 */
export interface CampaignMessageRow {
  id: string;
  name: string;
  language: string;
  channel: string;
  meta_status?: string | null;
  category?: string | null;
  variables?: unknown;
  title?: string | null;
  hidden_at?: string | null;
  /** Meta's reason for a refusal, as its status update gave it. */
  rejected_reason?: string | null;
  blocked?: string | null;
  components?: unknown;
}

/** A message in one language, with its versions. */
export interface CampaignMessage {
  name: string;
  language: string;
  /** What the message is called for people: the anchor's title, else the starter's, else its name made words. */
  title: string;
  /** The version a campaign's `template_id` may point at (rule 2). */
  anchor: { id: string; channel: VersionChannel };
  /** How many numbered values the message fills; every version fills these and no others. */
  slots: number;
  /** Meta's word where the message has a WhatsApp row, else the strictest of the own rows' (rule 4); null is a row that said none. */
  category: string | null;
  /** What the message is, as a send judges a yes (consent purposeOfTemplate of the category). */
  purpose: AskedPurpose;
  /** The workspace hid it (the anchor's `hidden_at`). */
  hidden: boolean;
  /** A picker may list it: not hidden, and at least one channel held. */
  offered: boolean;
  versions: {
    /** WhatsApp's row with its standing: `blocked` is why this product cannot send it whole, `reason` why Meta refused it. */
    whatsapp: {
      id: string;
      status: TemplateStatus;
      hidden: boolean;
      blocked: string | null;
      reason: string | null;
    } | null;
    email: { id: string } | null;
    sms: { id: string } | null;
  };
}

/**
 * How many values a row's `variables` list names: the highest position it carries, or how many it lists. The one count
 * every version of a message is held to.
 */
function variablesSlotCount(variables: unknown): number {
  if (!Array.isArray(variables)) return 0;
  const positions = variables
    .map((v: VariableLike | null) => Number(v?.position))
    .filter((position) => Number.isFinite(position));
  return Math.max(variables.length, ...positions);
}

/** A row's status as the set holds it: a row that names none (or one the set does not know) is waiting, as the column's default is. */
function statusOf(raw: string | null | undefined): TemplateStatus {
  return TEMPLATE_STATUSES.find((s) => s === raw) ?? "pending";
}

/** The category of a message with no WhatsApp row (rule 4): marketing if any of its rows reads as an offer, else the one they share. */
function strictestCategory(categories: readonly (string | null)[]): string | null {
  if (categories.some((c) => purposeOfTemplate(c) === "marketing")) return "marketing";
  return categories.find((c) => c !== null) ?? null;
}

function whatsappVersionOf(row: CampaignMessageRow): NonNullable<CampaignMessage["versions"]["whatsapp"]> {
  const status = statusOf(row.meta_status);
  return {
    id: row.id,
    status,
    hidden: Boolean(row.hidden_at),
    blocked: templateBlocked(row),
    reason: status === "rejected" ? refusedWords(row.rejected_reason) : null,
  };
}

/** The message of these rows, which are of one name's and one language's (rule 1 drops the rest), or null where none is a version. */
function messageFrom(name: string, language: string, rows: readonly CampaignMessageRow[]): CampaignMessage | null {
  const {
    whatsapp: [w = null],
    email: [e = null],
    sms: [s = null],
  } = versionsOf(rows, name);
  const anchorRow = w ?? e ?? s;
  if (anchorRow === null) return null;
  const category = w ? (w.category ?? null) : strictestCategory([e, s].flatMap((r) => (r ? [r.category ?? null] : [])));
  const versions: CampaignMessage["versions"] = {
    whatsapp: w ? whatsappVersionOf(w) : null,
    email: e ? { id: e.id } : null,
    sms: s ? { id: s.id } : null,
  };
  const held = messageHolds({ versions });
  const hidden = Boolean(anchorRow.hidden_at);
  return {
    name,
    language,
    title: templateTitle(name, anchorRow.title),
    anchor: { id: anchorRow.id, channel: w ? "whatsapp" : e ? "email" : "sms" },
    slots: variablesSlotCount((w ?? anchorRow).variables),
    category,
    purpose: purposeOfTemplate(category),
    hidden,
    offered: !hidden && CONSENT_CHANNELS.some((c) => held[c]),
    versions,
  };
}

/**
 * The message of this name in this language among the workspace's rows, or null where it has no version. `rows` is every
 * row of the workspace, whatever its channel or name: the message is picked out of them (rules 1 and 2).
 */
export function campaignMessageOf(
  rows: readonly CampaignMessageRow[],
  name: string,
  language: string,
): CampaignMessage | null {
  return messageFrom(
    name,
    language,
    rows.filter((r) => r.language === language),
  );
}

/**
 * Every message the rows make, one a name and language, in the order each first appears in the rows: what a picker or the
 * Library lists, with a message that has no WhatsApp row among them.
 */
export function campaignMessagesOf(rows: readonly CampaignMessageRow[]): CampaignMessage[] {
  const groups = new Map<string, { name: string; language: string; rows: CampaignMessageRow[] }>();
  for (const r of rows) {
    if (isReachOutRow(r)) continue;
    const key = JSON.stringify([r.name, r.language]);
    const group = groups.get(key) ?? { name: r.name, language: r.language, rows: [] };
    group.rows.push(r);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((g) => {
    const message = messageFrom(g.name, g.language, g.rows);
    return message ? [message] : [];
  });
}

/**
 * The channels a message can be sent on now (rule 5): WhatsApp's row approved and whole, and a row of its own on email
 * and on text. It replaces the callers' own `versionsHeld(own, whatsapp)`.
 */
export function messageHolds(m: Pick<CampaignMessage, "versions">): Record<ConsentChannel, boolean> {
  const w = m.versions.whatsapp;
  return {
    whatsapp: w !== null && w.status === "approved" && w.blocked === null,
    email: m.versions.email !== null,
    sms: m.versions.sms !== null,
  };
}

/** What WhatsApp's standing says of a version that is not approved, in the owner's words. */
const NOT_APPROVED_WORDS: Record<Exclude<TemplateStatus, "approved">, string> = {
  pending: "WhatsApp is still reviewing this message's WhatsApp version.",
  rejected: "WhatsApp refused this message's WhatsApp version.",
  paused: "WhatsApp has paused this message's WhatsApp version.",
  disabled: "WhatsApp has disabled this message's WhatsApp version.",
};

/** What WhatsApp says when the message has no row there. */
const NO_WHATSAPP_VERSION_WORDS = "This message has no WhatsApp version.";

/** What an email or a text says when the message has no row there. */
const NO_OWN_VERSION_WORDS: Record<OwnVersionChannel, string> = {
  email: `This message has no ${VERSION_CHANNEL_WORDS.email.toLowerCase()} version yet.`,
  sms: `This message has no ${VERSION_CHANNEL_WORDS.sms.toLowerCase()} version yet.`,
};

/**
 * The sentence for a channel the message does not hold (rule 7), null for one it does: the one set of words a page, a
 * verb and Ask say it in. Whether the workspace is ready on the channel keeps its own reason, which wins over this
 * (core readyForMessage closes only a channel that is ready).
 */
export function messageWhyNot(m: Pick<CampaignMessage, "versions">, channel: ConsentChannel): string | null {
  if (messageHolds(m)[channel]) return null;
  if (channel !== "whatsapp") return NO_OWN_VERSION_WORDS[channel];
  const w = m.versions.whatsapp;
  if (w === null) return NO_WHATSAPP_VERSION_WORDS;
  if (w.status !== "approved") return NOT_APPROVED_WORDS[w.status];
  return w.blocked === null
    ? null
    : `This message's WhatsApp version has ${w.blocked}, so it cannot be sent from here.`;
}

/**
 * What the owner is told when a run stops before it sends a thing: the message's WhatsApp version is not one this product
 * can send now, and everyone on the run goes by WhatsApp (core sendBroadcastBatch; a run with anyone on email or text goes
 * on for them). It says why the version is held in the words messageWhyNot has for it, then what that left. A message the
 * workspace no longer holds a row of (null) has no WhatsApp version either.
 */
export function whatsappStoppedRunWords(m: Pick<CampaignMessage, "versions"> | null): string {
  const why = m === null ? null : messageWhyNot(m, "whatsapp");
  return `${why ?? NO_WHATSAPP_VERSION_WORDS} Everyone on this run goes by WhatsApp, so nothing was sent.`;
}
