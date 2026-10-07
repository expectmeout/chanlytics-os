/**
 * Settings › Activity: what happened in the workspace, and who did it (moved from legacy/pages/activity.jsx, decision
 * 0015 step 11). Settings' page draws it by its old name, `PaneActivity`, which seed-globals publishes
 * (settings/globals.ts).
 *
 * Both ledgers -- the decisions people (and the receptionist, and the system) made, and the events that happened --
 * have existed since the first slice and were readable by an owner only inside one person's timeline. This is the page:
 * newest first, in the words the route gives (contracts activityWords), filtered by a person, a kind and a day. It
 * decides nothing and shows nothing of a payload beyond the sentence; the evidence families are hidden unless asked for
 * by name. Its reads are the bridge's `activity` object (legacy-bridge/activity.ts), read on demand, never a surface.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ActivityPageDto } from "@chanlytics/contracts";
import { activity } from "@/legacy-bridge/activity";
import { pageClock } from "@/legacy-bridge/zone";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { canDo, navigate } from "../../legacy-verbs";

type Row = ActivityPageDto["rows"][number];

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

// What kind of thing happened, as a glyph: an event's family (message.sent → message) or a decision's verb. A kind
// nothing here names gets a plain dot, which is the honest answer and still lines the rows up.
const ACT_FAMILY: Partial<Record<string, string>> = {
  message: "chat",
  conversation: "chat",
  contact: "user",
  call: "phone",
  voice: "phone",
  line: "phone",
  google: "star",
  billing: "money",
  settings: "settings",
  business: "home",
  workspace: "home",
  setup: "flag",
  policy: "shield",
  platform: "shield",
  broadcast: "bolt",
  playbook: "bolt",
  mailbox: "mail",
  usage: "trending-up",
  webhook: "bolt",
  ingest: "alert",
};
const ACT_VERB: Partial<Record<string, string>> = {
  approve: "check",
  resolve: "check",
  edit: "edit",
  decline: "x",
  cancel_send: "x",
  snooze: "clock",
  wake: "clock",
  archive: "content",
  take_over: "chat",
  hand_back: "chat",
  reply: "chat",
  pause_agent: "pause",
  resume_agent: "play",
  invite: "users",
  revoke_invite: "users",
  change_role: "users",
  remove_member: "users",
  erase: "user",
  consent_change: "user",
  whisper: "phone",
  end_call: "phone",
  connect_channel: "external",
  send_broadcast: "bolt",
  cancel_broadcast: "bolt",
  start_playbook: "bolt",
  pause_playbook: "bolt",
  reply_review: "star",
  export: "arrow-down",
};
const actGlyph = (kind: string | null | undefined): string => {
  const k = kind || "";
  const dot = k.indexOf(".");
  return (dot > 0 ? ACT_FAMILY[k.slice(0, dot)] : ACT_VERB[k]) || "dot";
};

function ActivityRow({ r, actors }: { r: Row; actors: Record<string, string> }) {
  const who = r.actor_user_id
    ? actors[r.actor_user_id] || "A member"
    : r.actor_type === "ai"
      ? "Receptionist"
      : r.source === "event"
        ? ""
        : "System";
  const to =
    r.subject_type === "contact" && r.subject_id
      ? `clients/${r.subject_id}`
      : r.subject_type === "conversation" && r.subject_id
        ? `inbox/th-${r.subject_id}`
        : r.subject_type === "call" && r.subject_id
          ? `conversations/cv-${r.subject_id}`
          : null;
  // The kind's tone (contracts activityTone) is said by the row's words where it is a warning or a failure; the node on
  // the spine is the neutral mark every row wears.
  const tone = activity.tone(r.kind);
  return (
    <div className="act-row" data-testid="act-row" data-tone={tone}>
      <span className="mark act-glyph" aria-hidden="true">
        <Icon name={actGlyph(r.kind)} size={13} />
      </span>
      <span className="act-when">{actTime(r.at)}</span>
      <span className="act-what">
        {who && <b>{who} · </b>}
        {r.text}
      </span>
      {to && (
        <button className="cl-bucket-link act-open" onClick={() => navigate(to)}>
          Open
        </button>
      )}
    </div>
  );
}

interface LogState {
  loading: boolean;
  rows: Row[];
  actors: Record<string, string>;
  kinds: string[];
  next: string | null;
  hasMore: boolean;
  error: string | null;
}

/** What this tab read last time, painted at once; nothing yet, reading, where it has none. */
function firstPaint(): LogState {
  const seed = activity.peek({});
  const d = seed && seed.ok ? seed.data : null;
  return d
    ? {
        loading: true,
        rows: d.rows,
        actors: d.actors,
        kinds: d.kinds,
        next: d.page.next_cursor ?? null,
        hasMore: d.page.has_more,
        error: null,
      }
    : { loading: true, rows: [], actors: {}, kinds: [], next: null, hasMore: false, error: null };
}

