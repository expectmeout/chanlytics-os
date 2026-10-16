/**
 * The page a person is on, as Ask is sent it (contracts PageContext; the Phase 2 plan, PR 2.1): one provider a
 * surface, and Ask reads two things only (OW6, R2 C): the typed store, which a surface publishes its value to
 * (`surfaceValue`: Today's queue, Conversations' rows, Live's calls, Leads' rows, the playbooks, the broadcasts, the
 * messages), and, where the rows on screen are the page's own state (the Inbox's bucket, People's list and search, the
 * Pipeline's box, the Calendar's span), what the page said it drew (on-screen.ts, written at draw time).
 * No provider reads a window name of a page's own. Identities and words only: a row is its kind and id, and its label
 * stays in the tab, where the words that name a row are matched. The server reads every id again under the person's RLS
 * and believes nothing else the tab says.
 *
 * A provider that finds its value missing or in a shape it does not know gives no rows rather than throwing: a page that
 * has not loaded yet is asked about with its route alone.
 */
import {
  ASK_CONTEXT_MAX_ROWS,
  ASK_SCOPE_KINDS,
  itemFocus,
  parseLeadsRoute,
  parsePipelineRoute,
  parseSequencesRoute,
  scopeFromRoute,
  type AskContextRowKind,
  type AskScope,
  type AskSurface,
  type PageContext,
} from "@chanlytics/contracts";
import { cvRoute, inChannel } from "@/surfaces/inbox/cv-rules";
import { surfaceValue } from "@/surfaces/surface-values";
import { askOnScreenOf, type OnScreenKey } from "./on-screen";
import { surfaceFor } from "./palette";

type Route = { page: string; param: string | null };
/** A row as a provider finds it: its label, when the page shows one, is for matching the words and never leaves. */
type Row = { kind: AskContextRowKind; id: string; label?: string };
type Provided = { view?: string | null; rows: Row[]; focus?: AskScope | null };
/** Over the window the ask is made from, which holds only what a page said it drew (on-screen.ts), and the route. */
type Provider = (win: object, route: Route) => Provided;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** What a page said it drew, when it is the page asked about: a key that is another page's is not believed. */
const drawn = (win: object, key: OnScreenKey, kind: AskContextRowKind): Provided => {
  const s = askOnScreenOf(win);
  if (!s || s.key !== key) return { rows: [] };
  const labels = arr<string>(s.labels);
  return {
    view: typeof s.view === "string" ? s.view : null,
    rows: arr<string>(s.ids)
      .filter((id) => typeof id === "string" && id)
      .map((id, i) => ({ kind, id, ...(typeof labels[i] === "string" ? { label: labels[i] } : {}) })),
  };
};

const today: Provider = () => ({
  rows: arr<{ id: string; kind: string; conversationId: string | null; callId: string | null; who?: string }>(
    surfaceValue("today")?.queue?.rows,
  ).flatMap((r): Row[] => {
    const label = r.who;
    // A search waiting on its owner is `q-s-<search>` (contracts today.ts); a person's row is their thread, else the call.
    if (r.kind === "search") return r.id.startsWith("q-s-") ? [{ kind: "search", id: r.id.slice(4), label }] : [];
    if (r.conversationId) return [{ kind: "thread", id: r.conversationId, label }];
    if (r.callId) return [{ kind: "call", id: r.callId, label }];
    return [];
  }),
});

const inbox: Provider = (w) => drawn(w, "inbox", "thread");

/** Conversations: the rows of the tab the address names (cv-rules.ts, the page's own rules), a call's row as the call. */
const conversations: Provider = (_w, route) => {
  const tab = cvRoute(route.param).channel;
  return {
    view: tab,
    rows: arr<{ id: string; who?: string; channel: string }>(surfaceValue("conversations")?.CONVERSATIONS)
      .filter((c) => inChannel(c, tab))
      .map((c): Row => {
        const label = c.who;
        return c.id.startsWith("cv-")
          ? { kind: "call", id: c.id.slice(3), label }
          : { kind: "conversation", id: c.id, label };
      }),
  };
};

const live: Provider = () => {
  const shown = surfaceValue("live");
  return {
    rows: [
      ...arr<{ callId: string; who?: string }>(shown?.now),
      ...arr<{ callId: string; who?: string }>(shown?.recent),
    ]
      .filter((c) => typeof c.callId === "string")
      .map((c) => ({ kind: "call", id: c.callId, label: c.who })),
  };
};

const people: Provider = (w) => drawn(w, "people", "person");

