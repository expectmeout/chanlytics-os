import { write, workspace } from "@/server/route";
import { AppError, parseTenantConfigResult, type GoogleCandidateDto } from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db";
import { edgeGoogle } from "@/server/google";

/**
 * POST /api/v1/google/search — {query?}: what Google finds for the
 * business. Without words of its own the search uses the name and address
 * on record, which is the point: the owner already typed them once. Owners
 * only (linking is theirs); the edge asks Google.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "google_search",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { query?: unknown };
    let query = typeof body.query === "string" ? body.query.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    let fromFacts = false;
    if (!query) {
      const row = await getTenantConfig(ctx.supabase, member.tenantId);
      const parsed = row ? parseTenantConfigResult(row.config) : null;
      const cfg = parsed && parsed.ok ? parsed.config : null;
      const name = cfg?.brain?.business_name?.trim() ?? "";
      const address = cfg?.brain?.profile?.address?.trim() ?? "";
      query = [name, address].filter(Boolean).join(", ");
      fromFacts = true;
    }
    if (query.length < 3) throw new AppError("validation", "Give the business name and where it is, like “Northside Movers, Brooklyn”.", 400);
    const a = await edgeGoogle({ op: "search", query }, 15_000);
    const b = a.body ?? {};
    if (a.status === 503 && b.error === "no_places_key") throw new AppError("conflict", "Finding listings is not available here yet.", 409);
    if (a.status !== 200 || b.ok !== true) {
      // Google's words (a refused key, a disabled API) are for the log; the owner hears that the search did not happen and that we know.
      console.error("google_search_failed", JSON.stringify({ tenant: member.tenantId, status: a.status, error: typeof b.error === "string" ? b.error.slice(0, 300) : null }));
      throw new AppError("internal", "Google could not be searched just now. Try again in a minute; if it keeps failing, Chanlytics has been told.", 502);
    }
    const candidates = (Array.isArray(b.candidates) ? b.candidates : []) as GoogleCandidateDto[];
    return { query, from_facts: fromFacts, candidates: candidates.map((c) => ({ place_id: c.place_id, name: c.name, address: c.address ?? null, maps_uri: c.maps_uri ?? null })) };
  },
});
