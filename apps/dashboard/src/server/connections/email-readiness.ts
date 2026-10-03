import { callEdge, edgeConfigured, READY_TTL_MS } from "../edge";

/**
 * Whether this deployment's email wire can send a campaign, and whether it can send an OFFER, as the edge says it (apps/edge
 * api/admin/email/wire.ts): `ready` when it holds a mail domain AND the provider's key, `offers` when the campaigns domain is
 * named and the provider says it is verified for sending (lib/email/campaigns-domain.ts). Both are the deployment's: the
 * dashboard may never hold the key, and cannot ask the provider about a domain. The one answer, so a page never offers email
 * that the run, which asks the same functions there, would hold every person for: the dashboard used to count the domain alone.
 *
 * Kept five minutes per lambda (READY_TTL_MS) only while the wire can send AND offers can go, as Google's, billing's and the
 * domains' readiness are: the answer changes when an operator sets a key or publishes a record, not between two page loads
 * (the edge keeps its own answer about the campaigns domain a minute besides). Any no is kept briefly (NOT_READY_TTL_MS),
 * offers included: a record published a minute ago must not hide offers by email for five. An edge that did not answer is not
 * an answer, and the routes that commit a send ask fresh (`fresh`).
 */
interface EmailWire {
  ready: boolean | null;
  offers: boolean | null;
}

let wireCache: { at: number; wire: EmailWire } | null = null;
const NOT_READY_TTL_MS = 30_000;
/** How long the edge has to say: the wire's answer is a read of its own settings and one provider call, so a slow one is no answer. */
const EMAIL_WIRE_TIMEOUT_MS = 4_000;

const COULD_NOT_ASK: EmailWire = { ready: null, offers: null };

/**
 * Each as the edge said it; null where it could not be asked (no credential for it here, unreachable, a refusal, or an answer
 * that is no yes or no): the page then says "This could not be checked just now" and offers nothing, never a guess that it is
 * ready. An edge that answers no `offers` (one deployed before them) says no offers. `fresh` asks the edge now whatever is
 * kept, and keeps the answer: for a caller that must not read a stale one. `now` is the clock (tests', which step it past the
 * minutes).
 */
export async function emailWire(o: { now?: number; fresh?: boolean } = {}): Promise<EmailWire> {
  const now = o.now ?? Date.now();
  if (
    !o.fresh &&
    wireCache &&
    now - wireCache.at <
      (wireCache.wire.ready === true && wireCache.wire.offers === true ? READY_TTL_MS : NOT_READY_TTL_MS)
  )
    return wireCache.wire;
  const wire = await askEdge();
  wireCache = { at: now, wire };
  return wire;
}

async function askEdge(): Promise<EmailWire> {
  if (!edgeConfigured()) return COULD_NOT_ASK;
  // No workspace and no person: the answer is about the deployment (callEdge says so out loud).
  const a = await callEdge(
    "/api/admin/email/wire",
    { op: "status" },
    { workspace: null, user: null, timeoutMs: EMAIL_WIRE_TIMEOUT_MS },
  );
  if (a.status !== 200 || a.body?.ok !== true || typeof a.body.ready !== "boolean") return COULD_NOT_ASK;
  const offers = a.body.offers === true ? true : a.body.offers === null ? null : false;
  return { ready: a.body.ready, offers };
}
