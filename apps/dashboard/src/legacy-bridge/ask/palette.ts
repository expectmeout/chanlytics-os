/**
 * What the Line shows before a model is asked, from what the browser already
 * holds: the jump index, the suggestions, who is waiting (Today's queue and the
 * runs waiting for a yes), the three quick questions, the scope of the current
 * route, the language, and an answer as it is drawn (its parts and one door per
 * place). Every rule is the contract's; this module only feeds it the surfaces.
 */
import {
  ASK_PAGES,
  answerFromV1,
  askIntent,
  askJump,
  buildAskSuggestions,
  callsAnswer,
  callsToday,
  detectLanguage,
  needsAnswer,
  oneDoor,
  openingsAnswer,
  rightNowLine,
  sameQuestion,
  scopeFromRoute,
  todayRunWords,
  zoneDayKey,
  type AskAnswer,
  type AskLanguage,
  type AskMessageVM,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type AskWaiting,
  type JumpEntry,
  type TodayQueueRowVM,
} from "@chanlytics/contracts";
import { feedFromGlobals } from "../notifications";
import type { Workspace } from "../surface-data";

interface Call {
  callId: string;
  who: string;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

/** A playbook's run as the broadcasts surface publishes it, as far as who is waiting reads it. */
interface Run {
  id: string;
  state: string;
  recipient_count: number;
  when: string;
  counts: { sent: number; replied: number };
  audience?: { label?: string } | null;
}

export interface PaletteGlobals {
  INBOX_DATA?: { THREADS?: Array<{ id: string; real?: boolean; who: string; needsYou?: boolean }> };
  __LIVE?: { now?: Call[]; recent?: Call[] };
  __PEOPLE?: { rows?: Array<{ id: string; name: string }>; dealsOn?: boolean } | null;
  __SETTINGS?: { config?: { calendar?: { ical_url?: string } } | null } | null;
  __WORKSPACES?: Workspace[];
  __ACTIVE_WORKSPACE?: string | null;
  __ME?: { role?: string | null } | null;
  __TEAM_INVITES?: unknown[] | null;
  /** Today's view model: its queue is who is waiting on you (every surface starts at boot, LegacyApp.tsx). */
  TODAY_DATA?: {
    queue?: {
      rows?: Array<
        Pick<
          TodayQueueRowVM,
          "id" | "kind" | "conversationId" | "callId" | "who" | "channel" | "when" | "sentence" | "quoted" | "cta"
        >
      >;
    };
  } | null;
  __BROADCASTS?: { rows?: Run[] } | null;
}

const LAST_LANGUAGE_KEY = "chanlytics:ask:lang";

export function surfaceFor(page: string): AskSurface {
  switch (page) {
    case "today":
      return "today";
    case "inbox":
      return "inbox";
    case "clients":
      return "people";
    case "conversations":
      return "conversations";
    case "live":
      return "live";
    case "reports":
      return "reports";
    case "admin":
      return "settings";
    default:
      return "other";
  }
}

export function jumpIndexFrom(win: Window): JumpEntry[] {
  const w = win as unknown as PaletteGlobals;
  const out: JumpEntry[] = [...ASK_PAGES];
  for (const t of w.INBOX_DATA?.THREADS ?? []) {
    if (!t.real) continue;
    out.push({
      label: `${t.who} — thread`,
      to: `inbox/${t.id}`,
      kind: "thread",
      sub: t.needsYou ? "needs you" : undefined,
    });
  }
  for (const p of w.__PEOPLE?.rows ?? []) out.push({ label: p.name, to: `clients/${p.id}`, kind: "person" });
  for (const c of [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])]) {
    out.push({
      label: `${c.who} — call`,
      to: `conversations/cv-${c.callId}`,
      kind: "call",
      sub: c.live ? "live" : c.missed ? "missed" : undefined,
    });
  }
  return out;
}

/**
 * Who is waiting on you: the people in Today's queue (a call worth a listen is not someone waiting), and the playbook
 * runs waiting for a yes, which the queue draws the same way (dashboard-a-command.jsx runsPending).
 */
export function waitingFrom(win: Window): AskWaiting {
  const w = win as unknown as PaletteGlobals;
  return {
    people: (w.TODAY_DATA?.queue?.rows ?? [])
      .filter((r) => r.kind !== "call")
      .map((r) => ({
        id: r.conversationId ?? r.callId ?? r.id,
        kind: r.conversationId ? ("thread" as const) : ("call" as const),
        who: r.who,
        channel: r.channel,
        when: r.when,
        line: r.quoted ? `“${r.sentence}”` : r.sentence,
        to: r.cta.to,
      })),
    runs: (w.__BROADCASTS?.rows ?? [])
      .filter((r) => r.state === "pending_approval")
      .map((r) => ({
        id: r.id,
        label: r.audience?.label || "Playbook",
        line: todayRunWords(r).waiting.sentence,
        to: `broadcasts/run:${r.id}`,
      })),
  };
}

