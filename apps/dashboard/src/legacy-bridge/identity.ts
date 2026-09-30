/**
 * Identity and workspace on the classic pages: the words for who is signed in
 * and for a member (contracts/identity.ts), the one write a person may make
 * about themselves — their name — and the ones their workspace owns, its
 * timezone and how its customers buy (0008). The workspace surface publishes
 * __ME and __WORKSPACES at boot, each workspace with its `sells_by`; this keeps
 * both current after a change and tells the chrome. And who is acting: the one role every gate reads (`roleOf`).
 */
import {
  identityWords,
  memberWords,
  personInitials,
  type IdentityInput,
  timezoneWords,
  timezoneCity,
  zoneSearchWords,
  knownTimezones,
  usableDeviceTimezone,
  DEFAULT_TIMEZONE,
  roleAtLeast,
  type Role,
} from "@chanlytics/contracts";
import { api } from "./api";
import type { Me, Workspace } from "./surface-data";

export interface IdentityApi {
  words: typeof identityWords;
  member: typeof memberWords;
  initials: typeof personInitials;
}

export interface MeApi {
  /** Set your own name; empty clears it. Never throws. */
  setName(name: string): Promise<{ ok: boolean; name: string; message: string }>;
  /** Delete your own account (00190). On success the session is gone and the page walks to the sign-in. Never throws. */
  deleteAccount(): Promise<{ ok: boolean; message: string }>;
}

export interface TzApi {
  words: typeof timezoneWords;
  city: typeof timezoneCity;
  known: typeof knownTimezones;
  device: typeof usableDeviceTimezone;
  /** What a zone is also found by in the picker: the cities and states people type ("Miami"). */
  also: typeof zoneSearchWords;
}

/** What the active workspace's owner may change about it: its zone, how its customers buy (0008). At least one. */
export interface WorkspacePatch {
  timezone?: string;
  sells_by?: string;
}

export interface WorkspaceApi {
  /** Change the active workspace: what was sent, and what the server kept. Owner-only; never throws. */
  patch(fields: WorkspacePatch): Promise<{ ok: boolean; workspace: Partial<Workspace>; message: string }>;
  /** Set the active workspace's timezone: patch, for the zone alone. Owner-only; never throws. */
  setTimezone(tz: string): Promise<{ ok: boolean; tz: string; message: string }>;
}

declare global {
  interface Window {
    __identity?: IdentityApi;
    __me?: MeApi;
    __workspace?: WorkspaceApi;
    __tz?: TzApi;
    DEFAULT_TIMEZONE?: string;
  }
}

/* ------------------------------ who is acting: the role every gate reads ------------------------------ */

/*
 * A control offered to a role that may not press it is a lie the server corrects at the press. The shell's gates read
 * the role in three ways: the role store (`ST_STORE.myRole()`, which `gate()` chips read and which an owner's View-as
 * preview lowers), the raw membership (`__ME.role`, read by the person page, People and the Pipeline, blind to View-as),
 * and Ask's card. So an owner previewing a viewer still saw the owner's Erase and the operator's Record a yes on a
 * person's page, while the Settings pane they were previewing hid its own. Now the store's `myRole` and `mayAtLeast`
 * are made here (installIdentity) and every gate asks them, so View-as moves them all together.
 *
 * The ladder is contracts' (`roleAtLeast`, one reading of it); what this adds is who is looking: the member's role
 * from the workspace's read, lowered by View-as, and failing closed. `__ME` is absent during boot and whenever the
 * workspace read fails, and a role nobody can read is a viewer's, never an owner's.
 */
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

export function installIdentity(win: Window = window): void {
  installRoles(win);
  win.__identity = { words: identityWords, member: memberWords, initials: personInitials };
  win.__tz = {
    words: timezoneWords,
    city: timezoneCity,
    known: knownTimezones,
    device: usableDeviceTimezone,
    also: zoneSearchWords,
  };
  win.DEFAULT_TIMEZONE = DEFAULT_TIMEZONE;
  win.__me = {
    async setName(name) {
      const r = await api()("PUT me", { body: { display_name: name } });
      if (!r.ok) return { ok: false, name: "", message: r.message };
      const saved = r.data.display_name ?? name.trim();
      const me = (win as unknown as { __ME?: Me }).__ME;
      if (me) (win as unknown as { __ME?: Me }).__ME = { ...me, display_name: saved };
      win.dispatchEvent(new CustomEvent("me:changed"));
      return { ok: true, name: saved, message: "" };
    },
    async deleteAccount() {
      const r = await api()("DELETE me");
      if (!r.ok) return { ok: false, message: r.message };
      // The door ended the session; the sign-in page is where a person with no account belongs.
      win.location.assign("/login");
      return { ok: true, message: "" };
    },
  };
  const patch: WorkspaceApi["patch"] = async (fields) => {
    const r = await api()("PATCH workspaces", { body: fields });
    if (!r.ok) return { ok: false, workspace: {}, message: r.message };
    const back = r.data.workspace ?? {};
    // What the server kept, else what was sent, for each field sent and no other.
    const saved: Partial<Workspace> = {
      ...(fields.timezone !== undefined ? { timezone: back.timezone ?? fields.timezone } : {}),
      ...(fields.sells_by !== undefined ? { sells_by: back.sells_by ?? fields.sells_by } : {}),
    };
    // Keep the published list current, or every date on the page keeps being
    // read in the old zone, and every deal gate in the old answer, until a reload.
    const w = win as unknown as { __WORKSPACES?: Partial<Workspace>[]; __ACTIVE_WORKSPACE?: string };
    if (Array.isArray(w.__WORKSPACES)) {
      w.__WORKSPACES = w.__WORKSPACES.map((t) => (t.id === w.__ACTIVE_WORKSPACE ? { ...t, ...saved } : t));
    }
    win.dispatchEvent(new CustomEvent("workspace:changed"));
    return { ok: true, workspace: saved, message: "" };
  };
  win.__workspace = {
    patch,
    async setTimezone(tz) {
      const r = await patch({ timezone: tz });
      return r.ok
        ? { ok: true, tz: r.workspace.timezone ?? tz, message: "" }
        : { ok: false, tz: "", message: r.message };
    },
  };
}

export type { IdentityInput };
