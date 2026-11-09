/**
 * Sending, as the Cold email page says it: whether a mailbox is healthy, what it can really send, and what its ramp gives
 * next. Read over the rules Connections keeps (mailboxDailyCap, MAILBOX_RAMP, the hold's share), no second copy of one.
 * "Healthy" means every check here passed. A ramp counts the days a mailbox has really sent on, so it promises days of
 * sending, never a date.
 */
import { MAILBOX_RAMP, mailboxDailyCap } from "../../email/mailbox-standing";
import {
  MAILBOX_HOLD_COUNT_FLOOR,
  MAILBOX_HOLD_PERCENT,
  mailboxBouncesHold,
  mailboxIsLive,
  mailboxSendsNow,
  type MailboxConnectionDto,
} from "../../email/mailbox-connections/states";

export type ColdEmailHealth = "healthy" | "attention" | "on_hold" | "reconnect" | "paused" | "none";

/** A check that is `null` could not be read, and says so: not known is neither fine nor wrong. */
export interface ColdEmailCheck {
  ok: boolean | null;
  title: string;
  detail: string;
}

export interface ColdEmailSending {
  /** The mailbox shown: the first that sends now, else the first. */
  from: string | null;
  /** The other live mailboxes beside it. */
  more: number;
  health: ColdEmailHealth;
  pace: string | null;
  /** What tops a mailbox on the domain the business's customers write to, said beside its pace. */
  ceiling: string | null;
  checks: ColdEmailCheck[];
  today: { sent: number; cap: number } | null;
  month: string | null;
  /** The domain to name a second one after, where the mailbox shown is on the customer's own: what "Send more" offers. */
  customer_host: string | null;
}

type Mailbox = Pick<
  MailboxConnectionDto,
  | "address"
  | "host"
  | "state"
  | "resting_until"
  | "daily_cap"
  | "customer_domain"
  | "sent_days"
  | "dns"
  | "sent_today"
  | "counts"
>;

const SIGNED_RECORDS = ["spf", "dkim", "dmarc"] as const;
const CEILING_WORDS = "That's the most for a mailbox on your main domain.";

/** What its ramp gives it next, past what it may send now, and how many days of sending away; null at the top. */
function nextOnRamp(m: Mailbox): { perDay: number; days: number } | null {
  const now = mailboxDailyCap(m);
  for (const step of MAILBOX_RAMP) {
    if (step.days <= m.sent_days) continue;
    const perDay = mailboxDailyCap({ ...m, sent_days: step.days });
    if (perDay > now) return { perDay, days: step.days - m.sent_days };
  }
  return null;
}

/** One mailbox's pace: "10 a day now, 20 after 7 more days of sending". */
function paceOfOne(m: Mailbox): string {
  const now = mailboxDailyCap(m);
  const next = nextOnRamp(m);
  if (!next) return `${now} a day`;
  return `${now} a day now, ${next.perDay} after ${next.days} more day${next.days === 1 ? "" : "s"} of sending`;
}

function paceOf(sending: readonly Mailbox[]): string | null {
  const first = sending[0];
  if (!first) return null;
  if (sending.length === 1) return paceOfOne(first);
  const total = sending.reduce((n, m) => n + mailboxDailyCap(m), 0);
  return `${total} a day across ${sending.length} mailboxes`;
}

function domainCheck(m: Mailbox): ColdEmailCheck {
  const missing = SIGNED_RECORDS.filter((k) => m.dns[k] === "missing").map((k) => k.toUpperCase());
  if (missing.length > 0)
    return {
      ok: false,
      title: `Your domain is missing its ${missing.join(" and ")} record${missing.length === 1 ? "" : "s"}`,
      detail: "Add it on Connections, so your emails reach inboxes",
    };
  if (SIGNED_RECORDS.some((k) => !m.dns[k]))
    return {
      ok: null,
      title: "Your domain's records couldn't be read just now",
      detail: "Connections checks them again",
    };
  return { ok: true, title: "Your domain is set up to send", detail: "Its email records are in place" };
}

