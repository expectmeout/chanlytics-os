/**
 * "Also on your list" (Today, calm, D16, 19 Nov 2026): past the three lines Today names, one line counts what is left, by
 * kind (contracts today/lines.ts `alsoWords`), and a press opens a door to each where the line stands. Who else waits
 * opens the Inbox; the to-dos due, People's Steps due; the visits nobody has marked, the first of them, whose sheet walks
 * the rest, with Mark all kept under it; whoever has waited past a week, the Inbox's Needs you, which lists them under
 * who waits with Mark all done; and what AI set aside as not a customer's opens it. Nothing here is counted by the head: it says who needs you, and these
 * are the rest.
 */
import { useState, type ReactNode } from "react";
import {
  TODAY_LINE_WORDS as L,
  alsoWords,
  todayVisitsSub,
  type AppointmentWord,
  type TodayAlsoCounts,
} from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { CalmList, CalmRow } from "./lines";

/** Where each kind opens: null where the page has no address for it. */
export interface AlsoDoors {
  waiting: string;
  older: string;
  toDo: string | null;
  toMark: string | null;
  setAside: string | null;
}

export function AlsoLine({
  left,
  doors,
  word,
  keptAll,
}: {
  left: TodayAlsoCounts;
  doors: AlsoDoors;
  /** The workspace's word for a visit: "12 appointments to mark". */
  word: AppointmentWord;
  /** Mark all kept, the visits' own press (need-you/visit-work.tsx), under their line. */
  keptAll: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const words = alsoWords(left);
  if (!words) return null;
  const opened = open ? (
    <div className="calm-subs" role="list" data-testid="today-also-open">
      {left.waiting > 0 ? (
        <CalmRow quiet name={L.moreWaiting(left.waiting)} door={routeDoor(doors.waiting)} testid="today-also-waiting" />
      ) : null}
      {left.toDo > 0 && doors.toDo ? (
        <CalmRow quiet name={L.toDo(left.toDo)} door={routeDoor(doors.toDo)} testid="today-also-todo" />
      ) : null}
      {left.toMark > 0 ? (
        <CalmRow
          quiet
          name={todayVisitsSub(left.toMark, word)}
          door={doors.toMark ? routeDoor(doors.toMark) : null}
          under={keptAll ? <div className="calm-sub-act">{keptAll}</div> : null}
          testid="today-also-visits"
        />
      ) : null}
      {left.older > 0 ? (
        <CalmRow quiet name={L.olderThanAWeek(left.older)} door={routeDoor(doors.older)} testid="today-also-older" />
      ) : null}
      {left.setAside > 0 && doors.setAside ? (
        <CalmRow
          quiet
          name={L.setAside(left.setAside)}
          door={routeDoor(doors.setAside)}
          testid="today-also-set-aside"
        />
      ) : null}
    </div>
  ) : null;
  return (
    <CalmList label={words.title} testid="today-also">
      <CalmRow
        quiet
        name={words.title}
        said={words.sub ?? undefined}
        press={() => setOpen(!open)}
        open={open}
        under={opened}
        testid="today-also-line"
      />
    </CalmList>
  );
}
