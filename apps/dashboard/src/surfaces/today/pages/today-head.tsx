/**
 * Where Today stands, said to the frame's head in Glass (the redesign of 1 Nov 2026): the greeting by the hour to the member
 * by their first name, as the page's name, and under it one sentence on a desk and a phone alike: what leads in the darker
 * ink (a line that is down, or how many need you, in the badge's number), then what Ask prepared and the one thing that
 * cannot wait (contracts todayHeadLine, over the queue's line, need-you/head-say.ts), with why Listen could not speak at
 * its end. Listen, which reads Your brief's words aloud where Ask can speak (listen.tsx), stands beside the greeting on a
 * desk and beside the bell on a phone (the kit head's `beside`; the canvases of 1 Nov 2026): at the sentence's end it
 * stood a capsule's height over its second line. On a desk the day's four figures stand at the head's right (card.tsx
 * TodayHeadFigures). The phone said a second headline under the greeting
 * ("4 conversations need you") at nearly its size, over a line that said the runs the badge had already counted, and
 * Listen pushed the greeting onto two lines (his phone, 1 Nov 2026): one name, one sentence now.
 *
 * The greeting is the only sentence made in the dashboard (today/chrome.ts, where Today's address says it from the
 * frame's first draw, before the page is read, so the head never says "Today" first).
 */
import type { ReactNode } from "react";
import { needsYouCount, type TodayHeadLineVM } from "@chanlytics/contracts";
import { useStanding } from "../../kit/head/standing";
import { needsYouOnToday, useNeedsYouParts } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { todayGreetingNow } from "../chrome";
import { TODAY_HELPERS } from "../helpers";
import { useHeadSay } from "../need-you/head-say";
import { useTodayOnPhone } from "../phone";
import { TodayHeadFigures } from "./card";
import { listenButton, useBriefWords, useSpeech } from "./listen";

/**
 * The head's sentence as drawn: what leads in bold (kit.css `.pg-sentence b`), the rest after it, then why Listen could not
 * speak. Called, not drawn, so the head's tree has no part of its own for it.
 */
function headSentence(line: TodayHeadLineVM, why: string | null): ReactNode {
  return (
    <>
      <b data-testid="today-head-lead">{line.lead}</b>
      {line.rest ? ` ${line.rest}` : null}
      {why ? (
        <span className="today-listen-why" role="status" data-testid="today-listen-why">
          {why}
        </span>
      ) : null}
    </>
  );
}

/** Today's standing, said to the frame's head as the page draws: the greeting, its one sentence, and on a desk the figures. */
export function useTodayStanding(): void {
  const phone = useTodayOnPhone();
  const vm = useSurface("today");
  // Drawn again when a part of what waits moves (a run approved, a run made), not only when Today is read.
  const live = useNeedsYouParts();
  const say = useHeadSay();
  const words = useBriefWords();
  const brief = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(brief);
  const waiting = vm ? needsYouCount(needsYouOnToday(vm, live)) : 0;
  const line = vm ? TODAY_HELPERS.headLine(vm.standing, waiting, say, vm.quiet ? vm.quiet.sub : null) : null;
  const listen = speech.can && brief ? listenButton(speech, brief) : null;
  useStanding({
    stacked: true,
    title: todayGreetingNow(),
    sentence: line ? headSentence(line, speech.why) : undefined,
    beside: listen ?? undefined,
    // A desk's act is the day's four figures, at the head's right (card.tsx TodayHeadFigures).
    ...(!phone ? { act: <TodayHeadFigures /> } : {}),
  });
}
