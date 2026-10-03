/**
 * Supabase Auth, spoken to from the server on the public key: the sign-up the public form makes. Supabase is this
 * platform's own identity store, so its auth API is spoken from here, beside the tables it makes users for; a third
 * party's sign-in (Google) is a provider's wire and lives in packages/channels.
 *
 * It returns what Supabase answered, error untouched: telling an address we already have from a send that failed is
 * the caller's sentence to choose. Framework-agnostic: the keys are passed in, never read here.
 *
 * Workspace scope: none; sign-up precedes any workspace, and the public key reads and writes no tenant row.
 */
import { createClient, type AuthResponse } from "@supabase/supabase-js";

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
