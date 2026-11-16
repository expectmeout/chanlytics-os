/**
 * A warning closes when the news that mends it is kept (the wiring's second audit, W-channel-team-plus-4).
 *
 * The bell keeps the bad news and the good: a number flagged and back to normal, a messaging limit lowered and raised, an
 * account review rejected and approved, a message refused and approved, a mailbox held or signed out and sending again, the
 * receptionist paused and back, a payment that did not go through and a paid invoice, a Business Profile or a calendar
 * link that stopped working and works again (R11 S11-4). The good news was kept and the warning
 * beside it stayed unread and amber for ever. Each pair is said here once: the warning by its kind and title, and what mends
 * it (a kind and title the edge keeps after it, or a change the edge records). The edge closes the warning when its mend is
 * kept (notify.ts mendWarnings, through packages/db closeNoticesByTitle), and the offers pause is closed in SQL by the resume
 * (00421), listed here so a test holds the SQL's title to these words.
 *
 * Titles are matched here, never in SQL, so the rule stays in one place.
 */
import { OFFERS_NOTICE_WORDS } from "../campaigns/broadcasts/email-offers";
import { TEMPLATE_NOTICE_TITLES, TEMPLATE_STATUS_WORDS } from "../campaigns/templates/templates";
import { CALENDAR_UNREADABLE_WORDS, GOOGLE_SYNC_NOTICE_WORDS, NUMBER_FLAG_TITLES } from "../notices/connection-news";
import type { ServerNotificationKind } from "../today/notifications/feed-input";

/** A change the edge records that mends a warning, where no row of good news is kept for it. */
export type MendChange =
  | "billing.paid"
  | "mailbox.offers_resumed"
  | "mailbox_connection.resumed"
  | "mailbox_connection.connected"
  | "mailbox_connection.removed"
  | "google_connection.synced"
  | "google_connection.removed"
  | "calendar.readable";

/** What mends a warning: a kind and title kept after it, or a change. */
export type MendBy = { kind: ServerNotificationKind; title: RegExp } | { change: MendChange };

/** One warning and what mends it; `sameSubject` where the two are about one thing (a domain, a template). */
export interface NoticeMend {
  warns: { kind: ServerNotificationKind; title: RegExp };
  by: MendBy;
  sameSubject: boolean;
}

const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const exactly = (title: string): RegExp => new RegExp(`^${escaped(title)}$`, "u");

/** What WhatsApp says of a message that the bell keeps a notice for. */
type ToldStatus = keyof typeof TEMPLATE_NOTICE_TITLES;

/** What an approval mends: the message refused, held for a few hours, or turned off. */
const MENDED_BY_APPROVAL = ["rejected", "paused", "disabled"] as const satisfies readonly ToldStatus[];

/** Where a message's name stands in a title made around it: a character no name holds. */
const TITLE_SLOT = "\u0000";

/**
 * A message notice's title for a status, as the edge keeps it (TEMPLATE_NOTICE_TITLES, the words waba-events.ts reads):
 * its words exactly, around any name.
 */
const toldAs = (status: ToldStatus): string =>
  TEMPLATE_NOTICE_TITLES[status](TITLE_SLOT).split(TITLE_SLOT).map(escaped).join(".*");

/**
 * The same notice as the edge worded it until 13 Nov 2026 (`Template “<name>” <status word>`): a warning kept then is on
 * the bell for its thirty days, and its approval closes it too. Nothing is kept under these after 13 Dec 2026.
 */
const toldBefore = (status: (typeof MENDED_BY_APPROVAL)[number]): string =>
  `Template “.*” ${TEMPLATE_STATUS_WORDS[status].toLowerCase()}`;

const anyOf = (patterns: readonly string[]): RegExp => new RegExp(`^(?:${patterns.join("|")})$`, "u");

/** The title of one piece of WhatsApp's news of a message, around any name: what tells a row's tone reads it too (notice-tones.ts). */
export const messageNewsTitle = (status: ToldStatus): RegExp => anyOf([toldAs(status)]);

