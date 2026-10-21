/**
 * Health (decision 0068): whether the platform keeps its promises to every workspace, and if not, what broke, where,
 * and what to press. What the Health read answers (HealthDto), the scope every number is cut by (customers, ours, all),
 * the eight parts' tiles, and what needs a look, worst first.
 *
 * Every state comes from the platform's own targets (workspace/platform-days.ts PLATFORM_NUMBERS) or from a door's own
 * answer, never from a guess: a part with no number says Not judged, never Kept. Our own workspaces (tenants.ours, 00469)
 * are counted apart, so the nightly suite's numbers never read as a customer's. Pure: the reader hands it rows.
 */
import type { Tone } from "../shell/tone";
import type { PageVitalsRowDto } from "../shell/vitals";
import type { PageSpeedRowDto, PageSpotRowDto } from "../shell/page-speed";
import { vitalVerdict } from "../shell/vitals";
import type { PlatformDayRowDto } from "../workspace/platform-days";
import { agoWords, DAY_MS, WEEK_MS } from "../shared/time";
import { CONSOLE_PATH } from "./console-path";
import {
  clocksOf,
  pagesOf,
  failureReadingOf,
  jobWords,
  type HealthClockDto,
  type OperatorPageDto,
} from "./health-clocks";
import { promiseDaysOf } from "./health-promises";
import {
  callsOf,
  connectionsOf,
  deliveriesOf,
  modelCallsOf,
  sendsOf,
  webhooksOf,
  type HealthPartsDto,
} from "./health-parts";
import { healthAskOf } from "./health-ask";
import { inScope, oursOf, workspaceNamer, type HealthScope, type HealthWorkspaceDto } from "./health-scope";

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
  pages: OperatorPageDto[] | null;
  /** The nightly roll-up's days (platform_metrics), the window's. */
  day_rows: PlatformDayRowDto[] | null;
  parts: HealthPartsDto | null;
  client_errors: ClientErrorDto[] | null;
  vitals: PageVitalsRowDto[] | null;
  speed: { rows: PageSpeedRowDto[]; spots: PageSpotRowDto[] } | null;
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

const countPhrase = (n: number, one: string, many = `${one}s`) =>
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

function promisesTile(h: HealthDto, scope: HealthScope): HealthTileVM {
  const promises = promiseDaysOf(h.day_rows, oursOf(h.workspaces), scope, h.days);
  const kept = promises.rows.filter((r) => r.state === "kept").length;
  const missed = promises.rows.filter((r) => r.state === "missed");
  const read = h.day_rows !== null;
  return {
    key: "promises",
    title: "Promises",
    state: !read ? "unjudged" : missed.length ? "missed" : kept ? "kept" : "unjudged",
    value: read ? `${kept} of ${promises.rows.length}` : "—",
    unit: "kept every day",
    line: !read
      ? "The nightly counts could not be read just now."
      : missed.length
        ? missed.map((r) => `${r.short} late ${countPhrase(r.missedDays, "day")}`).join(" · ")
        : "Every promise with a number was kept.",
    tab: "promises",
  };
}

