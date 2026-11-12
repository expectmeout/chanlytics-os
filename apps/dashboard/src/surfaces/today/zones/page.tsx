/**
 * Today in three zones (2 Nov 2026; the canvas Ruben approved that day, decisions 0071 and 0076 as amended): one head, then
 * three zones. Need you, everything that waits on you, in groups, one count; the day, what's ahead first; and Ask found,
 * what is worth a look and waits on nobody. The order is the argument: what cannot wait for the list, then the work, then
 * the day, then what is left over, and analysis never outranks a person who has been waiting.
 *
 *   what cannot wait (alert.tsx: a line that is down, a warning that stops customers being answered), only then
 *   Need you (need-you.tsx)                            | the day (day.tsx)
 *   Cold email's note and Content's card under it,     | Ask found (found.tsx), under the day
 *   each where it has something to say                 |
 *   (cold-email-note.tsx, ../content-note.tsx)         |
 *   what is left to set up, under Need you while       |
 *   someone waits, over it while nobody does           |
 *   the week and the pinned lists, one strip (foot.tsx)
 *
 * Content's card stands under Need you on a phone and a desk alike, as the content canvas draws it (PhDoors "today"), in
 * stage 3's place at the foot no longer: its own read lands after the page's, and it moves what is under it as it does.
 *
 * Where Need you draws no pane but Older, which nobody counts and which stands at the page's end (zones.css), or none at all
 * (nothing waits on you: the canvas's quiet day, "most owners, most days", whatever came in), Ask found leads the work's
 * column, wide, its rows three across, its first act the coral where setting up holds none;
 * where it finds nothing either, the day stands alone in one column. On a phone the same blocks in one column: Need you's
 * groups each a pane of their own, Ask found where it leads, the day, Ask found under it, Today so far (the four figures
 * and the week), the pins, what is left to set up, and the page says it is done. The head over it is the frame's
 * (head.tsx): the greeting, one sentence, Listen, Since you looked, and on a desk the day's four figures. The grid is
 * zones.css's. Which of it draws where, and which part's act is the coral, is the page's one arrangement
 * (today/arrangement.ts), read here before any of it draws.
 */
import { ColdEmailNote } from "./cold-email-note";
import { TodayContentNote } from "../content-note";
import { useTodayArrangement, type TodayArrangement } from "../arrangement";
import { useTodayOnPhone } from "../phone";
import { TodayAlertBand } from "./alert";
import { DayZone } from "./day";
import { DeskFoot, PhoneNothingYet, PhonePins, PhoneSoFar, TodayEnd, useNothingSoFar } from "./foot";
import { AskFound } from "./found";
import { NeedYou } from "./need-you";
import { TodayBroughtIn } from "./brought-in";
import { TodaySetup } from "./setup-card";

/**
 * What is left to set up and what was brought in, one card (nothing while neither draws), over Need you (`lead`) or under
 * it; its first act the coral where the arrangement gave it.
 */
const settingUp = (lead: boolean, at: TodayArrangement) => (
  <div key="setting-up" className={`tq tps tz-setup${lead ? " tz-setup-lead" : ""}`} data-testid="today-setting-up">
    <TodaySetup coral={at.coral === "setup"} />
    <TodayBroughtIn />
  </div>
);

/** Ask found where it leads the page, wide, its first act the coral where the arrangement gave it. */
const foundLeading = (at: TodayArrangement) => (at.lead ? <AskFound wide coral={at.coral === "found"} /> : null);

/** Ask found under the day, where it does not lead: never the coral. */
const foundUnder = (at: TodayArrangement) => (at.lead ? null : <AskFound wide={false} coral={false} />);

/** Today on a phone: the same blocks in one column, in the canvas's order. */
function PhoneToday({ at }: { at: TodayArrangement }) {
  // On a day nothing was counted the four zeros are one line under the day, and no card of their own.
  const nothing = useNothingSoFar();
  return (
    <div className="dash-a-v2 dash-a-v2-glass dash-a-v2-phone tz tz-phone" data-testid="today-phone">
      <TodayAlertBand />
      {at.waiting ? null : settingUp(true, at)}
      <NeedYou />
      <ColdEmailNote />
      <TodayContentNote />
      {foundLeading(at)}
      <DayZone under={nothing ? <PhoneNothingYet /> : null} />
      {foundUnder(at)}
      {nothing ? null : <PhoneSoFar />}
      <PhonePins />
      {at.waiting ? settingUp(false, at) : null}
      <TodayEnd />
    </div>
  );
}

export function TodayZones() {
  // Setting up never stands over a person waiting: under Need you while anyone does (keyed, so a turn moves and never
  // mounts them again), over it while nobody does. Ask found leads where Need you draws no pane, once Today has been read.
  // Nothing waits and nothing was found: the day alone, one column, rather than a work column left empty beside it.
  const at = useTodayArrangement();
  const phone = useTodayOnPhone();
  if (phone) return <PhoneToday at={at} />;
  const { waiting, alone } = at;
  return (
    <div className="dash-a-v2 dash-a-v2-glass tz" data-testid="today-zones">
      <TodayAlertBand />
      <div className={`tz-bento${alone ? " tz-bento-one" : ""}`}>
        <div className="tz-col">
          {waiting ? null : settingUp(true, at)}
          <NeedYou />
          <ColdEmailNote />
          <TodayContentNote />
          {foundLeading(at)}
          {waiting ? settingUp(false, at) : null}
          {alone ? <DayZone /> : null}
        </div>
        {alone ? null : (
          <div className="tz-col">
            <DayZone />
            {foundUnder(at)}
          </div>
        )}
      </div>
      <DeskFoot />
    </div>
  );
}
