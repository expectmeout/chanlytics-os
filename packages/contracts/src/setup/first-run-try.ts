/**
 * The first run's third step, Try it (docs/superpowers/plans/2026-09-24-first-run-5-try-live.md, canvas R6–R8, P6, P7,
 * V7, V8): the owner calls the number customers call from their cell, the page moves the moment the call starts, shows
 * the words a turn behind the voice, then the whole call and where a caller who asks for a person is put through. Every
 * sentence is here; the page composes (first-run.jsx FrTry).
 *
 * The call is the Live page's own (live.ts `LiveCallVM`, the realtime `calls` read every page has): the step reads the
 * newest inbound call that started once the screen was open (a minute of clock slack), or, once a call has reached the
 * receptionist before, the newest one there is.
 */
import { formatPhoneDisplay, normalizePhone, samePhone, whyNotAHandoff } from "../shared/phone";
import { forwardingTestOpen } from "../voice/forwarding";
import type { LiveCallVM } from "../voice/live";
import { forwardedLineOf, type SetupDto } from "./setup";
import { MIN_MS } from "../shared/time";

export type FirstRunTryStage = "listen" | "quiet" | "call" | "done" | "rows";

/** How long the step listens before it asks what may have gone wrong (V7). */
export const TRY_QUIET_AFTER_MS = 3 * MIN_MS;
/** A call is the test call if it started no earlier than this before the screen opened: phone clocks disagree. */
const TRY_SLACK_MS = MIN_MS;

export type TryTransferKey = "caller" | "current" | "message";

export interface FirstRunTryVM {
  stage: FirstRunTryStage;
  heading: string;
  lead: string;
  /** The number to call, as the app writes one: the kept number while it forwards, else the receptionist's own. */
  number: string | null;
  /** A kept number that forwards: the test proves the forwarding. */
  forwarded: boolean;
  /** "Ask Chanlytics for help" (a person sets the forwarding up with them): only for a kept number. */
  help: string | null;
  /**
   * The forwarded line whose test window the page opens as the screen does (line_forwarding_test, 30 minutes): a kept
   * number not yet proven, with no window open. The call webhook proves forwarding only inside one.
   */
  openTest: string | null;
  /** Listening: what the page is doing, the test window, and the route a call takes (a kept number). */
  listening: { sentence: string; detail: string; route: string | null } | null;
  /** V7: why nothing may have come through, and what to do about each. */
  causes: { question: string; answer: string }[];
  /** The call, once there is one. */
  call: {
    /**
     * While live, "Forwarding works · on the call now · 0:21" (forwarding said only once a call proved it); after, the
     * length, the caller, the number it came through (proven) and when.
     */
    line: string;
    live: boolean;
    /** The owner's own test call (it started once the screen was open): its caller is "You" and may be the transfer. */
    test: boolean;
    turns: { who: string; text: string; agent: boolean }[];
    /** While live: the words come a turn behind the voice. */
    behind: string | null;
    /** The call's address in the Inbox (Conversations), for "It's in your Inbox too". */
    to: string;
  } | null;
  /** After the call: where a caller who asks for a person goes. */
  transfer: {
    label: string;
    options: { key: TryTransferKey; label: string; sentence: string; to: string | null }[];
    value: TryTransferKey | null;
    /** A kept number: why not the business's own number. */
    note: string | null;
  } | null;
  /** The step's skip (V8): one nudge, then through. */
  skip: { label: string; nudge: string; stay: string; anyway: string };
}