export function askPalette(win: Window, storage: Storage | null) {
  const w = win as unknown as PaletteGlobals;
  const rememberLanguage = (l: AskLanguage) => {
    if (l === "other") return;
    try {
      storage?.setItem(LAST_LANGUAGE_KEY, l);
    } catch {
      /* fine */
    }
  };
  const lastLanguage = (): AskLanguage => {
    try {
      return storage?.getItem(LAST_LANGUAGE_KEY) === "es" ? "es" : "en";
    } catch {
      return "en";
    }
  };
  const activeWorkspace = (): Workspace | null => {
    const id = w.__ACTIVE_WORKSPACE ?? null;
    return (w.__WORKSPACES ?? []).find((x) => x.id === id) ?? null;
  };
  const calls = () => [...(w.__LIVE?.now ?? []), ...(w.__LIVE?.recent ?? [])];
  const timezone = () => activeWorkspace()?.timezone ?? null;
  const language = (text?: string): AskLanguage => {
    if (!text) return lastLanguage();
    const l = detectLanguage(text);
    return l === "other" ? lastLanguage() : l;
  };
  const waiting = () => waitingFrom(win);
  return {
    jumpIndex: () => jumpIndexFrom(win),
    jump: (query: string) => askJump(query, jumpIndexFrom(win)),
    waiting,
    /** Right now, in a sentence: Today's queue itself (the Line, D7), on every page. */
    rightNow: (lang?: AskLanguage) => rightNowLine(waiting(), lang ?? lastLanguage()),
    suggestions: (surface: AskSurface, scope: AskScope | null, lang?: AskLanguage): AskSuggestion[] => {
      const feed = feedFromGlobals(w as Parameters<typeof feedFromGlobals>[0], Date.now());
      // The business's today (clock.ts): a call missed at 1 AM where the business is counts as that day's, whatever day the browser says.
      const tz = timezone();
      const today = tz ? zoneDayKey(Date.now(), tz) : null;
      return buildAskSuggestions({
        surface,
        language: lang ?? lastLanguage(),
        needsYou: waiting().people.length,
        heldDrafts: feed.filter((i) => i.kind === "held_draft").length,
        missedToday: tz
          ? calls().filter((c) => c.missed && c.startedAtMs && zoneDayKey(c.startedAtMs, tz) === today).length
          : 0,
        liveNow: calls().filter((c) => c.live).length,
        hasCalendar: !!w.__SETTINGS?.config?.calendar?.ical_url,
        scope,
        canAct: w.__ME?.role === "owner" || w.__ME?.role === "operator",
        // People's surface says whether deals are a thing here (0004); until it does, the question is not offered.
        dealsOn: !!w.__PEOPLE?.dealsOn,
      });
    },
    /** Which of the three quick questions this is, if any; the answer is quickAnswer's. */
    intent: (question: string) => askIntent(question, Date.now(), timezone()),
    callsToday: () => callsToday(calls(), Date.now(), timezone()),
    /** What an answer shows, decided once: the Line's answer (plan 3) or today's read back, with one door per place. */
    answer: (m: AskMessageVM): { answer: AskAnswer; cardOpen: Record<string, boolean> } =>
      oneDoor(m.answer ?? answerFromV1(m), m.proposals ?? []),
    scopeFor: (page: string, param: string | null, label?: string | null) => scopeFromRoute(page, param, label),
    surfaceFor,
    language,
    rememberLanguage,
    timezone,
    sameQuestion,
  };
}

/** The openings route as the quick answer reads it (ask/api.ts `openings`). */
type Openings = (
  day: string | null,
  service: string | null,
) => Promise<{ state: string; days?: Array<{ key: string; label: string; windows: string[] }> }>;

/**
 * A quick question's answer, without a model: who needs me from Today's queue, today's calls, or the openings route's
 * days; null for every other question, which is the model's. The sentences are contracts' (ask-answer.ts).
 */
export function quickAnswer(p: ReturnType<typeof askPalette>, openings: Openings) {
  return (question: string): Promise<AskAnswer> | null => {
    const intent = p.intent(question);
    if (!intent) return null;
    const lang = p.language(question);
    if (intent.kind === "needs") return Promise.resolve(needsAnswer(p.waiting(), lang));
    if (intent.kind === "calls") {
      const c = p.callsToday();
      return Promise.resolve(callsAnswer(c.missed, c.live, lang));
    }
    return openings(intent.day, intent.service)
      .then((o) =>
        openingsAnswer(
          { state: o.state === "ok" || o.state === "no_calendar" ? o.state : "unavailable", days: o.days ?? [] },
          lang,
        ),
      )
      .catch(() => openingsAnswer({ state: "unavailable", days: [] }, lang));
  };
}
