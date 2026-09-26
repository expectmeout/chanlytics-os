/**
 * The probe of the unsubscribe links (Reach out, Part 2.6): run by the domains sweep, with no clock of its own.
 *
 * Every cold email carries a link the edge seals under UNSUBSCRIBE_SECRET, and the dashboard's page (/u/<token>) opens
 * it under the same secret, or the one before it while a rotation settles. Set differently on the two projects, every
 * link in every inbox says "This link doesn't work" and every one-click stop is refused: the way out the law requires
 * is shut, and nothing else says so. So the sweep seals a link the way a send would and opens it the way a mail client
 * would, and the page says which view it drew (contracts UNSUBSCRIBE_PAGE_HEADER):
 *
 *   200 "ask"           the link opens.
 *   404 "bad_link"      the page holds no key that made it: the two projects' keys differ. Paged.
 *   503 "unavailable"   the page cannot open any link: no key, or no database. Paged.
 *   a redirect          a mail client's one click does not follow one, so that stop is lost. Paged.
 *   anything else       not the page answering (the platform's 404 or 503, a firewall, no answer): asked once more,
 *                       and paged as unreachable only when the second answer is no better. One slow second is not a
 *                       broken door, and a 404 that is not the page's says nothing about the keys.
 *
 * The probe's link names nobody (its workspace, person and email are the nil uuid), and a GET records nothing: the
 * page's own rule, because link scanners open every URL in an email. Without the edge's own key nothing is sealed, so
 * nothing is probed.
 */
import { signUnsubscribeToken, unsubscribeUrl } from "../packages/channels.js";
import { UNSUBSCRIBE_PAGE_HEADER } from "../packages/contracts.js";
import { errField, type Logger } from "../log.js";

export const UNSUBSCRIBE_PROBE_PAGE = "email_unsubscribe_links_broken";
/** How long each ask waits. Both asks and the pause between them count in the sweep's time budget. */
export const PROBE_TIMEOUT_MS = 4_000;
export const PROBE_RETRY_AFTER_MS = 1_000;
const NOBODY = "00000000-0000-0000-0000-000000000000";

export type ProbeOutcome = "no_secret" | "opens" | "key_differs" | "page_cannot_open" | "redirects" | "unreachable";

export interface ProbePorts {
  /** The edge's UNSUBSCRIBE_SECRET; null when unset. */
  secret: string | null;
  /** The dashboard's origin, as the links name it (dashboard-origin.ts). */
  origin: string;
  log: Logger;
  /** The platform's pager (ops/page-operator.ts). */
  page: (key: string, subject: string, body: string) => Promise<unknown>;
}

/** One ask: the page's own answer, or what came back instead ("no answer" when nothing did). */
type Answer = { outcome: Exclude<ProbeOutcome, "no_secret" | "unreachable">; status: number } | { seen: string };

async function ask(url: string, log: Logger): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  } catch (e) {
    log.warn("unsubscribe_probe_unreadable", { error: errField(e) });
    return { seen: "no answer" };
  }
  await res.body?.cancel().catch(() => {});
  const { status } = res;
  const view = res.headers.get(UNSUBSCRIBE_PAGE_HEADER);
  if (status >= 300 && status < 400) return { outcome: "redirects", status };
  if (status === 200 && view === "ask") return { outcome: "opens", status };
  if (status === 404 && view === "bad_link") return { outcome: "key_differs", status };
  if (status === 503 && view === "unavailable") return { outcome: "page_cannot_open", status };
  const seen = view ? `${status} (${view})` : String(status);
  log.warn("unsubscribe_probe_unreadable", { status: seen });
  return { seen };
}

/** What went wrong, in the words the platform reads. `at` is where the links go, never the probe's own link. */
function wordsFor(outcome: Exclude<ProbeOutcome, "no_secret" | "opens">, at: string, seen: string): string {
  if (outcome === "key_differs")
    return (
      `A link sealed the way a cold email's is was refused by the unsubscribe page (${at}): it says "This link ` +
      `doesn't work". UNSUBSCRIBE_SECRET is not the same on the edge and the dashboard.\n\n` +
      `Set the same value on both. To rotate it, move the dashboard's current value to UNSUBSCRIBE_SECRET_PREVIOUS ` +
      `and deploy the dashboard first, then give the edge the new one.`
    );
  if (outcome === "page_cannot_open")
    return (
      `The unsubscribe page (${at}) says it cannot open any link: the dashboard has no UNSUBSCRIBE_SECRET, or cannot ` +
      `reach its database. Give it the edge's value.`
    );
  if (outcome === "redirects")
    return (
      `The unsubscribe page (${at}) answered ${seen}, a redirect. A mail client's one click does not follow one, so ` +
      `that stop is lost. DASHBOARD_ORIGIN on the edge must be the dashboard's own address.`
    );
  return (
    `The unsubscribe page (${at}) did not answer as the page, twice in a row: ${seen}. A person opening a cold ` +
    `email's link now may not reach it. Check that the dashboard is up, and that DASHBOARD_ORIGIN on the edge is its ` +
    `own address.`
  );
}

export async function probeUnsubscribe(p: ProbePorts): Promise<ProbeOutcome> {
  if (!p.secret) return "no_secret";
  const url = unsubscribeUrl(
    p.origin,
    signUnsubscribeToken(p.secret, { tenantId: NOBODY, contactId: NOBODY, messageId: NOBODY }),
  );
  let answer = await ask(url, p.log);
  let seen = "seen" in answer ? answer.seen : "";
  if ("seen" in answer) {
    await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_AFTER_MS));
    answer = await ask(url, p.log);
    if ("seen" in answer) seen = `${seen}, then ${answer.seen}`;
  }
  const outcome: ProbeOutcome = "seen" in answer ? "unreachable" : answer.outcome;
  if (outcome === "opens") return outcome;
  if ("status" in answer) seen = String(answer.status);
  p.log.error("unsubscribe_probe_failed", { outcome, seen });
  await p.page(
    UNSUBSCRIBE_PROBE_PAGE,
    "Cold email: unsubscribe links don't open",
    wordsFor(outcome, unsubscribeUrl(p.origin, ""), seen),
  );
  return outcome;
}
