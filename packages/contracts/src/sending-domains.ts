/**
 * A workspace's own sending domains: what may be added, the ramp, how a domain's facts become its state, and what
 * the Connections row says. Pure; the edge (lib/email/sending-domains.ts) reads the facts and writes the row, the
 * page (integrations-real.jsx) draws these words (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6, §4.8).
 */
import type { Tone } from "./tone";
import { FREE_MAIL_DOMAINS } from "./free-mail";

/** "Sep 22": the day a hold began, as billing.ts says its dates. */
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const SENDING_DOMAIN_STATES = ["records", "verifying", "verified", "held"] as const;
export type SendingDomainState = (typeof SENDING_DOMAIN_STATES)[number];
export const DOMAIN_HOLDS = ["verification", "dmarc", "bounces", "complaint", "provider"] as const;
export type DomainHold = (typeof DOMAIN_HOLDS)[number];
export const DMARC_STATES = ["found", "missing"] as const;
export type DmarcState = (typeof DMARC_STATES)[number];

/** The holds its records fix: they are shown, and Check is offered. */
export const DNS_HOLDS: readonly DomainHold[] = ["verification", "dmarc"];
/**
 * The holds that lift themselves when the domain reads good again: its records (DNS_HOLDS), and the provider
 * knowing it again (00178). The rest -- bounces, a complaint -- wait for the owner's Resume.
 */
export const SELF_LIFTING_HOLDS: readonly DomainHold[] = ["verification", "dmarc", "provider"];
/**
 * What the provider can say of a domain, as its API documents it. Anything else -- a word it has not documented, or
 * "not_found", which the edge writes when the provider no longer has the domain -- is a fact about the account, not
 * the records: held as `provider`, which lifts itself if the provider knows it again.
 */
export const PROVIDER_STATUSES: ReadonlySet<string> = new Set([
  "not_started",
  "pending",
  "verified",
  "partially_verified",
  "partially_failed",
  "failed",
  "temporary_failure",
]);

export const SENDING_DOMAINS_MAX = 5;
/** What we recommend when a domain has no DMARC: accepted by Gmail and Yahoo, and harmless to other mail it sends. */
export const DMARC_RECOMMENDED = "v=DMARC1; p=none;";

/** The ramp (decision 8): per domain, by clean days. */
export const DOMAIN_RAMP: ReadonlyArray<{ days: number; perDay: number }> = [
  { days: 0, perDay: 30 },
  { days: 14, perDay: 100 },
  { days: 30, perDay: 200 },
];

const DAY_MS = 86_400_000;

export function cleanDays(cleanSince: string | null, nowMs: number): number {
  if (!cleanSince) return 0;
  return Math.max(0, Math.floor((nowMs - Date.parse(cleanSince)) / DAY_MS));
}

/** How many a day this domain may send: 0 until it is verified; the ramp's step by clean days after. */
export function domainDailyCap(cleanSince: string | null, nowMs: number): number {
  if (!cleanSince) return 0;
  const days = (nowMs - Date.parse(cleanSince)) / DAY_MS;
  let cap = 0;
  for (const step of DOMAIN_RAMP) if (days >= step.days) cap = step.perDay;
  return cap;
}

export function normalizeHost(typed: string): string {
  return typed.trim().toLowerCase().replace(/\.$/, "");
}