function backgroundTile(h: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM {
  const ours = oursOf(h.workspaces);
  const clocks = clocksOf(h.clocks);
  const failedJobs = (h.failed_jobs ?? []).filter((j) => inScope(ours.has(j.tenant_id), scope));
  const weekJobs = failedJobs.filter((j) => Date.parse(j.updated_at) >= nowMs - WEEK_MS).length;
  const notRunning = clocks.rows.filter((c) => c.state === "stopped").length;
  const late = h.backlog ?? 0;
  const state: HealthState =
    h.clocks === null || h.backlog === null
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
    value: h.clocks === null ? "—" : `${clocks.rows.length - notRunning}/${clocks.rows.length}`,
    unit: "clocks running",
    line: [
      h.backlog === null ? "the backlog unread" : late > 0 ? `${countPhrase(late, "job")} late` : "0 jobs late",
      failedJobs.length
        ? `${countPhrase(failedJobs.length, "failed job")}${weekJobs ? `, ${weekJobs} this week` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
    tab: "background",
  };
}

function deliveriesTile(h: HealthDto, scope: HealthScope): HealthTileVM {
  const d = deliveriesOf(h.parts, scope);
  return {
    key: "deliveries",
    title: "Deliveries",
    state: partState(h.parts !== null, d.failed > 0, d.total > 0),
    value: h.parts === null ? "—" : d.failed.toLocaleString("en-US"),
    unit: `of ${d.total.toLocaleString("en-US")} failed`,
    line: d.failed
      ? d.subscribers
          .filter((x) => x.failed)
          .map((x) => `${x.words}: ${x.failed}`)
          .join(" · ")
      : "Every change reached what reads it.",
    tab: "background",
  };
}

function sendsTile(h: HealthDto, scope: HealthScope): HealthTileVM {
  const s = sendsOf(h.parts, scope);
  const failing = s.channels
    .filter((c) => c.failed)
    .map((c) => `${c.words} ${c.failed} of ${c.total}${c.topError ? `: ${c.topError}` : ""}`)
    .join(" · ");
  return {
    key: "sends",
    title: "Sends",
    state: partState(h.parts !== null, s.failed > 0, s.total > 0),
    value: h.parts === null ? "—" : `${s.failed} of ${s.total.toLocaleString("en-US")}`,
    unit: "failed",
    line: !s.channels.length
      ? "Nothing was sent."
      : failing || `${s.delivered.toLocaleString("en-US")} confirmed delivered`,
    tab: "messages",
  };
}

function callsTile(h: HealthDto, scope: HealthScope): HealthTileVM {
  const c = callsOf(h.parts, scope);
  return {
    key: "calls",
    title: "Calls",
    state: partState(h.parts !== null, c.trouble.length > 0, c.total > 0),
    value: h.parts === null ? "—" : `${c.connected} of ${c.total}`,
    unit: "connected",
    line: c.trouble.length
      ? c.trouble.map((t) => `${t.n} ${t.words}`).join(" · ")
      : c.total
        ? "No call failed on our side."
        : "No call came in.",
    tab: "messages",
  };
}

function webhooksTile(h: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM {
  const w = webhooksOf(h.parts, scope, nowMs);
  return {
    key: "webhooks",
    title: "Webhooks in",
    state: partState(h.parts !== null, w.unverified > 0, w.total > 0),
    value: h.parts === null ? "—" : w.total.toLocaleString("en-US"),
    unit: "this week",
    line: w.total
      ? `${w.unverified} unverified · ${w.providers.map((p) => `${p.words} ${p.n}`).join(", ")}`
      : "No provider delivered anything this week.",
    tab: "messages",
  };
}

function askTile(h: HealthDto, scope: HealthScope): HealthTileVM {
  const a = healthAskOf(h.parts, scope);
  const asked = h.parts !== null && a.answers > 0;
  return {
    key: "ask",
    title: "Ask",
    state: !asked ? "unjudged" : a.slow ? "missed" : a.failed ? "look" : "kept",
    value: asked ? secondsWords(a.latencyP95) : "—",
    unit: `at p95, ${countPhrase(a.answers, "answer")}`,
    line: !asked
      ? "Nobody asked Ask anything."
      : [
          a.failed ? `${a.failed} failed` : "none failed",
          a.usd !== null ? dollarsWords(a.usd) : null,
          a.oursShare !== null && scope !== "customers" ? `ours ${Math.round(a.oursShare * 100)}% of it` : null,
        ]
          .filter(Boolean)
          .join(" · "),
    tab: "ask",
  };
}

/** The eight parts' tiles, each judged in the scope. */
export function healthTilesOf(h: HealthDto, scope: HealthScope, nowMs: number): HealthTileVM[] {
  return [
    promisesTile(h, scope),
    backgroundTile(h, scope, nowMs),
    deliveriesTile(h, scope),
    sendsTile(h, scope),
    callsTile(h, scope),
    webhooksTile(h, scope, nowMs),
    askTile(h, scope),
    speedTile(h),
  ];
}

/** App speed's tile: the largest paint at p75 against web.dev's line, with the tap and the first byte beside it. */
function speedTile(h: HealthDto): HealthTileVM {
  const all = (metric: string) => (h.vitals ?? []).find((r) => r.metric === metric && r.page === null) ?? null;
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
      line: h.vitals === null ? "The page timings could not be read just now." : "No page sent its timings yet.",
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
  | { kind: "open"; tab: HealthTab };

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
}

const SEVERITY_RANK: Record<HealthSeverity, number> = { red: 0, amber: 1, plain: 2 };

/** What each source of looks reads: the read, its scope, the clock, and how a row names its workspace and its time. */
interface LookCtx {
  h: HealthDto;
  scope: HealthScope;
  nowMs: number;
  ours: Set<string>;
  nameOf: (id: string | null) => string;
  sinceWords: (ms: number) => string;
}

/** A row with what most rows leave unsaid: no one workspace, no door's answer, no reading. */
const look = (r: Omit<HealthLookVM, "tenantId" | "detail" | "reading"> & Partial<HealthLookVM>): HealthLookVM => ({
  tenantId: null,
  detail: null,
  reading: null,
  ...r,
});

/** The one workspace a group of rows names, where it names one. */
const onlyOne = (ids: readonly string[]): string | null => (ids.length === 1 ? (ids[0] ?? null) : null);
const sideKey = (ours: boolean) => (ours ? "ours" : "customers");

function clockLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return clocksOf(h.clocks)
    .rows.filter((x) => x.state === "stopped")
    .map((c) =>
      look({
        key: `clock:${c.sweep}`,
        severity: "red",
        what: `${c.words} isn't running`,
        why: c.problem ?? "It has not reported in time.",
        where: "Every workspace",
        ours: false,
        sinceMs: c.lastMs ?? nowMs,
        since: c.lastMs ? sinceWords(c.lastMs) : "",
        act: { kind: "open", tab: "background" },
        detail: c.problem,
      }),
    );
}

