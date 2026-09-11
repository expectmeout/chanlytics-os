import "server-only";
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

const EDGE_BASE = "https://chanlytics-messaging.vercel.app";

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

/** Supabase's own word for an address it already has. */
export function alreadyExists(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "email_exists" || /already (been )?registered|already exists/i.test(e.message ?? "");
}

/**
 * Send the one credential that opens the account.
 *
 * Returns whether the failure was OURS. An unknown or already-registered address
 * stays opaque -- that answer is an account-enumeration oracle on a public form --
 * but a send we could not make says nothing about any address, and swallowing it
 * is how somebody ends up waiting for ever with the page cheerfully telling them
 * a code is on its way.
 */
async function sendCode(email: string): Promise<{ ourFault: boolean }> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (!error) return { ourFault: false };
  const ourFault = sendFailureIsOurs(error as { code?: string; status?: number; message?: string });
  console.warn("signup_code_not_sent", JSON.stringify({ ourFault, message: error.message.slice(0, 120) }));
  return { ourFault };
}

export async function signUp(input: SignupInput): Promise<SignupOutcome> {
  const db = serviceDb();
  // Confirmed at creation: the code is the proof of the inbox, and a user who
  // never enters one owns nothing. What the form said rides on the user for
  // the create screen to open with; an address Supabase already has keeps
  // whatever it had, because a public form must not write into an account.
  const made = await db.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { [PENDING_WORKSPACE_KEY]: { name: input.name, timezone: input.timezone ?? null } },
  });
  if (made.error && !alreadyExists(made.error)) throw new Error(`createUser: ${made.error.message}`);
  const created = !made.error && !!made.data.user?.id;
  const { ourFault } = await sendCode(input.email);
  return { created, userId: created ? made.data.user!.id : null, codeUnsent: ourFault };
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
  if (!process.env.DIAG_KEY || process.env.VERCEL_ENV !== "production") return;
  try {
    await fetch(`${EDGE_BASE}/api/admin/signup-notify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-diag-key": process.env.DIAG_KEY },
      body: JSON.stringify({ tenant_id: tenantId, email }),
      signal: AbortSignal.timeout(4_000),
    });
  } catch (e) {
    console.warn("signup_notify_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
  }
}
