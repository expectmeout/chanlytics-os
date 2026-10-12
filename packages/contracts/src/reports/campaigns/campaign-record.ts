/**
 * Reports › Campaigns — what the lens is read from, judged once on the server.
 *
 * The lens reads three things beside the sends' own report (campaign_series, which the Campaigns home reads too). The
 * window is the database's (campaign_ledger, 00405): the people the runs reached and who wrote back, the runs that sent,
 * what was held back and why, the runs that stopped, why sends failed, each message's sends and replies, how soon the
 * first reply came and how long an approval waited. What is stuck now is a second answer (campaign_stuck, 00406): the runs
 * waiting for an OK, the runs that failed, the people who answered and may be waiting, the templates Meta stopped. The
 * third is no database's: the connected number's health, which the reader derives from the channel's stored config
 * (lines/number-standing.ts numberHealthOfConfig). This is the two answers' shapes, their guards, and the one place the
 * three become what the route answers.
 *
 * SQL ships facts and never verdicts, so the verdicts are made here by the rules the product already has: a run is late when
 * the verb that approves it would refuse it (runApprovalRefusal, a reach-out's never), a reply waits on you by the one
 * standing (standingOf: the workspace's, so the answer is the same for every member), and the day is the workspace's own
 * zone, never the machine's. Either answer may be missing without the other: a database with no campaign_ledger still has
 * what is stuck, and one with no campaign_stuck still has the window. Pure. The words are the fold's, which only Reports'
 * page reads; this stays in the root barrel for the server, and a page imports its types alone.
 */
import { standingOfThread } from "../../conversations/standing";
import { runApprovalRefusal } from "../../playbooks/playbook-approval";
import { nextOpenMoment } from "../../playbooks/playbook-schedule";
import { zoneDayKey } from "../../shared/clock";
import { isCount, recordOrNull } from "../../shared/unknown";

/** The most rows campaign_stuck lists in each list: the SQL's `limit 500` (00406). A list this long may have been cut. */
const CAMPAIGN_ROWS_LISTED = 500;

/** How many of the templates Meta stopped the lens names; their count is of those campaign_stuck lists (at most 100). */
const TEMPLATES_NAMED = 3;

/* ---------------------------------------------------------------- campaign_ledger (00405) */

/** The people a period's runs sent to, and how many of them wrote back: a person once, however many runs sent to them. */
interface PeopleCountsDto {
  sent_to: number;
  wrote_back: number;
}

/** The runs of a period that sent, by kind. A reach-out step's run is never here: its people are reach_out_sends. */
interface RunCountsDto {
  moment: number;
  broadcast: number;
}

/** Messages that failed after they were sent, for one cause: the channel they went by and the provider's code, or with none one word of a closed set. */
interface FailedSendDto {
  channel: string;
  code: number | null;
  kind: string | null;
  n: number;
}

/** One message's sends in the window (by the run's template and language), the ones whose reply window is over, and the answered of those. */
interface ByMessageDto {
  name: string;
  language: string;
  sent: number;
  mature: number;
  replied: number;
}

/** campaign_ledger's own answer (00405): counts, and the business's own template names; never a person's name, number or address. */
export interface CampaignLedgerSeriesDto {
  timezone: string;
  /** The workspace's day in that zone when the read was made: "2026-10-06". */
  today: string;
  /** The window's last day (00360): today for a period by name, an earlier day for days a member picked. */
  end?: string;
  days: number;
  /** The window (`now`) and the same number of days before it (`before`); `counting` are the people whose reply window is not over. */
  people: { now: PeopleCountsDto & { counting: number }; before: PeopleCountsDto };
  runs: { now: RunCountsDto; before: RunCountsDto };
  /** People a run did not send to, dated by the run, by a reason of ours (`other` where the database held none). */
  held: { total: number; skipped: number; failed: number; by_reason: Record<string, number> };
  /** The runs that failed or were canceled, the failed by their code. */
  stopped: { failed: number; canceled: number; by_failure: Record<string, number> };
  failed_sends: { total: number; by_code: FailedSendDto[] };
  /** The twenty messages with most sends. */
  by_message: ByMessageDto[];
  /** The window's answered sends, by the seconds to the first answer. */
  first_reply: {
    n: number;
    median_s: number | null;
    buckets: { m15: number; h1: number; h4: number; h24: number; h72: number };
  };
  /** The approvals made in the window, by the seconds from the run's being made to the decision. */
  approval: { n: number; median_s: number | null; buckets: { h1: number; h4: number; h24: number; over: number } };
}

