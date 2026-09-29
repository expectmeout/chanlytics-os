/**
 * The role every gate reads: one answer, from the bridge.
 *
 * A control offered to a role that may not press it is a lie the server corrects at the press. The shell's gates read
 * the role in three ways: the role store (`ST_STORE.myRole()`, which `gate()` chips read and which an owner's View-as
 * preview lowers), the raw membership (`__ME.role`, read by the person page, People and the Pipeline, blind to View-as),
 * and Ask's card. So an owner previewing a viewer still saw the owner's Erase and the operator's Record a yes on a
 * person's page, while the Settings pane they were previewing hid its own. Now the store's `myRole` and `mayAtLeast`
 * are made here and every gate asks them, so View-as moves them all together.
 *
 * The ladder is contracts' (`roleAtLeast`, one reading of it); what this adds is who is looking: the member's role
 * from the workspace's read, lowered by View-as, and failing closed. `__ME` is absent during boot and whenever the
 * workspace read fails, and a role nobody can read is a viewer's, never an owner's.
 */
import { roleAtLeast, type Role } from "@chanlytics/contracts";

/** What the role store holds, as settings.jsx makes it and this completes. */
export interface RoleStore {
  /** An owner's preview of a lower role, or null to act as who they are. */
  viewAsRole: string | null;
  /** The mockup's own signed-in member, used only by a demo session (no workspace read to take it from). */
  me?: () => { role?: string | null } | undefined;
  myRole: () => string;
  mayAtLeast?: (least: Role) => boolean;
}

declare global {
  interface Window {
    /** The session stores settings.jsx makes (the role store is the one this module completes). */
    ST_STORE?: RoleStore;
  }
}

/** What the reading needs of the window besides the store: who the workspace's read said is looking. */
export type RolesWindow = Window & { __ME?: { role?: string | null } | null };

/**
 * The role the person is acting as. A workspace read that gave a member is the real role, and View-as previews a lower
 * one on top of it (owner-only, client-side, harmless: the server checks again with requireRole). Without one, a demo
 * session acts as the mockup's own member, and anything else is a viewer.
 */
export function roleOf(input: {
  me: { role?: string | null } | null | undefined;
  viewAs: string | null | undefined;
  demoRole?: string | null;
}): string {
  if (input.me) return input.viewAs || input.me.role || "viewer";
  return input.viewAs || input.demoRole || "viewer";
}

/**
 * Give the role store its reading: `myRole` and `mayAtLeast`, over this window's `__ME` and the store's own View-as.
 * After the manifest (which makes the store), before React draws. Answers nothing where there is no store (a test's
 * window); the standalone mockup has no bridge, and keeps settings.jsx's own reading.
 */
export function installRoles(win: RolesWindow = window): void {
  const store = win.ST_STORE;
  if (!store) return;
  store.myRole = () =>
    roleOf({
      me: win.__ME,
      viewAs: store.viewAsRole,
      demoRole: win.__DEMO_MODE ? (store.me?.()?.role ?? null) : null,
    });
  store.mayAtLeast = (least) => roleAtLeast(store.myRole(), least);
}
