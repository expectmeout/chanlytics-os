import { read, write, workspace } from "@/server/route";
import { AppError, type GoogleLocationDto } from "@chanlytics/contracts";
import { edgeGoogle, readOutcome } from "@/server/connections/google";

/**
 * GET /api/v1/google/locations — the locations the connected Google account
 * may manage, on Maps, for the owner to choose among. Read from Google each
 * time: the choice is proven server-side against the same list.
 *
 * POST /api/v1/google/locations — {account_name, location_name}: this one.
 * The edge binds it as the listing and syncs at once. Owners only.
 */
const ACCOUNT = /^accounts\/[\w-]{1,64}$/;
const LOCATION = /^locations\/[\w-]{1,64}$/;

const SAID: Record<string, string> = {
  not_connected: "Connect a Google account first.",
  no_such_location: "That location is not one this Google account manages. Pick again from the list.",
  not_on_maps: "That location is not on Google Maps yet. Verify it in your Business Profile first.",
  no_credentials: "The connection to Google was lost. Connect again.",
};

function locations(raw: unknown): GoogleLocationDto[] {
  return (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : null);
      return {
        account_name: s("account_name") ?? "",
        account_title: s("account_title") ?? "",
        location_name: s("name") ?? "",
        title: s("title") ?? "",
        address: s("address"),
        place_id: s("place_id"),
        maps_uri: s("maps_uri"),
      };
    })
    .filter((l) => l.account_name && l.location_name);
}

export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "google_search",
  handle: async ({ member }) => {
    const a = await edgeGoogle({ op: "locations", tenant_id: member.tenantId }, 25_000);
    const b = a.body ?? {};
    if (a.status === 404) throw new AppError("not_found", SAID.not_connected, 404);
    if (a.status !== 200 || b.ok !== true)
      throw new AppError(
        "internal",
        typeof b.error === "string"
          ? (SAID[b.error] ?? `Google could not be read: ${b.error}`)
          : "Google could not be read. Try again in a moment.",
        502,
      );
    return { locations: locations(b.locations) };
  },
});

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { account_name?: unknown; location_name?: unknown };
    const accountName = typeof body.account_name === "string" ? body.account_name.trim() : "";
    const locationName = typeof body.location_name === "string" ? body.location_name.trim() : "";
    if (!ACCOUNT.test(accountName) || !LOCATION.test(locationName))
      throw new AppError("validation", "Pick a location from the list first.", 400);
    const a = await edgeGoogle(
      {
        op: "choose",
        tenant_id: member.tenantId,
        user_id: ctx.userId,
        account_name: accountName,
        location_name: locationName,
      },
      55_000,
    );
    const b = a.body ?? {};
    if (a.status !== 200 || b.ok !== true) {
      const reason = typeof b.error === "string" ? b.error : "failed";
      throw new AppError(
        a.status === 404 ? "not_found" : "internal",
        SAID[reason] ?? `The location could not be chosen (${reason}).`,
        a.status === 404 ? 404 : 502,
      );
    }
    return { connection: b.connection ?? null, listing: b.listing ?? null, read: readOutcome(b.read) };
  },
});
