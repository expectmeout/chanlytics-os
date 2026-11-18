/**
 * Make it mine (decision 0079, L4), the browser's half: the claim (POST preview-claims), and where the workspace made
 * theirs opens, its first run. Pressed on the preview's sign-up screen (SignupScreen.tsx, drawn by
 * /preview/<token>/mine), where someone signed in makes it theirs with one press and a new account as its code signs it
 * in; and asked by the first screen (bridge/CreateWorkspace.tsx), for an account that comes back to sign in later.
 */
import { FIRST_RUN_ROUTE, SIGNUP_WORDS, appLink } from "@chanlytics/contracts";
import { rememberWorkspace } from "@/bridge/workspace";

/**
 * A preview's link as sign-up reads it (server/previews/claim.ts): whose receptionist, the address it was sent to, and
 * what comes with it.
 */
export interface SignupPreview {
  token: string;
  business: string;
  email: string | null;
  comes: readonly string[];
}

/** Where this tab keeps which preview's sign-up it left for Google from: the tab's own, gone when it closes. */
const LEFT_FOR_GOOGLE = "chanlytics.preview.left-for-google";

/**
 * Kept as the tab leaves for Google from a preview's sign-up, so that coming back signed in makes the preview theirs
 * with no second press. The tab's own storage and never the link's: a link somebody was sent cannot say it, so a person
 * signed in who merely opens Make it mine is still asked.
 */
export function rememberLeftForGoogle(token: string): void {
  try {
    window.sessionStorage.setItem(LEFT_FOR_GOOGLE, token);
  } catch {
    // Storage switched off: they are asked the one press when they come back.
  }
}

/** Whether this tab left for Google from this preview's sign-up: asked once, and forgotten as it is asked. */
export function takeLeftForGoogle(token: string): boolean {
  try {
    const left = window.sessionStorage.getItem(LEFT_FOR_GOOGLE);
    window.sessionStorage.removeItem(LEFT_FOR_GOOGLE);
    return left === token;
  } catch {
    return false;
  }
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
