import { OFFERS_NOTICE_WORDS } from "../broadcasts/email-offers.js";
import { TEMPLATE_STATUS_WORDS } from "../templates/templates.js";
import { CALENDAR_UNREADABLE_WORDS, GOOGLE_SYNC_NOTICE_WORDS } from "../notices/connection-news.js";
const exactly = (title) => new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "u");
const templateTitle = (...statuses) => new RegExp(`^Template \u201C.*\u201D (?:${statuses.map((s) => TEMPLATE_STATUS_WORDS[s].toLowerCase()).join("|")})$`, "u");
export const NOTICE_MENDS = [
  // A number's quality and its limit are that number's (its channel, waba-events.ts): one number's good news is not another's.
  {
    warns: { kind: "number", title: /^WhatsApp quality rating flagged$/u },
    by: { kind: "number", title: /^WhatsApp quality rating back to normal$/u },
    sameSubject: true
  },
  {
    warns: { kind: "number", title: /^WhatsApp messaging limit lowered$/u },
    by: { kind: "number", title: /^WhatsApp messaging limit raised$/u },
    sameSubject: true
  },
  {
    warns: { kind: "number", title: /^WhatsApp account review rejected$/u },
    by: { kind: "number", title: /^WhatsApp account review approved$/u },
    sameSubject: false
  },
  // A version refused, paused or disabled is mended by that version's approval (its name and language). A move to
  // marketing is a restriction an approval does not lift, and a category change mends no refusal: neither is a pair.
  {
    warns: { kind: "template_blocked", title: templateTitle("rejected", "paused", "disabled") },
    by: { kind: "template_ready", title: templateTitle("approved") },
    sameSubject: true
  },
  // A connected mailbox held for its own mail is mended by its owner's resume, one signed out by connecting it again, and
  // either by its removal (decision 0056, mailbox-notices.ts words them).
  {
    warns: { kind: "sweep", title: /^.+ is held: /u },
    by: { change: "mailbox_connection.resumed" },
    sameSubject: true
  },
  {
    warns: { kind: "sweep", title: /^.+ is held: /u },
    by: { change: "mailbox_connection.removed" },
    sameSubject: true
  },
  {
    warns: { kind: "sweep", title: /^.+ needs reconnecting$/u },
    by: { change: "mailbox_connection.connected" },
    sameSubject: true
  },
  {
    warns: { kind: "sweep", title: /^.+ needs reconnecting$/u },
    by: { change: "mailbox_connection.removed" },
    sameSubject: true
  },
  {
    warns: { kind: "billing", title: /^Your receptionist is paused$/u },
    by: { kind: "billing", title: /^Your receptionist is back$/u },
    sameSubject: false
  },
  {
    warns: { kind: "billing", title: /^A payment did not go through$/u },
    by: { kind: "billing", title: /^Your receptionist is back$/u },
    sameSubject: false
  },
  {
    warns: { kind: "billing", title: /^A payment did not go through$/u },
    by: { change: "billing.paid" },
    sameSubject: false
  },
  {
    warns: { kind: "billing", title: /^Your trial ends in three days$/u },
    by: { change: "billing.paid" },
    sameSubject: false
  },
  // A Business Profile that stopped syncing is mended by a sync that works, or by the connection's removal; a calendar
  // link that stopped answering by a read that works (the edge's sweeps record each). One of each per workspace.
  {
    warns: { kind: "sweep", title: exactly(GOOGLE_SYNC_NOTICE_WORDS.title) },
    by: { change: "google_connection.synced" },
    sameSubject: false
  },
  {
    warns: { kind: "sweep", title: exactly(GOOGLE_SYNC_NOTICE_WORDS.title) },
    by: { change: "google_connection.removed" },
    sameSubject: false
  },
  {
    warns: { kind: "sweep", title: exactly(CALENDAR_UNREADABLE_WORDS.title) },
    by: { change: "calendar.readable" },
    sameSubject: false
  },
  // Closed in SQL by resume_email_offers (00421): listed so the test holds the SQL's literal to these words.
  {
    warns: { kind: "sweep", title: exactly(OFFERS_NOTICE_WORDS.paused(null).title) },
    by: { change: "mailbox.offers_resumed" },
    sameSubject: false
  }
];
export function warningsMendedBy(by) {
  return NOTICE_MENDS.filter(
    (m) => "change" in by ? "change" in m.by && m.by.change === by.change : "kind" in m.by && m.by.kind === by.kind && m.by.title.test(by.title)
  ).map((m) => ({ ...m.warns, sameSubject: m.sameSubject }));
}
