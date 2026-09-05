/**
 * Ask, wired to the workspace.
 *
 * What the palette needs and where it comes from: the jump index and the
 * suggestions from what the browser already holds; the three fast answers
 * from the bell's feed and the Live surface; openings from a route that runs
 * the availability engine; threads and turns from the Ask routes, the turn
 * arriving as a stream of JSON lines so the answer's words show as they are
 * written. Published to the mockup as window.__ask. Nothing here invents a
 * row: every list is the real surface's list, or empty.
 */
import {
  ASK_PAGES,
  askJump,
  buildAskSuggestions,
  detectLanguage,
  fastPath,
  scopeFromRoute,
  type AskLanguage,
  type AskMessageVM,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type AskThreadVM,
  type FastPath,
  type JumpEntry,
  type NotificationItem,
} from "@chanlytics/contracts";
import { feedFromGlobals } from "./notifications";
import { fetchEnvelope, scoped, type Workspace } from "./surface-data";
import { clearSurfaceCache } from "./surface-cache";

interface Globals {
  INBOX_DATA?: { THREADS?: Array<{ id: string; real?: boolean; who: string; conversationId?: string; needsYou?: boolean; veto?: unknown; heldDraft?: unknown }> };
  __LIVE?: { now?: Array<{ callId: string; who: string; missed: boolean; live: boolean; startedAtMs: number | null }>; recent?: Array<{ callId: string; who: string; missed: boolean; live: boolean; startedAtMs: number | null }> };
  __PEOPLE?: { rows?: Array<{ id: string; name: string; threadId?: string | null }> } | null;
  __SETTINGS?: { config?: { calendar?: { ical_url?: string } } | null } | null;
  __WORKSPACES?: Workspace[];
  __ACTIVE_WORKSPACE?: string | null;
  __DEMO_MODE?: boolean;
  __TEAM_INVITES?: unknown[] | null;
}

export type SendEvent =
  | { t: "thread"; id: string; title: string }
  | { t: "trace"; text: string }
  | { t: "delta"; text: string }
  | { t: "final"; message: AskMessageVM }
  | { t: "error"; text: string };

export interface AskApi {
  /** Pages, people, threads and calls the browser holds, for the jump list. */
  jumpIndex(): JumpEntry[];
  jump(query: string): JumpEntry[];
  suggestions(surface: AskSurface, scope: AskScope | null, language?: AskLanguage): AskSuggestion[];
  /** The bell's rows, for "Right now". */
  rightNow(): NotificationItem[];
  fast(question: string): FastPath;
  openings(day: string | null, service: string | null): Promise<{ state: string; text: string; days: Array<{ key: string; label: string; windows: string[] }> }>;
  threads(): Promise<AskThreadVM[]>;
  thread(id: string): Promise<{ thread: AskThreadVM; messages: AskMessageVM[] } | null>;
  deleteThread(id: string): Promise<boolean>;
  send(input: { text: string; threadId: string | null; scope: AskScope | null; surface: AskSurface }, on: (ev: SendEvent) => void): Promise<void>;
  scopeFor(page: string, param: string | null, label?: string | null): AskScope | null;
  surfaceFor(page: string): AskSurface;
  language(text?: string): AskLanguage;
  timezone(): string | null;
  canSpeak(): boolean;
  speak(text: string, lang?: AskLanguage): boolean;
  stopSpeaking(): void;
}

const LAST_LANGUAGE_KEY = "chanlytics:ask:lang";

function g(win: Window): Globals {
  return win as unknown as Globals;
}

export function jumpIndexFrom(win: Window): JumpEntry[] {
  const w = g(win);
  const out: JumpEntry[] = [...ASK_PAGES];
  for (const t of w.INBOX_DATA?.THREADS ?? []) {
    if (!t.real) continue;
    out.push({ label: `${t.who} — thread`, to: `inbox/${t.id}`, kind: "thread", sub: t.needsYou ? "needs you" : undefined });
  }
  for (const p of w.__PEOPLE?.rows ?? []) out.push({ label: p.name, to: `clients/${p.id}`, kind: "person" });
  for (const c of [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])]) {
    out.push({ label: `${c.who} — call`, to: `conversations/cv-${c.callId}`, kind: "call", sub: c.live ? "live" : c.missed ? "missed" : undefined });
  }
  return out;
}

