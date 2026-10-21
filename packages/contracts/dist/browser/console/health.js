import { vitalVerdict } from "../shell/vitals.js";
import { agoWords, DAY_MS, WEEK_MS } from "../shared/time.js";
import { CONSOLE_PATH } from "./console-path.js";
import {
  clocksOf,
  pagesOf,
  failureReadingOf,
  jobWords
} from "./health-clocks.js";
import { promiseDaysOf } from "./health-promises.js";
import {
  callsOf,
  connectionsOf,
  deliveriesOf,
  modelCallsOf,
  sendsOf,
  webhooksOf
} from "./health-parts.js";
import { healthAskOf } from "./health-ask.js";
import { inScope, oursOf, workspaceNamer } from "./health-scope.js";
export const HEALTH_WINDOWS = [7, 30];
export const HEALTH_STATE_WORDS = {
  kept: { label: "Kept", tone: "ok" },
  look: { label: "A look", tone: "warn" },
  missed: { label: "Missed", tone: "danger" },
  unjudged: { label: "Not judged", tone: "plain" },
  plain: { label: "Spend", tone: "plain" }
};
export const HEALTH_TABS = ["overview", "promises", "background", "messages", "ask", "model", "speed", "bugs"];
export const HEALTH_TAB_WORDS = {
  overview: "Overview",
  promises: "Promises",
  background: "Background work",
  messages: "Messages and calls",
  ask: "Ask",
  model: "Model calls",
  speed: "App speed",
  bugs: "Bugs"
};
const HEALTH_PATH = `${CONSOLE_PATH}/health`;
export function healthTabOf(pathname) {
  const parts = ((pathname ?? "").split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const tab = parts[0] === CONSOLE_PATH.slice(1) && parts[1] === "health" ? parts[2] : void 0;
  return HEALTH_TABS.includes(tab ?? "") ? tab : "overview";
}
export function healthPathOf(tab) {
  return tab === "overview" ? HEALTH_PATH : `${HEALTH_PATH}/${tab}`;
}
const countPhrase = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export function secondsWords(ms) {
  if (ms === null || ms === void 0 || !Number.isFinite(ms)) return "\u2014";
  const s = ms / 1e3;
  return `${s >= 100 ? Math.round(s) : s.toFixed(1)} s`;
}
export function dollarsWords(usd) {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const partState = (read, failing, any) => !read ? "unjudged" : failing ? "look" : any ? "kept" : "unjudged";
function promisesTile(h, scope) {
  const promises = promiseDaysOf(h.day_rows, oursOf(h.workspaces), scope, h.days);
  const kept = promises.rows.filter((r) => r.state === "kept").length;
  const missed = promises.rows.filter((r) => r.state === "missed");
  const read = h.day_rows !== null;
  return {
    key: "promises",
    title: "Promises",
    state: !read ? "unjudged" : missed.length ? "missed" : kept ? "kept" : "unjudged",
    value: read ? `${kept} of ${promises.rows.length}` : "\u2014",
    unit: "kept every day",
    line: !read ? "The nightly counts could not be read just now." : missed.length ? missed.map((r) => `${r.short} late ${countPhrase(r.missedDays, "day")}`).join(" \xB7 ") : "Every promise with a number was kept.",
    tab: "promises"
  };
}
function backgroundTile(h, scope, nowMs) {
  const ours = oursOf(h.workspaces);
  const clocks = clocksOf(h.clocks);
  const failedJobs = (h.failed_jobs ?? []).filter((j) => inScope(ours.has(j.tenant_id), scope));
  const weekJobs = failedJobs.filter((j) => Date.parse(j.updated_at) >= nowMs - WEEK_MS).length;
  const notRunning = clocks.rows.filter((c) => c.state === "stopped").length;
  const late = h.backlog ?? 0;
  const state = h.clocks === null || h.backlog === null ? "unjudged" : notRunning || late > 0 ? "missed" : failedJobs.length ? "look" : "kept";
  return {
    key: "background",
    title: "Background work",
    state,
    value: h.clocks === null ? "\u2014" : `${clocks.rows.length - notRunning}/${clocks.rows.length}`,
    unit: "clocks running",
    line: [
      h.backlog === null ? "the backlog unread" : late > 0 ? `${countPhrase(late, "job")} late` : "0 jobs late",
      failedJobs.length ? `${countPhrase(failedJobs.length, "failed job")}${weekJobs ? `, ${weekJobs} this week` : ""}` : null
    ].filter(Boolean).join(" \xB7 "),
    tab: "background"
  };
}
function deliveriesTile(h, scope) {
  const d = deliveriesOf(h.parts, scope);
  return {
    key: "deliveries",
    title: "Deliveries",
    state: partState(h.parts !== null, d.failed > 0, d.total > 0),
    value: h.parts === null ? "\u2014" : d.failed.toLocaleString("en-US"),
    unit: `of ${d.total.toLocaleString("en-US")} failed`,
    line: d.failed ? d.subscribers.filter((x) => x.failed).map((x) => `${x.words}: ${x.failed}`).join(" \xB7 ") : "Every change reached what reads it.",
    tab: "background"
  };
}
function sendsTile(h, scope) {
  const s = sendsOf(h.parts, scope);
  const failing = s.channels.filter((c) => c.failed).map((c) => `${c.words} ${c.failed} of ${c.total}${c.topError ? `: ${c.topError}` : ""}`).join(" \xB7 ");
  return {
    key: "sends",
    title: "Sends",
    state: partState(h.parts !== null, s.failed > 0, s.total > 0),
    value: h.parts === null ? "\u2014" : `${s.failed} of ${s.total.toLocaleString("en-US")}`,
    unit: "failed",
    line: !s.channels.length ? "Nothing was sent." : failing || `${s.delivered.toLocaleString("en-US")} confirmed delivered`,
    tab: "messages"
  };
}
function callsTile(h, scope) {
  const c = callsOf(h.parts, scope);
  return {
    key: "calls",
    title: "Calls",
    state: partState(h.parts !== null, c.trouble.length > 0, c.total > 0),
    value: h.parts === null ? "\u2014" : `${c.connected} of ${c.total}`,
    unit: "connected",
    line: c.trouble.length ? c.trouble.map((t) => `${t.n} ${t.words}`).join(" \xB7 ") : c.total ? "No call failed on our side." : "No call came in.",
    tab: "messages"
  };
}
function webhooksTile(h, scope, nowMs) {
  const w = webhooksOf(h.parts, scope, nowMs);
  return {
    key: "webhooks",
    title: "Webhooks in",
    state: partState(h.parts !== null, w.unverified > 0, w.total > 0),
    value: h.parts === null ? "\u2014" : w.total.toLocaleString("en-US"),
    unit: "this week",
    line: w.total ? `${w.unverified} unverified \xB7 ${w.providers.map((p) => `${p.words} ${p.n}`).join(", ")}` : "No provider delivered anything this week.",
    tab: "messages"
  };
}
function askTile(h, scope) {
  const a = healthAskOf(h.parts, scope);
  const asked = h.parts !== null && a.answers > 0;
  return {
    key: "ask",
    title: "Ask",
    state: !asked ? "unjudged" : a.slow ? "missed" : a.failed ? "look" : "kept",
    value: asked ? secondsWords(a.latencyP95) : "\u2014",
    unit: `at p95, ${countPhrase(a.answers, "answer")}`,
    line: !asked ? "Nobody asked Ask anything." : [
      a.failed ? `${a.failed} failed` : "none failed",
      a.usd !== null ? dollarsWords(a.usd) : null,
      a.oursShare !== null && scope !== "customers" ? `ours ${Math.round(a.oursShare * 100)}% of it` : null
    ].filter(Boolean).join(" \xB7 "),
    tab: "ask"
  };
}
export function healthTilesOf(h, scope, nowMs) {
  return [
    promisesTile(h, scope),
    backgroundTile(h, scope, nowMs),
    deliveriesTile(h, scope),
    sendsTile(h, scope),
    callsTile(h, scope),
    webhooksTile(h, scope, nowMs),
    askTile(h, scope),
    speedTile(h)
  ];
}
function speedTile(h) {
  const all = (metric) => (h.vitals ?? []).find((r) => r.metric === metric && r.page === null) ?? null;
  const lcp = all("LCP");
  const inp = all("INP");
  const ttfb = all("TTFB");
  if (!lcp)
    return {
      key: "speed",
      title: "App speed",
      state: "unjudged",
      value: "\u2014",
      unit: "LCP, p75",
      line: h.vitals === null ? "The page timings could not be read just now." : "No page sent its timings yet.",
      tab: "speed"
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
      countPhrase(lcp.samples, "timing")
    ].filter(Boolean).join(" \xB7 "),
    tab: "speed"
  };
}
const SEVERITY_RANK = { red: 0, amber: 1, plain: 2 };
const look = (r) => ({
  tenantId: null,
  detail: null,
  reading: null,
  ...r
});
const onlyOne = (ids) => ids.length === 1 ? ids[0] ?? null : null;
const sideKey = (ours) => ours ? "ours" : "customers";
function clockLooks({ h, nowMs, sinceWords }) {
  return clocksOf(h.clocks).rows.filter((x) => x.state === "stopped").map(
    (c) => look({
      key: `clock:${c.sweep}`,
      severity: "red",
      what: `${c.words} isn't running`,
      why: c.problem ?? "It has not reported in time.",
      where: "Every workspace",
      ours: false,
      sinceMs: c.lastMs ?? nowMs,
      since: c.lastMs ? sinceWords(c.lastMs) : "",
      act: { kind: "open", tab: "background" },
      detail: c.problem
    })
  );
}
function backlogLooks({ h, nowMs }) {
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
      act: { kind: "open", tab: "background" }
    })
  ];
}
function promiseLooks({ h, scope, nowMs, ours, sinceWords }) {
  return promiseDaysOf(h.day_rows, ours, scope, h.days).rows.filter((r) => r.state === "missed" && r.alarm).map(
    (p) => look({
      key: `promise:${p.key}`,
      severity: "red",
      what: `${p.title}: missed on ${countPhrase(p.missedDays, "day")}`,
      why: p.worst ?? "",
      where: p.where,
      ours: scope === "ours",
      sinceMs: p.lastMissMs ?? nowMs,
      since: p.lastMissMs ? sinceWords(p.lastMissMs) : "",
      act: { kind: "open", tab: "promises" }
    })
  );
}
function jobLooks({ h, ours, nameOf, sinceWords }) {
  return (h.failed_jobs ?? []).map((j) => {
    const at = Date.parse(j.updated_at);
    return look({
      key: `job:${j.id}`,
      severity: "amber",
      what: `${jobWords(j.kind)} failed${j.attempts > 1 ? `, ${j.attempts} tries` : ""}`,
      why: `Job ${j.kind}${j.last_error ? ` \xB7 ${j.last_error.slice(0, 120)}` : ""}`,
      where: nameOf(j.tenant_id),
      ours: ours.has(j.tenant_id),
      sinceMs: at,
      since: sinceWords(at),
      act: { kind: "run_again", jobId: j.id, tenantId: j.tenant_id },
      tenantId: j.tenant_id,
      detail: j.last_error,
      reading: failureReadingOf(j.last_error, j.attempts)
    });
  });
}
function deliveryLooks({ h, nameOf, sinceWords }) {
  return deliveriesOf(h.parts, "all").failures.map(
    (d) => look({
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
      reading: /no longer holds the event/.test(d.reason) ? "The event was removed before its delivery ran, so delivering it again can't work: the row stays as the record." : null
    })
  );
}
function pageLooks({ h, nowMs, sinceWords }) {
  return pagesOf(h.pages, h.workspaces, nowMs).rows.filter((x) => x.recent).map(
    (p) => look({
      key: `page:${p.key}`,
      severity: p.alertedToday ? "red" : "amber",
      what: `The pager: ${p.words}`,
      why: `Seen ${countPhrase(p.count, "time")} since ${p.first}${p.lastMailed ? `; last mailed ${p.lastMailed}` : ""}`,
      where: p.where,
      ours: p.ours,
      sinceMs: p.firstMs,
      since: sinceWords(p.firstMs),
      act: { kind: "open", tab: "background" }
    })
  );
}
function modelLooks({ h, nameOf, sinceWords }) {
  return modelCallsOf(h.parts, "all").failureGroups.map(
    (f) => look({
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
      reading: f.credit ? "The key's credit ran out: every model call stops until it is topped up." : null
    })
  );
}
function sendLooks({ h, nowMs, sinceWords }) {
  return sendsOf(h.parts, "all").troubled.map(
    (c) => look({
      key: `sends:${c.channel}:${sideKey(c.ours)}`,
      severity: "amber",
      what: `${c.words}: ${c.failed} of ${c.total} sends failed`,
      why: c.topError ?? "The provider said why on each message.",
      where: c.ours ? "Ours" : "Customers",
      ours: c.ours,
      sinceMs: c.lastMs ?? nowMs,
      since: c.lastMs ? sinceWords(c.lastMs) : "",
      act: { kind: "open", tab: "messages" }
    })
  );
}
function callLooks({ h, sinceWords }) {
  return callsOf(h.parts, "all").troubleByScope.map(
    (t) => look({
      key: `calls:${t.reason}:${sideKey(t.ours)}`,
      severity: "amber",
      what: `${countPhrase(t.n, "call")}: ${t.words}`,
      why: t.why,
      where: t.ours ? "Ours" : "Customers",
      ours: t.ours,
      sinceMs: t.lastMs,
      since: sinceWords(t.lastMs),
      act: { kind: "open", tab: "messages" }
    })
  );
}
function connectionLooks({ h, nowMs, nameOf, sinceWords }) {
  return connectionsOf(h.parts).map(
    (c) => look({
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
      detail: c.why
    })
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
  connectionLooks
];
export function healthLooksOf(h, scope, nowMs) {
  const ctx = {
    h,
    scope,
    nowMs,
    ours: oursOf(h.workspaces),
    nameOf: workspaceNamer(h.workspaces),
    sinceWords: (ms) => agoWords(ms, nowMs, { dateAfterMs: 2 * DAY_MS, date: dateWords })
  };
  return LOOK_SOURCES.flatMap((source) => source(ctx)).filter((r) => inScope(r.ours, scope)).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.sinceMs - a.sinceMs);
}
function dateWords(ms) {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
export function healthCounts(h, nowMs) {
  return {
    customers: healthLooksOf(h, "customers", nowMs).length,
    ours: healthLooksOf(h, "ours", nowMs).length,
    all: healthLooksOf(h, "all", nowMs).length
  };
}
export function healthSentence(h, nowMs) {
  const n = healthCounts(h, nowMs);
  const clocks = clocksOf(h.clocks);
  const stopped = clocks.rows.filter((c) => c.state === "stopped").length;
  return [
    n.customers === 0 ? "Nothing needs a look for customers" : `${n.customers} need${n.customers === 1 ? "s" : ""} a look for customers`,
    n.ours ? `${n.ours} in ours` : null,
    h.clocks === null ? "the clocks could not be read" : stopped ? `${countPhrase(stopped, "clock")} not running` : "every clock running",
    h.backlog === null ? null : h.backlog > 0 ? `${countPhrase(h.backlog, "job")} late` : "nothing late"
  ].filter(Boolean).join(" \xB7 ");
}
export function healthQuietWords(scope) {
  return scope === "ours" ? "Nothing needs a look in our own workspaces." : "Nothing needs a look. Every promise with a number was kept, and every clock is running.";
}
export const HEALTH_WORDS = {
  title: "Health",
  scope: "Whose numbers",
  window: "How far back",
  windowWords: (d) => d === 7 ? "7 days" : "30 days",
  tabs: "Health's parts",
  needsALook: "Needs a look",
  needsALookSub: "worst first",
  keys: "\u2191\u2193 move \xB7 Enter opens \xB7 R run again",
  failed: "the platform's health",
  runAgain: "Run again",
  runAgainAsk: "Run this job again?",
  runAgainDetail: "A fresh job of the same kind and payload, due now. A send is never run again from here.",
  redrive: "Deliver again",
  redriveAsk: (s) => `Deliver every failed ${s} again?`,
  redriveDetail: "Each failed delivery of this subscriber is scheduled once more; one whose event is gone stays failed.",
  open: "Open",
  copyForBug: "Copy for a bug report",
  readFirst: "Read this first",
  whatItAnswered: "What it answered",
  where: "Where",
  close: "Close",
  ranAgain: "It's on the ledger again.",
  redriven: (n) => n === 0 ? "Nothing was left to deliver again." : `${n} scheduled again.`,
  oursNote: "Ours: our own workspaces (the nightly suite's, the smoke test), counted apart and never paged."
};
