import "server-only";
import { z } from "zod";
import { AppError, IMPORT_SOURCES, IMPORT_STOPPED_WORDS } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "../edge";
import { log } from "../log";

/**
 * Try again on a source of the imports ledger that stopped (decision 0073, R23): the edge starts it again from where it
 * stopped, through the mailbox it was read through (apps/edge/lib/imports/import-again.ts holds the grants). The
 * clients' file is added again from People, never here: its rows are read in the browser.
 */
export const ImportAgainBody = z.object({ source: z.enum(IMPORT_SOURCES) }).strict();

/** How long the edge has to queue it: a few reads and one insert. */
const AGAIN_TIMEOUT_MS = 15_000;

export async function importAgain(
  tenantId: string,
  userId: string,
  input: z.infer<typeof ImportAgainBody>,
): Promise<{ ok: true }> {
  if (input.source === "clients_file") throw new AppError("conflict", IMPORT_STOPPED_WORDS.clientsAgain, 409);
  if (!edgeConfigured()) throw new AppError("conflict", IMPORT_STOPPED_WORDS.failed, 503);
  const a = await callEdge(
    "/api/admin/imports/again",
    { tenant_id: tenantId, user_id: userId, source: input.source },
    { workspace: tenantId, user: userId, timeoutMs: AGAIN_TIMEOUT_MS },
  );
  const b = a.body as { ok?: boolean; detail?: unknown; error?: unknown } | null;
  if (a.status === 200 && b?.ok) return { ok: true };
  log.warn("import_again_failed", {
    tenant_id: tenantId,
    source: input.source,
    status: a.status,
    reason: b?.error ?? null,
  });
  const said = typeof b?.detail === "string" && b.detail ? b.detail : IMPORT_STOPPED_WORDS.failed;
  throw new AppError("conflict", `${said.charAt(0).toUpperCase()}${said.slice(1)}`, a.status === 409 ? 409 : 502);
}
