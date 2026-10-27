/**
 * The mailboxes a workspace connected to write its reach-outs from (decision 0056), as the dashboard holds them: the
 * rows a member may read (RLS; never a token's name), the way to the provider's consent screen and back, and the
 * owner's verbs -- pause, resume, settings, a test email, Check, remove -- through the edge's door
 * (apps/edge/api/admin/mailboxes.ts), which holds the OAuth clients' secrets and every token. The one secret used here is
 * the dashboard's own, the key that signs the OAuth state (google.ts stateSecret).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailboxCapacityOf, mailboxConnectionsOf, mailboxCountsOf, type Database } from "@chanlytics/db";
import {
  AppError,
  MAILBOX_DAILY_CAP_MAX,
  MAILBOX_PROVIDERS,
  ROLE_PERMS,
  WEEK_MS,
  appLink,
  mailboxConnectionDtoOf,
  type EdgeErrorCode,
  type GoogleAudience,
  type MailboxConnectionDto,
  type MailboxProvider,
} from "@chanlytics/contracts";
import {
  mailboxAdminConsentUrl,
  mailboxAuthorizeUrl,
  mailboxPkceChallenge,
  mailboxPkceVerifier,
  newNonce,
  signState,
  verifyState,
  STATE_TTL_MS,
} from "@chanlytics/channels";
import { callEdge, edgeConfigured, READY_TTL_MS, type EdgeAnswer } from "../edge";
import { deployment } from "../env";
import { log } from "../log";
import { serviceDbIfConfigured } from "../service-db";
import { memberContext, type RouteContext } from "../with-route";
import type { Member } from "../route";
import { stateSecret } from "./google";

/** The workspace's mailboxes, removed ones aside, oldest first, as the pages are told of them. */
export async function mailboxConnectionsFor(
  db: SupabaseClient<Database>,
  tenantId: string,
): Promise<MailboxConnectionDto[]> {
  return (await mailboxConnectionsOf(db, tenantId)).map((r) => mailboxConnectionDtoOf(r));
}

/**
 * The same, each live one with its day and its health beside it: what it sent in the last day (mailbox_capacity) and
 * what its emails came to since it was counted clean (mailbox_connection_counts), as Connections says them. Both are
 * the service role's to ask; the rows they are asked of are the ones this member's own read returned. A count that
 * cannot be read is left out, never Setup's failure, and a deployment without the service role's keys reads none.
 */
export async function mailboxConnectionsWithDaysFor(
  db: SupabaseClient<Database>,
  tenantId: string,
  now = new Date(),
): Promise<MailboxConnectionDto[]> {
  const rows = await mailboxConnectionsOf(db, tenantId);
  const svc = serviceDbIfConfigured();
  return Promise.all(
    rows.map(async (r) => {
      if (!svc || r.state === "removed" || r.state === "reconnect") return mailboxConnectionDtoOf(r);
      const [day, counts] = await Promise.all([
        mailboxCapacityOf(svc, r.id, now).catch(() => null),
        mailboxCountsOf(svc, r.id, r.counted_since).catch(() => null),
      ]);
      return mailboxConnectionDtoOf(r, { sent_today: day?.sent_today ?? null, counts });
    }),
  );
}

/** One call to the edge's mailboxes door. Never throws: a failure is a status the caller reads. */
export async function edgeMailboxes(body: Record<string, unknown>, timeoutMs = 25_000): Promise<EdgeAnswer> {
  if (!edgeConfigured()) return { status: 503, body: { ok: false, error: "no_edge_credential" } };
  // The deployment gate every provider door keeps: a preview never signs a business's mailbox in, or writes from it.
  if (!deployment.providersLive) return { status: 503, body: { ok: false, error: "preview" } };
  // The door named where it is called: the reads trace (shell/hearing) follows a route into the door by this string.
  return callEdge("/api/admin/mailboxes", body, {
    workspace: typeof body.tenant_id === "string" ? body.tenant_id : null,
    user: typeof body.user_id === "string" ? body.user_id : null,
    timeoutMs,
  });
}

/** Which providers this deployment offers, and the public half of each one's OAuth client. */
interface MailboxReadiness {
  providers: MailboxProvider[];
  oauth: Partial<Record<MailboxProvider, { client_id: string; redirect_uri: string }>>;
  /** Google's consent screen for the app, where Google is offered (the edge's GOOGLE_OAUTH_AUDIENCE). */
  audience: GoogleAudience | null;
  /** The edge passes a connect's PKCE verifier on; until it says so, Google's consent is asked without a challenge. */
  pkce: boolean;
}
const NONE_OFFERED: MailboxReadiness = { providers: [], oauth: {}, audience: null, pkce: false };

