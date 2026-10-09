/**
 * The log itself: what stopped it, that it is reading, its lines by day, and the way to more.
 *
 * A line is a row, or several rows of one kind by one hand on one day said once, where the newest of them stood
 * (contracts activityLines, the bell's own rule): a press on it shows the rows it stands for, and another hides them.
 * A row says who did it, what happened and who or what it was about, by name, and is the door to that page where it
 * has one. While the log is read again what is on screen stays and dims (the loading standard, components.css
 * data-loading and data-dims): a sentence that came and went above the rows moved every one of them twice.
 */
import { Fragment, useState, type ReactNode } from "react";
import {
  ACTIVITY_PAGE_WORDS as W,
  activityDoor,
  activityLines,
  activityMemberWords,
  type ActivityLineVM,
  type ActivityMemberDto,
  type ActivityPageDto,
} from "@chanlytics/contracts";
import { activity } from "@/legacy-bridge/activity";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { holdStill, listRoute, routeDoor } from "../../legacy-verbs";
import { activityMark } from "./marks";

type Row = ActivityPageDto["rows"][number];
type Line = ActivityLineVM<Row>;

export interface LogState {
  loading: boolean;
  rows: Row[];
  actors: Record<string, string>;
  subjects: Record<string, string>;
  doors: Record<string, string>;
  members: ActivityMemberDto[];
  kinds: string[];
  next: string | null;
  hasMore: boolean;
  error: string | null;
}

// A line says its time; the day it belongs to is said once, above the lines.
const actMs = (iso: string | null | undefined): number | null => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? null : ms;
};
const actTime = (iso: string | null | undefined): string => {
  const ms = actMs(iso);
  return ms === null ? "—" : pageClock().time(ms);
};
const actDayKey = (iso: string | null | undefined): string => {
  const ms = actMs(iso);
  return ms === null ? "?" : pageClock().dayKey(ms);
};
// "Today · Sep 17" · "Yesterday · Sep 16" · "Sep 15", as the product words a day above the rows that belong to it
// (contracts clockDayLabel).
const actDay = (iso: string | null | undefined): string => {
  const ms = actMs(iso);
  return ms === null ? "Undated" : pageClock().dayLabel(ms);
};

/** Who did it: the member by name, the receptionist, the system for a decision nobody made, and nobody for an event. */
const doerOf = (r: Row, actors: Record<string, string>): string =>
  r.actor_user_id
    ? actors[r.actor_user_id] || W.member
    : r.actor_type === "ai"
      ? W.who.receptionist
      : r.source === "event"
        ? ""
        : W.who.system;

/** Who or what a row is about, by name, where the page read one. */
const aboutOf = (r: Row, subjects: Record<string, string>): string | null =>
  r.subject_type && r.subject_id ? (subjects[`${r.subject_type}:${r.subject_id}`] ?? null) : null;

/**
 * Where a row opens: the door the server looked up (a message's thread, a deal's person), a list's own page, which
 * depends on what kind of list it is, and otherwise contracts' door, from the row alone.
 */
const doorOf = (r: Row, doors: Record<string, string>): string | null => {
  if (!r.subject_type || !r.subject_id) return activityDoor(r);
  if (r.subject_type === "list") return listRoute(r.subject_id);
  return doors[`${r.subject_type}:${r.subject_id}`] ?? activityDoor(r);
};

/**
 * A row's words: who did it, what happened, and what it was about or since when. Who and what are the ink; the dots
 * between them and the tail are a step quieter, so a line reads as its two facts and not as one grey run.
 */
function Said({ who, said, tail = null }: { who: string; said: string; tail?: string | null }) {
  return (
    <span className="act-what">
      {who && (
        <>
          <span className="act-who">{who}</span>
          {" · "}
        </>
      )}
      <span className="act-said">{said}</span>
      {tail && <span className="act-about"> · {tail}</span>}
    </span>
  );
}

interface FrameProps {
  /** Where the row opens, or null for a row with no page of its own. */
  to: string | null;
  testid: string;
  tone?: string;
  /** A row under its fold. */
  under?: boolean;
  /** The last row drawn of its day: the spine ends at it (settings.css), said here so no rule has to look ahead. */
  ends?: boolean;
  children: ReactNode;
}

