/**
 * The page a person is on, as Ask is sent it (contracts PageContext; the Phase 2 plan, PR 2.1): one provider a
 * surface, each reading only what its page already holds -- the globals the surfaces publish, or, where the rows on
 * screen are the page's own state (the Inbox's bucket, People's list and search, the Pipeline's box, the Calendar's
 * span), what the page said it drew (`window.__askOnScreen`, written at draw time). Identities and words only: a row
 * is its kind and id, and its label stays in the tab, where the words that name a row are matched. The server reads
 * every id again under the person's RLS and believes nothing else the tab says.
 *
 * A provider that finds its global missing or in a shape it does not know gives no rows rather than throwing: a page
 * that has not loaded yet is asked about with its route alone.
 */
import {
  ASK_CONTEXT_MAX_ROWS,
  ASK_SCOPE_KINDS,
  itemFocus,
  parseLeadsRoute,
  parsePipelineRoute,
  scopeFromRoute,
  type AskContextRowKind,
  type AskScope,
  type AskSurface,
  type PageContext,
} from "@chanlytics/contracts";
import { surfaceFor } from "./palette";

type Route = { page: string; param: string | null };
/** A row as a provider finds it: its label, when the page shows one, is for matching the words and never leaves. */
type Row = { kind: AskContextRowKind; id: string; label?: string };
type Provided = { view?: string | null; rows: Row[]; focus?: AskScope | null };
type Provider = (w: ContextGlobals, route: Route) => Provided;

/** What a page that holds its rows in state says it drew (D3): its key, the ids in its order, and its view. */
export interface OnScreen {
  key: "inbox" | "people" | "pipeline" | "calendar";
  ids: string[];
  view?: string | null;
  /** The names the rows show, beside their ids, so the words can name one; kept in the tab. */
  labels?: string[];
}

/** Today's queue row, as far as a provider reads it (contracts TodayQueueRowVM). */
type TodayRow = { id: string; kind: string; conversationId: string | null; callId: string | null; who?: string };

