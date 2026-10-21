/**
 * Support's queue (decision 0067): every question (a report kept with kind how_to, setup or billing) and every setup ask
 * (setup_request's event), each with its promise, its state and its topic, in the order a person works them. The state
 * is read from the team's acts (platform_acts), never kept on the row: New, then taken (the workspace's claim), then
 * answered. A question answered is done; an ask answered waits on the workspace, and is done when the workspace shows
 * the work is (askDoneOf), or by hand where nothing can. The promise is a business day's, counted in New York.
 *
 * Pure: the server builds the queue to order and page it, and the page builds the same rows again in its reader's zone.
 */
import type { Tone } from "../shell/tone";
import type { ReportKind } from "../shell/report-problem";
import { ROLE_SAYS, ROLES } from "../config/workspace-config/role-perms";
import { dayInZone, dayPlusInZone, localToUtcMs } from "../calendar/zone-math";
import { clockDate, clockTime } from "../shared/clock";
import { agoWords, DAY_MS, WEEK_MS, spanLabel, timezoneCity } from "../shared/time";
import { platformRows, type PlatformRowVM, type PlatformTenantDto } from "../workspace/platform";
import { claimWords, staffName, type ClaimDto, type ConsoleAct } from "./console";
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
  unmailedOf,
  type AskSignalsDto,
  type SetupAskDto,
  type SupportReportDto,
  type SupportTopic,
  type SupportWhoDto,
} from "./support";

// ------------------------------------------------------------------------------------------- the promise's clock

/**
 * Where the promise's business days are counted (Ruben, 21 Oct 2026: "We answer within 24 hours on business days"):
 * Monday to Friday in New York. One constant; holidays are not counted yet.
 */
export const SUPPORT_ZONE = "America/New_York";

/** The promise: a person answers within this much of the business days' time. */
const SUPPORT_PROMISE_MS = DAY_MS;

/** At this share of the promise a row turns amber. */
const SUPPORT_SOON = 0.75;

/** The longest span the clock walks, in days: a row older than the Console reads is past its day long since. */
const CLOCK_DAYS_MAX = 400;

const isBusinessDay = (weekday: string) => weekday !== "sat" && weekday !== "sun";

/** The midnight that ends the day `atMs` falls on, in the promise's zone. */
function midnightAfter(atMs: number): number {
  const next = dayPlusInZone(SUPPORT_ZONE, atMs, 1);
  return localToUtcMs(SUPPORT_ZONE, next.y, next.m, next.d, 0, 0);
}

/** How much business time lies between two instants: their Monday-to-Friday hours in the promise's zone. */
export function businessMsBetween(fromMs: number, toMs: number): number {
  let at = fromMs;
  let sum = 0;
  for (let i = 0; i < CLOCK_DAYS_MAX && at < toMs; i += 1) {
    const end = Math.min(midnightAfter(at), toMs);
    if (isBusinessDay(dayInZone(SUPPORT_ZONE, at).weekday)) sum += end - at;
    at = end;
  }
  return sum;
}

/**
 * When a person must have answered: 24 hours of business days after it came in. A Friday 3 PM question is due Monday
 * 3 PM; one sent on a Saturday, by the end of Monday. Days are stepped by the calendar, so a clock change moves nothing.
 */
