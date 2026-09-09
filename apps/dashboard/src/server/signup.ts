import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, emitEvent, type Database } from "@chanlytics/db";
import type { SignupInput } from "@chanlytics/contracts";

/**
 * Sign-up, the half that knows who exists.
 *
 * This is the second place the dashboard holds the service role (the first
 * is service.ts, for jobs), and it writes no tenant data: it creates the
 * auth user, gives a NEW user a workspace through create_workspace_for
 * (00072) — the one function that may name an owner who has not signed in
 * yet — and asks Supabase to send the sign-in code with the anon client,
 * exactly as /login does. An address Supabase already has is recognised by
 * its own error and left alone: that person gets a code and signs in to
 * what they have. The caller says the same sentence either way.
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
  /** A new person: the user and their workspace were made this call. */
  created: boolean;
  tenantId: string | null;
  userId: string | null;
}

/** Supabase's own word for an address it already has. */
export function alreadyExists(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false;
  return e.code === "email_exists" || /already (been )?registered|already exists/i.test(e.message ?? "");
}

async function workspaceFor(db: SupabaseClient<Database>, userId: string, input: SignupInput): Promise<string> {
  const call = (tz: string | undefined) =>
    db.rpc("create_workspace_for", { p_user: userId, p_name: input.name, ...(tz ? { p_timezone: tz } : {}) }).single();
  let r = await call(input.timezone);
  // The device's zone is not one Postgres knows (a rare alias): the default
  // stands rather than the sign-up failing over a clock the owner can set later.
  if (r.error && r.error.code === "22023" && input.timezone && /timezone/i.test(r.error.message)) r = await call(undefined);
  if (r.error || !r.data) throw new Error(`create_workspace_for: ${r.error?.message ?? "no row"}`);
  return r.data.id;
}

async function sendCode(email: string): Promise<void> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  // A rate-limited or unknown address is not the caller's to learn from here;
  // the page says the same sentence. The log keeps the reason.
  if (error) console.warn("signup_code_not_sent", JSON.stringify({ message: error.message.slice(0, 120) }));
}

export async function signUp(input: SignupInput): Promise<SignupOutcome> {
  const db = serviceDb();
  const made = await db.auth.admin.createUser({ email: input.email, email_confirm: true });
  let created = !made.error && !!made.data.user?.id;
  let userId: string | null = created ? made.data.user!.id : null;
  if (made.error && !alreadyExists(made.error)) throw new Error(`createUser: ${made.error.message}`);
  let tenantId: string | null = null;
  if (created && userId) {
    try {
      tenantId = await workspaceFor(db, userId, input);
    } catch (e) {
      // A user without a workspace would sign in to nothing. Undo the half
      // that happened; the page tells them to try again.
      await db.auth.admin.deleteUser(userId).catch(() => {});
      created = false;
      userId = null;
      throw e;
    }
    await emitEvent(db, tenantId, "workspace.created", "signup", "tenant", tenantId, { by: userId, email: input.email, timezone: input.timezone ?? null }).catch(() => {});
  }
  await sendCode(input.email);
  return { created, tenantId, userId };
}

/** The platform mailbox hears about a new workspace through the edge, which holds the email key. A failure is a shrug. */
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
