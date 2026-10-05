/**
 * Supabase Auth, spoken to from the server: the sign-up the public form makes, on the public key, and what the service
 * role does to an account, an invitation and a second factor's removal. Supabase is this platform's own identity
 * store, so its auth API is spoken from here, beside the tables it makes users for; a third party's sign-in (Google)
 * is a provider's wire and lives in packages/channels, and a page's call as the person signed in stays in the browser.
 *
 * Each returns what Supabase answered, error untouched: telling an address we already have from a send that failed, or
 * which words a refusal gets, is the caller's choice. Framework-agnostic: the keys, or the client, are passed in, never
 * read here.
 *
 * Workspace scope: none; an account precedes and outlives any workspace, and these calls read and write no tenant row.
 */
import {
  createClient,
  type AuthMFAAdminDeleteFactorResponse,
  type AuthMFAAdminListFactorsResponse,
  type AuthResponse,
  type SupabaseClient,
  type UserResponse,
} from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** The public project URL and anon key, as the dashboard's environment holds them: either may be unset on a laptop. */
interface PublicKeyConfig {
  url: string | undefined;
  anonKey: string | undefined;
}

/**
 * Make the account, keep `userData` on it, and send the code that proves the address, in ONE call with the PUBLIC key,
 * and with no session kept: with email confirmation on, Supabase hands back no session for an unproved address.
 * A deployment without its keys throws here, on the call that needs them.
 */
export async function signUpOnPublicKey(
  cfg: PublicKeyConfig,
  args: { email: string; password: string; userData: object },
): Promise<AuthResponse> {
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("public_client_unconfigured: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const anon = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return anon.auth.signUp({ email: args.email, password: args.password, options: { data: args.userData } });
}

/** As the service role: Supabase makes the account for an address that has none and sends it the invitation link. */
export async function inviteUserByEmail(db: SupabaseClient<Database>, email: string): Promise<UserResponse> {
  return db.auth.admin.inviteUserByEmail(email);
}

/** As the service role: every second factor an account has enrolled. */
export async function listSecondFactors(
  db: SupabaseClient<Database>,
  userId: string,
): Promise<AuthMFAAdminListFactorsResponse> {
  return db.auth.admin.mfa.listFactors({ userId });
}

/** As the service role: one second factor of an account removed, so the person enrols again at their next sign-in. */
export async function deleteSecondFactor(
  db: SupabaseClient<Database>,
  userId: string,
  factorId: string,
): Promise<AuthMFAAdminDeleteFactorResponse> {
  return db.auth.admin.mfa.deleteFactor({ id: factorId, userId });
}
