/**
 * The account door's `place` op: the places Meta keys by a name, for an ad shown wider than the circle around a
 * business (a city, a state or region, the whole country; the Ads plan's 4.6 and G8, as Ruben settled them on
 * 20 November 2026). New ad asks it when the owner tells AI to widen the area, and when it proposes a city for a
 * business that goes to its customers, so a draft names only a place Meta has said it knows: nothing is refused later.
 *
 * A read with the business's own sign-in, sent once, and nothing kept: the dashboard picks the one meant
 * (server/ads/area.ts) and holds it on the draft. Any member who may draft asks it, since it changes nothing and spends
 * nothing; the route in front of it is the member's check. An account that is not connected, or a search Meta does not
 * answer, finds nothing, and the draft keeps its area.
 */
import { callMetaAds, metaPlacesRequest, parseMetaPlaces, type MetaPlaceKind } from "@chanlytics/channels/ads";
import { recordOrEmpty, type TenantId } from "@chanlytics/contracts";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";

const PLACE_KINDS: readonly MetaPlaceKind[] = ["city", "region", "country"];
const QUERY_MAX = 120;

/** The connected account a search is asked with, and the business's sign-in for it; null where none is connected. */
interface PlaceReach {
  tenantId: TenantId;
  accountId: string;
  signIn: { token: string; appSecret: string };
}

/** `place`: Meta's places of a kind by a name, best first; none where nothing can be asked. */
export async function findMetaPlaces(reach: PlaceReach | null, place: unknown): Promise<Response> {
  const wanted = recordOrEmpty(place);
  const kind = PLACE_KINDS.find((one) => one === wanted.kind);
  const query = typeof wanted.query === "string" ? wanted.query.trim() : "";
  if (!kind || !query || query.length > QUERY_MAX) return refuse(400, "bad_request", "place.kind and place.query");
  if (!reach) return json(200, { ok: true, outcome: "not_connected", places: [] });
  const { signIn } = reach;
  const answer = await callMetaAds(metaPlacesRequest(signIn.token, signIn.appSecret, { kind, query }));
  if (answer.fault !== null) {
    logger({ tenant_id: reach.tenantId, account_id: reach.accountId }).info("ads_meta_refused", {
      at: "places",
      fault: answer.fault,
      status: answer.status,
      said: answer.said,
    });
    return json(200, { ok: true, outcome: "unanswered", places: [] });
  }
  const places = parseMetaPlaces(answer.json, kind).map((one) => ({
    kind: one.kind,
    key: one.key,
    name: one.name,
    region: one.region,
    country: one.country,
    country_name: one.countryName,
  }));
  return json(200, { ok: true, outcome: "found", places });
}
