/**
 * Who is looking, and at which workspace: what the workspace read answered (surface-data.ts `workspaceOverride`), held
 * here for every reader (decision 0151).
 *
 * The read wrote five names on the window (`__WORKSPACES`, `__ME`, `__ACTIVE_WORKSPACE`, `__PENDING_WORKSPACE`,
 * `__SIGNUP_POSTURE`) and the frame, the bridge and the pages read them there. They are one answer, held whole and
 * replaced whole with the bridge's other reads (held-reads.ts): the read holds what it read, the cache gives back what an
 * earlier visit read before React draws, a save of the workspace's zone or word puts the saved row in the list, and a test
 * holds the world it draws. Whoever draws it hears `surface:workspace`, which the read says as it lands.
 *
 * This module imports only held-reads.ts at run time, so the kit, the frame and every surface can import it.
 */
import type { MembershipRole, OpenHandoverDto, PendingWorkspace, SignupPosture } from "@chanlytics/contracts";
import { heldRead, holdRead } from "./held-reads";

declare module "./held-reads" {
  interface HeldReads {
    /** Who is looking, and at which workspace: the workspace read's answer, as one value. */
    workspace: WhoIsLooking;
  }
}

/** A workspace this person has a seat in, as the workspace read lists it (GET /api/v1/workspaces). */
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  status: string;
  timezone: string;
  /** What it calls a booking (00458): appointment, visit, meeting, session or lesson; null where it never picked one. */
  appointment_word?: string | null;
  /** The caller's role in it (0012): said beside every workspace on the switcher. */
  role?: string | null;
  /** Where its own logo is served (00407): the sidebar's circle, the rail and the switcher draw it over its initials. */
  logo_url?: string | null;
}

/** Who is looking, as the workspace read says: their seat's role and what the frame offers them. */
export interface Me {
  id: string;
  email: string | null;
  role?: MembershipRole | null;
  display_name?: string | null;
  /** Whether the Chanlytics back office exists for this person. Never the authorization -- every platform route asks the database. */
  platform_admin?: boolean;
  /** Whether this person is a partner (0012), and their code. */
  partner?: { code: string; status: string } | null;
  /** The hand-overs open to this person, which the frame offers once they are in (invitations/handover.ts). */
  handovers?: OpenHandoverDto[];
}

/** What the workspace read said, as one answer. */
export interface WhoIsLooking {
  /** Every workspace this person has a seat in; null before the read has landed. */
  workspaces: readonly Workspace[] | null;
  /** Who is looking; null before the read, and whenever it failed. */
  me: Me | null;
  /** The workspace being looked at, as the server resolved it: its id; null before the read. */
  activeWorkspaceId: string | null;
  /** A workspace being made for this person that is not in the list yet. */
  pending: PendingWorkspace | null;
  /** The door a first workspace meets: the invite code, or the list (the create screen asks nothing of its own). */
  posture: SignupPosture;
}

const NOBODY_LOOKING: WhoIsLooking = {
  workspaces: null,
  me: null,
  activeWorkspaceId: null,
  pending: null,
  posture: "open",
};

/** What the workspace read said, now; nobody before it. */
export function whoIsLooking(): WhoIsLooking {
  return heldRead("workspace") ?? NOBODY_LOOKING;
}

/** Hold what the read said, or part of it, over what was held: a new answer, never the old one changed. */
export function holdWhoIsLooking(next: Partial<WhoIsLooking>): void {
  holdRead("workspace", { ...whoIsLooking(), ...next });
}

/** The workspace being looked at, from the list: null before the read, or where the list does not hold it. */
export function currentWorkspace(): Workspace | null {
  const { workspaces, activeWorkspaceId } = whoIsLooking();
  return workspaces?.find((t) => t.id === activeWorkspaceId) ?? null;
}
