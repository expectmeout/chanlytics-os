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
 *     slots it lists (variablesSlotCount, which the db's own reading of a message's slots is too).
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
 *  7. A channel the message does not hold has one sentence for it (messageWhyNot; noVersionWords, which it is built on,
 *     where a preview or a card has the channel and no message), whichever page or verb says it, and the workspace's
 *     channels with the message in them are one reading (readyForMessage: a channel it is ready on but the message has
 *     no version on is closed, in that sentence).
 *  8. Where one language of it stands on each channel has one set of words, the Library's (messageStandingWords).
 *  9. What a campaign's page, route and Ask say of a message whose WhatsApp version is not one a send can use has one
 *     set of words too (messageWhyNot, whatsappStoppedRunWords, MESSAGE_GONE_WORDS, RUN_NOW_WITHOUT_VERSION_WORDS,
 *     STARTER_LINE_WORDS): each says the WhatsApp version where it means that one, and names no template.
 * 10. The title is the first non-blank one its WhatsApp, email or text version carries, in that order, else the
 *     starter's, else the name made words: not the anchor's alone, so a title written with the first email version stays
 *     when a WhatsApp row with none comes.
 */
import { CONSENT_CHANNELS, type ConsentChannel } from "../consent/consent-channels";
import { purposeOfTemplate, type AskedPurpose } from "../consent/consent";
import { TEMPLATE_STATUSES, type TemplateStatus } from "../shared/enums";
import type { ChannelsReady } from "../broadcasts/reach-for";
import { CAMPAIGN_ROOMS } from "../shell/campaign-rooms";
import {
  VERSION_CHANNEL_WORDS,
  isReachOutRow,
  noVersionWords,
  versionsOf,
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
  /** What the message is called for people: the first title its WhatsApp, email or text version carries, else the starter's, else its name made words. */
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
 * every version of a message is held to, which the db reads a message's slots by too.
 */
export function variablesSlotCount(variables: unknown): number {
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
  // The title is the message's, not the anchor's: one written with the first email version stays once a WhatsApp row of
  // no title comes, and a row's blank title says none.
  const titled = [w, e, s].map((r) => r?.title ?? null).find((t) => t !== null && t.trim() !== "") ?? null;
  return {
    name,
    language,
    title: templateTitle(name, titled),
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

/**
 * The sentence for a channel the message does not hold (rule 7), null for one it does: the one set of words a page, a
 * verb and Ask say it in. Whether the workspace is ready on the channel keeps its own reason, which wins over this
 * (readyForMessage, below, closes only a channel that is ready).
 */
export function messageWhyNot(m: Pick<CampaignMessage, "versions">, channel: ConsentChannel): string | null {
  if (messageHolds(m)[channel]) return null;
  const w = m.versions.whatsapp;
  if (channel !== "whatsapp" || w === null) return noVersionWords(channel);
  if (w.status !== "approved") return NOT_APPROVED_WORDS[w.status];
  return w.blocked === null
    ? null
    : `This message's WhatsApp version has ${w.blocked}, so it cannot be sent from here.`;
}

/** A message the workspace holds no row of (it was deleted): it holds nothing, and says so on every channel. */
const HOLDS_NOTHING: Pick<CampaignMessage, "versions"> = { versions: { whatsapp: null, email: null, sms: null } };

/**
 * The workspace's channels with the message in them: a channel the workspace is ready on whose version the message does
 * not hold is not ready, and says so in the message's own sentence for it (messageWhyNot: "This message has no email
 * version yet.", "WhatsApp is still reviewing this message's WhatsApp version."), so every reader of "can this go by
 * email" asks one answer, and `reachFor` never enrols a person on a channel the message cannot be said on. A channel the
 * workspace is not ready on keeps its own reason, and what else it carries stays (email's `offers`, which the news by email
 * and an offer are judged by: closing the channel for a missing version must not make it say the campaigns domain is
 * missing). The workspace's pause is the workspace's, not the message's, and rides through. `null` is a message the
 * workspace no longer holds; a page with no message in view yet hands its own stand-in (the pages' CM_NO_MESSAGE_YET).
 */
export function readyForMessage(
  ready: ChannelsReady,
  message: Pick<CampaignMessage, "versions"> | null,
): ChannelsReady {
  const out: ChannelsReady = { ...ready };
  for (const c of CONSENT_CHANNELS) {
    const why = messageWhyNot(message ?? HOLDS_NOTHING, c);
    if (ready[c].ready && why !== null) out[c] = { ...ready[c], ready: false, why };
  }
  return out;
}

/**
 * What WhatsApp's standing says of a version, as the word that follows its channel ("WhatsApp · in review"). They are the
 * pill's own words for a template (tone.ts) in lower case, but for a refusal, which every sentence here says as refused.
 */
const WHATSAPP_STANDING_WORDS: Record<TemplateStatus, string> = {
  approved: "approved",
  pending: "in review",
  rejected: "refused",
  paused: "paused",
  disabled: "disabled",
};

/**
 * Where one language of a message stands on each channel, in the words the Library says it in (rule 8): its email and its
 * text are "ready" the moment they are written, its WhatsApp version is where WhatsApp has it ("in review", "refused"), and
 * a channel with no version in the language says so ("WhatsApp · not added", "Email · not written"). A text of an offer
 * can never be written, and says that. Null is a language the message has no version in at all.
 */
export function messageStandingWords(
  m: Pick<CampaignMessage, "versions" | "purpose"> | null,
): Record<VersionChannel, string> {
  const at = (channel: VersionChannel, word: string): string => `${VERSION_CHANNEL_WORDS[channel]} · ${word}`;
  const w = m?.versions.whatsapp ?? null;
  return {
    whatsapp: at("whatsapp", w ? WHATSAPP_STANDING_WORDS[w.status] : "not added"),
    email: at("email", m?.versions.email ? "ready" : "not written"),
    sms: at("sms", m?.versions.sms ? "ready" : m?.purpose === "marketing" ? "not for offers" : "not written"),
  };
}

/**
 * What the owner is told when a run stops before it sends a thing: the message's WhatsApp version is not one this product
 * can send now, and everyone on the run goes by WhatsApp (core sendBroadcastBatch; a run with anyone on email or text goes
 * on for them). It says why the version is held in the words messageWhyNot has for it, then what that left. A message the
 * workspace no longer holds a row of (null) has no WhatsApp version either.
 */
export function whatsappStoppedRunWords(m: Pick<CampaignMessage, "versions"> | null): string {
  const why = m === null ? null : messageWhyNot(m, "whatsapp");
  return `${why ?? noVersionWords("whatsapp")} Everyone on this run goes by WhatsApp, so nothing was sent.`;
}

/** What a playbook says of a message none of whose versions a run can send: true on every channel, not WhatsApp's alone. */
const NO_RUN_VERSION_WORDS = "has no version its runs can send";

/**
 * What a playbook says when the message it sends is no longer one a run can send (the workspace removed it, or every
 * version it held is withdrawn or cannot be sent whole): on its card, where its runs are skipped until it holds a
 * version again, and in the composer of the playbook, which is never moved to another message behind its owner's back.
 */
export const MESSAGE_GONE_WORDS = {
  card: `Its message ${NO_RUN_VERSION_WORDS}, so they are skipped until it has one again or the campaign sends another.`,
  composer: (title: string): string =>
    `Its message, ${title}, ${NO_RUN_VERSION_WORDS} any more. Pick another to save a change.`,
} as const;

/**
 * What Run now says of a playbook that goes by WhatsApp when nobody it would reach goes by email or text and its message
 * holds no WhatsApp version a run can send (core run-playbook's stop, stored as `template_not_approved`, whose name is a
 * closed set and stays): what would carry it is another message, or another version of this one on a channel it ticks.
 */
export const RUN_NOW_WITHOUT_VERSION_WORDS =
  "Its message has no WhatsApp version a run can send, and nobody it would reach goes by email or text. Pick another message, or give this one an email or a text version and tick it on the campaign.";

/**
 * What the lines that offer a moment's own message say while it waits on WhatsApp (the send screen with nothing to send,
 * the playbook composer with the moment's starter not yet a message a run can send). Only its WhatsApp version is in
 * review or refused: an email or a text of it is ready the moment it is written, and the starter set writes those at once.
 */
export const STARTER_LINE_WORDS = {
  /** The send screen, with no message it can send yet: how many starters' WhatsApp versions WhatsApp is still reviewing. */
  reviewing: (n: number): string =>
    `Your starter messages' WhatsApp versions are in review (${n}) — they appear here once approved, usually within minutes.`,
  /** The playbook composer, after the moment's own message and a comma: where its WhatsApp version stands. */
  standing: (status: string | null | undefined): string => {
    const at = statusOf(status);
    return at === "pending"
      ? "has its WhatsApp version in review — it appears here once approved, usually within minutes."
      : `has its WhatsApp version ${WHATSAPP_STANDING_WORDS[at]} — see ${CAMPAIGN_ROOMS.home} › ${CAMPAIGN_ROOMS.library}.`;
  },
  /**
   * The link that adds the moment's own message: its email and text versions at once, a WhatsApp version where a number
   * is, which the line says once it is in review (`standing`). The link was the whole of that, in 25 words.
   */
  add: "Add it",
} as const;

/**
 * What the route that writes a message's first version (an email or a text, with no WhatsApp row) says when it refuses
 * one, or cannot write it. A message a member writes is an offer or news (rule 4): only a starter of the registry, which
 * Chanlytics itself writes, is about their own visit or proposal, so no one declares a custom message utility, and a
 * starter's name begins only as the starter, with its own words: the member's words under a starter's category would be
 * a custom message called a visit's. The door that files it (create_message_version, 00343) is a migration the owner
 * applies, and until it is on a database the route says so in one sentence and nothing else changes.
 */
export const MESSAGE_BEGIN_WORDS = {
  customIsAnOffer:
    "A message you write is an offer or news. Only a starter is a reminder, a check after or a follow-up.",
  starterNeedsItsOwnWords:
    "A starter begins with its own words. Add the starter set, then change the words in the Library.",
  doorNotSwitchedOn: "Writing a message with no WhatsApp version is not switched on here yet.",
} as const;