export function surfaceFor(page: string): AskSurface {
  switch (page) {
    case "today": return "today";
    case "inbox": return "inbox";
    case "clients": return "people";
    case "conversations": return "conversations";
    case "live": return "live";
    case "reports": return "reports";
    case "admin": return "settings";
    default: return "other";
  }
}

function activeWorkspace(win: Window): Workspace | null {
  const w = g(win);
  const id = w.__ACTIVE_WORKSPACE ?? null;
  return (w.__WORKSPACES ?? []).find((x) => x.id === id) ?? (w.__WORKSPACES ?? [])[0] ?? null;
}

/** Read a stream of JSON lines, one event per line. */
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

export function installAsk(win: Window = window, storage: Storage | null = safeStorage()): AskApi {
  const w = g(win);
  const rememberLanguage = (l: AskLanguage) => {
    if (l === "other") return;
    try { storage?.setItem(LAST_LANGUAGE_KEY, l); } catch { /* fine */ }
  };
  const lastLanguage = (): AskLanguage => {
    try {
      const v = storage?.getItem(LAST_LANGUAGE_KEY);
      return v === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  };

  const api: AskApi = {
    jumpIndex: () => jumpIndexFrom(win),
    jump: (query) => askJump(query, jumpIndexFrom(win)),
    rightNow: () => feedFromGlobals(w as Parameters<typeof feedFromGlobals>[0], Date.now()),
    suggestions: (surface, scope, language) => {
      const feed = api.rightNow();
      const calls = [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])];
      const today = new Date().toDateString();
      return buildAskSuggestions({
        surface,
        language: language ?? lastLanguage(),
        needsYou: feed.filter((i) => i.kind === "needs_you").length,
        heldDrafts: feed.filter((i) => i.kind === "held_draft").length,
        missedToday: calls.filter((c) => c.missed && c.startedAtMs && new Date(c.startedAtMs).toDateString() === today).length,
        liveNow: calls.filter((c) => c.live).length,
        hasCalendar: !!w.__SETTINGS?.config?.calendar?.ical_url,
        scope,
      });
    },
    fast: (question) => {
      const calls = [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])];
      const language = api.language(question);
      return fastPath(question, { feed: api.rightNow(), calls, now: Date.now(), language, timezone: api.timezone() });
    },
    openings: async (day, service) => {
      const qs = new URLSearchParams();
      if (day) qs.set("day", day);
      if (service) qs.set("service", service);
      const r = await fetchEnvelope<{ openings: { state: string; text: string; days: Array<{ key: string; label: string; windows: string[] }> } }>(`/api/v1/ask/openings?${qs}`);
      return r.openings;
    },
    threads: async () => {
      try {
        const r = await fetchEnvelope<{ threads: AskThreadVM[] }>("/api/v1/ask/threads");
        return r.threads;
      } catch {
        return [];
      }
    },
    thread: async (id) => {
      try {
        return await fetchEnvelope<{ thread: AskThreadVM; messages: AskMessageVM[] }>(`/api/v1/ask/threads/${encodeURIComponent(id)}`);
      } catch {
        return null;
      }
    },
    deleteThread: async (id) => {
      try {
        const res = await win.fetch(scoped(`/api/v1/ask/threads/${encodeURIComponent(id)}`), { method: "DELETE" });
        return res.ok;
      } catch {
        return false;
      }
    },
    send: async (input, on) => {
      const language = api.language(input.text);
      rememberLanguage(language);
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
    scopeFor: (page, param, label) => scopeFromRoute(page, param, label),
    surfaceFor,
    language: (text) => (text ? (detectLanguage(text) === "other" ? lastLanguage() : detectLanguage(text)) : lastLanguage()),
    timezone: () => activeWorkspace(win)?.timezone ?? null,
    canSpeak: () => typeof win.speechSynthesis !== "undefined" && typeof (win as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance !== "undefined",
    speak: (text, lang) => {
      if (!api.canSpeak()) return false;
      try {
        const U = (win as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance;
        const u = new U(text);
        u.lang = lang === "es" ? "es-ES" : "en-US";
        u.rate = 1.02;
        win.speechSynthesis.cancel();
        win.speechSynthesis.speak(u);
        return true;
      } catch {
        return false;
      }
    },
    stopSpeaking: () => {
      try { win.speechSynthesis?.cancel(); } catch { /* fine */ }
    },
  };
  (win as unknown as { __ask?: AskApi }).__ask = api;
  return api;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