export function supportDueAt(createdMs: number): number {
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

/** A row's Waiting cell: how long, the promise's moment in the reader's zone, and its share of the day used. */
export interface SupportWaitVM {
  words: string;
  tone: Tone | null;
  /** The share of the promise used, 0 to 1; null on a row with no promise left to keep. */
  part: number | null;
}

const WEEKDAY_WORDS: Record<string, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

/** "by 9:12 AM tomorrow", "by 3:00 PM Mon": the promise's moment as the reader's own calendar says it. */
function byWords(dueMs: number, nowMs: number, zone: string): string {
  const due = dayInZone(zone, dueMs);
  const when =
    due.key === dayInZone(zone, nowMs).key
      ? "today"
      : due.key === dayPlusInZone(zone, nowMs, 1).key
        ? "tomorrow"
        : dueMs - nowMs < WEEK_MS
          ? (WEEKDAY_WORDS[due.weekday] ?? clockDate(dueMs, zone, nowMs))
          : clockDate(dueMs, zone, nowMs);
  return `by ${clockTime(dueMs, zone)} ${when}`;
}

/** "3h · by 9:12 AM tomorrow" over its bar, amber at three quarters of the day; "past its day by 5h" in red. */
export function supportWaitOf(createdMs: number, nowMs: number, zone: string): SupportWaitVM {
  const due = supportDueAt(createdMs);
  if (nowMs >= due) return { words: `past its day by ${spanLabel(nowMs - due)}`, tone: "danger", part: 1 };
  const part = Math.min(1, businessMsBetween(createdMs, nowMs) / SUPPORT_PROMISE_MS);
  return {
    words: `${spanLabel(nowMs - createdMs)} · ${byWords(due, nowMs, zone)}`,
    tone: part >= SUPPORT_SOON ? "warn" : null,
    part,
  };
}

// -------------------------------------------------------------------------------------------------- the queue

/** Support's views: what needs a person, what waits on the workspace, and what was answered in the last thirty days. */
export const SUPPORT_VIEWS = ["needs", "waiting", "done"] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

export const SUPPORT_VIEW_WORDS: Record<SupportView, string> = {
  needs: "Needs a person",
  waiting: "Waiting on them",
  done: "Done, 30 days",
};

/** How long Done remembers an answer, and how far back the queue reads. */
const SUPPORT_DONE_DAYS = 30;
export const SUPPORT_READ_DAYS = 90;

/** A page of the queue: Older reads the next. */
export const SUPPORT_PAGE = 50;

/** The queue's two kinds of row. */
const SUPPORT_ROW_KINDS = ["question", "ask"] as const;
export type SupportRowKind = (typeof SUPPORT_ROW_KINDS)[number];

export const SUPPORT_KIND_FILTERS = ["all", ...SUPPORT_ROW_KINDS] as const;
export type SupportKindFilter = (typeof SUPPORT_KIND_FILTERS)[number];

export const SUPPORT_KIND_FILTER_WORDS: Record<SupportKindFilter, string> = {
  all: "All",
  question: "Questions",
  ask: "Setup asks",
};

/** Where a row stands: nobody yet, someone on it, answered and waiting on the workspace, or finished. */
export type SupportState = "new" | "taken" | "waiting" | "done";

/** The acts that mark a row, by what each leaves it as. Sending again and moving it to Health change no state. */
const MARKS: Partial<Record<ConsoleAct, "open" | "answered" | "done">> = {
  report_answered: "answered",
  report_reopened: "open",
  ask_answered: "answered",
  ask_done: "done",
  ask_reopened: "open",
};

/** One of the team's marks on a row, as the log keeps it. */
export interface SupportActDto {
  act: ConsoleAct;
  target_kind: "report" | "ask";
  target_id: string;
  at: string;
  actor_email: string | null;
}

/** The latest mark of each row, by its target's id: what it is left as, when, and by whom. */
function lastMarks(
  acts: readonly SupportActDto[],
): Map<string, { mark: "open" | "answered" | "done"; at: number; by: string }> {
  const out = new Map<string, { mark: "open" | "answered" | "done"; at: number; by: string }>();
  for (const a of acts) {
    const mark = MARKS[a.act];
    const at = Date.parse(a.at);
    if (!mark || !Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (!was || at > was.at) out.set(a.target_id, { mark, at, by: staffName(a.actor_email) });
  }
  return out;
}

/** The first answer each row had, by its target's id: how fast we answered, once. */
function firstAnswers(acts: readonly SupportActDto[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of acts) {
    if (a.act !== "report_answered" && a.act !== "ask_answered") continue;
    const at = Date.parse(a.at);
    if (!Number.isFinite(at)) continue;
    const was = out.get(a.target_id);
    if (was === undefined || at < was) out.set(a.target_id, at);
  }
  return out;
}

/** Who sent it, in one line: "Dana Kim, Owner", else their address with their role, else that they were signed out. */
function whoLine(who: SupportWhoDto | null, email: string | null): string {
  const role = who?.role ? (roleWords(who.role) ?? null) : null;
  const named = who?.name || email;
  if (!named) return "Someone signed out";
  return role ? `${named}, ${role}` : named;
}

/** The parts of an address that name a desk, not a person: "info@" is nobody's first name. */
const DESK_WORDS = new Set([
  "info",
  "hello",
  "hi",
  "hey",
  "contact",
  "admin",
  "support",
  "team",
  "office",
  "sales",
  "booking",
  "bookings",
  "frontdesk",
  "reception",
  "mail",
  "email",
  "enquiries",
  "inquiries",
  "help",
  "service",
  "billing",
  "accounts",
  "owner",
  "manager",
  "noreply",
]);

/**
 * A first name from an address, where it starts with one: "ruben@" and "dana.kim@" say a name; "info@", "j@" and
 * "x92@" do not. Only when they gave no name of their own.
 */
export function firstNameOfAddress(email: string | null | undefined): string | null {
  const word = ((email ?? "").split("@")[0] ?? "").split(/[._+-]/)[0] ?? "";
  if (!/^[a-z]{2,}$/i.test(word) || DESK_WORDS.has(word.toLowerCase())) return null;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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
export function supportQueueOf(book: SupportBookDto, p: { me: string; nowMs: number; zone: string }): SupportRowVM[] {
  const marks = lastMarks(book.acts);
  const firsts = firstAnswers(book.acts);
  const claimOf = new Map(book.claims.map((c) => [c.tenant_id, c]));
  const rowOf = new Map(book.tenants.map((t) => [t.tenant_id, t]));
  const claimLine = (tenantId: string | null) =>
    tenantId ? claimWords(claimOf.get(tenantId) ?? null, p.me, p.nowMs) : null;
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
    .map((r): SupportRowVM => {
      const at = Date.parse(r.created_at);
      const s = stateOf(r.id, r.tenant_id, () => "done");
      const theirs = r.tenant_id ? (rowOf.get(r.tenant_id)?.timezone ?? null) : null;
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
        name: r.who?.name || null,
        first: firstName(r.who?.name) ?? firstNameOfAddress(r.email),
        role: r.who?.role ? (roleWords(r.who.role) ?? null) : null,
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
        doneNow: null,
        byHand: false,
        unmailed: unmailedOf(r),
        error: errorWordsOf(r),
      };
    });

  const asks = book.asks.map((a): SupportRowVM => {
    const at = Date.parse(a.at);
    const row = rowOf.get(a.tenant_id) ?? null;
    const sign = askDoneOf(a.what, row, at, book.signals[a.tenant_id] ?? null);
    const marked = marks.get(a.id);
    // Answered, an ask waits on the workspace; it is done when the workspace shows it, or when it was marked done.
    const s =
      sign.done && marked?.mark !== "open"
        ? { state: "done" as const, at: marked?.at ?? null }
        : stateOf(a.id, a.tenant_id, (mark) => (mark === "done" ? "done" : "waiting"));
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
      name: a.who?.name || null,
      first: firstName(a.who?.name) ?? firstNameOfAddress(a.email),
      role: a.who?.role ? (roleWords(a.who.role) ?? null) : null,
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
      doneNow: sign.done,
      byHand: sign.byHand,
      unmailed: null,
      error: null,
    };
  });

  return [...questions, ...asks]
    .map((r) => (r.state === "waiting" || r.state === "done" ? { ...r, wait: settledWait(r, p) } : r))
    .sort((a, b) => queueOrder(a, b, p.nowMs));
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
export function supportViewOf(r: Pick<SupportRowVM, "state">): SupportView {
  return r.state === "waiting" ? "waiting" : r.state === "done" ? "done" : "needs";
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
  f: SupportFilter,
  nowMs: number,
): { rows: SupportRowVM[]; counts: SupportCounts } {
  const kept = rows.filter((r) => inDone(r, nowMs));
  const views = { needs: 0, waiting: 0, done: 0 } as Record<SupportView, number>;
  for (const r of kept) views[supportViewOf(r)] += 1;
  const inView = kept.filter((r) => supportViewOf(r) === f.view && rowMatches(r, f.q));
  const kinds = { all: inView.length, question: 0, ask: 0 } as Record<SupportKindFilter, number>;
  for (const r of inView) kinds[r.kind] += 1;
  const ofKind = inView.filter((r) => f.kind === "all" || r.kind === f.kind);
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
    rows: ofKind.filter((r) => (!f.topic || r.topic === f.topic) && (!f.workspace || r.slug === f.workspace)),
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
  const said = `The last ${last.kind === "ask" ? "ask" : "question"} was ${last.code}, ${agoWords(last.atMs, nowMs)}`;
  return `Nothing needs a person. ${said}${last.answered ? `, ${last.answered.charAt(0).toLowerCase()}${last.answered.slice(1)}` : ""}.`;
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
