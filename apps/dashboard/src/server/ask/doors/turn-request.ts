/** What Ask's turn door reads from a request, and how it streams a turn back. */
import {
  ASK_SCOPE_KINDS,
  ASK_SURFACES,
  PageContextSchema,
  type AskLanguage,
  type AskScope,
  type LeadSearchPlan,
  type PageContext,
  recordOrNull,
} from "@chanlytics/contracts";
import { after } from "next/server";
import type { Member } from "@/server/shared/route";
import { log } from "@/server/shared/log";
import { requireUuid } from "@/server/shared/request-guards";
import { readerContext } from "@/server/shared/reader";
import type { RouteContext } from "@/server/shared/with-route";
import { clearFollowUp } from "@/server/ask/tools/act/follow-up";
import type { SearchAnswering } from "@/server/ask/prompt/prompt";
import { finishAskTurn, type AskTurnLine } from "@/server/ask/turn";
import { searchRow } from "@/server/leads/leads";

// The lists are contracts' own: a surface the palette sent that a hand-written list here had not caught up with was
// dropped in silence, and the prompt never learnt the page.
export const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);

export const SURFACES = new Set<string>(ASK_SURFACES);

export function line(ev: AskTurnLine): string {
  return `${JSON.stringify(ev)}\n`;
}

/**
 * The platform waits for the turn after the response has gone (next/server's `after`): a Stop lets go of the stream
 * while the turn it stopped is still to be saved. Outside a request (a test calling the route) there is no one to tell.
 */
export function waitFor(turn: Promise<unknown>): void {
  try {
    after(turn);
  } catch {
    /* no request scope */
  }
}

/**
 * The question as the turn takes it: its lines kept (a pasted message, a draft the Line's field took over several
 * lines), runs of spaces within a line made one. Anything but words is no question.
 */
export function questionOf(raw: unknown): string {
  return typeof raw === "string"
    ? raw
        .replace(/\r\n?/g, "\n")
        .replace(/[^\S\n]+/g, " ")
        .trim()
    : "";
}

/**
 * The turn run and stored, each line as it comes: the thread first, the reads, the Say, then the answer (the turn's
 * second half). The voice door runs the same two halves and speaks the Say instead. The person's Stop lets go of the
 * stream, which cancels it, or the request goes before the stream opened (a tab closed, a network gone): either stops
 * the turn where it is, and it is kept as stopped (turn.ts).
 */
export function turnStream(
  prepared: Parameters<typeof finishAskTurn>[0],
  gone: AbortSignal,
): ReadableStream<Uint8Array> {
  const stop = new AbortController();
  gone.addEventListener("abort", () => stop.abort(), { once: true });
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* the reader went away */
        }
      };
      const turn = finishAskTurn(prepared, (ev) => send(line(ev)), stop.signal);
      waitFor(turn);
      await turn;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      stop.abort();
    },
  });
}

/**
 * The scope the question is asked with (the Phase 5 plan, D9), three ways: one in the palette's shape is this turn's;
 * `null` is none, and clears the thread's; absent is no opinion (undefined), and the thread keeps its own. Anything
 * else is absent: ignored rather than refused.
 */
export function scopeAsked(raw: unknown): AskScope | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const askScope = raw as Partial<AskScope>;
  if (
    typeof askScope.kind !== "string" ||
    !SCOPE_KINDS.has(askScope.kind) ||
    typeof askScope.id !== "string" ||
    !askScope.id ||
    typeof askScope.label !== "string"
  )
    return undefined;
  return { kind: askScope.kind, id: askScope.id.slice(0, 120), label: askScope.label.slice(0, 80) };
}

/**
 * The page the question was asked on (contracts PageContext): identities and words, read by its one schema. One the schema
 * refuses is no context, said once in the log, and never a refused question: an older tab sends none, and a context is a help
 * to the answer, not a condition of it. The turn reads the page again from these identities.
 */
export function contextAsked(raw: unknown, tenantId: string): PageContext | null {
  if (raw === undefined || raw === null) return null;
  const read = PageContextSchema.safeParse(raw);
  if (read.success) return read.data;
  const issue = read.error.issues[0];
  log.error("ask_context_refused", {
    tenant_id: tenantId,
    path: issue?.path.join(".") ?? "",
    issue: issue?.message ?? "unreadable",
  });
  return null;
}

/** Words say their own language; only a question with none is told it. */
export const languageAsked = (text: string, raw: unknown): { language?: AskLanguage } =>
  !text && (raw === "es" || raw === "en") ? { language: raw } : {};

/**
 * The search a Leads answer row's text answers (`answering: { search_id }`), read under RLS in this workspace: what it
 * asked rides beside the owner's words (askTurnText). None where the body names none; one not this workspace's is a 404.
 */
export async function answeringOf(ctx: RouteContext, tenantId: string, raw: unknown): Promise<SearchAnswering | null> {
  const id = raw && typeof raw === "object" ? (raw as { search_id?: unknown }).search_id : undefined;
  if (id === undefined) return null;
  const row = await searchRow(ctx, tenantId, requireUuid(id, "search"));
  const query = recordOrNull(row.question);
  return {
    search_id: row.id,
    name: row.name,
    question: query && typeof query === "object" && typeof query.sentence === "string" ? query.sentence : "",
    asked: row.asked,
    leaving_out: ((row.plan as LeadSearchPlan | null)?.exclusions ?? []).map((x) => x.text),
  };
}

/**
 * The follow-up a question comes back to (Ask's home's row, `following: { id }`), cleared from the caller's views now that
 * the question is kept. One the body does not name in that shape is none; a clear that fails is logged, never a refused
 * question.
 */
export async function cameBackTo(ctx: RouteContext, member: Member, following: unknown): Promise<void> {
  const id = following && typeof following === "object" ? (following as { id?: unknown }).id : undefined;
  if (typeof id !== "string" || !id || id.length > 40) return;
  await clearFollowUp(readerContext(ctx, member), id).catch((e: unknown) =>
    log.error("ask_follow_up_clear_failed", { tenant_id: member.tenantId, error: e }),
  );
}