const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Why this cannot be a sending domain, in a sentence; null when it can (whether it is free is the table's to say). */
export function whyNotASendingHost(typed: string, platform: { mailDomain: string | null }): string | null {
  const h = normalizeHost(typed);
  if (!h) return "Write the domain you'll send from, like getyourbusiness.com.";
  if (/[/:@\s]/.test(h)) return "Write the domain alone, like getyourbusiness.com: no https://, no address, no path.";
  if (h.startsWith("www.")) return "Write the domain without www.";
  if (h.length > 253 || !HOST.test(h)) return "That isn't a domain name. It looks like getyourbusiness.com.";
  if (FREE_MAIL_DOMAINS.has(h)) return `${h} is free mail: nobody can add records to it. Use a domain you own.`;
  const mine = platform.mailDomain?.toLowerCase() ?? null;
  const parent = mine ? mine.split(".").slice(-2).join(".") : null;
  if (mine && (h === mine || h === parent || h.endsWith(`.${parent}`)))
    return "That domain is Chanlytics' own. Use a domain your business owns.";
  return null;
}

const RESERVED_FROM: ReadonlySet<string> = new Set([
  "r",
  "postmaster",
  "abuse",
  "mailer-daemon",
  "noreply",
  "no-reply",
]);

export function normalizeFromLocal(typed: string): string {
  return typed.trim().toLowerCase();
}

/** Why this cannot be the part before the @, in a sentence; null when it can. */
export function whyNotAFromLocal(typed: string): string | null {
  const s = normalizeFromLocal(typed);
  if (!s) return "Write the part before the @, like your first name.";
  if (s.length > 40) return "Keep it to 40 characters or fewer.";
  if (!/^[a-z0-9]+([.-][a-z0-9]+)*$/.test(s)) return "Use letters and numbers, with dots or hyphens between them.";
  if (RESERVED_FROM.has(s)) return `“${s}” is kept for the mail system. Use a name people can write back to.`;
  return null;
}

export interface DomainRecord {
  /** The provider's group for it: SPF, DKIM, or the return path's MX. */
  label: string;
  type: string;
  name: string;
  value: string;
  priority: number | null;
  status: string;
}

/** A sending domain as the page is told about it (dashboard server/sending-domains.ts). No provider id. */
export interface SendingDomainDto {
  id: string;
  host: string;
  from_local: string;
  from_name: string;
  /** sam@getbestmovers.com. */
  address: string;
  state: SendingDomainState;
  held_why: DomainHold | null;
  held_at: string | null;
  verified_at: string | null;
  clean_since: string | null;
  provider_status: string | null;
  dmarc: DmarcState | null;
  records: DomainRecord[];
  checked_at: string | null;
  created_at: string;
  /** Where the reputation count starts (00178): first verified, or last resumed. A DNS release does not move it. */
  counted_since: string | null;
  /** What the clock last counted since counted_since (00176): sends, bounces among the last 500, complaints. Null until counted. */
  sent_recent: number | null;
  bounced_recent: number | null;
  complaints: number | null;
}

/** What one own domain sent since it was last clean (00176 sending_domain_counts). */
export interface DomainCounts {
  sent: number;
  bounced: number;
  complained: number;
}

/**
 * The reputation a domain answers for: any complaint holds it, and outranks bounces; bounces hold it past 2% of what
 * it sent, over at least 150 sends, so three unlucky bounces in a domain's first thirty do not stop it.
 */
export function reputationHoldOf(c: DomainCounts | null): "complaint" | "bounces" | null {
  if (!c) return null;
  if (c.complained >= 1) return "complaint";
  if (c.bounced * 50 > Math.max(c.sent, 150)) return "bounces";
  return null;
}

/**
 * What the edge just read: the provider's word (null: could not ask), DMARC (null: could not read), and what the
 * domain sent (null: not counted, because it is not verified or the count could not be read).
 */
export interface DomainFacts {
  provider: string | null;
  dmarc: DmarcState | null;
  counts: DomainCounts | null;
}

/** The row as it stands, with the DMARC answer it last stored: a missing record holds only when it was missing before. */
export type DomainRowState = Pick<
  SendingDomainDto,
  "state" | "held_why" | "held_at" | "verified_at" | "clean_since" | "counted_since" | "dmarc" | "provider_status"
>;

export interface DomainJudgement extends DomainRowState {
  /** What changed, for the event and the owner; null when nothing did. */
  change: null | "verified" | "held" | "released" | "resumed";
}

const CHECKING: ReadonlySet<string> = new Set(["pending", "temporary_failure", "partially_verified"]);

/**
 * The next state, from the row and what was just read. The table:
 *   records|verifying  provider verified + DMARC found      → verified (clean from now)       change "verified"
 *                      provider verified + DMARC missing    → records
 *                      provider pending/partly/temporarily  → verifying
 *                      anything else                        → records
 *   verified           a complaint, or bounces past 2%       → held, complaint | bounces       change "held"
 *                                                               (reputationHoldOf; first, and only the owner lifts it)
 *                      provider no longer knows it, or a    → held, provider                change "held"
 *                      word it has not documented             (lifts itself if the provider knows it again)
 *                      provider pending                     → unchanged: a check in progress, the owner's own
 *                                                               Check included (the provider marks a domain
 *                                                               pending whatever it was), is not a failure
 *                      temporary_failure for the first time → unchanged (stored; the provider rechecks on its own,
 *                                                               and the next read confirms or clears it)
 *                      provider anything else not verified  → held, verification            change "held"
 *                      DMARC missing, and missing last read → held, dmarc                   change "held"
 *                      DMARC missing for the first time     → unchanged (the missing answer is stored, and the
 *                                                               next read, ten minutes on, confirms or clears it:
 *                                                               nameservers that disagree mid-move are one bad read)
 *   held (DNS, provider) provider verified + DMARC found    → verified (the ramp starts again, clean from now; the
 *                                                               reputation count does not: counted_since stays)
 *                                                                                              change "released"
 *   held (reputation)  unchanged: only the owner resumes it (resumeDomain).
 * Verification sets both clocks, the ramp's (clean_since) and the count's (counted_since).
 * An unreadable provider changes nothing but a reputation hold, which is counted from our own rows, and an
 * unreadable DMARC neither holds nor verifies: "we could not look" is not a fact about the domain.
 */
export function judgeDomain(row: DomainRowState, facts: DomainFacts, nowIso: string): DomainJudgement {
  const same: DomainJudgement = { ...row, dmarc: facts.dmarc ?? row.dmarc, change: null };
  // Reputation is counted from our own rows, so it holds a verified domain whatever the provider answered, or did not.
  const reputation = row.state === "verified" ? reputationHoldOf(facts.counts) : null;
  if (reputation) return { ...same, state: "held", held_why: reputation, held_at: nowIso, change: "held" };
  if (facts.provider === null) return { ...row, change: null };
  const verified = facts.provider === "verified";
  if (row.state === "records" || row.state === "verifying") {
    if (verified && facts.dmarc === "found")
      return {
        ...row,
        state: "verified",
        held_why: null,
        held_at: null,
        verified_at: nowIso,
        clean_since: nowIso,
        counted_since: nowIso,
        dmarc: "found",
        change: "verified",
      };
    if (verified) return facts.dmarc === "missing" ? { ...same, state: "records" } : same;
    return { ...same, state: CHECKING.has(facts.provider) ? "verifying" : "records" };
  }
  if (row.state === "verified") {
    // The provider no longer knowing it, or a word it never documented: the account's fact, held on the second read
    // in a row, as one bad answer (a blip at the account) is not a fact about anything.
    if (!PROVIDER_STATUSES.has(facts.provider))
      return row.provider_status && !PROVIDER_STATUSES.has(row.provider_status)
        ? { ...same, state: "held", held_why: "provider", held_at: nowIso, change: "held" }
        : same;
    // The provider's own recheck state: one read of it is not a failure, two in a row are.
    if (facts.provider === "temporary_failure" && row.provider_status !== "temporary_failure") return same;
    if (!verified && facts.provider !== "pending")
      return { ...same, state: "held", held_why: "verification", held_at: nowIso, change: "held" };
    if (facts.dmarc === "missing" && row.dmarc === "missing")
      return { ...same, state: "held", held_why: "dmarc", held_at: nowIso, change: "held" };
    return same;
  }
  // held
  if (row.held_why && SELF_LIFTING_HOLDS.includes(row.held_why) && verified && facts.dmarc === "found")
    return {
      ...row,
      state: "verified",
      held_why: null,
      held_at: null,
      // Records that broke restart the ramp; the account not answering for a while was never the domain's doing.
      clean_since: row.held_why === "provider" ? row.clean_since : nowIso,
      dmarc: "found",
      change: "released",
    };
  return same;
}

/**
 * The owner's Resume: a reputation hold lifted, and the ramp started again from today (clean_since now, so 30 a day).
 * A DNS hold lifts itself when Check passes, and a domain that is not held has nothing to resume: both unchanged.
 */
export function resumeDomain(row: DomainRowState, nowIso: string): DomainJudgement {
  if (row.state !== "held" || !row.held_why || SELF_LIFTING_HOLDS.includes(row.held_why))
    return { ...row, change: null };
  // Both clocks start again: the ramp at its first step, and the count, so what held it is answered for once.
  return {
    ...row,
    state: "verified",
    held_why: null,
    held_at: null,
    clean_since: nowIso,
    counted_since: nowIso,
    change: "resumed",
  };
}

/** A judgement as the row's patch: every column the judge decides, in one place, so no write path drops one. */
export function domainPatchOf(j: DomainJudgement): Omit<DomainRowState, "provider_status"> {
  return {
    state: j.state,
    held_why: j.held_why,
    held_at: j.held_at,
    verified_at: j.verified_at,
    clean_since: j.clean_since,
    counted_since: j.counted_since,
    dmarc: j.dmarc,
  };
}

/** sam@getbestmovers.com: the one spelling of an own domain's address (the door, the wire, the page). */
export function ownDomainAddress(d: { from_local: string; host: string }): string {
  return `${d.from_local}@${d.host}`.toLowerCase();
}

/**
 * What the page may do with a domain, from its state: the rules the door already holds (Resume refuses a hold that
 * lifts itself), said once so the page does not decide them again. Remove is always offered; the page gates it to
 * the owner, as it gates the rest.
 */
export function sendingDomainActs(d: Pick<SendingDomainDto, "state" | "held_why">): {
  check: boolean;
  resume: boolean;
  remove: true;
  records: boolean;
} {
  const held = d.state === "held" && !!d.held_why;
  const dnsHold = held && DNS_HOLDS.includes(d.held_why!);
  const selfLifting = held && SELF_LIFTING_HOLDS.includes(d.held_why!);
  const waiting = d.state === "records" || d.state === "verifying";
  return {
    check: waiting || selfLifting,
    resume: held && !selfLifting,
    remove: true,
    records: waiting || dnsHold,
  };
}

/** A sending_domains row, as either app reads it: the page's DTO, which never carries the provider's id. */
export function sendingDomainDtoOf(r: {
  id: string;
  host: string;
  from_local: string;
  from_name: string;
  state: string;
  held_why: string | null;
  held_at: string | null;
  verified_at: string | null;
  clean_since: string | null;
  counted_since?: string | null;
  provider_status: string | null;
  dmarc: string | null;
  records: unknown;
  checked_at: string | null;
  created_at: string;
  sent_recent: number | null;
  bounced_recent: number | null;
  complaints: number | null;
}): SendingDomainDto {
  return {
    id: r.id,
    host: r.host,
    from_local: r.from_local,
    from_name: r.from_name,
    address: ownDomainAddress(r),
    state: r.state as SendingDomainState,
    held_why: (r.held_why ?? null) as DomainHold | null,
    held_at: r.held_at,
    verified_at: r.verified_at,
    clean_since: r.clean_since,
    counted_since: r.counted_since ?? null,
    provider_status: r.provider_status,
    dmarc: (r.dmarc ?? null) as DmarcState | null,
    records: Array.isArray(r.records) ? (r.records as DomainRecord[]) : [],
    checked_at: r.checked_at,
    created_at: r.created_at,
    sent_recent: r.sent_recent,
    bounced_recent: r.bounced_recent,
    complaints: r.complaints,
  };
}

/** "0.4% bounced · none marked as spam", once the domain has been counted with something sent; null before. */
export function domainStatsWords(
  d: Pick<SendingDomainDto, "sent_recent" | "bounced_recent" | "complaints">,
): string | null {
  if (!d.sent_recent) return null;
  const pct = Math.round(((d.bounced_recent ?? 0) / d.sent_recent) * 1000) / 10;
  const spam = d.complaints ? `${d.complaints} marked as spam` : "none marked as spam";
  return `${pct}% bounced · ${spam}`;
}

const HOLD_WORDS: Record<DomainHold, string> = {
  verification: "it stopped verifying",
  dmarc: "its DMARC record is missing",
  bounces: "more than 2% of its recent emails bounced",
  complaint: "someone marked an email from it as spam",
  provider: "the mail provider no longer has it",
};

/** Why a domain was held, as a clause ("it stopped verifying"): the row, the Activity log and the owner's notice say it alike. */
export function domainHoldWords(why: string | null | undefined): string {
  return (why && HOLD_WORDS[why as DomainHold]) || "it was held";
}

export interface SendingDomainWords {
  pill: string;
  tone: Tone;
  /** The line under the host. */
  line: string;
  /** The right-hand column: the cap, or that it is not sending. */
  cap: string;
  /** What comes next, when anything does. */
  next: string | null;
}

export function sendingDomainWords(d: SendingDomainDto, nowMs: number): SendingDomainWords {
  const who = `${d.from_name} · ${d.address}`;
  if (d.state === "records") {
    const line =
      d.provider_status === "not_found"
        ? "The mail provider no longer has this domain. Remove it and add it again."
        : d.provider_status === "verified" && d.dmarc === "missing"
          ? "SPF and DKIM pass. Add the DMARC record below, then Check."
          : d.provider_status === "failed" || d.provider_status === "partially_failed"
            ? "The records weren't found. Check each one below at your registrar, then Check again."
            : "Add the records below at your registrar, then Check.";
    return { pill: "Records to add", tone: "warn", line, cap: "Not sending yet", next: null };
  }
  if (d.state === "verifying")
    return {
      pill: "Checking",
      tone: "info",
      line: "Checking the records. It usually takes minutes, and can take a few hours.",
      cap: "Not sending yet",
      next: null,
    };
  if (d.state === "verified") {
    const days = cleanDays(d.clean_since, nowMs);
    const cap = domainDailyCap(d.clean_since, nowMs);
    const step = DOMAIN_RAMP.find((s) => s.perDay > cap);
    return {
      pill: "Verified",
      tone: "ok",
      line: [`${who} · ${days} clean day${days === 1 ? "" : "s"}`, domainStatsWords(d)].filter(Boolean).join(" · "),
      cap: `Up to ${cap} a day`,
      next: step ? `${step.perDay} a day after ${step.days} clean days` : null,
    };
  }
  const why = domainHoldWords(d.held_why);
  const since = d.held_at ? DAY_FMT.format(new Date(d.held_at)) : null;
  return {
    pill: "Held",
    tone: "warn",
    line: `${since ? `Held since ${since}` : "Held"} · ${why}`,
    cap: "Sending nothing",
    next:
      d.held_why === "provider"
        ? "We've been told. If it doesn't come back on its own, remove it and add it again."
        : d.held_why && DNS_HOLDS.includes(d.held_why)
          ? "Nothing leaves from it until Check passes."
          : "Nothing leaves from it until you resume it.",
  };
}
