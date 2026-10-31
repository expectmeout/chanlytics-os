/**
 * Sign-up's inputs (the invite code, the form) and the workspace it keeps for later (pendingWorkspaceOf), as the
 * routes read them, apart from signup.ts's words. zod is not built into the browser's contracts (decision 0024, the
 * browser's entry): a page that says these words loads none of it.
 */
import { z } from "zod";
import { SIGNUP_NAME_MIN, SIGNUP_NAME_MAX, PENDING_WORKSPACE_KEY } from "./signup";
import { isTimezone } from "./workspace";

/** The invite code, where sign-up is by invitation: what the form, the create screen and the kept answers all read it as. */
export const InviteCodeSchema = z.string().trim().max(80);

/**
 * A lead's own receptionist's link (decision 0079), as sign-up, the kept answers and the claim read it: its token,
 * twenty-two characters of base64url. The link stands for an invite code; whether it is still open is its row's to say.
 */
export const PreviewTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

export const SignupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.")
      .max(SIGNUP_NAME_MAX, "That name is too long — 120 characters at most."),
    email: z.string().trim().toLowerCase().email("Enter a work email address.").max(254),
    /**
     * The credential, and the reason it is OPTIONAL here rather than required.
     *
     * The waitlist posture takes details and creates nothing -- no account, so
     * no password -- and its form shows no such field. A schema that demanded
     * one would refuse the queue, which is the posture a launch actually runs
     * in. So the shape admits it and the CREATING path insists on it: the
     * route calls `passwordProblem` the moment it knows the posture is not the
     * list, and that one function is also what the page checks with, so the
     * browser's rule and the server's rule cannot drift.
     *
     * The cap here is a body-size guard, not the rule; the rule is bytes.
     */
    password: z.string().max(200).optional(),
    /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
    timezone: z.string().trim().min(1).max(64).optional(),
    /** The invite code, when sign-up is by invitation. */
    code: InviteCodeSchema.optional(),
    /** The preview it came from (Make it mine): kept for the claim, and an open sign-up whatever the posture. */
    preview: PreviewTokenSchema.optional(),
  })
  .strict();

export type SignupInput = z.infer<typeof SignupSchema>;

/** What sign-up kept, read: the name, the clock, and the preview it came from where it came from one. */
export interface PendingWorkspace {
  name: string;
  timezone: string | null;
  preview?: string;
}

export const PendingWorkspaceSchema = z
  .object({
    name: z.string().trim().min(SIGNUP_NAME_MIN).max(SIGNUP_NAME_MAX),
    // A clock Postgres would refuse is dropped here, so the owner's first Create
    // never fails over a zone a stranger's device reported.
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .nullish()
      .transform((v) => (v && isTimezone(v) ? v : null)),
    // The preview sign-up came from: the first screen claims it rather than making a workspace. One that is not a token
    // is none, and the name and clock still stand.
    preview: PreviewTokenSchema.optional().catch(undefined),
  })
  // None is no key at all, as before there were previews: nothing reads an answer sign-up never gave.
  .transform(({ preview, ...kept }): PendingWorkspace => (preview ? { ...kept, preview } : kept));

/** The pending workspace on a user's metadata, or null when there is none worth showing. Never throws: metadata is whatever Supabase holds. */
export function pendingWorkspaceOf(metadata: unknown): PendingWorkspace | null {
  if (!metadata || typeof metadata !== "object") return null;
  const r = PendingWorkspaceSchema.safeParse((metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY]);
  return r.success ? r.data : null;
}

/**
 * The invite code sign-up checked, kept beside the name so the first workspace is made from sign-up's answers alone:
 * the create route checks it again, as it checks one typed. It is never part of the form -- pendingWorkspaceOf reads
 * the name and the clock only, and zod drops the rest -- and nothing but that check reads it.
 */
export function pendingCodeOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const p = (metadata as Record<string, unknown>)[PENDING_WORKSPACE_KEY];
  const r = InviteCodeSchema.safeParse(p && typeof p === "object" ? (p as { code?: unknown }).code : null);
  return r.success && r.data ? r.data : null;
}