/* ---------------------------------------------------------------- campaign_stuck (00406) */

/** A run waiting for an OK, of any kind (a reach-out step's too): the facts the verb's refusal reads. */
interface WaitingRunRaw {
  id: string;
  name: string;
  kind: "moment" | "broadcast" | "reach_out";
  playbook_id: string | null;
  /** The day the run was made for, "2026-10-06"; null for a run that has none (a broadcast). */
  run_for: string | null;
  trigger: string | null;
  audience_kind: string | null;
  created_at: string;
  recipient_count: number;
}

/** A run that failed in the last thirty days, by the code of ours the database sanitised it to. */
interface FailedRunRaw {
  id: string;
  name: string;
  kind: "moment" | "broadcast" | "reach_out";
  failure: string;
  finished_at: string;
}

/** A thread of someone who answered a campaign, with the columns the one standing reads. A superset of the threads that wait. */
interface ReplyRaw {
  state: string;
  paused_until: string | null;
  assignee_user_id: string | null;
  open_escalation: boolean;
  /** What the open hold is for (the thread's newest open one), so a hold that waits on nobody is not counted (00409). Absent from a database before it. */
  open_escalation_reason?: string | null;
  replied_at: string;
}

/** A WhatsApp template Meta paused, turned off or rejected (the SQL's own filter), used or not. */
interface TemplateRaw {
  name: string;
  language: string;
  status: "paused" | "disabled" | "rejected";
  quality: string | null;
}

/** campaign_stuck's own answer (00406): as of now, never the window; each list at most 500 (templates at most 100). */
export interface CampaignStuckRawDto {
  runs_waiting: WaitingRunRaw[];
  runs_failed: FailedRunRaw[];
  replies: ReplyRaw[];
  templates: TemplateRaw[];
}

/* ---------------------------------------------------------------- what the route answers */

/** The connected WhatsApp number, as the lens says it: none connected, one that could not be read, or its health and when it was last checked. */
export type CampaignNumberDto =
  | { state: "none" }
  | { state: "unread" }
  | {
      state: "read";
      tone: "ok" | "warn" | "danger" | "unknown";
      can_send: boolean;
      label: string;
      checked_at: string | null;
    };

/** What is stuck in the workspace's campaigns now, judged. A `capped` list reached the 500 the database lists: its count is at least that. */
export interface CampaignStuckNowDto {
  /** Runs waiting for an OK; `late` are those the verb that approves them would refuse (their day has passed). */
  waiting: { n: number; late: number; oldest_at: string | null; capped: boolean };
  failed: { n: number; latest: { name: string; failure: string; at: string } | null; capped: boolean };
  /** People who answered a campaign and whose thread waits on a person, the workspace's. */
  replies: { n: number; oldest_at: string | null; capped: boolean };
  /** Every template Meta stopped, and the first three. */
  templates: {
    n: number;
    items: Array<{ name: string; language: string; status: "paused" | "disabled" | "rejected" }>;
  };
  number: CampaignNumberDto;
}

/**
 * What the route answers (the reader's body). `series` is null where the database has no campaign_ledger yet and `stuck`
 * where it has no campaign_stuck, or where that read failed (`stuck_failed`, set only then: a function a database lacks is
 * not a failure).
 */
export interface CampaignLedgerDto {
  timezone: string;
  today: string;
  end?: string;
  days: number;
  series: CampaignLedgerSeriesDto | null;
  stuck: CampaignStuckNowDto | null;
  stuck_failed?: true;
}

/* ---------------------------------------------------------------- the guards */

/** The value at the keys down `path`, through objects only: one gap and it is not there. */
const valueAt = (from: Record<string, unknown>, path: readonly string[]): unknown =>
  path.reduce<unknown>((at, key) => recordOrNull(at)?.[key], from);

