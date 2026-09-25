/**
 * A workspace's own sending domains: what may be added, the ramp, how a domain's facts become its state, and what
 * the Connections row says. Pure; the edge (lib/email/sending-domains.ts) reads the facts and writes the row, the
 * page (integrations-real.jsx) draws these words (docs/superpowers/specs/2026-09-25-reach-out-design.md §4.6, §4.8).
 */
import type { Tone } from "./tone";

/** "Sep 22": the day a hold began, as billing.ts says its dates. */
const DAY_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export const SENDING_DOMAIN_STATES = ["records", "verifying", "verified", "held"] as const;
export type SendingDomainState = (typeof SENDING_DOMAIN_STATES)[number];
export const DOMAIN_HOLDS = ["verification", "dmarc", "bounces", "complaint"] as const;
export type DomainHold = (typeof DOMAIN_HOLDS)[number];
export const DMARC_STATES = ["found", "missing"] as const;
export type DmarcState = (typeof DMARC_STATES)[number];

/** The holds that lift themselves when the domain reads good again; the rest wait for the owner (PR 5). */
export const DNS_HOLDS: readonly DomainHold[] = ["verification", "dmarc"];

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

/** Free mail: nobody can publish records there, and a cold email from one is the spam it looks like. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "mail.com",
]);

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
}

/** What the edge just read: the provider's word (null: could not ask) and DMARC (null: could not read). */
export interface DomainFacts {
  provider: string | null;
  dmarc: DmarcState | null;
}

export type DomainRowState = Pick<SendingDomainDto, "state" | "held_why" | "held_at" | "verified_at" | "clean_since">;

export interface DomainJudgement extends DomainRowState {
  /** What changed, for the event and the owner; null when nothing did. */
  change: null | "verified" | "held" | "released";
}

const CHECKING: ReadonlySet<string> = new Set(["pending", "temporary_failure", "partially_verified"]);

/**
 * The next state, from the row and what was just read. The table:
 *   records|verifying  provider verified + DMARC found      → verified (clean from now)       change "verified"
 *                      provider verified + DMARC missing    → records
 *                      provider pending/partly/temporarily  → verifying
 *                      anything else                        → records
 *   verified           provider not verified                → held, verification            change "held"
 *                      DMARC missing                        → held, dmarc                   change "held"
 *   held (DNS)         provider verified + DMARC found      → verified (clean from now)       change "released"
 *   held (reputation)  unchanged: only the owner resumes it (PR 5).
 * An unreadable provider changes nothing, and an unreadable DMARC neither holds nor verifies: "we could not look"
 * is not a fact about the domain.
 */
export function judgeDomain(row: DomainRowState, facts: DomainFacts, nowIso: string): DomainJudgement {
  const same: DomainJudgement = { ...row, change: null };
  if (facts.provider === null) return same;
  const verified = facts.provider === "verified";
  if (row.state === "records" || row.state === "verifying") {
    if (verified && facts.dmarc === "found")
      return {
        state: "verified",
        held_why: null,
        held_at: null,
        verified_at: nowIso,
        clean_since: nowIso,
        change: "verified",
      };
    if (verified) return facts.dmarc === "missing" ? { ...same, state: "records" } : same;
    return { ...same, state: CHECKING.has(facts.provider) ? "verifying" : "records" };
  }
  if (row.state === "verified") {
    if (!verified) return { ...row, state: "held", held_why: "verification", held_at: nowIso, change: "held" };
    if (facts.dmarc === "missing") return { ...row, state: "held", held_why: "dmarc", held_at: nowIso, change: "held" };
    return same;
  }
  // held
  if (row.held_why && DNS_HOLDS.includes(row.held_why) && verified && facts.dmarc === "found")
    return { ...row, state: "verified", held_why: null, held_at: null, clean_since: nowIso, change: "released" };
  return same;
}

const HOLD_WORDS: Record<DomainHold, string> = {
  verification: "it stopped verifying",
  dmarc: "its DMARC record is missing",
  bounces: "more than 2% of its recent emails bounced",
  complaint: "someone marked an email from it as spam",
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
      d.provider_status === "verified" && d.dmarc === "missing"
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
      line: `${who} · ${days} clean day${days === 1 ? "" : "s"}`,
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
      d.held_why && DNS_HOLDS.includes(d.held_why)
        ? "Nothing leaves from it until Check passes."
        : "Nothing leaves from it until you resume it.",
  };
}
