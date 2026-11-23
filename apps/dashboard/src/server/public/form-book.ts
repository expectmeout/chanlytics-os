import "server-only";

/**
 * /b/<workspace>/<form>/book: "Book on their page" (the Forms plan, F3; Ruben's call 8). A business that offers its own
 * booking page has the form's when question send people there; this counts the open for the form's day and sends them
 * on. An open is a count, never a visitor: no cookie is left, no address is kept, a chat app's preview is not counted
 * (form-link.ts aPersonOpens), and nothing booked on that page is claimed for the form.
 *
 * It lands only on what the workspace owns: its own booking link, as its settings hold it. With none, or an address
 * that is no web address, it lands on the form. Cross-workspace: the address names one workspace and one form.
 */
import { parseTenantConfig } from "@chanlytics/contracts";
import { countFormBookingOpen } from "@chanlytics/db/forms";
import { logAndGoOn } from "@chanlytics/log";
import { findFormPlace } from "./form-page";
import { aPersonOpens } from "./form-link";
import { linkPageDb } from "./link-page";

const away = (location: string) =>
  new Response(null, { status: 302, headers: { location, "cache-control": "no-store", "x-robots-tag": "noindex" } });

/** The business's own booking page, where its settings hold one that is a web address. */
function bookingPageOf(config: unknown): string | null {
  const link = parseTenantConfig(config)?.brain?.booking_link?.trim();
  if (!link) return null;
  try {
    const url = new URL(link);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    // Not a web address: nowhere to send anyone.
    return null;
  }
}

/** GET: the open counted, and the visitor sent on to the business's own booking page. */
export async function sendToBookingPage(slug: string, formSlug: string, request: Request): Promise<Response> {
  const db = linkPageDb();
  if (!db) return new Response(null, { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } });
  const place = await findFormPlace(db, slug, formSlug);
  if (!place)
    return new Response("Nothing is at this address.", { status: 404, headers: { "cache-control": "no-store" } });
  const page = bookingPageOf(place.workspace.config);
  if (!page) return away(place.path);
  // Counted where a person opens it and the form is live; a count that fails never keeps them from the page.
  if (aPersonOpens(request) && place.form.state === "live")
    await countFormBookingOpen(db, place.tenantId, place.form.id).catch(
      logAndGoOn("a form's booking page open", false),
    );
  return away(page);
}