const isObjectAt = (from: Record<string, unknown>, path: readonly string[]): boolean =>
  recordOrNull(valueAt(from, path)) !== null;

/** A list whose every row is an object: the fold reads a row's keys, and a null row would make it throw. */
function isRowsAt(from: Record<string, unknown>, path: readonly string[]): boolean {
  const rows = valueAt(from, path);
  return Array.isArray(rows) && rows.every((row) => recordOrNull(row) !== null);
}

/**
 * The parts of a campaign_ledger answer the lens's fold reads as objects (a period's counts from `people.now`, the held
 * reasons from `held.by_reason`, the buckets from `first_reply.buckets`, ...), each as the keys down to it: an answer
 * missing one would make the fold throw, so it is not an answer.
 */
const SERIES_OBJECTS: readonly (readonly string[])[] = [
  ["people", "now"],
  ["people", "before"],
  ["runs", "now"],
  ["runs", "before"],
  ["held", "by_reason"],
  ["stopped", "by_failure"],
  ["first_reply", "buckets"],
  ["approval", "buckets"],
];

/** The lists it reads rows from. */
const SERIES_LISTS: readonly (readonly string[])[] = [["failed_sends", "by_code"], ["by_message"]];

/**
 * Whether the database answered a Campaigns read (campaign_ledger): the window, and every part the lens is made of, each an
 * object or a list of objects, and not its own `{ error }` (an unknown workspace).
 */
export function isCampaignLedgerSeriesDto(answer: unknown): answer is CampaignLedgerSeriesDto {
  const a = recordOrNull(answer);
  return (
    a !== null &&
    typeof a.timezone === "string" &&
    typeof a.today === "string" &&
    (a.end === undefined || typeof a.end === "string") &&
    isCount(a.days) &&
    SERIES_OBJECTS.every((path) => isObjectAt(a, path)) &&
    SERIES_LISTS.every((path) => isRowsAt(a, path))
  );
}

const STUCK_LISTS = ["runs_waiting", "runs_failed", "replies", "templates"] as const;

/** Whether the database answered a stuck read (campaign_stuck): its four lists, each a list of objects, and not its own `{ error }`. */
export function isCampaignStuckRawDto(answer: unknown): answer is CampaignStuckRawDto {
  const a = recordOrNull(answer);
  return a !== null && STUCK_LISTS.every((key) => isRowsAt(a, [key]));
}

/* ---------------------------------------------------------------- judging what is stuck */

/** Where and when what is stuck is judged: the workspace's zone, and the instant the read was made. */
interface JudgedAt {
  tz: string;
  nowMs: number;
}

/** The earliest of some instants as the database wrote them; one that does not parse is no instant. Null for none. */
function oldestInstant(instants: readonly string[]): string | null {
  return instants.reduce<string | null>((first, at) => {
    if (Number.isNaN(Date.parse(at))) return first;
    return first === null || Date.parse(at) < Date.parse(first) ? at : first;
  }, null);
}

/**
 * The runs waiting for an OK, and how many the verb that approves them would refuse, by the rule it asks
 * (runApprovalRefusal): today is the workspace's day now, and an approval now sends on the day of the next open moment, so
 * a visit's run made for today is late after the last sending hour. A reach-out's run is never refused: the rule's own
 * exemption, read from the audience's kind.
 */
function runsWaitingOf(runs: readonly WaitingRunRaw[], at: JudgedAt): CampaignStuckNowDto["waiting"] {
  const days = {
    today: zoneDayKey(at.nowMs, at.tz),
    sendsOn: zoneDayKey(nextOpenMoment(at.tz, new Date(at.nowMs)).at.getTime(), at.tz),
  };
  const late = runs.filter(
    (r) =>
      runApprovalRefusal(
        { playbook_id: r.playbook_id, run_for: r.run_for, audience: { kind: r.audience_kind, trigger: r.trigger } },
        days,
      ) !== null,
  );
  return {
    n: runs.length,
    late: late.length,
    oldest_at: oldestInstant(runs.map((r) => r.created_at)),
    capped: runs.length >= CAMPAIGN_ROWS_LISTED,
  };
}

