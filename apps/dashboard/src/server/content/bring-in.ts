import "server-only";
import { z } from "zod";
import {
  AppError,
  BRING_IN_WORDS,
  bringInOf,
  SECOND_MS,
  type DoorAnswer,
  type FILE_BRING_IN_DOOR,
} from "@chanlytics/contracts";
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
 * What the route answers a press, which the card's receipt reads (contracts content/bring-in.ts): a read began
 * (`website`, `instagram`), the account was read inside the day (`read_lately`: how long ago, whether that read is
 * still on its way, and what it brought), or a day's reads are used (`wait`: which budget binds, and how long until
 * the next may be asked for).
 */
interface BringInAnswer {
  fate: string;
  read_ms_ago?: number;
  reading?: boolean;
  photos?: number;
  videos?: number;
  binds?: string;
  wait_ms?: number;
}

/**
 * The edge's answer as the card's receipt reads it: its moments as how long ago and how long until, by this server's
 * clock, so the words are made from numbers and no clock is read where they are.
 */
function bringInAnswerOf(body: DoorAnswer<typeof FILE_BRING_IN_DOOR>, fate: string, nowMs: number): BringInAnswer {
  const readAt = body.read_at ? Date.parse(body.read_at) : Number.NaN;
  const until = body.until ? Date.parse(body.until) : Number.NaN;
  return {
    fate,
    ...(Number.isFinite(readAt) ? { read_ms_ago: Math.max(0, nowMs - readAt) } : {}),
    ...(body.reading === undefined ? {} : { reading: body.reading }),
    ...(body.photos === undefined ? {} : { photos: body.photos }),
    ...(body.videos === undefined ? {} : { videos: body.videos }),
    ...(body.binds === undefined ? {} : { binds: body.binds }),
    ...(Number.isFinite(until) ? { wait_ms: Math.max(0, until - nowMs) } : {}),
  };
}

/**
 * A link brought in (content/bring-in.ts; Ask's card's press): what it is, said in code, and the edge target to read it, its
 * website for its photos and videos, or its Instagram for its posts and reels. A link nothing here reads is refused in words;
 * what is brought waits in the Library for a Keep. An account read inside the day, or a day's reads used up, starts
 * nothing and is no failure: the answer says which, for the card's receipt.
 */
export async function bringInFor(
  ctx: RouteContext,
  member: Member,
  input: z.infer<typeof bringInInput>,
): Promise<BringInAnswer> {
  const target = bringInOf(input.link);
  if (target.place === "none") throw new AppError("validation", BRING_IN_WORDS.refused[target.why]);
  if (!edgeConfigured()) throw new AppError("internal", BRING_IN_NOT_STARTED);
  const answer = await callEdge(
    "/api/admin/files/bring-in",
    { tenant_id: member.tenantId, link: input.link },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: BRING_IN_MS },
  );
  const fate = answer.status === 200 && answer.body ? answer.body.fate : null;
  if (answer.body && typeof fate === "string") return bringInAnswerOf(answer.body, fate, Date.now());
  log.error("content_bring_in_failed", { tenant_id: member.tenantId, status: answer.status, place: target.place });
  throw new AppError("internal", BRING_IN_NOT_STARTED);
}