/** How many bounces hold a mailbox still on its first emails, whose share is taken of the floor (mailboxBouncesHold). */
const HOLD_AT_FIRST = Math.floor((MAILBOX_HOLD_COUNT_FLOOR * MAILBOX_HOLD_PERCENT) / 100) + 1;

/**
 * Its bounces, read as the hold reads them. Refused by a server counts with a bounce. On its first emails a share frightens
 * for nothing (one in twenty is 5%, and rightly holds nothing), so it says the count, and the count that would hold it.
 */
function bounceCheck(c: NonNullable<Mailbox["counts"]>): ColdEmailCheck {
  const ok = !mailboxBouncesHold(c);
  const bad = c.bounced + c.blocked;
  if (c.sent < MAILBOX_HOLD_COUNT_FLOOR)
    return {
      ok,
      title: `${bad === 0 ? "No bounces" : `${bad} bounce${bad === 1 ? "" : "s"}`} in ${c.sent} email${c.sent === 1 ? "" : "s"}`,
      detail: `It pauses itself at ${HOLD_AT_FIRST} while it's new, so your name stays clean`,
    };
  const percent = Math.round((bad / c.sent) * 1000) / 10;
  return {
    ok,
    title: ok ? `Few bounces: ${percent}%` : `Bounces: ${percent}%`,
    detail: `It pauses itself past ${MAILBOX_HOLD_PERCENT}%, so your name stays clean`,
  };
}

/** What its emails came to, once it has sent. */
function mailChecks(m: Mailbox): ColdEmailCheck[] {
  const c = m.counts;
  if (!c || !c.sent) return [];
  return [
    bounceCheck(c),
    c.complained > 0
      ? {
          ok: false,
          title: `${c.complained} spam complaint${c.complained === 1 ? "" : "s"}`,
          detail: "It pauses itself after one",
        }
      : { ok: true, title: "No spam complaints", detail: "It pauses itself after one" },
  ];
}

const mailboxChecksOf = (m: Mailbox): ColdEmailCheck[] => [domainCheck(m), ...mailChecks(m)];

/**
 * The checks "Healthy" answers for: every one of the mailbox shown, and what fails on any other that sends, by its address.
 * One its owner paused sends nothing to answer for.
 */
function checksFor(shown: Mailbox | undefined, sending: readonly Mailbox[]): ColdEmailCheck[] {
  if (!shown) return [];
  const others = sending
    .filter((m) => m !== shown)
    .flatMap((m) =>
      mailboxChecksOf(m)
        .filter((c) => c.ok === false)
        .map((c) => ({ ...c, title: `${m.address}: ${c.title}` })),
    );
  return [...mailboxChecksOf(shown), ...others];
}

function healthOf(live: readonly Mailbox[], checks: readonly ColdEmailCheck[]): ColdEmailHealth {
  if (live.length === 0) return "none";
  if (live.some((m) => m.state === "reconnect")) return "reconnect";
  if (live.some((m) => m.state === "held")) return "on_hold";
  if (live.every((m) => m.state === "paused")) return "paused";
  return checks.some((c) => c.ok === false) ? "attention" : "healthy";
}

/** Sending, from the workspace's mailboxes and the month's first emails against their share. */
export function coldEmailSendingOf(
  mailboxes: readonly Mailbox[],
  month: { sent: number | null; of: number },
  nowMs: number,
): ColdEmailSending {
  const live = mailboxes.filter(mailboxIsLive);
  const sending = live.filter((m) => mailboxSendsNow(m, nowMs));
  const shown = sending[0] ?? live[0];
  const checks = checksFor(shown, sending);
  return {
    from: shown?.address ?? null,
    more: Math.max(0, live.length - 1),
    health: healthOf(live, checks),
    pace: paceOf(sending),
    ceiling: shown?.customer_domain ? CEILING_WORDS : null,
    checks,
    today: shown && shown.sent_today !== null ? { sent: shown.sent_today, cap: mailboxDailyCap(shown) } : null,
    month:
      month.sent === null
        ? null
        : `${month.sent.toLocaleString("en-US")} sent, of ${month.of.toLocaleString("en-US")} included`,
    customer_host: shown?.customer_domain ? shown.host : null,
  };
}
