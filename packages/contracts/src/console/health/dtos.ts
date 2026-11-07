/** Health: dtos. */

import type { HealthAnthropicProfilesDto } from "../../ai/anthropic-enforcement";
import type { Tone } from "../../shell/tone";
import type { PageVitalsRowDto } from "../../shell/vitals";
import type { PageSpeedRowDto, PageSpotRowDto } from "../../shell/page-speed";
import type { LedgerNowDto } from "../ledger";
import { vitalVerdict } from "../../shell/vitals";
import type { PlatformDayRowDto } from "../../workspace/platform-days";
import { WEEK_MS } from "../../shared/time";
import { capitalize } from "../../shared/words";
import { CONSOLE_PATH } from "../path";
import { clocksOf, type HealthClockDto, type OperatorPageDto } from "../health-clocks";
import { promiseDaysOf } from "../health-promises";
import { callsOf, sendsOf, webhooksOf, type HealthPartsDto } from "../health-parts/sends-calls";
import { deliveriesOf } from "../health-parts/models-connections";
import { healthAskOf } from "../health-ask";
import { inScope, oursOf, type HealthScope, type HealthWorkspaceDto } from "../health-scope";

// --------------------------------------------------------------------------------------------------- the read

/** A job that failed for good (the ledger's dead letter): Run again's row. */
export interface FailedJobDto {
  id: string;
  tenant_id: string;
  kind: string;
  lane: number | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** One error a page hit, as the beacon kept it (client_errors, 00469). */
export interface ClientErrorDto {
  at: string;
  fingerprint: string;
  boundary: string;
  page: string | null;
  name: string;
  message: string;
  build: string | null;
  device: string | null;
  member_key: string | null;
}

/** The windows Health reads: a week or a month. */
export const HEALTH_WINDOWS = [7, 30] as const;

export type HealthWindow = (typeof HEALTH_WINDOWS)[number];

/** What GET platform/health answers. A part that could not be read is null, and says so; never an empty list. */
export interface HealthDto {
  days: HealthWindow;
  checked_at: string;
  workspaces: HealthWorkspaceDto[] | null;
  clocks: HealthClockDto[] | null;
  backlog: number | null;
  failed_jobs: FailedJobDto[] | null;
  /** The ledger now (jobs_ledger_now, 00526); absent from a server before it. */
  ledger?: LedgerNowDto | null;
  pages: OperatorPageDto[] | null;
  /** The nightly roll-up's days (platform_metrics), the window's. */
  day_rows: PlatformDayRowDto[] | null;
  parts: HealthPartsDto | null;
  client_errors: ClientErrorDto[] | null;
  vitals: PageVitalsRowDto[] | null;
  speed: { rows: PageSpeedRowDto[]; spots: PageSpotRowDto[] } | null;
  /** Whom Anthropic is told a call is for (decision 0097), and whom it has paused. Absent from a server before it. */
  anthropic_profiles?: HealthAnthropicProfilesDto | null;
}

// ------------------------------------------------------------------------------------------------- the states

/** A part's state: kept, worth a look, missed, or not judged; plain for a number with no target (what it cost). */
export type HealthState = "kept" | "look" | "missed" | "unjudged" | "plain";

export const HEALTH_STATE_WORDS: Record<HealthState, { label: string; tone: Tone }> = {
  kept: { label: "Kept", tone: "ok" },
  look: { label: "A look", tone: "warn" },
  missed: { label: "Missed", tone: "danger" },
  unjudged: { label: "Not judged", tone: "plain" },
  plain: { label: "Spend", tone: "plain" },
};

// -------------------------------------------------------------------------------------------------- the tabs

export const HEALTH_TABS = ["overview", "promises", "background", "messages", "ask", "model", "speed", "bugs"] as const;

export type HealthTab = (typeof HEALTH_TABS)[number];

export const HEALTH_TAB_WORDS: Record<HealthTab, string> = {
  overview: "Overview",
  promises: "Promises",
  background: "Background work",
  messages: "Messages and calls",
  ask: "Ask",
  model: "Model calls",
  speed: "App speed",
  bugs: "Bugs",
};

const HEALTH_PATH = `${CONSOLE_PATH}/health`;

/** The tab an address under /console/health names: Overview for none, or for one it cannot read. */
export function healthTabOf(pathname: string | null | undefined): HealthTab {
  const parts = ((pathname ?? "").split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const tab = parts[0] === CONSOLE_PATH.slice(1) && parts[1] === "health" ? parts[2] : undefined;
  return (HEALTH_TABS as readonly string[]).includes(tab ?? "") ? (tab as HealthTab) : "overview";
}

/** A tab's address: /console/health for the overview, /console/health/<tab> for the others. */
export function healthPathOf(tab: HealthTab): string {
  return tab === "overview" ? HEALTH_PATH : `${HEALTH_PATH}/${tab}`;
}

// ------------------------------------------------------------------------------------------------- the tiles

/** One part on the overview: its name, its state, one number and its unit, one line of why, and the tab it opens. */
export interface HealthTileVM {
  key: string;
  title: string;
  state: HealthState;
  value: string;
  unit: string;
  line: string;
  tab: HealthTab;
}

export const countPhrase = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Seconds as a tile says them: "1.8 s", "12.8 s", "0.4 s". */
export function secondsWords(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const s = ms / 1000;
  return `${s >= 100 ? Math.round(s) : s.toFixed(1)} s`;
}

/** Dollars as a tile says them. */
export function dollarsWords(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A part judged by its failures: unread, worth a look, kept, or nothing to judge. */
const partState = (read: boolean, failing: boolean, any: boolean): HealthState =>
  !read ? "unjudged" : failing ? "look" : any ? "kept" : "unjudged";

function promisesTile(health: HealthDto, scope: HealthScope): HealthTileVM {
  const promises = promiseDaysOf(health.day_rows, oursOf(health.workspaces), scope, health.days);
  const kept = promises.rows.filter((r) => r.state === "kept").length;
  const missed = promises.rows.filter((r) => r.state === "missed");
  const read = health.day_rows !== null;
  return {
    key: "promises",
    title: "Promises",
    state: !read ? "unjudged" : missed.length ? "missed" : kept ? "kept" : "unjudged",
    value: read ? `${kept} of ${promises.rows.length}` : "—",
    unit: "kept every day",
    line: !read
      ? "The nightly counts could not be read just now."
      : missed.length
        ? capitalize(missed.map((r) => `${r.short} late on ${countPhrase(r.missedDays, "day")}`).join(" · "))
        : "Every promise with a number was kept",
    tab: "promises",
  };
}

function backgroundTile(health: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM {
  const ours = oursOf(health.workspaces);
  const clocks = clocksOf(health.clocks);
  const failedJobs = (health.failed_jobs ?? []).filter((j) => inScope(ours.has(j.tenant_id), scope));
  const weekJobs = failedJobs.filter((j) => Date.parse(j.updated_at) >= nowMs - WEEK_MS).length;
  const notRunning = clocks.rows.filter((c) => c.state === "stopped").length;
  const late = health.backlog ?? 0;
  const state: HealthState =
    health.clocks === null || health.backlog === null
      ? "unjudged"
      : notRunning || late > 0
        ? "missed"
        : failedJobs.length
          ? "look"
          : "kept";
  return {
    key: "background",
    title: "Background work",
    state,
    value: health.clocks === null ? "—" : `${clocks.rows.length - notRunning} of ${clocks.rows.length}`,
    unit: "clocks running",
    line: [
      health.backlog === null ? "The backlog unread" : late > 0 ? `${countPhrase(late, "job")} late` : "No job late",
      failedJobs.length
        ? `${failedJobs.length} failed for good${weekJobs && weekJobs < failedJobs.length ? `, ${weekJobs} this week` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    tab: "background",
  };
}

function deliveriesTile(health: HealthDto, scope: HealthScope): HealthTileVM {
  const deliveries = deliveriesOf(health.parts, scope);
  return {
    key: "deliveries",
    title: "Deliveries",
    state: partState(health.parts !== null, deliveries.failed > 0, deliveries.total > 0),
    value: health.parts === null ? "—" : deliveries.failed.toLocaleString("en-US"),
    unit: `of ${deliveries.total.toLocaleString("en-US")} failed`,
    line: deliveries.failed
      ? deliveries.subscribers
          .filter((x) => x.failed)
          .map((x) => `${x.words}: ${x.failed}`)
          .join(" · ")
      : "Every change reached what reads it",
    tab: "background",
  };
}

function sendsTile(health: HealthDto, scope: HealthScope): HealthTileVM {
  const sends = sendsOf(health.parts, scope);
  const failing = sends.channels
    .filter((c) => c.failed)
    .map((c) => `${c.words} ${c.failed} of ${c.total.toLocaleString("en-US")}`)
    .join(" · ");
  return {
    key: "sends",
    title: "Sends",
    state: partState(health.parts !== null, sends.failed > 0, sends.total > 0),
    value: health.parts === null ? "—" : `${sends.failed} of ${sends.total.toLocaleString("en-US")}`,
    unit: "failed",
    line: !sends.channels.length
      ? "Nothing was sent"
      : failing || `${sends.delivered.toLocaleString("en-US")} confirmed delivered`,
    tab: "messages",
  };
}

function callsTile(health: HealthDto, scope: HealthScope): HealthTileVM {
  const calls = callsOf(health.parts, scope);
  return {
    key: "calls",
    title: "Calls",
    state: partState(health.parts !== null, calls.trouble.length > 0, calls.total > 0),
    value: health.parts === null ? "—" : `${calls.connected} of ${calls.total}`,
    unit: "connected",
    line: calls.trouble.length
      ? capitalize(calls.trouble.map((t) => `${countPhrase(t.n, "call")}: ${t.words}`).join(" · "))
      : calls.total
        ? "No call failed on our side"
        : "No call came in",
    tab: "messages",
  };
}

function webhooksTile(health: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM {
  const webhooks = webhooksOf(health.parts, scope, nowMs);
  return {
    key: "webhooks",
    title: "Webhooks in",
    state: partState(health.parts !== null, webhooks.unverified > 0, webhooks.total > 0),
    value: health.parts === null ? "—" : webhooks.total.toLocaleString("en-US"),
    unit: "this week",
    line: webhooks.total
      ? `${webhooks.providers.map((p) => `${p.words} ${p.n}`).join(" · ")}${webhooks.unverified ? ` · ${webhooks.unverified} unverified` : ""}`
      : "No provider delivered anything this week",
    tab: "messages",
  };
}

function askTile(health: HealthDto, scope: HealthScope): HealthTileVM {
  const healthAsk = healthAskOf(health.parts, scope);
  const request = health.parts !== null && healthAsk.answers > 0;
  return {
    key: "ask",
    title: "Ask",
    state: !request ? "unjudged" : healthAsk.slow ? "missed" : healthAsk.failed ? "look" : "kept",
    value: request ? secondsWords(healthAsk.latencyP95) : "—",
    unit: `at p95, ${countPhrase(healthAsk.answers, "answer")}`,
    line: !request
      ? "Nobody asked Ask anything"
      : [
          healthAsk.failed ? `${healthAsk.failed} failed` : "None failed",
          healthAsk.usd !== null ? dollarsWords(healthAsk.usd) : null,
          healthAsk.oursShare !== null && scope !== "customers"
            ? `ours ${Math.round(healthAsk.oursShare * 100)}% of it`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
    tab: "ask",
  };
}

/** The eight parts' tiles, each judged in the scope. */
export function healthTilesOf(health: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM[] {
  return [
    promisesTile(health, scope),
    backgroundTile(health, scope, nowMs),
    deliveriesTile(health, scope),
    sendsTile(health, scope),
    callsTile(health, scope),
    webhooksTile(health, scope, nowMs),
    askTile(health, scope),
    speedTile(health),
  ];
}

/** App speed's tile: the largest paint at p75 against web.dev's line, with the tap and the first byte beside it. */
function speedTile(health: HealthDto): HealthTileVM {
  const all = (metric: string) => (health.vitals ?? []).find((r) => r.metric === metric && r.page === null) ?? null;
  const lcp = all("LCP");
  const inp = all("INP");
  const ttfb = all("TTFB");
  if (!lcp)
    return {
      key: "speed",
      title: "App speed",
      state: "unjudged",
      value: "—",
      unit: "LCP, p75",
      line: health.vitals === null ? "The page timings could not be read just now." : "No page sent its timings yet",
      tab: "speed",
    };
  const verdict = vitalVerdict("LCP", lcp.p75);
  return {
    key: "speed",
    title: "App speed",
    state: verdict === "good" ? "kept" : verdict === "poor" ? "missed" : "look",
    value: secondsWords(lcp.p75),
    unit: "LCP, p75",
    line: [
      inp ? `INP ${Math.round(inp.p75)} ms` : null,
      ttfb ? `TTFB ${Math.round(ttfb.p75)} ms` : null,
      countPhrase(lcp.samples, "timing"),
    ]
      .filter(Boolean)
      .join(" · "),
    tab: "speed",
  };
}

// ------------------------------------------------------------------------------------------- what needs a look

export type HealthSeverity = "red" | "amber" | "plain";

/** What a row's one act does: run a failed job again, deliver a subscriber's failures again, or open a tab. */
export type HealthAct =
  | { kind: "run_again"; jobId: string; tenantId: string }
  | { kind: "redrive"; subscriber: string }
  | { kind: "run_kind_again"; jobKind: string; sinceIso: string }
  | { kind: "pause_kind"; jobKind: string; paused: boolean }
  | { kind: "open"; tab: HealthTab };
