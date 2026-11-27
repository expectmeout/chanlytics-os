/**
 * The sign-up door (app/api/v1/signup) run as a stranger meets it, for signup.test.mjs and signup-posture.test.mjs: the
 * real route over a database in memory on the service role (the queue, `waitlist`), the limiter in memory, the
 * deployment's switch (SIGNUP_CODE) as each case sets it, and the project's Auth server on the wire, every request it
 * is sent kept and answered as it answers an ordinary sign-up: an account made, no session for an unproved address.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";

export const AUTH = "https://signup-test.supabase.example";
process.env.NEXT_PUBLIC_SUPABASE_URL = AUTH;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-this-file";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-key-for-this-file";

const { setRateStore, memoryStore, RATE } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");
export const signupRoute = await importSrc("apps/dashboard/app/api/v1/signup/route.ts");
export { RATE };

/** What the page's own request carries: it comes from the app. */
export const SAME = { "sec-fetch-site": "same-origin" };

/**
 * One stranger's world: the deployment's posture (SIGNUP_CODE: unset is open, the waitlist's word a queue, anything
 * else an invite code), the queue, and the Auth server's answer to a sign-up (`signUp`: a function of the body it was
 * sent; the default makes the account). `wire` keeps every request the Auth server was sent.
 */
export function signupWorld({ code, signUp } = {}) {
  if (code === undefined) delete process.env.SIGNUP_CODE;
  else process.env.SIGNUP_CODE = code;
  const tables = { waitlist: [], lead_previews: [] };
  setServiceClient(fakeDb(tables));
  setRateStore(memoryStore());
  const wire = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url instanceof Request ? url.url : url));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const headers = Object.fromEntries(new Headers(init.headers ?? (url instanceof Request ? url.headers : {})));
    wire.push({ path: u.pathname, origin: u.origin, body, headers });
    if (u.origin !== AUTH) return Response.json({ ok: true });
    if (u.pathname === "/auth/v1/signup") {
      const made = signUp ? signUp(body) : null;
      if (made) return Response.json(made.body, { status: made.status ?? 200 });
      return Response.json({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        aud: "authenticated",
        role: "authenticated",
        email: body.email,
        identities: [{ identity_id: "i1", id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }],
        user_metadata: body.data,
        created_at: "2026-11-02T15:00:00Z",
      });
    }
    return Response.json({});
  };
  /** A press of the form: the route's answer, read. */
  const post = async (body, headers = SAME) => {
    const res = await signupRoute.POST(
      new Request("http://localhost/api/v1/signup", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, body: await res.json() };
  };
  const get = async () => {
    const res = signupRoute.GET();
    return { status: res.status, body: await res.json() };
  };
  return { tables, wire, post, get, signups: () => wire.filter((r) => r.path === "/auth/v1/signup") };
}
