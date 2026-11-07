/** Support queue: queue. */

import type { Tone } from "../../shell/tone";
import type { ReportKind } from "../../shell/report-problem";
import { ROLE_SAYS, ROLES } from "../../config/workspace-config/role-perms";
import { clockDate, clockTime } from "../../shared/clock";
import { agoWords, DAY_MS, spanLabel, timezoneCity } from "../../shared/time";
import { platformRows, type PlatformRowVM, type PlatformTenantDto } from "../../workspace/platform";
import { claimWords, type ClaimDto } from "../console";
import {
  ASK_TOPIC,
  SUPPORT_TOPICS,
  SUPPORT_KIND_WORDS,
  SUPPORT_TOPIC_WORDS,
  askCode,
  askDoneOf,
  supportTopicOf,
  type AskSignalsDto,
  type SetupAskDto,
  type SupportTopic,
} from "../support/asks";
import {
  askTitle,
  errorWordsOf,
  pageWords,
  reportCode,
  unmailedOf,
  type SupportReportDto,
  type SupportWhoDto,
} from "../support/reports";
import {
  SUPPORT_DONE_DAYS,
  firstAnswers,
  firstNameOfAddress,
  lastMarks,
  supportDueAt,
  supportWaitOf,
  type SupportActDto,
  type SupportKindFilter,
  type SupportRowKind,
  type SupportState,
  type SupportView,
  type SupportWaitVM,
} from "./waits";

/** Who sent it, in one line: "Dana Kim, Owner", else their address with their role, else that they were signed out. */
function whoLine(supportWho: SupportWhoDto | null, email: string | null): string {
  const role = supportWho?.role ? (roleWords(supportWho.role) ?? null) : null;
  const named = supportWho?.name || email;
  if (!named) return "Someone signed out";
  return role ? `${named}, ${role}` : named;
}

const roleWords = (role: string): string | undefined =>
  (ROLES as readonly string[]).includes(role) ? ROLE_SAYS[role as (typeof ROLES)[number]].label : undefined;

/** One row of the queue: a question or an ask, what it needs, who and where, its promise, its state. */
export interface SupportRowVM {
  key: string;
  kind: SupportRowKind;
  /** The report's id, or the ask's event's. */
  id: string;
  code: string;
  /** Their words, or the ask in the third person. */
  title: string;
  quoted: boolean;
  kindWords: string;
  /** What the member picked at the door; an ask's is null. */
  door: ReportKind | null;
  /** The ask's `what`; a question's is null. */
  what: string | null;
  topic: SupportTopic;
  topicWords: string;
  tenantId: string | null;
  slug: string | null;
  workspace: string;
  /** "Dana Kim, Owner": the queue's line. */
  who: string;
  /** The name they gave; null when they gave none, and the panel names them by their address. */
  name: string | null;
  /** Their first name for a reply: from their name, else from an address that starts with one; null otherwise. */
  first: string | null;
  role: string | null;
  /** "Member since Oct 2". */
  since: string | null;
  email: string | null;
  page: string | null;
  atMs: number;
  dueMs: number;
  /** "3h ago · 2:12 PM yours · 11:12 AM in Seattle". */
  sent: string;
  wait: SupportWaitVM;
  state: SupportState;
  stateWords: string;
  stateTone: Tone | null;
  /** Who on the team has the workspace, as its claim says it; null when nobody does. */
  claim: string | null;
  answeredAtMs: number | null;
  /** "Answered by Alex in 2h". */
  answered: string | null;
  /** An ask's: what finishes it. */
  doneWhen: string | null;
  /** An ask's: whether the workspace shows it finished now; a question's is null. */
  doneNow: boolean | null;
  /** An ask finished by hand, since nothing the Console reads records it. */
  byHand: boolean;
  /** A question the inbox does not have, and why. */
  unmailed: string | null;
  /** The error a question carried when it came as a bug and was moved here: folded under "Also sent". */
  error: string | null;
}

/** What the queue is built from: the server's reads, as they came. */
export interface SupportBookDto {
  reports: readonly SupportReportDto[];
  asks: readonly SetupAskDto[];
  acts: readonly SupportActDto[];
  claims: readonly ClaimDto[];
  tenants: readonly PlatformTenantDto[];
  signals: Readonly<Record<string, AskSignalsDto>>;
}

/** Their first name, for a reply: the first word of the name they gave. */
const firstName = (name: string | null | undefined): string | null => (name ?? "").trim().split(/\s+/)[0] || null;

