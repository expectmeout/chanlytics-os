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
import { MIN_MS } from "../shared/time";
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
  /** How long jobs waited for the ledger past their due time, by lane, 95th percentile (00332); {} for a day before it. */
  job_lag_ms: Record<string, number>;
  /** How long customers waited for a first answer, by channel, 95th percentile (00332); {} when nobody was answered. */
  first_answer_ms: Record<string, number>;
  /** Sends of the same words to one thread within a minute (00332); null for a day nothing was sent in, or before it. */
  duplicate_sends: number | null;
  /** The jobs that died that day, by kind (00332); {} when none did. */
  dead_letters: Record<string, number>;
  /** How long an event waited for its deliveries, 95th percentile (decision 0032); null until the relay writes it. */
  relay_lag_ms: number | null;
  /**
   * How long after the provider's own clock a door kept its delivery, by provider, 95th percentile (00337, decision
   * 0032); {} for a day no stamped delivery arrived in, or before it.
   */
  intake_lag_ms: Record<string, number>;
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
  /**
   * The spine's numbers (decision 0031, Phase 0): "replies claimed within 1.2 s, bulk within 40.0 s; first answer within
   * 38.0 s (whatsapp); 1 duplicate send; 2 jobs died (email_ingest 2)", each part only where the day has it, or "" for
   * a day rolled before they were counted.
   */
  spine: string;
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

/** The lanes' words (decision 0018): what a claim takes first. */
const LANE_WORDS: Record<string, string> = { "0": "replies", "1": "the waiting", "2": "bulk", none: "the rest" };

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The spine's numbers in words, each only where the day has it; "" for a day rolled before they were counted. */
function spineLine(r: PlatformDayRowDto): string {
  const parts: string[] = [];
  const lanes = Object.entries(r.job_lag_ms).sort(([a], [b]) => a.localeCompare(b));
  const [first, ...rest] = lanes;
  if (first) {
    const [lane0, ms0] = first;
    parts.push(
      [`${LANE_WORDS[lane0] ?? `lane ${lane0}`} claimed within ${seconds(ms0)}`]
        .concat(rest.map(([lane, ms]) => `${LANE_WORDS[lane] ?? `lane ${lane}`} within ${seconds(ms)}`))
        .join(", "),
    );
  }
  const channels = Object.keys(r.first_answer_ms).sort();
  if (channels.length) {
    const worst = Math.max(...Object.values(r.first_answer_ms));
    parts.push(`first answer within ${seconds(worst)} (${channels.join(", ")})`);
  }
  if (r.duplicate_sends !== null) parts.push(plural(r.duplicate_sends, "duplicate send", "duplicate sends"));
  const died = sum(r.dead_letters);
  if (died > 0) {
    const kinds = Object.entries(r.dead_letters)
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, n]) => `${kind} ${n}`);
    parts.push(`${plural(died, "job", "jobs")} died (${kinds.join(", ")})`);
  }
  if (r.relay_lag_ms !== null) parts.push(`events relayed within ${seconds(r.relay_lag_ms)}`);
  const providers = Object.keys(r.intake_lag_ms).sort();
  if (providers.length) {
    const worst = Math.max(...Object.values(r.intake_lag_ms));
    parts.push(`deliveries taken in within ${seconds(worst)} (${providers.join(", ")})`);
  }
  return parts.join("; ");
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
      spine: spineLine(r),
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

/* ---- Every promise has a number with a target (decision 0031, invariant 12; its entry of 10 October 2026) ---- */

/** A day's number that is a promise: the most it may be, and whether the platform is paged on a day past it. */
interface PlatformTarget {
  readonly promise: true;
  /** The most the number may be: one figure, or one per key (a lane, a channel, a provider, a job's kind). */
  readonly most: number | Readonly<Record<string, number>>;
  /** The most for a key `most` does not name. */
  readonly otherwise?: number;
  readonly unit: "ms" | "count";
  /** The platform answers for it, so a day past it pages the operator; else it is the workspace's, shown and not paged. */
  readonly alarm: boolean;
  /** What it promises. */
  readonly why: string;
}

/** A day's number that is a count, not a promise: read beside the others, held to nothing. */
interface PlatformCount {
  readonly promise: false;
  readonly why: string;
}

type PlatformNumber = PlatformTarget | PlatformCount;

const heldToNothing = (why: string): PlatformCount => ({ promise: false, why });

/**
 * Every number the nightly rollup keeps (platform_metrics' columns beyond the workspace, the day and the stamp), and
 * what each is. The targets were set on 10 October 2026 against production's own month (decision 0031): each sits above
 * what a healthy day did, so a day past it is news. `platform/every-number-names-a-target.test.mjs` holds the list to
 * the schema's columns.
 */
