/**
 * Forms' addresses (00680, 00709; the Forms plan, 3.6): Campaigns › Forms (`campaigns/forms`), a view of Campaigns beside
 * Content, a form's sheet open over it on one of its three parts (`campaigns/forms:<form id>[:next|share]`), a form
 * owned by the business's own website on one of its own (`campaigns/forms:site:<form id>[:next|site]`), the website
 * connection (`campaigns/forms:website`), and a request where it is answered, in Inbox (`inbox/rq-<entry id>`, as
 * `th-<id>` names a conversation).
 *
 * A module of its own and small: the frame's route chunk and the record's one address read it, so nothing of the pages
 * (their words, a form's shape) may ride in here.
 */
import { UUID } from "../shared/identity";

/** The route the Forms view is spelled as. */
export const FORMS_ROUTE = "campaigns/forms";

/** Whether a param of `campaigns` is the Forms view's: `forms`, or `forms:` and more. */
export const isFormsParam = (param: string | null | undefined): boolean => !!param && /^forms(:|$)/.test(param);

/**
 * A form's sheet in its three parts: the form as a visitor sees it (a site's: what Chanlytics receives from it), what
 * happens next, and where it is shared (a form made here) or where it comes from (a site's, `site`).
 */
const FORM_PARTS = ["form", "next", "share", "site"] as const;
export type FormPart = (typeof FORM_PARTS)[number];

/**
 * Where Forms stands: the form whose sheet is open, and on which part; whether it is a form owned by the business's own
 * website (`site`), and whether the website connection is open over the list (`website`).
 */
export interface FormsPlace {
  form: string | null;
  part: FormPart;
  site?: boolean;
  website?: boolean;
}

const isFormPart = (word: string): word is FormPart => FORM_PARTS.some((part) => part === word);

/**
 * A param of `campaigns` read as Forms' place: `forms`, then a form's id, then the part of its sheet. Null for a param
 * that is not Forms'; a word it does not know is the list.
 */
export function formsPlaceOf(param: string | null | undefined): FormsPlace | null {
  if (!param || !isFormsParam(param)) return null;
  const words = param.split(":").slice(1);
  if (words[0] === "website") return { form: null, part: "form", website: true };
  const site = words[0] === "site";
  const [id = "", part = ""] = site ? words.slice(1) : words;
  if (!UUID.test(id)) return { form: null, part: "form" };
  // A part the form's kind has not (a site's form is shared nowhere, a form made here comes from no site) is its first.
  const known = isFormPart(part) && part !== (site ? "share" : "site") ? part : "form";
  return site ? { form: id, part: known, site: true } : { form: id, part: known };
}

/**
 * Forms' address for a place: the list, the website connection, or a form's sheet on a part (the first part is the
 * address with none), a site's form under `site:`.
 */
export function formsRouteOf(place: Partial<FormsPlace> = {}): string {
  if (place.website) return `${FORMS_ROUTE}:website`;
  if (!place.form) return FORMS_ROUTE;
  const part = place.part && place.part !== "form" ? `:${place.part}` : "";
  return `${FORMS_ROUTE}:${place.site ? "site:" : ""}${place.form}${part}`;
}

/** A form's own public address under its business's page (`/b/<workspace>/<form>`), without its site. */
export const formPagePath = (workspaceSlug: string, formSlug: string): string => `/b/${workspaceSlug}/${formSlug}`;

/**
 * The same address as its owner's Test opens it: marked a test. The page believes the mark only from a signed-in member
 * of that workspace; from anyone else it is a visitor's own request. Without the mark an owner's test is a request like
 * any other, which rang the bell and was counted until 22 November 2026.
 */
export const formTestPath = (workspaceSlug: string, formSlug: string): string =>
  `${formPagePath(workspaceSlug, formSlug)}?test=1`;

/** A request's own address in Inbox: where its bell row opens, and where it is answered. */
export const requestAddress = (entryId: string): string => `inbox/rq-${entryId}`;

/** The request an Inbox address names (`rq-<id>`), or null for any other address. */
export function requestIdOf(address: string): string | null {
  const id = address.startsWith("rq-") ? address.slice(3) : "";
  return UUID.test(id) ? id : null;
}
