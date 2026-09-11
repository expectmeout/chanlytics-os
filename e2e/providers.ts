/**
 * What the hosted Supabase project has switched on, from its public settings.
 *
 * Sign in with Google is shown exactly when the project's Google provider is
 * on (`external.google`), so a spec that looks for the button asks the same
 * question the page asks. Null when the run has no project to ask.
 */
export async function googleProviderOn(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const j = (await res.json()) as { external?: { google?: boolean } };
    return j?.external?.google === true;
  } catch {
    return null;
  }
}
