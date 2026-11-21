/**
 * Today, calm (19 Nov 2026; the canvas Ruben approved that day, D1 to D7, over Today in three zones of 2 Nov): one head,
 * one card, one list, and an end. The card holds the one thing most worth doing, drawn whole with its own presses, and is
 * the page's only pane and the home of its one coral; everything else is a line, the whole line a press. The order is the
 * argument it always was: what cannot wait, then who waits on you, then the day, then what is left over, and analysis
 * never outranks a person who has been waiting.
 *
 *   what cannot wait (alert.tsx: a line that is down, a warning that stops customers being answered), only then
 *   the card (calm/lead.tsx): a person waiting, a run waiting for a word or a to-do (need-you.tsx), else setting up while nobody waits
 *     (setup-card.tsx), else what AI found (found.tsx)
 *   who else waits on you, three named and one line for the rest (need-you.tsx)
 *   the day, one line with its bar under it (day.tsx)
 *   what the day came to so far, one line (foot.tsx)
 *   what AI found, a line each (found.tsx)
 *   Content, one line (../content-note.tsx)
 *   the pinned lists, a line each (foot.tsx)
 *   cold email's note, and what is left to set up where it does not hold the card
 *   the page says it is done
 *
 * Which part holds the card is the page's one arrangement (today/arrangement.ts `todayCardOf`), read here before any of it
 * draws: the walk the coral always took. On a desk the same parts stand in two columns: the card and who waits on you on
 * the left, the day and the rest on the right (D7); the head's four figures are the day's one line now. The head over it
 * is the frame's (head.tsx): the greeting, one sentence, Listen. The layout is calm/calm.css's.
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { ColdEmailNote } from "@chanlytics/contracts";
import { ColdEmailLine, useColdEmailNote } from "./cold-email-note";
import { TodayContentLine } from "../content-note";
import { useTodayArrangement, type TodayArrangement } from "../arrangement";
import { forgetTodayMotion } from "../calm/motion";
import { useTodayOnPhone } from "../phone";
import { TodayAlertBand } from "./alert";
import { DayZone } from "./day";
import { DayCameTo, TodayEnd, TodayPins } from "./foot";
import { AskFound } from "./found";
import { NeedYou } from "./need-you";
import { TodayHistory } from "./history";
import { TodaySetup } from "./setup-card";
import { drawnByToday, type SeeRef } from "../../see/over";
import { useSeeOver } from "../../see/see-mount";
import { useToast } from "../shell";
import { useKeepsTheLook } from "../ai/looked";
import { HeldSheet } from "../calm/held";
import { useAiSheetOpen } from "../ai/open";
import { MorningFold, TonightLine } from "../calm/evening";
import { WeekLead, useWeekMoment } from "../calm/week";
import { TodayKeys } from "../calm/keys";

/**
 * What is left to set up, and under it the business's history while it is still coming in or a part of it stopped
 * (history.tsx), one card (nothing while neither draws): the page's card where the arrangement gave it that (`lead`), its
 * first act the coral; else at the page's end, quiet.
 */
const settingUp = (lead: boolean, note: ColdEmailNote | null) =>
  lead ? (
    <div key="setting-up" className="tq tps tz-setup tz-setup-lead" data-testid="today-setting-up">
      <TodaySetup coral />
      <TodayHistory />
    </div>
  ) : (
    <>
      <TodaySetup coral={false} line note={note} />
      <div key="setting-up" className="tq tps tz-setup" data-testid="today-setting-up">
        <TodayHistory />
      </div>
    </>
  );

/** The card where a part that is not Need you holds it: setting up, or what AI found's first row. */
function cardOfAnother(at: TodayArrangement, week: ReturnType<typeof useWeekMoment>) {
  if (at.card?.holder === "setup") return settingUp(true, null);
  if (at.card?.holder === "found") return <AskFound part="lead" held />;
  if (at.card?.holder === "week" && week) return <WeekLead {...week} />;
  return null;
}

/** Who waits on you: the card where it is theirs, three more named, and one line for what is left. */
const waitingOnYou = (at: TodayArrangement) => <NeedYou card={at.card} evening={at.morning !== null} />;

/**
 * The day and what is left over, a line each: the day, what it came to, what AI found, Content, the pins. Once the day is
 * over (W5) the day has turned to tomorrow, what AI sends tonight stands under it, and the rest, with what is left to set
 * up, folds into one line that waits for morning (calm/evening.tsx).
 */
