/**
 * The attributes of the session's cookies (apps/dashboard/src/lib/supabase/cookie-options.ts): SameSite=Lax said out
 * loud so a library default cannot move it, and Secure wherever the site is served over https, so a session cookie
 * never rides a plain-http request. `httpOnly` stays off: the browser client reads the session from the cookie (the
 * shell's realtime and Ask), which the plan records rather than breaks.
 *
 * Run through @supabase/ssr itself: a server client made with these options writes them on the cookies it sets.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";
import { importSrc } from "../_source.mjs";

const { sessionCookieOptions } = await importSrc("apps/dashboard/src/lib/supabase/cookie-options.ts");

test("the options are SameSite=Lax always, and Secure exactly where the site is served over https", () => {
  assert.deepEqual(sessionCookieOptions(true), { sameSite: "lax", secure: true });
  assert.deepEqual(sessionCookieOptions(false), { sameSite: "lax", secure: false });
});

test("Secure follows the scheme the deployment is served on: a production or a preview is https, a laptop is not", async () => {
  const { servedOverHttps } = await importSrc("apps/dashboard/src/server/env.ts");
  const before = process.env.VERCEL_ENV;
  try {
    for (const [vercel, https] of [
      ["production", true],
      ["preview", true],
      ["development", false],
      [undefined, false],
    ]) {
      if (vercel === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = vercel;
      assert.equal(servedOverHttps(), https, String(vercel));
    }
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});

/** A session token as the Auth server would issue one, built here so no token-shaped literal is in the tree. */
const part = (v) => Buffer.from(v).toString("base64url");
const session = () => ({
  access_token: [
    part('{"alg":"HS256"}'),
    part(JSON.stringify({ sub: "u-1", exp: 4102444800 })),
    part("signature"),
  ].join("."),
  refresh_token: "refresh-for-this-test",
  expires_in: 3600,
  expires_at: 4102444800,
  token_type: "bearer",
  user: { id: "u-1", aud: "authenticated", email: "ada@example.com" },
});

for (const secure of [true, false]) {
  test(`a session the client writes carries SameSite=Lax and Secure=${secure} on every cookie, and is not httpOnly`, async () => {
    const written = [];
    // The Auth server, as a stand-in: it knows the user, so the client accepts the session and writes its cookies.
    const real = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(session().user), { status: 200, headers: { "content-type": "application/json" } });
    const client = createServerClient("http://127.0.0.1:1", "anon-key-for-this-test", {
      cookieOptions: sessionCookieOptions(secure),
      cookies: {
        getAll: () => [],
        setAll: (cookies) => written.push(...cookies),
      },
    });
    try {
      await client.auth.setSession({ access_token: session().access_token, refresh_token: session().refresh_token });
    } finally {
      globalThis.fetch = real;
    }
    assert.ok(written.length > 0, "the client wrote the session's cookies");
    for (const { options } of written) {
      assert.equal(options.sameSite, "lax");
      assert.equal(options.secure, secure);
      assert.notEqual(options.httpOnly, true, "the browser client reads the session from the cookie");
    }
  });
}
