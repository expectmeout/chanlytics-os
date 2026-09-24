/**
 * The first run (docs/superpowers/specs/2026-09-24-first-run-design.md): Setup's own rows, one step to a screen at
 * `#/start`, with the owner's receptionist filling in beside them, and what is left afterwards as one card on Today.
 *
 * Nothing here is stored. The step a workspace is on is worked out from Setup's view model on every draw, so the first
 * run resumes from what is true: a line bought in another tab moves the owner on, and a fact taken away in Settings
 * brings them back. Every sentence the first run says is here; the page composes (first-run.jsx).
 */
import { formatPhoneDisplay } from "./phone";
import { greetingFor } from "./greeting";
import { initialsOf } from "./viewmodels";
import { openWeekWords, servicesWords, type ServiceWordsInput } from "./business-tab";
import type { Hours } from "./config";
import type { SetupDto, SetupRowVM, SetupState, SetupVM } from "./setup";

/** The first run's address: `#/start`, and `#/start/<step>` for a step already reached. */
export const FIRST_RUN_ROUTE = "start";

/** Where one step opens: a door that names a row sends the owner to the step that draws it. */
export function firstRunStepRoute(key: FirstRunStepKey): string {
  return `${FIRST_RUN_ROUTE}/${key}`;
}

/** The tab's own memory that this session has landed on the first run once: Today does not send it back again. */
export const FIRST_RUN_LANDED_KEY = "chanlytics.setup.landed";

/** What a door to the first run says, wherever it is: Connections, the bell, Today's card. */
export const FINISH_SETTING_UP = "Finish setting up";

export type FirstRunStepKey = "business" | "phone" | "try" | "live";

/** What is left once the receptionist answers, on Live: Setup's rows no step asks for. */
const LIVE_ROWS = ["whatsapp", "calendar", "team", "email", "yes"] as const;

interface FirstRunStepDef {
  key: FirstRunStepKey;
  /** On the rail, in the phone's step line and as the step's heading. */
  name: string;
  /** What the step is for, under its heading. */
  lead: string;
  /** Setup's rows the step draws, in this order; a row the workspace does not have is left out. */
  rows: readonly string[];
  /** The rows that must be ready for the step to be done; a row the workspace does not have is not waited for. */
  needs: readonly string[];
}

export const FIRST_RUN_STEPS: readonly FirstRunStepDef[] = [
  {
    key: "business",
    name: "Your business",
    lead: "What your receptionist says about you: your name, when you're open, what you offer.",
    rows: ["facts", "google"],
    needs: ["facts"],
  },
  {
    key: "phone",
    name: "Your phone",
    lead: "The number your customers call, and how those calls reach your receptionist.",
    rows: ["billing", "line", "keep"],
    needs: ["billing", "line"],
  },
  {
    key: "try",
    name: "Try it",
    lead: "Call it from your own phone and hear what your customers will hear.",
    rows: ["receptionist", "handoff"],
    needs: ["receptionist"],
  },
  // The last step is where the others lead: nothing to finish, only what is left after it.
  { key: "live", name: "Live", lead: "", rows: LIVE_ROWS, needs: [] },
];

/**
 * Today's card, in the order each row helps most: WhatsApp first, because the booking link goes out by WhatsApp on a
 * call; then the calendar, so it can say which times are open; then someone to back the owner up; then the rows a
 * step offered and nobody took.
 */
export const SETUP_CARD_ORDER = ["whatsapp", "calendar", "team", "handoff", "keep", "google", "email", "yes"] as const;

export const FIRST_RUN_WORDS = {
  title: "Setting up",
  later: "Finish later",
  laterShort: "Later",
  back: "Back",
  continue: "Continue",
  finish: "Finish",
  liveHeading: "Your receptionist is answering",
  liveNext: "When you're ready",
  reading: "Reading your workspace…",
  failedWhat: "your workspace",
  failedBody: "This page can't read your workspace at the moment. Nothing you set up is lost.",
  toToday: "Back to Today",
  /** A row's second button on the first run, and what it says once pressed. */
  putOff: { put: "Later", undo: "Undo later" },
} as const;

export type FirstRunStepState = "done" | "current" | "ahead";

export interface FirstRunStepVM {
  key: FirstRunStepKey;
  name: string;
  /** 1 to 4. */
  number: number;
  state: FirstRunStepState;
  rows: SetupRowVM[];
  /** Where the step opens: the first run's own address for the current step, `start/<step>` for another. */
  to: string;
}

