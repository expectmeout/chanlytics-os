/**
 * Setting a watched folder up, and letting it go, in the owner's words (the footage sources plan, P5; the canvas's
 * boards "Setting it up", "The folder chooser", "The last card" and Settings' three sheets). The same words wherever
 * the step is taken: AI's cards in a conversation, and the row in Settings › Connections. Each refusal says what
 * happened, whether anything changed, and the one thing to do. Never Google's wording and never a code. Pure.
 */
import { FOOTAGE_NUMBERS } from "./footage-numbers";
import { FOOTAGE_SAID, quotedName } from "./footage-said";

/** A count of clips with its verb: "1 clip is", "14 clips are". */
const clipsAre = (count: number): string => (count === 1 ? "1 clip is" : `${count.toLocaleString("en-US")} clips are`);

/** What a connect that connected nothing says: its sentence, whether it is the owner's to mend, and the press under it. */
export interface ConnectStopped {
  say: string;
  /** Amber only where the owner must do something differently; a plain line where the same press simply stands. */
  tone: "you" | "rest";
  press: "connect" | "again" | "retry" | "steps" | null;
}

/**
 * Why Google's window connected nothing, by the word it came back with (the dashboard's server files/sources.ts: the
 * edge's reasons, `closed` for a window shut or Cancel pressed, `not_allowed` for a member who may not connect).
 */
export function connectStoppedOf(reason: string): ConnectStopped {
  switch (reason) {
    case "closed":
      return { say: "Not connected. Nothing changed.", tone: "rest", press: "connect" };
    case "scope_missing":
      return {
        say: "Google didn't include Drive. Connect again and keep the Drive box ticked.",
        tone: "you",
        press: "again",
      };
    case "blocked_by_admin":
      return {
        say: "Your Google Workspace doesn't let apps open Drive yet. Whoever manages it can allow Chanlytics in a couple of minutes.",
        tone: "you",
        press: "steps",
      };
    case "not_allowed":
      return { say: FOOTAGE_SAID.notAllowed, tone: "rest", press: null };
    case "not_enabled":
    case "not_available":
      return { say: FOOTAGE_SAID.notOffered, tone: "rest", press: null };
    default:
      return { say: "Couldn't reach Google. Nothing changed.", tone: "rest", press: "retry" };
  }
}

