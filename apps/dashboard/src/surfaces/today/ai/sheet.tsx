/**
 * AI's sheet over Today (Working for you, 21 Nov 2026, W1 to W3, W13, W21): one place for AI's work, opened from its state
 * under the head's sentence. Who AI is talking to right now; what it did since you last looked (or today), each line's why a
 * tap away and its door over Today; what goes out next, each with its Stop; how AI works for you, read from your own
 * Autonomy rows with the door to them; and Stop everything, the app's own, with its Resume. Nothing in it is a number the
 * reads do not hold: a part that could not be read is not drawn.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
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
import { nextRuns } from "./runs";

const SHEET_WORDS = AI_WORDS.sheet;

/** The most rows of how AI works the sheet names: Replies, and the kinds that ask you first. */
const RULES_SHOWN = 3;

const sheetZone = (): string => workspaceClock()?.zone() ?? DEFAULT_TIMEZONE;
const runClockOf = (ms: number): string => tzClock(new Date(ms).toISOString(), sheetZone(), new Date()) ?? "";

/** Where a thing AI did opens: its visit on its day, else its conversation, over Today where it can be. */
function didDoorOf(did: AiDidVM): string | null {
  if (did.visit) return visitRoute(did.visit.id, zoneDayKey(Date.parse(did.visit.startsAt), did.visit.timezone));
  return did.conversationId ? addressOf({ kind: "conversation", id: did.conversationId }) : null;
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
    <Part head={SHEET_WORDS.now} testid="today-ai-now">
      {ai.talking.length ? (
        <CalmList label={SHEET_WORDS.now} testid="today-ai-talking-list">
          {ai.talking.map((talk) => (
            <CalmRow
              key={talk.conversationId}
              first={{ face: { person: { name: talk.who, initials: initialsOf(talk.who) } } }}
              name={talk.who}
              said={talk.said}
              wait={{ words: SHEET_WORDS.nowWord, long: false }}
              door={routeDoor(addressOf({ kind: "conversation", id: talk.conversationId }), goFromToday)}
              testid="today-ai-talking"
            />
          ))}
        </CalmList>
      ) : (
        nothing(SHEET_WORDS.nowNone, "today-ai-now-none")
      )}
    </Part>
  );
}

/** One thing AI did: what and who, when; pressed, its why opens under it with its door (W13). */
function DidLine({ did }: { did: AiDidVM }) {
  const [open, setOpen] = useState(false);
  const to = didDoorOf(did);
  const name = `${SHEET_WORDS.did[did.kind]} ${did.who}`;
  // A booking has no why to read: its line is its door. A hold or a set-aside opens to say why first.
  if (!did.why) {
    return (
      <CalmRow
        name={name}
        said={did.what}
        wait={{ words: runClockOf(did.atMs), long: false }}
        door={to ? routeDoor(to, goFromToday) : null}
        testid="today-ai-did"
      />
    );
  }
  return (
    <CalmRow
      name={name}
      said={did.what}
      wait={{ words: runClockOf(did.atMs), long: false }}
      press={() => setOpen(!open)}
      open={open}
      under={
        open ? (
          <div className="calm-under calm-ai-why" data-testid="today-ai-why">
            <p>{did.why}</p>
            {to ? (
              <a className="calm-ai-door" {...routeDoor(to, goFromToday)}>
                {SHEET_WORDS.open}
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
  const since = ai.since && ai.lookedMs !== null ? ai.lookedMs : null;
  const shown = since === null ? ai.did : ai.did.filter((d) => d.atMs >= since);
  const head = since === null ? SHEET_WORDS.todayHead : SHEET_WORDS.sinceHead(runClockOf(since));
  return (
    <Part head={head} testid="today-ai-since">
      {shown.length ? (
        <CalmList label={head} testid="today-ai-did-list">
          {shown.map((d) => (
            <DidLine key={`${d.kind}:${d.atMs}:${d.who}`} did={d} />
          ))}
        </CalmList>
      ) : (
        nothing(SHEET_WORDS.didNone, "today-ai-did-none")
      )}
    </Part>
  );
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
    flash(r.ok ? SHEET_WORDS.cancelled : r.message, !r.ok);
  };
  return (
    <Part head={SHEET_WORDS.next} testid="today-ai-next">
      <CalmList label={SHEET_WORDS.next} testid="today-ai-next-list">
        {runs.map((run) => (
          <CalmRow
            key={run.id}
            name={runTitleOf(run)}
            said={SHEET_WORDS.sends(run.recipient_count)}
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
                  {SHEET_WORDS.cancel}
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
    <Part head={SHEET_WORDS.how} testid="today-ai-how">
      <div className="calm-ai-rules" role="list">
        {rows.map((r) => (
          <div key={r.id} className="calm-ai-rule" role="listitem" data-testid="today-ai-rule">
            <b>{r.label}</b>
            <span>{entryOf(POLICY_MODE_WORDS, dbMode(r.mode))?.head}</span>
          </div>
        ))}
      </div>
      <a className="calm-ai-door" {...routeDoor(addressOf({ kind: "rules" }))} data-testid="today-ai-autonomy">
        {SHEET_WORDS.door}
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
    const stopWords = stopSaid(press, r.answer);
    flash(stopWords.words, stopWords.warn);
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
        {stopped ? SHEET_WORDS.resume : SHEET_WORDS.stop}
      </Button>
      {stopped ? null : <p className="calm-ai-stop-note">{SHEET_WORDS.stopNote}</p>}
    </div>
  );
}

/** The sheet's body, read once it first opens: the Autonomy rows are asked for then, and never on Today's load. */
function AiWork({ ai, flash }: { ai: TodayAiVM; flash: (msg: string, warn: boolean) => void }) {
  return (
    <>
      <h2 className="calm-ai-title">{ai.stopped ? SHEET_WORDS.stopped : SHEET_WORDS.on}</h2>
      <p className="calm-ai-sub">{ai.stopped ? SHEET_WORDS.stoppedSub : SHEET_WORDS.onSub}</p>
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
        title={SHEET_WORDS.kicker}
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
