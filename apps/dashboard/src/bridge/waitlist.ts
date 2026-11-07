import { SIGNUP_WORDS } from "@chanlytics/contracts";
import type { SignupSchema } from "@chanlytics/contracts";

/**
 * Joining the waitlist from the first-workspace screen (the wiring audit's N1).
 *
 * The screen's "Join the list" sent a signed-in person to /signup, and the middleware sends a signed-in person away
 * from /signup, back to the same screen: a loop. The screen posts the list itself, through the one public door the
 * sign-up page uses, with the list's two details and no password, since joining the list makes nothing.
 *
 * It takes the window it runs in, so a test hands in a stand-in and reads the request it would make.
 */
export type WaitlistJoin = { ok: true; sentence: string } | { ok: false; message: string };

let signupRule: typeof SignupSchema | null = null;

/**
 * The list's own rule (contracts SignupSchema), loaded once. It comes by import() from contracts' write-rules entry,
 * never with the page, since the browser's contracts carry no classic zod (decision 0024); the screen asks for it as
 * the list's form appears (CreateWorkspace.tsx), so a press seldom waits on it.
 */
export async function loadWaitlistRule(): Promise<typeof SignupSchema> {
  signupRule ??= (await import("@chanlytics/contracts/write-rules")).SignupSchema;
  return signupRule;
}

export async function joinWaitlistFrom(
  win: Pick<Window, "fetch">,
  input: { name: string; email: string },
): Promise<WaitlistJoin> {
  // The list's own rule, said before anything is sent, in the words the route would answer with. One that cannot load
  // is the network the post would have needed too.
  let rule: typeof SignupSchema;
  try {
    rule = signupRule ?? (await loadWaitlistRule());
  } catch {
    return { ok: false, message: SIGNUP_WORDS.unreachable };
  }
  const parsed = rule.safeParse({ name: input.name, email: input.email });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? SIGNUP_WORDS.waitlistNotJoined };
  const { name, email } = parsed.data;
  let res: Response;
  try {
    res = await win.fetch("/api/v1/signup", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name, email }),
    });
  } catch {
    return { ok: false, message: SIGNUP_WORDS.unreachable };
  }
  const answer = (await res.json().catch(() => null)) as {
    ok?: boolean;
    data?: { waitlisted?: boolean };
    error?: { message?: string };
  } | null;
  if (!res.ok || !answer?.ok) return { ok: false, message: answer?.error?.message ?? SIGNUP_WORDS.unreachable };
  // Only the list's own answer is a yes: a sign-up that was not put on the list did not join it.
  if (!answer.data?.waitlisted) return { ok: false, message: SIGNUP_WORDS.waitlistNotJoined };
  return { ok: true, sentence: SIGNUP_WORDS.waitlistSent(email) };
}
