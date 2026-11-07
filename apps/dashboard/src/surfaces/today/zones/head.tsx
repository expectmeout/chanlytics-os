/**
 * Today's head (Today in three zones, 2 Nov 2026), said to the frame's head in Glass: the greeting by the hour to the
 * member by their first name, as the page's name, and under it one sentence that follows the rows. A line that is down
 * leads, and how many need you as well; else how many need you, the one count (the badge's, the strip's Inbox tab's, the
 * phone tab's and the title's: Need you's rows above To do still open, needs-you.ts), then what Ask prepared and the one thing
 * that cannot wait, as the rows still hold them (need-you/head-say.ts); after closing, how today went; with nobody
 * waiting, what is listening on a quiet day, else "Nothing needs you." and that that's everyone (contracts
 * todayHeadLine). Listen stands beside the greeting on a desk and beside the bell on a phone (the kit head's `beside`); on
 * a desk the day's four figures stand at the head's right (figures.tsx). Under the sentence, one line of what happened
 * since the member last looked at the bell (contracts todaySince), which opens in place into its receipts (the kit head's
 * `after`).
 *
 * The greeting is the only sentence made in the dashboard (today/chrome.ts, where Today's address says it from the
 * frame's first draw, before the page is read, so the head never says "Today" first).
 */
import { useState, type ReactNode } from "react";
import {
  todaySince,
  todayWentLine,
  todayZoneDay,
  type CalendarLike,
  type TodayHeadLineVM,
  type TodaySinceVM,
} from "@chanlytics/contracts";
import type { CalendarSurface } from "@/surfaces/calendar/surface";
import { Button } from "../../kit/button/button";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { SAYS_WHEN } from "../../kit/says-when";
import { routeDoor } from "../../frame-verbs";
import { useNeedsYou } from "../../needs-you";
import { useSurface } from "../../use-surface";
import { todayGreetingNow } from "../chrome";
import { TODAY_HELPERS } from "../helpers";
import { useHeadSay } from "../need-you/head-say";
import { reviewsToAnswer } from "../need-you/reviews";
import { useTodayOnPhone } from "../phone";
import { bell, borrowed, useMoved, workspaceClock } from "../shell";
import { useDayVm } from "./day-vm";
import { TodayHeadFigures } from "./figures";
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

/** One of Since you looked's rows, opened: its glyph, what happened, the receipt under it, and when. */
function sinceRow(r: TodaySinceVM["rows"][number]) {
  const body = (
    <>
      <i aria-hidden="true">
        <Icon name={r.glyph} size={14} />
      </i>
      <span className="tz-sn-words">
        <b>{r.title}</b>
        {r.sub ? <span>{r.sub}</span> : null}
      </span>
      <time {...SAYS_WHEN}>{r.at}</time>
    </>
  );
  return r.to ? (
    <a key={r.key} className="tz-sn" {...routeDoor(r.to)}>
      {body}
    </a>
  ) : (
    <div key={r.key} className="tz-sn">
      {body}
    </div>
  );
}

/**
 * Since you looked: one quiet line under the sentence, since when and the news in a few words, and its rows in a pane
 * under it once pressed. It opens in place, and moves nothing: the bell's press is what says the member looked.
 */
function SinceLine({ since }: { since: TodaySinceVM }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="quiet"
        size="text"
        className="tz-since"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="today-since"
      >
        <b {...SAYS_WHEN}>{since.when}</b>
        {since.bits.map((b) => (
          <em key={b}>{b}</em>
        ))}
        <Icon name="chevron-down" size={12} />
      </Button>
      {open ? (
        <Panel className="tz-since-list" data-testid="today-since-list">
          {since.rows.map(sinceRow)}
        </Panel>
      ) : null}
    </>
  );
}

/** What happened since the member last looked: Today's read's half, and the bell's notes beside it. */
function useSince(): TodaySinceVM | null {
  useMoved(["today", "notifications", "google"]);
  const vm = useSurface("today");
  // The reviews To do offers to answer: their news is To do's row, and Since you looked does not say it again.
  const google = useSurface("google");
  const api = bell();
  if (!vm?.since) return null;
  const notes = api
    ? api.feed().map((r) => ({
        kind: r.kind,
        at: r.at,
        title: r.title,
        message: r.message,
        to: r.actions[0]?.to,
        about: r.about,
        id: r.id,
      }))
    : [];
  return todaySince({
    seenAt: vm.since.seen_at,
    answered: vm.since.answered,
    notes,
    covered: reviewsToAnswer(google).map((r) => ({ id: r.id, reviewId: r.review_id })),
    tz: workspaceClock()?.zone() ?? "UTC",
    nowMs: Date.now(),
  });
}

/** Whether the day has turned to tomorrow, as the day's zone says it (contracts todayZoneDay): the head says how today went. */
function useDayTurned(): boolean {
  const day = useDayVm();
  const cal = borrowed<CalendarSurface>("__CALENDAR");
  return todayZoneDay((cal?.vm as CalendarLike | undefined) ?? null, day, [], Date.now())?.tomorrow ?? false;
}

/** Today's standing, said to the frame's head as the page draws: the greeting, its one sentence, Since you looked, the figures. */
export function useZonesStanding(): void {
  const phone = useTodayOnPhone();
  const vm = useSurface("today");
  const said = useHeadSay();
  // The one count, the badge's: it leaves a row the moment Need you acts on it (needs-you.ts needsYouActed).
  const count = useNeedsYou() ?? 0;
  const turned = useDayTurned();
  const since = useSince();
  const words = useBriefWords();
  const brief = words && words.sentences.length ? words.text : null;
  const speech = useSpeech(brief);
  const went = turned && vm ? todayWentLine(vm.figures) : null;
  const line = vm ? TODAY_HELPERS.headLine(vm.standing, count, said, vm.quiet, went) : null;
  const listen = speech.can && brief ? listenButton(speech, brief) : null;
  useStanding({
    stacked: true,
    title: todayGreetingNow(),
    sentence: line ? headSentence(line, speech.why) : undefined,
    beside: listen ?? undefined,
    after: since ? <SinceLine since={since} /> : undefined,
    // On a phone the date says the hour beside Listen and the bell (the canvas: "Tue, Nov 3 · 8:05 AM").
    dateHour: true,
    // A desk's act is the day's four figures, at the head's right; a phone's stand in Today so far (foot.tsx).
    ...(!phone ? { act: <TodayHeadFigures /> } : {}),
  });
}
