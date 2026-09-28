import { write, workspace } from "@/server/route";
import { AppError } from "@chanlytics/contracts";
import { edgeGoogle } from "@/server/connections/google";
import { edgeRefusalWords } from "@/server/edge";

/**
 * DELETE /api/v1/google/connection — the Business Profile disconnected: the
 * grant given back to Google, the token gone from Vault, the profile's
 * reviews gone. The public listing stays. Owners only.
 */
export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  handle: async ({ member }) => {
    const a = await edgeGoogle({ op: "disconnect", tenant_id: member.tenantId }, 25_000);
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true)
      throw new AppError("internal", edgeRefusalWords(b) ?? "The connection could not be removed. Try again.", 502);
    return { removed: b.removed === true, revoked: b.revoked === true };
  },
});
