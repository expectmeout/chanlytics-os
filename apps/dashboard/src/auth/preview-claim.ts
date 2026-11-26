/**
 * Make it mine (decision 0079, L4), the browser's half: the claim (POST preview-claims), and where the workspace made
 * theirs opens, its first run. Pressed on the preview's sign-up screen (SignupScreen.tsx, drawn by
 * /preview/<token>/mine), where someone signed in makes it theirs with one press and a new account as its code signs it
 * in; and asked by the first screen (bridge/CreateWorkspace.tsx), for an account that comes back to sign in later.
 */
import { FIRST_RUN_ROUTE, MIN_MS, SIGNUP_WORDS, appLink } from "@chanlytics/contracts";
import { rememberWorkspace } from "@/bridge/workspace";
import { askOwnRoute } from "@/client/own-route";

/**
 * A preview's link as sign-up reads it (server/previews/claim.ts): whose receptionist, the address it was sent to, and
 * what comes with it.
 */
export interface SignupPreview {
  token: string;
  business: string;
  email: string | null;
  comes: readonly string[];
  /** What came with it, counted, as It's yours says it once it is theirs. */
  counts: readonly string[];
  /** What its setup will leave out for what they did on the preview, in the page's words; null where nothing. */
  skips: string | null;
}

/** Where this tab keeps which preview's sign-up it left for Google from, and when: the tab's own, gone when it closes. */
const LEFT_FOR_GOOGLE = "chanlytics.preview.left-for-google";
/** How long that is believed: a sign-in at Google takes a minute or two, never the rest of a tab's day. */
const LEFT_FOR_GOOGLE_MS = 15 * MIN_MS;

/**
 * Kept as the tab leaves for Google from a preview's sign-up, so that coming back signed in makes the preview theirs
 * with no second press. The tab's own storage and never the link's: a link somebody was sent cannot say it, so a person
 * signed in who merely opens Make it mine is still asked. It lapses after a quarter of an hour, so a sign-in given up
 * at Google does not make a preview theirs the next time the tab comes by signed in.
 */
export function rememberLeftForGoogle(token: string): void {
  try {
    window.sessionStorage.setItem(LEFT_FOR_GOOGLE, `${Date.now()}:${token}`);
  } catch {
    // Storage switched off: they are asked the one press when they come back.
  }
}

/** Whether this tab left for Google from this preview's sign-up: asked once, and forgotten as it is asked. */
export function takeLeftForGoogle(token: string): boolean {
  try {
    const kept = window.sessionStorage.getItem(LEFT_FOR_GOOGLE) ?? "";
    window.sessionStorage.removeItem(LEFT_FOR_GOOGLE);
    const cut = kept.indexOf(":");
    const at = Number(kept.slice(0, cut));
    return cut > 0 && kept.slice(cut + 1) === token && Date.now() - at < LEFT_FOR_GOOGLE_MS && Date.now() >= at;
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
  // Through the page's own-route client: no answer at all is status 0, which says the same as a refusal with no words.
  const r = await askOwnRoute<{ ok?: boolean; data?: { workspace?: ClaimedWorkspace }; error?: { message?: string } }>(
    "/api/v1/preview-claims",
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token }),
    },
  );
  const workspace = r.json?.ok ? r.json.data?.workspace : undefined;
  if (r.ok && workspace?.slug) return { ok: true, workspace };
  return { ok: false, message: r.json?.error?.message ?? SIGNUP_WORDS.unreachable };
}

/** Where a workspace made theirs opens from sign-up: its first run, and the one this browser opens next. */
export function openClaimed(slug: string): void {
  rememberWorkspace(slug);
  window.location.assign(appLink(slug, FIRST_RUN_ROUTE));
}
