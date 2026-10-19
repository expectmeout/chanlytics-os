/**
 * What the Line shows before a model is asked, from what the browser already
 * holds: the jump index, the suggestions, who is waiting (Today's queue and the
 * runs waiting for a yes), the three quick questions, the scope of the current
 * route, the language, and an answer as it is drawn (its parts and one door per
 * place). Every rule is the contract's; this module only feeds it the surfaces.
 */
import {
  ROLE_PERMS,
  answerFromV1,
  answerText,
  askIntent,
  askJump,
  askPages,
  bellCalls,
  buildAskSuggestions,
  callJumpSub,
  callsAnswer,
  callsToday,
  detectLanguage,
  isHoldRow,
  needsAnswer,
  oneDoor,
  openingsAnswer,
  rightNowCounts,
  rightNowLine,
  runHeldEmails,
  runDraftedEmails,
  runLabelOf,
  runTitleOf,
  runsThatWait,
  sameQuestion,
  scopeFromRoute,
  stoppedAnswer,
  type AskAnswer,
  type AskLanguage,
  type AskMessageVM,
  type AskOpeningsView,
  type AskScope,
  type AskSuggestion,
  type AskSurface,
  type AskWaiting,
  type FeedLive,
  type JumpEntry,
  type TodayQueueRowVM,
  type Waits,
} from "@chanlytics/contracts";
import { surfaceValue } from "@/surfaces/surface-values";
import { needsYouParts } from "@/surfaces/needs-you";
import { approvalDaysNow } from "@/surfaces/campaigns/broadcasts/when-words";
import { pageClock } from "@/legacy-bridge/zone";
import { focusAsDrawn } from "@/surfaces/legacy-verbs";
import { feedFromGlobals } from "../notifications";
import type { Workspace } from "../surface-data";

/** A playbook's run as the broadcasts surface publishes it, as far as who is waiting reads it. */
interface Run {
  id: string;
  state: string;
  /** The playbook that made it, and the day it was made for: what the approve verb asks of its day. */
  playbook_id: string | null;
  run_for?: string | null;
  recipient_count: number;
  when: string;
  counts: { sent: number; replied: number };
  audience?: { label?: string } | null;
  /** Its own name: what says a reach-out's run, whose audience carries no label (contracts runLabelOf). */
  name: string;
}

export interface PaletteGlobals {
  INBOX_DATA?: { THREADS?: Array<{ id: string; real?: boolean; who: string; needsYou?: boolean }> };
  /** Live's value: the calls on the line, the page's recent few, and every missed call still news (uncapped). */
  __LIVE?: FeedLive;
  __PEOPLE?: { rows?: Array<{ id: string; name: string }>; dealsOn?: boolean } | null;
  __SETTINGS?: { config?: { calendar?: { ical_url?: string }; features?: unknown } | null } | null;
  __WORKSPACES?: Workspace[];
  __ACTIVE_WORKSPACE?: string | null;
  /** Who is looking: their role, and whether they are Chanlytics staff (the back office's jump is theirs alone). */
  __ME?: { role?: string | null; platform_admin?: boolean } | null;
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
    /** The threads' part of what waits on you: the holds, and the replies counting down (which have no row). */
    needsYou?: { count: number; holds?: number; sends?: number } | null;
  } | null;
  __BROADCASTS?: { rows?: Run[] } | null;
  /**
   * The Leads surface (leads.ts): the ideas and the searches, as the Leads chips read them. An idea is asked as its plan
   * in words (`ask`, 00398), so the plan Ask proposes is the plan the idea opens; one kept from before says its words.
   */
  __LEADS?: {
    suggestions?: { items?: { words: string; ask?: string }[] } | null;
    searches?: { asked: string }[];
  } | null;
}

const LAST_LANGUAGE_KEY = "chanlytics:ask:lang";

