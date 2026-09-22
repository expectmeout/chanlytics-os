/**
 * Identity and workspace on the classic pages: the words for who is signed in
 * and for a member (contracts/identity.ts), the one write a person may make
 * about themselves — their name — and the one their workspace owns, its
 * timezone. The workspace surface publishes __ME and __WORKSPACES at boot;
 * this keeps both current after a change and tells the chrome.
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
import type { Me } from "./surface-data";

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

export interface WorkspaceApi {
  /** Set the active workspace's timezone. Owner-only; never throws. */
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
  win.__workspace = {
    async setTimezone(tz) {
      const r = await api()("PATCH workspaces", { body: { timezone: tz } });
      if (!r.ok) return { ok: false, tz: "", message: r.message };
      const saved = r.data.workspace?.timezone ?? tz;
      // Keep the published list current, or every date on the page keeps
      // being read in the old zone until a reload.
      const w = win as unknown as { __WORKSPACES?: { id: string; timezone?: string }[]; __ACTIVE_WORKSPACE?: string };
      if (Array.isArray(w.__WORKSPACES)) {
        w.__WORKSPACES = w.__WORKSPACES.map((t) => (t.id === w.__ACTIVE_WORKSPACE ? { ...t, timezone: saved } : t));
      }
      win.dispatchEvent(new CustomEvent("workspace:changed"));
      return { ok: true, tz: saved, message: "" };
    },
  };
}

export type { IdentityInput };
