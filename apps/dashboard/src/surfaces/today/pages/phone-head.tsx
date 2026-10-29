/**
 * Today's head on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md
 * §1): the greeting with Listen at its right, then what now in the page's largest words, and the one line under them. The
 * words are the ladder's (contracts todayPhoneHead over the standing the desk's head says, with the runs the page holds and
 * the badge counts); the greeting is the desk's own (today-head.tsx). Need you's list is right under it and is named by
 * its title. Listen reads Your brief's words, which on a phone have no pane of their own.
 */
import { useSurface } from "../../use-surface";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { TODAY_HELPERS } from "../helpers";
import { member, workspaceClock } from "../shell";
import { useBriefWords } from "./brief-pane";
import { listenButton, useSpeech } from "./listen";
import { todayGreeting } from "./today-head";

/** The head's title, which Need you's list is named by. */
export const TODAY_HEAD_ID = "today-phone-title";

export function TodayPhoneHead() {
  const vm = useSurface("today");
  // Drawn again when a part of what waits moves (a run approved, a run made), not only when Today is read.
  const live = useNeedsYouParts();
  const words = useBriefWords();
  const line = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(line);
  if (!vm) return null;
  const head = TODAY_HELPERS.phoneHead(vm.standing, needsYouOnToday(vm, live).runs);
  const zone = workspaceClock()?.zone() ?? "UTC";
  return (
    <header className="tph" data-testid="today-phone-head">
      <div className="tph-greet">
        <span>{todayGreeting(Date.now(), zone, member()?.display_name)}</span>
        {speech.can && line ? listenButton(speech, line, "phone") : null}
      </div>
      <h1 className="tph-title" id={TODAY_HEAD_ID} data-tone={vm.standing.tone}>
        {head.title}
      </h1>
      {head.line ? <p className="tph-line">{head.line}</p> : null}
      {speech.why ? (
        <p className="tph-why" role="status" data-testid="today-listen-why">
          {speech.why}
        </p>
      ) : null}
    </header>
  );
}
