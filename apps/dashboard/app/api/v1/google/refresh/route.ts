import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { edgeGoogle } from "@/server/google";

/**
 * POST /api/v1/google/refresh — read the listing now rather than at the
 * next hour. Operators and owners; a few an hour, since each read is a
 * paid call. What was new reaches the bell the same way the sweep's does.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "google_refresh",
  handle: async ({ member }) => {
    const a = await edgeGoogle({ op: "refresh", tenant_id: member.tenantId }, 25_000);
    const b = a.body ?? {};
    if (a.status === 404) throw new AppError("not_found", "No listing is linked yet. Find it on Setup first.", 404);
    if (a.status === 503 && b.error === "no_places_key") throw new AppError("conflict", "Reading listings is not available here yet.", 409);
    const read = (b.read && typeof b.read === "object" ? b.read : null) as { ok?: boolean; fresh?: number; counted?: number; error?: string } | null;
    if (a.status !== 200 || b.ok !== true) throw new AppError("internal", read?.error ? `Google could not be read: ${read.error}` : "Google could not be read. It will be tried again within the hour.", 502);
    return { listing: b.listing ?? null, fresh: read?.fresh ?? 0, counted: read?.counted ?? 0 };
  },
});