function backlogLooks({ h, nowMs }: LookCtx): HealthLookVM[] {
  if (h.backlog === null || h.backlog <= 0) return [];
  return [
    look({
      key: "backlog",
      severity: "red",
      what: `${countPhrase(h.backlog, "job")} waiting unclaimed`,
      why: "Due jobs nobody has claimed for two minutes: the heartbeat is scheduled and not draining.",
      where: "Every workspace",
      ours: false,
      sinceMs: nowMs,
      since: "now",
      act: { kind: "open", tab: "background" },
    }),
  ];
}

function promiseLooks({ h, scope, nowMs, ours, sinceWords }: LookCtx): HealthLookVM[] {
  return promiseDaysOf(h.day_rows, ours, scope, h.days)
    .rows.filter((r) => r.state === "missed" && r.alarm)
    .map((p) =>
      look({
        key: `promise:${p.key}`,
        severity: "red",
        what: `${p.title}: missed on ${countPhrase(p.missedDays, "day")}`,
        why: p.worst ?? "",
        where: p.where,
        ours: scope === "ours",
        sinceMs: p.lastMissMs ?? nowMs,
        since: p.lastMissMs ? sinceWords(p.lastMissMs) : "",
        act: { kind: "open", tab: "promises" },
      }),
    );
}

