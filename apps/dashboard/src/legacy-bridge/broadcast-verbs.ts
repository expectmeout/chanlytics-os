/**
 * Broadcasts, the verbs: `window.__broadcasts.send(body)`, `.cancel(id)`,
 * `.approve(id)`, and `.detail(id)`, a read.
 *
 * Each goes through the typed client (owner or operator on the server; a
 * viewer's click returns the server's refusal), and after a write lands the
 * refresh map re-reads the Broadcasts surface, so the Scheduled and History
 * rows are the server's — never a row the page invented while it waited.
 */
import { api } from "./api";
import { broadcastsOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

export interface SendBody {
  template_id: string;
  params: string[];
  audience: { kind: "everyone" | "list" | "saved"; id: string | null };
  scheduled_for?: string | null;
  name?: string | null;
}

/** Re-read the surface: for Ask's cards and anything else that changes a broadcast elsewhere. */
export async function refreshBroadcasts(): Promise<void> {
  api().forget();
  await refreshSurfaces([broadcastsOverride]);
}

export const broadcasts = {
  send: (body: SendBody) => api()("POST broadcasts", { body }),
  cancel: (id: string) => api()("POST broadcasts/[id]/cancel", { params: { id } }),
  /** A playbook's run that waited for a person goes out now. */
  approve: (id: string) => api()("POST broadcasts/[id]/approve", { params: { id } }),
  /** One broadcast and every person on it. A read: nothing refreshes. */
  detail: (id: string) => api()("GET broadcasts/[id]", { params: { id } }),
};

declare global {
  interface Window {
    __broadcasts?: typeof broadcasts;
    __refreshBroadcasts?: () => Promise<void>;
  }
}

export function installBroadcasts(): void {
  window.__broadcasts = broadcasts;
  window.__refreshBroadcasts = refreshBroadcasts;
}
