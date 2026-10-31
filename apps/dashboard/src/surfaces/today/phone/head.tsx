/**
 * Today's head on a phone (the phone canvas, 28 Oct 2026; docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md
 * §1): what now in the page's largest words, and the one line under them, under the greeting the frame's head says as the
 * page's name, with Listen at its right (today/chrome.ts; pages/today-head.tsx). The greeting was this head's own, at
 * the size of its words, and the frame's head said "Today" over it until the page was read: two headlines on every load
 * (Ruben, 31 Oct 2026). The words are the ladder's (contracts todayPhoneHead over the standing the desk's head says, with
 * the runs the page holds and the badge counts). Need you's list is right under it and is named by its title. Listen reads
 * Your brief's words, which on a phone have no pane of their own.
 */
import { useSurface } from "../../use-surface";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { TODAY_HELPERS } from "../helpers";
import { useSpeechWhy } from "../pages/listen";

/** The head's title, which Need you's list is named by. */
export const TODAY_HEAD_ID = "today-phone-title";

export function TodayPhoneHead() {
  const vm = useSurface("today");
  // Drawn again when a part of what waits moves (a run approved, a run made), not only when Today is read.
  const live = useNeedsYouParts();
  const why = useSpeechWhy();
  if (!vm) return null;
  const head = TODAY_HELPERS.phoneHead(vm.standing, needsYouOnToday(vm, live).runs);
  return (
    <header className="tph" data-testid="today-phone-head">
      {/* The page's name is the greeting over it, the frame's h1: what now is said under it. */}
      <h2 className="tph-title" id={TODAY_HEAD_ID} data-tone={vm.standing.tone}>
        {head.title}
      </h2>
      {head.line ? <p className="tph-line">{head.line}</p> : null}
      {why ? (
        <p className="tph-why" role="status" data-testid="today-listen-why">
          {why}
        </p>
      ) : null}
    </header>
  );
}
