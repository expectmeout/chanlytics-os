import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { callEdgeGoogle } from "@/server/connections/google";

/**
 * POST /api/v1/google/refresh — read the listing now rather than at the
 * next hour. Operators and owners; a few an hour, since each read is a
 * paid call. What was new reaches the bell the same way the sweep's does.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "google_refresh",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeGoogle({ op: "refresh", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const body = answer.body ?? {};
    if (answer.status === 404)
      throw new AppError("not_found", "No listing is linked yet. Find it on Setup first.", 404);
    if (answer.status === 503 && body.error === "no_places_key")
      throw new AppError("conflict", "Reading listings is not available here yet.", 409);
    const read = (body.read && typeof body.read === "object" ? body.read : null) as {
      ok?: boolean;
      fresh?: number;
      counted?: number;
      error?: string;
    } | null;
    if (answer.status !== 200 || body.ok !== true)
      throw new AppError(
        "internal",
        read?.error
          ? `Google could not be read: ${read.error}`
          : "Google could not be read. It will be tried again within the hour.",
        502,
      );
    return { listing: body.listing ?? null, fresh: read?.fresh ?? 0, counted: read?.counted ?? 0 };
  },
});
