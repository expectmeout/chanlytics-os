/**
 * Each workspace's day, counted (00277 platform_metrics): the back office's read and the words its card says.
 *
 * The nightly rollup counts one UTC day per workspace that did anything in it: messages in and out by channel, the
 * customers' messages (asks) and how many anyone answered, the receptionist's replies answered at once, held, and
 * handed to a person, its 95th-percentile latency, the sends that failed by what they came to, and model tokens.
 * Reports shows an owner their own; this is the platform's view across every workspace, which nothing else gives:
 * a workspace whose answer rate fell to zero is found here (and paged by the health sweep) before its owner writes.
 * Field data's p75 (shell/vitals.ts) is the page's speed; this is the product's work, and the two are not mixed.
 */
import type { Tone } from "../shell/tone";

/** How many days the back office reads: a week, newest first. */
export const PLATFORM_DAYS_READ = { days: 7 } as const;

/** One workspace's day, as the route answers it. */
export interface PlatformDayRowDto {
  tenant_id: string;
  name: string;
  /** The UTC day, YYYY-MM-DD. */
  day: string;
  messages_in: Record<string, number>;
  messages_out: Record<string, number>;
  asks: number;
  answered: number;
  replies_answered: number;
  replies_held: number;
  replies_handed_off: number;
  brain_p95_ms: number | null;
  provider_failures: Record<string, number>;
  tokens: number;
}

/** One line of the card: a workspace's latest day, in words. */
export interface PlatformDayLineVM {
  tenantId: string;
  name: string;
  day: string;
  /** "12 asked, 11 answered". */
  answers: string;
  /** "8 answered at once, 1 held, 2 handed over · 95% within 2.1 s". */
  receptionist: string;
  /** "3 sends failed (2 not taken, 1 may have gone)", or "" when none failed. */
  failures: string;
  /** Customers wrote and nobody answered: the alarm's condition. */
  silent: boolean;
  /** The line's colour: danger for a silent day. */
  tone: Tone;
}

export interface PlatformDaysVM {
  /** The day the lines describe: the newest rolled. Null when there is none. */
  day: string | null;
  /** "3 workspaces worked on 2026-09-28; 1 answered nobody." */
  sentence: string;
  lines: PlatformDayLineVM[];
}

const sum = (m: Record<string, number>): number => Object.values(m).reduce((a, n) => a + n, 0);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** What a failed send came to, in the words providerFetch's outcomes mean for a send. */
const FAILURE_WORDS: Record<string, string> = {
  refused: "refused",
  retryable: "not taken",
  unknown: "may have gone",
};

function failuresOf(m: Record<string, number>): string {
  const n = sum(m);
  if (n === 0) return "";
  const parts = Object.entries(m)
    .filter(([, c]) => c > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([outcome, c]) => `${c} ${FAILURE_WORDS[outcome] ?? outcome}`);
  return `${plural(n, "send", "sends")} failed (${parts.join(", ")})`;
}

function receptionistLine(r: PlatformDayRowDto): string {
  const replies = r.replies_answered + r.replies_held + r.replies_handed_off;
  if (replies === 0) return "the receptionist did not reply";
  const parts = [
    `${r.replies_answered} answered at once`,
    ...(r.replies_held ? [`${r.replies_held} held`] : []),
    ...(r.replies_handed_off ? [`${r.replies_handed_off} handed over`] : []),
  ];
  const pace = r.brain_p95_ms === null ? "" : ` · 95% within ${(r.brain_p95_ms / 1000).toFixed(1)} s`;
  return `${parts.join(", ")}${pace}`;
}

/** The card: each workspace's newest day, the silent ones first, then the busiest. */
export function platformDaysWords(rows: readonly PlatformDayRowDto[] | null): PlatformDaysVM {
  if (!rows) return { day: null, sentence: "Could not be read just now.", lines: [] };
  const day = rows.reduce<string | null>((d, r) => (d === null || r.day > d ? r.day : d), null);
  if (day === null) return { day: null, sentence: "No day has been counted yet.", lines: [] };
  const lines = rows
    .filter((r) => r.day === day)
    .map((r): PlatformDayLineVM & { asks: number } => ({
      tenantId: r.tenant_id,
      name: r.name,
      day: r.day,
      answers: `${r.asks} asked, ${r.answered} answered`,
      receptionist: receptionistLine(r),
      failures: failuresOf(r.provider_failures),
      silent: r.asks > 0 && r.answered === 0,
      tone: r.asks > 0 && r.answered === 0 ? "danger" : "plain",
      asks: r.asks,
    }))
    .sort((a, b) => Number(b.silent) - Number(a.silent) || b.asks - a.asks || a.name.localeCompare(b.name))
    .map(({ asks: _asks, ...line }) => line);
  const silent = lines.filter((l) => l.silent).length;
  const sentence =
    `${plural(lines.length, "workspace", "workspaces")} worked on ${day}` +
    (silent ? `; ${silent} answered nobody.` : "; every one written to answered.");
  return { day, sentence, lines };
}
