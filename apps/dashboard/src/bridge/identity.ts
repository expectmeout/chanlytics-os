/**
 * Identity and workspace on the classic pages: a zone's words and this device's zone (`TzApi`, provided as `tz`
 * for the Business tab), the writes a person may make
 * about themselves — their name, their account (`meVerbs`, which Settings › Profile
 * imports) — and the ones their workspace owns, its
 * timezone and its word for a booking (00458). The workspace read holds who is
 * looking and their workspaces (who.ts), each workspace with its `appointment_word`; this keeps
 * the list current after a change and tells the chrome. And who is acting: the one role every gate reads (`roleOf`).
 */
import {
  type IdentityInput,
  timezoneWords,
  timezoneCity,
  zoneSearchWords,
  knownTimezones,
  usableDeviceTimezone,
  roleAtLeast,
  type Role,
  ROLE_PERMS,
  entryOf,
} from "@chanlytics/contracts";
import { api } from "./api";
import { sealSurfaceCache } from "./surface-cache";
import { provide, provided } from "./provided";
import { holdWhoIsLooking, whoIsLooking, type Workspace } from "./who";

declare module "./provided" {
  interface BridgeParts {
    /** The workspace's own changes an owner makes: its zone, its word for a booking. */
    workspace: WorkspaceApi;
    /** A zone's words and this device's zone, an environment's answer. */
    tz: TzApi;
    /** Who is acting: the role every gate asks (installRoleStore, completed by installIdentity). */
    roles: RoleStore;
  }
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

/** What the active workspace's owner may change about it: its zone, what it calls a booking (00458). At least one. */
export interface WorkspacePatch {
  timezone?: string;
  appointment_word?: string;
}

export interface WorkspaceApi {
  /** Change the active workspace: what was sent, and what the server kept. Owner-only; never throws. */
  patch(fields: WorkspacePatch): Promise<{ ok: boolean; workspace: Partial<Workspace>; message: string }>;
  /** Set the active workspace's timezone: patch, for the zone alone. Owner-only; never throws. */
  setTimezone(tz: string): Promise<{ ok: boolean; tz: string; message: string }>;
}

/* ------------------------------ who is acting: the role every gate reads ------------------------------ */

/*
 * A control offered to a role that may not press it is a lie the server corrects at the press. The shell's gates read
 * the role in three ways: the role store (`ST_STORE.myRole()`, which `gate()` chips read and which an owner's View-as
 * preview lowers), the raw membership (`me.role`, who.ts, read by the person page, People and the Pipeline, blind to View-as),
 * and Ask's card. So an owner previewing a viewer still saw the owner's Erase and the operator's Record a yes on a
 * person's page, while the Settings pane they were previewing hid its own. Now the store's `myRole` and `mayAtLeast`
 * are made here (installIdentity) and every gate asks them, so View-as moves them all together.
 *
 * The ladder is contracts' (`roleAtLeast`, one reading of it); what this adds is who is looking: the member's role
 * from the workspace's read, lowered by View-as, and failing closed. Who is looking is unknown during boot and whenever the
 * workspace read fails, and a role nobody can read is a viewer's, never an owner's.
 */
/** What the role store holds, as settings.jsx makes it and this completes. */
export interface RoleStore {
  /** An owner's preview of a lower role, or null to act as who they are. */
  viewAsRole: string | null;
  myRole: () => string;
  mayAtLeast?: (least: Role) => boolean;
  /** Preview a lower role, or `null` to stop; tells every reader (`team:changed`). */
  setViewAs?: (role: string | null) => void;
  /** Whether the role acting may do a permission's act (the session store's, below). */
  can?: (action: string) => boolean;
  /** The session's own settings, the seeded charter's modes among them (the session store's, below). */
  get?: (k: string, fallback: unknown) => unknown;
  set?: (k: string, v: unknown) => void;
}

/**
 * The role the person is acting as. A workspace read that gave a member is the real role, and View-as previews a lower
 * one on top of it (owner-only, client-side, harmless: the server checks again with requireRole). Without one, anyone is a
 * viewer.
 */
export function roleOf(input: {
  me: { role?: string | null } | null | undefined;
  viewAs: string | null | undefined;
}): string {
  if (input.me) return input.viewAs || input.me.role || "viewer";
  return input.viewAs || "viewer";
}

/**
 * Give the role store its reading: `myRole` and `mayAtLeast`, over who the workspace's read said is looking (who.ts) and
 * the store's own View-as. After the manifest (which makes the store), before React draws. Answers nothing where there is
 * no store (a test's window); the standalone mockup has no bridge, and keeps settings.jsx's own reading.
 */
export function installRoles(): void {
  const store = provided("roles");
  if (!store) return;
  store.myRole = () =>
    roleOf({
      me: whoIsLooking().me,
      viewAs: store.viewAsRole,
    });
  store.mayAtLeast = (least) => roleAtLeast(store.myRole(), least);
}

/**
 * What a person may change about themselves (Settings › Profile, which imports it): their name, and their account. An
 * object a test stands a door in on.
 */
export const meVerbs: MeApi = {
  async setName(name) {
    // The write re-reads who is looking and the roster (refresh-map.ts "PUT me") before it answers: the sidebar, the account
    // menu and the Team list all say the name that read landed, and none is patched ahead of it.
    const r = await api()("PUT me", { body: { display_name: name } });
    if (!r.ok) return { ok: false, name: "", message: r.message };
    return { ok: true, name: r.data.display_name ?? name.trim(), message: "" };
  },
  async deleteAccount() {
    const r = await api()("DELETE me");
    if (!r.ok) return { ok: false, message: r.message };
    // The door ended the session; the sign-in page is where a person with no account belongs. What the tab kept of
    // theirs goes first, and stays gone (surface-cache.ts sealSurfaceCache): it waited for whoever signed in next here.
    sealSurfaceCache();
    window.location.assign("/login");
    return { ok: true, message: "" };
  },
};

export function installIdentity(win: Window = window): void {
  installRoles();
  // A zone's words, and this device's zone, an environment's answer a test stands in for.
  provide("tz", {
    words: timezoneWords,
    city: timezoneCity,
    known: knownTimezones,
    device: usableDeviceTimezone,
    also: zoneSearchWords,
  });
  const patch: WorkspaceApi["patch"] = async (fields) => {
    const r = await api()("PATCH workspaces", { body: fields });
    if (!r.ok) return { ok: false, workspace: {}, message: r.message };
    const back = r.data.workspace ?? {};
    // What the server kept, else what was sent, for each field sent and no other.
    const saved: Partial<Workspace> = {
      ...(fields.timezone !== undefined ? { timezone: back.timezone ?? fields.timezone } : {}),
      ...(fields.appointment_word !== undefined
        ? { appointment_word: back.appointment_word ?? fields.appointment_word }
        : {}),
    };
    // Keep the list held current, or every date on the page keeps being
    // read in the old zone, and every page says the old word, until a reload.
    const { workspaces, activeWorkspaceId } = whoIsLooking();
    if (workspaces) {
      holdWhoIsLooking({ workspaces: workspaces.map((t) => (t.id === activeWorkspaceId ? { ...t, ...saved } : t)) });
    }
    win.dispatchEvent(new CustomEvent("workspace:changed"));
    return { ok: true, workspace: saved, message: "" };
  };
  provide("workspace", {
    patch,
    async setTimezone(tz) {
      const r = await patch({ timezone: tz });
      return r.ok
        ? { ok: true, tz: r.workspace.timezone ?? tz, message: "" }
        : { ok: false, tz: "", message: r.message };
    },
  });
}

export type { IdentityInput };

/* ------------------------------------------------------------------ the role store ------------------------------------------------------------------ */

/*
 * The role store (provided as `roles`), moved here from legacy/pages/settings.jsx with Settings' frame (decision 0015 step
 * 11): which role the member acts as, an owner's preview of a lower one (View as), and the mockup's own member, whom a demo
 * session reads. (It carried the mockup's own team too, four invented people whose methods nothing called; the Team pane
 * reads the settings surface's roster.) Every gate in the app asks it (frame/gate.ts `gate` and `canDo`, frame-verbs `actingRole`), so the
 * app installs it at boot, before any page draws (bridge/boot/installs.ts); installIdentity above completes it.
 */

/** The session store: what the JSX made (FL_STORE's pattern -- survives a move, resets on a reload). */
interface SessionStore extends RoleStore {
  defaults: Record<string, unknown>;
  set(k: string, v: unknown): void;
  get(k: string, fallback: unknown): unknown;
  can(action: string): boolean;
  _emit(): void;
  setViewAs(role: string | null): void;
}

/** What each role may do: the table the SERVER enforces (contracts ROLE_PERMS). */
const permsOf = (role: string): Record<string, boolean> => entryOf(ROLE_PERMS, role) ?? {};

/** Who is signed in, read when a gate asks. */
const signedIn = (): { role?: string | null } | null => whoIsLooking().me;

function makeRoleStore(): SessionStore {
  return {
    defaults: {}, // key -> chosen option
    set(k, v) {
      this.defaults[k] = v;
    },
    get(k, fallback) {
      return this.defaults[k] !== undefined ? this.defaults[k] : fallback;
    },

    // ---- Roles (audit U3) ----
    viewAsRole: null, // owner-only preview; null = act as real role
    myRole() {
      // Real membership role when the bridge has it (E1) -- every gate() chip in the app starts telling the truth
      // through this one line. View-as still previews a LOWER role on top of the real one (owner-only, client-side,
      // harmless: the server re-checks with requireRole anyway).
      // Fail CLOSED. Who is looking is unknown during boot and whenever the workspace fetch fails (the seam swallows that), and
      // defaulting to owner rendered every gated control as available to a viewer.
      const me = signedIn();
      if (me) return this.viewAsRole || me.role || "viewer";
      return this.viewAsRole || "viewer";
    },
    can(action) {
      return !!permsOf(this.myRole())[action];
    },
    _emit() {
      window.dispatchEvent(new CustomEvent("team:changed"));
    },
    setViewAs(role) {
      this.viewAsRole = role;
      this._emit();
    },
  };
}

/** The role store, made once: one already held (a test's stand-in) is kept. */
export function installRoleStore(): void {
  if (!provided("roles")) provide("roles", makeRoleStore());
}
