/**
 * A row of the Week not made yet, opened (the approved boards, Week 12; the PRD's 21.3 in the order a planned piece has):
 * the footage it is planned from, where it goes (a line a place, its time, or why it waits), and the words AI wrote for it,
 * as the approval will make it. Its one fix leads the foot, as on its row. A made piece opens in Content's own viewer.
 *
 * A row whose time has passed is never put up late, by anyone's approval: its fix is another time, picked here as words
 * of a sentence (the day and the time, as a post's Schedule picks them: broadcasts/when.tsx), and set by the foot's press.
 */
import { useState } from "react";
import {
  DAY_MS,
  POST_AHEAD_DAYS_MAX,
  WEEK_WORDS as W,
  fileViewOf,
  slotTimePassed,
  slotWhenSaid,
  type WeekRow,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Picture } from "../../../files/photo";
import { WhenDayTime, firstSlot } from "../../broadcasts/when";
import { CmPane } from "../../parts/split";

/** The time first offered for a slot whose own has passed: the same time of day, on the first day it is still ahead. */
function nextTimeOf(row: WeekRow, now: number): number {
  const passed = row.slots.find((s) => s.state === "proposed" && slotTimePassed(s.at, now));
  const first = firstSlot(now, true);
  if (!passed) return first;
  let at = Date.parse(passed.at);
  while (at < first) at += DAY_MS;
  return at;
}

/** How a place takes a slot, as its line says it: "Instagram reel", "Google post". */
const placeSaid = (slot: WeekRow["slots"][number]): string =>
  `${W.place[slot.place]} ${slot.kind === "reel" ? "reel" : slot.kind === "story" ? "story" : "post"}`;

export function WeekPlanned({
  row,
  zone,
  onClose,
  onFix,
  onTime,
  approved,
  busy,
}: {
  row: WeekRow;
  zone: string;
  onClose: () => void;
  onFix: (row: WeekRow) => void;
  /** Another time set for a row whose own has passed. */
  onTime: (at: number) => void;
  /** Whether its week is approved already: the time's press then approves the row too, so it goes up. */
  approved: boolean;
  busy: boolean;
}) {
  const first = row.slots[0];
  const words = first?.words ?? null;
  const picks = row.fix?.act === "time";
  const [at, setAt] = useState(() => nextTimeOf(row, Date.now()));
  return (
    <CmPane
      title={row.title}
      sub={<span data-tone={row.tone || undefined}>{row.line}</span>}
      onClose={onClose}
      testid="cwk-planned"
      className="cwk-planned"
      foot={
        picks ? (
          <Button
            variant="primary"
            onClick={() => onTime(at)}
            disabled={busy || at <= Date.now()}
            data-testid="cwk-planned-time"
          >
            {approved ? W.fix.post : W.pickTime.yes}
          </Button>
        ) : row.fix ? (
          <Button variant="primary" onClick={() => onFix(row)} disabled={busy} data-testid="cwk-planned-fix">
            {row.fix.label}
          </Button>
        ) : undefined
      }
    >
      {row.still ? (
        <div className="cwk-planned-picture">
          <Picture src={`${fileViewOf(row.still)}?w=720`} alt="" name={row.title} />
        </div>
      ) : null}
      <h4>{W.whereItGoes}</h4>
      <ul className="cwk-where">
        {row.slots.map((slot) => (
          <li key={slot.id}>
            <b>{placeSaid(slot)}</b>
            <span>{slot.state === "blocked" ? (slot.blocked_reason ?? "") : slotWhenSaid(slot.at, zone)}</span>
          </li>
        ))}
      </ul>
      {picks ? (
        <p className="cwk-when" data-testid="cwk-when">
          {W.pickTime.says} <WhenDayTime at={at} maxDays={POST_AHEAD_DAYS_MAX} onChange={setAt} allDay />
        </p>
      ) : null}
      {words ? (
        <>
          <h4>{W.caption}</h4>
          <p className="cwk-caption">{words.caption}</p>
        </>
      ) : null}
      {first?.reason ? <p className="cwk-why">{first.reason}</p> : null}
    </CmPane>
  );
}
