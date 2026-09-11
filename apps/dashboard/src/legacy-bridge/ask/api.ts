/**
 * The Ask routes, from the browser: threads, one thread, a deletion, the
 * openings fast path, a card's outcome, and the turn itself as a stream of
 * JSON lines. Every call goes through the same-origin, workspace-scoped
 * fetch the surfaces use; nothing here knows what the palette does with it.
 */
import type { AskMessageVM, AskProposalOutcome, AskScope, AskSurface, AskThreadVM } from "@chanlytics/contracts";
import { invalidateInFlight, scoped } from "../surface-data";
import { read } from "../api";
import { clearSurfaceCache } from "../surface-cache";

export type SendEvent =
  | { t: "thread"; id: string; title: string }
  | { t: "trace"; text: string }
  | { t: "delta"; text: string }
  | { t: "final"; message: AskMessageVM }
  | { t: "error"; text: string };

export interface OpeningsView {
  state: string;
  text: string;
  days: Array<{ key: string; label: string; windows: string[] }>;
}

export type CallResult = { ok: true; data: Record<string, unknown> } | { ok: false; message: string };

/** A same-origin call through the app's own route, marked as a card's when it commits one. */
export async function viaAsk(win: Window, url: string, body?: unknown, method: "POST" | "PUT" | "DELETE" = "POST"): Promise<CallResult> {
  try {
    const res = await win.fetch(scoped(url), {
      method,
      headers: { "content-type": "application/json", "x-via": "ask" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) {
      clearSurfaceCache();
      win.location.assign("/login");
      return { ok: false, message: "Signed out." };
    }
    const j = (await res.json().catch(() => null)) as { ok: boolean; data?: Record<string, unknown>; error?: { message?: string } } | null;
    if (!j || !j.ok) return { ok: false, message: j?.error?.message ?? `Request failed (${res.status}).` };
    invalidateInFlight();
    return { ok: true, data: j.data ?? {} };
  } catch {
    return { ok: false, message: "Network error — nothing was changed." };
  }
}

/** Read a stream of JSON lines, one event per line, across chunk boundaries. */
export async function readLines(body: ReadableStream<Uint8Array>, on: (line: string) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) on(l);
  }
  if (carry.trim()) on(carry);
}

export function askApi(win: Window) {
  return {
    threads: async (): Promise<AskThreadVM[]> => {
      try {
        return (await read("GET ask/threads")).threads;
      } catch {
        return [];
      }
    },
    thread: async (id: string): Promise<{ thread: AskThreadVM; messages: AskMessageVM[] } | null> => {
      try {
        return await read("GET ask/threads/[id]", { params: { id } });
      } catch {
        return null;
      }
    },
    deleteThread: async (id: string): Promise<boolean> => {
      try {
        const res = await win.fetch(scoped(`/api/v1/ask/threads/${encodeURIComponent(id)}`), { method: "DELETE" });
        return res.ok;
      } catch {
        return false;
      }
    },
    openings: async (day: string | null, service: string | null): Promise<OpeningsView> => {
      return (await read("GET ask/openings", { query: { day: day ?? undefined, service: service ?? undefined } })).openings;
    },
    outcome: async (messageId: string, proposalId: string, o: AskProposalOutcome): Promise<boolean> => {
      if (!/^[0-9a-f-]{36}$/.test(messageId)) return false;
      const r = await viaAsk(win, `/api/v1/ask/messages/${messageId}/proposals/${encodeURIComponent(proposalId)}`, o);
      return r.ok;
    },
    send: async (input: { text: string; threadId: string | null; scope: AskScope | null; surface: AskSurface }, on: (ev: SendEvent) => void): Promise<void> => {
      let res: Response;
      try {
        res = await win.fetch(scoped("/api/v1/ask"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: input.text, thread_id: input.threadId, scope: input.scope, surface: input.surface }),
        });
      } catch {
        on({ t: "error", text: "Network error — nothing was asked." });
        return;
      }
      if (res.status === 401) {
        clearSurfaceCache();
        win.location.assign("/login");
        return;
      }
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        on({ t: "error", text: j?.error?.message ?? `Ask failed (${res.status}).` });
        return;
      }
      await readLines(res.body, (line) => {
        try {
          on(JSON.parse(line) as SendEvent);
        } catch {
          /* a torn line at the end of a broken stream */
        }
      });
    },
  };
}

export type AskApiCalls = ReturnType<typeof askApi>;
