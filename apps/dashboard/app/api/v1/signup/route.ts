import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  AppError,
  SIGNUP_WORDS,
  SignupSchema,
  err,
  isUsablePassword,
  ok,
  passwordProblem,
  signupPosture,
} from "@chanlytics/contracts";
import { isSameOrigin } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";
import { inviteCodeMatches, joinWaitlist, signUp } from "@/server/signup";

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
 *
 * It makes no workspace. What the form said waits on the auth user, and the
 * person who enters the code makes the workspace through
 * /api/v1/workspaces/create, signed in, like every workspace after the first.
 */
const PRIVATE = { "cache-control": "private, no-store" } as const;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

function ipOf(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd ? fwd.split(",")[0].trim() : "";
  return first || req.headers.get("x-real-ip") || "unknown";
}

export async function GET(): Promise<Response> {
  // The page asks what to render before it renders anything. `posture` is the
  // one field it needs; the two booleans stay so a client deployed before this
  // keeps working, which matters because the page and the API ship separately.
  const posture = signupPosture(process.env.SIGNUP_CODE);
  return NextResponse.json(ok({ posture, open: posture !== "waitlist", code_required: posture === "invite" }), {
    headers: PRIVATE,
  });
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

    // THE CREDENTIAL, insisted on HERE rather than in the schema. The waitlist
    // branch above takes details and creates no account, so it needs no
    // password and its form shows no such field; a schema that demanded one
    // would refuse the queue, which is the posture a launch actually runs in.
    // One function owns the rule and the page checks with the same one, so the
    // browser's answer and the server's answer cannot drift.
    // Asked as the NARROWING half, so what reaches `signUp` is a string the
    // type system has been told about rather than one this file asserts.
    if (!isUsablePassword(input.password)) {
      throw new AppError("validation", passwordProblem(input.password) ?? "Choose a password.");
    }
    if (posture === "invite" && !inviteCodeMatches(input.code)) throw new AppError("forbidden", SIGNUP_WORDS.codeWrong);
    // Narrowing a PROPERTY does not re-type the object that holds it, so the
    // proved password is handed over explicitly rather than passing `input`
    // and asserting. No cast, and the compiler keeps the guarantee.
    const out = await signUp({ ...input, password: input.password });
    console.log(
      JSON.stringify({
        level: "info",
        event: "signup",
        created: out.created,
        code_unsent: out.codeUnsent,
        ms: Date.now() - started,
      }),
    );
    // THE CODE IS THE ONLY WAY IN, so a send WE could not make is worth saying.
    // The usual answer stays deliberately opaque -- whether an address is already
    // registered is not a stranger's to learn from this form -- but "we are over
    // our mail budget" is about us, discloses nothing about any address, and is
    // the difference between waiting usefully and waiting for ever. `next` is
    // null because /login has nothing to show them yet.
    if (out.codeUnsent) {
      return NextResponse.json(ok({ sent: false, next: null, message: SIGNUP_WORDS.notSent }), { headers: PRIVATE });
    }
    // `next` is null because there is nowhere to send them: the code step is
    // on the sign-up page itself now. It stays in the shape because a client
    // deployed before this reads it, and null is the value that shape already
    // uses for "this page says what happens next" (the waitlist, the unsent).
    return NextResponse.json(ok({ sent: true, next: null }), { headers: PRIVATE });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json(err(e.code, e.message), { status: e.status, headers: PRIVATE });
    console.error("signup_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json(err("internal", "Could not start your sign-up just now. Try again in a moment."), {
      status: 500,
      headers: PRIVATE,
    });
  }
}