/**
 * Where the person is, from the route. Leads and the Pipeline are People's `leads` and `pipeline` params
 * (clients/leads:s-<id>, clients/pipeline:v-<view>); the three campaign pages are one surface; Settings is admin.
 */
export function surfaceFor(page: string, param?: string | null): AskSurface {
  if (page === "clients" && typeof param === "string" && param.startsWith("leads")) return "leads";
  if (page === "clients" && typeof param === "string" && param.startsWith("pipeline")) return "pipeline";
  switch (page) {
    case "today":
      return "today";
    case "inbox":
      return "inbox";
    // People, and People › Lists (surface-registry.ts): People's own page of lists.
    case "clients":
    case "segments":
      return "people";
    case "conversations":
      return "conversations";
    case "live":
      return "live";
    case "reports":
      return "reports";
    case "admin":
      return "settings";
    case "calendar":
      return "calendar";
    case "campaigns":
    case "outbound":
    case "broadcasts":
    case "messages":
      return "campaigns";
    case "start":
      return "start";
    default:
      return "other";
  }
}

/**
 * What ⌘K jumps to: the pages this workspace has for this person (contracts askPages: the Pipeline where People says
 * deals are on, the bit its scope strip draws by; the back office for staff, the bit Settings' rail draws by), then
 * the threads, people and calls the browser holds.
 */
export function jumpIndexFrom(win: Window): JumpEntry[] {
  const w = win as unknown as PaletteGlobals;
  const out: JumpEntry[] = askPages({
    dealsOn: !!w.__PEOPLE?.dealsOn,
    platformAdmin: !!w.__ME?.platform_admin,
  });
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
  for (const c of bellCalls(w.__LIVE)) {
    out.push({ label: `${c.who} — call`, to: `conversations/cv-${c.callId}`, kind: "call", sub: callJumpSub(c) });
  }
  return out;
}

/** One queue row as Ask draws a person: who, where, when, and their own words or the row's sentence. */
const askRowOf = (
  r: Pick<
    TodayQueueRowVM,
    "id" | "conversationId" | "callId" | "who" | "channel" | "when" | "sentence" | "quoted" | "cta"
  >,
) => ({
  id: r.conversationId ?? r.callId ?? r.id,
  kind: r.conversationId ? ("thread" as const) : ("call" as const),
  who: r.who,
  channel: r.channel,
  when: r.when,
  line: r.quoted ? `“${r.sentence}”` : r.sentence,
  to: r.cta.to,
});

/**
 * Who is waiting on you: the holds in Today's queue (isHoldRow: a closing window is said as a window, a call worth a
 * listen is nobody waiting) and how many more wait past them (the one count's holds and replies counting down, the
 * badge's parts), the playbook runs waiting for a yes that an approval can still send (the count's own rule), the
 * searches that stopped to ask, and the reply windows closing (the wiring's second audit, S7-8 and W-thread-wait-step-4).
 * Null until Today's queue has been read: nobody is claimed to be waiting.
 */
export function waitingFrom(win: Window, parts: Waits | null = needsYouParts()): AskWaiting | null {
  const w = win as unknown as PaletteGlobals;
  const queue = w.TODAY_DATA?.queue;
  if (!queue) return null;
  const rows = queue.rows ?? [];
  const people = rows.filter(isHoldRow).map(askRowOf);
  const windows = rows.filter((r) => r.kind === "window").map(askRowOf);
  const searches = rows
    .filter((r) => r.kind === "search")
    .map((r) => ({ id: r.id, name: r.who, question: r.sentence, to: r.cta.to }));
  const threadsWaiting = parts ? parts.holds + parts.sends : (w.TODAY_DATA?.needsYou?.count ?? people.length);
  // A run waiting for approval, or a going one whose emails the check holds (the count's own rule, runWaitsOnYou).
  const pending = (w.__BROADCASTS?.rows ?? []).filter(
    (r) => r.state === "pending_approval" || runHeldEmails(r) > 0 || runDraftedEmails(r) > 0,
  );
  // The business's days, by this window's clock, asked only over runs to judge.
  const runs = pending.length ? runsThatWait(pending, approvalDaysNow(Date.now(), pageClock(win))) : [];
  return {
    people,
    more: Math.max(0, threadsWaiting - people.length),
    runs: runs.map((r) => ({
      id: r.id,
      // A campaign's run by its campaign (its audience's label), a one-off by its own name, as Today's card says them: a
      // one-off sent to a list was named for the list (18 Oct 2026, the sample walk).
      label: r.playbook_id ? runLabelOf(r) : runTitleOf(r),
      reach: r.recipient_count,
      to: `broadcasts/run:${r.id}`,
    })),
    searches,
    windows,
  };
}

