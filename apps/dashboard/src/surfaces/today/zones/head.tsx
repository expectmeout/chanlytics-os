/**
 * Today's head (Today in three zones, 2 Nov 2026), said to the frame's head in Glass: the greeting by the hour to the
 * member by their first name, as the page's name, and under it one sentence that follows the rows. A line that is down
 * leads, and how many need you as well; else how many need you, the one count (the badge's, the strip's Inbox tab's, the
 * phone tab's and the title's: Need you's rows above To do still open, needs-you.ts), then what Ask prepared and the one thing
 * that cannot wait, as the rows still hold them (need-you-model.ts useNeedYouLine); after closing, how today went; with nobody
 * waiting, what is listening on a quiet day, else "Nothing needs you." and that that's everyone (contracts
 * todayHeadLine). Listen stands beside the greeting on a desk and beside the bell on a phone (the kit head's `beside`); on
 * a desk the day's four figures stand at the head's right (figures.tsx). Nothing stands under the sentence: what happened
 * since the member last looked is the bell's to say, and the day's figures' (decision 0136; the line that stood here said
 * each of them a second time).
 *
 * The greeting is the only sentence made in the dashboard (today/chrome.ts, where Today's address says it from the
 * frame's first draw, before the page is read, so the head never says "Today" first).
 */
import type { ReactNode } from "react";
import {
  NEED_YOU_WORDS,
  todayWentLine,
  todayZoneDay,
  type CalendarLike,
  type TodayHeadLineVM,
} from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { useStanding } from "../../kit/head/standing";
import { routeDoor } from "../../frame-verbs";
import { useNeedsYou } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { todayGreetingNow } from "../chrome";
import { TODAY_HELPERS } from "../helpers";
import { useNeedYouLine } from "../need-you-model";
import { useTodayOnPhone } from "../phone";
import { useDayVm } from "./day-vm";
import { TodayHeadFigures } from "./figures";
import { listenButton, useBriefWords, useSpeech } from "./listen";

/**
 * The head's sentence as drawn: what leads in bold (kit.css `.pg-sentence b`), the rest after it, then why Listen could not
 * speak. On a phone how many need you is a door to who they are (`door`). Called, not
 * drawn, so the head's tree has no part of its own for it.
 */
function headSentence(line: TodayHeadLineVM, why: string | null, door: string | null): ReactNode {
  const lead = <b data-testid="today-head-lead">{line.lead}</b>;
  return (
    <>
      {door ? (
        <a className="tz-lead" {...routeDoor(door)}>
          {lead}
        </a>
      ) : (
        lead
      )}
      {line.rest ? ` ${line.rest}` : null}
      {why ? (
        <span className="today-listen-why" role="status" data-testid="today-listen-why">
          {why}
        </span>
      ) : null}
    </>
  );
}

/** On a phone, where no list head says it: how many were done today, after how many need you, where nothing else stands. */
const withDoneToday = (line: TodayHeadLineVM, done: number): TodayHeadLineVM =>
  line.rest || done <= 0 ? line : { ...line, rest: `${NEED_YOU_WORDS.doneToday(done)}.` };

/** Whether the day has turned to tomorrow, as the day's zone says it (contracts todayZoneDay): the head says how today went. */
function useDayTurned(): boolean {
  const day = useDayVm();
  const cal = surfaceValue("calendar");
  return todayZoneDay((cal?.vm as CalendarLike | undefined) ?? null, day, [], Date.now())?.tomorrow ?? false;
}

/** Today's standing, said to the frame's head as the page draws: the greeting, its one sentence, the figures. */
export function useZonesStanding(): void {
  const phone = useTodayOnPhone();
  const vm = useSurface("today");
  // Read from Need you's own model in the head's pass, never heard from the list as it draws: the line is there on the
  // first frame (today/arrangement.ts says why).
  const said = useNeedYouLine(vm ?? null);
  // The one count, the badge's: it leaves a row the moment Need you acts on it (needs-you.ts needsYouActed).
  const count = useNeedsYou() ?? 0;
  const turned = useDayTurned();
  const words = useBriefWords();
  const brief = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(brief);
  const went = turned && vm ? todayWentLine(vm.figures) : null;
  const done = vm?.done_today ?? 0;
  const plainLine = vm ? TODAY_HELPERS.headLine(vm.standing, count, said, vm.calm, went, done > 0) : null;
  const line = plainLine && phone && count > 0 ? withDoneToday(plainLine, done) : plainLine;
  // Only where the brief has news, and not once it plays: the header's capsule has it then (BriefPlaying).
  const listen = speech.can && brief && words?.news && speech.state !== "speaking" ? listenButton(speech, brief) : null;
  useStanding({
    stacked: true,
    title: todayGreetingNow(),
    sentence: line ? headSentence(line, speech.why, phone && count > 0 ? "inbox" : null) : undefined,
    beside: listen ?? undefined,
    // On a phone the date says the hour beside Listen and the bell (the canvas: "Tue, Nov 3 · 8:05 AM").
    dateHour: true,
    // A desk's act is the day's four figures, at the head's right; a phone's stand in Today so far (foot.tsx).
    ...(!phone ? { act: <TodayHeadFigures /> } : {}),
  });
}
