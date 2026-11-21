/**
 * AI's sheet over Today (Working for you, 21 Nov 2026, W1 to W3, W13, W21): one place for AI's work, opened from its state
 * under the head's sentence. Who AI is talking to right now; what it did since you last looked (or today), each line's why a
 * tap away and its door over Today; what goes out next, each with its Stop; how AI works for you, read from your own
 * Autonomy rows with the door to them; and Stop everything, the app's own, with its Resume. Nothing in it is a number the
 * reads do not hold: a part that could not be read is not drawn.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  DAY_MS,
  DEFAULT_TIMEZONE,
  LIFECYCLE_WORDS,
  POLICY_MODE_WORDS,
  addressOf,
  entryOf,
  initialsOf,
  runTitleOf,
  tzClock,
  visitRoute,
  zoneDayKey,
  type AiDidVM,
  type BroadcastVM,
  type TodayAiVM,
} from "@chanlytics/contracts";
import { apiFor } from "@/bridge/api";
import { dbMode, uiRows, type UiRow } from "@/bridge/policy-store";
import { broadcasts } from "../../campaigns/broadcasts/verbs";
import { refreshSurface, routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { autonomyVerbs } from "../../settings/autonomy/verbs";
import { stopSaid } from "../../settings/autonomy/stop-words";
import { useSurface } from "../../use-surface";
import { CalmList, CalmRow } from "../calm/lines";
import { AI_WORDS } from "../model/ai";
import { goFromToday } from "../over/open";
import { useToast, workspaceClock } from "../shell";
import { closeAiSheet, useAiSheetOpen } from "./open";

const WORDS = AI_WORDS.sheet;

/** What goes out next: runs set to go on their own within a day. */
const NEXT_WITHIN_MS = DAY_MS;

/** The most rows of how AI works the sheet names: Replies, and the kinds that ask you first. */
const RULES_SHOWN = 3;

const zone = (): string => workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;
const clockOf = (ms: number): string => tzClock(new Date(ms).toISOString(), zone(), new Date()) ?? "";

/** Where a thing AI did opens: its visit on its day, else its conversation, over Today where it can be. */
function doorOf(did: AiDidVM): string | null {
  if (did.visit) return visitRoute(did.visit.id, zoneDayKey(Date.parse(did.visit.starts_at), did.visit.timezone));
  return did.conversation_id ? addressOf({ kind: "conversation", id: did.conversation_id }) : null;
}

/** One part of the sheet: its name drawn small over it, as the canvas drew each. */
function Part({ head, testid, children }: { head: string; testid: string; children: ReactNode }) {
  return (
    <section className="calm-ai-part" data-testid={testid}>
      <h3 className="calm-ai-head">{head}</h3>
      {children}
    </section>
  );
}

/** What a part says where it has nothing: one quiet sentence, never an empty list. */
const nothing = (words: string, testid: string) => (
  <p className="calm-ai-none" data-testid={testid}>
    {words}
  </p>
);

/** Right now: who AI is talking to, a line each, its conversation over Today. */
function RightNow({ ai }: { ai: TodayAiVM }) {
  return (
    <Part head={WORDS.now} testid="today-ai-now">
      {ai.talking.length ? (
        <CalmList label={WORDS.now} testid="today-ai-talking-list">
          {ai.talking.map((t) => (
            <CalmRow
              key={t.conversation_id}
              first={{ face: { person: { name: t.who, initials: initialsOf(t.who) } } }}
              name={t.who}
              said={t.said}
              wait={{ words: WORDS.nowWord, long: false }}
              door={routeDoor(addressOf({ kind: "conversation", id: t.conversation_id }), goFromToday)}
              testid="today-ai-talking"
            />
          ))}
        </CalmList>
      ) : (
        nothing(WORDS.nowNone, "today-ai-now-none")
      )}
    </Part>
  );
}