/** "3h ago · 2:12 PM yours · 11:12 AM in Seattle", their zone left out where it is yours. */
function sentWords(atMs: number, nowMs: number, zone: string, theirs: string | null): string {
  const ago = agoWords(atMs, nowMs, { date: (ms) => clockDate(ms, zone, nowMs) });
  const yours = `${clockTime(atMs, zone)} yours`;
  if (!theirs || theirs === zone) return `${ago} · ${clockTime(atMs, zone)}`;
  return `${ago} · ${yours} · ${clockTime(atMs, theirs)} in ${timezoneCity(theirs)}`;
}

const sinceWords = (iso: string | null, zone: string, nowMs: number): string | null => {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? `Member since ${clockDate(at, zone, nowMs)}` : null;
};

/**
 * Every question and ask as one list, each with its state, its promise and its topic: late first, then the oldest; the
 * answered ones after, the latest answered first. Reports of something that isn't working are not Support's and are
 * left out here, whoever hands them in.
 */
export function supportQueueOf(
  book: SupportBookDto,
  params: { me: string; nowMs: number; zone: string },
): SupportRowVM[] {
  const marks = lastMarks(book.acts);
  const firsts = firstAnswers(book.acts);
  const claimOf = new Map(book.claims.map((c) => [c.tenant_id, c]));
  const rowOf = new Map(book.tenants.map((t) => [t.tenant_id, t]));
  const claimLine = (tenantId: string | null) =>
    tenantId ? claimWords(claimOf.get(tenantId) ?? null, params.me, params.nowMs) : null;
  const answeredLine = (id: string, atMs: number) => {
    const m = marks.get(id);
    const first = firsts.get(id);
    if (!m || m.mark === "open" || first === undefined) return null;
    return `Answered by ${m.by} in ${spanLabel(Math.max(0, first - atMs))}`;
  };
  const stateOf = (
    id: string,
    tenantId: string | null,
    finished: (mark: "answered" | "done") => SupportState,
  ): { state: SupportState; at: number | null } => {
    const m = marks.get(id);
    if (m && m.mark !== "open") return { state: finished(m.mark), at: m.at };
    return { state: claimLine(tenantId) ? "taken" : "new", at: null };
  };

  const questions = book.reports
    .filter((r) => r.kind !== "wrong")
    .map((row): SupportRowVM => {
      const at = Date.parse(row.created_at);
      const state = stateOf(row.id, row.tenant_id, () => "done");
      const theirs = row.tenant_id ? (rowOf.get(row.tenant_id)?.timezone ?? null) : null;
      return {
        key: `r-${row.id}`,
        kind: "question",
        id: row.id,
        code: reportCode(row.number),
        title: row.words,
        quoted: true,
        kindWords: SUPPORT_KIND_WORDS[row.kind],
        door: row.kind,
        what: null,
        topic: supportTopicOf(row.words, row.page, row.kind),
        topicWords: SUPPORT_TOPIC_WORDS[supportTopicOf(row.words, row.page, row.kind)],
        tenantId: row.tenant_id,
        slug: row.slug,
        workspace: row.name ?? "No workspace",
        who: whoLine(row.who, row.email),
        name: row.who?.name || null,
        first: firstName(row.who?.name) ?? firstNameOfAddress(row.email),
        role: row.who?.role ? (roleWords(row.who.role) ?? null) : null,
        since: sinceWords(row.who?.since ?? null, params.zone, params.nowMs),
        email: row.email,
        page: row.page ? pageWords(row.page) : null,
        atMs: at,
        dueMs: supportDueAt(at),
        sent: sentWords(at, params.nowMs, params.zone, theirs),
        wait: supportWaitOf(at, params.nowMs, params.zone),
        state: state.state,
        ...stateWordsOf(state.state, claimLine(row.tenant_id)),
        claim: claimLine(row.tenant_id),
        answeredAtMs: state.at,
        answered: answeredLine(row.id, at),
        doneWhen: null,
        doneNow: null,
        byHand: false,
        unmailed: unmailedOf(row),
        error: errorWordsOf(row),
      };
    });

  const asks = book.asks.map((ask): SupportRowVM => {
    const at = Date.parse(ask.at);
    const row = rowOf.get(ask.tenant_id) ?? null;
    const sign = askDoneOf(ask.what, row, at, book.signals[ask.tenant_id] ?? null);
    const marked = marks.get(ask.id);
    // Answered, an ask waits on the workspace; it is done when the workspace shows it, or when it was marked done.
    const items =
      sign.done && marked?.mark !== "open"
        ? { state: "done" as const, at: marked?.at ?? null }
        : stateOf(ask.id, ask.tenant_id, (mark) => (mark === "done" ? "done" : "waiting"));
    const topic = ASK_TOPIC[ask.what] ?? "other";
    return {
      key: `a-${ask.id}`,
      kind: "ask",
      id: ask.id,
      code: askCode(ask.id),
      title: askTitle(ask.name, ask.what),
      quoted: false,
      kindWords: SUPPORT_KIND_WORDS.ask,
      door: null,
      what: ask.what,
      topic,
      topicWords: SUPPORT_TOPIC_WORDS[topic],
      tenantId: ask.tenant_id,
      slug: ask.slug,
      workspace: ask.name,
      who: whoLine(ask.who, ask.email),
      name: ask.who?.name || null,
      first: firstName(ask.who?.name) ?? firstNameOfAddress(ask.email),
      role: ask.who?.role ? (roleWords(ask.who.role) ?? null) : null,
      since: sinceWords(ask.who?.since ?? null, params.zone, params.nowMs),
      email: ask.email,
      page: null,
      atMs: at,
      dueMs: supportDueAt(at),
      sent: sentWords(at, params.nowMs, params.zone, row?.timezone ?? null),
      wait: supportWaitOf(at, params.nowMs, params.zone),
      state: items.state,
      ...stateWordsOf(items.state, claimLine(ask.tenant_id)),
      claim: claimLine(ask.tenant_id),
      answeredAtMs: items.at,
      answered: answeredLine(ask.id, at),
      doneWhen: sign.words,
      doneNow: sign.done,
      byHand: sign.byHand,
      unmailed: null,
      error: null,
    };
  });

  return [...questions, ...asks]
    .map((r) => (r.state === "waiting" || r.state === "done" ? { ...r, wait: settledWait(r, params) } : r))
    .sort((a, b) => queueOrder(a, b, params.nowMs));
}