/**
 * A row's frame. Where it has a page the whole row is its door, as a bell's note is one press and a report's fact is
 * (a door is a link: a long press or a new tab opens it too), with a quiet chevron at its end where forty-odd
 * underlined "Open"s ran down the card's edge. A row with no page is a plain row.
 */
function RowFrame({ to, testid, tone, under = false, ends = false, children }: FrameProps) {
  const cls = under ? "act-row act-under" : "act-row";
  const last = ends ? "" : undefined;
  if (!to)
    return (
      <div className={cls} data-testid={testid} data-tone={tone} data-ends={last}>
        {children}
      </div>
    );
  return (
    <a {...routeDoor(to)} className={cls} data-testid={testid} data-tone={tone} data-ends={last}>
      {children}
      <span className="act-go" aria-hidden="true">
        <Icon name="chevron" size={11} />
      </span>
    </a>
  );
}

/** One row of the log: its mark, its time, who did what about whom; the row is its own door. */
function ActivityRow({ r, st, ends }: { r: Row; st: LogState; ends: boolean }) {
  // The kind's tone (contracts activityTone) is said by the row's words where it is a warning or a failure; the node on
  // the spine is the neutral mark every row wears.
  return (
    <RowFrame to={doorOf(r, st.doors)} testid="act-row" tone={activity.tone(r.kind)} ends={ends}>
      <span className="mark act-glyph" aria-hidden="true">
        <Icon name={activityMark(r.kind)} size={13} />
      </span>
      <span className="act-when">{actTime(r.at)}</span>
      <Said who={doerOf(r, st.actors)} said={r.text} tail={aboutOf(r, st.subjects)} />
    </RowFrame>
  );
}

/** A row under its fold: its time and what it adds to the fold's sentence. The fold wears the mark. */
function FoldedRow({ r, st, ends }: { r: Row; st: LogState; ends: boolean }) {
  return (
    <RowFrame to={doorOf(r, st.doors)} testid="act-member" under ends={ends}>
      <span aria-hidden="true" />
      <span className="act-when">{actTime(r.at)}</span>
      <Said who="" said={activityMemberWords(r, aboutOf(r, st.subjects))} />
    </RowFrame>
  );
}

/**
 * Several rows said once: the fold's sentence and since when. The whole row is the press that shows them, and its
 * chevron turns as it opens, as a bell's group of notes does.
 */
interface FoldProps {
  line: Line;
  st: LogState;
  open: boolean;
  /** Its day's last line: shut, the spine ends at it; open, at the last row under it. */
  ends: boolean;
  onToggle: () => void;
}

function ActivityFold({ line, st, open, ends, onToggle }: FoldProps) {
  const r = line.row;
  const who = doerOf(r, st.actors);
  const first = actTime(line.since);
  const last = actTime(r.at);
  const said = line.title ?? r.text;
  const named = who ? `${who} · ${said}` : said;
  return (
    <>
      <button
        type="button"
        className="act-row"
        data-testid="act-row"
        data-fold={line.count}
        data-tone={activity.tone(r.kind)}
        data-ends={ends && !open ? "" : undefined}
        aria-expanded={open}
        aria-label={open ? W.fold.hide(named) : W.fold.show(named)}
        onClick={(e) => holdStill(e.currentTarget, onToggle)}
      >
        <span className="mark act-glyph" aria-hidden="true">
          <Icon name={activityMark(r.kind)} size={13} />
        </span>
        <span className="act-when">{last}</span>
        <Said who={who} said={said} tail={first !== last ? W.since(first) : null} />
        <span className="act-go act-turn" aria-hidden="true">
          <Icon name="chevron-down" size={11} />
        </span>
      </button>
      {open &&
        line.members.map((m, i) => <FoldedRow key={m.id} r={m} st={st} ends={ends && i === line.members.length - 1} />)}
    </>
  );
}

