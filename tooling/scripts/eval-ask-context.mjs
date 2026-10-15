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
 *
 * A setup's keys live here too (the moment spec, A8: setupCardsFails, toolsOrderNote), pure over a turn's final message,
 * since eval-ask.mjs runs on import and its judge can only be proved through what it calls.
 */
import {
  ASK_ANSWER_CAPS,
  ASK_CONTEXT_MAX_ROWS,
  ASK_SURFACES,
  PageContextSchema,
  TenantConfigWriteSchema,
  answerFromV1,
  citationRoute,
  claimsWrite,
  itemFocus,
  parseTenantConfig,
  personName,
  proposalSpec,
  scopeFromRoute,
  unquoted,
} from "@chanlytics/contracts";
import { readAllRows } from "@chanlytics/db";
import { toolNow } from "../evals/rename-ask-tools.mjs";

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
 * scope the route opens (null on a list). `answers` holds each GET's `data`, by key; `now` is the tab's clock; `first`
 * is turn 1's answer when this is its thread's second turn, whose items a place names first, as the palette reads the
 * words in an open thread (contracts itemFocus, the Phase 5 plan, D7): an item no focus may be names none, and the
 * page's rows count only past the answer's items.
 */
export function resolveContext(spec, answers = {}, now = Date.now(), first = null) {
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
  // A route opens its row as the kind the page drew it (`cv-` a call, a bare id on Conversations a conversation): one
  // that would open a row as another kind is a page no palette sends, and a case over it asks about nothing.
  if (opened && scope && scope.kind !== opened.kind)
    throw new Error(`the route ${route} opens a ${scope.kind}, and the row there is a ${opened.kind}`);
  const n = ordinal(spec.focus);
  // Undefined past turn 1's items (or with no turn 1), null for an item no focus may be, else that item as a focus.
  // Paired with the palette (legacy-bridge/ask/context.ts pageContext): there a refused kind's null falls to the page's
  // own focus, then the route's (`got.focus ?? scopeFromRoute`), never to the page's row at that place; a case's page
  // has no focus of its own, so here it falls to the route's, `item ?? scope`. Change one, change the other.
  const item = n !== null && first ? itemFocus(first, n) : undefined;
  const placed = n !== null && item === undefined ? rows.filter((r) => SCOPE_KINDS.has(r.kind))[n - 1] : null;
  const focus = isScope(spec.focus)
    ? { kind: spec.focus.kind, id: spec.focus.id, label: spec.focus.label }
    : item !== undefined
      ? (item ?? scope)
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
const BETWEEN = ["approve", "snooze"];
/** The checks that judge a second turn against its first (followUpFails): a first turn has none before it. */
const FOLLOW_UP_CHECKS = ["names_card", "opens_item", "drops_first_scope", "omits_snoozed"];

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A page as a warm reads it: everything but its focus, which the palette takes from the words as the question goes
 * and never warms for -- it warms as the Line opens and as its route changes (ask-real.jsx).
 */
const warmedAs = (spec) =>
  spec
    ? JSON.stringify(
        Object.entries(spec)
          .filter(([k]) => k !== "focus")
          .sort(([a], [b]) => (a < b ? -1 : 1)),
      )
    : null;

/**
 * A case's second turn, as the runner asks it, or null for a case of one turn: its words and what they must do; its
 * page -- the case's own, unless `then.context` names one of its own (an object) or none (null); its surface --
 * `then.surface`, else its page's, else the case's; whether its page is warmed again, which it is only when it is a
 * page of its own that differs from turn 1's other than in its focus (warmedAs); and what happens between the turns
 * (`between`, approveThenAsk). Judged under the case's id and its must-never, so pass^k holds a case to both of its
 * turns.
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
    warm: !!context && own && warmedAs(context) !== warmedAs(c.context ?? null),
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

/** What is wrong with a case's second turn, in words; [] for a case of one turn, or one the runner can ask. */
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
  // A snooze moves a thread an open escalation flags, which a wake puts back to waiting on you (snoozeBetween), and turn
  // 2 is judged on reading again and its headline not naming it: a case that snoozes needs such a thread and asks for both.
  if (t.between === "snooze") {
    if (![c.needs ?? []].flat().includes("escalated_thread"))
      out.push(`between: "snooze" snoozes a thread an open escalation flags: the case needs "escalated_thread"`);
    if (t.expect?.omits_snoozed !== true) out.push(`between: "snooze" is judged by then.expect.omits_snoozed`);
    // omitsSnoozed holds the headline; the fresh read that is X5-4's cure is held by tools_any.
    if (!(t.expect?.tools_any ?? []).length)
      out.push(`between: "snooze" reads again: then.expect.tools_any names the reads`);
  }
  return out;
}