function jobLooks({ h, ours, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return (h.failed_jobs ?? []).map((j) => {
    const at = Date.parse(j.updated_at);
    return look({
      key: `job:${j.id}`,
      severity: "amber",
      what: `${jobWords(j.kind)} failed${j.attempts > 1 ? `, ${j.attempts} tries` : ""}`,
      why: `Job ${j.kind}${j.last_error ? ` · ${j.last_error.slice(0, 120)}` : ""}`,
      where: nameOf(j.tenant_id),
      ours: ours.has(j.tenant_id),
      sinceMs: at,
      since: sinceWords(at),
      act: { kind: "run_again", jobId: j.id, tenantId: j.tenant_id },
      tenantId: j.tenant_id,
      detail: j.last_error,
      reading: failureReadingOf(j.last_error, j.attempts),
    });
  });
}

function deliveryLooks({ h, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return deliveriesOf(h.parts, "all").failures.map((d) =>
    look({
      key: `delivery:${d.subscriber}:${sideKey(d.ours)}`,
      severity: "red",
      what: `${d.words}: ${countPhrase(d.n, "delivery", "deliveries")} failed`,
      why: d.reason,
      where: d.where.map(nameOf).join(", "),
      ours: d.ours,
      sinceMs: d.lastMs,
      since: sinceWords(d.lastMs),
      act: { kind: "redrive", subscriber: d.subscriber },
      tenantId: onlyOne(d.where),
      detail: d.reason,
      reading: /no longer holds the event/.test(d.reason)
        ? "The event was removed before its delivery ran, so delivering it again can't work: the row stays as the record."
        : null,
    }),
  );
}

function pageLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return pagesOf(h.pages, h.workspaces, nowMs)
    .rows.filter((x) => x.recent)
    .map((p) =>
      look({
        key: `page:${p.key}`,
        severity: p.alertedToday ? "red" : "amber",
        what: `The pager: ${p.words}`,
        why: `Seen ${countPhrase(p.count, "time")} since ${p.first}${p.lastMailed ? `; last mailed ${p.lastMailed}` : ""}`,
        where: p.where,
        ours: p.ours,
        sinceMs: p.firstMs,
        since: sinceWords(p.firstMs),
        act: { kind: "open", tab: "background" },
      }),
    );
}

function modelLooks({ h, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return modelCallsOf(h.parts, "all").failureGroups.map((f) =>
    look({
      key: `model:${f.purpose}:${sideKey(f.ours)}`,
      severity: f.credit ? "red" : "amber",
      what: `${f.words}: ${countPhrase(f.n, "model call")} got no answer`,
      why: f.reason ?? "No reason was kept: the call came before the ledger kept them.",
      where: f.where.map(nameOf).join(", "),
      ours: f.ours,
      sinceMs: f.lastMs,
      since: sinceWords(f.lastMs),
      act: { kind: "open", tab: f.purpose === "ask" ? "ask" : "model" },
      tenantId: onlyOne(f.where),
      detail: f.reason,
      reading: f.credit ? "The key's credit ran out: every model call stops until it is topped up." : null,
    }),
  );
}

function sendLooks({ h, nowMs, sinceWords }: LookCtx): HealthLookVM[] {
  return sendsOf(h.parts, "all").troubled.map((c) =>
    look({
      key: `sends:${c.channel}:${sideKey(c.ours)}`,
      severity: "amber",
      what: `${c.words}: ${c.failed} of ${c.total} sends failed`,
      why: c.topError ?? "The provider said why on each message.",
      where: c.ours ? "Ours" : "Customers",
      ours: c.ours,
      sinceMs: c.lastMs ?? nowMs,
      since: c.lastMs ? sinceWords(c.lastMs) : "",
      act: { kind: "open", tab: "messages" },
    }),
  );
}

function callLooks({ h, sinceWords }: LookCtx): HealthLookVM[] {
  return callsOf(h.parts, "all").troubleByScope.map((t) =>
    look({
      key: `calls:${t.reason}:${sideKey(t.ours)}`,
      severity: "amber",
      what: `${countPhrase(t.n, "call")}: ${t.words}`,
      why: t.why,
      where: t.ours ? "Ours" : "Customers",
      ours: t.ours,
      sinceMs: t.lastMs,
      since: sinceWords(t.lastMs),
      act: { kind: "open", tab: "messages" },
    }),
  );
}

function connectionLooks({ h, nowMs, nameOf, sinceWords }: LookCtx): HealthLookVM[] {
  return connectionsOf(h.parts).map((c) =>
    look({
      key: `connection:${c.key}`,
      severity: "amber",
      what: c.what,
      why: c.why,
      where: nameOf(c.tenantId),
      ours: c.ours,
      sinceMs: c.sinceMs ?? nowMs,
      since: c.sinceMs ? sinceWords(c.sinceMs) : "",
      act: { kind: "open", tab: "messages" },
      tenantId: c.tenantId,
      detail: c.why,
    }),
  );
}

const LOOK_SOURCES = [
  clockLooks,
  backlogLooks,
  promiseLooks,
  jobLooks,
  deliveryLooks,
  pageLooks,
  modelLooks,
  sendLooks,
  callLooks,
  connectionLooks,
];

/**
 * Everything that needs a person, worst first then newest: a clock not running, the ledger backing up, a model key out
 * of credit, a promise missed for customers, failed jobs, failing deliveries, what paged us, sends and calls failing on
 * a provider's word, model calls with no answer, and connections that are not healthy. Each names its workspace.
 */
export function healthLooksOf(h: HealthDto, scope: HealthScope, nowMs: number): HealthLookVM[] {
  const ctx: LookCtx = {
    h,
    scope,
    nowMs,
    ours: oursOf(h.workspaces),
    nameOf: workspaceNamer(h.workspaces),
    sinceWords: (ms) => agoWords(ms, nowMs, { dateAfterMs: 2 * DAY_MS, date: dateWords }),
  };
  return LOOK_SOURCES.flatMap((source) => source(ctx))
    .filter((r) => inScope(r.ours, scope))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.sinceMs - a.sinceMs);
}

/** A date as a row says one: "21 Oct". */
function dateWords(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------------------------- the head

/** How many need a look, for customers and for ours: the head's segmented control and its line. */
export function healthCounts(h: HealthDto, nowMs: number): Record<HealthScope, number> {
  return {
    customers: healthLooksOf(h, "customers", nowMs).length,
    ours: healthLooksOf(h, "ours", nowMs).length,
    all: healthLooksOf(h, "all", nowMs).length,
  };
}

/** Health's line under its name: who needs a look, whether every clock runs, whether anything is late. */
export function healthSentence(h: HealthDto, nowMs: number): string {
  const n = healthCounts(h, nowMs);
  const clocks = clocksOf(h.clocks);
  const stopped = clocks.rows.filter((c) => c.state === "stopped").length;
  return [
    n.customers === 0
      ? "Nothing needs a look for customers"
      : `${n.customers} need${n.customers === 1 ? "s" : ""} a look for customers`,
    n.ours ? `${n.ours} in ours` : null,
    h.clocks === null
      ? "the clocks could not be read"
      : stopped
        ? `${countPhrase(stopped, "clock")} not running`
        : "every clock running",
    h.backlog === null ? null : h.backlog > 0 ? `${countPhrase(h.backlog, "job")} late` : "nothing late",
  ]
    .filter(Boolean)
    .join(" · ");
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
  oursNote: "Ours: our own workspaces (the nightly suite's, the smoke test), counted apart and never paged.",
} as const;
