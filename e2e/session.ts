import type { Page } from "@playwright/test";

/**
 * Getting a signed-in browser, without a password to type.
 *
 * Sign-in is a magic link (`signInWithOtp`), so there is no form to fill and
 * no inbox for Playwright to read. The supported way in is to mint a link with
 * the service role and visit it — which needs `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * That key is on no developer machine here and is deliberately absent from CI
 * ("CI holds no live service secrets", ci.yml). So the signed-in specs SKIP,
 * with the reason printed, rather than failing for an environmental reason and
 * training everyone to ignore a red suite. That is the same bargain the six
 * credential-gated integration suites in tooling/scripts/tests already make.
 *
 * Nothing here needs rewriting when the key exists: set the three variables
 * and the skipped specs start running.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;

export const HAVE_SESSION = !!(URL_ && KEY && EMAIL);

export const WHY_SKIPPED =
  "needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and E2E_USER_EMAIL — " +
  "sign-in is a magic link, so a session has to be minted rather than typed";

/**
 * Mint a magic link for E2E_USER_EMAIL and follow it.
 *
 * `generateLink` does NOT send an email — it returns the link — so this cannot
 * spam a real inbox even when pointed at production.
 */
export async function signIn(page: Page): Promise<void> {
  if (!HAVE_SESSION) throw new Error(WHY_SKIPPED);

  const res = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY!, authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  if (!res.ok) {
    throw new Error(`could not mint a session link (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { action_link?: string; properties?: { action_link?: string } };
  const link = body.action_link ?? body.properties?.action_link;
  if (!link) throw new Error("generate_link returned no action_link");

  // The link lands on Supabase, which redirects back to the app with the
  // session set. Waiting for the app's own origin rather than a fixed timeout.
  await page.goto(link);
  await page.waitForURL((u) => !u.href.includes("/auth/v1/verify"), { timeout: 30_000 });
}