/**
 * What a case may need its workspace to hold beyond the page a context carries (`needs`): a calendar or none, someone's
 * yes to offers or nobody's, a call in progress, deals on, the Win-back's seed, and a channel an offer can go by or none.
 * A run names what its workspace holds (EVAL_WORKSPACE_HAS, comma-separated), and a case needing anything else is
 * skipped: said, never run or failed.
 *
 * `no_offers_yes` is nobody's yes to offers, as on the nightly's workspace. A decline that rests on it needs it
 * (campaigns_decline: "send a promotional offer to everyone right now" makes no card and says nobody has said yes),
 * since where people said yes, as where the offer cases run (`offers_yes`), a send to everyone is rightly a broadcast
 * card or a question about the offer, and the decline would fail there by construction.
 *
 * `offers_channel` is a channel that carries an offer now, by the rule an offer's plan reads (act/plan.ts planWorld:
 * contracts channelChoices with the marketing purpose, for the business's own news): email set up for offers, or
 * WhatsApp on a number that sends and is outside +1, since Meta pauses offers to US numbers. `offers_whatsapp` is
 * WhatsApp among them: what a send of a message with a WhatsApp version alone needs, as the Win-back's seed is; a
 * workspace that holds it holds offers_channel too, and names both. `no_offers_channel` is none, as on the nightly's
 * workspace (e2e-workspace.mjs: a +1 WhatsApp number and no mailbox), where an offer's plan is refused in
 * PLAN_WORDS.noChannel's words and makes no card.
 *
 * `escalated_thread` is a thread an open escalation flags and nobody has, among the first turn 1 names: what a snooze
 * between two turns moves out of who needs you, and a wake puts back (snoozeBetween; the wiring's second audit, X5-4).
 * The nightly's workspace keeps none (e2e-workspace.mjs resolves its handovers), so a case that needs one is run by hand.
 */
export const WORKSPACE_NEEDS = [
  "calendar",
  "no_calendar",
  "offers_yes",
  "no_offers_yes",
  "offers_channel",
  "offers_whatsapp",
  "no_offers_channel",
  "live_call",
  "deals_on",
  "winback_seed",
  "escalated_thread",
];

/** The line a case is skipped with, `skip <id> (needs <tokens>)`, or null for a case this workspace (`has`) runs. */
export function skipFor(c, has) {
  const unmet = [c.needs ?? []].flat().filter((n) => !has.includes(n));
  return unmet.length ? `skip ${c.id} (needs ${unmet.join(", ")})` : null;
}

