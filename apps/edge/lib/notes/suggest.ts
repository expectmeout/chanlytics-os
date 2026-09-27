/**
 * The note sweep's work (docs/decisions/0007-person-notes.md, phase 2): read a batch of looks, ask the model about
 * the few that pass the first gate, check its answer in code, and suggest what passes.
 *
 * Every rule is contracts' (note-suggest.ts): whyNotLook before the model, the prompt, checkNoteSuggestion after it.
 * The transport is lib/model.ts, the one the reach-out check asks through too. A look is taken once -- note_candidates stamps what it hands over -- so a failure
 * here costs that one look, never a retry storm. What is suggested waits on the person's page for Keep or Dismiss.
 *
 * The model's tokens are logged with each look (notes_looked), not written as usage rows: the smallest model, a few
 * looks a day, and none of it the receptionist's daily reply budget.
 */
import {
  NOTE_SUGGEST_LIMITS,
  NOTE_SUGGEST_MODEL,
  NOTE_SUGGEST_SCHEMA,
  checkNoteSuggestion,
  noteSuggestSystemPrompt,
  noteSuggestUserContent,
  whyNotLook,
  type NoteTurn,
} from "../packages/contracts.js";
import { askJson } from "../model.js";
import type { Logger } from "../log.js";

/** How long the model may take to suggest a note. */
const SUGGEST_TIMEOUT_MS = 20_000;

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
) => Promise<{ answer: unknown; tokens: { input: number; output: number } } | null>;

/** The database the sweep needs: the batch, and the one door a suggestion goes through. */
interface NotesDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The smallest model, in its schema, through the platform's one JSON-model transport (lib/model.ts). */
export const askNoteModel: AskNote = (system, user) =>
  askJson({
    model: NOTE_SUGGEST_MODEL,
    system,
    user,
    schema: NOTE_SUGGEST_SCHEMA,
    maxTokens: 300,
    plainJsonHint: "Answer with only a JSON object with the keys worth, kind, text and quote.",
    timeoutMs: SUGGEST_TIMEOUT_MS,
    maxRetries: 1,
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
      asked = await ask(noteSuggestSystemPrompt("local business"), noteSuggestUserContent(turns, known));
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
