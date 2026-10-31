/**
 * What a lead's own receptionist's page asks (decision 0079): its four public doors, by the link's token
 * (app/api/v1/previews/[token]/…). No session, no workspace and no 401, as the sign-up page's door has none, so these
 * are posts of their own rather than the typed client's, which owns all three.
 */
import type { PreviewTurnVM } from "@chanlytics/contracts";
import type { CallStarted } from "@/legacy-bridge/rehearse/call";

/** A door's answer: what it said, or its refusal in the page's own words. */
type PreviewAsked<T> = { ok: true; data: T } | { ok: false; message: string | null };

async function post<T>(token: string, door: string, body: Record<string, unknown>): Promise<PreviewAsked<T>> {
  try {
    const res = await fetch(`/api/v1/previews/${encodeURIComponent(token)}/${door}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
    if (res.ok && j?.ok) return { ok: true, data: j.data as T };
    return { ok: false, message: j?.error?.message ?? null };
  } catch {
    return { ok: false, message: null };
  }
}

export const previewVerbs = {
  /** A message, answered as a live chat would, with how many more it will answer. */
  say: (token: string, text: string) => post<{ turn: PreviewTurnVM; left: number }>(token, "message", { text }),
  /** The page drawn in a browser: counted by this, never by a fetch of the link. */
  opened: (token: string) => post<{ opened: number | null }>(token, "opened", {}),
  /** A call in the browser: what the client joins, how long it may run, and the minutes left after it. */
  call: (token: string) => post<CallStarted & { max_ms: number; left_ms: number }>(token, "call", {}),
  /** A fact said not to be right, and what is, kept for the person who wrote to them. */
  notRight: (token: string, fact: string, said: string) => post<{ kept: number }>(token, "not-right", { fact, said }),
};