/**
 * Campaigns' own chips' input (contracts buildAskSuggestions, the moment spec A3): each campaign the playbooks surface
 * read, by its name, moment and state and whether a run of it waits; null until it is read, so no chip is offered on
 * a guess.
 */
function campaignsRead() {
  const rows = surfaceValue("playbooks")?.rows;
  return rows
    ? {
        rows: rows.map((r) => ({
          name: r.name,
          trigger: r.trigger,
          runs: r.runs,
          waiting: !!r.totals?.waiting,
        })),
      }
    : null;
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
  // Every call Live holds, each once: the page's recent few are not all of today's (Live's missedCalls is uncapped).
  const calls = () => bellCalls(w.__LIVE);
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
    /** The sentence and the counts it was built from (the Stage's pills, spec 4.3). */
    rightNowParts: (
      lang?: AskLanguage,
    ): { sentence: string; people: number; runs: number; searches: number; windows: number } => {
      const w = waiting();
      return { sentence: rightNowLine(w, lang ?? lastLanguage()), ...rightNowCounts(w) };
    },
    suggestions: (surface: AskSurface, scope: AskScope | null, lang?: AskLanguage): AskSuggestion[] => {
      const feed = feedFromGlobals(w as Parameters<typeof feedFromGlobals>[0], Date.now());
      const who = waiting();
      // The business's today: a call missed at 1 AM where the business is counts as that day's, whatever day the browser says.
      const tz = timezone();
      return buildAskSuggestions({
        surface,
        language: lang ?? lastLanguage(),
        needsYou: rightNowCounts(who).people,
        heldDrafts: feed.filter((i) => i.kind === "held_draft").length,
        // The count the quick answer gives (callsToday): a dial the receptionist placed is not a missed call.
        missedToday: tz ? callsToday(calls(), Date.now(), tz).missed.length : 0,
        // On the line by the heartbeat (callsToday's own count), never `live` alone.
        liveNow: callsToday(calls(), Date.now(), tz).live.length,
        hasCalendar: !!w.__SETTINGS?.config?.calendar?.ical_url,
        scope,
        // Whoever acts in the workspace (owner, operator, partner): the one table, as the pages' canDo("approve").
        canAct: !!ROLE_PERMS[w.__ME?.role as keyof typeof ROLE_PERMS]?.approve,
        // People's surface says whether deals are on here (0008); until it does, the question is not offered.
        dealsOn: !!w.__PEOPLE?.dealsOn,
        // On Leads: the first day's ideas, else the latest two searches' own words; the leads bridge publishes both.
        leadIdeas: (w.__LEADS?.suggestions?.items ?? []).map((i) => i.ask || i.words),
        leadSearches: (w.__LEADS?.searches ?? []).map((s) => s.asked),
        // On Campaigns: the campaigns the playbooks surface read, each by name, moment, state and a run that waits.
        campaigns: campaignsRead(),
      });
    },
    /** Which of the three quick questions this is, if any; the answer is quickAnswer's. */
    intent: (question: string) => askIntent(question, Date.now(), timezone()),
    callsToday: () => callsToday(calls(), Date.now(), timezone()),
    /** What an answer shows, decided once: the Line's answer (plan 3) or today's read back, with one door per place. */
    answer: (m: AskMessageVM): { answer: AskAnswer; cardOpen: Record<string, boolean> } =>
      oneDoor(m.answer ?? answerFromV1(m), m.proposals ?? []),
    /**
     * A conversation as its questions and the answers to them, in order. A run of questions is paired with the run of
     * answers after it, oldest with oldest: a turn saved after the next question was asked (a Stop that reached no
     * server, before 15 Oct 2026) answers its own question, never the newer one. Fewer answers than questions go to the
     * newest, and an older question whose turn never landed stands unanswered.
     */
    turns: <M extends { role: string }>(messages: readonly M[]): Array<{ q: M | null; a: M | null }> => {
      const out: Array<{ q: M | null; a: M | null }> = [];
      for (let i = 0; i < messages.length;) {
        let j = i;
        while (j < messages.length && messages[j]?.role === "user") j++;
        let k = j;
        while (k < messages.length && messages[k]?.role !== "user") k++;
        const [qs, as] = [messages.slice(i, j), messages.slice(j, k)];
        const unanswered = Math.max(0, qs.length - as.length);
        qs.forEach((q, n) => out.push({ q, a: n < unanswered ? null : (as[n - unanswered] ?? null) }));
        for (const a of as.slice(qs.length)) out.push({ q: null, a });
        i = k;
      }
      return out;
    },
    /**
     * A turn the person stopped, as the Line draws it the moment Stop is pressed: what its Say had written under the
     * words that say it stopped, the answer the server keeps on the thread (contracts stoppedAnswer).
     */
    stoppedTurn: (said: { headline: string; detail: string } | null, lang?: AskLanguage): AskMessageVM => {
      const answer = stoppedAnswer(said, lang ?? lastLanguage());
      const at = new Date();
      return {
        id: `s-${at.getTime()}`,
        role: "assistant",
        text: answerText(answer),
        at: at.toISOString(),
        atMs: at.getTime(),
        citations: [],
        followups: [],
        navigate: null,
        proposals: [],
        language: answer.language,
        ungrounded: false,
        tools: [],
        latencyMs: null,
        failed: true,
        answer,
      };
    },
    // A reach-out's drawer is told from a campaign's by the chains the page read (contracts scopeFromRoute); a person on
    // any of their tabs is named by their People row (personLabelOf).
    scopeFor: (page: string, param: string | null, label?: string | null) => {
      const scope = scopeFromRoute(page, param, label, surfaceValue("reach_outs"));
      return scope?.kind === "person" && !label ? { ...scope, label: personLabelOf(scope.id) ?? scope.label } : scope;
    },
    surfaceFor,
    language,
    rememberLanguage,
    timezone,
    sameQuestion,
    /** Whether the Line's field may take focus as it opens: not on a touch screen, whatever its width (legacy-verbs). */
    focusAsDrawn,
  };
}

/**
 * The name Ask's scope says for a person, on any of their tabs (the scope reads the address by contracts personRouteOf):
 * their People row's, never a stand-in's (its name is the business's, so "this person", 0052); null where People holds
 * none of them.
 */
function personLabelOf(id: string): string | null {
  const row = surfaceValue("people")?.rows?.find((r) => r.id === id);
  return row && !row.standIn ? row.name : null;
}

/** The openings route as the quick answer reads it (ask/api.ts `openings`). */
type Openings = (
  day: string | null,
  service: string | null,
) => Promise<{
  state: string;
  days?: Array<{ key: string; label: string; windows: string[] }>;
  instead?: AskOpeningsView["instead"];
}>;

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
          {
            state: o.state === "ok" || o.state === "no_calendar" ? o.state : "unavailable",
            days: o.days ?? [],
            instead: o.instead ?? null,
          },
          lang,
          intent.day,
        ),
      )
      .catch(() => openingsAnswer({ state: "unavailable", days: [] }, lang));
  };
}
