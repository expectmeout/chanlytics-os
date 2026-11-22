import "server-only";

/**
 * The forms a business has live, for its own public page (00680; the Forms canvas's call 10: "the business page lists
 * its live forms"): each by its heading, at its address under the page. Read with the service role, as the page's
 * other facts are, and it shows nothing a visitor could not open: a draft and a form turned off are not listed.
 *
 * A list that could not be read is no list: the page is the business's own, vetted as it stands, and is never failed
 * for a line it can do without.
 */
import { formPagePath, heldTenantId } from "@chanlytics/contracts";
import { listLiveForms } from "@chanlytics/db/forms";
import { log } from "../shared/log";
import { serviceDb } from "../shared/service-db";
import { publicFactsFor } from "./facts";

/** A live form as the business's page links it. */
interface LiveFormLink {
  href: string;
  heading: string;
}

export async function findLiveFormLinks(slug: string): Promise<LiveFormLink[]> {
  try {
    const workspace = await publicFactsFor(slug);
    if (!workspace) return [];
    const forms = await listLiveForms(serviceDb(), heldTenantId(workspace.id));
    return forms.map((form) => ({ href: formPagePath(workspace.slug, form.slug), heading: form.heading }));
  } catch (e) {
    log.error("form_link_failed", { error: String(e).slice(0, 300) });
    return [];
  }
}
