/** Health: looks. */

import { anthropicPaused, enforcementWords, type HealthActedOnProfileDto } from "../../ai/anthropic-enforcement";
import { clocksOf, pagesOf, failureReadingOf, jobWords, type ClockVM } from "../health-clocks";
import { promiseDaysOf } from "../health-promises";
import { callsOf, sendsOf } from "../health-parts/sends-calls";
import { connectionsOf, deliveriesOf, modelCallsOf } from "../health-parts/models-connections";
import { PLATFORM_WHERE, type HealthScope } from "../health-scope";
import { countPhrase, type HealthAct, type HealthDto, type HealthSeverity, type HealthWindow } from "./dtos";

/** One row of Needs a look: what, why, where, since when, and its one act. */
export interface HealthLookVM {
  key: string;
  severity: HealthSeverity;
  what: string;
  why: string;
  where: string;
  ours: boolean;
  sinceMs: number;
  since: string;
  act: HealthAct;
  /** The one workspace it is about, where it is about one: the panel's way to open it. */
  tenantId: string | null;
  /** The words a panel opens with: the door's own answer, as it gave it. */
  detail: string | null;
  /** A plain reading of the detail, where its shape says one (failureReadingOf). */
  reading: string | null;
  /** What a row of several holds, named: the clocks one problem stopped. */
  items: { label: string; rows: string[] } | null;
}

export const SEVERITY_RANK: Record<HealthSeverity, number> = { red: 0, amber: 1, plain: 2 };

/** What each source of looks reads: the read, its scope, the clock, and how a row names its workspace and its time. */
export interface LookCtx {
  h: HealthDto;
  scope: HealthScope;
  nowMs: number;
  ours: Set<string>;
  nameOf: (id: string | null) => string;
  sinceWords: (ms: number) => string;
}

/** A row with what most rows leave unsaid: no one workspace, no door's answer, no reading. */
const look = (
  r: Omit<HealthLookVM, "tenantId" | "detail" | "reading" | "items"> & Partial<HealthLookVM>,
): HealthLookVM => ({
  tenantId: null,
  detail: null,
  reading: null,
  items: null,
  ...r,
});

/** The one workspace a group of rows names, where it names one. */
const onlyOne = (ids: readonly string[]): string | null => (ids.length === 1 ? (ids[0] ?? null) : null);

const sideKey = (ours: boolean) => (ours ? "ours" : "customers");

/**
 * The clocks not running, one row for each problem: ten clocks one missing secret stopped are one thing to mend, said
 * once, the clocks it stopped named in its panel; a clock stopped for a reason of its own is a row of its own.
 */
function clockLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  const byProblem = new Map<string, ClockVM[]>();
  for (const c of clocksOf(h.clocks).rows.filter((x) => x.state === "stopped")) {
    const k = c.problem ?? "";
    byProblem.set(k, [...(byProblem.get(k) ?? []), c]);
  }
  return [...byProblem.values()].flatMap((group) => {
    const [first] = group;
    if (!first) return [];
    const one = group.length === 1;
    const spoke = group.map((c) => c.lastMs).filter((ms): ms is number => ms !== null);
    const sinceMs = spoke.length ? Math.min(...spoke) : null;
    return [
      look({
        key: one ? `clock:${first.sweep}` : `clocks:${first.sweep}`,
        severity: "red",
        what: one ? `${first.words} isn't running` : `${group.length} clocks aren't running`,
        why: first.problem ?? "It has not reported in time.",
        where: PLATFORM_WHERE,
        ours: false,
        sinceMs: sinceMs ?? nowMs,
        since: sinceMs ? sinceWords(sinceMs) : "",
        act: { kind: "open", tab: "background" },
        detail: first.problem,
        items: one ? null : { label: "The clocks", rows: group.map((c) => c.words) },
      }),
    ];
  });
}

function backlogLooks({ h, nowMs }: LookCtx): HealthLookVM[] {
  if (h.backlog === null || h.backlog <= 0) return [];
  return [
    look({
      key: "backlog",
      severity: "red",
      what: `${countPhrase(h.backlog, "job")} waiting unclaimed`,
      why: "Due jobs nobody has claimed for two minutes: the heartbeat is scheduled and not draining.",
      where: PLATFORM_WHERE,
      ours: false,
      sinceMs: nowMs,
      since: "now",
      act: { kind: "open", tab: "background" },
    }),
  ];
}

/** A kind an operator paused: its work waits until someone resumes it, so it is a look for as long as it is paused. */
function pausedLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return (h.ledger?.kinds ?? [])
    .filter((k) => k.paused_at)
    .map((key) => {
      const at = Date.parse(key.paused_at ?? "") || nowMs;
      return look({
        key: `paused:${key.kind}`,
        severity: "amber",
        what: `${jobWords(key.kind)} is paused`,
        why: key.paused_why ?? HEALTH_WORDS.pausedWhy,
        where: PLATFORM_WHERE,
        ours: false,
        sinceMs: at,
        since: sinceWords(at),
        act: { kind: "pause_kind", jobKind: key.kind, paused: false },
      });
    });
}