interface ContextGlobals {
  __askOnScreen?: OnScreen | null;
  TODAY_DATA?: { queue?: { rows?: TodayRow[] } } | null;
  CONVERSATIONS_DATA?: { CONVERSATIONS?: Array<{ id: string; who?: string; name?: string; channel?: string }> } | null;
  CV_ROUTE?: (word: string | null) => { channel: string; id: string | null };
  CV_IN_CHANNEL?: (row: unknown, channel: string) => boolean;
  __LIVE?: { now?: Array<{ callId: string; who?: string }>; recent?: Array<{ callId: string; who?: string }> } | null;
  __LEADS?: {
    rows?: Array<{ id: string; name?: string }>;
    view?: { list?: string; cls?: string | null } | null;
  } | null;
  __REPORTS?: { days?: number } | null;
  __PLAYBOOKS?: { rows?: Array<{ id: string; name?: string }> } | null;
  __BROADCASTS?: { rows?: Array<{ id: string; name?: string | null }> } | null;
  __TEMPLATES_ALL?: Array<{ id: string; name?: string; title?: string | null }> | null;
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** What a page said it drew, when it is the page asked about: a key that is another page's is not believed. */
const drawn = (w: ContextGlobals, key: OnScreen["key"], kind: AskContextRowKind): Provided => {
  const s = w.__askOnScreen;
  if (!s || s.key !== key) return { rows: [] };
  const labels = arr<string>(s.labels);
  return {
    view: typeof s.view === "string" ? s.view : null,
    rows: arr<string>(s.ids)
      .filter((id) => typeof id === "string" && id)
      .map((id, i) => ({ kind, id, ...(typeof labels[i] === "string" ? { label: labels[i] } : {}) })),
  };
};

const today: Provider = (w) => ({
  rows: arr<TodayRow>(w.TODAY_DATA?.queue?.rows).flatMap((r): Row[] => {
    const label = r.who;
    // A search waiting on its owner is `q-s-<search>` (contracts today.ts); a person's row is their thread, else the call.
    if (r.kind === "search") return r.id.startsWith("q-s-") ? [{ kind: "search", id: r.id.slice(4), label }] : [];
    if (r.conversationId) return [{ kind: "thread", id: r.conversationId, label }];
    if (r.callId) return [{ kind: "call", id: r.callId, label }];
    return [];
  }),
});

const inbox: Provider = (w) => drawn(w, "inbox", "thread");

const conversations: Provider = (w, route) => {
  const tab = w.CV_ROUTE ? w.CV_ROUTE(route.param).channel : "all";
  const inTab = w.CV_IN_CHANNEL;
  return {
    view: tab,
    rows: arr<{ id: string; who?: string; name?: string; channel?: string }>(w.CONVERSATIONS_DATA?.CONVERSATIONS)
      .filter((c) => (inTab ? inTab(c, tab) : true))
      .map((c): Row => {
        const label = c.who ?? c.name;
        return c.id.startsWith("cv-")
          ? { kind: "call", id: c.id.slice(3), label }
          : { kind: "conversation", id: c.id, label };
      }),
  };
};

const live: Provider = (w) => ({
  rows: [
    ...arr<{ callId: string; who?: string }>(w.__LIVE?.now),
    ...arr<{ callId: string; who?: string }>(w.__LIVE?.recent),
  ]
    .filter((c) => typeof c.callId === "string")
    .map((c) => ({ kind: "call", id: c.callId, label: c.who })),
});

const people: Provider = (w) => drawn(w, "people", "person");

const leads: Provider = (w, route) => {
  const v = w.__LEADS?.view;
  const parsed = parseLeadsRoute(`clients/${route.param ?? "leads"}`);
  const list = v?.list ?? parsed?.list ?? null;
  const cls = v?.cls ?? parsed?.cls ?? null;
  return {
    view: list ? `${list}${cls ? `/${cls}` : ""}` : null,
    rows: arr<{ id: string; name?: string }>(w.__LEADS?.rows).map((r) => ({ kind: "lead", id: r.id, label: r.name })),
  };
};

const pipeline: Provider = (w, route) => {
  // Where deals are off, the Pipeline's address draws People (surfaces/people/chrome.ts peopleTakes), and People says what it drew.
  const got = w.__askOnScreen?.key === "people" ? drawn(w, "people", "person") : drawn(w, "pipeline", "person");
  return { ...got, view: got.view ?? parsePipelineRoute(`clients/${route.param ?? "pipeline"}`)?.view ?? null };
};

const calendar: Provider = (w) => drawn(w, "calendar", "person");

const reports: Provider = (w) => ({
  view: typeof w.__REPORTS?.days === "number" ? String(w.__REPORTS.days) : null,
  rows: [],
});

/** Campaigns is three pages: the tab is the page, and its rows are that page's. */
const campaigns: Provider = (w, route) => {
  if (route.page === "outbound")
    return {
      view: "playbooks",
      rows: arr<{ id: string; name?: string }>(w.__PLAYBOOKS?.rows).map((p) => ({
        kind: "playbook",
        id: p.id,
        label: p.name,
      })),
    };
  if (route.page === "broadcasts")
    return {
      view: "broadcasts",
      rows: arr<{ id: string; name?: string | null }>(w.__BROADCASTS?.rows).map((b) => ({
        kind: "run",
        id: b.id,
        label: b.name ?? undefined,
      })),
    };
  return {
    view: "messages",
    rows: arr<{ id: string; name?: string; title?: string | null }>(w.__TEMPLATES_ALL).map((t) => ({
      kind: "template",
      id: t.id,
      label: t.title ?? t.name,
    })),
  };
};

/** Settings' view is its pane (admin/<pane>, the workspace by default). */
const settings: Provider = (_w, route) => ({ view: route.param?.split("/")[0] || "workspace", rows: [] });

/** Start's view is its step (start/<step>), where ⌘K opens the palette over the first run (Phase 7). */
const start: Provider = (_w, route) => ({ view: route.param?.split("/")[0] || null, rows: [] });

const PROVIDERS: Partial<Record<AskSurface, Provider>> = {
  today,
  inbox,
  conversations,
  live,
  people,
  leads,
  pipeline,
  calendar,
  reports,
  campaigns,
  settings,
  start,
};

/**
 * A row by its place, in words: "the second", "the second one", "el segundo", "la tercera". Never the digits ("the
 * 2nd" is a date on the Calendar), and only where the place is the row itself: the question ends there, or "one" or a
 * row's noun follows ("the first thing to do", "the second most common question" name no row).
 */
const ORDINALS: Array<[string, number]> = [
  ["first|primer|primero|primera", 1],
  ["second|segundo|segunda", 2],
  ["third|tercer|tercero|tercera", 3],
  ["fourth|cuarto|cuarta", 4],
  ["fifth|quinto|quinta", 5],
  ["sixth|sexto|sexta", 6],
  ["seventh|septimo|septima", 7],
  ["eighth|octavo|octava", 8],
  ["ninth|noveno|novena", 9],
  ["tenth|decimo|decima", 10],
];
/** What may follow a place that names a row: "one" or a row's own noun, whatever comes after; or the question ends. */
const ROW_AFTER =
  "(?:\\s+(?:one|uno|una|row|thread|person|conversation|call|lead|search|fila|conversacion|llamada|persona|cliente|client|customer)\\b|\\s*(?:[?.!,]|$))";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);

/**
 * The place the words name a row by (folded words): "#2", "number 2", "el número 2" where it ends the question (an
 * invoice's "#3" mid-sentence names no row), or an ordinal in English or Spanish ("the second", "el segundo", "la
 * tercera") where it ends the question or "one" or a row's noun follows; else none.
 */
