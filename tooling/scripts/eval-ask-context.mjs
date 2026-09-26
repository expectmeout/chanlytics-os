/**
 * The page a case is asked on (the Phase 2 plan, PR 2.3): what eval-ask.mjs sends with a question that carries a
 * `context`, built the way the palette builds it (legacy-bridge/ask/context.ts) from what the page's own GETs answer.
 *
 * A case's context names its page and, where the page draws rows, the GET those rows come from:
 *
 *   "context": { "surface": "people", "route": "clients", "view": "all", "rows": "GET contacts:5", "focus": "2" }
 *
 * `rows` is `GET <key>[+<key>…][:<n>]`: the first n rows of that GET's answer, in its order, each as the kind the
 * surface's provider sends (a conversation on the Inbox is a thread; on Conversations it is a conversation, and the
 * calls merge in by time, newest first, as that page merges them). It may instead be a list of literal rows
 * (`[{ "kind": "person", "id": "<uuid>" }]`): a row the eval workspace does not hold. `focus` is the row the words name
 * by its place ("2", "second"), or a literal `{ kind, id, label }`. A route may open a row of its own (`<row:1>`,
 * replaced by that row's id), and the scope is then the route's, as the palette reads it (contracts scopeFromRoute);
 * the focus, when no place is named, is the scope.
 *
 * Everything here is pure over the GETs' answers, so a test can build every case's context from fixtures and hold it
 * to the schema the route reads it with; the runner fetches the answers once before a turn is spent.
 */
import {
  ASK_CONTEXT_MAX_ROWS,
  ASK_SURFACES,
  PageContextSchema,
  personName,
  scopeFromRoute,
} from "@chanlytics/contracts";

/** A row of a GET's answer: its id, the name the page shows for it, and when it last moved (for a merge by time). */
const at = (...vs) => {
  for (const v of vs) {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    if (Number.isFinite(t)) return t;
  }
  return 0;
};
const list = (v) => (Array.isArray(v) ? v : []);

/** The GETs a page draws its rows from: where each is read, and its rows in the order it answers them. */
export const ROW_SOURCES = {
  conversations: {
    path: "/api/v1/conversations",
    rows: (d) =>
      list(d?.conversations).map((c) => ({ id: c.id, label: personName(c.contact), ts: at(c.last_message_at) })),
  },
  calls: {
    path: "/api/v1/calls",
    rows: (d) =>
      list(d?.calls).map((c) => ({
        id: c.id,
        label: c.contact ? personName(c.contact) : (c.caller_name ?? c.from_e164 ?? "a caller"),
        ts: at(c.started_at, c.ended_at),
      })),
  },
  contacts: {
    path: "/api/v1/contacts",
    rows: (d) => list(d?.people).map((p) => ({ id: p.id, label: personName(p), ts: 0 })),
  },
  leads: {
    path: "/api/v1/leads",
    rows: (d) => list(d?.rows).map((r) => ({ id: r.id, label: r.business_name ?? "a lead", ts: 0 })),
  },
  "lead-searches": {
    path: "/api/v1/lead-searches",
    rows: (d) => list(d?.searches).map((s) => ({ id: s.id, label: s.name ?? "a search", ts: 0 })),
  },
  playbooks: {
    path: "/api/v1/playbooks",
    rows: (d) => list(d?.playbooks).map((p) => ({ id: p.id, label: p.name ?? "a playbook", ts: 0 })),
  },
  broadcasts: {
    path: "/api/v1/broadcasts",
    rows: (d) => list(d?.broadcasts).map((b) => ({ id: b.id, label: b.name ?? "a broadcast", ts: 0 })),
  },
  // Campaigns › Messages draws every template with its status (the page's __TEMPLATES_ALL).
  templates: {
    path: "/api/v1/templates?all=1",
    rows: (d) => list(d?.templates).map((t) => ({ id: t.id, label: t.title ?? t.name ?? "a template", ts: 0 })),
  },
};

