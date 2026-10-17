/**
 * A member answers a note suggested from an owner's correction (decision 0063): Keep as a note, or Dismiss.
 *
 * Keep is a change to what the receptionist reads, so it is the settings' own write: the stored config with the note
 * added (contracts applySettingsChange, the change Ask's cards make), through the write schema, with the version the row
 * was read at (a row that moved is refused, never overwritten), the settings history and `settings.changed` as a save on
 * the page records them (settings-write.ts). Then the door marks the suggestion kept with the version it wrote (00448
 * fact_suggestion_answer), and its line on the bell ends. A note the notes already say is marked kept without a second
 * copy; full notes are said so, and nothing is written. Dismiss is the door alone. Nothing is sent to anyone.
 */
import "server-only";
import {
  AppError,
  applySettingsChange,
  factAlreadyNoted,
  factNoteChange,
  FACT_SUGGEST_LIMITS,
  FACT_SUGGEST_WORDS,
  parseTenantConfig,
  TenantConfigWriteSchema,
  withStoredKeysKept,
} from "@chanlytics/contracts";
import { answerFactSuggestion, factSuggestionById, putTenantConfig } from "@chanlytics/db";
import { configRowOf } from "@/server/workspace/config-row";
import { recordSettingsChanged } from "@/server/workspace/settings-write";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import { log } from "@/server/log";
import type { Member } from "@/server/route";

/** What an answer did: the suggestion as it stands, the settings version a Keep wrote (or found it in), and its words. */
interface FactAnswered {
  suggestion: { id: string; state: "kept" | "dismissed" };
  version: number | null;
  receipt: string;
}

/** The notes as the receptionist is told them, title and text, for the check that a note says it already. */
function notesSaid(config: unknown): { count: number; said: string[] } {
  const notes = parseTenantConfig(config ?? null)?.brain?.profile?.notes ?? [];
  return { count: notes.length, said: notes.map((n) => `${n.title}. ${n.text}`) };
}

/** Keep's settings write: the version the note now stands in, or the version that already said it. */
async function keepNote(
  ctx: RouteContext,
  member: Member,
  s: { title: string; body: string },
): Promise<{ version: number; already: boolean }> {
  const before = await configRowOf(ctx.supabase, member.tenantId);
  if (!before) throw new AppError("conflict", FACT_SUGGEST_WORDS.moved, 409);
  const notes = notesSaid(before.config);
  if (factAlreadyNoted(s, notes.said)) return { version: before.version, already: true };
  if (notes.count >= FACT_SUGGEST_LIMITS.notesMax) throw new AppError("validation", FACT_SUGGEST_WORDS.notesFull);
  const added = applySettingsChange((before.config ?? {}) as Record<string, unknown>, factNoteChange(s));
  const parsed = TenantConfigWriteSchema.safeParse(added);
  if (!parsed.success) {
    log.error("fact_answer_failed", { tenant_id: member.tenantId, step: "schema", issues: parsed.error.issues.length });
    throw new AppError("validation", "This note cannot be kept as it is: add it in Settings › How it answers.");
  }
  // What the schema left out of the stored row is put back, as a save on the page does (settings-save.ts).
  const next = withStoredKeysKept(parsed.data, before.config);
  const result = await putTenantConfig(ctx.supabase, member.tenantId, next, before.version, ctx.userId);
  if (!result.ok) throw new AppError("conflict", FACT_SUGGEST_WORDS.moved, 409);
  await recordSettingsChanged(ctx, member.tenantId, before.config, next, result.row.version);
  return { version: result.row.version, already: false };
}

export async function answerFactOf(
  ctx: RouteContext,
  member: Member,
  id: string,
  keep: boolean,
): Promise<FactAnswered> {
  const s = await factSuggestionById(ctx.supabase, id);
  // One of another workspace, or none, is not found: RLS read it as nothing either way.
  if (!s || s.tenant_id !== member.tenantId) throw new AppError("not_found", "Suggestion not found.");
  if (s.state !== "suggested") throw new AppError("conflict", FACT_SUGGEST_WORDS.answered, 409);
  const kept = keep ? await keepNote(ctx, member, s) : null;
  const { data, error } = await answerFactSuggestion(ctx.supabase, {
    id,
    keep,
    configVersion: kept ? kept.version : null,
  });
  if (error) throw dbRefusal(error);
  const r = (data ?? {}) as { error?: string; suggestion?: { id: string; state: "kept" | "dismissed" } };
  if (r.error === "answered") throw new AppError("conflict", FACT_SUGGEST_WORDS.answered, 409);
  if (r.error || !r.suggestion) {
    log.error("fact_answer_failed", { tenant_id: member.tenantId, step: "door", error: r.error ?? null });
    throw new AppError("validation", "Could not answer this.");
  }
  return {
    suggestion: r.suggestion,
    version: kept ? kept.version : null,
    receipt: !kept
      ? FACT_SUGGEST_WORDS.dismissed
      : kept.already
        ? FACT_SUGGEST_WORDS.alreadyKept(s.title)
        : FACT_SUGGEST_WORDS.kept(s.title),
  };
}
