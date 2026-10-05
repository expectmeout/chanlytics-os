/**
 * Your brief (canvas E3, Glass): what the day says in prose, beside the queue -- who needs you and how long the oldest
 * has waited, the calendar's day, what came in, the runs waiting for a word (contracts todayBriefWords, over what the
 * page already holds: the day's view model, the day's own, the broadcasts' runs) -- then the lines that are not
 * numbers (a reply that failed, a review that landed, what ran, the receipts), which the day's card draws under its
 * figures in Classic (card.tsx recapBeats: the same lines, drawn once, here in Glass and there in Classic). Two acts
 * under the line, as E3 draws them: Listen, the brief read aloud in Ask's one voice (the one-way speech: the words on
 * screen, spoken as the vendor makes them, nobody speaking back; docs/superpowers/specs/2026-10-03-ask-spoken-design.md,
 * §3.5 as amended 4 Oct 2026), with how long it takes to hear beside it; and a follow-up to Ask, grounded in the same
 * words. Drawn by the Glass composition alone (today-page.tsx).
 *
 * Listen was a conversation with the agent asked "Brief me on today" (3 Oct): nine seconds of silence before the model
 * said what the page already showed, a second tap that hung up, and the browser's robotic voice whenever the agent
 * could not start. Now the brief's own words go to the speech route and the first word comes back in about a second;
 * where the clip cannot be made the button says why, and nothing else speaks.
 */
import { useRef, useState, useSyncExternalStore } from "react";
import { mmss, type TodayBriefRun, type TodayBriefWords } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, askAbout, askSpeech, useMoved, workspaceClock } from "../shell";
import { recapBeats } from "./card";
import { useDayVm } from "./day";
import { runsPending } from "./queue-runs";

/** The brief's sentences as drawn: a name in bold where the canvas sets it, a space between sentences. */
function briefLine(words: TodayBriefWords) {
  return words.sentences.map((sentence, i) => (
    <span key={i}>
      {i > 0 ? " " : ""}
      {sentence.map((run, j) => (run.strong ? <b key={j}>{run.text}</b> : <span key={j}>{run.text}</span>))}
    </span>
  ));
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

/**
 * Listen and Stop: the brief read aloud in Ask's voice. The clip and what is happening to it are the bridge's, not the
 * pane's (useSyncExternalStore over its watch): a pane drawn again while it plays (Today redraws itself as its data
 * moves) says Stop, a pane that did not start it hears its end, and a pane that goes away leaves it to finish. A
 * refusal (the mint, the vendor, a paused workspace) is said once beside the button, in the server's words.
 */
function useSpeech(text: string | null): { can: boolean; state: SpeechState; why: string | null; toggle: () => void } {
  const speech = askSpeech();
  const state = useSyncExternalStore(
    speech ? (on: () => void) => speech.watchSpeech(on) : noWatch,
    speech ? () => speech.state() : idle,
    idle,
  );
  const [why, setWhy] = useState<string | null>(null);
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
  return { can: !!speech, state, why, toggle };
}

/**
 * Listen, as E3 draws it: in the acts under the line on a desk, at the right of the head on a phone. Drawn in both
 * places and shown in one by the sheet's breakpoint (dashboard-a-v2.css .tb-listen-head), so the page needs no measure
 * of its own; the hidden one is out of the reader's tree.
 */
function listenButton(speech: ReturnType<typeof useSpeech>, line: string, place: "head" | "foot") {
  const busy = speech.state !== "idle";
  const word = speech.state === "speaking" ? "Stop" : speech.state === "loading" ? "Getting Ask's voice…" : "Listen";
  return (
    <Button
      variant="secondary"
      size="sm"
      className={place === "head" ? "tb-listen tb-listen-head" : "tb-listen"}
      aria-pressed={speech.state === "speaking"}
      aria-busy={speech.state === "loading" || undefined}
      onClick={speech.toggle}
      data-state={speech.state}
      data-testid={place === "head" ? "today-brief-listen-head" : "today-brief-listen"}
    >
      <Icon name={speech.state === "speaking" ? "stop" : "play"} size={11} />
      {word}
      {!busy && <span className="tb-listen-len tabular">{spokenLength(line)}</span>}
    </Button>
  );
}

export const TodayBriefPane = () => {
  useMoved(["today", "reports", "broadcasts"]);
  const vm = surfaceValue("today");
  const day = useDayVm();
  // The runs the queue holds for a word, said as the queue says them (todayRunWords).
  const runs: TodayBriefRun[] = runsPending().waiting.map((r) => ({
    label: r.audience.label,
    sentence: TODAY_HELPERS.runs(r).waiting.sentence,
  }));
  const words = vm ? TODAY_HELPERS.briefWords(vm, day, runs) : null;
  const line = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(line);
  if (!vm || !words || !line) return null;
  const clock = workspaceClock();
  const asOf = clock ? clock.time(Date.now()) : null;
  return (
    <section className="tsec tb" data-testid="today-brief" aria-labelledby="today-brief-title">
      {/* The canvas's head: the three before the name, and the hour under it; on a phone, Listen at the right. */}
      <div className="tsec-head">
        <span className="tb-three" aria-hidden="true">
          <Icon name="three" size={40} />
        </span>
        <span className="tb-words">
          <span className="tsec-title" id="today-brief-title">
            Your brief
          </span>
          {asOf && <span className="tb-eyebrow tabular">As of {asOf}</span>}
        </span>
        {speech.can && listenButton(speech, line, "head")}
      </div>
      <div className="tb-body">
        <p className="tb-line" data-testid="today-brief-line">
          {briefLine(words)}
        </p>
        {recapBeats(vm, appNavigate)}
      </div>
      <div className="tb-foot" data-testid="today-brief-ask">
        {speech.can && listenButton(speech, line, "foot")}
        {speech.why && (
          <span className="tb-why" role="status" data-testid="today-brief-listen-why">
            {speech.why}
          </span>
        )}
        <Button
          variant="quiet"
          size="sm"
          className="tb-follow"
          onClick={() => askAbout({ prompt: `${line} What should I do next?` })}
        >
          Ask a follow-up
        </Button>
      </div>
    </section>
  );
};
