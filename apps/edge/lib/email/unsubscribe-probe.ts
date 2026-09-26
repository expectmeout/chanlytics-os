/**
 * The probe of the unsubscribe links (Reach out, Part 2.6): run by the domains sweep, with no clock of its own.
 *
 * Every cold email carries a link the edge seals under UNSUBSCRIBE_SECRET, and the dashboard's page (/u/<token>) opens
 * it under the same secret, or the one before it while a rotation settles. Set differently on the two projects, every
 * link in every inbox says "This link doesn't work" and every one-click stop is refused: the way out the law requires
 * is shut, and nothing else says so. So the sweep seals a link the way a send would and opens it the way a mail client
 * would. 200 is a link the page opens; 404 a key the page does not hold; 503 a page that cannot open any link; a
 * redirect, a link a mail client's one click never follows. Each of those pages the platform. No answer, or any other,
 * is logged and asked again next tick: one slow second is not a broken door.
 *
 * The probe's link names nobody (its workspace, person and email are the nil uuid), and a GET records nothing: the
 * page's own rule, because link scanners open every URL in an email. Without the edge's own key nothing is sealed, so
 * nothing is probed.
 */
import { signUnsubscribeToken, unsubscribeUrl } from "../packages/channels.js";
import { errField, type Logger } from "../log.js";

export const UNSUBSCRIBE_PROBE_PAGE = "email_unsubscribe_links_broken";
/** How long the page is waited for. The sweep's time budget counts it. */
export const PROBE_TIMEOUT_MS = 5_000;
const NOBODY = "00000000-0000-0000-0000-000000000000";

export type ProbeOutcome = "no_secret" | "opens" | "key_differs" | "page_cannot_open" | "redirects" | "unreadable";

export interface ProbePorts {
  /** The edge's UNSUBSCRIBE_SECRET; null when unset. */
  secret: string | null;
  /** The dashboard's origin, as the links name it (dashboard-origin.ts). */
  origin: string;
  log: Logger;
  /** The platform's pager (ops/page-operator.ts). */
  page: (key: string, subject: string, body: string) => Promise<unknown>;
}

/** What went wrong, in the words the platform reads, by what the page answered. */
function wordsFor(outcome: Exclude<ProbeOutcome, "no_secret" | "opens" | "unreadable">, at: string, status: number) {
  if (outcome === "key_differs")
    return (
      `A link sealed the way a cold email's is was refused by the unsubscribe page (${at}): it says "This link ` +
      `doesn't work". UNSUBSCRIBE_SECRET is not the same on the edge and the dashboard.\n\n` +
      `Set the same value on both. To rotate it, move the dashboard's current value to UNSUBSCRIBE_SECRET_PREVIOUS ` +
      `and deploy the dashboard first, then give the edge the new one.`
    );
  if (outcome === "page_cannot_open")
    return (
      `The unsubscribe page (${at}) answered 503: it cannot open any link. The dashboard has no ` +
      `UNSUBSCRIBE_SECRET, or cannot reach its database. Give it the edge's value.`
    );
  return (
    `The unsubscribe page (${at}) answered ${status}, a redirect. A mail client's one click does not follow one, so ` +
    `that stop is lost. DASHBOARD_ORIGIN on the edge must be the dashboard's own address.`
  );
}

export async function probeUnsubscribe(p: ProbePorts): Promise<ProbeOutcome> {
  if (!p.secret) return "no_secret";
  const url = unsubscribeUrl(
    p.origin,
    signUnsubscribeToken(p.secret, { tenantId: NOBODY, contactId: NOBODY, messageId: NOBODY }),
  );
  let status: number;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    status = res.status;
    await res.body?.cancel().catch(() => {});
  } catch (e) {
    p.log.warn("unsubscribe_probe_unreadable", { error: errField(e) });
    return "unreadable";
  }
  const outcome: ProbeOutcome =
    status === 200
      ? "opens"
      : status === 404
        ? "key_differs"
        : status === 503
          ? "page_cannot_open"
          : status >= 300 && status < 400
            ? "redirects"
            : "unreadable";
  if (outcome === "opens") return outcome;
  if (outcome === "unreadable") {
    p.log.warn("unsubscribe_probe_unreadable", { status });
    return outcome;
  }
  // Where the links go, never the probe's own link: a page carries only what the platform acts on.
  const at = unsubscribeUrl(p.origin, "");
  p.log.error("unsubscribe_probe_failed", { outcome, status });
  await p.page(UNSUBSCRIBE_PROBE_PAGE, "Cold email: unsubscribe links don't open", wordsFor(outcome, at, status));
  return outcome;
}
