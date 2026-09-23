/**
 * The note sweep's work (docs/decisions/0007-person-notes.md, phase 2): read a batch of looks, ask the model about
 * the few that pass the first gate, check its answer in code, and suggest what passes.
 *
 * Every rule is contracts' (note-suggest.ts): whyNotLook before the model, the prompt, checkNoteSuggestion after it.
 * This file does the transport. A look is taken once -- note_candidates stamps what it hands over -- so a failure
 * here costs that one look, never a retry storm. What is suggested waits on the person's page for Keep or Dismiss.
 *
 * The model's tokens are logged with each look (notes_looked), not written as usage rows: the smallest model, a few
 * looks a day, and none of it the receptionist's daily reply budget.
 */
import Anthropic from "@anthropic-ai/sdk";
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
import { env } from "../env.js";
import type { Logger } from "../log.js";

/** One look, as note_candidates hands it over. */
export interface NoteCandidate {
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
export type AskNote = (
  system: string,
  user: string,
) => Promise<{ answer: unknown; tokens: { input: number; output: number } } | null>;

/** The database the sweep needs: the batch, and the one door a suggestion goes through. */
export interface NotesDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // Built on first use: this module rides with a sweep that must run on a deployment without a key.
  if (!client) client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return client;
}

/** The API refused the request's format, not the content: asked again once for plain JSON. */
function formatRejected(e: unknown): boolean {
  const err = e as { status?: number; message?: string } | null;
  return err?.status === 400 && /output_config|output_format|json_schema|schema|format/i.test(err.message ?? "");
}

/** The first JSON object in a text answer, or null. */
function firstJson(text: string): unknown {
  const at = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (at < 0 || end <= at) return null;
  try {
    return JSON.parse(text.slice(at, end + 1));
  } catch {
    return null;
  }
}

export const askNoteModel: AskNote = async (system, user) => {
  if (!env.ANTHROPIC_API_KEY) return null;
  const create = anthropic().messages.create.bind(anthropic().messages) as unknown as (p: unknown) => Promise<{
    content: Array<{ type: string; text?: string }>;
    stop_reason?: string | null;
    usage?: { input_tokens: number; output_tokens: number };
  }>;
  const base = { model: NOTE_SUGGEST_MODEL, max_tokens: 300, system, messages: [{ role: "user", content: user }] };
  let res;
  try {
    res = await create({ ...base, output_config: { format: { type: "json_schema", schema: NOTE_SUGGEST_SCHEMA } } });
  } catch (e) {
    if (!formatRejected(e)) throw e;
    res = await create({
      ...base,
      system: `${system}\nAnswer with only a JSON object with the keys worth, kind, text and quote.`,
    });
  }
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
  // A refusal or a capped answer is nothing: no note is better than half of one.
  const answer = res.stop_reason === "refusal" || res.stop_reason === "max_tokens" ? null : firstJson(text);
  return {
    answer,
    tokens: { input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0 },
  };
};

export interface NotesSweepOutcome {
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
