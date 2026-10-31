/**
 * Make it mine (decision 0079, L4), the browser's half: the claim (POST preview-claims), and where the workspace made
 * theirs opens, its first run. Pressed on the preview's sign-up screen (SignupScreen.tsx, drawn by
 * /preview/<token>/mine), where someone signed in makes it theirs with one press and a new account as its code signs it
 * in; and asked by the first screen (legacy-bridge/CreateWorkspace.tsx), for an account that comes back to sign in later.
 */
import { FIRST_RUN_ROUTE, SIGNUP_WORDS, appLink } from "@chanlytics/contracts";
import { rememberWorkspace } from "@/legacy-bridge/workspace";

/** A preview's link as sign-up reads it (server/previews/claim.ts): whose receptionist, and the address it was sent to. */
export interface SignupPreview {
  token: string;
  business: string;
  email: string | null;
}

/** The workspace a claim made theirs, as /api/v1/workspaces lists one. */
interface ClaimedWorkspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  locale: string;
}

type ClaimAnswer = { ok: true; workspace: ClaimedWorkspace } | { ok: false; message: string };

/** The claim, as the person signed in: the workspace made theirs, or the door's own words for why not. */
export async function claimPreviewNow(token: string): Promise<ClaimAnswer> {
  try {
    const res = await window.fetch("/api/v1/preview-claims", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: { workspace?: ClaimedWorkspace };
      error?: { message?: string };
    } | null;
    const workspace = j?.ok ? j.data?.workspace : undefined;
    if (res.ok && workspace?.slug) return { ok: true, workspace };
    return { ok: false, message: j?.error?.message ?? SIGNUP_WORDS.unreachable };
  } catch {
    return { ok: false, message: SIGNUP_WORDS.unreachable };
  }
}

/** Where a workspace made theirs opens from sign-up: its first run, and the one this browser opens next. */
export function openClaimed(slug: string): void {
  rememberWorkspace(slug);
  window.location.assign(appLink(slug, FIRST_RUN_ROUTE));
}
