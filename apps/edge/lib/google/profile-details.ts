/**
 * A connected location read for its details (decision 0073, R17), as it is bound: its hours and days closed, phone,
 * website, kinds, words and services with their prices (channels readLocationDetails). The hours, the number, the
 * website and the kind go where the public listing's do (google_listings.facts: Check offers them as Google's, as it
 * always has, now the owner's own listing's); the services, the days closed and the words go to what Check offers beside
 * them (business_reads, source google_profile), each kept only on the owner's tap, a price with its service. Its
 * website is read too (website-read.ts). A read that fails is logged and costs only these offers: the connection stands.
 */
import { readLocationDetails, type GbpLocationDetails, type PlacesHttp } from "../packages/channels.js";
import { bookingPageKept, listingFactsOf, normalizePhone } from "../packages/contracts.js";
import { keepBusinessRead, listingFactsStored, type Json } from "../packages/db.js";
import { keepListing } from "./listing-check.js";
import { errField, logger } from "../log.js";
import { http } from "./places.js";
import { tokenFor } from "./profile-credentials.js";
import type { ConnectionRow, Db } from "./google-rows.js";
import { scheduleWebsiteRead } from "../imports/website-read.js";

/**
 * The listing's facts with what the owner's own listing says, where it says it; everything else as it was. The booking
 * page the link found stays while the website is the one it was found on (contracts bookingPageKept), as a later read of
 * the public listing keeps it.
 */
function factsWith(stored: unknown, d: GbpLocationDetails): Json {
  const was = listingFactsOf(stored);
  const phone = d.phone ? normalizePhone(d.phone) : null;
  const website = d.website ?? was?.website ?? null;
  // Google's week as the listing keeps it: each period written out, a plain object the column takes.
  const week = d.hours ? d.hours.map((h) => ({ open: { ...h.open }, close: h.close ? { ...h.close } : null })) : null;
  return {
    ...(was ?? {}),
    hours: week ?? was?.hours ?? null,
    phone_e164: phone ?? was?.phone_e164 ?? null,
    phone_display: d.phone ?? was?.phone_display ?? null,
    website,
    primary_type: was?.primary_type ?? null,
    primary_type_label: d.category ?? was?.primary_type_label ?? null,
    service_area_only: was?.service_area_only ?? false,
    time_zone: was?.time_zone ?? null,
    booking_page: bookingPageKept(was, website),
  };
}

export async function readProfileDetails(
  db: Db,
  conn: ConnectionRow,
  now = new Date(),
  net: PlacesHttp = http,
): Promise<void> {
  const L = logger({ tenant_id: conn.tenant_id });
  if (!conn.location_name) return;
  try {
    const t = await tokenFor(db, conn.tenant_id, now.getTime(), net);
    if (!t.ok) return;
    const d = await readLocationDetails(net, t.token, conn.location_name);
    const stored = await listingFactsStored(db, conn.tenant_id);
    if (stored !== null) await keepListing(db, conn.tenant_id, { facts: factsWith(stored, d) });
    await keepBusinessRead(db, {
      tenantId: conn.tenant_id,
      source: "google_profile",
      facts: {
        services: d.services.map((s) => ({ name: s.name, price_note: s.price_note, duration_min: null })),
        closed: d.closed,
        rules: [],
        answers: [],
        description: d.description,
        categories: d.categories,
      },
      readFrom: conn.location_name,
      error: null,
    });
    await scheduleWebsiteRead(db, conn.tenant_id, d.website);
  } catch (e) {
    L.warn("google_profile_details_failed", { error: errField(e) });
  }
}
