/**
 * "Also on your list" (Today, calm, D16, 19 Nov 2026): past the three lines Today names, one line counts what is left, by
 * kind (contracts today/lines.ts `alsoWords`), and a press opens a door to each where the line stands. Who else waits
 * opens the Inbox; the to-dos due, People's Steps due; the visits nobody has marked, the first of them, whose sheet walks
 * the rest, with Mark all kept under it; whoever has waited past a week, the Inbox's Needs you, which lists them under
 * who waits with Mark all done; and what AI set aside as not a customer's opens it. Nothing here is counted by the head: it says who needs you, and these
 * are the rest.
 */
import { useState, type ReactNode } from "react";
import { todayVisitsSub, type AppointmentWord } from "@chanlytics/contracts";
import { TODAY_LINE_WORDS as L, alsoWords, type TodayAlsoCounts } from "../model/lines";
import { routeDoor } from "../../frame-verbs";
import { goFromToday } from "../over/open";
import { CalmList, CalmOpen, CalmRow } from "./lines";

/** Where each kind opens: null where the page has no address for it. */
export interface AlsoDoors {
  waiting: string;
  older: string;
  toDo: string | null;
  toMark: string | null;
  setAside: string | null;
}

/**
 * The visits nobody has marked, as a door to the first of them, with Mark all kept at the door's end, beside the link and
 * never in it (the second look, L5). Called, not drawn.
 */
function visitsLine(count: number, at: { word: AppointmentWord; door: string | null; keptAll: ReactNode }) {
  const line = (
    <CalmRow
      quiet
      name={todayVisitsSub(count, at.word)}
      // A visit opens over Today, its Next walking on to the next to mark (N1).
      door={at.door ? routeDoor(at.door, goFromToday) : null}
      testid="today-also-visits"
    />
  );
  if (!at.keptAll) return line;
  return (
    <div className="calm-sub-acts">
      {line}
      <div className="calm-sub-act">{at.keptAll}</div>
    </div>
  );
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
  // Drawn shut as well as open, so it folds where it stands (the second look, M2); a reader and a test find it open only.
  const opened = (
    <CalmOpen open={open}>
      <div className="calm-subs" role="list" data-testid={open ? "today-also-open" : undefined}>
        {left.waiting > 0 ? (
          <CalmRow
            quiet
            name={L.moreWaiting(left.waiting)}
            door={routeDoor(doors.waiting)}
            testid="today-also-waiting"
          />
        ) : null}
        {left.toDo > 0 && doors.toDo ? (
          <CalmRow quiet name={L.toDo(left.toDo)} door={routeDoor(doors.toDo)} testid="today-also-todo" />
        ) : null}
        {left.toMark > 0 ? visitsLine(left.toMark, { word, door: doors.toMark, keptAll }) : null}
        {left.older > 0 ? (
          <CalmRow quiet name={L.olderThanAWeek(left.older)} door={routeDoor(doors.older)} testid="today-also-older" />
        ) : null}
        {left.setAside > 0 && doors.setAside ? (
          <CalmRow
            quiet
            name={L.setAside(left.setAside)}
            // The conversation opens over Today (N2).
            door={routeDoor(doors.setAside, goFromToday)}
            testid="today-also-set-aside"
          />
        ) : null}
      </div>
    </CalmOpen>
  );
  return (
    <CalmList label={words.title} testid="today-also">
      <CalmRow
        quiet
        name={words.title}
        // Open, its doors say each count, so the line says them once (the second look, L5).
        said={open ? undefined : (words.sub ?? undefined)}
        press={() => setOpen(!open)}
        open={open}
        under={opened}
        testid="today-also-line"
      />
    </CalmList>
  );
}
