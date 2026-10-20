/**
 * Who is signed in and which workspace is on screen, as the sidebar says them (moved from legacy/components/sidebar.jsx,
 * the one-system plan's step 7b). Every word about a person comes from contracts' identity rules through the bridge
 * (`__identity`); the workspace is the one being viewed (`__ACTIVE_WORKSPACE`), never the first on the list. The demo
 * keeps its persona; signed in with no identity yet, the sidebar says so rather than borrow someone else's name.
 */
import type { SyntheticEvent } from "react";
import { identityWords } from "@chanlytics/contracts";
import { isDemoFrame } from "../frame-window";

/** A workspace as the switcher draws it: the workspace read's row (legacy-bridge/surface-data.ts). */
type SbWorkspace = NonNullable<Window["__WORKSPACES"]>[number] & {
  name?: string;
  logo_url?: string | null;
  role?: string | null;
};

/** The person in the sidebar's words. */
export interface SbWho {
  name: string;
  email: string;
  initials: string;
  role: string;
  named: boolean;
}

/** The workspaces this account belongs to, as the workspace read wrote them. */
export const sbWorkspaces = (): SbWorkspace[] => window.__WORKSPACES || [];
/** Whether the workspace read has written them yet (an empty list is a list). */
export const sbWorkspacesRead = (): boolean => !!window.__WORKSPACES;

// The workspace being VIEWED, not the first one alphabetically: every data surface and Settings resolve by
// __ACTIVE_WORKSPACE, and a boot that has not resolved it yet shows "Workspace" until it has.
export const sbWorkspace = (): SbWorkspace | null =>
  sbWorkspaces().find((w) => w.id === window.__ACTIVE_WORKSPACE) || null;

export const sbWorkspaceName = (): string => {
  const ws = sbWorkspace();
  if (ws && ws.name) return ws.name;
  return isDemoFrame() ? "Chanlytics Sales" : "Workspace";
};

/** A workspace's initials: contracts' one rule (workspaceInitials), which the bridge publishes as __identity.workspace. */
const sbMarkOf = (n: string | undefined) =>
  window.__identity && window.__identity.workspace ? window.__identity.workspace(n) : "—";

/** Each workspace's own role beside it (0012): a partner's list says which are theirs and which they brought. */
export const sbWorkspaceRole = (w: { role?: string | null }, current: boolean, role: string) =>
  w.role && window.__identity ? window.__identity.words({ email: null, role: w.role }).role : current ? role : null;

/** A picture that does not load stands aside, and the initials under it show again (the kit Face's rule). */
const sbLogoGone = (e: SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.hidden = true;
};

/**
 * A workspace's circle: its own logo where it has one (00407), drawn over its initials; else the initials, in the accent
 * (components.css), so the business's circle never reads as a member's own face. Decoration: the name beside it says which.
 */
export function SbWorkspaceFace({ ws, className }: { ws: SbWorkspace | null; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {sbMarkOf(ws ? ws.name : sbWorkspaceName())}
      {ws && ws.logo_url ? (
        <img
          key={ws.logo_url}
          className="face-photo"
          src={ws.logo_url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={sbLogoGone}
        />
      ) : null}
    </span>
  );
}

/**
 * The workspace's second line: how many there are to switch between, where there is more than one, since that is what the
 * row's menu does. One workspace says its name alone (Ruben, 11 Oct 2026: "1 of 1 line on" was no help to anyone).
 */
export const sbTeamSub = () => {
  const n = sbWorkspaces().length;
  return n > 1 ? <div className="sb-team-plan">{n} workspaces</div> : null;
};

const SB_DEMO_WHO: SbWho = {
  name: "Sarah Chen",
  email: "sales@chanlytics.com",
  initials: "SC",
  role: "Owner",
  named: true,
};
const SB_NOBODY: SbWho = { name: "Your account", email: "Signed in", initials: "—", role: "", named: false };

// The person, in the words contracts' identity rules give: the name they gave, else "Your account", never a name invented
// from the email. The demo keeps its persona; signed in with no identity yet, we say so.
export const sbWho = (): SbWho => {
  const me = window.__ME || null;
  if (!me) return isDemoFrame() ? SB_DEMO_WHO : SB_NOBODY;
  const w = window.__identity ? window.__identity.words(me) : identityWords(me);
  return { name: w.name, email: w.email, initials: w.initials, role: w.role, named: w.named };
};