function promiseLooks({ h, scope, nowMs, ours, sinceWords }: LookCtx): HealthLookVM[] {
  return promiseDaysOf(h.day_rows, ours, scope, h.days)
    .rows.filter((r) => r.state === "missed" && r.alarm)
    .map((item) =>
      look({
        key: `promise:${item.key}`,
        severity: "red",
        what: `${item.title}: missed on ${countPhrase(item.missedDays, "day")}`,
        why: item.worst ?? "",
        where: item.where,
        ours: scope === "ours",
        sinceMs: item.lastMissMs ?? nowMs,
        since: item.lastMissMs ? sinceWords(item.lastMissMs) : "",
        act: { kind: "open", tab: "promises" },
      }),
    );
}

function jobLooks({ h, ours, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return (h.failed_jobs ?? []).map((row) => {
    const at = Date.parse(row.updated_at);
    return look({
      key: `job:${row.id}`,
      severity: "amber",
      what: `${jobWords(row.kind)} failed${row.attempts > 1 ? `, ${row.attempts} tries` : ""}`,
      why: `Job ${row.kind}${row.last_error ? ` · ${row.last_error.slice(0, 120)}` : ""}`,
      where: nameOf(row.tenant_id),
      ours: ours.has(row.tenant_id),
      sinceMs: at,
      since: sinceWords(at),
      act: { kind: "run_again", jobId: row.id, tenantId: row.tenant_id },
      tenantId: row.tenant_id,
      detail: row.last_error,
      reading: failureReadingOf(row.last_error, row.attempts),
    });
  });
}

function deliveryLooks({ h, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return deliveriesOf(h.parts, "all").failures.map((failure) =>
    look({
      key: `delivery:${failure.subscriber}:${sideKey(failure.ours)}`,
      severity: "red",
      what: `${failure.words}: ${countPhrase(failure.n, "delivery", "deliveries")} failed`,
      why: failure.reason,
      where: failure.where.map(nameOf).join(", "),
      ours: failure.ours,
      sinceMs: failure.lastMs,
      since: sinceWords(failure.lastMs),
      act: { kind: "redrive", subscriber: failure.subscriber },
      tenantId: onlyOne(failure.where),
      detail: failure.reason,
      reading: /no longer holds the event/.test(failure.reason)
        ? "The event was removed before its delivery ran, so delivering it again can't work: the row stays as the record."
        : null,
    }),
  );
}

function pageLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return pagesOf(h.pages, h.workspaces, nowMs)
    .rows.filter((x) => x.recent)
    .map((item) =>
      look({
        key: `page:${item.key}`,
        severity: item.alertedToday ? "red" : "amber",
        what: item.words,
        why: `The pager saw it ${countPhrase(item.count, "time")} since ${item.first}${item.lastMailed ? `, last mailed ${item.lastMailed}` : ""}`,
        where: item.where,
        ours: item.ours,
        sinceMs: item.firstMs,
        since: sinceWords(item.firstMs),
        act: { kind: "open", tab: "background" },
      }),
    );
}

function modelLooks({ h, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return modelCallsOf(h.parts, "all").failureGroups.map((failureGroup) =>
    look({
      key: `model:${failureGroup.purpose}:${sideKey(failureGroup.ours)}`,
      severity: failureGroup.credit ? "red" : "amber",
      what: `${failureGroup.words}: ${countPhrase(failureGroup.n, "model call")} got no answer`,
      why: failureGroup.reason ?? "No reason was kept: the call came before the ledger kept them.",
      where: failureGroup.where.map(nameOf).join(", "),
      ours: failureGroup.ours,
      sinceMs: failureGroup.lastMs,
      since: sinceWords(failureGroup.lastMs),
      act: { kind: "open", tab: failureGroup.purpose === "ask" ? "ask" : "model" },
      tenantId: onlyOne(failureGroup.where),
      detail: failureGroup.reason,
      reading: failureGroup.credit ? "The key's credit ran out: every model call stops until it is topped up." : null,
    }),
  );
}

/** Whom a profile Anthropic acted on stands for, as a row names them: a workspace by name, a person by no more than that. */
export const actedOnProfileWho = (onProfile: HealthActedOnProfileDto, nameOf: (id: string | null) => string): string =>
  onProfile.kind === "workspace" ? nameOf(onProfile.tenant_id) : "One person";

/** What Anthropic has acted on: that account's model calls have stopped or may be refused, and only that account's. */
function anthropicLooks({ h, ours, nowMs, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return (h.anthropic_profiles?.acted_on ?? []).map((items) => {
    const atMs = items.at ? Date.parse(items.at) : nowMs;
    const paused = anthropicPaused(items.status);
    return look({
      key: `anthropic:${items.id}`,
      severity: paused ? "red" : "amber",
      what: `Anthropic has ${paused ? "paused" : "limited"} one account's model calls`,
      why: enforcementWords(items.status, items.actions),
      where: actedOnProfileWho(items, nameOf),
      ours: !!items.tenant_id && ours.has(items.tenant_id),
      sinceMs: atMs,
      since: sinceWords(atMs),
      act: { kind: "open", tab: "model" },
      tenantId: items.tenant_id,
    });
  });
}

function sendLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return sendsOf(h.parts, "all").troubled.map((item) =>
    look({
      key: `sends:${item.channel}:${sideKey(item.ours)}`,
      severity: "amber",
      what: `${item.words}: ${item.failed} of ${item.total} sends failed`,
      why: item.topError ?? "The provider said why on each message.",
      where: item.ours ? "Ours" : "Customers",
      ours: item.ours,
      sinceMs: item.lastMs ?? nowMs,
      since: item.lastMs ? sinceWords(item.lastMs) : "",
      act: { kind: "open", tab: "messages" },
    }),
  );
}

function callLooks({ h, sinceWords }: LookCtx): HealthLookVM[] {
  return callsOf(h.parts, "all").troubleByScope.map((item) =>
    look({
      key: `calls:${item.reason}:${sideKey(item.ours)}`,
      severity: "amber",
      what: `${countPhrase(item.n, "call")}: ${item.words}`,
      why: item.why,
      where: item.ours ? "Ours" : "Customers",
      ours: item.ours,
      sinceMs: item.lastMs,
      since: sinceWords(item.lastMs),
      act: { kind: "open", tab: "messages" },
    }),
  );
}

function connectionLooks({ h, nowMs, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return connectionsOf(h.parts).map((context) =>
    look({
      key: `connection:${context.key}`,
      severity: "amber",
      what: context.what,
      why: context.why,
      where: nameOf(context.tenantId),
      ours: context.ours,
      sinceMs: context.sinceMs ?? nowMs,
      since: context.sinceMs ? sinceWords(context.sinceMs) : "",
      act: { kind: "open", tab: "messages" },
      tenantId: context.tenantId,
      detail: context.why,
    }),
  );
}

export const LOOK_SOURCES = [
  clockLooks,
  backlogLooks,
  pausedLooks,
  promiseLooks,
  jobLooks,
  deliveryLooks,
  pageLooks,
  anthropicLooks,
  modelLooks,
  sendLooks,
  callLooks,
  connectionLooks,
];

/** A date as a row says one: "21 Oct". */
export function dateWords(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** What a quiet overview says, never an empty card. */
export function healthQuietWords(scope: HealthScope): string {
  return scope === "ours"
    ? "Nothing needs a look in our own workspaces."
    : "Nothing needs a look. Every promise with a number was kept, and every clock is running.";
}

export const HEALTH_WORDS = {
  title: "Health",
  scope: "Whose numbers",
  window: "How far back",
  windowWords: (d: HealthWindow) => (d === 7 ? "7 days" : "30 days"),
  tabs: "Health's parts",
  needsALook: "Needs a look",
  needsALookSub: "worst first",
  keys: "↑↓ move · Enter opens · R run again",
  failed: "the platform's health",
  runAgain: "Run again",
  runAgainAsk: "Run this job again?",
  runAgainDetail: "A fresh job of the same kind and payload, due now. A send is never run again from here.",
  redrive: "Deliver again",
  redriveAsk: (s: string) => `Deliver every failed ${s} again?`,
  redriveDetail:
    "Each failed delivery of this subscriber is scheduled once more; one whose event is gone stays failed.",
  open: "Open",
  copyForBug: "Copy for a bug report",
  readFirst: "Read this first",
  whatItAnswered: "What it answered",
  where: "Where",
  close: "Close",
  ranAgain: "It's on the ledger again.",
  redriven: (n: number) => (n === 0 ? "Nothing was left to deliver again." : `${n} scheduled again.`),
  runKindAgain: "Run every failed one again",
  runKindAgainAsk: (kind: string) => `Run every failed ${kind} again?`,
  runKindAgainDetail:
    "Each one that failed since then gets one fresh job of its kind and payload, due now. Sends, and jobs that spoke, are never run again.",
  ranKindAgain: (n: number, refused: number) =>
    n === 0 && refused === 0
      ? "Nothing had failed since then."
      : `${n} on the ledger again${refused ? `; ${refused} left as they are (sends, or already run again)` : ""}.`,
  pause: "Pause",
  pauseAsk: (kind: string) => `Pause ${kind}?`,
  pauseDetail: "No claim takes its work until you resume it; what is due waits where it is.",
  resume: "Resume",
  resumeAsk: (kind: string) => `Resume ${kind}?`,
  resumeDetail: "What waited is due at once, oldest first.",
  pausedNow: "Paused: its work waits until it is resumed.",
  resumedNow: "Resumed: what waited is on its way.",
  pausedWhy: "An operator paused it.",
  ledgerTitle: "The ledger now",
  ledgerSub: "by lane · waiting means a retry waits its turn",
  ledgerUnread: "The ledger could not be read just now.",
  canaryWords: (ago: string) => `The ledger's own check last finished ${ago}.`,
  canaryNever: "The ledger's own check has not finished yet.",
  oursNote: "Ours: our own workspaces (the nightly suite's, the smoke test), counted apart and never paged.",
} as const;
