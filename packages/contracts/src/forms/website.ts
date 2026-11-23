/**
 * A form on the business's own website (the Forms plan, F4 and 3.11; Ruben's call 15): the hosted form inside their
 * page, in a frame, on an address of its own (/f/<code>, the website link's code) that knows no session and names the
 * sites it may be framed on. The lines an owner pastes hold no key: the frame, a plain link to the form for a browser
 * that shows no frame, and a small script that fits the frame to the form. Each is optional to the others: with scripts
 * blocked the frame keeps its height and scrolls inside, and with frames blocked the link shows.
 *
 * A site is kept as a host without its www. (leads websiteHostOf, the one reading of a website's address), so
 * "https://www.Luma-Salon.com/book" is luma-salon.com. Pure.
 */

/** How many sites one form may show on (links_sites_check). */
export const FORM_SITES_MAX = 10;

/** The height a frame keeps where the script that fits it does not run. */
const FRAME_HEIGHT_PX = 760;

/** The framed address of a website's link: the form, as a site's frame shows it. */
export const formFramePath = (code: string): string => `/f/${code}`;

/** The small script that fits a frame to its form, at the app's own address. */
const FORM_FIT_PATH = "/f/fit.js";

/**
 * Who may show the framed form, as its content policy names them: each site and its www., over https. None at all
 * where no site is listed, so a pasted frame with no site shows nothing anywhere.
 */
export function frameAncestorsOf(sites: readonly string[]): string[] {
  const named = sites.flatMap((site) => [`https://${site}`, `https://www.${site}`]);
  return named.length > 0 ? named : ["'none'"];
}

/** Whether an entry's site (contracts sourceFromSeen: a host without its www.) is one listed site, or a part of it. */
export const isOnSite = (entrySite: string | null | undefined, site: string): boolean =>
  !!entrySite && (entrySite === site || entrySite.endsWith(`.${site}`));

/** A value as it may stand inside an attribute or a tag of the pasted lines. */
const pasted = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The lines an owner pastes where the form should show: the frame, a plain link to the form (its website link, so an
 * entry through it still counts as from the website) for a browser that shows no frame, and the script that fits the
 * frame. `origin` is the app's own; `title` the form's heading, read aloud for the frame; `linkWords` the link's words.
 */
export function websiteLinesOf(at: { origin: string; code: string; title: string; linkWords: string }): string {
  const origin = at.origin.replace(/\/+$/, "");
  return [
    `<iframe src="${pasted(`${origin}${formFramePath(at.code)}`)}" title="${pasted(at.title)}" style="width:100%;height:${FRAME_HEIGHT_PX}px;border:0"></iframe>`,
    `<a href="${pasted(`${origin}/l/${at.code}`)}" data-chanlytics-form>${pasted(at.linkWords)}</a>`,
    `<script src="${pasted(`${origin}${FORM_FIT_PATH}`)}" async></script>`,
  ].join("\n");
}