let readyCache: { at: number; ready: MailboxReadiness } | null = null;
/** A "none offered" answer is kept briefly: a client set a minute ago must not hide Connect for five. */
const NOT_READY_TTL_MS = 30_000;

const isProvider = (v: unknown): v is MailboxProvider =>
  typeof v === "string" && (MAILBOX_PROVIDERS as readonly string[]).includes(v);

/**
 * The providers a business may connect here, as the edge says (cached per lambda, as lines' and Google's readiness
 * are). An unreachable edge offers none, so nothing draws a Connect that cannot work.
 */
export async function mailboxesReadiness(now = Date.now()): Promise<MailboxReadiness> {
  if (readyCache && now - readyCache.at < (readyCache.ready.providers.length ? READY_TTL_MS : NOT_READY_TTL_MS))
    return readyCache.ready;
  const a = await edgeMailboxes({ op: "readiness" }, 4_000);
  let ready = NONE_OFFERED;
  if (a.status === 200 && a.body?.ok === true) {
    const providers = (Array.isArray(a.body.providers) ? a.body.providers : []).filter(isProvider);
    const raw = (a.body.oauth ?? {}) as Record<string, { client_id?: unknown; redirect_uri?: unknown } | undefined>;
    const oauth: MailboxReadiness["oauth"] = {};
    for (const p of providers) {
      const o = raw[p];
      if (typeof o?.client_id === "string" && typeof o.redirect_uri === "string")
        oauth[p] = { client_id: o.client_id, redirect_uri: o.redirect_uri };
    }
    const audience = a.body.audience;
    ready = {
      providers: providers.filter((p) => oauth[p]),
      oauth,
      audience: audience === "testing" || audience === "unverified" || audience === "verified" ? audience : null,
      pkce: a.body.pkce === true,
    };
  }
  readyCache = { at: now, ready };
  return ready;
}

/** For tests, and for a route that must not read a stale answer. */
export function forgetMailboxesReadiness(): void {
  readyCache = null;
}

/** The settings an owner gives a mailbox, refused by the edge by these words. */
const SETTING_WORDS: Record<string, string> = {
  bad_name: "Give the name people see beside the address, 80 characters at most.",
  bad_signature: "A signature is 1,000 characters at most.",
  bad_cap: `A mailbox sends between 1 and ${MAILBOX_DAILY_CAP_MAX} a day.`,
};

/**
 * The edge's refusals, in the owner's words; the door's own sentence when it gave one. Each case the edge answers is
 * one of its codes (contracts' EdgeErrorCode), so a code it renames or drops stops this compiling; `preview` is this
 * module's own (edgeMailboxes).
 */
function edgeRefusal(a: EdgeAnswer, doing: string): AppError {
  const b = a.body ?? {};
  const error = typeof b.error === "string" ? b.error : "failed";
  const detail = typeof b.detail === "string" && b.detail.trim() ? b.detail.trim() : null;
  switch (error) {
    case "preview":
      return new AppError("upstream_email", "Mailboxes can't be connected or changed from a preview.", 503);
    case "no_oauth_client" satisfies EdgeErrorCode:
      return new AppError("upstream_email", "Connecting a mailbox isn't switched on here yet.", 503);
    case "invalid" satisfies EdgeErrorCode:
      return new AppError("validation", (detail && SETTING_WORDS[detail]) || "That can't be saved.", 400);
    case "not_connected" satisfies EdgeErrorCode:
      return new AppError("conflict", "That mailbox isn't sending, so there is nothing to pause.", 409);
    case "not_paused" satisfies EdgeErrorCode:
      return new AppError("conflict", "That mailbox isn't paused.", 409);
    case "not_held" satisfies EdgeErrorCode:
      return new AppError("conflict", "That mailbox isn't held.", 409);
    case "provider_unauthorized" satisfies EdgeErrorCode:
      return new AppError("conflict", "Its provider signed it out: connect it again.", 409);
    case "provider_refused" satisfies EdgeErrorCode:
      return new AppError(
        "upstream_email",
        `The provider refused the email${detail ? `: ${detail.slice(0, 160)}` : "."}`,
        502,
      );
    case "not_found" satisfies EdgeErrorCode:
      return new AppError("not_found", "That mailbox isn't this workspace's.", 404);
    default:
      return new AppError("internal", `The mailbox could not be ${doing}. Try again in a minute.`, 502);
  }
}