const theRest = (at: TodayArrangement, setupLater: ReactNode) =>
  at.morning ? (
    <>
      <DayZone />
      <TonightLine />
      <DayCameTo />
      <MorningFold morning={at.morning}>
        <AskFound part="lines" held={at.card?.holder === "found"} />
        <LetAiDoMore />
        <TodayContentLine />
        <TodayPins />
        {setupLater}
      </MorningFold>
    </>
  ) : (
    <>
      <DayZone />
      <DayCameTo />
      <AskFound part="lines" held={at.card?.holder === "found"} />
      <LetAiDoMore />
      <TodayContentLine />
      <TodayPins />
    </>
  );

/** What is left to set up, at the page's foot by day; once the day is over it waits for morning in the fold. */
const setupAfter = (at: TodayArrangement, setupLater: ReactNode) => (at.morning ? null : setupLater);

/**
 * AI's sheet (ai/sheet.tsx) and Let AI do more (calm/more.tsx), each its own chunk: they read Autonomy's rows and its
 * verbs, which no first draw of Today needs. The sheet is asked for as it first opens; the line as the page draws, and
 * says nothing until its read is in anyway.
 */
const AiSheetCode = lazy(() => import("../ai/sheet").then((m) => ({ default: m.AiSheet })));
const MoreCode = lazy(() => import("../calm/more").then((m) => ({ default: m.LetAiDoMore })));

/** AI's sheet, loaded the first time it opens and kept from then on, so it shuts whole. */
function AiSheet() {
  const open = useAiSheetOpen();
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (open) setAsked(true);
  }, [open]);
  return asked || open ? (
    <Suspense fallback={null}>
      <AiSheetCode />
    </Suspense>
  ) : null;
}

/** Let AI do more (W10), from its own chunk. */
function LetAiDoMore() {
  return (
    <Suspense fallback={null}>
      <MoreCode />
    </Suspense>
  );
}

/** What opens over Today, its own chunk, asked for as a visit or a conversation opens (today/over/mount.tsx). */
const TodayOver = lazy(() => import("../over/mount").then((m) => ({ default: m.TodayOver })));

/**
 * A visit or a conversation open over Today (the second look of 20 Nov 2026, N1 to N3), by the page's address: the one
 * open, or the one last open while its sheet leaves. Nothing, and nothing loaded, until one is.
 */
function TodayOverHere() {
  const ref = useSeeOver();
  const [toastNode, flash] = useToast();
  const kept = useRef<SeeRef | null>(null);
  const mine = ref && drawnByToday(ref) ? ref : null;
  if (mine) kept.current = mine;
  const shown = mine ?? kept.current;
  return (
    <>
      {shown ? (
        <Suspense fallback={null}>
          <TodayOver seeRef={shown} open={mine !== null} flash={flash} />
        </Suspense>
      ) : null}
      {toastNode}
    </>
  );
}

export function TodayZones() {
  // Today left: the next visit's first draw moves nothing (D14).
  useEffect(() => forgetTodayMotion, []);
  // This member's look at Today is kept as they put it away, for the next look's "since" (W2).
  useKeepsTheLook();
  const at = useTodayArrangement();
  const week = useWeekMoment();
  const phone = useTodayOnPhone();
  // Cold email's note joins what is left to set up (D21); where setting up holds the card, it is a line of its own.
  const note = useColdEmailNote();
  const setupLater = at.card?.holder === "setup" ? note ? <ColdEmailLine note={note} /> : null : settingUp(false, note);
  // The page warms a little once the day is over (evening.css, W16): an attribute, never a colour that means something.
  const evening = at.morning ? "" : undefined;
  if (phone)
    return (
      <div
        className="dash-a-v2 dash-a-v2-glass dash-a-v2-phone tz tz-phone calm"
        data-testid="today-phone"
        data-evening={evening}
      >
        <TodayAlertBand />
        {cardOfAnother(at, week)}
        {waitingOnYou(at)}
        {theRest(at, setupLater)}
        {setupAfter(at, setupLater)}
        <TodayOverHere />
        <AiSheet />
        <HeldSheet />
        <TodayEnd />
      </div>
    );
  return (
    <div className="dash-a-v2 dash-a-v2-glass tz calm" data-testid="today-zones" data-evening={evening}>
      <TodayAlertBand />
      <div className="calm-desk">
        <div className="calm-col">
          {cardOfAnother(at, week)}
          {waitingOnYou(at)}
        </div>
        {/* Setting up stands at the foot of the day's column, so the two columns end near each other (the second look, L8). */}
        <div className="calm-col">
          {theRest(at, setupLater)}
          {setupAfter(at, setupLater)}
        </div>
      </div>
      <TodayOverHere />
      <AiSheet />
      <HeldSheet />
      <TodayKeys />
      <TodayEnd />
    </div>
  );
}
