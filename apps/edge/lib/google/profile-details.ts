/**
 * A connected location read for its details (decision 0073, R17), as it is bound: its hours and days closed, phone,
 * website, kinds, words and services with their prices (channels readLocationDetails). The hours, the number, the
 * website and the kind go where the public listing's do (google_listings.facts: Check offers them as Google's, as it
 * always has, now the owner's own listing's); the services, the days closed and the words go to what Check offers beside
 * them (business_reads, source google_profile), each kept only on the owner's tap, a price with its service. Its
 * website is read too (website-read.ts). A read that fails is logged and costs only these offers: the connection stands.
 */
import { readLocationDetails, type GbpLocationDetails, type PlacesHttp } from "@chanlytics/channels/google";
import { listingFactsOf, normalizePhone } from "@chanlytics/contracts";
import { keepBusinessRead, findListingFactsStored, patchListing } from "@chanlytics/db/imports";
import { type Json } from "@chanlytics/db/types";
import { errField, logger } from "../shared/log.js";
import { http } from "../shared/google/places.js";
import { tokenFor } from "../shared/google/credentials.js";
import type { ConnectionRow, Db } from "../shared/google/rows.js";
import { scheduleWebsiteRead } from "../imports/website-read.js";

/** The listing's facts with what the owner's own listing says, where it says it; everything else as it was. */
function factsWith(stored: unknown, gbpLocationDetails: GbpLocationDetails): Json {
  const was = listingFactsOf(stored);
  const phone = gbpLocationDetails.phone ? normalizePhone(gbpLocationDetails.phone) : null;
  const website = gbpLocationDetails.website ?? was?.website ?? null;
  // Google's week as the listing keeps it: each period written out, a plain object the column takes.
  const week = gbpLocationDetails.hours
    ? gbpLocationDetails.hours.map((h) => ({ open: { ...h.open }, close: h.close ? { ...h.close } : null }))
    : null;
  return {
    ...(was ?? {}),
    hours: week ?? was?.hours ?? null,
    phone_e164: phone ?? was?.phone_e164 ?? null,
    phone_display: gbpLocationDetails.phone ?? was?.phone_display ?? null,
    website,
    primary_type: was?.primary_type ?? null,
    primary_type_label: gbpLocationDetails.category ?? was?.primary_type_label ?? null,
    service_area_only: was?.service_area_only ?? false,
    time_zone: was?.time_zone ?? null,
  };
}

export async function readProfileDetails(
  db: Db,
  conn: ConnectionRow,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<void> {
  const log = logger({ tenant_id: conn.tenant_id });
  if (!conn.location_name) return;
  try {
    const token = await tokenFor(db, conn.tenant_id, now.getTime(), net);
    if (!token.ok) return;
    const locationDetails = await readLocationDetails(net, token.token, conn.location_name);
    const stored = await findListingFactsStored(db, conn.tenant_id);
    if (stored !== null) await patchListing(db, conn.tenant_id, { facts: factsWith(stored, locationDetails) });
    await keepBusinessRead(db, {
      tenantId: conn.tenant_id,
      source: "google_profile",
      facts: {
        services: locationDetails.services.map((s) => ({ name: s.name, price_note: s.price_note, duration_min: null })),
        closed: locationDetails.closed,
        rules: [],
        answers: [],
        description: locationDetails.description,
        categories: locationDetails.categories,
      },
      readFrom: conn.location_name,
      error: null,
    });
    await scheduleWebsiteRead(db, conn.tenant_id, locationDetails.website);
  } catch (e) {
    log.warn("google_profile_details_failed", { error: errField(e) });
  }
}
