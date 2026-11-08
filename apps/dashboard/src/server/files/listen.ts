/**
 * Ask's ear (decision 0099, stage B, D19): Claude cannot hear, so a question about how a stretch of a video sounds is put to a
 * model that can, on the edge, which holds its key and the sound kept in the file's folder (api/admin/files/listen). Here is
 * only asking, and it never fails a turn: an ear that cannot be asked is said in words. Its answer is someone else's words, and
 * the tool fences it as data.
 */
import "server-only";
import { SECOND_MS, recordOrNull } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";

/** How long the ear has: a few seconds of listening, inside a turn's patience. */
const LISTEN_MS = 45 * SECOND_MS;

type Heard = { answer: string; model: string } | { wont: string };

/** The ear's answer to Ask's question about a stretch of one video (`from`, `to` in seconds, or the whole clip). */
export async function askEar(
  member: { tenantId: TenantId; userId: string | null },
  question: { id: string; question: string; from: number | null; to: number | null },
  leftMs: number = LISTEN_MS,
): Promise<Heard> {
  if (!edgeConfigured()) return { wont: "no ear can be asked just now" };
  const answer = await callEdge(
    "/api/admin/files/listen",
    { tenant_id: member.tenantId, ...question },
    { workspace: member.tenantId, user: member.userId, timeoutMs: Math.min(LISTEN_MS, Math.max(SECOND_MS, leftMs)) },
  );
  const reply = recordOrNull(answer.body);
  if (answer.status === 200 && typeof reply?.answer === "string" && typeof reply.model === "string")
    return { answer: reply.answer, model: reply.model };
  if (answer.status === 200 && typeof reply?.wont === "string") return { wont: reply.wont };
  log.warn("ask_file_listen_failed", { tenant_id: member.tenantId, status: answer.status });
  return { wont: answer.status === 404 ? "that video is not ready to be heard" : "the ear did not answer just now" };
}
