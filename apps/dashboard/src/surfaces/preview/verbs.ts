/**
 * What a lead's own receptionist's page asks (decision 0079): its four public doors, by the link's token
 * (app/api/v1/previews/[token]/…). No session, no workspace and no 401, as the sign-up page's door has none, so these
 * are posts of their own rather than the typed client's, which owns all three.
 */
import { SECOND_MS, type PreviewTurnVM } from "@chanlytics/contracts";
import type { CallStarted } from "@/legacy-bridge/rehearse/call";

/**
 * A door's answer: what it said, or its refusal in the page's own words, with the seconds a limit says it lifts in
 * (`retry_after_s`), null where it named none.
 */
type PreviewAsked<T> = { ok: true; data: T } | { ok: false; message: string | null; waitS: number | null };

/** The longest a message waits out the door's pace before it is sent again: the pace's own seconds, never a network's hour. */
const PACE_WAIT_MAX_S = 10;

async function post<T>(token: string, door: string, body: Record<string, unknown>): Promise<PreviewAsked<T>> {
  try {
    const res = await fetch(`/api/v1/previews/${encodeURIComponent(token)}/${door}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      data?: T;
      error?: { message?: string; details?: { retry_after_s?: unknown } };
    } | null;
    if (res.ok && j?.ok) return { ok: true, data: j.data as T };
    const wait = j?.error?.details?.retry_after_s;
    return { ok: false, message: j?.error?.message ?? null, waitS: typeof wait === "number" ? wait : null };
  } catch {
    return { ok: false, message: null, waitS: null };
  }
}

/**
 * A message, sent again once after the door's pace where it asked for a few seconds (a preview answers one at a time,
 * so a follow-up written on the heels of an answer waits its turn rather than being handed back).
 */
async function sayPaced(token: string, text: string) {
  const first = await post<{ turn: PreviewTurnVM; left: number }>(token, "message", { text });
  const waitS = first.ok ? null : first.waitS;
  if (waitS === null || waitS > PACE_WAIT_MAX_S) return first;
  await new Promise((go) => setTimeout(go, waitS * SECOND_MS));
  return post<{ turn: PreviewTurnVM; left: number }>(token, "message", { text });
}

export const previewVerbs = {
  /** A message, answered as a live chat would, with how many more it will answer; it waits out a pace of seconds once. */
  say: sayPaced,
  /** The page drawn in a browser: counted by this, never by a fetch of the link. */
  opened: (token: string) => post<{ opened: number | null }>(token, "opened", {}),
  /** A call in the browser: what the client joins, how long it may run, and the minutes left after it. */
  call: (token: string) => post<CallStarted & { max_ms: number; left_ms: number }>(token, "call", {}),
  /** A fact said not to be right, and what is, kept for the person who wrote to them. */
  notRight: (token: string, fact: string, said: string) => post<{ kept: number }>(token, "not-right", { fact, said }),
};
