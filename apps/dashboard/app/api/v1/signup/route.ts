import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { AppError, SIGNUP_WORDS, SignupSchema, err, ok, signupNext, signupPosture } from "@chanlytics/contracts";
import { isSameOrigin } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { joinWaitlist, notifyPlatformSignup, signUp } from "@/server/signup";

/**
 * /api/v1/signup — the one door a stranger may use.
 *
 * Public by a deliberate edit to the middleware's PUBLIC_PATHS, so it does
 * NOT go through withRoute (there is no session to verify). What it keeps
 * instead: the same-origin check every mutating route makes, a bucket per
 * network and per address in the shared limiter, the invite code compared
 * in constant time when one is set, and one neutral sentence back whether
 * or not the address was known.
 *
 *   GET  → { open, code_required }         what the page should ask for
 *   POST → { sent, next }                  the code is on its way; go here
 */
const PRIVATE = { "cache-control": "private, no-store" } as const;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

function ipOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd ? fwd.split(",")[0].trim() : "";
  return first || req.headers.get("x-real-ip") || "unknown";
}

function codeMatches(given: string | undefined, expected: string): boolean {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(): Promise<Response> {
  // The page asks what to render before it renders anything. `posture` is the
  // one field it needs; the two booleans stay so a client deployed before this
  // keeps working, which matters because the page and the API ship separately.
  const posture = signupPosture(process.env.SIGNUP_CODE);
  return NextResponse.json(
    ok({ posture, open: posture !== "waitlist", code_required: posture === "invite" }),
    { headers: PRIVATE },
  );
}

export async function POST(req: Request): Promise<Response> {
  const started = Date.now();
  try {
    if (!isSameOrigin(req)) throw new AppError("forbidden", SIGNUP_WORDS.crossSite);
    const parsed = SignupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message ?? "Check the form.");
    const input = parsed.data;
    await takeRate(`ip:${hash(ipOf(req))}`, "signup_ip");
    await takeRate(`email:${hash(input.email)}`, "signup_email");
    const posture = signupPosture(process.env.SIGNUP_CODE);

    // THE WAITLIST BRANCH RETURNS BEFORE ANYTHING IS CREATED.
    //
    // No auth user, no workspace, no billing row. Somebody on the list is not
    // a customer yet, and creating half of one to hold their place would leave
    // a workspace nobody owns and a trial nobody started.
    //
    // The rate limits above have already been spent, deliberately: this is the
    // posture a launch runs in, so it is the posture that most needs the
    // limiter, and a queue is exactly what a script would want to flood.
    if (posture === "waitlist") {
      await joinWaitlist({ email: input.email, name: input.name, source: req.headers.get("referer") ?? undefined });
      console.log(JSON.stringify({ level: "info", event: "waitlist_join", ms: Date.now() - started }));
      // The same shape a real sign-up returns, so the form needs no new state:
      // one sentence and somewhere to go. `next` is null because there is no
      // code coming and no screen to enter one on.
      return NextResponse.json(ok({ sent: true, waitlisted: true, next: null }), { headers: PRIVATE });
    }

    const required = posture === "invite" ? process.env.SIGNUP_CODE : null;
    if (required && !codeMatches(input.code, required)) throw new AppError("forbidden", SIGNUP_WORDS.codeWrong);
    const out = await signUp(input);
    if (out.created && out.tenantId) await notifyPlatformSignup(out.tenantId, input.email);
    console.log(JSON.stringify({ level: "info", event: "signup", created: out.created, tenant: out.tenantId, ms: Date.now() - started }));
    return NextResponse.json(ok({ sent: true, next: signupNext(input.email) }), { headers: PRIVATE });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json(err(e.code, e.message), { status: e.status, headers: PRIVATE });
    console.error("signup_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json(err("internal", "Could not create the workspace just now. Try again in a moment."), { status: 500, headers: PRIVATE });
  }
}
