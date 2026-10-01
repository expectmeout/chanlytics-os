/**
 * Your brief (canvas E3, Glass): what the day says in prose, beside the queue -- who needs you and how long the oldest
 * has waited, the calendar's day, what came in, the runs waiting for a word (contracts todayBriefWords, over what the
 * page already holds: the day's view model, the day's own, the broadcasts' runs) -- then the lines that are not
 * numbers (a reply that failed, a review that landed, what ran, the receipts), which the day's card draws under its
 * figures in Classic (card.tsx recapBeats: the same lines, drawn once, here in Glass and there in Classic). Two acts
 * under the line, as E3 draws them: Listen, the brief read aloud by the device's own voice where it has one (Web
 * Speech), with how long it takes to hear beside it; and a follow-up to Ask, grounded in the same words. Drawn by the
 * Glass composition alone (today-page.tsx).
 */
import { useEffect, useState } from "react";
import type { TodayBriefWords } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, askAbout, useMoved, workspaceClock } from "../shell";
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

/** The device can read the brief aloud: the browser's own voice, where it has one. */
const canSpeak = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** How long the brief takes to hear at a reader's pace, 160 words a minute, as "0:48": from the words, never a recording. */
function spokenLength(text: string): string {
  const words = text.split(/\s+/).filter(Boolean).length;
  const s = Math.max(1, Math.round((words / 160) * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Listen and Stop: the brief read aloud while the page is up; a page left mid-sentence falls silent. */
function useSpeech(text: string | null): { can: boolean; speaking: boolean; toggle: () => void } {
  const [speaking, setSpeaking] = useState(false);
  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );
  const can = canSpeak();
  const toggle = () => {
    if (!can || !text) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const said = new SpeechSynthesisUtterance(text);
    said.onend = () => setSpeaking(false);
    said.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(said);
    setSpeaking(true);
  };
  return { can, speaking, toggle };
}

/**
 * Listen, as E3 draws it: in the acts under the line on a desk, at the right of the head on a phone. Drawn in both
 * places and shown in one by the sheet's breakpoint (dashboard-a-v2.css .tb-listen-head), so the page needs no measure
 * of its own; the hidden one is out of the reader's tree.
 */
function listenButton(speech: ReturnType<typeof useSpeech>, line: string, place: "head" | "foot") {
  return (
    <Button
      variant="secondary"
      size="sm"
      className={place === "head" ? "tb-listen tb-listen-head" : "tb-listen"}
      aria-pressed={speech.speaking}
      onClick={speech.toggle}
      data-testid={place === "head" ? "today-brief-listen-head" : "today-brief-listen"}
    >
      <Icon name={speech.speaking ? "stop" : "play"} size={11} />
      {speech.speaking ? "Stop" : "Listen"}
      {!speech.speaking && <span className="tb-listen-len tabular">{spokenLength(line)}</span>}
    </Button>
  );
}

export const TodayBriefPane = () => {
  useMoved(["today", "reports", "broadcasts"]);
  const vm = surfaceValue("today");
  const day = useDayVm();
  // The runs the queue holds for a word, said as the queue says them (todayRunWords).
  const runs = runsPending().waiting.map((r) => ({
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
