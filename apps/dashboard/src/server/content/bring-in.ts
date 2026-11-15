import "server-only";
import { z } from "zod";
import { AppError, BRING_IN_WORDS, bringInOf, SECOND_MS } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import { log } from "@/server/shared/log";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** How long the edge has to queue the read: a job and the ledger's line. */
const BRING_IN_MS = 5 * SECOND_MS;

export const bringInInput = z.object({ link: z.string().trim().min(1).max(500) });

/** Said where the read could not be target for: nothing the owner can change but to try again later. */
const BRING_IN_NOT_STARTED = "AI couldn't start bringing them in just now. Try again in a minute.";

/**
 * A link brought in (content/bring-in.ts; Ask's card's press): what it is, said in code, and the edge target to read it, its
 * website for its photos and videos, or its Instagram for its posts and reels. A link nothing here reads is refused in words;
 * what is brought waits in the Library for a Keep.
 */
export async function bringInFor(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof bringInInput>,
): Promise<{ fate: string }> {
  const target = bringInOf(input.link);
  if (target.place === "none") throw new AppError("validation", BRING_IN_WORDS.refused[target.why]);
  if (!edgeConfigured()) throw new AppError("internal", BRING_IN_NOT_STARTED);
  const answer = await callEdge(
    "/api/admin/files/bring-in",
    { tenant_id: member.tenantId, link: input.link },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: BRING_IN_MS },
  );
  const fate = answer.status === 200 && answer.body ? answer.body.fate : null;
  if (typeof fate === "string") return { fate };
  log.error("content_bring_in_failed", { tenant_id: member.tenantId, status: answer.status, place: target.place });
  throw new AppError("internal", BRING_IN_NOT_STARTED);
}
