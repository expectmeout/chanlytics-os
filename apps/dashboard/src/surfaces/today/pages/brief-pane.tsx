/**
 * Your brief (canvas E3, Glass): what the day says in prose, beside the queue -- who needs you and how long the oldest
 * has waited, the calendar's day, what came in, the runs waiting for a word (contracts todayBriefWords, over what the
 * page already holds: the day's view model, the day's own, the broadcasts' runs) -- then only the lines a summary
 * cannot carry as a sentence, each with its door (a reply that failed, a review that landed, what ran; card.tsx
 * recapBeats). It is one summary: the quiet day's list of lines and numbers and the receipts stood
 * under it as three more blocks in three sizes (Ruben, 7 Oct 2026), and the follow-up is there for the rest. Two acts
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
import {
  TO_SEND_ALL_WORDS,
  WAIT_ROW_WORDS,
  runTitleOf,
  waitRowsOf,
  type TodayBriefRun,
  type TodayBriefWords,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, askAbout, useMoved, workspaceClock } from "../shell";
import { recapBeats } from "./card";
import { useDayVm } from "./day";
import { runsPending } from "../../waits/run-acts";
import { listenButton, useSpeech } from "./listen";

/** The brief's sentences as drawn: a name in bold where the canvas sets it, a space between sentences. */
function briefLine(words: TodayBriefWords) {
  return words.sentences.map((sentence, i) => (
    <span key={i}>
      {i > 0 ? " " : ""}
      {sentence.map((run, j) => (run.strong ? <b key={j}>{run.text}</b> : <span key={j}>{run.text}</span>))}
    </span>
  ));
}

/**
 * The brief's words, over what the page already holds: the day's view model, the day's own, and the runs waiting for a word
 * an approval can still send, said as the queue's rows say them (contracts waitRowsOf, the queue's and the Inbox's own):
 * the emails handed to you are one line, as two or more runs waiting for an OK are, each other run its own
 * (todayRunWords). A run whose day has passed waits on nobody: its row says so, and the brief says nothing of it (S7-3).
 * Your brief draws them, and Listen reads them, on a desk and on a phone's head alike.
 */
export function useBriefWords(): TodayBriefWords | null {
  useMoved(["today", "broadcasts"]);
  const vm = surfaceValue("today");
  const day = useDayVm();
  const runs: TodayBriefRun[] = waitRowsOf(runsPending().waiting).map((row) =>
    row.kind === "to_send"
      ? { ...TO_SEND_ALL_WORDS.brief(row.from), sentence: TO_SEND_ALL_WORDS.sentence(row.count, row.from) }
      : row.kind === "approvals"
        ? WAIT_ROW_WORDS.approvals.brief(row.runs.map(runTitleOf))
        : { label: runTitleOf(row.run), ...TODAY_HELPERS.runs(row.run).brief },
  );
  return vm ? TODAY_HELPERS.briefWords(vm, day, runs) : null;
}

export const TodayBriefPane = () => {
  const vm = surfaceValue("today");
  const words = useBriefWords();
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
