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
export type NativeProvider = (typeof NATIVE_PROVIDERS)[number];
const TOKEN_MAX = 8192;

export interface NativeSignIn {
  provider: NativeProvider;
  token: string;
  nonce: string | undefined;
}
export interface NativePlan {
  signIn: NativeSignIn | null;
  to: string;
  refused: string | null;
}

const refuse = (why: string): NativePlan => ({ signIn: null, to: NATIVE_FAILED, refused: why });

export function nativeSignInPlan(body: unknown): NativePlan {
  if (!body || typeof body !== "object") return refuse("no body");
  const b = body as Record<string, unknown>;
  const provider = (NATIVE_PROVIDERS as readonly string[]).includes(String(b.provider))
    ? (b.provider as NativeProvider)
    : null;
  if (!provider) return refuse("unknown provider");
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!token) return refuse("no token");
  if (token.length > TOKEN_MAX) return refuse("token too long");
  const nonce = typeof b.nonce === "string" && b.nonce.trim() ? b.nonce.trim() : undefined;
  return {
    signIn: { provider, token, nonce },
    to: safeNext(typeof b.next === "string" ? b.next : null),
    refused: null,
  };
}
