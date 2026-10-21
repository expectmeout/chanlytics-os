import { ROLE_SAYS, ROLES } from "../config/workspace-config/role-perms.js";
import { dayInZone, dayPlusInZone, localToUtcMs } from "../calendar/zone-math.js";
import { clockDate, clockTime } from "../shared/clock.js";
import { agoWords, DAY_MS, WEEK_MS, spanLabel, timezoneCity } from "../shared/time.js";
import { platformRows } from "../workspace/platform.js";
import { claimWords, staffName } from "./console.js";
import {
  ASK_TOPIC,
  SUPPORT_TOPICS,
  SUPPORT_KIND_WORDS,
  SUPPORT_TOPIC_WORDS,
  askCode,
  askDoneOf,
  askTitle,
  errorWordsOf,
  pageWords,
  reportCode,
  supportTopicOf,
  unmailedOf
} from "./support.js";
export const SUPPORT_ZONE = "America/New_York";
const SUPPORT_PROMISE_MS = DAY_MS;
const SUPPORT_SOON = 0.75;
const CLOCK_DAYS_MAX = 400;
const isBusinessDay = (weekday) => weekday !== "sat" && weekday !== "sun";
function midnightAfter(atMs) {
  const next = dayPlusInZone(SUPPORT_ZONE, atMs, 1);
  return localToUtcMs(SUPPORT_ZONE, next.y, next.m, next.d, 0, 0);
}
export function businessMsBetween(fromMs, toMs) {
  let at = fromMs;
  let sum = 0;
  for (let i = 0; i < CLOCK_DAYS_MAX && at < toMs; i += 1) {
    const end = Math.min(midnightAfter(at), toMs);
    if (isBusinessDay(dayInZone(SUPPORT_ZONE, at).weekday)) sum += end - at;
    at = end;
  }
  return sum;
}
export function supportDueAt(createdMs) {
  let at = createdMs;
  let left = SUPPORT_PROMISE_MS;
  for (let i = 0; i < CLOCK_DAYS_MAX; i += 1) {
    const end = midnightAfter(at);
    if (isBusinessDay(dayInZone(SUPPORT_ZONE, at).weekday)) {
      if (end - at >= left) return at + left;
      left -= end - at;
    }
    at = end;
  }
  return at;
}
const WEEKDAY_WORDS = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat"
};
function byWords(dueMs, nowMs, zone) {
  const due = dayInZone(zone, dueMs);
  const when = due.key === dayInZone(zone, nowMs).key ? "today" : due.key === dayPlusInZone(zone, nowMs, 1).key ? "tomorrow" : dueMs - nowMs < WEEK_MS ? WEEKDAY_WORDS[due.weekday] ?? clockDate(dueMs, zone, nowMs) : clockDate(dueMs, zone, nowMs);
  return `by ${clockTime(dueMs, zone)} ${when}`;
}
export function supportWaitOf(createdMs, nowMs, zone) {
  const due = supportDueAt(createdMs);
  if (nowMs >= due) return { words: `past its day by ${spanLabel(nowMs - due)}`, tone: "danger", part: 1 };
  const part = Math.min(1, businessMsBetween(createdMs, nowMs) / SUPPORT_PROMISE_MS);
  return {
    words: `${spanLabel(nowMs - createdMs)} \xB7 ${byWords(due, nowMs, zone)}`,
    tone: part >= SUPPORT_SOON ? "warn" : null,
    part
  };
}
export const SUPPORT_VIEWS = ["needs", "waiting", "done"];
export const SUPPORT_VIEW_WORDS = {
  needs: "Needs a person",
  waiting: "Waiting on them",
  done: "Done, 30 days"
};
const SUPPORT_DONE_DAYS = 30;
export const SUPPORT_READ_DAYS = 90;
export const SUPPORT_PAGE = 50;
const SUPPORT_ROW_KINDS = ["question", "ask"];
export const SUPPORT_KIND_FILTERS = ["all", ...SUPPORT_ROW_KINDS];
export const SUPPORT_KIND_FILTER_WORDS = {
  all: "All",
  question: "Questions",
  ask: "Setup asks"
};
const MARKS = {
  report_answered: "answered",
  report_reopened: "open",
  ask_answered: "answered",
  ask_done: "done",
  ask_reopened: "open"
};
function lastMarks(acts) {
  const out = /* @__PURE__ */ new Map();
  for (const a of acts) {
    const mark = MARKS[a.act];
    const at = Date.parse(a.at);
    if (!mark || !Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (!was || at > was.at) out.set(a.target_id, { mark, at, by: staffName(a.actor_email) });
  }
  return out;
}
function firstAnswers(acts) {
  const out = /* @__PURE__ */ new Map();
  for (const a of acts) {
    if (a.act !== "report_answered" && a.act !== "ask_answered") continue;
    const at = Date.parse(a.at);
    if (!Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (was === void 0 || at < was) out.set(a.target_id, at);
  }
  return out;
}
function whoLine(who, email) {
  const role = who?.role ? roleWords(who.role) ?? null : null;
  if (who?.name) return role ? `${who.name}, ${role}` : who.name;
  return email ?? "Someone signed out";
}
const roleWords = (role) => ROLES.includes(role) ? ROLE_SAYS[role].label : void 0;
const firstName = (name) => (name ?? "").trim().split(/\s+/)[0] || null;
function sentWords(atMs, nowMs, zone, theirs) {
  const ago = agoWords(atMs, nowMs, { date: (ms) => clockDate(ms, zone, nowMs) });
  const yours = `${clockTime(atMs, zone)} yours`;
  if (!theirs || theirs === zone) return `${ago} \xB7 ${clockTime(atMs, zone)}`;
  return `${ago} \xB7 ${yours} \xB7 ${clockTime(atMs, theirs)} in ${timezoneCity(theirs)}`;
}
const sinceWords = (iso, zone, nowMs) => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? `In it since ${clockDate(at, zone, nowMs)}` : null;
};
export function supportQueueOf(book, p) {
  const marks = lastMarks(book.acts);
  const firsts = firstAnswers(book.acts);
  const claimOf = new Map(book.claims.map((c) => [c.tenant_id, c]));
  const rowOf = new Map(book.tenants.map((t) => [t.tenant_id, t]));
  const claimLine = (tenantId) => tenantId ? claimWords(claimOf.get(tenantId) ?? null, p.me, p.nowMs) : null;
  const answeredLine = (id, atMs) => {
    const m = marks.get(id);
    const first = firsts.get(id);
    if (!m || m.mark === "open" || first === void 0) return null;
    return `Answered by ${m.by} in ${spanLabel(Math.max(0, first - atMs))}`;
  };
  const stateOf = (id, tenantId, finished) => {
    const m = marks.get(id);
    if (m && m.mark !== "open") return { state: finished(m.mark), at: m.at };
    return { state: claimLine(tenantId) ? "taken" : "new", at: null };
  };
  const questions = book.reports.filter((r) => r.kind !== "wrong").map((r) => {
    const at = Date.parse(r.created_at);
    const s = stateOf(r.id, r.tenant_id, () => "done");
    const theirs = r.tenant_id ? rowOf.get(r.tenant_id)?.timezone ?? null : null;
    return {
      key: `r-${r.id}`,
      kind: "question",
      id: r.id,
      code: reportCode(r.number),
      title: r.words,
      quoted: true,
      kindWords: SUPPORT_KIND_WORDS[r.kind],
      door: r.kind,
      what: null,
      topic: supportTopicOf(r.words, r.page, r.kind),
      topicWords: SUPPORT_TOPIC_WORDS[supportTopicOf(r.words, r.page, r.kind)],
      tenantId: r.tenant_id,
      slug: r.slug,
      workspace: r.name ?? "No workspace",
      who: whoLine(r.who, r.email),
      first: firstName(r.who?.name),
      role: r.who?.role ? roleWords(r.who.role) ?? null : null,
      since: sinceWords(r.who?.since ?? null, p.zone, p.nowMs),
      email: r.email,
      page: r.page ? pageWords(r.page) : null,
      atMs: at,
      dueMs: supportDueAt(at),
      sent: sentWords(at, p.nowMs, p.zone, theirs),
      wait: supportWaitOf(at, p.nowMs, p.zone),
      state: s.state,
      ...stateWordsOf(s.state, claimLine(r.tenant_id)),
      claim: claimLine(r.tenant_id),
      answeredAtMs: s.at,
      answered: answeredLine(r.id, at),
      doneWhen: null,
      byHand: false,
      unmailed: unmailedOf(r),
      error: errorWordsOf(r)
    };
  });
  const asks = book.asks.map((a) => {
    const at = Date.parse(a.at);
    const row = rowOf.get(a.tenant_id) ?? null;
    const sign = askDoneOf(a.what, row, at, book.signals[a.tenant_id] ?? null);
    const marked = marks.get(a.id);
    const s = sign.done && marked?.mark !== "open" ? { state: "done", at: marked?.at ?? null } : stateOf(a.id, a.tenant_id, (mark) => mark === "done" ? "done" : "waiting");
    const topic = ASK_TOPIC[a.what] ?? "other";
    return {
      key: `a-${a.id}`,
      kind: "ask",
      id: a.id,
      code: askCode(a.id),
      title: askTitle(a.name, a.what),
      quoted: false,
      kindWords: SUPPORT_KIND_WORDS.ask,
      door: null,
      what: a.what,
      topic,
      topicWords: SUPPORT_TOPIC_WORDS[topic],
      tenantId: a.tenant_id,
      slug: a.slug,
      workspace: a.name,
      who: whoLine(a.who, a.email),
      first: firstName(a.who?.name),
      role: a.who?.role ? roleWords(a.who.role) ?? null : null,
      since: sinceWords(a.who?.since ?? null, p.zone, p.nowMs),
      email: a.email,
      page: null,
      atMs: at,
      dueMs: supportDueAt(at),
      sent: sentWords(at, p.nowMs, p.zone, row?.timezone ?? null),
      wait: supportWaitOf(at, p.nowMs, p.zone),
      state: s.state,
      ...stateWordsOf(s.state, claimLine(a.tenant_id)),
      claim: claimLine(a.tenant_id),
      answeredAtMs: s.at,
      answered: answeredLine(a.id, at),
      doneWhen: sign.words,
      byHand: sign.byHand,
      unmailed: null,
      error: null
    };
  });
  return [...questions, ...asks].map((r) => r.state === "waiting" || r.state === "done" ? { ...r, wait: settledWait(r, p) } : r).sort((a, b) => queueOrder(a, b, p.nowMs));
}
function settledWait(r, p) {
  const at = r.answeredAtMs;
  return {
    words: at ? `answered ${agoWords(at, p.nowMs, { date: (ms) => clockDate(ms, p.zone, p.nowMs) })}` : "",
    tone: null,
    part: null
  };
}
function stateWordsOf(state, claim) {
  if (state === "new") return { stateWords: "New", stateTone: "accent" };
  if (state === "taken") return { stateWords: claim ?? "Taken", stateTone: "info" };
  if (state === "waiting") return { stateWords: "Waiting on them", stateTone: "info" };
  return { stateWords: "Done", stateTone: "ok" };
}
export function supportViewOf(r) {
  return r.state === "waiting" ? "waiting" : r.state === "done" ? "done" : "needs";
}
function queueOrder(a, b, nowMs) {
  const done = (r) => r.state === "done" ? 2 : r.state === "waiting" ? 1 : 0;
  if (done(a) !== done(b)) return done(a) - done(b);
  if (done(a) === 2) return (b.answeredAtMs ?? 0) - (a.answeredAtMs ?? 0);
  const late = (r) => r.dueMs <= nowMs ? 0 : 1;
  return late(a) - late(b) || a.atMs - b.atMs;
}
function rowMatches(r, q) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.title, r.code, r.workspace, r.slug ?? "", r.who, r.email ?? "", r.topicWords].some(
    (t) => t.toLowerCase().includes(s)
  );
}
const inDone = (r, nowMs) => r.state !== "done" || (r.answeredAtMs ?? r.atMs) >= nowMs - SUPPORT_DONE_DAYS * DAY_MS;
export function supportPageOf(rows, f, nowMs) {
  const kept = rows.filter((r) => inDone(r, nowMs));
  const views = { needs: 0, waiting: 0, done: 0 };
  for (const r of kept) views[supportViewOf(r)] += 1;
  const inView = kept.filter((r) => supportViewOf(r) === f.view && rowMatches(r, f.q));
  const kinds = { all: inView.length, question: 0, ask: 0 };
  for (const r of inView) kinds[r.kind] += 1;
  const ofKind = inView.filter((r) => f.kind === "all" || r.kind === f.kind);
  const topics = SUPPORT_TOPICS.map((topic) => ({
    topic,
    words: SUPPORT_TOPIC_WORDS[topic],
    n: ofKind.filter((r) => r.topic === topic).length
  })).filter((t) => t.n > 0);
  const bySlug = /* @__PURE__ */ new Map();
  for (const r of ofKind) {
    if (!r.slug) continue;
    const was = bySlug.get(r.slug);
    bySlug.set(r.slug, { slug: r.slug, name: r.workspace, n: (was?.n ?? 0) + 1 });
  }
  return {
    rows: ofKind.filter((r) => (!f.topic || r.topic === f.topic) && (!f.workspace || r.slug === f.workspace)),
    counts: {
      views,
      late: kept.filter((r) => supportViewOf(r) === "needs" && r.dueMs <= nowMs).length,
      kinds,
      topics,
      workspaces: [...bySlug.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    }
  };
}
export function supportDue(rows, nowMs) {
  return rows.filter((r) => supportViewOf(r) === "needs" && r.dueMs <= nowMs);
}
export function answeredMedianMs(rows, acts, nowMs) {
  const firsts = firstAnswers(acts);
  const since = nowMs - SUPPORT_DONE_DAYS * DAY_MS;
  const spans = rows.flatMap((r) => {
    const at = firsts.get(r.id);
    return at !== void 0 && at >= since ? [Math.max(0, at - r.atMs)] : [];
  }).sort((a, b) => a - b);
  if (!spans.length) return null;
  const mid = Math.floor(spans.length / 2);
  return spans.length % 2 ? spans[mid] ?? null : ((spans[mid - 1] ?? 0) + (spans[mid] ?? 0)) / 2;
}
export function supportSentence(counts, medianMs) {
  const n = counts.views.needs;
  return [
    n === 0 ? "Nothing needs a person" : `${n} need${n === 1 ? "s" : ""} a person`,
    ...counts.late ? [`${counts.late} past ${counts.late === 1 ? "its" : "their"} day`] : [],
    ...counts.views.waiting ? [`${counts.views.waiting} waiting on them`] : [],
    ...medianMs !== null ? [`answered in ${spanLabel(medianMs)} this month`] : []
  ].join(" \xB7 ");
}
export function supportQuietWords(rows, nowMs) {
  const last = [...rows].sort((a, b) => b.atMs - a.atMs)[0];
  if (!last) return "Nothing needs a person. No question or ask has come in yet.";
  const said = `The last ${last.kind === "ask" ? "ask" : "question"} was ${last.code}, ${agoWords(last.atMs, nowMs)}`;
  return `Nothing needs a person. ${said}${last.answered ? `, ${last.answered.charAt(0).toLowerCase()}${last.answered.slice(1)}` : ""}.`;
}
export function supportWorkspaceOf(tenants, tenantId, nowMs) {
  const row = tenants.find((t) => t.tenant_id === tenantId);
  return row ? platformRows([row], nowMs)[0] ?? null : null;
}