export interface FirstRunVM {
  steps: FirstRunStepVM[];
  /** The first step not done: where `#/start` opens. Live once the other three are. */
  current: FirstRunStepKey;
  /** Your business, your phone and try it are done. */
  complete: boolean;
  /** The step on screen: the one the address names when it has been reached, else the current one. */
  shown: FirstRunStepVM;
  heading: string;
  lead: string;
  /** "Step 2 of 4 · Your phone", the phone's header. */
  phoneLine: string;
  /** How much of the phone's bar is filled, in percent: the shown step's own place. */
  progress: number;
  /** The row whose button is the step's one coral action: its first open row, while the step still asks something. */
  primaryRow: string | null;
  /** Where Back goes: the step before the shown one. */
  back: string | null;
  /**
   * Once the shown step asks nothing more: on to where the workspace is, or Finish to Today from Live. `leaves` is a
   * way out of the first run; a step's own move is not one, and replaces the address so Back leaves.
   */
  onward: { label: string; to: string; leaves: boolean } | null;
}

const rowOf = (vm: SetupVM, id: string): SetupRowVM | null => vm.rows.find((r) => r.id === id) ?? null;
const stepDone = (vm: SetupVM, def: FirstRunStepDef): boolean =>
  def.needs.every((id) => {
    const r = rowOf(vm, id);
    return !r || r.state === "ready";
  });

/** The step a `#/start/<step>` address names, or null for anything else. */
export function firstRunStepOf(param: string | null | undefined): FirstRunStepKey | null {
  const hit = FIRST_RUN_STEPS.find((s) => s.key === param);
  return hit ? hit.key : null;
}

/** Where the workspace is in the first run, and what the step on screen draws. `at` is the address's step. */
export function firstRunOf(vm: SetupVM, at?: string | null): FirstRunVM {
  const last = FIRST_RUN_STEPS[FIRST_RUN_STEPS.length - 1];
  const open = FIRST_RUN_STEPS.find((s) => s !== last && !stepDone(vm, s));
  const current: FirstRunStepKey = open ? open.key : last.key;
  const steps: FirstRunStepVM[] = FIRST_RUN_STEPS.map((def, i) => ({
    key: def.key,
    name: def.name,
    number: i + 1,
    state: def.key === current ? "current" : def !== last && stepDone(vm, def) ? "done" : "ahead",
    rows: def.rows.map((id) => rowOf(vm, id)).filter((r): r is SetupRowVM => r !== null),
    to: def.key === current ? FIRST_RUN_ROUTE : firstRunStepRoute(def.key),
  }));
  const asked = firstRunStepOf(at);
  const shown =
    steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const def = FIRST_RUN_STEPS[shown.number - 1];
  const final = def === last;
  const onward = final
    ? { label: FIRST_RUN_WORDS.finish, to: "today", leaves: true }
    : shown.state === "done"
      ? { label: FIRST_RUN_WORDS.continue, to: FIRST_RUN_ROUTE, leaves: false }
      : null;
  // One coral button a step: its first open row's while it asks something, else Continue or Finish.
  const primary = onward ? null : (shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null);
  return {
    steps,
    current,
    complete: !open,
    shown,
    heading: final ? FIRST_RUN_WORDS.liveHeading : def.name,
    lead: final ? vm.readiness.sentence : def.lead,
    phoneLine: `Step ${shown.number} of ${FIRST_RUN_STEPS.length} · ${shown.name}`,
    progress: Math.round((shown.number / FIRST_RUN_STEPS.length) * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? steps[shown.number - 2].to : null,
    onward,
  };
}

export interface SetupCardVM {
  title: string;
  /** "3 steps left" while the first run is not done; "2 left" after. */
  left: string;
  /** While calls are not answered: the one row, which opens the first run where it stands. */
  start: { name: string; sentence: string; status: string; cta: string; to: string } | null;
  /** After: Setup's own rows, open and not put off, in SETUP_CARD_ORDER. */
  rows: SetupRowVM[];
  /** Puts every row off at once, and what the toast says after; only where rows can be put off. */
  hide: { put: string; said: string } | null;
  /** A row's second button on the card, and what the toast says after (its Undo is the toast's own). */
  skip: { put: string; said: string };
}

const CARD_SKIP = { put: "Skip", said: "Put off. It stays in Setting up for when you're ready." } as const;

/** Today's card: what is left to set up, or null when nothing is. */
export function setupCardOf(vm: SetupVM): SetupCardVM | null {
  const fr = firstRunOf(vm);
  if (!fr.complete) {
    // The steps that ask something: every one but the last, which is where they lead.
    const left = fr.steps.slice(0, -1).filter((s) => s.state !== "done").length;
    const next = fr.steps.find((s) => s.key === fr.current) ?? fr.steps[0];
    const def = FIRST_RUN_STEPS[next.number - 1];
    return {
      title: FINISH_SETTING_UP,
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        // WhatsApp can answer before the phone does (Setup's readiness): then it is the calls that are not answered.
        name: vm.readiness.answering ? "Calls aren't answered yet" : "Your receptionist isn't answering yet",
        sentence: def.lead,
        status: `Next: ${next.name.toLowerCase()}`,
        cta: "Continue setting up",
        to: FIRST_RUN_ROUTE,
      },
      rows: [],
      hide: null,
      skip: CARD_SKIP,
    };
  }
  const rows = SETUP_CARD_ORDER.map((id) => rowOf(vm, id)).filter(
    (r): r is SetupRowVM => r !== null && r.state !== "ready" && !r.later && !!r.verb,
  );
  if (!rows.length) return null;
  const said =
    rows.length === 1 ? CARD_SKIP.said : `All ${rows.length} put off. They stay in Setting up for when you're ready.`;
  return {
    title: FINISH_SETTING_UP,
    left: `${rows.length} left`,
    start: null,
    rows,
    hide: { put: "Hide", said },
    skip: CARD_SKIP,
  };
}

