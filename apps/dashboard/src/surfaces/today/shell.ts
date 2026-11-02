/**
 * What Today still asks of the shell (decision 0015, step 4).
 *
 * A TSX surface reads nothing off `window`, so each thing a page of the shell owns that Today draws reaches it through
 * one function here, which calls the window's own where it is and does what the page did where it is not (the
 * standalone harness, a test's stand-in window). Today reads more of the shell than any surface: the nine it draws
 * from (`ROUTE_DRAWS.today`), the frame's doors, the toast and the role gate. Each is a line to delete on the day its
 * owner moves; nothing here is new behaviour.
 *
 * Reads are made when the page asks, never when this loads: a stand-in window a test builds later is the one read.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { AskProposal, AskProposalOutcome, SpeechPurpose } from "@chanlytics/contracts";
import type { BellApi } from "@/legacy-bridge/notifications";
import type { PageClock } from "@/legacy-bridge/zone";
import { surfaceHook } from "@/legacy-bridge/surface-status";
import type { SurfaceNames } from "@/legacy-bridge/surface-status";
import { askAbout, canDo, holdStill, mayAtLeast } from "../legacy-verbs";
import { fn, object, type Flash } from "../shell-doors";

export { askAbout, canDo, holdStill, mayAtLeast };

/* The role gate and the toast are the doors every surface shares (shell-doors.ts). */
export { gate, useToast } from "../shell-doors";
export type { Flash } from "../shell-doors";

/* -------------------------------- the toast -------------------------------- */

/** The toast a refused verb raises, in the shell's words (`window.refusalToast`): its lead, then the server's reason. */
export function refusalFlash(res: unknown, lead: string): Flash {
  const say = fn<[unknown, string], Flash>("refusalToast");
  return say ? say(res, lead) : { msg: lead };
}

/* ------------------------------- the address ------------------------------- */

/** Move to a route; nothing without the frame (`appNavigate`). */
/** The glyph on a door's words: the canvases' chevron (kit Icon's names). */
export const doorGlyph = (): "chevron" => "chevron";

export function appNavigate(route: string): void {
  fn<[string], void>("appNavigate")?.(route);
}

/* -------------------------------- the voice -------------------------------- */

/**
 * Ask's one voice, reading aloud (`window.__ask`, legacy-bridge/ask/speech.ts): the brief's words, spoken as the vendor
 * makes them, through one player the bridge owns (never the pane's, so a pane drawn again mid-sentence changes nothing
 * of the clip). Nobody speaks back: Today's Listen is not a conversation (the spec's §3.5 as amended 4 Oct 2026).
 */
interface AskSpeech {
  canSpeak(): boolean;
  /** What is happening now: the bridge holds it, so every pane says the same. */
  state(): "idle" | "loading" | "speaking";
  /** Hear every change of state; answers the stop. */
  watchSpeech(on: () => void): () => void;
  /** Read these words; resolves once the clip plays (or was stopped first); rejects, in the server's words, when it could not be made. */
  speak(text: string, purpose: SpeechPurpose): Promise<void>;
  /** Stop reading, or stop waiting for the clip. */
  stopSpeaking(): void;
  /** A press that has begun: the clips asked for before it lands. Absent from a bridge that does not warm. */
  warmSpeech?(text: string, purpose: SpeechPurpose): void;
}

/** Ask's voice where the shell has wired it and the device can play it; nothing in a stand-in window. */
export function askSpeech(): AskSpeech | undefined {
  const a = object<Partial<AskSpeech>>("__ask");
  if (
    !a ||
    typeof a.canSpeak !== "function" ||
    typeof a.speak !== "function" ||
    typeof a.state !== "function" ||
    typeof a.watchSpeech !== "function" ||
    typeof a.stopSpeaking !== "function"
  )
    return undefined;
  return a.canSpeak() ? (a as AskSpeech) : undefined;
}

/* ------------------------------- Ask's cards ------------------------------- */

/** What a card's press commits, as Ask's door answers (legacy-bridge/ask/commit.ts CommitResult). */
type AskCardCommit =
  | { ok: true; receipt: string; undo: Record<string, unknown> | null; made: { kind: string; id: string } | null }
  | { ok: false; message: string };

/** Ask's cards, pressed where the Line is not open (`window.__ask`): the verb walk a card commits by, and its outcome kept. */
interface AskCardDoor {
  commit(p: AskProposal): Promise<AskCardCommit>;
  outcome(messageId: string, proposalId: string, o: AskProposalOutcome): Promise<boolean>;
}

/** Ask's card door where the shell has wired it (Ask's ideas in Need you, decisions 0070 and 0071); nothing in a stand-in window. */
export function askCards(): AskCardDoor | undefined {
  const a = object<Partial<AskCardDoor>>("__ask");
  return a && typeof a.commit === "function" && typeof a.outcome === "function" ? (a as AskCardDoor) : undefined;
}

/* ------------------------------ the surfaces ------------------------------ */

/**
 * A surface the bridge published, by its global's name (`__PEOPLE`, `__BROADCASTS`, `__CALENDAR`, ...): what the page
 * borrowed through `todaySurface(name)`. Nothing before its first read.
 */
export function borrowed<T extends object>(name: string): T | undefined {
  return object<T>(name);
}

/** Whether a surface's last read failed (`window.__surfaceFailed`): the borrowed read that says so where its rows would be. */
export function surfaceFailed(key: string): boolean {
  return !!fn<[string], boolean>("__surfaceFailed")?.(key);
}

/**
 * The surfaces a page draws from, so it draws again when any of them moves: their rows landed, their status changed (the
 * legacy `useSurface(names)` of the shell, over the same hook: surface-status.ts `surfaceHook`). Answers how often they have
 * moved, a number the pages ignore.
 */
export const useMoved: (names: SurfaceNames) => number = surfaceHook({ useCallback, useSyncExternalStore });

/* ---------------------------------- a step done ---------------------------------- */

/**
 * A person's notes' courier (people-detail.ts `window.__personNotes`), when it is published: the verb that marks a step done,
 * the one the Inbox's thread header presses. Nothing in a stand-in window.
 */
export function personNotes() {
  const notes = window.__personNotes;
  return notes && typeof notes.done === "function" ? notes : null;
}

/* ---------------------------- what Today borrows ---------------------------- */

/** The workspace's clock as the pages read it (`window.__clock`): the zone, and a day or a time said in it. */
export function workspaceClock(): PageClock | undefined {
  return object<PageClock>("__clock");
}

/** The bell as the top bar holds it (`window.__notifs`): its feed, and the verbs on a row. */
export function bell(): BellApi | undefined {
  return object<BellApi>("__notifs");
}

/* A run's verbs (`window.__broadcasts`) and the playbooks' re-read are the runs' rows' (surfaces/waits/run-acts.tsx), which
   Today's queue and Going today draw through, as the Inbox's Needs you does. */