export const FIRST_RUN_TRY_WORDS = {
  listenForwarded: "Call your number from your cell. Don't pick up.",
  listenOwn: "Call your receptionist from your cell.",
  lead: "Ask what a customer would, like “Are you open on Sunday?”",
  listening: "Listening for your call",
  listeningDetail: "This page changes the moment it picks up.",
  listeningWindow: (minutes: number) =>
    `This page changes the moment it picks up. Open for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}.`,
  route: (kept: string) => `Your cell calls ${kept} → nobody picks up → your receptionist answers`,
  quietHeading: "No call has reached your receptionist yet",
  stillListening: "Still listening",
  causesForwarded: [
    {
      question: "Did you hear a tone after dialing the code?",
      answer: "If not, dial the code again, or pick another phone company.",
    },
    {
      question: "Did an answering machine or voicemail pick up?",
      answer: "Turn it off. It answers before your receptionist can.",
    },
    {
      question: "Did you call from the phone customers call?",
      answer: "Use another phone. A line can't forward a call to itself.",
    },
  ],
  causeOwn: (number: string) => ({
    question: `Did you call ${number}?`,
    answer: "That's the number your receptionist answers.",
  }),
  showCode: "Show the code again",
  help: "Ask Chanlytics for help",
  helpSent: "We'll email you to find a time for a call.",
  helpFailed: "Not asked",
  pickedUp: "It picked up.",
  proofForwarded: "Forwarding works",
  proofOwn: "Your receptionist answered",
  onTheCall: "on the call now",
  behind: "Words arrive a moment behind the call.",
  doneHeading: "That's your receptionist.",
  from: (number: string) => `from ${number}`,
  through: (number: string) => `through ${number}`,
  receptionist: "Receptionist",
  caller: "You",
  someone: "Caller",
  transferLabel: "When a caller asks for a person",
  putThrough: (number: string) => `Put them through to ${number}`,
  putThroughCaller: "The phone you just called from. It rings during opening hours; outside them, it takes a message.",
  keepPutting: (number: string) => `Keep putting them through to ${number}`,
  keepPuttingSentence: "The number on record now.",
  message: "Take a message and email me",
  messageSentence: "Nobody is put through. You get the message right away.",
  notKept: (kept: string) => `Not ${kept}: while it forwards, that call would ring straight back here.`,
  saved: "Saved. Your receptionist puts callers through as you chose.",
  notSaved: "Not saved",
  notReadYet: "Your settings are still being read. Try again in a moment.",
  inbox: "It's in your Inbox too",
  continue: "Continue",
  skip: "Can't call right now? Skip for now",
  nudge:
    "Most owners call once. It takes a minute, and it's the only way to know your calls really reach your receptionist.",
  stay: "OK, I'll call",
  anyway: "Skip anyway",
} as const;

export interface FirstRunTryInput {
  dto: SetupDto;
  /** The Live page's calls (now and recent); empty before that read lands. */
  calls: readonly LiveCallVM[];
  /** When this screen opened, in ms: a call from before it is not the test. */
  since: number;
  nowMs: number;
}

