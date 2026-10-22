/**
 * The note sweep's work (docs/decisions/0007-person-notes.md, phase 2): read a batch of looks, ask the model about
 * the few that pass the first gate, check its answer in code, and suggest what passes.
 *
 * Every rule is contracts' (note-suggest.ts): whyNotLook before the model, the prompt, checkNoteSuggestion after it.
 * The transport is lib/model.ts, the one the reach-out check asks through too. A look is taken once -- note_candidates stamps what it hands over -- so a failure
 * here costs that one look, never a retry storm. What is suggested waits on the person's page for Keep or Dismiss.
 *
 * The model's tokens are logged with each look (notes_looked), and the model port writes each call to the usage ledger
 * (ai_usage, purpose note_suggest) for the look's workspace: none of it the receptionist's daily reply budget.
 *
 * Cross-workspace: the note sweep reads every workspace's looks; each suggestion carries its look's tenant_id.
 *
 * And an owner's corrections (docs/decisions/0063-an-owners-correction-is-kept.md): a held draft rewritten to their
 * instruction, or their own text after a hold, each looked at once (fact_candidates stamps what it hands over), through
 * the same model and the same ledger purpose, its gates contracts' fact-suggest.ts. What passes waits on Settings ›
 * Autonomy as a note for the receptionist to Keep or Dismiss, told on the bell.
 *
 * And Ask's journal (decision 0070): each day of a workspace something happened in, once its own midnight has passed by
 * an hour, written in a few sentences from the day's two ledgers as Settings › Activity folds them (money left out), for
 * an owner's Ask to remember. A day is handed over once (ask_journal_write stamps it), one at a time while the run has
 * time for another, through the transport at low effort under its own ledger purpose (ask_journal); contracts'
 * ask-memory/journal.ts holds the prompt, the schema and the check.
 */
import {
  ASK_JOURNAL_LIMITS,
  FACT_SUGGEST_LIMITS,
  FACT_SUGGEST_MODEL,
  FACT_SUGGEST_SCHEMA,
  NOTE_SUGGEST_LIMITS,
  NOTE_SUGGEST_MODEL,
  NOTE_SUGGEST_SCHEMA,
  checkFactSuggestion,
  checkNoteSuggestion,
  factSuggestSystemPrompt,
  factSuggestUserContent,
  noteSuggestSystemPrompt,
  noteSuggestUserContent,
  whyNotFactLook,
  whyNotLook,
  JOURNAL_SCHEMA,
  activityLines,
  activityMemberWords,
  activityRowOfDecision,
  activityRowOfEvent,
  checkJournal,
  clockTime,
  isActivityMoney,
  isActivityNoise,
  journalSystemPrompt,
  journalUserContent,
  zoneDayKey,
  type ActivityDecisionRow,
  type ActivityEventRow,
  type ActivityRowDto,
  type JournalLine,
  type NoteTurn,
} from "./packages/contracts.js";
import {
  activitySubjects,
  askJournalDayRows,
  askJournalDue,
  factCorrectionsBatch,
  journalMemberNames,
  keepAskJournal,
  suggestFact,
  type AskJournalDueRow,
  type FactCorrectionRow,
} from "./packages/db.js";
import { askJson } from "./model.js";
import type { Logger } from "./log.js";

/** One look, as note_candidates hands it over. */
interface NoteCandidate {
  source: "call" | "thread";
  tenant_id: string;
  contact_id: string;
  source_id: string;
  seconds: number | null;
  dnc: boolean;
  last_suggested: string | null;
  workspace_today: number;
  turns: NoteTurn[];
  known: string[];
}

/** The model's answer to one look, with what it cost; null when there is no model to ask. */
type AskNote = (
  system: string,
  user: string,
  forWhom: { tenantId: string; subjectId: string },
) => Promise<{ answer: unknown; tokens: { input: number; output: number } } | null>;

/** The database the sweep needs: the batch, and the one door a suggestion goes through. */
interface NotesDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The smallest model, in its schema, through the platform's one JSON-model transport (lib/model.ts). */
export const askNoteModel: AskNote = (system, user, forWhom) =>
  askJson({
    purpose: "note_suggest",
    system,
    user,
    schema: NOTE_SUGGEST_SCHEMA,
    maxTokens: 300,
    plainJsonHint: "Answer with only a JSON object with the keys worth, kind, text and quote.",
    for: forWhom,
  });