const leads: Provider = (_w, route) => {
  const shown = surfaceValue("leads");
  const parsed = parseLeadsRoute(`clients/${route.param ?? "leads"}`);
  const list = shown?.view?.list ?? parsed?.list ?? null;
  const cls = shown?.view?.cls ?? parsed?.cls ?? null;
  return {
    view: list ? `${list}${cls ? `/${cls}` : ""}` : null,
    rows: arr<{ id: string; name?: string }>(shown?.rows).map((r) => ({ kind: "lead", id: r.id, label: r.name })),
  };
};

const pipeline: Provider = (w, route) => {
  // Where deals are off, the Pipeline's address draws People (surfaces/people/chrome.ts peopleTakes), and People says what it drew.
  const got = askOnScreenOf(w)?.key === "people" ? drawn(w, "people", "person") : drawn(w, "pipeline", "person");
  return { ...got, view: got.view ?? parsePipelineRoute(`clients/${route.param ?? "pipeline"}`)?.view ?? null };
};

const calendar: Provider = (w) => drawn(w, "calendar", "person");

/**
 * Reports' view is what it shows, read through the seam (the surface's value), as the server's context provider describes
 * it: the days a period is, as a count, or the days a member picked, by their one name (`2026-09-01~2026-09-20`), so Ask
 * reads the numbers of the days on screen and not of the days up to today.
 */
const reports: Provider = () => {
  const shown = surfaceValue("reports");
  if (!shown) return { view: null, rows: [] };
  return { view: shown.period === null ? shown.key : String(shown.days), rows: [] };
};

/** A sequence as Ask is told it (decision 0060): by what it is stored as, a one-off its run, one to leads its reach-out. */
const sequenceRow = (q: { id: string; name: string; starts: string }): Row => ({
  kind: q.starts === "date" ? "run" : q.starts === "leads" ? "reach_out" : "playbook",
  id: q.id,
  label: q.name,
});

/**
 * A sequence open beside the list, the scope of a turn asked over it: the row it is stored as, one to leads the page at its
 * address (a reach-out's scope, as contracts scopeFromRoute says one open in the home's drawer was).
 */
const sequenceFocus = (q: { id: string; name: string; starts: string }, at: string): AskScope =>
  q.starts === "leads"
    ? { kind: "page", id: at, label: q.name }
    : { kind: q.starts === "date" ? "run" : "playbook", id: q.id, label: q.name };

/**
 * Campaigns is Sequences (decision 0060), whose rows are its list's, forty at most in its order, and a sequence open beside
 * it the scope; before the list is read, the playbooks the surface read. Sent's sheets and Messages are their own views,
 * each with its own rows.
 */
const campaigns: Provider = (w, route) => {
  if (route.page === "outbound" || route.page === "campaigns") {
    const listed = surfaceValue("sequences")?.sequences;
    if (Array.isArray(listed)) {
      const at = `campaigns/${route.param ?? ""}`;
      const place = parseSequencesRoute(at);
      const open = place?.view === "record" ? listed.find((q) => q.id === place.id) : undefined;
      return {
        view: "sequences",
        rows: listed.slice(0, 40).map(sequenceRow),
        ...(open ? { focus: sequenceFocus(open, at) } : {}),
      };
    }
    return {
      view: "playbooks",
      rows: arr<{ id: string; name?: string }>(surfaceValue("playbooks")?.rows).map((p) => ({
        kind: "playbook",
        id: p.id,
        label: p.name,
      })),
    };
  }
  if (route.page === "broadcasts")
    return {
      view: "broadcasts",
      rows: arr<{ id: string; name?: string | null }>(surfaceValue("broadcasts")?.rows).map((b) => ({
        kind: "run",
        id: b.id,
        label: b.name ?? undefined,
      })),
    };
  return {
    view: "messages",
    rows: arr<{ id: string; name?: string; title?: string | null }>(surfaceValue("settings")?.templatesAll).map(
      (t) => ({
        kind: "template",
        id: t.id,
        label: t.title ?? t.name,
      }),
    ),
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
  const surface = surfaceFor(route.page, route.param);
  let got: Provided;
  try {
    got = PROVIDERS[surface]?.(win, route) ?? { rows: [] };
  } catch {
    got = { rows: [] };
  }
  const rows = got.rows
    .filter((r) => typeof r.id === "string" && r.id && r.id.length <= 120)
    .slice(0, ASK_CONTEXT_MAX_ROWS);
  // Words that name no row -- an answer's item of a kind no focus may be among them -- leave the page's own focus, then
  // the route's; never the page's row at that place. Paired with the eval (tooling/scripts/eval-ask-context.mjs
  // resolveContext, `item ?? scope`): change one, change the other.
  // A reach-out's drawer is told from a campaign's by the chains the page read (contracts scopeFromRoute).
  const focus =
    (words ? wordsFocus(words, rows, thread) : null) ??
    got.focus ??
    scopeFromRoute(route.page, route.param, null, surfaceValue("reach_outs"));
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
