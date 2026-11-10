/**
 * Listen: Your brief read aloud in Ask's one voice (the one-way speech: the words on screen, spoken as the vendor makes
 * them, nobody speaking back; docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.5 as amended 4 Oct 2026), with
 * how long it takes to hear beside it. It stands beside the greeting on a desk and beside the bell on a phone (head.tsx;
 * Today in three zones, 2 Nov 2026): Your brief's pane went, since all it said the page says where it is acted on, and its
 * words are what Listen reads and Ask is handed (useBriefWords).
 *
 * Listen was a conversation with the agent asked "Brief me on today" (3 Oct): nine seconds of silence before the model
 * said what the page already showed, a second tap that hung up, and the browser's robotic voice whenever the agent could
 * not start. Now the brief's own words go to the speech route and the first word comes back in about a second; where the
 * clip cannot be made the button says why, and nothing else speaks.
 */
import { useRef, useSyncExternalStore } from "react";
import { TODAY_PHONE_WORDS, TO_SEND_ALL_WORDS, mmss, runTitleOf } from "@chanlytics/contracts";
import { WAIT_ROW_WORDS, waitRowsOf } from "@/surfaces/waits/rows";
import type { TodayBriefRun, TodayBriefWords } from "../brief-words";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { runsPending } from "../../waits/run-acts";
import { TODAY_HELPERS } from "../helpers";
import { askSpeech, useMoved } from "../shell";
import { useDayVm } from "./day-vm";

/**
 * Your brief's words, over what the page already holds: the day's view model, the day's own, and the runs waiting for a word
 * an approval can still send, said as the queue's rows say them (contracts waitRowsOf, the queue's and the Inbox's own):
 * the emails handed to you are one line, as cold email's runs and two or more runs waiting for an OK are, each other
 * run its own (todayRunWords). A run whose day has passed waits on nobody: its row says so, and the brief says nothing of it (S7-3).
 * Listen reads them and Ask is handed them, on a desk and a phone alike.
 */
export function useBriefWords(): TodayBriefWords | null {
  useMoved(["today", "broadcasts"]);
  const vm = surfaceValue("today");
  const day = useDayVm();
  const runs: TodayBriefRun[] = waitRowsOf(runsPending().waiting).map((row) =>
    row.kind === "to_send"
      ? { ...TO_SEND_ALL_WORDS.brief(row.from), sentence: TO_SEND_ALL_WORDS.sentence(row.count, row.from) }
      : row.kind === "cold_email"
        ? WAIT_ROW_WORDS.cold.brief(row)
        : row.kind === "approvals"
          ? WAIT_ROW_WORDS.approvals.brief(row.runs.map(runTitleOf))
          : { label: runTitleOf(row.run), ...TODAY_HELPERS.runs(row.run).brief },
  );
  return vm ? TODAY_HELPERS.briefWords(vm, day, runs) : null;
}

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

/** Why the voice could not be had, said once for the page, beside Listen where the head places it. */
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
const useSpeechWhy = (): string | null => useSyncExternalStore(watchWhy, readWhy, noWhy);

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

/**
 * Listen, beside the greeting (the kit head's `beside`; beside the bell on a phone), the same size at rest and while it
 * fetches the voice, so nothing beside it moves (8 Nov 2026: "Getting Ask's voice…" took it from 100px to 151, up to the
 * date). On a phone a circle the bell's size, with its words for a reader alone; on a desk the words and how long it takes
 * to hear. A press while it fetches lets go of it. Once it plays the header's capsule has it (frame/topbar BriefPlaying), and
 * the head draws no button.
 */
export function listenButton(speech: Speech, line: string) {
  const words = TODAY_PHONE_WORDS.listen;
  const length = spokenLength(line);
  const fetching = speech.state === "loading";
  return (
    <Button
      variant="glass"
      size="sm"
      className="today-listen"
      aria-label={fetching ? words.getting : words.named(length)}
      aria-busy={fetching || undefined}
      onClick={speech.toggle}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button === 0) speech.warm();
      }}
      data-state={speech.state}
      data-testid="today-listen"
    >
      {fetching ? <span className="today-listen-ring" aria-hidden="true" /> : <Icon name="headphones" size={15} />}
      <span className="today-listen-words">
        {words.word}
        <span className="today-listen-length tabular">{length}</span>
      </span>
    </Button>
  );
}