/** Every case whose page, or whose second turn, cannot be built, in words: said before anything is read or spent. */
export function pageProblems(cases) {
  return cases.flatMap((c) => [
    ...[c.needs ?? []]
      .flat()
      .filter((n) => !WORKSPACE_NEEDS.includes(n))
      .map((n) => `${c.id}: needs "${n}", which no workspace token names`),
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
  const snoozes = cases.filter((c) => secondTurn(c)?.between === "snooze").length * reps;
  lines.push(
    `${cases.length} cases, ${turns.length} turns × ${reps} = ${turns.length * reps} turns ≈ ${cost(turns.length)} at the baseline $${perTurn} a turn (spec §9)` +
      (warms ? `, and ${warms} warms (POST ask/warm, no model)` : "") +
      (notes ? `; ${notes} settings note(s) approved between the turns and put back` : "") +
      (snoozes ? `; ${snoozes} thread(s) snoozed between the turns and woken` : ""),
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
 * answer that did not fail, the thread that answer landed in, a card when it is to name or approve one, and as many
 * items as the one it opens; without them it is a failing row that asked nothing, and no refusal.
 */
export function notAsked(two, first) {
  const m = first?.final;
  if (!m) return "turn 1 has no answer";
  if (m.failed) return "turn 1 failed";
  if (!first.threadId) return "turn 1 named no thread";
  const e = two.expect ?? {};
  if (e.names_card && !(m.proposals ?? []).length) return "turn 1 made no card to name";
  // Only an approval needs a card: a snooze takes turn 1's thread, and says so itself where it names none (snoozeBetween).
  if (two.between === "approve" && !(m.proposals ?? []).length) return "turn 1 made no card to approve";
  const shown = itemsOf(m).length;
  if (e.opens_item && shown < e.opens_item)
    return `turn 1's answer shows ${shown} item(s), and turn 2 opens item ${e.opens_item}`;
  return null;
}

/**
 * Whether an answer's own words claim a write, and those words without what they quote: contracts' one predicate, which
 * the turn's loop reads too (answer-text.ts), handed on to eval-ask.mjs and the tests from here as before.
 */
export { claimsWrite, unquoted };

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

/** What a card's payload holds at a path, dotted (`versions.sms`): null and nothing there both hold nothing. */
function heldAt(payload, at) {
  const held = at.split(".").reduce((v, k) => (v && typeof v === "object" ? v[k] : undefined), payload);
  return held === undefined || held === null ? null : held;
}

/**
 * A setup's cards (the moment spec, A8): `proposals_max` fails more cards than N (four is near where presses go reflex);
 * `proposals_not` fails a card of any kind it names (an offer no channel carries makes no send and no campaign);
 * `card_fields_not` fails a card of the kind whose field holds a value the words ruled out (a reminder of an appointment
 * in a setup); `card_fields_absent` fails a card of the kind that holds anything at a path into its payload, dotted
 * (`versions.sms`: a message written with a text version, which an offer never has), and `card_fields_present` one that
 * holds nothing there (`until`: a change asked to end on a day that names none), null holding nothing either way;
 * `next_any` fails unless one of the answer's next questions holds one of the words (a campaign on a list made in the
 * same answer waits for a next question, A2). `e` is a case's expect, `m` the turn's final message. It judges every
 * case's cards, not a setup's alone: an offer's, a written message's, a change's and a text refused are held by the same
 * keys. That a card of a kind was made at all is proposals_any's.
 */
export function setupCardsFails(e, m) {
  const fails = [];
  const cards = m?.proposals ?? [];
  if (typeof e.proposals_max === "number" && cards.length > e.proposals_max)
    fails.push(`${cards.length} cards, where at most ${e.proposals_max} were expected`);
  const barred = [...new Set(cards.map((p) => p.kind))].filter((k) => (e.proposals_not ?? []).includes(k));
  if (barred.length) fails.push(`a ${barred.join("/")} card, which the words ruled out`);
  for (const [kind, fields] of Object.entries(e.card_fields_not ?? {}))
    for (const p of cards.filter((x) => x.kind === kind))
      for (const [k, banned] of Object.entries(fields))
        if (banned.includes(p.payload?.[k]))
          fails.push(`a ${kind} card with ${k} ${JSON.stringify(p.payload?.[k])}, which the words ruled out`);
  for (const [kind, paths] of Object.entries(e.card_fields_absent ?? {}))
    for (const p of cards.filter((x) => x.kind === kind))
      for (const at of paths)
        if (heldAt(p.payload, at) !== null) fails.push(`a ${kind} card holding ${at}, which the words ruled out`);
  for (const [kind, paths] of Object.entries(e.card_fields_present ?? {}))
    for (const p of cards.filter((x) => x.kind === kind))
      for (const at of paths)
        if (heldAt(p.payload, at) === null)
          fails.push(`a ${kind} card holding nothing at ${at}, which the words named`);
  if (Array.isArray(e.next_any)) {
    const next = (m?.answer?.do?.next ?? m?.followups ?? []).map((q) => String(q).toLowerCase());
    if (!e.next_any.some((w) => next.some((q) => q.includes(w.toLowerCase()))))
      fails.push(`no next question holds any of ${e.next_any.join("/")}: ${JSON.stringify(next)}`);
  }
  return fails;
}

/**
 * `tools_order`, a note and never a fail: the names expected, read through the rename table, are not a subsequence of the
 * tools the turn ran. What a reviewer would mark; the cards are the grade (Anthropic, "Demystifying evals for AI agents":
 * grade what the agent produced, not the path it took).
 */
export function toolsOrderNote(e, m) {
  if (!Array.isArray(e.tools_order)) return [];
  const tools = (m?.tools ?? []).map(toolNow);
  let at = 0;
  for (const t of tools) if (at < e.tools_order.length && toolNow(e.tools_order[at]) === t) at++;
  return at === e.tools_order.length
    ? []
    : [`tools ${JSON.stringify(tools)} not in the order ${e.tools_order.join(" → ")}`];
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

/** A word said whole in an answer's text, whatever its case: "Dana", never inside "Danae". */
function saysWord(text, word) {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(
    text ?? "",
  );
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
  if (word.length >= 2 && !/^this$/i.test(word) && saysWord(m?.text, word))
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
  if (e.omits_snoozed) fails.push(...omitsSnoozed(r.final, first.snoozed ?? null));
  return fails;
}

/**
 * Turn 2 after a thread was snoozed between the turns (`between: "snooze"`; the wiring's second audit, X5-4): a warm
 * turn replays turn 1's reads, and a model that answers from them gives the old list as fact. The case's tools_any
 * holds turn 2 to reading again (today or inbox.list); this holds its headline, the answer to who needs you, to not
 * saying who the snoozed thread is with. The rest of the answer may name it: the first runs (15 Oct) said "Robin Example
 * is no longer on the needs-you list", once as a row whose line was "No longer needs you, but a reply to their question
 * about booking a trim failed to deliver earlier", since Today's recap keeps a reply that failed to deliver whoever
 * holds the thread (e2e thread.spec.ts). That is the snooze heard, and the failure still true, not the replay.
 */
export function omitsSnoozed(m, snoozed) {
  if (!snoozed) return ["nothing was snoozed between the turns to look for"];
  const fails = [];
  const word = (snoozed.who ?? "").split(/\s+/)[0] ?? "";
  const headline = m?.answer?.say?.headline ?? m?.text ?? "";
  if (word.length >= 2 && saysWord(headline, word))
    fails.push(`the answer's headline still says ${word}, whose thread was snoozed between the turns`);
  return fails;
}

/* ---- a card approved between the turns, and put back ---- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long one of the Line's requests is waited for before it is no answer: as long as the client waits to write. */
const DOOR_MS = 30_000;

/**
 * One of the Line's requests, made from the eval. `io` is `{ fetch, at, cookie, origin, now, timeoutMs? }`: `at(path)`
 * names the workspace as the client names it on every request. A write goes same-origin and marked as a card's
 * (`x-via: ask`, legacy-bridge/ask/api.ts viaAsk). Never throws: a request that could not be made, that was not
 * answered in DOOR_MS, or whose answer could not be read answers status 0, so a door that hangs never holds a note out.
 */
async function send(io, method, path, body) {
  const headers = { cookie: io.cookie };
  if (method !== "GET") Object.assign(headers, { origin: io.origin, "x-via": "ask" });
  if (body !== undefined) headers["content-type"] = "application/json";
  try {
    const res = await io.fetch(io.at(path), {
      method,
      headers,
      signal: AbortSignal.timeout(io.timeoutMs ?? DOOR_MS),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => undefined);
    if (json === undefined && res.ok)
      return { ok: false, status: 0, data: null, error: "its answer could not be read" };
    return { ok: res.ok, status: res.status, data: json?.data ?? null, error: json?.error?.message ?? null };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A spec's call, sent where its route key says: "PUT settings" is PUT /api/v1/settings, the eval's one call. */
function sendCall(io, c) {
  const [method, key] = c.route.split(" ");
  return send(io, method, `/api/v1/${key}`, c.body);
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

/**
 * A config as the settings door stores it and GET settings answers it: what the write schema keeps (a note is its
 * title and its words, NoteSchema), read back by the read schema. The settings a save of the eval's would leave, so its
 * own write is told from anyone else's.
 */
function asStored(config) {
  const w = TenantConfigWriteSchema.safeParse(config);
  return w.success ? (parseTenantConfig(w.data) ?? w.data) : config;
}

/** Where a card's outcome is recorded on the turn that proposed it (POST ask/messages/[id]/proposals/[pid]). */
const outcomePath = (messageId, cardId) => `/api/v1/ask/messages/${messageId}/proposals/${cardId}`;

/**
 * A note the eval cannot know it has put back, and what to do by hand: why; the note; the settings before it; where
 * the settings read last differ from those (null when they could not be read); and whether the whole config may go
 * back, which it may only when the note is all that differs -- anything more is someone's save since the card, and a
 * whole-config PUT would undo it. `note` is `{ card, before, ours }`: the card, the settings before it, and the
 * settings with the note in them as the door stores them.
 */
function lost(note, now, why) {
  const { title, text } = note.card.payload.change;
  const read = !!now && !now.why;
  return {
    ok: false,
    why,
    byHand: {
      note: { title, text },
      config: note.before.config,
      diff: read ? configDiff(note.before.config, now.config) : null,
      whole: read && configDiff(note.ours, now.config).length === 0,
    },
  };
}

/**
 * Turn 1's card, approved between the turns as the Line approves it (ask-turn.jsx approveWith; legacy-bridge/ask/
 * commit.ts commitProposal), for `then.between: "approve"`. Only a settings card whose change is add_note: one note
 * more in the receptionist's profile, the smallest change there is to put back, which no other case reads. The
 * settings read (the tab's `__SETTINGS`), the card's own commit (proposalSpec("settings").commit) sent as the Line
 * sends it, and the outcome recorded on turn 1's message as the Line records it, with the undo's record.
 *
 * `{ ok, why?, approval, lost? }`. `approval` is a note the eval wrote, to put back (putBack) whatever happens next,
 * beside a failure too. A save refused (a 4xx) wrote nothing: a 409 is a teammate's save between the read and this
 * one (putTenantConfig matches on the version), and theirs stands. A save the server failed, or answered not at all,
 * is read again: settings as they were, nothing was written; settings with the note and nothing else, the note is the
 * eval's, to put back; anything else -- settings that cannot be read, or someone's save beside the note -- is `lost`
 * (above), and the run stops with nothing more written.
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
  const ours = asStored(commit.body.config);
  const saved = await sendCall(io, commit);
  if (!saved.ok) {
    const why = `${commit.route} ${saved.status}: ${saved.error ?? "no answer"}`;
    if (saved.status >= 400 && saved.status < 500) return { ok: false, why, approval: null };
    const now = await readSettings(io);
    if (!now.why && !configDiff(before.config, now.config).length) return { ok: false, why, approval: null };
    if (!now.why && !configDiff(ours, now.config).length) {
      const record = { config: before.config, version_after: now.version };
      return { ok: false, why, approval: { messageId: message.id, card, before, ours, record, recorded: false } };
    }
    const unknown = now.why ?? "the settings read again are neither the ones before nor the note's";
    return { ok: false, why, approval: null, lost: lost({ card, before, ours }, now, `${why}, and ${unknown}`) };
  }
  const record = spec.undo.record(card, saved.data, tab);
  const approval = { messageId: message.id, card, before, ours, record, recorded: false };
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
 * again; the card's own undo (spec.undo.call, which refuses once anyone has saved since the card); the settings read
 * once more and compared, field by field, with the ones before the card (the rule e2e/settings/settings-business.spec.ts keeps),
 * so an undo whose answer was lost is verified all the same when they read as they were; and only then the outcome
 * recorded as undone. `{ ok: true, undone, recorded }`, or `lost` (above): what to put back by hand.
 */
export async function putBack(io, approval) {
  const spec = proposalSpec("settings");
  const now = await readSettings(io);
  if (now.why) return lost(approval, now, now.why);
  // A save that failed may have written nothing after all: the settings are as they were, and nothing is sent.
  if (!configDiff(approval.before.config, now.config).length) return { ok: true, undone: false, recorded: null };
  const undo = spec.undo.call(approval.record, { settings: now });
  if ("refused" in undo) return lost(approval, now, undo.refused);
  const saved = await sendCall(io, undo);
  const failed = saved.ok ? null : `${undo.route} ${saved.status}: ${saved.error ?? "no answer"}`;
  const after = await readSettings(io);
  if (after.why) return lost(approval, after, failed ? `${failed}, and ${after.why}` : after.why);
  const differ = configDiff(approval.before.config, after.config);
  if (differ.length)
    return lost(approval, after, failed ?? `the settings differ from the ones before at ${differ.join(", ")}`);
  const told = approval.recorded
    ? await send(io, "POST", outcomePath(approval.messageId, approval.card.id), {
        state: "undone",
        receipt: spec.undo.receipt(saved.data),
        atMs: io.now(),
        undo: null,
      })
    : null;
  return { ok: true, undone: true, recorded: told ? told.ok : null };
}

/**
 * A second turn asked after turn 1's card is approved (`then.between: "approve"`), in the order a person goes: the
 * card approved as the Line approves it (approveBetween), turn 2 asked (`askSecond(approval)`), and the note put back
 * (putBack) in a finally, whatever turn 2 did -- answered, failed or threw. `interrupted()` says the run was asked to
 * stop: before the approval, nothing is written; before turn 2, it is not asked; during it, the note goes as it ends.
 *
 * `{ why, approval, second, back, error, stop }`: why turn 2 was not asked (null when it was); what askSecond answered;
 * the put back's answer, or, when the approval could not tell its own write from another's, the by-hand record with
 * nothing put back; what turn 2 threw; and whether the run stops here -- a note not put back, or an interrupt.
 */
export async function approveThenAsk(io, message, askSecond, interrupted = () => false) {
  const out = { why: null, approval: null, second: null, back: null, error: null, stop: false };
  if (interrupted()) return { ...out, why: "the run was stopped before it", stop: true };
  try {
    const a = await approveBetween(io, message);
    out.approval = a.approval;
    out.back = a.lost ?? null;
    if (!a.ok) out.why = `turn 1's card could not be approved: ${a.why}`;
    else if (interrupted()) out.why = "the run was stopped before it";
    else out.second = await askSecond(a.approval);
  } catch (e) {
    out.error = e;
  } finally {
    if (out.approval) out.back = await putBack(io, out.approval);
  }
  out.stop = (!!out.back && !out.back.ok) || interrupted();
  return out;
}

/* ---- a thread snoozed between the turns, and woken ---- */

/** How long a thread is snoozed between the turns: far past the second turn, woken by the eval as soon as it answers. */
const SNOOZE_MS = 2 * 60 * 60 * 1000;

/** The first thread turn 1 named, from the rows its answer shows, then its citations: `{ id, who }`, or null. */
export function firstThreadNamed(m) {
  const shown = (m?.answer?.show?.items ?? []).map((i) => i.source).filter((s) => s?.kind === "thread");
  const cited = (m?.citations ?? []).filter((x) => x.kind === "thread");
  const t = [...shown, ...cited][0];
  return t ? { id: t.id, who: t.label } : null;
}

/** A thread as GET conversations/:id answers it: its state, or why it could not be read. */
async function readThread(io, id) {
  const r = await send(io, "GET", `/api/v1/conversations/${id}`);
  const state = r.data?.conversation?.state;
  return r.ok && typeof state === "string"
    ? { state }
    : { why: `GET conversations/${id} ${r.status}: ${r.error ?? "no state"}` };
}

/**
 * The first thread turn 1 named, snoozed between the turns as the Inbox snoozes it (POST conversations/:id/snooze), for
 * `then.between: "snooze"`: a warm turn 2 then asks again, and is judged on not naming it (omitsSnoozed). Only a thread
 * that is open or waits on a person; the case's workspace holds one an open escalation flags (`escalated_thread`),
 * which a wake puts back to waiting on you. `{ ok, why?, snooze }`: `snooze` is `{ id, who, was }`, to wake
 * (wakeBack) whatever happens next -- beside a failure too, where the snooze may have been written all the same.
 */
export async function snoozeBetween(io, message) {
  const thread = firstThreadNamed(message);
  if (!thread) return { ok: false, why: "turn 1 named no thread to snooze", snooze: null };
  const before = await readThread(io, thread.id);
  if (before.why) return { ok: false, why: before.why, snooze: null };
  if (before.state !== "needs_human" && before.state !== "open")
    return {
      ok: false,
      why: `the thread turn 1 named first is ${before.state}, which a snooze does not move`,
      snooze: null,
    };
  const snooze = { ...thread, was: before.state };
  const until = new Date(io.now() + SNOOZE_MS).toISOString();
  const r = await send(io, "POST", `/api/v1/conversations/${thread.id}/snooze`, { until });
  if (r.ok) return { ok: true, snooze };
  const why = `POST conversations/${thread.id}/snooze ${r.status}: ${r.error ?? "no answer"}`;
  // A refusal wrote nothing; a failure, or no answer, may have: it is woken all the same if it reads snoozed.
  return { ok: false, why, snooze: r.status >= 400 && r.status < 500 ? null : snooze };
}

/**
 * A snoozed thread woken once turn 2 has answered (POST conversations/:id/wake), and read again: `{ ok: true, woken }`
 * when it no longer reads snoozed (woken false: it never was), or `{ ok: false, why, byHand }`: the thread to wake from
 * the Inbox's Snoozed by hand.
 */
export async function wakeBack(io, snooze) {
  const now = await readThread(io, snooze.id);
  if (now.why) return { ok: false, why: now.why, byHand: snooze };
  if (now.state !== "snoozed") return { ok: true, woken: false };
  const r = await send(io, "POST", `/api/v1/conversations/${snooze.id}/wake`);
  const after = await readThread(io, snooze.id);
  if (!after.why && after.state !== "snoozed") return { ok: true, woken: true };
  const why = r.ok ? (after.why ?? "it still reads snoozed") : `POST wake ${r.status}: ${r.error ?? "no answer"}`;
  return { ok: false, why, byHand: snooze };
}

/**
 * A second turn asked after turn 1's first thread is snoozed (`then.between: "snooze"`), as approveThenAsk asks after a
 * card: the thread snoozed (snoozeBetween), turn 2 asked (`askSecond(snooze)`), and the thread woken (wakeBack) in a
 * finally, whatever turn 2 did. `{ why, snooze, second, back, error, stop }`, as approveThenAsk's: the run stops at a
 * thread it could not wake, or an interrupt.
 */
export async function snoozeThenAsk(io, message, askSecond, interrupted = () => false) {
  const out = { why: null, snooze: null, second: null, back: null, error: null, stop: false };
  if (interrupted()) return { ...out, why: "the run was stopped before it", stop: true };
  try {
    const s = await snoozeBetween(io, message);
    out.snooze = s.snooze;
    if (!s.ok) out.why = `turn 1's thread could not be snoozed: ${s.why}`;
    else if (interrupted()) out.why = "the run was stopped before it";
    else out.second = await askSecond(s.snooze);
  } catch (e) {
    out.error = e;
  } finally {
    if (out.snooze) out.back = await wakeBack(io, out.snooze);
  }
  out.stop = (!!out.back && !out.back.ok) || interrupted();
  return out;
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
const SHAPE_FIELDS = ["tokens", "cache_hit", "follow_up", "since_last_ms", "replay", "answer_tool", "answer_in"];
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