/** Where the day turns: the heading each line opens (or null), and how many rows each line's day holds. */
function daysOf(lines: readonly Line[]): { opens: (string | null)[]; perDay: number[] } {
  const opens: (string | null)[] = [];
  const counts: number[] = [];
  let sameAs: string | null = null;
  let head = -1;
  for (const line of lines) {
    const key = actDayKey(line.row.at);
    if (key === sameAs) {
      opens.push(null);
      counts[head] = (counts[head] ?? 0) + line.count;
    } else {
      opens.push(actDay(line.row.at));
      counts.push(line.count);
      head = counts.length - 1;
      sameAs = key;
    }
  }
  // Which heading each line belongs to, so the heading can say its own count: the rows, folded or not.
  const perDay: number[] = [];
  let n = -1;
  for (const open of opens) {
    if (open) n += 1;
    perDay.push(counts[n] ?? 0);
  }
  return { opens, perDay };
}

/** How many rows the waiting log draws; each one's width is settings.css's, so no two are the same length. */
const BONES = 7;

/** The shape of the log while it is read with nothing held, so the card does not resize as the rows land. */
function LogBones() {
  return (
    <div className="act-waiting" aria-hidden="true">
      <div className="act-day">
        <span className="act-bone act-bone-day" />
      </div>
      {Array.from({ length: BONES }, (_, i) => (
        <div className="act-row" key={i}>
          <span className="mark act-glyph" />
          <span className="act-when">
            <span className="act-bone" />
          </span>
          <span className="act-what">
            <span className="act-bone" />
          </span>
        </div>
      ))}
    </div>
  );
}

interface LogProps {
  st: LogState;
  /** Rows asked for by one kind's name are what the reader came to read: they are never folded. */
  folds: boolean;
  filtered: boolean;
  onClear: () => void;
  load: (cursor?: string | null, append?: boolean) => Promise<void>;
}

export function ActivityLog({ st, folds, filtered, onClear, load }: LogProps) {
  // The folds a reader opened, by their line's key: a line keeps its key as more of the log is read under it.
  const [opened, setOpened] = useState<readonly string[]>([]);
  const lines = activityLines(st.rows, actDayKey, folds);
  const { opens, perDay } = daysOf(lines);
  const toggle = (key: string) => setOpened((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  return (
    <>
      {st.error && (
        <FailedRead
          kind="line"
          what="the activity log"
          why={st.error}
          onRetry={() => void load(null, false)}
          busy={st.loading}
          testid="act-failed"
        />
      )}
      {/* While it reads, the rows on screen stay and dim, and take no press until the answer lands (data-dims, under
          the card's data-loading): nothing above them comes or goes, so nothing moves. With no rows held yet the list
          draws its own shape. */}
      <div className="act-list" data-testid="act-rows" data-dims="" aria-busy={st.loading}>
        {st.loading && st.rows.length === 0 && !st.error && <LogBones />}
        {lines.map((line, i) => (
          <Fragment key={line.key}>
            {opens[i] && (
              <div className="act-day">
                {opens[i]}
                <span className="act-day-n tally">{perDay[i]}</span>
              </div>
            )}
            {line.count > 1 ? (
              <ActivityFold
                line={line}
                st={st}
                open={opened.includes(line.key)}
                ends={!!opens[i + 1] || i === lines.length - 1}
                onToggle={() => toggle(line.key)}
              />
            ) : (
              <ActivityRow r={line.row} st={st} ends={!!opens[i + 1] || i === lines.length - 1} />
            )}
          </Fragment>
        ))}
        {!st.loading && st.rows.length === 0 && !st.error && (
          // Narrowed, the filters are why nothing is here; whole, the workspace has nothing to say yet.
          <EmptyState
            kind="line"
            title={filtered ? W.none : W.noneYet}
            action={filtered ? { label: W.clear, onClick: onClear } : null}
          />
        )}
      </div>
      {/* That it is reading, for a screen reader, which sees no dimming: always on the page, so its words are news. */}
      <span className="rec-sr" role="status" data-testid="act-loading">
        {st.loading && !st.error ? W.reading : ""}
      </span>
      {st.hasMore && (
        <div className="act-more">
          <Button
            variant="quiet"
            size="sm"
            aria-disabled={st.loading}
            onClick={() => {
              if (!st.loading) void load(st.next, true);
            }}
            data-testid="act-more"
          >
            {st.loading ? W.moreReading : W.more}
          </Button>
          <span className="act-so-far">{W.soFar(st.rows.length)}</span>
        </div>
      )}
    </>
  );
}