export const NOTICE_MENDS: readonly NoticeMend[] = [
  // A number's quality and its limit are that number's (its channel, waba-events.ts): one number's good news is not another's.
  {
    warns: {
      kind: "number",
      title: anyOf([NUMBER_FLAG_TITLES.flagged, NUMBER_FLAG_TITLES.before.flagged].map(escaped)),
    },
    by: { kind: "number", title: anyOf([NUMBER_FLAG_TITLES.cleared, NUMBER_FLAG_TITLES.before.cleared].map(escaped)) },
    sameSubject: true,
  },
  {
    warns: { kind: "number", title: /^WhatsApp messaging limit lowered$/u },
    by: { kind: "number", title: /^WhatsApp messaging limit raised$/u },
    sameSubject: true,
  },
  {
    warns: { kind: "number", title: /^WhatsApp account review rejected$/u },
    by: { kind: "number", title: /^WhatsApp account review approved$/u },
    sameSubject: false,
  },
  // A version refused, paused or disabled is mended by that version's approval (its name and language), or by WhatsApp
  // sending it again (a hold that ended, a message turned back on), under the title the edge keeps each by and the title
  // of before. A message filed as an offer is news an approval does not undo, and mends no refusal: neither is a pair.
  {
    warns: {
      kind: "template_blocked",
      title: anyOf(MENDED_BY_APPROVAL.flatMap((status) => [toldAs(status), toldBefore(status)])),
    },
    by: {
      kind: "template_ready",
      title: anyOf([toldAs("approved"), toldAs("approvedOffer"), toldAs("resumed")]),
    },
    sameSubject: true,
  },
  // A connected mailbox held for its own mail is mended by its owner's resume, one signed out by connecting it again, and
  // either by its removal (decision 0056, mailbox/notices.ts words them).
  {
    warns: { kind: "sweep", title: /^.+ is held: /u },
    by: { change: "mailbox_connection.resumed" },
    sameSubject: true,
  },
  {
    warns: { kind: "sweep", title: /^.+ is held: /u },
    by: { change: "mailbox_connection.removed" },
    sameSubject: true,
  },
  {
    warns: { kind: "sweep", title: /^.+ needs reconnecting$/u },
    by: { change: "mailbox_connection.connected" },
    sameSubject: true,
  },
  {
    warns: { kind: "sweep", title: /^.+ needs reconnecting$/u },
    by: { change: "mailbox_connection.removed" },
    sameSubject: true,
  },
  // Either name: a notice kept before 15 Nov 2026 says "Your receptionist", one kept since says "AI" (docs/words.md).
  {
    warns: { kind: "billing", title: /^(?:AI|Your receptionist) is paused$/u },
    by: { kind: "billing", title: /^(?:AI|Your receptionist) is back$/u },
    sameSubject: false,
  },
  {
    warns: { kind: "billing", title: /^A payment did not go through$/u },
    by: { kind: "billing", title: /^(?:AI|Your receptionist) is back$/u },
    sameSubject: false,
  },
  {
    warns: { kind: "billing", title: /^A payment did not go through$/u },
    by: { change: "billing.paid" },
    sameSubject: false,
  },
  {
    warns: { kind: "billing", title: /^Your trial ends in three days$/u },
    by: { change: "billing.paid" },
    sameSubject: false,
  },
  // A Business Profile that stopped syncing is mended by a sync that works, or by the connection's removal; a calendar
  // link that stopped answering by a read that works (the edge's sweeps record each). One of each per workspace.
  {
    warns: { kind: "sweep", title: exactly(GOOGLE_SYNC_NOTICE_WORDS.title) },
    by: { change: "google_connection.synced" },
    sameSubject: false,
  },
  {
    warns: { kind: "sweep", title: exactly(GOOGLE_SYNC_NOTICE_WORDS.title) },
    by: { change: "google_connection.removed" },
    sameSubject: false,
  },
  {
    warns: { kind: "sweep", title: exactly(CALENDAR_UNREADABLE_WORDS.title) },
    by: { change: "calendar.readable" },
    sameSubject: false,
  },
  // Closed in SQL by resume_email_offers (00421): listed so the test holds the SQL's literal to these words.
  {
    warns: { kind: "sweep", title: exactly(OFFERS_NOTICE_WORDS.paused(null).title) },
    by: { change: "mailbox.offers_resumed" },
    sameSubject: false,
  },
];

/** The warnings a kept row or a change mends: each with whether it must be about the same subject. */
export function warningsMendedBy(
  by: { kind: string; title: string } | { change: string },
): Array<NoticeMend["warns"] & { sameSubject: boolean }> {
  return NOTICE_MENDS.filter((m) =>
    "change" in by
      ? "change" in m.by && m.by.change === by.change
      : "kind" in m.by && m.by.kind === by.kind && m.by.title.test(by.title),
  ).map((m) => ({ ...m.warns, sameSubject: m.sameSubject }));
}