export const PLATFORM_NUMBERS = {
  messages_in: heldToNothing("what customers sent, by channel"),
  messages_out: heldToNothing("what left, by channel"),
  asks: heldToNothing("the customers' messages; with answered, the answer rate, whose alarm is answer_rate_zero"),
  answered: heldToNothing("the customers' messages anyone answered"),
  replies_answered: heldToNothing("the receptionist's replies sent at once"),
  replies_held: heldToNothing("the receptionist's replies held for a person: the hold rate, invariant 11's"),
  replies_handed_off: heldToNothing("the receptionist's replies that handed the thread to a person"),
  brain_p95_ms: {
    promise: true,
    most: 10_000,
    unit: "ms",
    alarm: true,
    why: "the receptionist's model answers within ten seconds, at the 95th percentile",
  },
  provider_failures: heldToNothing(
    "a provider's verdict on a send, by what it came to: a number's, read beside what left",
  ),
  tokens: heldToNothing("the model's tokens"),
  handled: heldToNothing("how the customers' messages ended"),
  topics: heldToNothing("what the customers asked about"),
  ai_tokens: heldToNothing("the model's tokens by purpose"),
  ai_usd: heldToNothing("the model's cost by purpose, at list price"),
  voice_usd: heldToNothing("the calls' cost"),
  job_lag_ms: {
    promise: true,
    most: { "0": 10_000, "1": 30_000, "2": 5 * MIN_MS },
    otherwise: 5 * MIN_MS,
    unit: "ms",
    alarm: true,
    why: "a reply's job is claimed within ten seconds of its time, a waiting person's within thirty, bulk within five minutes, at the 95th percentile",
  },
  first_answer_ms: {
    promise: true,
    most: { email: 15 * MIN_MS },
    otherwise: 30_000,
    unit: "ms",
    alarm: false,
    why: "a customer has a first answer within thirty seconds on a text channel and fifteen minutes by email, at the 95th percentile, whoever answers: the workspace's wait, a person's answer in it, so shown and not paged",
  },
  duplicate_sends: {
    promise: true,
    most: 0,
    unit: "count",
    alarm: true,
    why: "nobody is sent the same words twice (invariant 4)",
  },
  dead_letters: { promise: true, most: {}, otherwise: 0, unit: "count", alarm: true, why: "no job dies" },
  relay_lag_ms: {
    promise: true,
    most: 15_000,
    unit: "ms",
    alarm: true,
    why: "an event reaches its subscribers' deliveries within fifteen seconds, at the 95th percentile",
  },
  intake_lag_ms: {
    promise: true,
    most: {},
    otherwise: MIN_MS,
    unit: "ms",
    alarm: true,
    why: "a provider's delivery is kept within a minute of the provider's own clock, at the 95th percentile",
  },
} as const satisfies Record<string, PlatformNumber>;

type PlatformNumberName = keyof typeof PLATFORM_NUMBERS;

/** One number of one workspace's day past its target. */
interface PlatformBreach {
  number: PlatformNumberName;
  /** The key past it (a lane, a channel, a provider, a job's kind), or null for a single figure. */
  key: string | null;
  value: number;
  most: number;
}

/** The most a target allows for a key, or for the number itself. */
function mostFor(t: PlatformTarget, key: string | null): number {
  if (typeof t.most === "number") return t.most;
  return (
    (key !== null && Object.hasOwn(t.most, key) ? t.most[key] : undefined) ?? t.otherwise ?? Number.POSITIVE_INFINITY
  );
}

/** One number's breaches: a single figure past its most, or each key past its own. */
function breachesOf(name: PlatformNumberName, t: PlatformTarget, v: unknown): PlatformBreach[] {
  if (typeof v === "number") {
    const most = mostFor(t, null);
    return v > most ? [{ number: name, key: null, value: v, most }] : [];
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, x]) => {
      const most = mostFor(t, key);
      return typeof x === "number" && x > most ? [{ number: name, key, value: x, most }] : [];
    });
}

/**
 * A workspace's day's numbers past their targets: the paged ones alone unless `all`. A number the day does not have
 * (null, or a key absent) is past nothing.
 */
export function pastTarget(row: object, { all = false } = {}): PlatformBreach[] {
  const values = row as Readonly<Record<string, unknown>>;
  return (Object.entries(PLATFORM_NUMBERS) as Array<[PlatformNumberName, PlatformNumber]>).flatMap(([name, n]) =>
    n.promise && (all || n.alarm) ? breachesOf(name, n, values[name]) : [],
  );
}

/** A figure in its unit's words: seconds for a time, the count for a count. */
function figure(name: PlatformNumberName, v: number): string {
  const n: PlatformNumber = PLATFORM_NUMBERS[name];
  return n.promise && n.unit === "ms" ? seconds(v) : String(v);
}

/** The page for a day whose numbers went past their targets: one line per workspace, each number and its target. */
export function pastTargetPage(
  day: string,
  workspaces: ReadonlyArray<{ tenantId: string; name: string; breaches: readonly PlatformBreach[] }>,
): { subject: string; body: string } {
  const lines = workspaces.map(
    (w) =>
      `  ${w.name} (${w.tenantId}): ` +
      w.breaches
        .map(
          (b) =>
            `${b.number}${b.key === null ? "" : ` ${b.key}`} ${figure(b.number, b.value)}, target ${figure(b.number, b.most)}`,
        )
        .join("; "),
  );
  return {
    subject: `${plural(workspaces.length, "workspace", "workspaces")} past a target on ${day}`,
    body:
      `On ${day} (UTC) these numbers went past the targets the platform answers for (decision 0031, invariant 12; ` +
      `contracts PLATFORM_NUMBERS):\n\n${lines.join("\n")}\n\n` +
      `The day's counts are in platform_metrics (the back office's day by workspace).\n`,
  };
}
