/**
 * A warning closes when the news that mends it is kept (the wiring's second audit, W-channel-team-plus-4).
 *
 * The bell keeps the bad news and the good: a number flagged and back to normal, a messaging limit lowered and raised, an
 * account review rejected and approved, a message refused and approved, a mailbox held or signed out and sending again, the
 * receptionist paused and back, a payment that did not go through and a paid invoice. The good news was kept and the warning
 * beside it stayed unread and amber for ever. Each pair is said here once: the warning by its kind and title, and what mends
 * it (a kind and title the edge keeps after it, or a change the edge records). The edge closes the warning when its mend is
 * kept (notify.ts mendWarnings, through packages/db closeMendedNotices), and the offers pause is closed in SQL by the resume
 * (00421), listed here so a test holds the SQL's title to these words.
 *
 * Titles are matched here, never in SQL, so the rule stays in one place.
 */
import { OFFERS_NOTICE_WORDS } from "../broadcasts/email-offers";
import { TEMPLATE_STATUS_WORDS } from "../templates/templates";
import type { ServerNotificationKind } from "../today/notifications";

/** A change the edge records that mends a warning, where no row of good news is kept for it. */
export type MendChange =
  | "billing.paid"
  | "mailbox.offers_resumed"
  | "mailbox_connection.resumed"
  | "mailbox_connection.connected"
  | "mailbox_connection.removed";

/** What mends a warning: a kind and title kept after it, or a change. */
export type MendBy = { kind: ServerNotificationKind; title: RegExp } | { change: MendChange };

/** One warning and what mends it; `sameSubject` where the two are about one thing (a domain, a template). */
export interface NoticeMend {
  warns: { kind: ServerNotificationKind; title: RegExp };
  by: MendBy;
  sameSubject: boolean;
}

const exactly = (title: string): RegExp => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "u");

/** A template notice's title for a status, as the edge words it (waba-events.ts: `Template “<name>” <status word>`). */
const templateTitle = (...statuses: Array<keyof typeof TEMPLATE_STATUS_WORDS>): RegExp =>
  new RegExp(`^Template “.*” (?:${statuses.map((s) => TEMPLATE_STATUS_WORDS[s].toLowerCase()).join("|")})$`, "u");

export const NOTICE_MENDS: readonly NoticeMend[] = [
  // A number's quality and its limit are that number's (its channel, waba-events.ts): one number's good news is not another's.
  {
    warns: { kind: "number", title: /^WhatsApp quality rating flagged$/u },
    by: { kind: "number", title: /^WhatsApp quality rating back to normal$/u },
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
  // A version refused, paused or disabled is mended by that version's approval (its name and language). A move to
  // marketing is a restriction an approval does not lift, and a category change mends no refusal: neither is a pair.
  {
    warns: { kind: "template_blocked", title: templateTitle("rejected", "paused", "disabled") },
    by: { kind: "template_ready", title: templateTitle("approved") },
    sameSubject: true,
  },
  // A connected mailbox held for its own mail is mended by its owner's resume, one signed out by connecting it again, and
  // either by its removal (decision 0056, mailbox-notices.ts words them).
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
  {
    warns: { kind: "billing", title: /^Your receptionist is paused$/u },
    by: { kind: "billing", title: /^Your receptionist is back$/u },
    sameSubject: false,
  },
  {
    warns: { kind: "billing", title: /^A payment did not go through$/u },
    by: { kind: "billing", title: /^Your receptionist is back$/u },
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