/**
 * The kind each surface's provider sends a GET's row as (legacy-bridge/ask/context.ts): a surface names only the GETs
 * its page draws from. Calendar, Reports, Settings and Start draw no rows the eval can read without writing (the
 * calendar's GET puts the people it names in People), so they carry a route and a view alone.
 */
export const ROW_KINDS = {
  today: { conversations: "thread", calls: "call", "lead-searches": "search" },
  inbox: { conversations: "thread" },
  conversations: { conversations: "conversation", calls: "call" },
  live: { calls: "call" },
  people: { contacts: "person" },
  // Where deals are off, the Pipeline's address draws People, and People says what it drew.
  pipeline: { contacts: "person" },
  leads: { leads: "lead", "lead-searches": "search" },
  campaigns: { playbooks: "playbook", broadcasts: "run", templates: "template" },
};

const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

/** A place in words or digits ("2", "#2", "second"), or null. */
export function ordinal(s) {
  if (typeof s !== "string") return null;
  const t = s.trim().toLowerCase().replace(/^#/, "");
  if (/^\d{1,2}$/.test(t)) return Number(t) >= 1 ? Number(t) : null;
  const i = ORDINAL_WORDS.indexOf(t);
  return i >= 0 ? i + 1 : null;
}

/** `GET <key>[+<key>…][:<n>]`, read: the keys and how many rows, null for all of them (forty at most). */
export function parseRows(spec) {
  const m = /^GET ([a-z-]+(?:\+[a-z-]+)*)(?::(\d{1,2}))?$/.exec(typeof spec === "string" ? spec.trim() : "");
  if (!m) return null;
  return { keys: m[1].split("+"), n: m[2] ? Number(m[2]) : null };
}

const isRow = (r) => r && typeof r === "object" && typeof r.kind === "string" && typeof r.id === "string";
const isScope = (f) => isRow(f) && typeof f.label === "string";

/** What is wrong with a case's context, in words; [] for a context the resolver can build. */
export function contextProblems(spec) {
  const out = [];
  if (!spec || typeof spec !== "object") return ["a context is an object"];
  if (!ASK_SURFACES.includes(spec.surface)) out.push(`no surface "${spec.surface}"`);
  if (typeof spec.route !== "string" || !spec.route) out.push("a context names its route");
  for (const k of Object.keys(spec))
    if (!["surface", "route", "view", "rows", "focus"].includes(k)) out.push(`a field the context does not know: ${k}`);
  if (spec.view !== undefined && spec.view !== null && typeof spec.view !== "string") out.push("a view is words");
  if (Array.isArray(spec.rows)) {
    if (!spec.rows.every(isRow)) out.push("a literal row is { kind, id }");
  } else if (spec.rows !== undefined) {
    const p = parseRows(spec.rows);
    if (!p) out.push(`rows "${spec.rows}" is not "GET <key>[:<n>]"`);
    else
      for (const k of p.keys) {
        if (!ROW_SOURCES[k]) out.push(`no GET ${k} the eval reads rows from`);
        else if (!ROW_KINDS[spec.surface]?.[k]) out.push(`the ${spec.surface} page draws no rows from GET ${k}`);
      }
  }
  if (spec.focus !== undefined && spec.focus !== null && !isScope(spec.focus) && ordinal(spec.focus) === null)
    out.push(`focus "${spec.focus}" is neither a place nor a { kind, id, label }`);
  if (ordinal(spec.focus) !== null && !spec.rows) out.push("a focus by its place needs rows to count");
  for (const [, n] of spec.route?.matchAll?.(/<row:(\d{1,2})>/g) ?? [])
    if (!spec.rows || Number(n) < 1) out.push(`the route opens row ${n}, and there are no rows to open`);
  return out;
}

/** The GET keys a set of cases needs answered, each once. */
export function neededGets(cases) {
  const keys = new Set();
  for (const c of cases) {
    const p = c.context && !Array.isArray(c.context.rows) ? parseRows(c.context.rows) : null;
    for (const k of p?.keys ?? []) keys.add(k);
  }
  return [...keys];
}

/** The rows a context names, from the GETs' answers: kind, id, and the label that stays here. */
function rowsOf(spec, answers) {
  if (Array.isArray(spec.rows)) return spec.rows.map((r) => ({ kind: r.kind, id: r.id, label: r.label ?? "" }));
  const p = parseRows(spec.rows);
  if (!p) return [];
  const got = p.keys.map((k) => {
    if (!(k in answers)) throw new Error(`GET ${k} was not read`);
    return ROW_SOURCES[k].rows(answers[k]).map((r) => ({ ...r, kind: ROW_KINDS[spec.surface][k] }));
  });
  // One GET keeps its own order; two merge by time, newest first, as Conversations merges its threads and calls.
  const merged = got.length === 1 ? got[0] : got.flat().sort((a, b) => b.ts - a.ts);
  return merged
    .filter((r) => typeof r.id === "string" && r.id)
    .slice(0, Math.min(p.n ?? ASK_CONTEXT_MAX_ROWS, ASK_CONTEXT_MAX_ROWS));
}

const SCOPE_KINDS = new Set(["thread", "conversation", "call", "person", "lead", "search", "run"]);

/**
 * A case's page, as the palette would send it: `{ context, scope }`, the context one the route's schema takes and the
 * scope the route opens (null on a list). `answers` holds each GET's `data`, by key; `now` is the tab's clock.
 */
export function resolveContext(spec, answers = {}, now = Date.now()) {
  const problems = contextProblems(spec);
  if (problems.length) throw new Error(`a context the eval cannot build: ${problems.join("; ")}`);
  const rows = rowsOf(spec, answers);
  const route = spec.route.replace(/<row:(\d{1,2})>/g, (_, n) => {
    const r = rows[Number(n) - 1];
    if (!r) throw new Error(`the route opens row ${n}, and the page drew ${rows.length}`);
    return r.id;
  });
  const [page, ...rest] = route.split("/");
  const param = rest.length ? rest.join("/") : null;
  const opened = rows.find((r) => param && param.endsWith(r.id));
  const scope = scopeFromRoute(page, param, opened?.label || null);
  const n = ordinal(spec.focus);
  const placed = n !== null ? rows.filter((r) => SCOPE_KINDS.has(r.kind))[n - 1] : null;
  const focus = isScope(spec.focus)
    ? { kind: spec.focus.kind, id: spec.focus.id, label: spec.focus.label }
    : placed
      ? { kind: placed.kind, id: placed.id, label: (placed.label || `this ${placed.kind}`).slice(0, 80) }
      : n !== null
        ? null
        : scope;
  const context = {
    v: 1,
    surface: spec.surface,
    route: route.slice(0, 200),
    view: typeof spec.view === "string" ? spec.view : null,
    focus: focus ?? null,
    rows: rows.map(({ kind, id }) => ({ kind, id })),
    askedAt: now,
  };
  const read = PageContextSchema.safeParse(context);
  if (!read.success) throw new Error(`a context the route would refuse: ${JSON.stringify(read.error.issues)}`);
  return { context: read.data, scope };
}

/** Every case whose page cannot be built, in words: said before anything is read or spent. */
export function pageProblems(cases) {
  return cases.flatMap((c) =>
    c.context
      ? [
          ...contextProblems(c.context).map((p) => `${c.id}: ${p}`),
          ...(c.surface && c.context.surface !== c.surface
            ? [`${c.id}: asked on ${c.surface}, its page is ${c.context.surface}`]
            : []),
        ]
      : [],
  );
}

/**
 * What a run is about to spend, by surface, before it spends a turn (D17): the cases, how many carry their page, the
 * turns and their cost at `perTurn` dollars a turn, and the warms, which reach no model.
 */
export function announcement(cases, reps, perTurn) {
  const cost = (n) => `$${(n * reps * perTurn).toFixed(2)}`;
  const lines = [...new Set(cases.map((c) => c.surface))].map((s) => {
    const cs = cases.filter((c) => c.surface === s);
    const paged = cs.filter((c) => c.context).length;
    return `  ${s}: ${cs.length} case(s)${paged ? ` (${paged} with the page)` : ""} × ${reps} = ${cs.length * reps} turns ≈ ${cost(cs.length)}`;
  });
  const warms = cases.filter((c) => c.context).length * reps;
  lines.push(
    `${cases.length} cases × ${reps} = ${cases.length * reps} turns ≈ ${cost(cases.length)} at the baseline $${perTurn} a turn (spec §9)` +
      (warms ? `, and ${warms} warms (POST ask/warm, no model)` : ""),
  );
  return lines.join("\n") + "\n";
}

/** A context in a few words, for the listing and the log: its route, its rows and its focus. */
export function describeContext(spec) {
  if (!spec) return "";
  const rows = Array.isArray(spec.rows) ? `${spec.rows.length} literal row(s)` : (spec.rows ?? "no rows");
  const focus = spec.focus ? ` · focus ${typeof spec.focus === "string" ? spec.focus : spec.focus.kind}` : "";
  return `#/${spec.route}${spec.view ? ` (${spec.view})` : ""} · ${rows}${focus}`;
}

/* ---- what the judge asks of a case that rode with its page ---- */

/** The reads that ride in every turn as the snapshot until PR 2.4 (loop.ts): a case that names one needs no read. */
export const OVERVIEW = ["get_today", "list_threads", "list_calls"];

/**
 * Whether a case's tools may be missing: the page answered it. The snapshot's overview still excuses today's cases (the
 * loop carries it until PR 2.4); a case marked `on_page` is excused when the page it asked about rode with it -- its
 * rows, when it names a GET for them and that GET drew at least one; the page itself, when it draws no rows.
 */
export function fromContext(c, m, sent) {
  const e = c.expect ?? {};
  const tools = m?.tools ?? [];
  const fromSnapshot =
    !!e.tools_any && e.tools_any.some((t) => OVERVIEW.includes(t)) && !tools.some((t) => OVERVIEW.includes(t));
  if (fromSnapshot) return true;
  if (!e.on_page || !c.context || !sent) return false;
  return c.context.rows ? sent.rows.length > 0 : true;
}

/** Every place an answer names a row: its citations, the rows and the Open it shows, and where it goes. */
function named(m) {
  const a = m?.answer;
  return [
    ...(m?.citations ?? []).map((x) => `${x.kind}:${x.id}:${x.route ?? ""}`),
    ...(a ? a.show.items.map((i) => i.source?.to ?? "") : []),
    a?.do?.open?.to ?? "",
    m?.navigate?.to ?? "",
  ];
}

/**
 * What a case's own page asks of the answer: `never_cites` (ids that must appear in no citation, row, Open or
 * navigation: a row of another workspace) and `names_focus` (the answer says the name of the row the words pointed
 * at, by its first word, or says it holds nothing on it when the page drew none there).
 */
export function contextFails(c, m, sent) {
  const e = c.expect ?? {};
  const fails = [];
  const places = named(m);
  for (const id of e.never_cites ?? [])
    if (places.some((p) => p.includes(id))) fails.push(`the answer names a row it cannot hold: ${id}`);
  if (e.names_focus) {
    const label = sent?.focus?.label ?? "";
    const first = label.split(/\s+/)[0] ?? "";
    const text = (m?.text ?? "").toLowerCase();
    if (!sent?.focus) fails.push("the case names a row by its place, and the page drew none there");
    else if (first.length >= 2 && !/^this$/i.test(first) && !text.includes(first.toLowerCase()))
      fails.push(`the answer does not name ${label}, the row the words pointed at`);
  }
  return fails;
}
