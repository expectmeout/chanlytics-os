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
import { openWeekWords, servicesWords, type ServiceWordsInput } from "./business-tab";
import type { Hours } from "./config";
import type { SetupDto, SetupRowVM, SetupVM } from "./setup";

/** The first run's address: `#/start`, and `#/start/<step>` for a step already reached. */
export const FIRST_RUN_ROUTE = "start";

export type FirstRunStepKey = "business" | "phone" | "try" | "live";

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
  { key: "live", name: "Live", lead: "", rows: [], needs: [] },
];

/** What is left once the receptionist answers, on Live: Setup's rows no step asks for. */
const LIVE_ROWS = ["whatsapp", "calendar", "team", "email", "yes"] as const;

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
} as const;

export type FirstRunStepState = "done" | "current" | "ahead";

export interface FirstRunStepVM {
  key: FirstRunStepKey;
  name: string;
  /** 1 to 4. */
  number: number;
  state: FirstRunStepState;
  rows: SetupRowVM[];
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
  /** The row whose button is the step's one coral action: its first open row with something to press. */
  primaryRow: string | null;
  /** The step before the shown one, for Back. */
  back: FirstRunStepKey | null;
  /** Once the shown step asks nothing more: on to where the workspace is, or Finish to Today from Live. */
  onward: { label: string; to: string } | null;
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
  const open = FIRST_RUN_STEPS.find((s) => s.key !== "live" && !stepDone(vm, s));
  const current: FirstRunStepKey = open ? open.key : "live";
  const steps: FirstRunStepVM[] = FIRST_RUN_STEPS.map((def, i) => ({
    key: def.key,
    name: def.name,
    number: i + 1,
    state: def.key === current ? "current" : def.key !== "live" && stepDone(vm, def) ? "done" : "ahead",
    rows: (def.key === "live" ? LIVE_ROWS : def.rows)
      .map((id) => rowOf(vm, id))
      .filter((r): r is SetupRowVM => r !== null),
  }));
  const asked = firstRunStepOf(at);
  const shown =
    steps.find((s) => s.key === asked && s.state !== "ahead") ?? steps.find((s) => s.key === current) ?? steps[0];
  const def = FIRST_RUN_STEPS[shown.number - 1];
  const live = shown.key === "live";
  const primary = live ? null : (shown.rows.find((r) => r.state !== "ready" && !r.later && r.verb) ?? null);
  return {
    steps,
    current,
    complete: !open,
    shown,
    heading: live ? FIRST_RUN_WORDS.liveHeading : def.name,
    lead: live ? vm.readiness.sentence : def.lead,
    phoneLine: `Step ${shown.number} of ${FIRST_RUN_STEPS.length} · ${shown.name}`,
    progress: Math.round((shown.number / FIRST_RUN_STEPS.length) * 100),
    primaryRow: primary ? primary.id : null,
    back: shown.number > 1 ? FIRST_RUN_STEPS[shown.number - 2].key : null,
    onward: live
      ? { label: FIRST_RUN_WORDS.finish, to: "today" }
      : shown.state === "done"
        ? { label: FIRST_RUN_WORDS.continue, to: FIRST_RUN_ROUTE }
        : null,
  };
}

export interface SetupCardVM {
  title: string;
  /** "3 steps left" while the first run is not done; "2 left" after. */
  left: string;
  /** While the receptionist is not answering: the one row, which opens the first run. */
  start: { name: string; sentence: string; cta: string; to: string } | null;
  /** After: Setup's own rows, open and not put off, in SETUP_CARD_ORDER. */
  rows: SetupRowVM[];
  /** Puts every row off at once; only where rows can be put off. */
  hide: string | null;
  skip: string;
}

/** Today's card: what is left to set up, or null when nothing is. */
export function setupCardOf(vm: SetupVM): SetupCardVM | null {
  const fr = firstRunOf(vm);
  if (!fr.complete) {
    const left = fr.steps.filter((s) => s.key !== "live" && s.state !== "done").length;
    const next = fr.steps.find((s) => s.key === fr.current) ?? fr.steps[0];
    return {
      title: "Finish setting up",
      left: `${left} ${left === 1 ? "step" : "steps"} left`,
      start: {
        name: "Your receptionist isn't answering yet",
        sentence: `Next: ${next.name.toLowerCase()}.`,
        cta: "Continue setting up",
        to: FIRST_RUN_ROUTE,
      },
      rows: [],
      hide: null,
      skip: "Skip",
    };
  }
  const rows = SETUP_CARD_ORDER.map((id) => rowOf(vm, id)).filter(
    (r): r is SetupRowVM => r !== null && r.state !== "ready" && !r.later && !!r.verb,
  );
  if (!rows.length) return null;
  return { title: "Finish setting up", left: `${rows.length} left`, start: null, rows, hide: "Hide", skip: "Skip" };
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
  status: { tone: "plain" | "ok"; words: string };
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

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** A link as a person reads it: no scheme, no "www.", no trailing slash. */
const linkShown = (url: string): string => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

/** The owner's receptionist, so far: who it is, whether it answers, what it greets with and what it knows. */
export function receptionistCardOf(i: ReceptionistCardInputs): ReceptionistCardVM {
  const b = i.brain;
  const p = b?.profile ?? null;
  const name = (b?.business_name || i.setup.business.name || i.workspaceName || "").trim();
  const tried = !!(i.setup.channels.voice.lastInboundAt || i.setup.channels.whatsapp.lastInboundAt);
  const status: ReceptionistCardVM["status"] = !i.answering
    ? { tone: "plain", words: "Not answering yet" }
    : { tone: "ok", words: tried ? "Answering" : "Answering · not tried yet" };
  const sv = servicesWords(p?.services ?? null);
  const kept = i.numbers?.keptLine ?? null;
  const line = i.numbers?.voiceLine ?? i.setup.channels.voice.number ?? null;
  const through = i.numbers?.handoff ?? i.setup.business.handoff ?? null;
  const show = (n: string | null) => (n ? (formatPhoneDisplay(n) ?? n) : null);
  return {
    caption: "Your receptionist, so far",
    initials: initialsOf(name),
    name: name || "Your receptionist",
    status,
    strip: `Your receptionist · ${status.words}`,
    greetingLabel: "Greets every caller with",
    greeting: greetingFor(name || null),
    rows: [
      { key: "open", label: "Open", value: i.setup.business.hours && p?.hours ? openWeekWords(p.hours, i.tz) : null },
      {
        key: "knows",
        label: "Knows",
        value: sv.count ? [sv.chips.map((c) => c.name).join(", "), sv.more].filter(Boolean).join(" ") : null,
      },
      { key: "books", label: "Books with", value: b?.booking_link ? linkShown(b.booking_link) : null },
      { key: "speaks", label: "Speaks", value: p?.languages?.length ? p.languages.join(", ") : null },
      { key: "answers", label: "Answers", value: kept ? `${show(kept)} when nobody picks up` : show(line) },
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