/** One thing AI did: what and who, when; pressed, its why opens under it with its door (W13). */
function DidLine({ did }: { did: AiDidVM }) {
  const [open, setOpen] = useState(false);
  const to = doorOf(did);
  const name = `${WORDS.did[did.kind]} ${did.who}`;
  // A booking has no why to read: its line is its door. A hold or a set-aside opens to say why first.
  if (!did.why) {
    return (
      <CalmRow
        name={name}
        said={did.what}
        wait={{ words: clockOf(did.at_ms), long: false }}
        door={to ? routeDoor(to, goFromToday) : null}
        testid="today-ai-did"
      />
    );
  }
  return (
    <CalmRow
      name={name}
      said={did.what}
      wait={{ words: clockOf(did.at_ms), long: false }}
      press={() => setOpen(!open)}
      open={open}
      under={
        open ? (
          <div className="calm-under calm-ai-why" data-testid="today-ai-why">
            <p>{did.why}</p>
            {to ? (
              <a className="calm-ai-door" {...routeDoor(to, goFromToday)}>
                {WORDS.open}
                <Icon name="chevron" size={12} />
              </a>
            ) : null}
          </div>
        ) : undefined
      }
      testid="today-ai-did"
    />
  );
}

/** What AI did since you last looked, or today. */
function Did({ ai }: { ai: TodayAiVM }) {
  const since = ai.since && ai.looked_ms !== null ? ai.looked_ms : null;
  const shown = since === null ? ai.did : ai.did.filter((d) => d.at_ms >= since);
  const head = since === null ? WORDS.todayHead : WORDS.sinceHead(clockOf(since));
  return (
    <Part head={head} testid="today-ai-since">
      {shown.length ? (
        <CalmList label={head} testid="today-ai-did-list">
          {shown.map((d) => (
            <DidLine key={`${d.kind}:${d.at_ms}:${d.who}`} did={d} />
          ))}
        </CalmList>
      ) : (
        nothing(WORDS.didNone, "today-ai-did-none")
      )}
    </Part>
  );
}

/** The runs set to go on their own within a day, soonest first: the sheet's Next, and tonight's line (tonight.tsx). */
export function nextRuns(rows: readonly BroadcastVM[] | undefined, nowMs: number): BroadcastVM[] {
  return (rows ?? [])
    .filter((r) => {
      const at = r.scheduled_for ? Date.parse(r.scheduled_for) : Number.NaN;
      return r.state === "scheduled" && at >= nowMs && at - nowMs <= NEXT_WITHIN_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_for ?? "") - Date.parse(b.scheduled_for ?? ""));
}

/** What goes out next, each with its Stop (W3); nothing where nothing is set to go. */
function Next({ flash }: { flash: (msg: string, warn: boolean) => void }) {
  const runs = nextRuns(useSurface("broadcasts")?.rows, Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  if (!runs.length) return null;
  const stop = async (run: BroadcastVM) => {
    setBusy(run.id);
    const r = await broadcasts.cancel(run.id);
    setBusy(null);
    flash(r.ok ? WORDS.cancelled : r.message, !r.ok);
  };
  return (
    <Part head={WORDS.next} testid="today-ai-next">
      <CalmList label={WORDS.next} testid="today-ai-next-list">
        {runs.map((run) => (
          <CalmRow
            key={run.id}
            name={runTitleOf(run)}
            said={WORDS.sends(run.recipient_count)}
            wait={{ words: run.when, long: false }}
            under={
              <div className="calm-sub-act">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => void stop(run)}
                  aria-disabled={busy === run.id || undefined}
                  data-testid="today-ai-next-stop"
                >
                  {WORDS.cancel}
                </Button>
              </div>
            }
            testid="today-ai-next-run"
          />
        ))}
      </CalmList>
    </Part>
  );
}

/** The Autonomy rows the sheet says: Replies first, then the kinds that ask you first. */
function rulesShown(rows: readonly UiRow[]): UiRow[] {
  const reply = rows.filter((r) => r.id === "reply");
  const asks = rows.filter((r) => r.id !== "reply" && dbMode(r.mode) === "ask");
  return [...reply, ...asks].slice(0, RULES_SHOWN);
}

