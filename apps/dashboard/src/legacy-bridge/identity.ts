/**
 * Identity and workspace on the classic pages: the words for who is signed in
 * and for a member (contracts/identity.ts), the one write a person may make
 * about themselves — their name — and the ones their workspace owns, its
 * timezone and how its customers buy (0007). The workspace surface publishes
 * __ME and __WORKSPACES at boot, each workspace with its `sells_by`; this keeps
 * both current after a change and tells the chrome.
 */
import {
  identityWords,
  memberWords,
  personInitials,
  type IdentityInput,
  timezoneWords,
  timezoneCity,
  knownTimezones,
  usableDeviceTimezone,
  DEFAULT_TIMEZONE,
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
}

export interface TzApi {
  words: typeof timezoneWords;
  city: typeof timezoneCity;
  known: typeof knownTimezones;
  device: typeof usableDeviceTimezone;
}

/** What the active workspace's owner may change about it: its zone, how its customers buy (0007). At least one. */
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

export function installIdentity(win: Window = window): void {
  win.__identity = { words: identityWords, member: memberWords, initials: personInitials };
  win.__tz = { words: timezoneWords, city: timezoneCity, known: knownTimezones, device: usableDeviceTimezone };
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
