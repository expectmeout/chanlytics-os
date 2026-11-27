/**
 * A session as the project signs one, for the tests that run its gates: the proxy (auth-gate.test.mjs) and the route
 * wrapper (bearer.test.mjs). The project's signing key and a stranger's, an access token signed by either (or by the
 * shared secret, which only the Auth server can check), the public keys the project publishes, and the cookie
 * @supabase/ssr reads for a project at gate-test.supabase.example. Moved out of auth-gate.test.mjs on 26 Nov 2026, when
 * the wrapper's cookie came to be run too.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** The project the cookie names: its address, which @supabase/ssr names the cookie by (sb-gate-test-auth-token). */
export const SUPABASE = "https://gate-test.supabase.example";

const { subtle } = globalThis.crypto;
const ES256 = { name: "ECDSA", namedCurve: "P-256" };
const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const KID = "project-key-1";
export const projectKey = await subtle.generateKey(ES256, true, ["sign", "verify"]);
export const strangerKey = await subtle.generateKey(ES256, true, ["sign", "verify"]);
export const JWKS = {
  keys: [{ ...(await subtle.exportKey("jwk", projectKey.publicKey)), kid: KID, alg: "ES256", use: "sig" }],
};

/** An access token signed with `key` under the project's key id, as Supabase signs one with an asymmetric key. */
export async function signed(key, alg = "ES256") {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg, kid: KID, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: "u1", aud: "authenticated", role: "authenticated", iat: now, exp: now + 3600, aal: "aal1" }),
  );
  const sig =
    alg === "ES256"
      ? await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, Buffer.from(`${header}.${payload}`))
      : Buffer.from("not-a-signature");
  return `${header}.${payload}.${b64url(sig)}`;
}

/** The session cookie @supabase/ssr reads, holding `accessToken`. */
export function sessionCookie(accessToken) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "refresh-test-only",
    user: { id: "u1", aud: "authenticated", role: "authenticated", email: "ada@example.com", app_metadata: {} },
  };
  return `sb-gate-test-auth-token=base64-${b64url(JSON.stringify(session))}`;
}