/** How AI works for you (W21): your own Autonomy rows as they stand, read as the sheet opens, with the door to them. */
function HowItWorks() {
  const [rows, setRows] = useState<UiRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void apiFor(window)("GET policies").then((r) => {
      // Each row's class and mode is all the sheet says: its dials are Autonomy's own.
      const rules = r.ok ? r.data.policies.map((p) => ({ class: p.class, mode: p.mode, limits: {} })) : null;
      if (live && rules && r.ok) setRows(rulesShown(uiRows({ rows: rules, role: r.data.role })));
    });
    return () => {
      live = false;
    };
  }, []);
  if (!rows?.length) return null;
  return (
    <Part head={WORDS.how} testid="today-ai-how">
      <div className="calm-ai-rules" role="list">
        {rows.map((r) => (
          <div key={r.id} className="calm-ai-rule" role="listitem" data-testid="today-ai-rule">
            <b>{r.label}</b>
            <span>{entryOf(POLICY_MODE_WORDS, dbMode(r.mode))?.head}</span>
          </div>
        ))}
      </div>
      <a className="calm-ai-door" {...routeDoor(addressOf({ kind: "rules" }))} data-testid="today-ai-autonomy">
        {WORDS.door}
        <Icon name="chevron" size={12} />
      </a>
    </Part>
  );
}

/** Stop everything, and its Resume (the app's own, settings/autonomy): what the press did, said back. */
function StopEverything({ stopped, flash }: { stopped: boolean; flash: (msg: string, warn: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const press = stopped ? "resume" : "stop";
  const go = async () => {
    setBusy(true);
    const r = await autonomyVerbs.stopAll(!stopped);
    setBusy(false);
    if (!r.ok) return flash(r.message, true);
    const said = stopSaid(press, r.answer);
    flash(said.words, said.warn);
    void refreshSurface("today");
  };
  return (
    <div className="calm-ai-stop">
      <Button
        size="lg"
        variant="secondary"
        onClick={() => void go()}
        aria-disabled={busy || undefined}
        data-testid="today-ai-stop"
      >
        {stopped ? WORDS.resume : WORDS.stop}
      </Button>
      {stopped ? null : <p className="calm-ai-stop-note">{WORDS.stopNote}</p>}
    </div>
  );
}

/** The sheet's body, read once it first opens: the Autonomy rows are asked for then, and never on Today's load. */
function AiWork({ ai, flash }: { ai: TodayAiVM; flash: (msg: string, warn: boolean) => void }) {
  return (
    <>
      <h2 className="calm-ai-title">{ai.stopped ? WORDS.stopped : WORDS.on}</h2>
      <p className="calm-ai-sub">{ai.stopped ? WORDS.stoppedSub : WORDS.onSub}</p>
      <RightNow ai={ai} />
      <Did ai={ai} />
      <Next flash={flash} />
      <HowItWorks />
      {ai.stopped === null ? null : <StopEverything stopped={ai.stopped} flash={flash} />}
    </>
  );
}

/** AI's sheet over Today, open while its press says so. */
export function AiSheet() {
  const open = useAiSheetOpen();
  const ai = useSurface("today")?.ai ?? null;
  const [toastNode, toast] = useToast();
  // Drawn from its first opening on, so it leaves whole; never before, so Today's load asks for nothing of it.
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (open) setSeen(true);
  }, [open]);
  // Today left: the sheet is shut, and opens shut on the next visit.
  useEffect(() => closeAiSheet, []);
  const flash = (msg: string, warn: boolean) => toast(warn ? { tone: "warn", msg: <>{msg}</> } : { msg: <>{msg}</> });
  return (
    <>
      <Sheet
        open={open && !!ai}
        onClose={closeAiSheet}
        title={WORDS.kicker}
        close={{ label: LIFECYCLE_WORDS.close, glyph: <Icon name="x" size={13} /> }}
        kicker
        fit
        backCloses
        className="over-page calm-ai-over"
        testid="today-ai-sheet"
      >
        {seen && ai ? <AiWork ai={ai} flash={flash} /> : null}
      </Sheet>
      {toastNode}
    </>
  );
}
