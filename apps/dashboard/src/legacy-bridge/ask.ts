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
  PROPOSAL_GATE,
  applySettingsChange,
  askJump,
  buildAskSuggestions,
  detectLanguage,
  fastPath,
  scopeFromRoute,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskProposalOutcome,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type AskThreadVM,
  type FastPath,
  type JumpEntry,
  type NotificationItem,
} from "@chanlytics/contracts";
import { feedFromGlobals } from "./notifications";
import { fetchEnvelope, invalidateInFlight, scoped, type Workspace } from "./surface-data";
import { clearSurfaceCache } from "./surface-cache";

// The surface refreshers are published on the window by inbox-verbs.ts
// (installInboxVerbs); reaching them there keeps this module free of the
// Next-only imports behind it, so the rule can be executed in a test.
type Refreshers = { __refreshInbox?: () => Promise<void>; __refreshSettings?: () => Promise<void>; __refreshLive?: () => Promise<void> };
const refreshInbox = async (win: Window) => { await (win as unknown as Refreshers).__refreshInbox?.(); };
const refreshSettings = async (win: Window) => { await (win as unknown as Refreshers).__refreshSettings?.(); };
const refreshLive = async (win: Window) => { await (win as unknown as Refreshers).__refreshLive?.(); };

interface Globals {
  INBOX_DATA?: { THREADS?: Array<{ id: string; real?: boolean; who: string; conversationId?: string; needsYou?: boolean; veto?: unknown; heldDraft?: unknown }> };
  __LIVE?: { now?: Array<{ callId: string; who: string; missed: boolean; live: boolean; startedAtMs: number | null }>; recent?: Array<{ callId: string; who: string; missed: boolean; live: boolean; startedAtMs: number | null }> };
  __PEOPLE?: { rows?: Array<{ id: string; name: string; threadId?: string | null }> } | null;
  __SETTINGS?: { config?: ({ calendar?: { ical_url?: string } } & Record<string, unknown>) | null; version?: number } | null;
  __POLICIES?: { rows?: Array<{ class: string; mode: string; limits?: Record<string, unknown> }> } | null;
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
  /** Approve a card: the verb's own route, then the surfaces refresh. */
  commit(p: AskProposal): Promise<CommitResult>;
  /** Undo a committed card, where the verb has one. */
  undo(p: AskProposal, outcome: AskProposalOutcome): Promise<CommitResult>;
  /** Record what became of a card on the turn that proposed it. */
  outcome(messageId: string, proposalId: string, o: AskProposalOutcome): Promise<boolean>;
  /** "Edit in the composer": open the thread with the words ready to change. */
  editReply(p: AskProposal): void;
}

export type CommitResult = { ok: true; receipt: string; undo: Record<string, unknown> | null } | { ok: false; message: string };

/** A same-origin call through the app's own route, marked as a card's. */
async function viaAsk(win: Window, url: string, body?: unknown, method: "POST" | "PUT" | "DELETE" = "POST"): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
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

const THREAD_ROUTE: Record<string, string> = { take_over: "take-over", hand_back: "hand-back", snooze: "snooze", wake: "wake", archive: "archive" };
const INVERSE: Record<string, string> = { take_over: "hand_back", hand_back: "take_over", snooze: "wake", wake: "snooze" };

async function commitProposal(win: Window, w: Globals, p: AskProposal): Promise<CommitResult> {
  const pl = p.payload as Record<string, unknown>;
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(win, `/api/v1/conversations/${pl.conversation_id}/reply`, { text: pl.text });
      if (!r.ok) return r;
      await refreshInbox(win);
      return { ok: true, receipt: `Sent to ${pl.who} — cancel within 15 seconds`, undo: { message_id: r.data.message_id, cancelable_until: r.data.cancelable_until } };
    }
    case "steer": {
      const r = await viaAsk(win, `/api/v1/messages/${pl.message_id}/steer`, { text: pl.instruction });
      if (!r.ok) return r;
      await refreshInbox(win);
      return { ok: true, receipt: "Rewritten — the new draft waits its turn", undo: null };
    }
    case "thread_verb": {
      const verb = String(pl.verb);
      const r = verb === "resolve"
        ? await viaAsk(win, `/api/v1/escalations/${pl.escalation_id}/resolve`)
        : await viaAsk(win, `/api/v1/conversations/${pl.conversation_id}/${THREAD_ROUTE[verb]}`, verb === "snooze" ? { until: pl.until } : undefined);
      if (!r.ok) return r;
      await refreshInbox(win);
      const RECEIPT: Record<string, string> = { take_over: `You have ${pl.who}'s thread`, hand_back: "The receptionist has it again", snooze: "Snoozed", wake: "Back in the Inbox", archive: "Archived", resolve: "Resolved" };
      return { ok: true, receipt: RECEIPT[verb] ?? "Done", undo: INVERSE[verb] ? { verb: INVERSE[verb], conversation_id: pl.conversation_id, until: pl.until ?? null } : null };
    }
    case "person_mode": {
      const r = await viaAsk(win, `/api/v1/contacts/${pl.contact_id}/receptionist`, { mode: pl.mode }, "PUT");
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return { ok: true, receipt: `Receptionist for ${pl.who}: ${pl.mode}`, undo: { contact_id: pl.contact_id, mode: pl.previous ?? "inherit" } };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: pl.class };
      if (pl.mode) body.mode = pl.mode;
      if (typeof pl.min_confidence === "number") body.minConfidence = pl.min_confidence;
      const r = await viaAsk(win, "/api/v1/policies", body, "PUT");
      if (!r.ok) return r;
      await refreshSettings(win);
      const prev = (pl.previous ?? {}) as { mode?: string | null; min_confidence?: number | null };
      return { ok: true, receipt: `Autonomy changed: ${p.summary}`, undo: { class: pl.class, mode: prev.mode ?? null, min_confidence: prev.min_confidence ?? null } };
    }
    case "settings": {
      const s = w.__SETTINGS;
      if (!s || !s.config || typeof s.version !== "number") return { ok: false, message: "Settings are not loaded yet — open Settings once and try again." };
      const before = s.config;
      const next = applySettingsChange(before as Parameters<typeof applySettingsChange>[0], pl.change as Parameters<typeof applySettingsChange>[1]);
      const r = await viaAsk(win, "/api/v1/settings", { config: next, version: s.version }, "PUT");
      if (!r.ok) return r;
      await refreshSettings(win);
      return { ok: true, receipt: p.summary, undo: { config: before } };
    }
    case "whisper": {
      const r = await viaAsk(win, `/api/v1/calls/${pl.call_id}/whisper`, { text: pl.text, trigger: false });
      if (!r.ok) return r;
      await refreshLive(win);
      return { ok: true, receipt: "Whispered — the receptionist works it into its next answer", undo: null };
    }
    case "invite": {
      const r = await viaAsk(win, "/api/v1/team/invite", { email: pl.email, role: pl.role });
      if (!r.ok) return r;
      await refreshSettings(win);
      return { ok: true, receipt: `Invited ${pl.email} as ${pl.role}`, undo: null };
    }
    default:
      return { ok: false, message: "This card cannot be approved from here." };
  }
}

