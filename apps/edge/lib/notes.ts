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
 */
import {
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
  type NoteTurn,
} from "./packages/contracts.js";
import { factCorrectionsBatch, suggestFact, type FactCorrectionRow } from "./packages/db.js";
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