function placeOf(said: string): number | null {
  const hash = new RegExp(
    `(?:^|\\s)(?<!\\b(?:invoice|order|ticket|room|table|step|page|line|item|factura|pedido|mesa|paso)\\s)(?:#|number\\s|numero\\s)\\s?(\\d{1,2})${ROW_AFTER}`,
  ).exec(said);
  if (hash) return Number(hash[1]);
  for (const [words, at] of ORDINALS)
    if (new RegExp(`\\b(?:the|el|la|lo)\\s+(?:${words})${ROW_AFTER}`).test(said)) return at;
  return null;
}

/**
 * The row the words name on screen (the spec's 5.5; the plan's D4): a place (placeOf) picks that row; otherwise a row
 * whose name appears whole in the words (case and accents aside, the longest name winning, a name under three letters
 * never); otherwise none. Only a row a scope may be.
 */
export function focusFromWords(words: string, rows: Row[]): AskScope | null {
  const scoped = rows.filter((r) => SCOPE_KINDS.has(r.kind));
  if (!scoped.length) return null;
  const said = fold(words);
  const asScope = (r: Row): AskScope => ({
    kind: r.kind as AskScope["kind"],
    id: r.id,
    label: (r.label ?? "").slice(0, 80) || `this ${r.kind}`,
  });
  const n = placeOf(said);
  if (n !== null && scoped[n - 1]) return asScope(scoped[n - 1]);
  let best: Row | null = null;
  const plain = words.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const r of scoped) {
    const name = fold(r.label ?? "").trim();
    if (name.length < 3) continue;
    const at = said.indexOf(name);
    if (at < 0) continue;
    const before = at === 0 ? " " : said[at - 1];
    const after = said[at + name.length] ?? " ";
    // Whole: "Ana" is not named by "Banana".
    if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
    // One word is a name only as a name is written, capitalised, or as someone's ("Grace", "grace's"): "the grace
    // period" names nobody. Two words or more are a name however they are typed.
    if (!/\s/.test(name) && !/^[A-Z]/.test(plain.slice(at, at + 1)) && !said.startsWith("'s", at + name.length))
      continue;
    if (!best || name.length > fold(best.label ?? "").length) best = r;
  }
  return best ? asScope(best) : null;
}

/** A message of the open thread as the Line holds it: an answer, or the fields an answer made before the Line kept. */
export type ThreadMessage = Parameters<typeof itemFocus>[0] & { role: string };

/**
 * The row the words name (the Phase 5 plan, D7): asked in an open thread, a place is first its last answer's item at
 * that place (contracts itemFocus) -- one no focus may be names none, and never the page's row at that place -- and the
 * page's rows only past the answer's items; a name, or a place with no answer to count, is the page's (focusFromWords).
 * A thread in a shape it does not know is no thread.
 */
function wordsFocus(words: string, rows: Row[], thread?: ReadonlyArray<ThreadMessage> | null): AskScope | null {
  const n = placeOf(fold(words));
  let item: AskScope | null | undefined;
  try {
    const last =
      n !== null && Array.isArray(thread) ? [...thread].reverse().find((m) => m?.role === "assistant") : null;
    item = last && n !== null ? itemFocus(last, n) : undefined;
  } catch {
    item = undefined;
  }
  return item === undefined ? focusFromWords(words, rows) : item;
}

const routeOf = (r: Route) => (r.param ? `${r.page}/${r.param}` : r.page).slice(0, 200);

/**
 * The page, as Ask is sent it: the surface, the route, the page's view, the row open or named, and the rows on screen
 * in the page's order, forty at most, kind and id only. The words, when given, may name the focus -- in an open thread
 * (`thread`, its messages as the Line holds them) by its last answer's items first; else the page's own; else the
 * route's.
 */
export function pageContext(
  win: Window,
  route: Route,
  words?: string,
  thread?: ReadonlyArray<ThreadMessage> | null,
): PageContext {
  const w = win as unknown as ContextGlobals;
  const surface = surfaceFor(route.page, route.param);
  let got: Provided;
  try {
    got = PROVIDERS[surface]?.(w, route) ?? { rows: [] };
  } catch {
    got = { rows: [] };
  }
  const rows = got.rows
    .filter((r) => typeof r.id === "string" && r.id && r.id.length <= 120)
    .slice(0, ASK_CONTEXT_MAX_ROWS);
  // Words that name no row -- an answer's item of a kind no focus may be among them -- leave the page's own focus, then
  // the route's; never the page's row at that place. Paired with the eval (tooling/scripts/eval-ask-context.mjs
  // resolveContext, `item ?? scope`): change one, change the other.
  const focus =
    (words ? wordsFocus(words, rows, thread) : null) ?? got.focus ?? scopeFromRoute(route.page, route.param);
  return {
    v: 1,
    surface,
    route: routeOf(route),
    view: typeof got.view === "string" ? got.view.slice(0, 80) : null,
    focus: focus ? { kind: focus.kind, id: focus.id.slice(0, 120), label: focus.label.slice(0, 80) } : null,
    // The labels stay in the tab.
    rows: rows.map(({ kind, id }) => ({ kind, id })),
    askedAt: Date.now(),
  };
}