interface NotesSweepOutcome {
  looked: number;
  asked: number;
  suggested: number;
  /** Why each look ended, by reason: the log's picture of how rarely a note is earned. */
  ended: Record<string, number>;
}

/**
 * One run: a batch of looks (calls and quiet conversations, each stamped as it is handed over), the first gate, the
 * model, the checks, and the door. A look that ends early ends quietly; the counts say why.
 */
export async function suggestNotes(deps: {
  db: NotesDb;
  L: Logger;
  ask: AskNote;
  nowMs: number;
}): Promise<NotesSweepOutcome> {
  const { db, L, ask, nowMs } = deps;
  const out: NotesSweepOutcome = { looked: 0, asked: 0, suggested: 0, ended: {} };
  const end = (why: string) => {
    out.ended[why] = (out.ended[why] ?? 0) + 1;
  };
  const { data, error } = await db.rpc("note_candidates", { p_limit: NOTE_SUGGEST_LIMITS.perRun });
  if (error) {
    L.error("notes_candidates_failed", { error: error.message });
    return out;
  }
  // The day's count per workspace, carried across this run's own suggestions so a busy batch keeps to the cap.
  const today = new Map<string, number>();
  for (const c of (data ?? []) as NoteCandidate[]) {
    out.looked += 1;
    const turns = (Array.isArray(c.turns) ? c.turns : []).filter(
      (t): t is NoteTurn => !!t && (t.who === "customer" || t.who === "business") && typeof t.text === "string",
    );
    const known = (Array.isArray(c.known) ? c.known : []).filter((k): k is string => typeof k === "string");
    const workspaceToday = Math.max(c.workspace_today ?? 0, today.get(c.tenant_id) ?? 0);
    const early = whyNotLook({
      source: c.source,
      turns,
      seconds: c.seconds,
      dnc: c.dnc,
      lastSuggestedAt: c.last_suggested,
      workspaceToday,
      nowMs,
    });
    if (early) {
      end(early);
      continue;
    }
    let asked;
    try {
      asked = await ask(noteSuggestSystemPrompt("local business"), noteSuggestUserContent(turns, known), {
        tenantId: c.tenant_id,
        subjectId: c.contact_id,
      });
    } catch (e) {
      L.warn("notes_model_failed", {
        tenant_id: c.tenant_id,
        source: c.source,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      end("model_failed");
      continue;
    }
    if (!asked) {
      end("no_model");
      continue;
    }
    out.asked += 1;
    const checked = checkNoteSuggestion(asked.answer, turns, known);
    L.info("notes_looked", {
      tenant_id: c.tenant_id,
      source: c.source,
      model: NOTE_SUGGEST_MODEL,
      input_tokens: asked.tokens.input,
      output_tokens: asked.tokens.output,
      outcome: checked.ok ? "suggest" : checked.why,
    });
    if (!checked.ok) {
      end(checked.why);
      continue;
    }
    const { data: door, error: doorErr } = await db.rpc("person_note_suggest", {
      p_tenant_id: c.tenant_id,
      p_contact_id: c.contact_id,
      p_body: checked.body,
      p_source: c.source,
      p_source_id: c.source_id,
    });
    const refused = (door as { error?: string } | null)?.error;
    if (doorErr || refused) {
      end(refused ?? "door_failed");
      if (doorErr) L.error("notes_suggest_failed", { tenant_id: c.tenant_id, error: doorErr.message });
      continue;
    }
    out.suggested += 1;
    today.set(c.tenant_id, workspaceToday + 1);
  }
  return out;
}

/* ------------------------------------------------------------ an owner's corrections (0063) -- */

/** The smallest model, in the fact's schema, through the same transport and the same ledger purpose as a person's note. */
export const askFactModel: AskNote = (system, user, forWhom) =>
  askJson({
    purpose: "note_suggest",
    system,
    user,
    schema: FACT_SUGGEST_SCHEMA,
    maxTokens: 300,
    plainJsonHint: "Answer with only a JSON object with the keys worth, title, text and quote.",
    for: forWhom,
  });

/** The database the facts' step needs: the batch, and the one door a suggestion goes through (packages/db). */
interface FactsDb {
  batch(limit: number): Promise<FactCorrectionRow[]>;
  suggest(p: { id: string; title: string; body: string; quote: string }): Promise<{ refused: string | null }>;
}

/** The facts' step over a real database: the two doors of 00448, through packages/db. */
export const factsDbOf = (db: Parameters<typeof factCorrectionsBatch>[0]): FactsDb => ({
  batch: (limit) => factCorrectionsBatch(db, limit),
  suggest: (p) => suggestFact(db, p),
});

/**
 * One run over the owner's corrections: a batch (each stamped as it is handed over), the first gate, the model, the
 * checks, and the door. A look that ends early ends quietly, as a person's note's does; the counts say why.
 */
export async function suggestFacts(deps: { db: FactsDb; L: Logger; ask: AskNote }): Promise<NotesSweepOutcome> {
  const { db, L, ask } = deps;
  const out: NotesSweepOutcome = { looked: 0, asked: 0, suggested: 0, ended: {} };
  const end = (why: string) => {
    out.ended[why] = (out.ended[why] ?? 0) + 1;
  };
  let batch: FactCorrectionRow[];
  try {
    batch = await db.batch(FACT_SUGGEST_LIMITS.perRun);
  } catch (e) {
    L.error("facts_candidates_failed", { error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    return out;
  }
  // The day's count per workspace, carried across this run's own suggestions so a busy batch keeps to the cap.
  const today = new Map<string, number>();
  for (const c of batch) {
    out.looked += 1;
    const workspaceToday = Math.max(c.workspace_today, today.get(c.tenant_id) ?? 0);
    const early = whyNotFactLook({ words: c.words, notesCount: c.notes_count, workspaceToday });
    if (early) {
      end(early);
      continue;
    }
    let asked;
    try {
      asked = await ask(
        factSuggestSystemPrompt(),
        factSuggestUserContent({ source: c.source, asked: c.asked, said: c.said, words: c.words, known: c.known }),
        { tenantId: c.tenant_id, subjectId: c.conversation_id ?? c.id },
      );
    } catch (e) {
      L.warn("facts_model_failed", {
        tenant_id: c.tenant_id,
        source: c.source,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      end("model_failed");
      continue;
    }
    if (!asked) {
      end("no_model");
      continue;
    }
    out.asked += 1;
    const checked = checkFactSuggestion(asked.answer, c.words, c.known);
    L.info("facts_looked", {
      tenant_id: c.tenant_id,
      source: c.source,
      model: FACT_SUGGEST_MODEL,
      input_tokens: asked.tokens.input,
      output_tokens: asked.tokens.output,
      outcome: checked.ok ? "suggest" : checked.why,
    });
    if (!checked.ok) {
      end(checked.why);
      continue;
    }
    let refused: string | null;
    try {
      ({ refused } = await db.suggest({ id: c.id, title: checked.title, body: checked.text, quote: checked.quote }));
    } catch (e) {
      L.error("facts_suggest_failed", {
        tenant_id: c.tenant_id,
        error: e instanceof Error ? e.message.slice(0, 200) : String(e),
      });
      end("door_failed");
      continue;
    }
    if (refused) {
      end(refused);
      continue;
    }
    out.suggested += 1;
    today.set(c.tenant_id, workspaceToday + 1);
  }
  return out;
}

/* ----------------------------------------------------------------------- Ask's journal (0070) -- */

/**
 * The most one day's call may take, its fallback's try included: the port asks no fallback with too little of it left,
 * so a day ends inside the run's guard (JOURNAL_DAY_MS) with time to read the day before and keep it after.
 */
const JOURNAL_MODEL_MS = 15_000;

/** Sonnet, thinking little, in the journal's schema, through the same transport, under the journal's own purpose. */
export const askJournalModel: AskNote = (system, user, forWhom) =>
  askJson({
    purpose: "ask_journal",
    system,
    user,
    schema: JOURNAL_SCHEMA,
    maxTokens: 1500,
    effort: "low",
    plainJsonHint: "Answer with only a JSON object with the keys worth and text.",
    deadlineMs: JOURNAL_MODEL_MS,
    for: forWhom,
  });

/** One day's ledgers, as the journal reads them. */
interface JournalRows {
  decisions: ActivityDecisionRow[];
  events: ActivityEventRow[];
}

/** The database the journal's step needs: a day due, what happened on it, who and what it names, and the one door. */
interface JournalDb {
  due(): Promise<AskJournalDueRow | null>;
  day(p: { tenantId: string; from: string; to: string }): Promise<JournalRows>;
  names(userIds: string[]): Promise<Record<string, string>>;
  subjects(tenantId: string, about: Array<{ type: string; id: string }>): Promise<Record<string, string>>;
  keep(p: {
    tenantId: string;
    day: string;
    text: string | null;
    rowsRead: number;
    failed?: boolean;
  }): Promise<{ refused: string | null }>;
}

/** The journal's step over a real database, through packages/db: one day handed over at a time. */
export const journalDbOf = (db: Parameters<typeof askJournalDue>[0]): JournalDb => ({
  due: async () => (await askJournalDue(db, 1))[0] ?? null,
  day: (p) => askJournalDayRows(db, { ...p, limit: ASK_JOURNAL_LIMITS.rowsRead }),
  names: (ids) => journalMemberNames(db, ids),
  subjects: async (tenantId, about) => (await activitySubjects(db, tenantId, about)).names,
  keep: (p) => keepAskJournal(db, p),
});

/** Who a line's row says did it: a member by the name they gave, the receptionist, the system, or nobody named. */
function journalWho(r: ActivityRowDto, names: Record<string, string>): string {
  if (r.actor_user_id) return names[r.actor_user_id] ?? "A teammate";
  if (r.actor_type === "ai") return "Receptionist";
  if (r.actor_type === "system") return "System";
  return "";
}

/** The day's name in English ("Tuesday"), from its date: the model says it in the workspace's language. */
function journalWeekday(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Both ledgers' rows as the log's rows, money and the log's noise left out, newest first as the log folds them. */
function journalRowsOf(rows: JournalRows): ActivityRowDto[] {
  return [...rows.decisions.map(activityRowOfDecision), ...rows.events.map(activityRowOfEvent)]
    .filter((r) => !isActivityMoney(r) && !isActivityNoise(r.kind))
    .sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));
}

/**
 * The day's lines as Settings › Activity folds them (contracts activityLines: a burst of one kind by one hand is one
 * line), oldest first, at most linesMax: each with its time by the workspace's clock, who did it, and its sentence with
 * what it was about by name. The code decides what the day was; the model only says it.
 */
export function journalLinesOf(
  rows: readonly ActivityRowDto[],
  names: Record<string, string>,
  subjects: Record<string, string>,
  timezone: string,
): JournalLine[] {
  return activityLines(rows, (at) => zoneDayKey(Date.parse(at), timezone))
    .slice(0, ASK_JOURNAL_LIMITS.linesMax)
    .reverse()
    .map((l) => {
      const about = l.row.subject_id ? (subjects[`${l.row.subject_type ?? ""}:${l.row.subject_id}`] ?? null) : null;
      return {
        at: clockTime(Date.parse(l.row.at), timezone),
        who: journalWho(l.row, names),
        what: l.title ?? activityMemberWords(l.row, about),
        times: l.count,
      };
    });
}

/** One day read: its lines, and how many ledger rows they came from. */
async function journalDayOf(db: JournalDb, d: AskJournalDueRow): Promise<{ lines: JournalLine[]; read: number }> {
  const rows = journalRowsOf(await db.day({ tenantId: d.tenant_id, from: d.day_from, to: d.day_to }));
  const acted = [...new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id))];
  const about = rows.flatMap((r) =>
    r.subject_type && r.subject_id ? [{ type: r.subject_type, id: r.subject_id }] : [],
  );
  const [names, subjects] = await Promise.all([db.names(acted), db.subjects(d.tenant_id, about)]);
  return { lines: journalLinesOf(rows, names, subjects, d.timezone), read: rows.length };
}

interface JournalOutcome {
  looked: number;
  written: number;
  quiet: number;
  failed: number;
  /** Why the run stopped short of its days, when it did. */
  stopped: "time" | null;
}

/** How long one day can take, the model's slowest answer and the door: a run with less left lets the next day wait. */
const JOURNAL_DAY_MS = 20_000;

/** What became of one day handed over, as its door keeps it. */
type JournalEnd = { text: string; outcome: "written" } | { text: null; outcome: string; failed?: true };

/** A failure as a log line says it. */
const errorWords = (e: unknown): string => (e instanceof Error ? e.message.slice(0, 200) : String(e));

/** One day handed over: read, asked and checked, ending in what its door keeps. Never thrown: a day that fails is failed. */
async function journalEnd(
  db: JournalDb,
  L: Logger,
  ask: AskNote,
  d: AskJournalDueRow,
): Promise<{ end: JournalEnd; read: number }> {
  let day: { lines: JournalLine[]; read: number };
  try {
    day = await journalDayOf(db, d);
  } catch (e) {
    L.error("journal_day_failed", { tenant_id: d.tenant_id, day: d.day, error: errorWords(e) });
    return { end: { text: null, outcome: "read_failed", failed: true }, read: 0 };
  }
  const { read } = day;
  if (!day.lines.length) return { end: { text: null, outcome: "nothing" }, read };
  let asked: Awaited<ReturnType<AskNote>>;
  try {
    asked = await ask(
      journalSystemPrompt(),
      journalUserContent({ day: d.day, weekday: journalWeekday(d.day), locale: d.locale, lines: day.lines }),
      { tenantId: d.tenant_id, subjectId: d.tenant_id },
    );
  } catch (e) {
    L.warn("journal_model_failed", { tenant_id: d.tenant_id, error: errorWords(e) });
    return { end: { text: null, outcome: "model_failed", failed: true }, read };
  }
  if (!asked) return { end: { text: null, outcome: "no_model", failed: true }, read };
  const checked = checkJournal(asked.answer);
  if (checked.ok) return { end: { text: checked.text, outcome: "written" }, read };
  if (checked.why === "quiet") return { end: { text: null, outcome: "quiet" }, read };
  return { end: { text: null, outcome: "unreadable", failed: true }, read };
}

/**
 * One run of the journal's step: up to perRun days, each handed over as it is taken (so a day is written once, and a day
 * not reached waits for the next run), while the run has time for another before `deadlineMs`. A day with nothing worth
 * saying is kept quiet; one the model would not answer is kept failed and never asked again: the journal skips a day
 * rather than cost a retry storm.
 */
export async function writeJournal(deps: {
  db: JournalDb;
  L: Logger;
  ask: AskNote;
  deadlineMs: number;
  now: () => number;
}): Promise<JournalOutcome> {
  const { db, L, ask } = deps;
  const out: JournalOutcome = { looked: 0, written: 0, quiet: 0, failed: 0, stopped: null };
  for (let i = 0; i < ASK_JOURNAL_LIMITS.perRun; i += 1) {
    if (deps.deadlineMs - deps.now() < JOURNAL_DAY_MS) {
      out.stopped = "time";
      break;
    }
    let d: AskJournalDueRow | null;
    try {
      d = await db.due();
    } catch (e) {
      L.error("journal_due_failed", { error: errorWords(e) });
      break;
    }
    if (!d) break;
    out.looked += 1;
    const { end, read } = await journalEnd(db, L, ask, d);
    if (end.outcome === "written") out.written += 1;
    else if ("failed" in end) out.failed += 1;
    else out.quiet += 1;
    try {
      const { refused } = await db.keep({
        tenantId: d.tenant_id,
        day: d.day,
        text: end.text,
        rowsRead: read,
        ...("failed" in end ? { failed: true } : {}),
      });
      L.info("journal_written", { tenant_id: d.tenant_id, day: d.day, rows: read, outcome: end.outcome, refused });
    } catch (e) {
      L.error("journal_keep_failed", { tenant_id: d.tenant_id, day: d.day, error: errorWords(e) });
    }
  }
  return out;
}
