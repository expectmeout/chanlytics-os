/**
 * The invitations a sign-in completes (decision 0047, lane 6: reads never write). A person invited to a workspace is
 * seated in it by one POST the shell makes once when it boots (`POST me/invitations/accept`), not by the read of the
 * workspace list, which seated them on every same-origin read and told nobody. The POST answers which workspaces it
 * seated them in, and the shell says so ("You joined Harbor", contracts youJoinedWords).
 *
 * Asked once for the life of the page: the shell is one page that stays mounted across its navigations, so this is once
 * per boot. It never rejects and never blocks a page that has a workspace: a refusal (a limit, a lost connection, a
 * partner's second factor, which the client sends the tab to) is "nobody seated", and the next boot asks again. What
 * waits for it is the one read that cannot be trusted without it: the list of an account in no workspace, or in none the
 * address names (surface-data.ts workspaceOverride, and the home that picks a workspace for a tab, LegacyHost.tsx). A seat
 * it makes beside a list that is already whole is heard by the live feed (memberships), as any teammate's is.
 *
 * The news is kept for whoever draws it (joined-note.tsx): in the page, and in the tab's session storage in case the page
 * is replaced first, as the home does when it sends a tab to its workspace.
 */
import { youJoinedWords, type JoinedWorkspaceDto } from "@chanlytics/contracts";
import { api } from "../api";

/** The tab's slot for news that was not said before the page went. */
const WAITING = "chanlytics.joined";
/** How long a list that holds no workspace waits for the accept (acceptedInTime). */
const WAIT_MS = 4_000;
/** What the page that draws the news listens for. */
export const JOINED_EVENT = "shell:joined";

let accepting: Promise<JoinedWorkspaceDto[]> | null = null;
let waiting: string | null = null;

function sayJoined(words: string): void {
  waiting = words;
  try {
    sessionStorage.setItem(WAITING, words);
  } catch {
    // Storage is blocked: the page that is drawing now still hears it.
  }
  window.dispatchEvent(new CustomEvent(JOINED_EVENT));
}

/**
 * Seat the signed-in person in the workspaces that invited their address, once for this page. The workspaces it seated
 * them in, none when nothing was open or the answer did not come.
 */
export function acceptInvitations(): Promise<JoinedWorkspaceDto[]> {
  // Nothing is re-read behind it (refresh-map.ts REFRESHES_NOTHING): the caller reads the list again itself when it seated someone.
  accepting ??= api()("POST me/invitations/accept", { refresh: false }).then(
    (r) => {
      const joined = r.ok ? r.data.joined : [];
      const words = youJoinedWords(joined.map((w) => w.name));
      if (words) sayJoined(words);
      return joined;
    },
    () => [],
  );
  return accepting;
}

/**
 * The accept, waited for no longer than it is worth: what a list that holds no workspace waits on. An answer that is slow
 * must not hold the create screen of a person with no invitation at all, and a seat it makes later is heard by the live feed
 * (memberships) like any teammate's. None seated yet reads as none.
 */
export async function acceptedInTime(): Promise<JoinedWorkspaceDto[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const slow = new Promise<[]>((done) => {
    timer = setTimeout(() => done([]), WAIT_MS);
  });
  try {
    return await Promise.race([acceptInvitations(), slow]);
  } finally {
    clearTimeout(timer);
  }
}

/** The news waiting to be said ("You joined Harbor"), taken once: whoever says it clears it. */
export function takeJoinedWords(): string | null {
  const words = waiting;
  waiting = null;
  try {
    const kept = sessionStorage.getItem(WAITING);
    sessionStorage.removeItem(WAITING);
    return words ?? kept;
  } catch {
    return words;
  }
}
