import "server-only";
/**
 * Rewrite the opening, after its decision (00505): the emails a person pressed it on, written now by the edge's check
 * (/api/admin/reach-out/check, the work its clock does each minute) and answered with the openings they stand with, as
 * one answer or as a stream of the check's steps as it takes them; and Undo, the opening a rewrite replaced put back.
 *
 * A press waits CHECK_NOW_MS at most. Past it, or where the edge could not be asked (a preview deployment, an edge
 * unreachable), the answer says how each email stands then: still being written, which the clock finishes on its next
 * minute and the page shows as it lands. The edge's check goes on when nobody waits for it.
 */
import {
  REWRITE_STEPS,
  SECOND_MS,
  type ReachOutCheckLine,
  type ReachOutOpeningDto,
  type RewriteStep,
} from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db/events";
import { sendOpeningsOf, undoSendRewrite } from "@chanlytics/db/campaigns";
import { deployment } from "@/server/shared/env";
import { callEdge, edgeAnswered, edgeHeaders, edgeUrl } from "@/server/shared/edge";
import { log } from "@/server/shared/log";
import { serviceDb } from "@/server/shared/service-db";
import { reachOutRefusal } from "@/server/campaigns/reach-outs/chain-acts";
import type { RouteContext } from "@/server/shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/** How long a press waits for its check: a rewrite is two model calls of about a second each, and a site read. */
const CHECK_NOW_MS = 20 * SECOND_MS;

/** The edge's door for a pressed check. */
const CHECK_DOOR = "/api/admin/reach-out/check";

const STEPS = new Set<string>(REWRITE_STEPS);

/** How the emails stand now, as the page reads them. */
const openingsOf = (ctx: RouteContext, tenantId: TenantId, ids: string[]): Promise<ReachOutOpeningDto[]> =>
  sendOpeningsOf(ctx.supabase, { tenantId, sendIds: ids });

/** The emails' check, now, and how they stand after it: one answer. */
export async function checkOpeningsNow(
  ctx: RouteContext,
  tenantId: TenantId,
  ids: string[],
): Promise<{ sends: ReachOutOpeningDto[] }> {
  if (deployment.providersLive) {
    const r = await callEdge(
      CHECK_DOOR,
      { send_ids: ids },
      { workspace: tenantId, user: ctx.userId, timeoutMs: CHECK_NOW_MS },
    );
    if (!edgeAnswered(r)) log.warn("reach_out_rewrite_unchecked", { tenant_id: tenantId, status: r.status });
  }
  return { sends: await openingsOf(ctx, tenantId, ids) };
}

/**
 * The edge's steps, passed on as they come: each line of its stream that names a step of one of these emails. Ends with
 * the edge's stream, at CHECK_NOW_MS, or when the page lets go (`gone`); an edge that could not be asked is said once in
 * the log, and the answer after says how the emails stand.
 */
async function relaySteps(
  params: { ctx: RouteContext; tenantId: TenantId; ids: string[]; gone: AbortSignal },
  send: (line: ReachOutCheckLine) => void,
): Promise<void> {
  const body = JSON.stringify({ send_ids: params.ids, stream: true });
  const seen = new Set(params.ids);
  try {
    const res = await fetch(`${edgeUrl()}${CHECK_DOOR}`, {
      method: "POST",
      headers: edgeHeaders(CHECK_DOOR, { workspace: params.tenantId, user: params.ctx.userId, body }),
      body,
      cache: "no-store",
      signal: AbortSignal.any([AbortSignal.timeout(CHECK_NOW_MS), params.gone]),
    });
    if (!res.ok || !res.body) {
      log.warn("reach_out_rewrite_unchecked", { tenant_id: params.tenantId, status: res.status });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let carry = "";
    const take = (raw: string) => {
      let line: { t?: unknown; send_id?: unknown; step?: unknown };
      try {
        line = JSON.parse(raw) as typeof line;
      } catch {
        return;
      }
      if (line.t !== "step" || typeof line.send_id !== "string" || !seen.has(line.send_id)) return;
      if (typeof line.step === "string" && STEPS.has(line.step))
        send({ t: "step", send_id: line.send_id, step: line.step as RewriteStep });
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      carry += decoder.decode(value, { stream: true });
      const lines = carry.split("\n");
      carry = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) take(l);
    }
    if (carry.trim()) take(carry);
  } catch {
    // The wait ran out, the page let go, or the edge could not be reached: the answer says how they stand.
    if (!params.gone.aborted) log.warn("reach_out_rewrite_unchecked", { tenant_id: params.tenantId, status: 0 });
  }
}

/** The emails' check, now, as a stream of JSON lines: each step as the check takes it, then how they stand. */
export function streamOpeningsNow(ctx: RouteContext, tenantId: TenantId, ids: string[], gone: AbortSignal): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: ReachOutCheckLine) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          /* the page went away */
        }
      };
      if (deployment.providersLive) await relaySteps({ ctx, tenantId, ids, gone }, send);
      try {
        send({ t: "done", sends: await openingsOf(ctx, tenantId, ids) });
      } catch (e) {
        log.error("reach_out_rewrite_unread", {
          tenant_id: tenantId,
          error: e instanceof Error ? e.message : String(e),
        });
        send({ t: "done", sends: [] });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}

/** Undo of Rewrite the opening (00505): the opening it replaced, and how it stood, back while the email waits. */
export async function undoOpening(
  ctx: RouteContext,
  send: { id: string; tenant_id: TenantId; broadcast_id: string },
): Promise<{ send_id: string; rewritten: ReachOutOpeningDto | null }> {
  const r = await undoSendRewrite(ctx.supabase, send.id);
  if (r.error) throw reachOutRefusal(r.error);
  await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
    decision: "rewrite_undone",
    by: ctx.userId,
  });
  const [now] = await openingsOf(ctx, send.tenant_id, [send.id]);
  return { send_id: send.id, rewritten: now ?? null };
}
