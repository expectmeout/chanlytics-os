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
 * Which part holds the card is the page's one arrangement (today/arrangement.ts `cardOf`), read here before any of it
 * draws: the walk the coral always took. On a desk the same parts stand in two columns: the card and who waits on you on
 * the left, the day and the rest on the right (D7); the head's four figures are the day's one line now. The head over it
 * is the frame's (head.tsx): the greeting, one sentence, Listen. The layout is calm/calm.css's.
 */
import { useEffect } from "react";
import { forgetFromToday } from "../../inbox/carried-reply";
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
function cardOfAnother(at: TodayArrangement) {
  if (at.card?.holder === "setup") return settingUp(true, null);
  if (at.card?.holder === "found") return <AskFound part="lead" held />;
  return null;
}

/** Who waits on you: the card where it is theirs, three more named, and one line for what is left. */
const waitingOnYou = (at: TodayArrangement) => <NeedYou card={at.card} />;

/** The day and what is left over, a line each: the day, what it came to, what AI found, Content, the pins. */
const theRest = (at: TodayArrangement) => (
  <>
    <DayZone />
    <DayCameTo />
    <AskFound part="lines" held={at.card?.holder === "found"} />
    <TodayContentLine />
    <TodayPins />
  </>
);

export function TodayZones() {
  // Back on Today: the thread it last opened no longer offers the way back to it (carried-reply.ts carryFromToday).
  useEffect(() => forgetFromToday(), []);
  // Today left: the next visit's first draw moves nothing (D14).
  useEffect(() => forgetTodayMotion, []);
  const at = useTodayArrangement();
  const phone = useTodayOnPhone();
  // Cold email's note joins what is left to set up (D21); where setting up holds the card, it is a line of its own.
  const note = useColdEmailNote();
  const setupLater = at.card?.holder === "setup" ? note ? <ColdEmailLine note={note} /> : null : settingUp(false, note);
  if (phone)
    return (
      <div className="dash-a-v2 dash-a-v2-glass dash-a-v2-phone tz tz-phone calm" data-testid="today-phone">
        <TodayAlertBand />
        {cardOfAnother(at)}
        {waitingOnYou(at)}
        {theRest(at)}
        {setupLater}
        <TodayEnd />
      </div>
    );
  return (
    <div className="dash-a-v2 dash-a-v2-glass tz calm" data-testid="today-zones">
      <TodayAlertBand />
      <div className="calm-desk">
        <div className="calm-col">
          {cardOfAnother(at)}
          {waitingOnYou(at)}
          {setupLater}
        </div>
        <div className="calm-col">{theRest(at)}</div>
      </div>
      <TodayEnd />
    </div>
  );
}
