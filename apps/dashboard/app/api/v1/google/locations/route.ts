import { z } from "zod";
import { read, write, workspace } from "@/server/shared/route";
import { AppError, type GoogleLocationDto } from "@chanlytics/contracts";
import { callEdgeGoogle, readOutcome } from "@/server/connections/google";
import { edgeRefusalWords } from "@/server/shared/edge";

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

const REASONS = {
  not_connected: "Connect a Google account first.",
  no_such_location: "That location is not one this Google account manages. Pick again from the list.",
  not_on_maps: "That location is not on Google Maps yet. Verify it in your Business Profile first.",
  no_credentials: "The connection to Google was lost. Connect again.",
};
const REASON_WORDS: typeof REASONS & Record<string, string> = REASONS;

function locations(raw: unknown): GoogleLocationDto[] {
  return (Array.isArray(raw) ? raw : [])
    .map((line) => {
      const value = (line && typeof line === "object" ? line : {}) as Record<string, unknown>;
      const s = (k: string) => (typeof value[k] === "string" ? value[k] : null);
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
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeGoogle({ op: "locations", tenant_id: member.tenantId, user_id: ctx.userId }, 25_000);
    const body = answer.body ?? {};
    if (answer.status === 404) throw new AppError("not_found", REASON_WORDS.not_connected, 404);
    if (answer.status !== 200 || body.ok !== true)
      throw new AppError(
        "upstream_provider",
        typeof body.error === "string"
          ? (REASON_WORDS[body.error] ?? `Google could not be read: ${edgeRefusalWords(body)}`)
          : "Google could not be read. Try again in a moment.",
      );
    return { locations: locations(body.locations) };
  },
});

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  input: z.object({ account_name: z.string().nullish(), location_name: z.string().nullish() }),
  handle: async ({ ctx, input, member }) => {
    const accountName = (input.account_name ?? "").trim();
    const locationName = (input.location_name ?? "").trim();
    if (!ACCOUNT.test(accountName) || !LOCATION.test(locationName))
      throw new AppError("validation", "Pick a location from the list first.", 400);
    const answer = await callEdgeGoogle(
      {
        op: "choose",
        tenant_id: member.tenantId,
        user_id: ctx.userId,
        account_name: accountName,
        location_name: locationName,
      },
      55_000,
    );
    const result = answer.body ?? {};
    if (answer.status !== 200 || result.ok !== true) {
      const reason = typeof result.error === "string" ? result.error : "failed";
      throw new AppError(
        answer.status === 404 ? "not_found" : "upstream_provider",
        REASON_WORDS[reason] ?? `The location could not be chosen (${edgeRefusalWords(result) ?? reason}).`,
        answer.status === 404 ? 404 : 502,
      );
    }
    return { connection: result.connection ?? null, listing: result.listing ?? null, read: readOutcome(result.read) };
  },
});