/** Where the day turns: the heading each row opens (or null), and how many rows each row's day holds. */
function daysOf(rows: Row[]): { opens: (string | null)[]; perDay: number[] } {
  const opens: (string | null)[] = [];
  const counts: number[] = [];
  let sameAs: string | null = null;
  let head = -1;
  for (const row of rows) {
    const key = actDayKey(row.at);
    if (key === sameAs) {
      opens.push(null);
      counts[head] = (counts[head] ?? 0) + 1;
    } else {
      opens.push(actDay(row.at));
      counts.push(1);
      head = counts.length - 1;
      sameAs = key;
    }
  }
  // Which heading each row belongs to, so the heading can say its own count.
  const perDay: number[] = [];
  let n = -1;
  for (const open of opens) {
    if (open) n += 1;
    perDay.push(counts[n] ?? 0);
  }
  return { opens, perDay };
}

const BONES = [68, 52, 61, 44, 57, 49, 63];
/** How long the person box waits after a key before it asks who matches. */
const PERSON_SEARCH_MS = 250;

type Person = { id: string; name: string };

/** Up to ten people matching what is typed, asked once the typing pauses; none for an empty box. */
function usePersonMatches(personQ: string): [Person[], (m: Person[]) => void] {
  const [matches, setMatches] = useState<Person[]>([]);
  useEffect(() => {
    if (!personQ.trim()) {
      setMatches([]);
      return undefined;
    }
    let on = true;
    const t = setTimeout(() => {
      void activity.people(personQ.trim()).then((m) => {
        if (on) setMatches(m);
      });
    }, PERSON_SEARCH_MS);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [personQ]);
  return [matches, setMatches];
}

interface FilterProps {
  asking: boolean;
  setAsking: (f: (v: boolean) => boolean) => void;
  narrowed: number;
  kinds: string[];
  kindTyped: string;
  setKindTyped: (v: string) => void;
  chooseKind: (typed: string) => void;
  day: string;
  setDay: (v: string) => void;
  person: Person | null;
  setPerson: (p: Person | null) => void;
  personQ: string;
  setPersonQ: (v: string) => void;
}

/** The three filters, and on a phone the one control they wait behind. */
function ActivityFilters(f: FilterProps) {
  const [matches, setMatches] = usePersonMatches(f.personQ);
  return (
    <>
      {/* The three filters are the settings input: they had no class, so they were the browser's own boxes. */}
      <button
        type="button"
        className="btn btn-ghost btn-sm set-filters-ask"
        aria-expanded={f.asking}
        onClick={() => f.setAsking((v) => !v)}
        data-testid="act-filters-ask"
      >
        <Icon name="filter" size={12} />
        Narrow it
        {f.narrowed > 0 && <span className="set-filters-ask-n">{f.narrowed}</span>}
      </button>
      <div className={`set-filters${f.asking ? " open" : ""}`}>
        <input
          className="set-input"
          list="act-kinds"
          placeholder="Any kind"
          aria-label="Kind of activity"
          value={f.kindTyped}
          onChange={(e) => {
            const v = e.target.value;
            f.setKindTyped(v);
            if (!v.trim() || f.kinds.includes(v.trim())) f.chooseKind(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              f.chooseKind(f.kindTyped);
            }
          }}
          onBlur={() => f.chooseKind(f.kindTyped)}
          data-testid="act-kind"
        />
        <datalist id="act-kinds">
          {f.kinds.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <input
          className="set-input"
          type="date"
          aria-label="Day"
          value={f.day}
          onChange={(e) => f.setDay(e.target.value)}
          data-testid="act-day"
        />
        {f.person ? (
          <span className="chip" data-testid="act-person">
            <Icon name="user" size={10} />
            {f.person.name}
            <button
              className="chip-x"
              aria-label={`Everyone, not only ${f.person.name}`}
              onClick={() => f.setPerson(null)}
            >
              <Icon name="x" size={9} />
            </button>
          </span>
        ) : (
          <span className="set-filter-person">
            <input
              className="set-input"
              placeholder="A person, by name or number"
              aria-label="A person, by name or number"
              value={f.personQ}
              onChange={(e) => f.setPersonQ(e.target.value)}
              data-testid="act-person-q"
            />
            {matches.length > 0 && (
              <div className="cl-prof-autonomy" style={{ flexWrap: "wrap" }}>
                {matches.map((m) => (
                  <button
                    key={m.id}
                    className="cl-prof-aut-seg"
                    onClick={() => {
                      f.setPerson(m);
                      f.setPersonQ("");
                      setMatches([]);
                    }}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
    </>
  );
}

/** The log itself: what stopped it, that it is reading, its rows by day, and the way to more. */
function ActivityLog({
  st,
  filtered,
  onClear,
  load,
}: {
  st: LogState;
  filtered: boolean;
  onClear: () => void;
  load: (cursor?: string | null, append?: boolean) => Promise<void>;
}) {
  const { opens, perDay } = daysOf(st.rows);
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
      {/* Said whenever it is reading, not only on the first read: narrowing the log left the old rows on screen with
          nothing saying they were stale. */}
      {st.loading && !st.error && (
        <div className="act-reading" role="status" data-testid="act-loading">
          Reading the activity log…
        </div>
      )}
      {st.loading && st.rows.length === 0 && !st.error && (
        <div className="act-list act-waiting" aria-hidden="true">
          <div className="act-day">
            <span className="act-bone act-bone-day" />
          </div>
          {BONES.map((w, i) => (
            <div className="act-row" key={i}>
              <span className="mark act-glyph" />
              <span className="act-when">
                <span className="act-bone" />
              </span>
              <span className="act-what">
                <span className="act-bone" style={{ width: `${w}%` }} />
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="act-list" data-testid="act-rows">
        {st.rows.map((r, i) => (
          <Fragment key={r.id}>
            {opens[i] && (
              <div className="act-day">
                {opens[i]}
                <span className="act-day-n tally">{perDay[i]}</span>
              </div>
            )}
            <ActivityRow r={r} actors={st.actors} />
          </Fragment>
        ))}
        {!st.loading && st.rows.length === 0 && !st.error && (
          <EmptyState
            kind="line"
            title="Nothing here for that."
            action={filtered ? { label: "Clear the filters", onClick: onClear } : null}
          />
        )}
      </div>
      {st.hasMore && (
        <div className="act-more">
          <button
            className="btn btn-ghost btn-sm"
            disabled={st.loading}
            onClick={() => void load(st.next, true)}
            data-testid="act-more"
          >
            {st.loading ? "Reading…" : "Show more"}
          </button>
          <span className="act-so-far">{st.rows.length} so far</span>
        </div>
      )}
    </>
  );
}

export function PaneActivity() {
  // The log is an owner's (GET activity asks for one): the same reach as taking the workspace's data away, so it asks
  // the export gate, which narrows under an owner's View-as as the signed-in role it asked before did not.
  const may = canDo("export");
  // What is typed in the kind box, and the kind the log is read for. A kind is asked for when it is picked from the
  // list, on Enter, or when the box is left, never on every keystroke (S21).
  const [kindTyped, setKindTyped] = useState("");
  const [kind, setKind] = useState("");
  const [day, setDay] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [personQ, setPersonQ] = useState("");
  // What this tab read last time, painted at once. The read below replaces it inside the time this pane used to spend
  // showing a reader nothing: on the salon's log it was 763ms of empty pane on the first visit and 433ms on the fifth,
  // for a hundred rows that had not changed.
  const [st, setSt] = useState<LogState>(firstPaint);
  // On a phone the three boxes stand between a reader and the log, so they wait behind one control until asked for. On
  // a desktop the control is not drawn.
  const [asking, setAsking] = useState(false);

  // Each read is numbered, and an answer that is not the latest one asked for lands nowhere: a slow first page cannot
  // replace the filter picked after it.
  const asked = useRef(0);
  // A page asks for what is BEHIND the last row it was given, so reading the tenth page costs what the first one did.
  // It used to ask by offset, which made the route read the whole log above the page and throw it away.
  const load = useCallback(
    async (cursor: string | null = null, append = false) => {
      const mine = ++asked.current;
      setSt((c) => ({ ...c, loading: true, error: null }));
      const r = await activity.list({
        kind: kind || undefined,
        day: day || undefined,
        person: person ? person.id : undefined,
        cursor: cursor || undefined,
      });
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
        kinds: r.data.kinds,
        next: r.data.page.next_cursor ?? null,
        hasMore: r.data.page.has_more,
      }));
    },
    [kind, day, person],
  );
  useEffect(() => {
    if (may) void load(null, false);
  }, [load, may]);
  const chooseKind = (typed: string) => setKind(typed.trim());
  const narrowed = [kind, day, person].filter(Boolean).length;

  if (!may) {
    return (
      <section className="fl-card set-card" data-testid="set-activity">
        <span className="cl-prof-aut-hint">
          Only an owner can read the activity log: it is the whole record of the workspace, including what every member
          did.
        </span>
      </section>
    );
  }
  const clear = () => {
    setKind("");
    setKindTyped("");
    setDay("");
    setPerson(null);
  };

  return (
    <section className="fl-card set-card" data-testid="set-activity">
      <div className="fl-card-head">
        <h2 className="fl-card-title">Activity</h2>
        <span className="fl-card-sub">What happened, and who did it · newest first</span>
      </div>
      <ActivityFilters
        asking={asking}
        setAsking={setAsking}
        narrowed={narrowed}
        kinds={st.kinds}
        kindTyped={kindTyped}
        setKindTyped={setKindTyped}
        chooseKind={chooseKind}
        day={day}
        setDay={setDay}
        person={person}
        setPerson={setPerson}
        personQ={personQ}
        setPersonQ={setPersonQ}
      />
      <ActivityLog st={st} filtered={!!(kind || day || person)} onClear={clear} load={load} />
      <p className="set-card-foot">
        Model usage, webhook receipts and unplaced messages are kept. Name a kind to see them.
      </p>
    </section>
  );
}