/** The mailbox a door mailboxAnswered with: every verb but remove and test answers `{ mailbox }`. */
function mailboxAnswered(a: EdgeAnswer, doing: string): MailboxConnectionDto {
  if (a.status !== 200 || a.body?.ok !== true) throw edgeRefusal(a, doing);
  const m = a.body.mailbox;
  if (!m || typeof m !== "object") throw new AppError("internal", `The mailbox could not be ${doing}.`, 502);
  return m as MailboxConnectionDto;
}

/** Pause or unpause: its owner's say, whatever its health. */
export async function pauseMailbox(tenantId: string, userId: string, id: string, pause: boolean) {
  const a = await edgeMailboxes({
    op: pause ? "pause" : "unpause",
    tenant_id: tenantId,
    user_id: userId,
    mailbox_id: id,
  });
  return mailboxAnswered(a, pause ? "paused" : "unpaused");
}

/** Resume one its own mail held: sending again, its count started again, its ramp where it was. */
export async function resumeMailbox(tenantId: string, userId: string, id: string) {
  return mailboxAnswered(
    await edgeMailboxes({ op: "resume", tenant_id: tenantId, user_id: userId, mailbox_id: id }),
    "resumed",
  );
}

/** Its domain's records read again, now. */
export async function checkMailbox(tenantId: string, userId: string, id: string) {
  return mailboxAnswered(
    await edgeMailboxes({ op: "check", tenant_id: tenantId, user_id: userId, mailbox_id: id }),
    "checked",
  );
}

/** The name it sends as, its signature, its owner's cap. */
export async function setMailbox(
  tenantId: string,
  userId: string,
  id: string,
  s: { from_name?: string; signature?: string | null; daily_cap?: number },
) {
  return mailboxAnswered(
    await edgeMailboxes({ op: "settings", tenant_id: tenantId, user_id: userId, mailbox_id: id, ...s }),
    "saved",
  );
}

/** An email from it to itself, through its own provider. */
export async function testMailbox(tenantId: string, userId: string, id: string): Promise<void> {
  const a = await edgeMailboxes({ op: "test", tenant_id: tenantId, user_id: userId, mailbox_id: id }, 40_000);
  if (a.status !== 200 || a.body?.ok !== true) throw edgeRefusal(a, "tested");
}

/** Removed: its watch ended, its grant given back, its token gone. What it sent stays in its threads. */
export async function removeMailbox(tenantId: string, userId: string, id: string): Promise<void> {
  const a = await edgeMailboxes({ op: "remove", tenant_id: tenantId, user_id: userId, mailbox_id: id });
  if (a.status !== 200 || a.body?.ok !== true) throw edgeRefusal(a, "removed");
}

/** Where the browser lands after the provider: Connections, with the outcome in a word the block reads once. */
function afterMailbox(
  origin: string,
  outcome: string,
  why?: string | null,
  to: { slug?: string | null; backTo?: string | null } = {},
): string {
  // The first run's Where it answers asked (decision 0073): back to its tile, the outcome said there.
  const page = to.backTo === "start" ? "start/channels" : "admin/integrations";
  return `${origin}${appLink(to.slug, page, { mailbox: outcome, why: why || null })}`;
}

/**
 * The way to the provider's consent screen, answered as data for the page to follow (so a refusal is said on the page,
 * never as a bare answer the browser lands on): a signed state naming the workspace, the person and the provider. A
 * Reconnect names its mailbox, so the provider is asked for that address (login_hint) and the account that comes back
 * must be its own. `admin` asks instead for the link a Microsoft 365 admin opens to approve Chanlytics for their
 * whole organisation, once, where the tenant lets no member consent alone.
 */
