import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@chanlytics/db";
import { AppError } from "@chanlytics/contracts";
import { deployment } from "../deployment";
import { callEdge, edgeAnswered, edgeConfigured } from "../edge";
import { serviceDb } from "../service-db";

/**
 * A partner hands a workspace to its owner (decision 0016): the half of it the database cannot do, which is telling
 * the owner. Every write is a function that checks the caller (00214); this file only maps their refusals and sends
 * the invitation.
 */

/** How long the edge is given to write to the new owner before the partner is told it did not go. */
const HANDOVER_MAIL_TIMEOUT_MS = 8000;

/** The Postgres codes the handover functions raise deliberately, and what each is on the wire. */
const REFUSALS: Record<string, (message: string) => AppError> = {
  "28000": (m) => new AppError("unauthorized", m, 401),
  "42501": (m) => new AppError("forbidden", m, 403),
  "22023": (m) => new AppError("validation", m, 400),
  P0002: (m) => new AppError("not_found", m, 404),
  "55000": (m) => new AppError("conflict", m, 409),
  "54000": (m) => new AppError("conflict", m, 409),
};

/** A handover function's refusal, in its own words; anything else is a failure, not an answer. */
export function handoverRefusal(r: { code: string; message: string }): Error {
  const make = REFUSALS[r.code];
  return make ? make(r.message) : new Error(r.message);
}

/** How the invitation is sent: injected by a test, the platform's own otherwise. */
interface HandoverMailPorts {
  svc?: SupabaseClient<Database>;
  fetch?: typeof fetch;
  live?: boolean;
}

/**
 * Tell the owner a workspace waits for them. A new address gets the platform's own invitation, as a teammate's does,
 * and comes back signed in; an address with an account gets the edge's letter (handover-invite), since the platform
 * sends nothing to an account that exists. The partner is answered the same either way: whether an address has an
 * account is its owner's to know. Never throws: the handover is on record, and a send that failed can be sent again.
 */
export async function sendHandoverInvite(
  tenantId: string,
  email: string,
  ports: HandoverMailPorts = {},
): Promise<boolean> {
  const svc = ports.svc ?? serviceDb();
  try {
    const { data: existing, error } = await svc.rpc("lookup_user_for_invite", {
      p_tenant_id: tenantId,
      p_email: email,
    });
    if (error) throw new Error(error.message);
    if (!existing) {
      const { error: mailErr } = await svc.auth.admin.inviteUserByEmail(email);
      if (!mailErr) return true;
      // Made between the lookup and the invitation: the account exists now, so the edge writes instead.
      if (!/already (been )?registered|already exists/i.test(mailErr.message)) throw new Error(mailErr.message);
    }
    if (!(ports.live ?? deployment.providersLive) || !edgeConfigured()) return false;
    const r = await callEdge(
      "/api/admin/handover-invite",
      { tenant_id: tenantId },
      { workspace: tenantId, timeoutMs: HANDOVER_MAIL_TIMEOUT_MS, fetch: ports.fetch },
    );
    if (!edgeAnswered(r))
      console.error(
        "handover_invite_failed",
        JSON.stringify({ tenant: tenantId, status: r.status, error: r.body?.error }),
      );
    return edgeAnswered(r);
  } catch (e) {
    console.error(
      "handover_invite_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return false;
  }
}
