/**
 * Listen: the brief read aloud in Ask's one voice (the one-way speech: the words on screen, spoken as the vendor makes them,
 * nobody speaking back; docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026), with how long
 * it takes to hear beside it. Drawn by Your brief on a desk (brief-pane.tsx) and by the head on a phone (phone/head.tsx),
 * which say the same words; moved here from the pane as it was.
 *
 * Listen was a conversation with the agent asked "Brief me on today" (3 Oct): nine seconds of silence before the model
 * said what the page already showed, a second tap that hung up, and the browser's robotic voice whenever the agent could
 * not start. Now the brief's own words go to the speech route and the first word comes back in about a second; where the
 * clip cannot be made the button says why, and nothing else speaks.
 */
import { useRef, useSyncExternalStore } from "react";
import { mmss } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { askSpeech } from "../shell";

/** How long the brief takes to hear at a reader's pace, 160 words a minute, as "0:48": from the words, never a recording. */
function spokenLength(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  const s = Math.max(1, Math.round((words / 160) * 60));
  return mmss(s * 1000);
}

/** What the button is doing: at rest, getting the clip, or playing it. */
type SpeechState = "idle" | "loading" | "speaking";

const noWatch = () => () => {};
const idle = (): SpeechState => "idle";

/**
 * Why the voice could not be had, said once for the page: on a phone Listen stands in the frame's head, the page's act
 * (pages/today-head.tsx), and the line that says why stands under the page's own head (phone/head.tsx).
 */
let whyNow: string | null = null;
const whyWatchers = new Set<() => void>();
const watchWhy = (on: () => void) => {
  whyWatchers.add(on);
  return () => {
    whyWatchers.delete(on);
  };
};
const readWhy = () => whyNow;
const noWhy = (): string | null => null;
function setWhy(why: string | null): void {
  if (why === whyNow) return;
  whyNow = why;
  whyWatchers.forEach((on) => on());
}

/** Why Listen could not speak, wherever its button stands. */
export const useSpeechWhy = (): string | null => useSyncExternalStore(watchWhy, readWhy, noWhy);

/** Listen's press and what it is doing. */
interface Speech {
  can: boolean;
  state: SpeechState;
  why: string | null;
  toggle: () => void;
  warm: () => void;
}

/**
 * Listen and Stop: the brief read aloud in Ask's voice. The clip and what is happening to it are the bridge's, not the
 * page's (useSyncExternalStore over its watch): a part drawn again while it plays (Today redraws itself as its data
 * moves) says Stop, a part that did not start it hears its end, and a part that goes away leaves it to finish. A
 * refusal (the mint, the vendor, a paused workspace) is said once beside the button, in the server's words. `warm`: a
 * mouse gone down on Listen, a tenth of a second before the click that follows it: the clips are asked for then, so
 * the voice is that much nearer the press. (A finger going down may be a scroll beginning, and asks nothing.)
 */
export function useSpeech(text: string | null): Speech {
  const speech = askSpeech();
  const state = useSyncExternalStore(
    speech ? (on: () => void) => speech.watchSpeech(on) : noWatch,
    speech ? () => speech.state() : idle,
    idle,
  );
  const why = useSpeechWhy();
  /** Which press is the current one: a refusal that lands after a later press, or after Stop, is not said. */
  const press = useRef(0);
  const toggle = () => {
    if (!speech || !text) return;
    const mine = ++press.current;
    if (speech.state() !== "idle") {
      speech.stopSpeaking();
      return;
    }
    setWhy(null);
    speech.speak(text, "brief").catch((e: unknown) => {
      if (mine !== press.current) return;
      setWhy(e instanceof Error && e.message ? e.message : "Ask's voice could not be reached just now.");
    });
  };
  const warm = () => {
    if (speech && text && speech.state() === "idle") speech.warmSpeech?.(text, "brief");
  };
  return { can: !!speech, state, why, toggle, warm };
}

/** Where Listen stands: Your brief's head on a phone-sized pane, its acts on a desk, or the phone's own head. */
type ListenPlace = "head" | "foot" | "phone";

const LISTEN_CLASS: Record<ListenPlace, string> = {
  head: "tb-listen tb-listen-head",
  foot: "tb-listen",
  phone: "tb-listen tb-listen-phone",
};

const LISTEN_TESTID: Record<ListenPlace, string> = {
  head: "today-brief-listen-head",
  foot: "today-brief-listen",
  phone: "today-listen",
};

/**
 * Listen, as E3 draws it: in the acts under the line on a desk, at the right of the head on a phone. The pane draws it in
 * both of its places and shows one by the sheet's breakpoint (dashboard-a-v2.css .tb-listen-head), so it needs no measure
 * of its own; the hidden one is out of the reader's tree. The phone's head draws it once, at the greeting's right.
 */
export function listenButton(speech: Speech, line: string, place: ListenPlace) {
  const busy = speech.state !== "idle";
  const word = speech.state === "speaking" ? "Stop" : speech.state === "loading" ? "Getting Ask's voice…" : "Listen";
  return (
    <Button
      variant="secondary"
      size="sm"
      className={LISTEN_CLASS[place]}
      aria-pressed={speech.state === "speaking"}
      aria-busy={speech.state === "loading" || undefined}
      onClick={speech.toggle}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button === 0) speech.warm();
      }}
      data-state={speech.state}
      data-testid={LISTEN_TESTID[place]}
    >
      <Icon name={speech.state === "speaking" ? "stop" : "play"} size={11} />
      {word}
      {!busy && <span className="tb-listen-len tabular">{spokenLength(line)}</span>}
    </Button>
  );
}
