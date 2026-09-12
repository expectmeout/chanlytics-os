import "server-only";
import { timingSafeEqual } from "node:crypto";
import { deployment } from "./deployment";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, type Database } from "@chanlytics/db";
import { PENDING_WORKSPACE_KEY, sendFailureIsOurs, type SignupInput } from "@chanlytics/contracts";

/**
 * Sign-up, the half that knows who exists.
 *
 * This is the second place the dashboard holds the service role (the first
 * is service.ts, for jobs), and it writes no tenant data at all: it creates
 * the auth user, keeps what the form said on that user, and asks Supabase to
 * send the sign-in code with the anon client, exactly as /login does. An
 * address Supabase already has is recognised by its own error and left
 * alone: that person gets a code and signs in to what they have. The caller
 * says the same sentence either way.
 *
 * THE WORKSPACE WAITS FOR ITS OWNER. This used to make it here, with the
 * service role, for an address nobody had proved: a stranger typing someone
 * else's email got that person a workspace named by the stranger, owned by
 * an account they never asked for, provisioned and counted against a cap
 * they never spent -- and the address's real owner, signing up later, was
 * told nothing, sent a code, and signed in to the stranger's choice of name.
 * Now the form's two answers ride on the auth user, and the person who
 * enters the code makes the workspace through the one door every workspace
 * uses (create_workspace, signed in). Nothing exists for an address until
 * its owner does.
 */

import { edgeConfigured, edgeHeaders, edgeUrl } from "./edge";

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

export interface SignupOutcome {
  /** A new person: the user was made this call. Their workspace waits for their first sign-in. */
  created: boolean;
  userId: string | null;
  /**
   * The sign-in code did not go out, and it was OUR doing -- the mail budget, or
   * no mail provider configured. Never set for an address we simply do not know
   * about: that stays opaque.
   */
  codeUnsent: boolean;
}

/**
 * The invite code, compared in constant time. One copy, for the two doors that
 * ask it: the sign-up form, and the first workspace of an account that arrived
 * through a provider (Sign in with Google makes the user before any of ours
 * runs, so its door is the create route).
 */
export function inviteCodeMatches(given: string | undefined | null): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(process.env.SIGNUP_CODE ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Make the account, keep what the form said on it, and send the code that
 * proves the address -- in ONE call, with the PUBLIC key.
 *
 * THE SERVICE ROLE HAS LEFT THIS PATH. It used to create the user with the
 * admin API, mark the address confirmed without a shred of proof, probe
 * Supabase's error text to find out whether the address was already known,
 * and then make a second call to send the code. All four of those existed to
 * work around one setting: email confirmation was off, so nothing else would
 * send a confirmation and nothing else would keep the answer opaque.
 *
 * With confirmation on, `signUp` does the whole job and does it better:
 *   - it will not hand back a session, so an unproved address owns nothing;
 *   - an address we already have comes back OBFUSCATED, by Supabase's own
 *     rule, so the one-sentence-either-way stance is the platform's behaviour
 *     rather than something this file reconstructs from error strings;
 *   - the confirmation code goes out as part of it.
 *
 * The only thing still worth telling the caller is a send WE could not make --
 * the mail budget, or no provider configured. That says nothing about any
 * address, and swallowing it is how somebody waits for ever while the page
 * cheerfully reports a code on its way.
 */
export async function signUp(input: SignupInput & { password: string }): Promise<SignupOutcome> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await anon.auth.signUp({
    email: input.email,
    password: input.password,
    // user_metadata, the same key the create screen reads. A prefilled form,
    // never a permission: nothing downstream treats it as one.
    options: { data: { [PENDING_WORKSPACE_KEY]: { name: input.name, timezone: input.timezone ?? null } } },
  });
  if (error) {
    if (!sendFailureIsOurs(error as { code?: string; status?: number; message?: string })) {
      throw new Error(`signUp: ${error.message}`);
    }
    console.warn("signup_code_not_sent", JSON.stringify({ ourFault: true, message: error.message.slice(0, 120) }));
    return { created: false, userId: null, codeUnsent: true };
  }
  // An obfuscated user -- the answer for an address we already have -- carries
  // an EMPTY identities array. Read for the log line alone: what goes back to
  // the caller is the same sentence either way, which is the entire point.
  const created = (data.user?.identities?.length ?? 0) > 0;
  return { created, userId: created ? (data.user?.id ?? null) : null, codeUnsent: false };
}

/**
 * Put somebody on the waitlist. Idempotent by address.
 *
 * Writes NOTHING else: no auth user, no workspace, no billing row. A person on
 * this list is not a customer yet, and creating half of one to hold their place
 * would leave a workspace nobody owns and a trial nobody started.
 *
 * A repeat submission is the same person being impatient, so it updates what
 * they told us and leaves their place in the queue alone -- their created_at is
 * their position, and losing it would punish them for asking twice.
 */
export async function joinWaitlist(input: { email: string; name?: string; source?: string }): Promise<void> {
  const db = serviceDb();
  const { error } = await db
    .from("waitlist")
    .upsert(
      { email: input.email, business: input.name ?? null, source: input.source ?? null },
      { onConflict: "email", ignoreDuplicates: false },
    );
  // A duplicate is not a failure the person should ever see: they asked twice,
  // and both times the answer is "you are on the list".
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`waitlist: ${error.message}`);
}

/**
 * The platform mailbox hears about a new workspace through the edge, which
 * holds the email key. Called where workspaces are made, /api/v1/workspaces/create,
 * for the first one and every one after. A failure is a shrug.
 */
export async function notifyPlatformSignup(tenantId: string, email: string): Promise<void> {
  if (!edgeConfigured() || !deployment.providersLive) return;
  try {
    await fetch(`${edgeUrl()}/api/admin/signup-notify`, {
      method: "POST",
      headers: edgeHeaders("/api/admin/signup-notify", { workspace: tenantId }),
      body: JSON.stringify({ tenant_id: tenantId, email }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch (e) {
    console.warn("signup_notify_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
  }
}
