/**
 * The judge of one Ask case: what the turn answered (`r.final`, the message the stream ended on, with the page it was
 * asked on and the events it streamed), against what the case expects (`c.expect`). Pure, so a test can run it on a
 * turn it makes up; eval-ask.mjs asks it of every turn it runs against a deployed dashboard, and says its fails and
 * notes under the turn's row.
 *
 * Split out of eval-ask.mjs on 26 Nov 2026 (lane 4, area c): the script dials the deployment as it loads, so its judge
 * could only be read, never run.
 */
import { BUILTIN_LISTS, cardOpenRoute, oneDoor } from "@chanlytics/contracts";
import { screenWordsJudged } from "./eval-ask-words.mjs";
import { usedAny } from "../evals/rename-ask-tools.mjs";
import {
  claimsWrite,
  contextFails,
  followUpFails,
  fromContext,
  previewJudged,
  setupCardsFails,
  shapeAskedFails,
  toolsOrderNote,
  unquoted,
} from "./eval-ask-context.mjs";

/** The verdict on one turn: `pass` when nothing failed; `notes` a reviewer would mark and the gate does not fail. */
export function judge(c, r) {
  const fails = [];
  // What a reviewer would mark but the gate does not fail: said once, counted in the summary.
  const notes = [];
  const m = r.final;
  if (!m) return { pass: false, fails: ["no final message"], notes };
  const e = c.expect ?? {};
  const text = m.text ?? "";
  if (m.failed) fails.push(`turn failed: ${text.slice(0, 120)}`);
  // The tools by their names today (D13, tooling/evals/tool-names.json): a case, or a turn stored before the rename,
  // that says an old name is judged as its new one, so a baseline from before stays comparable.
  // Context first: an on-page case's page rode with it, so a case the page answers is satisfied by an answer that
  // needed no read at all.
  if (e.tools_any && !fromContext(c, m, r.context) && !usedAny(e.tools_any, m.tools))
    fails.push(`tools ${JSON.stringify(m.tools)} include none of ${e.tools_any.join("/")}`);
  fails.push(...contextFails(c, m, r.context));
  // A second turn is judged against its first too: the thread it was asked in, and the checks only it has.
  if (r.first) fails.push(...followUpFails(e, r, r.first));
  if (m.failed && /daily budget|presupuesto diario/.test(text))
    fails.push("BUDGET: the workspace's Ask cap is spent; this result says nothing about the model");
  if (e.tools_also_any && !usedAny(e.tools_also_any, m.tools))
    fails.push(`tools ${JSON.stringify(m.tools)} include none of ${e.tools_also_any.join("/")}`);
  if (e.language && m.language !== e.language) fails.push(`language ${m.language} ≠ ${e.language}`);
  if (e.no_write && claimsWrite(text, { besideCards: (m.proposals ?? []).length > 0 }))
    fails.push(`the answer claims a write: “${text.slice(0, 120)}”`);
  if (e.includes_any && !e.includes_any.some((s) => text.toLowerCase().includes(s.toLowerCase())))
    fails.push(`answer lacks all of ${e.includes_any.join("/")}`);
  // Each of them, in any order: what a setup must say first (the calendar to connect, proposals to turn on).
  for (const s of e.includes_all ?? [])
    if (!text.toLowerCase().includes(s.toLowerCase())) fails.push(`answer lacks “${s}”`);
  for (const s of e.excludes ?? [])
    if (text.toLowerCase().includes(s.toLowerCase())) fails.push(`answer contains “${s}”`);
  // Every answer, against the words that never reach a screen (docs/words.md): another name for AI fails the turn, and
  // a word its tools still teach it is noted. A turn that failed says an error's words, not an answer's.
  const worded = m.failed ? { fails: [], notes: [] } : screenWordsJudged(text, e.keeps_words);
  fails.push(...worded.fails);
  notes.push(...worded.notes);
  // A row's id is a uuid a read returned, but a People list's, which is its name (contracts BUILTIN_LISTS: quiet).
  const named = (x) => x.kind === "list" && BUILTIN_LISTS.some((l) => l.id === x.id);
  if (
    e.no_invented_citations &&
    m.citations.some((x) => x.kind !== "page" && !named(x) && !/^[0-9a-f-]{36}$/.test(x.id))
  )
    fails.push("a citation with an id no tool could have returned");
  const kinds = (m.proposals ?? []).map((p) => p.kind);
  if (e.proposals_any && !e.proposals_any.some((k) => kinds.includes(k)))
    fails.push(`proposals ${JSON.stringify(kinds)} include none of ${e.proposals_any.join("/")}`);
  // Since the Line, the pointer may be the door itself: a row or an Open that opens a thread. A card of the kind's family
  // is the kind's (a playbook_change is a playbook's card), whatever language the words around it are in: the words
  // matched are English, and a Spanish setup's "la tarjeta de arriba" beside its playbook_change failed here (16 Oct).
  const doors = m.answer ? [...m.answer.show.items.map((i) => i.source.to), m.answer.do.open?.to] : [];
  if (
    e.proposals_any_or_says &&
    !e.proposals_any_or_says.some((k) => kinds.some((kind) => kind === k || kind.startsWith(`${k}_`))) &&
    !/card|propos|approve|Inbox|thread/i.test(text) &&
    !doors.some((to) => to && /^inbox(\/|$)/.test(to))
  )
    fails.push("neither a card nor a pointer to where to do it");
  if (e.proposals_none && kinds.length) fails.push(`no card expected, got ${JSON.stringify(kinds)}`);
  // What the words decide on a card, kind by kind: every card of that kind carries each field so (a note's reader, which
  // has no default: the Phase 4 plan, D8). That such a card was made at all is proposals_any's.
  for (const [kind, fields] of Object.entries(e.card_fields ?? {}))
    for (const p of (m.proposals ?? []).filter((x) => x.kind === kind))
      for (const [k, v] of Object.entries(fields))
        if (p.payload?.[k] !== v)
          fails.push(
            `a ${kind} card with ${k} ${JSON.stringify(p.payload?.[k])}, where the words said ${JSON.stringify(v)}`,
          );
  // A setup's keys (the moment spec, A8): at most N cards, no field the words ruled out, a next question that says the
  // dependent step; and the tools' order, said once as a note.
  fails.push(...setupCardsFails(e, m));
  notes.push(...toolsOrderNote(e, m));
  // The shape they asked for (a list, a count, a length, emoji, capitals), and the preview against what landed.
  fails.push(...shapeAskedFails(e, m));
  const preview = previewJudged(r.events, m);
  fails.push(...preview.fails);
  notes.push(...preview.notes);
  // A list card's rule and what it left out (propose_list, PR 4.7; the Phase 4 plan, D10): each field the words decide
  // the rule names, and whether what the vocabulary cannot say was kept on the card rather than dropped.
  for (const p of e.list_card ? (m.proposals ?? []).filter((x) => x.kind === "list") : []) {
    const rule = JSON.stringify(p.payload?.rule ?? null);
    for (const f of e.list_card.fields ?? [])
      if (!rule.includes(`"field":"${f}"`)) fails.push(`a list card whose rule names no ${f}: ${rule}`);
    if (e.list_card.cannot !== undefined && !!p.payload?.cannot !== e.list_card.cannot)
      fails.push(`a list card that ${e.list_card.cannot ? "dropped" : "invented"} what the fields cannot say`);
  }
  if (e.navigate_now && !(m.navigate && m.navigate.now && m.navigate.to))
    fails.push(`expected the app to go there; navigate=${JSON.stringify(m.navigate)}`);
  if (
    e.cites_or_says_nothing &&
    m.citations.length === 0 &&
    !/nobody|no one|nothing|none|nadie|nada|ning[uú]n/i.test(text)
  )
    fails.push("no citation and no statement that there was nothing");
  if (m.ungrounded) fails.push("the answer was marked ungrounded (a figure with no read behind it)");
  // The answer as the Line draws it, on every turn made since the Line.
  const a = m.answer;
  if (a && !m.failed) {
    // A message the headline quotes ("Yes! Pick a time here", or the same in single quotes after a space or a
    // colon, which is never an apostrophe) is not a sentence of its own.
    const own = unquoted(a.say.headline);
    if (a.form === "structured" && /[.!?]\s+[A-ZÁÉÍÓÚÑ¿¡]/.test(own))
      fails.push(`the headline is more than one sentence: “${a.say.headline.slice(0, 120)}”`);
    const cards = m.proposals ?? [];
    const { answer: drawn, cardOpen } = oneDoor(
      a,
      cards.map((c) => ({ id: c.id, open: cardOpenRoute(c) })),
    );
    const offered = [
      ...drawn.show.items.filter((i) => i.source.door).map((i) => i.source.to),
      ...(drawn.do.open ? [drawn.do.open.to] : []),
      ...cards.filter((p) => cardOpen[p.id]).map((p) => cardOpenRoute(p)),
      ...[...drawn.show.figures.map((f) => f.source), drawn.show.breakdown?.source]
        .filter((s) => s && s.door)
        .map((s) => s.to),
    ];
    const twice = offered.filter((to, i) => offered.indexOf(to) !== i);
    if (twice.length) fails.push(`a place offered twice: ${[...new Set(twice)].join(", ")}`);
    if (e.counts && !a.show.figures.length && !a.show.breakdown)
      fails.push("a count shown by no figure and no breakdown");
    const b = a.show.breakdown;
    if (b && b.parts.reduce((s, p) => s + p.value, 0) !== b.total)
      fails.push(`a breakdown whose parts do not add up to ${b.total}`);
    // The whole is said by the breakdown; a figure that says it again is show filled for its own sake (spec 7.7).
    if (b && a.show.figures.some((f) => Number(String(f.value).replace(/[^\d.-]/g, "")) === b.total))
      notes.push(`a figure repeats the breakdown's total (${b.total})`);
  }
  return { pass: fails.length === 0, fails, notes };
}