export interface ReceptionistCardInputs {
  setup: SetupDto;
  answering: boolean;
  /** The receptionist's brain as the settings read has it; null until that read lands. */
  brain: {
    business_name?: string | null;
    booking_link?: string | null;
    profile?: {
      hours?: Partial<Record<string, Hours>> | null;
      services?: readonly ServiceWordsInput[] | null;
      languages?: readonly string[] | null;
    } | null;
  } | null;
  /** The numbers as the settings read resolved them (facts.ts); null until that read lands. */
  numbers: { voiceLine: string | null; keptLine: string | null; handoff: string | null } | null;
  /** The workspace's own name, for a receptionist with none yet. */
  workspaceName: string | null;
  /** The workspace's clock, which the hours are in. */
  tz: string;
}

export interface ReceptionistCardVM {
  caption: string;
  initials: string;
  name: string;
  /** Whether it answers, as Setup's own states say it (the page's StatePill tones them): not yet, not tried, answering. */
  status: { state: SetupState; words: string };
  /** The phone's one line for the card: "Your receptionist · Answering". */
  strip: string;
  greetingLabel: string;
  greeting: string;
  rows: Array<{
    key: "open" | "knows" | "books" | "speaks" | "answers" | "through";
    label: string;
    value: string | null;
  }>;
  foot: string;
}

/** A link as a person reads it: no scheme, no "www.", no trailing slash. */
const linkShown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

/** The owner's receptionist, so far: who it is, whether it answers, what it greets with and what it knows. */
export function receptionistCardOf(i: ReceptionistCardInputs): ReceptionistCardVM {
  const b = i.brain;
  const p = b?.profile ?? null;
  // The name the phone greets with is the receptionist's own (voice call-start reads the brain), never the
  // workspace's: the card's title may borrow the workspace's until there is one, the greeting may not.
  const spoken = (b?.business_name || i.setup.business.name || "").trim();
  const name = spoken || (i.workspaceName ?? "").trim();
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  const status: ReceptionistCardVM["status"] = !i.answering
    ? { state: "not_started", words: "Not answering yet" }
    : tried
      ? { state: "ready", words: "Answering" }
      : { state: "waiting_you", words: "Answering · not tried yet" };
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = (n: string | null) => (n ? (formatPhoneDisplay(n) ?? n) : null);
  return {
    caption: "Your receptionist, so far",
    initials: name ? initialsOf(name) : "",
    name: name || "Your receptionist",
    status,
    strip: `Your receptionist · ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: greetingFor(spoken || null),
    rows: [
      { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
      {
        key: "knows",
        label: "Knows",
        value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null,
      },
      { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
      { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
      // The line it answers, and the number set to forward to it, as recorded: no claim about when a call forwards.
      {
        key: "answers",
        label: "Answers",
        value: line ? (kept ? `${show(line)}, and calls forwarded from ${show(kept)}` : show(line)) : null,
      },
      { key: "through", label: "Puts through to", value: show(through) },
    ],
    foot: "Fills in as you go. You can change any of it later in Settings › Business.",
  };
}

/**
 * Whether this arrival lands on the first run: an owner, a receptionist that answers nowhere yet, a plain arrival
 * (Today or nothing), and not already sent there this session. Everyone else gets Today. Setup's rule, moved with the
 * page it lands on.
 */
export function shouldLandOnFirstRun(
  role: string | null | undefined,
  answering: boolean,
  route: string,
  landed: boolean,
): boolean {
  if (landed || role !== "owner" || answering) return false;
  return route === "" || route === "today";
}

/** The first run's rules and words, as the bridge publishes them for the pages (window.__firstRun). */
export const FIRST_RUN_HELPERS = {
  of: firstRunOf,
  receptionist: receptionistCardOf,
  todayCard: setupCardOf,
  words: FIRST_RUN_WORDS,
  landedKey: FIRST_RUN_LANDED_KEY,
} as const;