/** A row no longer waiting on us has no promise left to keep: its cell says when it was answered. */
function settledWait(r: SupportRowVM, p: { nowMs: number; zone: string }): SupportWaitVM {
  const at = r.answeredAtMs;
  return {
    words: at ? `answered ${agoWords(at, p.nowMs, { date: (ms) => clockDate(ms, p.zone, p.nowMs) })}` : "",
    tone: null,
    part: null,
  };
}

/** A state's words and tone: colour says urgency or that it is finished; coral is New's. */
function stateWordsOf(state: SupportState, claim: string | null): { stateWords: string; stateTone: Tone | null } {
  if (state === "new") return { stateWords: "New", stateTone: "accent" };
  if (state === "taken") return { stateWords: claim ?? "Taken", stateTone: "info" };
  if (state === "waiting") return { stateWords: "Waiting on them", stateTone: "info" };
  return { stateWords: "Done", stateTone: "ok" };
}

/** The view a row is in. */
export function supportViewOf(support: Pick<SupportRowVM, "state">): SupportView {
  return support.state === "waiting" ? "waiting" : support.state === "done" ? "done" : "needs";
}

/** Late first, then the oldest; the finished after, the latest answered first. */
function queueOrder(a: SupportRowVM, b: SupportRowVM, nowMs: number): number {
  const done = (r: SupportRowVM) => (r.state === "done" ? 2 : r.state === "waiting" ? 1 : 0);
  if (done(a) !== done(b)) return done(a) - done(b);
  if (done(a) === 2) return (b.answeredAtMs ?? 0) - (a.answeredAtMs ?? 0);
  const late = (r: SupportRowVM) => (r.dueMs <= nowMs ? 0 : 1);
  return late(a) - late(b) || a.atMs - b.atMs;
}

/** What the queue's tools narrow it by: the view, a kind, a topic, a workspace, and words. */
export interface SupportFilter {
  view: SupportView;
  kind: SupportKindFilter;
  topic: SupportTopic | null;
  workspace: string | null;
  q: string;
}

/** Whether a row answers a search: its words, its code, its workspace, who, or its topic. */
function rowMatches(r: SupportRowVM, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [r.title, r.code, r.workspace, r.slug ?? "", r.who, r.email ?? "", r.topicWords].some((t) =>
    t.toLowerCase().includes(s),
  );
}

/** Done keeps the last thirty days' answers. */
const inDone = (r: SupportRowVM, nowMs: number) =>
  r.state !== "done" || (r.answeredAtMs ?? r.atMs) >= nowMs - SUPPORT_DONE_DAYS * DAY_MS;

/** The counts the tools say: each view's, the current view's by kind, its topics and its workspaces, and the late. */
export interface SupportCounts {
  views: Record<SupportView, number>;
  late: number;
  kinds: Record<SupportKindFilter, number>;
  topics: { topic: SupportTopic; words: string; n: number }[];
  workspaces: { slug: string; name: string; n: number }[];
}