export function firstRunTryOf({ dto, calls, since, nowMs }: FirstRunTryInput): FirstRunTryVM {
  const W = FIRST_RUN_TRY_WORDS;
  const voice = dto.channels.voice;
  const own = voice.active ? normalizePhone(voice.number) : null;
  const fw = forwardedLineOf(dto.lines);
  const kept = fw ? normalizePhone(fw.e164) : null;
  const forwarded = !!kept;
  // Forwarding is said to work only once a call proved it (the webhook marks it inside the test window).
  const proven = forwarded && fw!.forwarding_state === "verified";
  const shown = formatPhoneDisplay(kept ?? own);
  const skip = { label: W.skip, nudge: W.nudge, stay: W.stay, anyway: W.anyway };
  const f0 = fw?.forwarding ?? null;
  const openTest = fw && f0 && fw.forwarding_state !== "verified" && !forwardingTestOpen(f0, nowMs) ? fw.id : null;
  const base = {
    number: shown,
    forwarded,
    help: forwarded ? W.help : null,
    openTest,
    listening: null,
    causes: [],
    call: null,
    transfer: null,
    skip,
  };
  if (!own) return { ...base, stage: "rows", heading: "", lead: "" };

  const tested = !!voice.lastInboundAt;
  const inbound = calls
    .filter((c) => c.direction === "inbound" && !c.missed && c.startedAtMs !== null)
    .sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
  const call =
    inbound.find((c) => (c.startedAtMs ?? 0) >= since - TRY_SLACK_MS) ?? (tested ? (inbound[0] ?? null) : null);

  if (!call) {
    const f = fw?.forwarding ?? null;
    const open = !!f && fw!.forwarding_state !== "verified" && forwardingTestOpen(f, nowMs);
    const left = open && f!.test_until ? Math.max(1, Math.ceil((Date.parse(f!.test_until) - nowMs) / MIN_MS)) : null;
    const quiet = nowMs - since >= TRY_QUIET_AFTER_MS;
    return {
      ...base,
      stage: quiet ? "quiet" : "listen",
      heading: quiet ? W.quietHeading : forwarded ? W.listenForwarded : W.listenOwn,
      lead: quiet ? "" : W.lead,
      listening: {
        sentence: quiet ? W.stillListening : W.listening,
        detail: left !== null ? W.listeningWindow(left) : W.listeningDetail,
        route: forwarded ? W.route(shown ?? "") : null,
      },
      causes: quiet
        ? forwarded
          ? W.causesForwarded.map((c) => ({ ...c }))
          : [W.causeOwn(formatPhoneDisplay(own) ?? own)]
        : [],
    };
  }

  // The owner's own test call started once the screen was open; an older one (shown once one has reached the
  // receptionist) may be a customer's, so its caller is neither "You" nor offered as the transfer.
  const test = (call.startedAtMs ?? 0) >= since - TRY_SLACK_MS;
  const turns = call.transcript
    .filter((t) => t.speaker === "agent" || t.speaker === "client")
    .map((t) => ({
      who: t.speaker === "agent" ? W.receptionist : test ? W.caller : W.someone,
      text: t.text,
      agent: t.speaker === "agent",
    }));
  const proof = proven ? W.proofForwarded : W.proofOwn;
  const to = `conversations/${call.cvId}`;
  if (call.live) {
    const secs = Math.max(0, Math.floor((nowMs - (call.startedAtMs ?? nowMs)) / 1000));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    return {
      ...base,
      stage: "call",
      heading: W.pickedUp,
      lead: "",
      call: { line: [proof, W.onTheCall, clock].join(" · "), live: true, test, turns, behind: W.behind, to },
    };
  }

  // After the call: where a caller who asks for a person is put through. The phone they called from, where it may be
  // one (never the receptionist's own line, never the kept number, which would ring straight back: whyNotAHandoff),
  // the number on record when there is another, or a message.
  const caller = normalizePhone(call.from);
  const current = normalizePhone(dto.business.handoff);
  const callerOk = test && !!caller && whyNotAHandoff(caller, own, kept) === null;
  const options: NonNullable<FirstRunTryVM["transfer"]>["options"] = [];
  if (callerOk) {
    options.push({
      key: "caller",
      label: W.putThrough(formatPhoneDisplay(caller) ?? caller!),
      sentence: W.putThroughCaller,
      to: caller,
    });
  }
  if (current && !samePhone(current, caller)) {
    options.push({
      key: "current",
      label: W.keepPutting(formatPhoneDisplay(current) ?? current),
      sentence: W.keepPuttingSentence,
      to: current,
    });
  }
  options.push({ key: "message", label: W.message, sentence: W.messageSentence, to: null });
  const value: TryTransferKey = !current ? "message" : samePhone(current, caller) && callerOk ? "caller" : "current";
  const line = [
    call.duration ?? call.lengthWords,
    call.number ? W.from(call.number) : null,
    proven && shown ? W.through(shown) : null,
    call.startedLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    ...base,
    stage: "done",
    heading: W.doneHeading,
    lead: "",
    call: { line, live: false, test, turns, behind: null, to },
    transfer: {
      label: W.transferLabel,
      options,
      value,
      note: forwarded && shown ? W.notKept(shown) : null,
    },
  };
}
