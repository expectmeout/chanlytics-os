/**
 * The copies Ask reads pictures by (decision 0099, step 2). The edge holds the model's key, so it makes them
 * (apps/edge/lib/files/copies.ts); here is only asking, and it never fails a turn: a picture that can't be had is said in words.
 */
import "server-only";
import { SECOND_MS, recordOrNull } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "@/server/shared/edge";
import { log } from "@/server/shared/log";

/** How long the edge has for a few copies: a resize and an upload each, where the look's copy has run out. */
const COPIES_MS = 25 * SECOND_MS;

/** What a request sends a picture by, by the file it is of. A file left out has no copy to send. */
export async function fileCopiesOf(
  who: { tenantId: string; userId: string | null },
  ids: readonly string[],
  leftMs: number = COPIES_MS,
): Promise<ReadonlyMap<string, string>> {
  const none = new Map<string, string>();
  if (ids.length === 0 || !edgeConfigured()) return none;
  const answer = await callEdge(
    "/api/admin/files/copies",
    { tenant_id: who.tenantId, ids },
    { workspace: who.tenantId, user: who.userId, timeoutMs: Math.min(COPIES_MS, Math.max(SECOND_MS, leftMs)) },
  );
  const copies = recordOrNull(answer.body)?.copies;
  if (answer.status !== 200 || !Array.isArray(copies)) {
    log.warn("ask_file_copies_failed", { tenant_id: who.tenantId, status: answer.status });
    return none;
  }
  const out = new Map<string, string>();
  for (const c of copies) {
    const row = recordOrNull(c);
    if (typeof row?.id === "string" && typeof row.file_id === "string") out.set(row.id, row.file_id);
  }
  return out;
}