/** The rows a filter keeps, in the queue's order, and the counts its tools say. */
export function supportPageOf(
  rows: readonly SupportRowVM[],
  supportFilter: SupportFilter,
  nowMs: number,
): { rows: SupportRowVM[]; counts: SupportCounts } {
  const kept = rows.filter((r) => inDone(r, nowMs));
  const views = { needs: 0, waiting: 0, done: 0 } as Record<SupportView, number>;
  for (const r of kept) views[supportViewOf(r)] += 1;
  const inView = kept.filter((r) => supportViewOf(r) === supportFilter.view && rowMatches(r, supportFilter.q));
  const kinds = { all: inView.length, question: 0, ask: 0 } as Record<SupportKindFilter, number>;
  for (const r of inView) kinds[r.kind] += 1;
  const ofKind = inView.filter((r) => supportFilter.kind === "all" || r.kind === supportFilter.kind);
  const topics = SUPPORT_TOPICS.map((topic) => ({
    topic,
    words: SUPPORT_TOPIC_WORDS[topic],
    n: ofKind.filter((r) => r.topic === topic).length,
  })).filter((t) => t.n > 0);
  const bySlug = new Map<string, { slug: string; name: string; n: number }>();
  for (const r of ofKind) {
    if (!r.slug) continue;
    const was = bySlug.get(r.slug);
    bySlug.set(r.slug, { slug: r.slug, name: r.workspace, n: (was?.n ?? 0) + 1 });
  }
  return {
    rows: ofKind.filter(
      (r) =>
        (!supportFilter.topic || r.topic === supportFilter.topic) &&
        (!supportFilter.workspace || r.slug === supportFilter.workspace),
    ),
    counts: {
      views,
      late: kept.filter((r) => supportViewOf(r) === "needs" && r.dueMs <= nowMs).length,
      kinds,
      topics,
      workspaces: [...bySlug.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    },
  };
}

/** The rows past their day that still need a person: Home's Due reads these, so a late one cannot hide in Support. */
export function supportDue(rows: readonly SupportRowVM[], nowMs: number): SupportRowVM[] {
  return rows.filter((r) => supportViewOf(r) === "needs" && r.dueMs <= nowMs);
}

/** How fast we answered in the last thirty days: the median time to the first answer, or null with none to count. */
export function answeredMedianMs(
  rows: readonly SupportRowVM[],
  acts: readonly SupportActDto[],
  nowMs: number,
): number | null {
  const firsts = firstAnswers(acts);
  const since = nowMs - SUPPORT_DONE_DAYS * DAY_MS;
  const spans = rows
    .flatMap((r) => {
      const at = firsts.get(r.id);
      return at !== undefined && at >= since ? [Math.max(0, at - r.atMs)] : [];
    })
    .sort((a, b) => a - b);
  if (!spans.length) return null;
  const mid = Math.floor(spans.length / 2);
  return spans.length % 2 ? (spans[mid] ?? null) : ((spans[mid - 1] ?? 0) + (spans[mid] ?? 0)) / 2;
}

/** Support's line under its name: what needs a person, what is late, what waits, and how fast we answered. */
export function supportSentence(counts: SupportCounts, medianMs: number | null): string {
  const n = counts.views.needs;
  return [
    n === 0 ? "Nothing needs a person" : `${n} need${n === 1 ? "s" : ""} a person`,
    ...(counts.late ? [`${counts.late} past ${counts.late === 1 ? "its" : "their"} day`] : []),
    ...(counts.views.waiting ? [`${counts.views.waiting} waiting on them`] : []),
    ...(medianMs !== null ? [`answered in ${spanLabel(medianMs)} this month`] : []),
  ].join(" · ");
}

/**
 * What a quiet queue says, never an empty card: "Nothing needs a person. The last question was R-1031, 12d ago,
 * answered by Alex in 2h."
 */
export function supportQuietWords(rows: readonly SupportRowVM[], nowMs: number): string {
  const last = [...rows].sort((a, b) => b.atMs - a.atMs)[0];
  if (!last) return "Nothing needs a person. No question or ask has come in yet.";
  const sentence = `The last ${last.kind === "ask" ? "ask" : "question"} was ${last.code}, ${agoWords(last.atMs, nowMs)}`;
  return `Nothing needs a person. ${sentence}${last.answered ? `, ${last.answered.charAt(0).toLowerCase()}${last.answered.slice(1)}` : ""}.`;
}

/** The workspace beside a row, as Home judges it: its verdict and its one line. */
export function supportWorkspaceOf(
  tenants: readonly PlatformTenantDto[],
  tenantId: string | null,
  nowMs: number,
): PlatformRowVM | null {
  const row = tenants.find((t) => t.tenant_id === tenantId);
  return row ? (platformRows([row], nowMs)[0] ?? null) : null;
}
