/**
 * Templates, the verbs: `window.__templates` — sync from Meta, draft one
 * with the assistant, submit one to Meta, delete one.
 *
 * Every write re-fetches the surfaces that show templates: Settings (every
 * template with its status), the Inbox (the approved ones the composer may
 * send) and Broadcasts (the approved ones a broadcast may pick). A draft is
 * a read and refreshes nothing. Owner or operator on the server; a viewer's
 * click returns the server's refusal.
 */
import { inboxOverride, invalidateInFlight, scoped, settingsOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";
import { clearSurfaceCache } from "./surface-cache";
import { STARTER_LANGUAGES, STARTER_TEMPLATES, defaultSlotKinds, starterByName, starterForTrigger, starterPreview, starterText, templateTitle } from "@chanlytics/contracts";

export interface TemplateResult<T = unknown> {
  ok: boolean;
  message?: string;
  data?: T;
}

async function call<T>(path: string, method: "POST" | "DELETE", body: unknown, refresh: boolean): Promise<TemplateResult<T>> {
  try {
    const res = await fetch(scoped(path), {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      clearSurfaceCache();
      window.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    if (refresh) {
      invalidateInFlight();
      await refreshSurfaces([settingsOverride, inboxOverride]);
      const rb = (window as unknown as { __refreshBroadcasts?: () => Promise<void> }).__refreshBroadcasts;
      if (rb) await rb();
      // A playbook picks its trigger's starter the moment it is approved.
      const rp = (window as unknown as { __refreshPlaybooks?: () => Promise<void> }).__refreshPlaybooks;
      if (rp) await rp();
    }
    return { ok: true, data: j.data };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

export interface SyncData { seen: number; approved: number; marketing: number; synced_at: string }
export interface DraftBody { brief: string; category: "marketing" | "utility"; language: string }
export interface DraftData { draft: { name: string; body: string; footer: string | null; examples: string[]; variables: { position: number; label: string; source: string }[]; warnings: string[] } }
export interface CreateBody { name: string; language: string; category: string; body: string; footer: string | null; examples: string[] }
export interface CreateData { id: string; name: string; language: string; category: string; meta_status: string; warnings: string[] }
export interface StarterBody { keys?: string[]; languages?: string[] }
export interface StarterResult { key: string; title: string; language: string; status: "submitted" | "exists" | "synced" | "failed"; meta_status: string | null; detail?: string }
export interface StarterData { results: StarterResult[]; submitted: number; existing: number; synced: number; failed: number }

export const syncTemplates = () => call<SyncData>("/api/v1/templates/sync", "POST", undefined, true);

export const templates = {
  sync: syncTemplates,
  draft: (body: DraftBody) => call<DraftData>("/api/v1/templates/draft", "POST", body, false),
  create: (body: CreateBody) => call<CreateData>("/api/v1/templates", "POST", body, true),
  remove: (id: string) => call<{ deleted: true; id: string; name: string }>(`/api/v1/templates/${encodeURIComponent(id)}`, "DELETE", undefined, true),
  /** The starter set, or some of it, in the languages asked: idempotent, submitted to Meta where new. */
  addStarters: (body: StarterBody) => call<StarterData>("/api/v1/templates/starter", "POST", body, true),
};

/** The starter set as the pages read it: the library, and the words and slots for any template. */
export interface StarterLibrary {
  list: typeof STARTER_TEMPLATES;
  languages: typeof STARTER_LANGUAGES;
  byName: typeof starterByName;
  forTrigger: typeof starterForTrigger;
  text: typeof starterText;
  preview: typeof starterPreview;
  title: typeof templateTitle;
  slotKinds: typeof defaultSlotKinds;
}

declare global {
  interface Window {
    __syncTemplates?: () => Promise<TemplateResult<SyncData>>;
    __templates?: typeof templates;
    __starters?: StarterLibrary;
  }
}

export function installTemplates(): void {
  window.__syncTemplates = syncTemplates;
  window.__templates = templates;
  window.__starters = {
    list: STARTER_TEMPLATES,
    languages: STARTER_LANGUAGES,
    byName: starterByName,
    forTrigger: starterForTrigger,
    text: starterText,
    preview: starterPreview,
    title: templateTitle,
    slotKinds: defaultSlotKinds,
  };
}
