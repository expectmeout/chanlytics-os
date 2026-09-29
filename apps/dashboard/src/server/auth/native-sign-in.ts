import { safeNext } from "./oauth-callback";

/**
 * The native app's sign-in, decided without a network: what to sign in and where to land. Pure, so the route stays
 * a thin door (app/auth/native) and the decisions run in a test.
 *
 * The app signs in natively — Google refuses OAuth inside an embedded WebView, and Apple's button is the system's —
 * and receives an identity token. The token comes here, never a refresh token: handing the native session's refresh
 * token to the WebView would rotate it out from under the native client. The server signs the token in on its own
 * cookie-backed client, so the WebView's session and the app's are independent.
 */
export const NATIVE_FAILED = "/login?error=native";
export const NATIVE_PROVIDERS = ["apple", "google"] as const;
type NativeProvider = (typeof NATIVE_PROVIDERS)[number];
const TOKEN_MAX = 8192;

interface NativeSignIn {
  provider: NativeProvider;
  token: string;
  nonce: string | undefined;
}
interface NativePlan {
  signIn: NativeSignIn | null;
  to: string;
  refused: string | null;
}

const refusedPlan = (why: string): NativePlan => ({ signIn: null, to: NATIVE_FAILED, refused: why });

/**
 * Whether the request says it came from another site. The door signs a person in from a form body with no session
 * behind it, so a page elsewhere could auto-submit an attacker's own token and silently sign a visitor into the
 * attacker's account (login CSRF). The app's own WebView posts with no initiator: Fetch Metadata says `none`, or
 * says nothing on a client that does not send it, and there is no Origin. So this is not `isSameOrigin`, which
 * refuses silence; only positive evidence refuses: another site's word in Sec-Fetch-Site, or an Origin that is not
 * this host.
 */
export function fromAnotherSite(headers: { get(name: string): string | null }): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || origin === "null" || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export function nativeSignInPlan(body: unknown): NativePlan {
  if (!body || typeof body !== "object") return refusedPlan("no body");
  const b = body as Record<string, unknown>;
  const provider = (NATIVE_PROVIDERS as readonly string[]).includes(String(b.provider))
    ? (b.provider as NativeProvider)
    : null;
  if (!provider) return refusedPlan("unknown provider");
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return refusedPlan("no token");
  if (token.length > TOKEN_MAX) return refusedPlan("token too long");
  const nonce = typeof b.nonce === "string" && b.nonce.trim() ? b.nonce.trim() : undefined;
  return {
    signIn: { provider, token, nonce },
    to: safeNext(typeof b.next === "string" ? b.next : null),
    refused: null,
  };
}