/** The runs that failed, and the newest of them. */
function runsFailedOf(runs: readonly FailedRunRaw[]): CampaignStuckNowDto["failed"] {
  const latest = runs.reduce<FailedRunRaw | null>((top, run) => {
    if (Number.isNaN(Date.parse(run.finished_at))) return top;
    return top === null || Date.parse(run.finished_at) > Date.parse(top.finished_at) ? run : top;
  }, null);
  return {
    n: runs.length,
    latest: latest === null ? null : { name: latest.name, failure: latest.failure, at: latest.finished_at },
    capped: runs.length >= CAMPAIGN_ROWS_LISTED,
  };
}

/**
 * Who answered a campaign and waits on a person, of the threads the database listed as possibly waiting: a thread that is
 * flagged and that nobody has, by the one standing. `needs_you` is unassigned and flagged whatever `assignee_is_me` says,
 * so the count is the workspace's, not one member's, and the read can be kept per workspace. A thread a teammate or the
 * owner has, and one put aside, are not waiting on you.
 */
function repliesWaitingOf(replies: readonly ReplyRaw[], nowMs: number): CampaignStuckNowDto["replies"] {
  const waiting = replies.filter(
    (r) =>
      standingOfThread(
        { state: r.state, paused_until: r.paused_until, assignee_user_id: r.assignee_user_id },
        // The hold itself where the database says what it is for: one that waits on nobody (a STOP) is no wait.
        r.open_escalation ? { reason: r.open_escalation_reason } : false,
        nowMs,
      ).standing === "needs_you",
  );
  return {
    n: waiting.length,
    oldest_at: oldestInstant(waiting.map((r) => r.replied_at)),
    capped: replies.length >= CAMPAIGN_ROWS_LISTED,
  };
}

/** The templates Meta stopped: how many, and the first few by name, language and status. */
function templatesStoppedOf(templates: readonly TemplateRaw[]): CampaignStuckNowDto["templates"] {
  return {
    n: templates.length,
    items: templates.slice(0, TEMPLATES_NAMED).map((t) => ({ name: t.name, language: t.language, status: t.status })),
  };
}

/* ---------------------------------------------------------------- the route's answer */

/**
 * The route's answer from the databases': the window as the series says it (`end` only where there is one), or, with no
 * campaign_ledger in this database (`series` null), as the route asked it (`head`); and what is stuck judged at `nowMs` in
 * the window's zone, with the number beside it. A stuck read that is missing (`stuck` null) is null; one that failed
 * (`stuckFailed`) is null with `stuck_failed` set, whatever raw answer is passed with it: a failed read has nothing to
 * judge. Pure: the reader feeds it the rows, the number and the clock.
 */
export function campaignLedgerDtoOf(
  series: CampaignLedgerSeriesDto | null,
  parts: {
    /** campaign_stuck's answer; null where the database has no such function or the read failed. */
    stuck: CampaignStuckRawDto | null;
    /** That the stuck read failed, as against a database that lacks it. */
    stuckFailed: boolean;
    /** The connected number, which rides with what is stuck. */
    number: CampaignNumberDto;
    /** The window as the route asked it, which the DTO echoes (used when `series` is null). */
    head: { timezone: string; today: string; end?: string; days: number };
    nowMs: number;
  },
): CampaignLedgerDto {
  const asked = series ?? parts.head;
  const at = { tz: asked.timezone, nowMs: parts.nowMs };
  const failed: Pick<CampaignLedgerDto, "stuck_failed"> = parts.stuckFailed ? { stuck_failed: true } : {};
  return {
    timezone: asked.timezone,
    today: asked.today,
    ...(asked.end === undefined ? {} : { end: asked.end }),
    days: asked.days,
    series,
    stuck:
      parts.stuck === null || parts.stuckFailed
        ? null
        : {
            waiting: runsWaitingOf(parts.stuck.runs_waiting, at),
            failed: runsFailedOf(parts.stuck.runs_failed),
            replies: repliesWaitingOf(parts.stuck.replies, at.nowMs),
            templates: templatesStoppedOf(parts.stuck.templates),
            number: parts.number,
          },
    ...failed,
  };
}
