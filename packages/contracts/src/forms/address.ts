/**
 * Forms' addresses (00680; the Forms plan, 3.6): Campaigns › Forms (`campaigns/forms`), a view of Campaigns beside
 * Content and Ads, a form's sheet open over it on one of its three parts (`campaigns/forms:<form id>[:next|share]`),
 * and a request where it is answered, in Inbox (`inbox/rq-<entry id>`, as `th-<id>` names a conversation).
 *
 * A module of its own and small: the frame's route chunk and the record's one address read it, so nothing of the pages
 * (their words, a form's shape) may ride in here.
 */
import { UUID } from "../shared/identity";

/** The route the Forms view is spelled as. */
export const FORMS_ROUTE = "campaigns/forms";

/** Whether a param of `campaigns` is the Forms view's: `forms`, or `forms:` and more. */
export const isFormsParam = (param: string | null | undefined): boolean => !!param && /^forms(:|$)/.test(param);

/** A form's sheet in its three parts: the form as a visitor sees it, what happens next, and where it is shared. */
export const FORM_PARTS = ["form", "next", "share"] as const;
export type FormPart = (typeof FORM_PARTS)[number];

/** Where Forms stands: the form whose sheet is open, and on which part. */
export interface FormsPlace {
  form: string | null;
  part: FormPart;
}

const isFormPart = (word: string): word is FormPart => FORM_PARTS.some((part) => part === word);

/**
 * A param of `campaigns` read as Forms' place: `forms`, then a form's id, then the part of its sheet. Null for a param
 * that is not Forms'; a word it does not know is the list.
 */
export function formsPlaceOf(param: string | null | undefined): FormsPlace | null {
  if (!param || !isFormsParam(param)) return null;
  const [, id = "", part = ""] = param.split(":");
  if (!UUID.test(id)) return { form: null, part: "form" };
  return { form: id, part: isFormPart(part) ? part : "form" };
}

/** Forms' address for a place: the list, or a form's sheet on a part (the first part is the address with none). */
export function formsRouteOf(place: Partial<FormsPlace> = {}): string {
  if (!place.form) return FORMS_ROUTE;
  return `${FORMS_ROUTE}:${place.form}${place.part && place.part !== "form" ? `:${place.part}` : ""}`;
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