export async function startMailboxConnect(
  ctx: RouteContext,
  member: Member,
  provider: string,
  opts: { mailboxId?: string | null; admin?: boolean; back?: "start" | null } = {},
): Promise<{ url: string }> {
  if (!isProvider(provider)) throw new AppError("validation", "Connect a Google or a Microsoft mailbox.", 400);
  if (opts.admin && provider !== "microsoft")
    throw new AppError("validation", "Only Microsoft 365 asks for an admin's approval.", 400);
  const ready = await mailboxesReadiness();
  const oauth = ready.oauth[provider];
  const secret = stateSecret();
  if (!oauth || !secret) throw new AppError("conflict", "Connecting a mailbox isn't switched on here yet.", 409);
  let loginHint: string | null = null;
  if (opts.mailboxId) {
    const was = (await mailboxConnectionsFor(ctx.supabase, member.tenantId)).find((m) => m.id === opts.mailboxId);
    if (!was || was.provider !== provider) throw new AppError("not_found", "That mailbox isn't this workspace's.", 404);
    loginHint = was.address;
  }
  const nonce = newNonce();
  // Google's consent is asked with PKCE's challenge once the edge passes the verifier on (either deploy order works);
  // the verifier is made again from the nonce at the callback.
  const pkce = provider === "google" && ready.pkce && !opts.admin;
  const state = await signState(secret, {
    t: member.tenantId,
    u: ctx.userId,
    n: nonce,
    exp: Date.now() + (opts.admin ? ADMIN_STATE_TTL_MS : STATE_TTL_MS),
    p: provider,
    ...(opts.mailboxId ? { m: opts.mailboxId } : {}),
    ...(opts.admin ? { a: 1 } : {}),
    ...(opts.back === "start" ? { b: "start" } : {}),
    ...(pkce ? { k: 1 } : {}),
  });
  const cfg = { clientId: oauth.client_id, redirectUri: oauth.redirect_uri };
  if (opts.admin) return { url: mailboxAdminConsentUrl(cfg, state) };
  const challenge = pkce ? await mailboxPkceChallenge(await mailboxPkceVerifier(secret, nonce)) : null;
  return { url: mailboxAuthorizeUrl(provider, cfg, state, { loginHint, challenge }) };
}

/** How long an admin's link lasts: it is sent to someone else, who opens it when they can. */
const ADMIN_STATE_TTL_MS = WEEK_MS;

/** Microsoft's words for a sign-in that waits on an admin (AADSTS: consent the tenant keeps to its admins). */
const NEEDS_ADMIN = /AADSTS(65001|90093|90094|90095|900941|900981)\b/;

/**
 * Back from the provider with a code and the state. Nothing is trusted until the state proves itself (signed with the
 * dashboard's key, unexpired, naming the person signed in now and a mailbox provider); then the code goes to the edge,
 * which holds the client secret and does the exchange. Every outcome is a redirect to Connections with one word.
 */
export async function mailboxCallback(ctx: RouteContext, req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  let slug: string | null = null;
  let backTo: string | null = null;
  const back = (outcome: string, why?: string | null) =>
    new Response(null, { status: 302, headers: { location: afterMailbox(origin, outcome, why, { slug, backTo }) } });

  const refused = url.searchParams.get("error");
  // A Microsoft 365 admin back from approving Chanlytics for their organisation (Entra's v2 admin consent): its answer
  // carries admin_consent whether it was approved or not, and the error when it was not.
  const fromAdmin = url.searchParams.has("admin_consent");
  if (refused) {
    if (fromAdmin) return back("error", "admin_consent");
    if (NEEDS_ADMIN.test(url.searchParams.get("error_description") ?? "")) return back("error", "admin_consent");
    return back("error", refused === "access_denied" || refused === "consent_required" ? "declined" : "failed");
  }
  const secret = stateSecret();
  if (!secret) return back("error", "not_available");
  const proof = await verifyState(secret, url.searchParams.get("state"), Date.now());
  if (!proof.ok) return back("error", "failed");
  backTo = proof.state.b === "start" ? "start" : null;
  if (proof.state.u !== ctx.userId || !isProvider(proof.state.p)) return back("error", "failed");
  const provider = proof.state.p;

  let tenantId: string;
  try {
    const member = await memberContext(ctx, proof.state.t);
    slug = member.slug ?? null;
    // Whoever GET mailbox-connections/connect admitted (its policy: the partner rung and up), by the one table.
    if (!ROLE_PERMS[member.role]?.settings) return back("error", "not_owner");
    tenantId = member.tenantId;
  } catch {
    return back("error", "failed");
  }
  if (fromAdmin) return back("admin_approved");
  // An admin's link answers with admin_consent, never with a code: one that comes back without it went wrong.
  if (proof.state.a === 1) return back("error", "failed");
  const code = url.searchParams.get("code") ?? "";
  if (!code) return back("error", "failed");

  const a = await edgeMailboxes(
    {
      op: "connect",
      tenant_id: tenantId,
      user_id: ctx.userId,
      provider,
      code,
      ...(proof.state.k === 1 ? { code_verifier: await mailboxPkceVerifier(secret, proof.state.n) } : {}),
      ...(proof.state.m ? { mailbox_id: proof.state.m } : {}),
    },
    55_000,
  );
  const b = a.body ?? {};
  if (a.status !== 200 || b.ok !== true) {
    const reason = typeof b.reason === "string" ? b.reason : typeof b.error === "string" ? b.error : `edge_${a.status}`;
    log.warn("mailbox_connect_failed", { tenant_id: tenantId, provider, reason });
    return back("error", reason === "no_oauth_client" ? "not_available" : reason);
  }
  return back(b.made === false ? "reconnected" : "connected");
}
