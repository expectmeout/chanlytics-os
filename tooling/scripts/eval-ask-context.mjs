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
 *
 * A case may carry a second turn (the Phase 5 plan, PR 5.2), asked in the first turn's thread:
 *
 *   "then": { "text": "open the second", "expect": { … }, "context": { …, "focus": "2" } }
 *
 * Its page is the case's own unless `then.context` names one of its own, or none (`null`); `then.surface` says where
 * a turn with no page is asked. It is judged as a case of its own, under the case's id, and against the turn before it
 * (followUpFails). Only new cases carry one: the cases before PR 5.2 stay one turn, so their results stay comparable.
 *
 * Beside the pure parts, the runner's few requests that are more than one question live here too, each over what the
 * runner hands in, so a test hands a fake: a settings note approved between the turns and put back (approveBetween,
 * putBack, over an injected fetch), and what a run cost (usageRows, turnShapes, over an injected PostgREST read).
 */
import {
  ASK_ANSWER_CAPS,
  ASK_CONTEXT_MAX_ROWS,
  ASK_SURFACES,
  PageContextSchema,
  answerFromV1,
  citationRoute,
  personName,
  proposalSpec,
  scopeFromRoute,
} from "@chanlytics/contracts";
import { readAllRows } from "@chanlytics/db";

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

