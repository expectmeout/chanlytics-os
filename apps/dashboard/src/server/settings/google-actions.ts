/**
 * What the dashboard's Google routes do (app/api/v1/google): the business as the workspace has it, the way to Google's
 * consent screen, the callback that proves the signed state and hands the code to the edge, the search for a listing
 * and a reply to a review. The edge holds the Places key, the client secret and the token and makes the calls
 * (google.ts is the dashboard's side of that wire); the one secret used here is the dashboard's own, the key that signs
 * the OAuth state. Each route declares who may and how often.
 */
import {
  ROLE_PERMS,
  AppError,
  businessNameOf,
  parseTenantConfigResult,
  placesQueryOf,
  type GoogleDto,
  recordOrEmpty,
} from "@chanlytics/contracts";
import { getGoogleReadiness, afterGoogle, callEdgeGoogle, stateSecret } from "@/server/connections/google";
import { load, readerContext } from "@/server/shared/reader";
import { googleReader } from "@/server/readers/connections";
import { getMemberContext, type RouteContext } from "@/server/shared/with-route";
import { verifyState, authorizeUrl, newNonce, signState, STATE_TTL_MS, cleanReply } from "@chanlytics/channels/google";
import { log } from "@/server/shared/log";
import { requireUuid } from "@/server/shared/request-guards";
import { recordDecision } from "@/server/shared/verbs";
import { findConfigRow } from "@/server/workspace/config-row";
import { getTenantFacts } from "@/server/shared/tenant";
import type { Member, Params } from "@/server/shared/route";

/** `GET google`: Google as the Google reader holds it (once a turn, the Reviews report's too), and what this deployment can do with it. */
export async function readGoogle(ctx: RouteContext, member: Member): Promise<{ google: GoogleDto }> {
  const [held, ready] = await Promise.all([
    load(readerContext(ctx, member), googleReader, undefined),
    getGoogleReadiness(),
  ]);
  return {
    google: { ready: { places: ready.places, profile: ready.profile, audience: ready.audience }, ...held.data },
  };
}

export async function handleGoogleCallback(ctx: RouteContext, req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  // The workspace's address word, once the signed state has proved whose workspace this was and this person is a member of
  // it: the browser returns to that workspace's own page. Until then (a declined consent, a state that does not prove
  // itself, someone else's) there is none to name, and the front door carries the tab to the last workspace it used.
  let slug: string | null = null;
  let backTo: string | null = null;
  const back = (outcome: string, reason?: string) =>
    new Response(null, { status: 302, headers: { location: afterGoogle(origin, outcome, reason, { slug, backTo }) } });

  const refused = url.searchParams.get("error");
  if (refused) return back("error", refused === "access_denied" ? "declined" : refused.slice(0, 60));
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const proof = await verifyState(secret, url.searchParams.get("state"), Date.now());
  if (!proof.ok) return back("error", `state_${proof.reason}`);
  backTo = proof.state.b === "start" ? "start" : null;
  if (proof.state.u !== ctx.userId) return back("error", "someone_else");
  // A mailbox's connect signs its state with the same key and names its provider: it is never this door's.
  if (proof.state.p) return back("error", "state_malformed");

  // The workspace named at connect time, and this person's standing in it now.
  let tenantId: string;
  try {
    const member = await getMemberContext(ctx, proof.state.t);
    slug = member.slug ?? null;
    // Whoever GET google/connect admitted (its policy: the partner rung and up), by the one table.
    if (!ROLE_PERMS[member.role]?.settings) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "no_workspace");
  }
  // Said inside the workspace: a state that proved itself and a code Google did not send is that business's to read.
  const code = url.searchParams.get("code") ?? "";
  if (!code) return back("error", "no_code");

  const answer = await callEdgeGoogle({ op: "connect", tenant_id: tenantId, user_id: ctx.userId, code }, 55_000);
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true) {
    const reason = typeof body.error === "string" ? body.error : `edge_${answer.status}`;
    log.error("google_connect_failed", {
      tenant_id: tenantId,
      reason,
      detail: typeof body.detail === "string" ? body.detail.slice(0, 200) : null,
    });
    return back("error", reason);
  }
  return back(body.pending === true ? "choose" : "connected");
}

export async function startGoogleConnect(ctx: RouteContext, member: Member, back: "start" | null = null) {
  const ready = await getGoogleReadiness();
  const secret = stateSecret();
  if (!ready.profile || !ready.oauth || !secret)
    throw new AppError("conflict", "Connecting a Business Profile is not available here yet.", 409);
  const state = await signState(secret, {
    t: member.tenantId,
    u: ctx.userId,
    n: newNonce(),
    exp: Date.now() + STATE_TTL_MS,
    // The first run asked (decision 0073, R17): the callback returns there.
    ...(back ? { b: back } : {}),
  });
  const url = authorizeUrl(
    { clientId: ready.oauth.client_id, redirectUri: ready.oauth.redirect_uri },
    state,
    ctx.email ?? null,
  );
  return new Response(null, { status: 302, headers: { location: url } });
}

