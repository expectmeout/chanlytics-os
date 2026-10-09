/**
 * Settings › Activity: what happened in the workspace, and who did it (moved from legacy/pages/activity.jsx, decision
 * 0015 step 11). Settings' page draws it by its old name, `PaneActivity`, which seed-globals publishes
 * (settings/globals.ts).
 *
 * Both ledgers -- the decisions people (and the receptionist, and the system) made, and the events that happened --
 * have existed since the first slice and were readable by an owner only inside one person's timeline. This is the page:
 * newest first, in the words the route gives (contracts activityWords), each line saying who or what it was about by
 * name, and rows of one kind by one hand on one day said once, as the bell says its notes (contracts activityLines; a
 * hundred recordings opened in a minute were a hundred lines, 8 Oct 2026). It is narrowed by a kind, a family of
 * kinds or what went wrong, by who did it, by a day or a span of days, and by a person. It decides nothing and shows
 * nothing of a payload beyond the sentence; the evidence families are hidden unless asked for by name. Its reads are
 * the bridge's `activity` object (legacy-bridge/activity.ts), read on demand, never a surface. Its card is the kit's
 * record card, as Profile's and Partner's are (it stood on the older flat card, with a solid ground and a square
 * corner beside their glass), and its parts are the kit's (the box, the button, the chip, the mark, the tally),
 * placed by settings.css.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_PAGE_WORDS as W, ACTIVITY_SPAN_DAYS, isActivityFamily, shiftKey } from "@chanlytics/contracts";
import { activity, type ActivityFilters as Read } from "@/legacy-bridge/activity";
import { pageClock } from "@/legacy-bridge/zone";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo } from "../../legacy-verbs";
import { ActivityFilters, FiltersAsk, NO_NARROWING, narrowedCount, type Narrowing } from "./filters";
import { ActivityLog, type LogState } from "./log";

/** What the boxes hold, as the read the route takes: a kind, a family or what went wrong; who; the days; the person. */
function readOf(n: Narrowing, today: string): Read {
  const read: Read = {};
  const colon = n.pick.indexOf(":");
  const what = colon > 0 ? n.pick.slice(0, colon) : "";
  const value = colon > 0 ? n.pick.slice(colon + 1) : "";
  if (what === "kind" && value) read.kind = value;
  if (what === "family" && isActivityFamily(value)) read.family = value;
  if (what === "only" && value === "problems") read.only = "problems";
  if (n.who) read.actor = n.who;
  if (n.when === "day") {
    if (n.day) read.day = n.day;
  } else if (n.when) {
    const to = n.when === "yesterday" ? shiftKey(today, -1) : today;
    read.from = shiftKey(to, 1 - ACTIVITY_SPAN_DAYS[n.when]);
    read.to = to;
  }
  if (n.person) read.person = n.person.id;
  return read;
}

const NOTHING_READ: LogState = {
  loading: true,
  rows: [],
  actors: {},
  subjects: {},
  doors: {},
  members: [],
  kinds: [],
  next: null,
  hasMore: false,
  error: null,
};

/** What this tab read last time, painted at once; nothing yet, reading, where it has none. */
function firstPaint(): LogState {
  const seed = activity.peek({});
  const d = seed && seed.ok ? seed.data : null;
  return d
    ? {
        loading: true,
        rows: d.rows,
        actors: d.actors,
        // A page this tab kept from before the log said these reads as one without them.
        subjects: d.subjects ?? {},
        doors: d.doors ?? {},
        members: d.members ?? [],
        kinds: d.kinds,
        next: d.page.next_cursor ?? null,
        hasMore: d.page.has_more,
        error: null,
      }
    : NOTHING_READ;
}

export function PaneActivity() {
  // The log is an owner's (GET activity asks for one): the same reach as taking the workspace's data away, so it asks
  // the export gate, which narrows under an owner's View-as as the signed-in role it asked before did not.
  const may = canDo("export");
  const [n, setN] = useState<Narrowing>(NO_NARROWING);
  // On a phone the boxes wait behind the head's one control until asked for.
  const [asking, setAsking] = useState(false);
  // What this tab read last time, painted at once. The read below replaces it inside the time this pane used to spend
  // showing a reader nothing: on the salon's log it was 763ms of empty pane on the first visit and 433ms on the fifth,
  // for a hundred rows that had not changed.
  const [st, setSt] = useState<LogState>(firstPaint);

  // Each read is numbered, and an answer that is not the latest one asked for lands nowhere: a slow first page cannot
  // replace the filter picked after it.
  const asked = useRef(0);
  // A page asks for what is BEHIND the last row it was given, so reading the tenth page costs what the first one did.
  // It used to ask by offset, which made the route read the whole log above the page and throw it away.
  const load = useCallback(
    async (cursor: string | null = null, append = false) => {
      const mine = ++asked.current;
      setSt((c) => ({ ...c, loading: true, error: null }));
      const today = pageClock().dayKey(Date.now());
      const r = await activity.list({ ...readOf(n, today), ...(cursor ? { cursor } : {}) });
      if (mine !== asked.current) return;
      if (!r.ok) {
        setSt((c) => ({ ...c, loading: false, error: r.message || "Could not be read right now." }));
        return;
      }
      setSt((c) => ({
        loading: false,
        error: null,
        rows: append ? [...c.rows, ...r.data.rows] : r.data.rows,
        actors: { ...c.actors, ...r.data.actors },
        subjects: { ...c.subjects, ...(r.data.subjects ?? {}) },
        doors: { ...c.doors, ...(r.data.doors ?? {}) },
        members: r.data.members ?? c.members,
        kinds: r.data.kinds,
        next: r.data.page.next_cursor ?? null,
        hasMore: r.data.page.has_more,
      }));
    },
    [n],
  );
  useEffect(() => {
    if (may) void load(null, false);
  }, [load, may]);

  if (!may) {
    return (
      <section className="rec-card" data-testid="set-activity" aria-labelledby="set-activity-title">
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="set-activity-title">
            {W.title}
          </h2>
        </div>
        <p className="set-card-foot">{W.ownerOnly}</p>
      </section>
    );
  }

  return (
    <section
      className="rec-card"
      data-testid="set-activity"
      aria-labelledby="set-activity-title"
      // The loading standard: what the log marks data-dims fades while this is set, and nothing is added or taken away.
      data-loading={st.loading && !st.error ? "" : undefined}
    >
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-activity-title">
          {W.title}
        </h2>
        <span className="rec-card-sub">{W.sub}</span>
        {/* Back to the whole log, at the head's end, only while something narrows it: under the boxes it wrapped
            onto a line of its own. */}
        {narrowedCount(n) > 0 && (
          <LinkButton className="set-filters-clear" onClick={() => setN(NO_NARROWING)} data-testid="act-clear">
            {W.clearShort}
          </LinkButton>
        )}
        <FiltersAsk narrowed={narrowedCount(n)} open={asking} onToggle={() => setAsking((v) => !v)} />
      </div>
      <ActivityFilters
        n={n}
        set={(over) => setN((c) => ({ ...c, ...over }))}
        kinds={st.kinds}
        members={st.members}
        open={asking}
      />
      <ActivityLog
        st={st}
        folds={!n.pick.startsWith("kind:")}
        filtered={narrowedCount(n) > 0}
        onClear={() => setN(NO_NARROWING)}
        load={load}
      />
      <p className="set-card-foot">{W.foot}</p>
    </section>
  );
}
