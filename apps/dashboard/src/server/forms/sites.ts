import "server-only";

/**
 * The sites a form may show on, framed in their own page (the Forms plan, F4; 00701). The first site makes the form's
 * website link, the one link whose code is the framed address and whose list the address names as its frame's only
 * ancestors; each site after is added to that list, and one removed leaves the rest. A site is a host as an owner
 * types it, read by the one rule for a website's address (contracts websiteHostOf): "https://www.Luma-Salon.com/book"
 * is luma-salon.com. Written under the member's own row rules, as a link is made, renamed and stopped.
 */
import { AppError, FORM_SITES_MAX, websiteHostOf, type FormLinkPress } from "@chanlytics/contracts";
import { keepLink, listFormLinks, makeFormLink } from "@chanlytics/db/forms";
import { findFormOrRefuse } from "../readers/forms";
import type { Member } from "../shared/route";
import type { RouteContext } from "../shared/with-route";

type SitePress = Extract<FormLinkPress, { act: "site_add" | "site_remove" }>;

/** What a press on a website that was removed meanwhile is told. */
const WEBSITE_GONE = "That website isn't here any more.";

/** The website's link among the places a form is shared, in the words every other place is named in. */
const WEBSITE_PLACE = "Your website";

/** A site the form may show on added, the first making its website link; or one removed. */
export async function applySitePress(
  ctx: RouteContext,
  member: Member,
  press: SitePress,
): Promise<{ link_id: string }> {
  const site = websiteHostOf(press.site);
  await findFormOrRefuse({ ctx, tenantId: member.tenantId }, press.form_id);
  const website = (await listFormLinks(ctx.supabase, member.tenantId, press.form_id)).find((one) => one.sites !== null);
  const sites = website?.sites ?? [];
  if (press.act === "site_remove") {
    if (!website) throw new AppError("not_found", WEBSITE_GONE, 404);
    const left = sites.filter((one) => one !== (site ?? press.site.trim().toLowerCase()));
    if (left.length !== sites.length) await keepSites(ctx, member, website.id, left);
    return { link_id: website.id };
  }
  if (!site) throw new AppError("validation", "That isn't a website's address. Type it as yoursalon.com.", 400);
  if (!website) {
    const link = await makeFormLink(ctx.supabase, {
      tenantId: member.tenantId,
      formId: press.form_id,
      place: WEBSITE_PLACE,
      printed: false,
      userId: ctx.userId,
      sites: [site],
    });
    return { link_id: link.id };
  }
  if (sites.includes(site)) return { link_id: website.id };
  if (sites.length >= FORM_SITES_MAX)
    throw new AppError("conflict", `A form can show on ${FORM_SITES_MAX} sites at most. Remove one first.`, 409);
  await keepSites(ctx, member, website.id, [...sites, site]);
  return { link_id: website.id };
}

/** A website link's sites written; a write the row rules refused changes nothing, and is said. */
async function keepSites(ctx: RouteContext, member: Member, linkId: string, sites: string[]): Promise<void> {
  const kept = await keepLink(ctx.supabase, { tenantId: member.tenantId, linkId, sites });
  if (!kept) throw new AppError("not_found", WEBSITE_GONE, 404);
}
