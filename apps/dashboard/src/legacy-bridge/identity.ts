/**
 * Identity on the classic pages: the words for who is signed in and for a
 * member (contracts/identity.ts), and the one write a person may make about
 * themselves — their name. The workspace surface publishes __ME at boot;
 * this keeps it current after a change and tells the chrome.
 */
import { identityWords, memberWords, personInitials, type IdentityInput } from "@chanlytics/contracts";
import { scoped } from "./surface-data";
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

declare global {
  interface Window {
    __identity?: IdentityApi;
    __me?: MeApi;
  }
}

export function installIdentity(win: Window = window): void {
  win.__identity = { words: identityWords, member: memberWords, initials: personInitials };
  win.__me = {
    async setName(name) {
      try {
        const res = await fetch(scoped("/api/v1/me"), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ display_name: name }) });
        const body = (await res.json().catch(() => null)) as { data?: { display_name?: string }; error?: { message?: string } } | null;
        if (!res.ok) return { ok: false, name: "", message: body?.error?.message ?? `HTTP ${res.status}` };
        const saved = body?.data?.display_name ?? name.trim();
        const me = (win as unknown as { __ME?: Me }).__ME;
        if (me) (win as unknown as { __ME?: Me }).__ME = { ...me, display_name: saved };
        win.dispatchEvent(new CustomEvent("me:changed"));
        return { ok: true, name: saved, message: "" };
      } catch (e) {
        return { ok: false, name: "", message: e instanceof Error ? e.message : String(e) };
      }
    },
  };
}

export type { IdentityInput };