/** The GET keys a set of cases needs answered, each once: the pages of their first turns and of their second. */
export function neededGets(cases) {
  const keys = new Set();
  for (const c of cases)
    for (const spec of [c.context, secondTurn(c)?.context]) {
      const p = spec && !Array.isArray(spec.rows) ? parseRows(spec.rows) : null;
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

/* ---- a case's second turn ---- */

/** What a second turn may say: its words, what they must do, its page, its surface, and what happens before it. */
const THEN_KEYS = ["text", "expect", "context", "surface", "between"];
/** What may happen between the turns: turn 1's card approved as the Line approves it, and put back after turn 2. */
const BETWEEN = ["approve"];
/** The checks that judge a second turn against its first (followUpFails): a first turn has none before it. */
const FOLLOW_UP_CHECKS = ["names_card", "opens_item", "drops_first_scope"];

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A case's second turn, as the runner asks it, or null for a case of one turn: its words and what they must do; its
 * page -- the case's own, unless `then.context` names one of its own (an object) or none (null); its surface --
 * `then.surface`, else its page's, else the case's; whether its page is warmed again, which it is only when it is a
 * page of its own that differs from turn 1's (the palette warms as the page under it changes); and what happens between
 * the turns (`between`, approveBetween). Judged under the case's id and its must-never, so pass^k holds a case to both
 * of its turns.
 */
export function secondTurn(c) {
  const t = c?.then;
  if (!t) return null;
  const own = t.context !== undefined;
  const context = own ? t.context : (c.context ?? null);
  return {
    id: c.id,
    text: t.text,
    expect: t.expect ?? {},
    context,
    surface: t.surface ?? context?.surface ?? c.surface ?? "today",
    must_never: c.must_never === true,
    warm: !!context && own && JSON.stringify(context) !== JSON.stringify(c.context ?? null),
    between: t.between ?? null,
  };
}

/**
 * The scope turn 2 is sent with, as the palette sends it once PR 5.1 is in (the chip first, else the thread's): the row
 * turn 2's page opens (resolveContext's scope, contracts scopeFromRoute), else turn 1's. The key is always sent, null
 * when neither is; before 5.1 the route falls back to the thread's scope on a null either way.
 */
export function secondScope(page, first) {
  return page?.scope ?? first ?? null;
}

/** What is wrong with a case's second turn, in words; [] for a case of one turn, or a second turn the runner can ask. */
function secondTurnProblems(c) {
  const t = c.then;
  if (t === undefined) return [];
  if (!isObject(t)) return ["a second turn (then) is an object"];
  const out = [];
  for (const k of Object.keys(t))
    if (!THEN_KEYS.includes(k)) out.push(`a field the second turn does not know: then.${k}`);
  if (typeof t.text !== "string" || !t.text.trim()) out.push("a second turn says its words (then.text)");
  if (!isObject(t.expect)) out.push("a second turn says what it expects (then.expect)");
  const n = t.expect?.opens_item;
  if (n !== undefined && !(Number.isInteger(n) && n >= 1 && n <= ASK_ANSWER_CAPS.items))
    out.push(`then.expect.opens_item is an item's place, 1 to ${ASK_ANSWER_CAPS.items}`);
  if (t.surface !== undefined && !ASK_SURFACES.includes(t.surface)) out.push(`then: no surface "${t.surface}"`);
  if (t.context !== undefined && t.context !== null)
    out.push(...contextProblems(t.context).map((p) => `then.context: ${p}`));
  const page = secondTurn(c).context;
  if (t.surface !== undefined && page && page.surface !== t.surface)
    out.push(`its second turn is asked on ${t.surface}, its page is ${page.surface}`);
  // A card approved between the turns is a settings card turn 1 says it makes; that its change is an add_note is known
  // only once the card is made, and approveBetween refuses any other.
  if (t.between !== undefined && !BETWEEN.includes(t.between))
    out.push(`nothing the eval does between turns is called "${t.between}"`);
  else if (t.between === "approve" && JSON.stringify(c.expect?.proposals_any ?? []) !== JSON.stringify(["settings"]))
    out.push(
      `between: "approve" approves a settings card whose change is add_note, and turn 1 expects ${JSON.stringify(c.expect?.proposals_any ?? [])}`,
    );
  return out;
}

/** Every case whose page, or whose second turn, cannot be built, in words: said before anything is read or spent. */
export function pageProblems(cases) {
  return cases.flatMap((c) => [
    ...(c.context
      ? [
          ...contextProblems(c.context).map((p) => `${c.id}: ${p}`),
          ...(c.surface && c.context.surface !== c.surface
            ? [`${c.id}: asked on ${c.surface}, its page is ${c.context.surface}`]
            : []),
        ]
      : []),
    ...FOLLOW_UP_CHECKS.filter((k) => c.expect?.[k] !== undefined).map(
      (k) => `${c.id}: ${k} judges a second turn: it belongs in then.expect`,
    ),
    ...secondTurnProblems(c).map((p) => `${c.id}: ${p}`),
  ]);
}

/**
 * What a run is about to spend, by surface, before it spends a turn (D17): the cases, their turns -- a case of two
 * turns is two, each on its own surface -- and how many carry their page, the turns and their cost at `perTurn`
 * dollars a turn; the warms, which reach no model, one for each turn whose page is sent again (secondTurn's `warm`);
 * and the settings notes approved between the turns and put back, the only writes a run makes but its threads.
 */
export function announcement(cases, reps, perTurn) {
  const cost = (n) => `$${(n * reps * perTurn).toFixed(2)}`;
  const turns = cases.flatMap((c) => {
    const two = secondTurn(c);
    return [
      { surface: c.surface, paged: !!c.context, warm: !!c.context },
      ...(two ? [{ surface: two.surface, paged: !!two.context, warm: two.warm }] : []),
    ];
  });
  const lines = [...new Set(turns.map((t) => t.surface))].map((s) => {
    const n = cases.filter((c) => c.surface === s).length;
    const ts = turns.filter((t) => t.surface === s);
    const paged = ts.filter((t) => t.paged).length;
    return `  ${s}: ${n} case(s), ${ts.length} turn(s)${paged ? ` (${paged} with the page)` : ""} × ${reps} = ${ts.length * reps} turns ≈ ${cost(ts.length)}`;
  });
  const warms = turns.filter((t) => t.warm).length * reps;
  const notes = cases.filter((c) => secondTurn(c)?.between === "approve").length * reps;
  lines.push(
    `${cases.length} cases, ${turns.length} turns × ${reps} = ${turns.length * reps} turns ≈ ${cost(turns.length)} at the baseline $${perTurn} a turn (spec §9)` +
      (warms ? `, and ${warms} warms (POST ask/warm, no model)` : "") +
      (notes ? `; ${notes} settings note(s) approved between the turns and put back` : ""),
  );
  return lines.join("\n") + "\n";
}

/**
 * A case's second turn for the listing, on its own lines under its case: where it is asked, what happens before it,
 * its page (the case's own, one of its own, or none), and its words. "" for a case of one turn.
 */
export function describeSecondTurn(c) {
  const two = secondTurn(c);
  if (!two) return "";
  const page = !two.context ? "no page" : c.then.context === undefined ? "the same page" : describeContext(two.context);
  return `    then · ${two.surface}${two.between ? ` · between: ${two.between}` : ""} · ${page}\n      ${two.text}`;
}

/** A context in a few words, for the listing and the log: its route, its rows and its focus. */
export function describeContext(spec) {
  if (!spec) return "";
  const rows = Array.isArray(spec.rows) ? `${spec.rows.length} literal row(s)` : (spec.rows ?? "no rows");
  const focus = spec.focus ? ` · focus ${typeof spec.focus === "string" ? spec.focus : spec.focus.kind}` : "";
  return `#/${spec.route}${spec.view ? ` (${spec.view})` : ""} · ${rows}${focus}`;
}

/* ---- what the judge asks of a case that rode with its page ---- */

/**
 * Whether a case's tools may be missing: the page answered it. A case marked `on_page` is excused when the page it
 * asked about rode with it -- its rows, when it names a GET for them and that GET drew at least one; the page itself,
 * when it draws no rows. Nothing else is: the snapshot that carried the day on every turn went in PR 2.4, so a case
 * sent with no page reads what it answers from.
 */
export function fromContext(c, m, sent) {
  const e = c.expect ?? {};
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

/* ---- what turn 1 asks of turn 2 ---- */

/** An answer's items as the Line draws them: its own, or for an answer made before the Line, answerFromV1's. */
const itemsOf = (m) => (m ? (m.answer ?? answerFromV1(m)).show.items : []);

/**
 * Why turn 2 cannot be asked, or null. `first` is turn 1 as it ended: `{ final, threadId, scope }`. Turn 2 needs an
 * answer, the thread that answer landed in, a card when it is to name or approve one, and as many items as the one it
 * opens; without them it is a failing row that asked nothing, and no refusal.
 */
export function notAsked(two, first) {
  const m = first?.final;
  if (!m) return "turn 1 has no answer";
  if (!first.threadId) return "turn 1 named no thread";
  const e = two.expect ?? {};
  if (e.names_card && !(m.proposals ?? []).length) return "turn 1 made no card to name";
  if (two.between && !(m.proposals ?? []).length) return "turn 1 made no card to approve";
  const shown = itemsOf(m).length;
  if (e.opens_item && shown < e.opens_item)
    return `turn 1's answer shows ${shown} item(s), and turn 2 opens item ${e.opens_item}`;
  return null;
}

/**
 * What an answer may never say: that it did something. Ask proposes and a person approves (spec §7), so a sentence
 * that says a message went, a setting changed or a card was approved is a claim no turn can make true: `no_write` on
 * every case reads it, and `names_card`. "I", "I have" and "I've" alike; the Spanish "he …" and "aprobé".
 */
const WRITE_CLAIMS = [
  /\bI(?: have|['’]ve)? (?:sent|changed|updated|closed|snoozed|resolved|archived|invited|paused|deleted|approved)\b/i,
  /\bhe (?:enviado|cambiado|actualizado|cerrado|aprobado)\b/i,
  /(?<![\p{L}\p{N}])aprob[eé](?![\p{L}\p{N}])/iu,
  /\bdone[,.!]/i,
];

/** Whether the words claim a write (WRITE_CLAIMS). */
export const claimsWrite = (text) => WRITE_CLAIMS.some((re) => re.test(text ?? ""));

/** Words compared as a person reads them: any case, any spacing. */
const plain = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * `names_card`: "approve that one" points, never presses (the Phase 5 plan, D6). Turn 2's words name one of turn 1's
 * cards by its title, no second card of a kind turn 1 proposed is made, and nothing claims it was done.
 */
export function namesCard(m, first) {
  const cards = first?.final?.proposals ?? [];
  if (!cards.length) return ["turn 1 made no card to name"];
  const text = m?.text ?? "";
  const fails = [];
  if (!cards.some((p) => p.title && plain(text).includes(plain(p.title))))
    fails.push(`the answer names none of turn 1's cards by its title: ${cards.map((p) => `“${p.title}”`).join(", ")}`);
  const kinds = new Set(cards.map((p) => p.kind));
  const again = [...new Set((m?.proposals ?? []).map((p) => p.kind).filter((k) => kinds.has(k)))];
  if (again.length) fails.push(`a second ${again.join("/")} card, where turn 1's is one press above`);
  if (claimsWrite(text)) fails.push(`the answer claims the card was done: “${text.slice(0, 120)}”`);
  return fails;
}

/** Where an item opens: its source's route as the answer's grounding gave it, else where its kind opens. */
const itemRoute = (it) => it.source.to || citationRoute(it.source);

/**
 * `opens_item: n`: "open the second" in an open thread opens turn 1's answer's n-th item (the Phase 5 plan, D7). Its
 * door -- navigate, or the answer's Open, read as navigate_now reads it: somewhere to go, now -- goes to that item's
 * route, not to the page's n-th row, which `sent.focus` holds when the palette read the place against the page.
 */
export function opensItem(m, first, n, sent = null) {
  const it = itemsOf(first?.final)[n - 1];
  if (!it) return [`turn 1's answer shows no item ${n} to open`];
  const want = itemRoute(it);
  const door = m?.navigate ?? m?.answer?.do?.open ?? null;
  const to = door?.to || null;
  if (to === want && door.now) return [];
  if (to === want) return [`turn 1's item ${n} (${it.title}) was offered, not opened`];
  if (!to || !door.now)
    return [`expected the app to open turn 1's item ${n} (${it.title}, ${want}); navigate=${JSON.stringify(door)}`];
  const focus = sent?.focus && to.includes(sent.focus.id) ? `, the page's focus (${sent.focus.label})` : "";
  return [`opened ${to}${focus}, where turn 1's item ${n} (${it.title}) opens at ${want}`];
}

/**
 * `drops_first_scope`: turn 2 was asked on another row than turn 1's, and names turn 1's row nowhere -- no citation,
 * item, Open or navigation carries its id (named), and the words never say the first word of its name, whole.
 */
export function dropsFirstScope(m, scope) {
  if (!scope) return ["turn 1 was asked with no scope for turn 2 to drop"];
  const fails = [];
  if (named(m).some((p) => p.includes(scope.id)))
    fails.push(`the answer still names turn 1's ${scope.kind}, ${scope.label}`);
  const word = scope.label.split(/\s+/)[0] ?? "";
  const whole = new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
  if (word.length >= 2 && !/^this$/i.test(word) && whole.test(m?.text ?? ""))
    fails.push(`the answer still says ${word}, turn 1's ${scope.kind}`);
  return fails;
}

/**
 * What turn 1 asks of turn 2, beside what turn 2's own case asks: that it was answered in turn 1's thread -- the
 * thread line its answer opened with names turn 1's -- and the checks only a second turn has, each where its expect
 * asks for it. `e` is turn 2's expect, `r` its result, `first` turn 1 as it ended.
 */
export function followUpFails(e, r, first) {
  const fails = [];
  if (r.threadId !== first.threadId)
    fails.push(`answered in a new thread: ${r.threadId ?? "none"}, where turn 1's was ${first.threadId}`);
  if (e.names_card) fails.push(...namesCard(r.final, first));
  if (e.opens_item) fails.push(...opensItem(r.final, first, e.opens_item, r.context));
  if (e.drops_first_scope) fails.push(...dropsFirstScope(r.final, first.scope));
  return fails;
}

/* ---- a card approved between the turns, and put back ---- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One of the Line's requests, made from the eval. `io` is `{ fetch, at, cookie, origin, now }`: `at(path)` names the
 * workspace as the client names it on every request. A write goes same-origin and marked as a card's (`x-via: ask`,
 * legacy-bridge/ask/api.ts viaAsk). Never throws: a request that could not be made answers status 0.
 */
async function send(io, method, path, body) {
  const headers = { cookie: io.cookie };
  if (method !== "GET") Object.assign(headers, { origin: io.origin, "x-via": "ask" });
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await io.fetch(io.at(path), {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: json?.data ?? null, error: json?.error?.message ?? null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A spec's call, sent where its route key says: the typed client's rule ("PUT settings" is PUT /api/v1/settings). */
async function sendCall(io, c) {
  const [method, key] = c.route.split(" ");
  const path = `/api/v1/${key.replace(/\[(\w+)\]/g, (_, n) => encodeURIComponent(c.params?.[n] ?? ""))}`;
  return send(io, method, path, c.body);
}

/** The settings as GET settings answers them, `{ config, version }`, or why they could not be read. */
async function readSettings(io) {
  const r = await send(io, "GET", "/api/v1/settings");
  if (!r.ok) return { why: `GET settings ${r.status}: ${r.error ?? "no answer"}` };
  if (r.data?.configBroken || !isObject(r.data?.config) || typeof r.data.version !== "number")
    return { why: "GET settings answered no config a card could change" };
  return { config: r.data.config, version: r.data.version };
}

/** Where two configs differ, field by field: the paths, [] for none. */
function configDiff(a, b, at = "") {
  if (Object.is(a, b)) return [];
  const both = !!a && !!b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
  if (!both) return [at || "the whole config"];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) =>
    configDiff(a[k], b[k], at ? `${at}.${k}` : k),
  );
}

/** Where a card's outcome is recorded on the turn that proposed it (POST ask/messages/[id]/proposals/[pid]). */
const outcomePath = (messageId, cardId) => `/api/v1/ask/messages/${messageId}/proposals/${cardId}`;

/**
 * Turn 1's card, approved between the turns as the Line approves it (ask-turn.jsx approveWith; legacy-bridge/ask/
 * commit.ts commitProposal), for `then.between: "approve"`. Only a settings card whose change is add_note: one note
 * more in the receptionist's profile, the smallest change there is to put back, which no other case reads. The
 * settings read (the tab's `__SETTINGS`), the card's own commit (proposalSpec("settings").commit) sent as the Line
 * sends it, and the outcome recorded on turn 1's message as the Line records it, with the undo's record.
 *
 * `{ ok, why?, approval }`. An approval, beside a refusal too, is a change to put back (putBack) whatever happens
 * next: a save that failed is read again, and the change it may have written is put back with the rest.
 */
export async function approveBetween(io, message) {
  const cards = message?.proposals ?? [];
  const notes = cards.filter((p) => p.kind === "settings");
  const card = notes[0];
  if (notes.length !== 1 || card.payload?.change?.op !== "add_note") {
    const said = cards.map((p) => (p.kind === "settings" ? `settings ${p.payload?.change?.op}` : p.kind));
    return {
      ok: false,
      why: `only one settings card whose change is add_note is approved between the turns, and turn 1's cards are ${said.length ? JSON.stringify(said) : "none"}`,
      approval: null,
    };
  }
  if (!UUID.test(message.id ?? ""))
    return { ok: false, why: "turn 1 was not saved, so its card's outcome has nowhere to be recorded", approval: null };
  const spec = proposalSpec("settings");
  const before = await readSettings(io);
  if (before.why) return { ok: false, why: before.why, approval: null };
  const tab = { settings: before };
  const commit = spec.commit(card, tab);
  if ("refused" in commit) return { ok: false, why: commit.refused, approval: null };
  const saved = await sendCall(io, commit);
  if (!saved.ok) {
    const now = await readSettings(io);
    const moved = !!now.why || configDiff(before.config, now.config).length > 0;
    const record = { config: before.config, version_after: now.version ?? null };
    return {
      ok: false,
      why: `${commit.route} ${saved.status}: ${saved.error ?? "no answer"}`,
      approval: moved ? { messageId: message.id, card, before, record, recorded: false } : null,
    };
  }
  const record = spec.undo.record(card, saved.data, tab);
  const approval = { messageId: message.id, card, before, record, recorded: false };
  const told = await send(io, "POST", outcomePath(message.id, card.id), {
    state: "done",
    receipt: spec.receipt(card, saved.data),
    atMs: io.now(),
    undo: record,
  });
  if (!told.ok)
    return {
      ok: false,
      why: `the card's outcome was not recorded (${told.status}: ${told.error ?? "no answer"})`,
      approval,
    };
  approval.recorded = true;
  return { ok: true, approval };
}

/**
 * An approval put back once turn 2 has answered, as the Line undoes a card (commit.ts undoProposal): the settings read
 * again, the card's own undo (spec.undo.call, which refuses once anyone has saved since the card), the outcome
 * recorded as undone, and the settings read once more and compared, field by field, with the ones before the card
 * (the rule e2e/settings-business.spec.ts keeps). `{ ok: true, undone, recorded }`, or `{ ok: false, why, byHand }`:
 * the note to take out and the whole config before it, which the runner prints before it stops.
 */
export async function putBack(io, approval) {
  const spec = proposalSpec("settings");
  const { title, text } = approval.card.payload.change;
  const lost = (why) => ({ ok: false, why, byHand: { note: { title, text }, config: approval.before.config } });
  const now = await readSettings(io);
  if (now.why) return lost(now.why);
  // A save that failed may have written nothing after all: the settings are as they were, and nothing is sent.
  if (!configDiff(approval.before.config, now.config).length) return { ok: true, undone: false, recorded: null };
  const undo = spec.undo.call(approval.record, { settings: now });
  if ("refused" in undo) return lost(undo.refused);
  const saved = await sendCall(io, undo);
  if (!saved.ok) return lost(`${undo.route} ${saved.status}: ${saved.error ?? "no answer"}`);
  const told = approval.recorded
    ? await send(io, "POST", outcomePath(approval.messageId, approval.card.id), {
        state: "undone",
        receipt: spec.undo.receipt(saved.data),
        atMs: io.now(),
        undo: null,
      })
    : null;
  const after = await readSettings(io);
  if (after.why) return lost(after.why);
  const differ = configDiff(approval.before.config, after.config);
  if (differ.length) return lost(`the settings differ from the ones before at ${differ.join(", ")}`);
  return { ok: true, undone: true, recorded: told ? told.ok : null };
}

/* ---- what a run cost, turn by turn ---- */

/**
 * Ask's usage rows for a workspace since `since`, oldest first: one per model round, as the edge recorded it, every
 * page of them. PostgREST answers a thousand rows at most whatever the limit says, so a run or a day past a thousand
 * rounds was read short; this pages as the edge's budget read pages (packages/db readAllRows), on a whole order, the
 * id breaking a tie. `rest(path)` answers a PostgREST path's rows, read with the service role.
 */
export async function usageRows(rest, tenantId, since) {
  const path =
    `events?tenant_id=eq.${tenantId}&kind=eq.usage.ask_tokens&created_at=gte.${encodeURIComponent(since)}` +
    `&select=data&order=created_at.asc,id.asc`;
  const rows = await readAllRows("Ask's usage rows", async (from, to) => ({
    data: await rest(`${path}&offset=${from}&limit=${to - from + 1}`),
    error: null,
  }));
  return rows.map((r) => r.data ?? {}).filter((d) => !d.purpose || d.purpose === "ask");
}

/**
 * What a turn's stored shape (AskTurnShape, ask_messages.content.shape) says of its cost and its memory: its tokens by
 * kind, its cache hit, whether it followed another turn and how long after, and how its history was sent, once PR 5.4
 * records that (`replay`).
 */
const SHAPE_FIELDS = ["tokens", "cache_hit", "follow_up", "since_last_ms", "replay"];
/** Message ids named in one read: a much longer `in.(…)` list is a URI PostgREST refuses (about two hundred ids). */
const IDS_PER_READ = 50;

/**
 * Each answered turn's stored shape, read by its message id with the service role, as ask-day.mjs reads the day's,
 * selecting only `content->shape`: PR 5.3 stores the raw turn beside it on the same row, and that is large. A Map of
 * message id to SHAPE_FIELDS; a row with no shape has none, and an id that is no saved row's (`unsaved-…`) is never
 * asked for.
 */
export async function turnShapes(rest, ids) {
  const saved = [...new Set(ids.filter((id) => UUID.test(id ?? "")))];
  const out = new Map();
  for (let i = 0; i < saved.length; i += IDS_PER_READ) {
    const some = saved.slice(i, i + IDS_PER_READ).join(",");
    for (const r of await rest(`ask_messages?id=in.(${some})&select=id,shape:content->shape`))
      if (isObject(r.shape))
        out.set(
          r.id,
          Object.fromEntries(SHAPE_FIELDS.filter((k) => r.shape[k] !== undefined).map((k) => [k, r.shape[k]])),
        );
  }
  return out;
}

/* ---- a turn's stream ---- */

/**
 * A turn's JSON lines, read across chunk boundaries as the bridge reads them (legacy-bridge/ask/api.ts): a line that
 * does not parse -- the torn end of a stream that broke -- is skipped, never the whole turn's failure. `push` each
 * decoded chunk, then `end`.
 */
export function jsonLines(on) {
  let carry = "";
  const take = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    on(event);
  };
  return {
    push(text) {
      carry += text;
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const l of lines) take(l);
    },
    end() {
      take(carry);
      carry = "";
    },
  };
}