async function undoProposal(win: Window, w: Globals, p: AskProposal, outcome: AskProposalOutcome): Promise<CommitResult> {
  const u = (outcome.undo ?? null) as Record<string, unknown> | null;
  if (!u) return { ok: false, message: "This one has no undo." };
  switch (p.kind) {
    case "reply": {
      const r = await viaAsk(win, `/api/v1/messages/${u.message_id}/cancel-send`);
      if (!r.ok) return r;
      await refreshInbox(win);
      return { ok: true, receipt: "Canceled before it sent", undo: null };
    }
    case "thread_verb": {
      const verb = String(u.verb);
      const r = await viaAsk(win, `/api/v1/conversations/${u.conversation_id}/${THREAD_ROUTE[verb]}`, verb === "snooze" ? { until: u.until } : undefined);
      if (!r.ok) return r;
      await refreshInbox(win);
      return { ok: true, receipt: "Undone", undo: null };
    }
    case "person_mode": {
      const r = await viaAsk(win, `/api/v1/contacts/${u.contact_id}/receptionist`, { mode: u.mode }, "PUT");
      if (!r.ok) return r;
      win.dispatchEvent(new CustomEvent("surface:clients"));
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "policy": {
      const body: Record<string, unknown> = { class: u.class };
      if (u.mode) body.mode = u.mode;
      if (typeof u.min_confidence === "number") body.minConfidence = u.min_confidence;
      if (!u.mode && typeof u.min_confidence !== "number") return { ok: false, message: "The previous setting is unknown; change it in Settings." };
      const r = await viaAsk(win, "/api/v1/policies", body, "PUT");
      if (!r.ok) return r;
      await refreshSettings(win);
      return { ok: true, receipt: "Set back", undo: null };
    }
    case "settings": {
      const s = w.__SETTINGS;
      if (!s || typeof s.version !== "number") return { ok: false, message: "Settings are not loaded yet." };
      const r = await viaAsk(win, "/api/v1/settings", { config: u.config, version: s.version }, "PUT");
      if (!r.ok) return r;
      await refreshSettings(win);
      return { ok: true, receipt: "Previous settings are back", undo: null };
    }
    default:
      return { ok: false, message: "This one has no undo." };
  }
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
    commit: (p) => commitProposal(win, w, p),
    undo: (p, o) => undoProposal(win, w, p, o),
    outcome: async (messageId, proposalId, o) => {
      if (!/^[0-9a-f-]{36}$/.test(messageId)) return false;
      const r = await viaAsk(win, `/api/v1/ask/messages/${messageId}/proposals/${encodeURIComponent(proposalId)}`, o);
      return r.ok;
    },
    editReply: (p) => {
      const pl = p.payload as Record<string, unknown>;
      win.location.hash = `/inbox/th-${pl.conversation_id}`;
      win.setTimeout(() => win.dispatchEvent(new CustomEvent("inbox:focus-composer", { detail: { text: String(pl.text ?? "") } })), 400);
    },
  };
  (win as unknown as { __ask?: AskApi; PROPOSAL_GATE?: typeof PROPOSAL_GATE }).__ask = api;
  (win as unknown as { PROPOSAL_GATE?: typeof PROPOSAL_GATE }).PROPOSAL_GATE = PROPOSAL_GATE;
  return api;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
