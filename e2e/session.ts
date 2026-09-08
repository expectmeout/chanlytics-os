import type { Page } from "@playwright/test";
import { createChunks } from "@supabase/ssr/dist/main/utils/chunker.js";

/**
 * Getting a signed-in browser, without a password to type.
 *
 * Sign-in is an emailed one-time code, so there is no password and no inbox
 * for Playwright to read. A session has to be MINTED with the service role.
 *
 * The first version minted a magic link and navigated to it, and could never
 * have worked: following the link lands on Supabase's `/auth/v1/verify`, which
 * redirects back carrying the tokens in the URL **fragment** — the implicit
 * flow. This app holds its session in cookies (`@supabase/ssr`), has no
 * `/auth/callback` route to exchange anything, and its middleware bounces any
 * unauthenticated request to `/login` before a fragment could ever be read. So
 * the specs skipped for a missing key, and would have failed on the first run
 * that had one.
 *
 * What works is to do the exchange where the tokens can actually be captured —
 * in Node, over the API — and then hand the browser the cookie the app reads.
 * Nothing is typed into a form and no password exists to leak.
 *
 * `generate_link` does NOT send an email. It returns the link and the token,
 * so this cannot reach a real inbox even when pointed at production.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.E2E_USER_EMAIL;

export const HAVE_SESSION = !!(URL_ && KEY && ANON && EMAIL);

export const WHY_SKIPPED =
  "needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY and E2E_USER_EMAIL — sign-in is an emailed " +
  "code, so a session has to be minted rather than typed";

/** The storage key auth-js derives from the project URL, which is also the
 *  cookie name @supabase/ssr reads. */
function storageKey(): string {
  const ref = new URL(URL_!).hostname.split(".")[0];
  return `sb-${ref}-auth-token`;
}

interface MintedSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  user: unknown;
}

/**
 * One session per run, not one per test.
 *
 * Supabase caps `token_verifications` at 30 an hour (config.toml), and the
 * first version minted a fresh session in every test — so a full suite spent a
 * third of the hourly budget, and two runs in a row started failing with 429s
 * that look nothing like a product bug. The session is valid for an hour and
 * the suite runs in one process with a single worker, so mint it once and
 * share it.
 */
let cached: { session: MintedSession; mintedAt: number } | null = null;
const REUSE_MS = 30 * 60 * 1000;

/** Mint a real session for E2E_USER_EMAIL, over the API. */
async function mint(): Promise<MintedSession> {
  if (cached && Date.now() - cached.mintedAt < REUSE_MS) return cached.session;
  const fresh = await mintFresh();
  cached = { session: fresh, mintedAt: Date.now() };
  return fresh;
}

async function mintFresh(): Promise<MintedSession> {
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: KEY!, authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ type: "magiclink", email: EMAIL }),
  });
  if (!gen.ok) throw new Error(`could not mint a session link (${gen.status}): ${await gen.text()}`);
  const body = (await gen.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const tokenHash = body.hashed_token ?? body.properties?.hashed_token;
  if (!tokenHash) throw new Error("generate_link returned no hashed_token");

  // The exchange the browser cannot do for us. Verified with the ANON key,
  // exactly as a real sign-in would be — the service role only minted the
  // token.
  const ver = await fetch(`${URL_}/auth/v1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON! },
    body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
  });
  if (!ver.ok) throw new Error(`could not verify the minted token (${ver.status}): ${await ver.text()}`);
  return (await ver.json()) as MintedSession;
}

/**
 * Put a real session in the browser.
 *
 * The cookie format is @supabase/ssr's own: the session JSON, base64url with a
 * `base64-` marker, split by the library's own chunker so a long token lands
 * as `<key>.0`, `<key>.1` exactly as the app would have written it. Using the
 * library's chunker rather than a copy of the rule means a change to the
 * format breaks this loudly instead of producing a cookie the app ignores.
 */
export async function signIn(page: Page): Promise<void> {
  if (!HAVE_SESSION) throw new Error(WHY_SKIPPED);

  const session = await mint();
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const base = new URL(process.env.E2E_BASE_URL ?? "https://app.chanlytics.com");
  await page.context().addCookies(
    createChunks(storageKey(), value).map((c: { name: string; value: string }) => ({
      name: c.name,
      value: c.value,
      domain: base.hostname,
      path: "/",
      httpOnly: false,
      secure: base.protocol === "https:",
      sameSite: "Lax" as const,
      expires: session.expires_at,
    })),
  );
}

/** Sign in and land on a route, with the app's own boot finished. */
export async function signInAndGo(page: Page, hash: string): Promise<void> {
  await signIn(page);
  await page.goto(`/${hash}`);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}