export const FOOTAGE_SETUP = {
  /** Card 1: what Chanlytics will open and what it never does, said before Google's screen says "all your files". */
  connect: {
    title: "Connect Google Drive",
    body: "Chanlytics opens only the folder you choose next. It never changes, moves or deletes a file in your Drive.",
    bodyPasted: "Chanlytics opens only the folder you pasted. It never changes, moves or deletes a file in your Drive.",
    fine: "Google's own screen says “See and download all your Google Drive files”. That is how Google words it for any app that looks inside a folder.",
    press: "Connect",
    again: "Connect again",
    retry: "Try again",
    waiting: "Waiting for Google…",
    done: (email: string | null) => (email ? `Connected · ${email}` : "Connected"),
    /** A Workspace that blocks apps: the card says so, with the steps to send and the way that still works. */
    blocked: {
      title: "Google Drive is blocked for now",
      fine: "Until then nothing is watched. Photos and videos can still be added from your phone.",
    },
    /** Someone who may not connect: said once, with the way that still works. */
    notAllowed: FOOTAGE_SAID.notAllowed,
    notAllowedMore: "Ask one of them to do it, or add photos and videos from your phone.",
  },
  /** Card 2, and the chooser it opens. */
  choose: {
    title: "Choose the folder",
    body: "Open the folder your photos and videos go into. Chanlytics loads only the folders you open.",
    press: "Choose folder",
    none: "No folder chosen yet. Google Drive stays connected.",
    /** A pasted folder the account just connected cannot open: said on the card, with the chooser as the way on. */
    shut: (email: string | null) =>
      `${email ?? "This account"} can't open the folder you pasted. Choose another, or share it with that account in Google Drive.`,
  },
  chooser: {
    title: "Choose a folder",
    sub: (email: string | null) => (email ? `Google Drive · ${email}` : "Google Drive"),
    places: { mine: "My Drive", drives: "Shared drives", shared: "Shared with you" },
    open: "Open a folder to choose it.",
    loading: "Loading folders…",
    watchThis: "Watch this folder",
    watch: (name: string) => `Watch ${quotedName(name)}`,
    /**
     * Under the press, after the folder's name: what watching it would take in. `inside` is how many folders the open
     * one shows, or null where not all of them are shown yet.
     */
    holds: (inside: number | null) =>
      inside === null
        ? " and the folders inside it. You choose next whether they count."
        : inside === 0
          ? ", with nothing inside it but files."
          : inside === 1
            ? " and the folder inside it. You choose next whether it counts."
            : ` and the ${inside} folders inside it. You choose next whether they count.`,
    empty: (name: string) => ({
      head: `No folders inside ${quotedName(name)}`,
      body: "Its photos and videos still come in.",
    }),
    cantOpen: (name: string, email: string | null) => ({
      head: `Couldn't open ${quotedName(name)}`,
      body: `${email ?? "The connected account"} can't see inside it. Ask its owner to share it, or choose another.`,
    }),
    failed: { head: "Couldn't load your folders", body: "Google didn't answer.", again: "Try again" },
    more: "Show more folders",
    back: "Back",
    close: "Close",
  },
  /** Card 3: the folder, whose Drive it is, whether folders inside it count, and what comes in first. */
  confirm: {
    title: FOOTAGE_SAID.watchTitle,
    drive: "Google Drive",
    inside: "Folders inside it too",
    first: "Comes in first",
    firstSaid: `The newest ${FOOTAGE_NUMBERS.firstItems} of the last ${FOOTAGE_NUMBERS.firstDays} days`,
    fine: "New photos and videos come in by themselves, and AI watches each one. They are yours, so they go straight into the Library. Originals stay in Drive, untouched.",
    press: "Watch folder",
    another: "Choose another",
    starting: "Starting…",
    looking: (name: string) => `Looking inside ${quotedName(name)}…`,
    done: FOOTAGE_SAID.watching,
    openLibrary: "Open Library",
    cantOpen: (name: string) => `${quotedName(name)} can't be opened any more, so nothing is watched.`,
    /** No answer came back: the press may have gone through, so it is checked, never tried again. */
    unconfirmed: "Couldn't confirm the folder is watched.",
    check: "Check",
    /** What the check found where the press had not gone through. */
    notWatched: "The folder isn't watched yet. Nothing changed.",
    /** One folder a workspace: a second one is offered as a switch, never refused. */
    instead: {
      title: (name: string) => `Watch ${quotedName(name)} instead?`,
      body: (old: string) => `${quotedName(old)} stops being watched. What came in from it stays in your Library.`,
      press: "Switch folder",
      keep: (old: string) => `Keep ${quotedName(old)}`,
    },
  },
  /** Stop watching: the folder stops, the account stays connected. Said before the press, never after. */
  stop: {
    title: (name: string) => `Stop watching ${quotedName(name)}?`,
    stays: (files: number) =>
      files > 0
        ? `Nothing new comes in. The ${files === 1 ? "one file" : `${files.toLocaleString("en-US")} photos and videos`} that came in ${files === 1 ? "stays" : "stay"} in your Library.`
        : "Nothing new comes in.",
    // A stopped folder's clips still come back on a press while its account reads (the content loop PRD's F1).
    away: (clips: number) =>
      `${clipsAre(clips)} kept in Drive right now. ${clips === 1 ? "It still plays" : "They still play"} here while Google Drive stays connected.`,
    press: "Stop watching",
    keep: "Keep watching",
    done: "Stopped. Google Drive stays connected.",
  },
  /** Disconnect: Chanlytics drops its key at once, and says honestly what Google's own page will still list. */
  disconnect: {
    title: "Disconnect Google Drive?",
    drops: "Chanlytics drops its access to your Drive right away. Nothing new comes in, and what came in stays.",
    away: (clips: number) =>
      `${clipsAre(clips)} kept in Drive right now. After this ${clips === 1 ? "it" : "they"} can't be played here. ${clips === 1 ? "Its" : "Their"} pictures, sound and what AI wrote stay.`,
    google:
      "Google's own list of connected apps still shows Drive for Chanlytics while Gmail or your Business Profile is connected here.",
    press: "Disconnect",
    keep: "Keep",
    done: "Google Drive is disconnected. What came in stays.",
  },
  /**
   * "Remove what came from it too" (the canvas's Settings 19), beside Stop watching and Disconnect: never the default,
   * and what a post or a video used always stays. Its press removes, then stops or disconnects.
   */
  removeToo: {
    link: "Remove what came from it too",
    title: (files: number) =>
      `Remove ${files === 1 ? "1 photo or video" : `${files.toLocaleString("en-US")} photos and videos`}?`,
    say: (used: number) =>
      `They leave your Library.${used > 0 ? ` ${used.toLocaleString("en-US")} that a post or a video used ${used === 1 ? "stays" : "stay"}.` : ""} The originals in Drive are not touched.`,
    press: (files: number) => `Remove ${files.toLocaleString("en-US")}`,
    keep: "Keep them",
    done: (removed: number) =>
      `${removed === 1 ? "1 photo or video" : `${removed.toLocaleString("en-US")} photos and videos`} left your Library.`,
  },
  /** A press that did not go through, where the edge gave no words of its own. */
  notDone: "That didn't go through. Nothing changed. Try again.",
} as const;
