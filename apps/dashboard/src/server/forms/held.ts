import "server-only";

/**
 * Whether a hosted form's entry reads as a person's (the Forms plan, 3.2's third step, and 3.10): a field nobody sees was
 * filled, it was sent from somewhere other than the form's own page (F4), faster than a person types, or more came from
 * one sender or to one form than people send. A doubtful entry is HELD with its reason: never dropped, never the bell,
 * and the visitor is told nothing of it. Nothing here is proof, and nothing is trusted as proof; it sorts what reads as
 * a person's from what a member looks at first.
 */
import type { FormHeldWhy } from "@chanlytics/db/forms";
import { takeRate } from "../shared/rate-limit";
import { hashKey, ipOf } from "../shared/request-ip";

/** Faster than this from the page's drawing to its send is no person typing. */
const TOO_FAST_MS = 2_000;

/**
 * Whether a send came from the form's own page: the browser says so (Sec-Fetch-Site), else its Origin is the page's
 * own. A script sends neither, and another site's page says it is another site.
 */
function fromItsPage(request: Request): boolean {
  const fetchedFrom = request.headers.get("sec-fetch-site");
  if (fetchedFrom) return fetchedFrom === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    // An Origin that is no address: not the page's own.
    return false;
  }
}

/** What a send carried that says whether a person sent it: the field nobody sees, and when its page was drawn. */
interface SendSigns {
  hidden: string;
  drawn: string;
}

/** Why an entry is held for a look, or null for one that reads as a person's. */
export async function judgeEntry(
  request: Request,
  signs: SendSigns,
  formId: string,
): Promise<Exclude<FormHeldWhy, "member"> | null> {
  if (signs.hidden) return "hidden_field";
  if (!fromItsPage(request)) return "elsewhere";
  const drawn = Number(signs.drawn);
  if (Number.isFinite(drawn) && drawn > 0 && Date.now() - drawn < TOO_FAST_MS) return "too_fast";
  try {
    await takeRate(`form:${formId}:${hashKey(ipOf(request))}`, "form_sender");
    await takeRate(`form:${formId}`, "form_day");
  } catch {
    // Past a limit: kept for a look, never refused to the visitor.
    return "too_many";
  }
  return null;
}