export async function replyToGoogleReview(ctx: RouteContext & { params: Params }, req: Request, member: Member) {
  const SAID: Record<string, string> = {
    not_connected: "Connect your Business Profile first — replies go through it.",
    not_from_profile: "This review was read from the public listing; replies need the Business Profile connected.",
    no_review: "That review is not on record.",
    no_token: "The connection to Google was lost. Connect again from Connections.",
    google_refused: "Google did not accept the reply.",
  };
  const id = requireUuid(ctx.params.id, "review");
  // A body that is not JSON is none: what reads it next refuses.
  const body = recordOrEmpty(await req.json().catch(() => ({})));
  const comment = cleanReply(body.comment);
  if (!comment) throw new AppError("validation", "Write the reply first.", 400);
  const answer = await callEdgeGoogle(
    { op: "reply", tenant_id: member.tenantId, user_id: ctx.userId, id, comment },
    25_000,
  );
  const result = answer.body ?? {};
  if (answer.status !== 200 || result.ok !== true) {
    const reason = typeof result.error === "string" ? result.error : "failed";
    const sentence = SAID[reason] ?? `The reply did not go through (${reason}).`;
    throw new AppError(
      answer.status === 404 ? "not_found" : answer.status === 409 ? "conflict" : "upstream_provider",
      reason === "google_refused" && typeof result.detail === "string"
        ? `${sentence} ${result.detail.slice(0, 200)}`
        : sentence,
      answer.status === 404 ? 404 : answer.status === 409 ? 409 : 502,
    );
  }
  const repliedAt = typeof result.replied_at === "string" ? result.replied_at : null;
  const replyText = typeof result.reply_text === "string" ? result.reply_text : comment;
  const decisionId = await recordDecision(ctx, member.tenantId, "review", id, "reply_review", {
    comment,
    replied_at: repliedAt,
  });
  return { reply_text: replyText, replied_at: repliedAt, decision_id: decisionId };
}

/**
 * A reply the receptionist holds under Holds it, stopped before it posts (decision 0064, step 6): the edge clears its time,
 * and it waits for an OK as one held under Ask me does. The ledger's line is a stop of a send, about the review. One with
 * no time to clear (already answered, or held for an OK) is no change, and no line.
 */
export async function stopGoogleReviewReply(ctx: RouteContext & { params: Params }, member: Member) {
  const id = requireUuid(ctx.params.id, "review");
  const answer = await callEdgeGoogle({ op: "hold", tenant_id: member.tenantId, user_id: ctx.userId, id }, 15_000);
  const body = answer.body ?? {};
  if (answer.status !== 200 || body.ok !== true)
    throw new AppError(
      answer.status === 404 ? "not_found" : "upstream_provider",
      answer.status === 404 ? "That review is not on record." : "The reply could not be stopped just now. Try again.",
      answer.status === 404 ? 404 : 502,
    );
  const held = body.held === true;
  const decisionId = held
    ? await recordDecision(ctx, member.tenantId, "review", id, "cancel_send", { held: true })
    : null;
  return { held, decision_id: decisionId };
}

export async function searchGoogleFor(ctx: RouteContext, req: Request, member: Member) {
  // A body that is not JSON is none: what reads it next refuses.
  const body = recordOrEmpty(await req.json().catch(() => ({})));
  // A phone number goes whole and with its country, which Google needs to match a listing by its number.
  let query = typeof body.query === "string" ? placesQueryOf(body.query).slice(0, 200) : "";
  let fromFacts = false;
  if (!query) {
    const row = await findConfigRow(ctx.supabase, member.tenantId);
    const parsed = row ? parseTenantConfigResult(row.config) : null;
    const cfg = parsed && parsed.ok ? parsed.config : null;
    // What the business goes by (contracts businessNameOf): the receptionist's name, else the one typed at sign-up,
    // read only when there is no receptionist's name to ask with.
    const own = cfg?.brain?.business_name ?? null;
    const typed = own?.trim() ? null : (await getTenantFacts(ctx.supabase, member.tenantId)).name;
    const name = businessNameOf(own, typed) ?? "";
    const address = cfg?.brain?.profile?.address?.trim() ?? "";
    query = [name, address].filter(Boolean).join(", ");
    fromFacts = true;
  }
  if (query.length < 3)
    throw new AppError("validation", "Give the business name and where it is, like “Northside Movers, Brooklyn”.", 400);
  const answer = await callEdgeGoogle({ op: "search", query }, 15_000);
  const result = answer.body ?? {};
  if (answer.status === 503 && result.error === "no_places_key")
    throw new AppError("conflict", "Finding listings is not available here yet.", 409);
  if (answer.status !== 200 || result.ok !== true) {
    // Google's words (a refused key, a disabled API) are for the log; the owner hears that the search did not happen and that we know.
    log.error("google_search_failed", {
      tenant_id: member.tenantId,
      status: answer.status,
      error: typeof result.error === "string" ? result.error.slice(0, 300) : null,
      detail: typeof result.detail === "string" ? result.detail.slice(0, 300) : null,
    });
    throw new AppError(
      "upstream_provider",
      "Google could not be searched just now. Try again in a minute; if it keeps failing, Chanlytics has been told.",
    );
  }
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];
  return {
    query,
    from_facts: fromFacts,
    candidates: candidates.map((c) => ({
      place_id: c.place_id,
      name: c.name,
      address: c.address ?? null,
      maps_uri: c.maps_uri ?? null,
      // An edge from before the kind of place sends none: either deploy order draws the candidate, without it.
      category: c.category ?? null,
    })),
  };
}
