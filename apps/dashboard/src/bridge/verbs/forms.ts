/**
 * A business's forms, read and pressed (00680): Campaigns › Forms' list and a form's sheet, and one request as the
 * Inbox answers it. Each read throws what the client refuses; each press answers as the typed client answers, or null
 * where no answer came at all, and the page reads again either way.
 */
import { FORM_PRESS_WAIT_MS, type FormLinkPress, type FormPress, type FormRequestPress } from "@chanlytics/contracts";
import { api, read } from "@/bridge/api";

/** Campaigns › Forms: every form, the newest first. */
export const readForms = () => read("GET forms");

/** One form's sheet: the form as it is being changed, where it is shared, and its entries. */
export const readFormSheet = (form: string) => read("GET forms/sheet", { query: { form } });

/** One form the business's own website owns (00709): its names, its site, what it brought, and its newest entries. */
export const readSiteFormSheet = (form: string) => read("GET forms/site-sheet", { query: { form } });

/** One request as the Inbox answers it. A refusal is answered, never thrown: a request that is gone is said so. */
export const readFormRequest = (id: string) => api()("GET forms/requests", { query: { id } });

/**
 * A press on Campaigns › Forms. It waits as long as AI may take: a draft that lands after the page gave up would be a
 * form nobody saw arrive.
 */
export const sendFormPress = (body: FormPress) =>
  api()("POST forms", { body, timeoutMs: FORM_PRESS_WAIT_MS }).catch(() => null);

/** A press on one place a form is shared. */
export const sendFormLinkPress = (body: FormLinkPress) => api()("POST forms/links", { body }).catch(() => null);

/**
 * A press on one request. A reply is sent once however often Send is pressed (the client's own key, decision 0035);
 * the other presses say where the request stands and are safe to press twice.
 */
export const sendFormRequestPress = (body: FormRequestPress) =>
  api()("POST forms/requests", { body, once: body.act === "reply" }).catch(() => null);
