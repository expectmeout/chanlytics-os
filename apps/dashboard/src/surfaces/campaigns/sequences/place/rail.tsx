/**
 * The record's rail of days (the Steps redesign, 17 Oct 2026), one part with three lenses (the canvas's PlaceRail, "One
 * place, two windows", 18 Oct 2026): everyone's, as every sequence's Steps draws it (StepsRail); one lead's place, as the
 * lead sheet's Sequence section draws it (each step by what its send did for them, the next by when it goes); and as
 * they'd get it before they join (each email filled for them, step 1 after your OK). Its rows: Start, a step on its day,
 * the wait between two steps and who it keeps going, and End.
 *
 * One record for every sequence (the Campaigns wiring review's rule E, lane 5, 19 Oct 2026): a sequence to customers and
 * a sequence to leads draw the one rail, and four parts change with who it is for -- who joins (its Start), where it sends
 * from, how its words are written (each step's box and sheet) and the check (How it runs). A sequence to leads drew its
 * own rail beside this one (leads/lead-steps.tsx), and every change to the record was made twice.
 *
 * Hookless. Every word is contracts' (sequence-schedule.ts, sequence-place.ts).
 */
import { Fragment, type ReactNode } from "react";
import { SCHEDULE_WORDS as SW, type PlaceRailStepVM, type PlaceRailVM } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { cx } from "../../../kit/variants";
import "./place.css";

/** One row of the rail: its day (Start, Day 1, End; none for a wait), and what stands on that day. */
export function RailRow(p: { day?: string; need?: boolean; gap?: boolean; children: ReactNode; testid?: string }) {
  return (
    <li className={cx("sq-rail-row", !p.day && "is-bare", p.gap && "is-gap")} data-testid={p.testid}>
      <span className={cx("sq-rail-day", p.need && "is-need")} aria-hidden={p.day ? undefined : "true"}>
        {p.day ?? null}
      </span>
      <div className="sq-rail-cell">{p.children}</div>
    </li>
  );
}

/** The wait before a step, and who it keeps going, on the rail between the two days. */
function RailWait({ wait, only, testid }: { wait: string; only: string | null; testid?: string }) {
  return (
    <RailRow gap>
      <p className="sq-rail-wait" data-testid={testid}>
        <span>{wait}</span>
        {only ? (
          <span className="sq-rail-only">
            <Icon name="filter" size={12} />
            {only}
          </span>
        ) : null}
      </p>
    </RailRow>
  );
}

/** A line of the rail that is no step: Start and End, its head and the line under it. */
function RailLine({ head, sub, children }: { head: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sq-rail-line">
      <span className="sq-rail-lead">{head}</span>
      {sub || children ? (
        <span className="sq-rail-sub">
          {sub}
          {children}
        </span>
      ) : null}
    </div>
  );
}

/** What a step's box draws: its number, its title (a press that opens it), how it goes, its words and what it is doing. */
interface RailBoxProps {
  place: number;
  /** Its title: words, or a step's subject with its values by name (a sequence to leads' draft). */
  title: ReactNode;
  /** The title in words, for a screen reader, where it is not words already. */
  named?: string;
  /** Opens the step: its sheet on the record, the email as they get it on the lead sheet; none where nothing opens. */
  onOpen?: (() => void) | null;
  /** How it goes; none where its title and words say it (a call that closes a sequence to leads). */
  by?: { glyph: string; words: string } | null;
  /** What trails how it goes: a step's figures over 30 days. */
  figures?: ReactNode;
  /** Two lines of its words, or what is said in their place. */
  pre?: ReactNode;
  state?: { tone: "need" | "next" | "done"; words: string } | null;
  /** Its number is a tick: it has gone (to everyone, or to them). */
  done?: boolean;
  testid?: string;
}

/** A step on its day: one box, the whole of it the press that opens it where it opens anything. */
export function RailBox(p: RailBoxProps) {
  const need = p.state?.tone === "need";
  return (
    <div className={cx("sq-stepbox", need && "is-need")}>
      <span className="sq-stepbox-top">
        <span className={cx("sq-stepnum", p.done && "is-done")} aria-hidden="true">
          {p.done ? <Icon name="check" size={11} /> : p.place}
        </span>
        {p.onOpen ? (
          <LinkButton
            size="inherit"
            className="sq-stepbox-open"
            onClick={p.onOpen}
            aria-label={`${SW.step(p.place)}, ${p.named ?? (typeof p.title === "string" ? p.title : "")}`}
            data-testid={`sq-step-open-${p.place}`}
          >
            {p.title}
          </LinkButton>
        ) : (
          <span className="sq-stepbox-title">{p.title}</span>
        )}
        {p.onOpen ? <Icon name="chevron" size={14} /> : null}
      </span>
      {p.by || p.figures ? (
        <span className="sq-stepbox-meta">
          {p.by ? (
            <span className="sq-stepbox-by">
              <Icon name={p.by.glyph} size={13} />
              {p.by.words}
            </span>
          ) : null}
          {p.figures}
        </span>
      ) : null}
      {p.pre}
      {p.state ? (
        <span className={cx("sq-stepbox-now", `is-${p.state.tone}`)} data-testid={p.testid ?? `sq-step-now-${p.place}`}>
          <span>{p.state.words}</span>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Where a sequence starts, its rail's first row: who joins it and when (`lead`), the line under it, and its acts -- How it
 * runs for every sequence, where it can change, and Add leads for a sequence to leads. What its acts open (a sheet) rides
 * after the row's line.
 */
export function RailStart(p: { day: string; lead: ReactNode; sub: ReactNode; acts?: ReactNode; children?: ReactNode }) {
  return (
    <RailRow day={p.day} testid="sq-starts">
      <div className="sq-rail-line">
        <span className="sq-rail-lead">{p.lead}</span>
        <span className="sq-rail-sub">{p.sub}</span>
        {p.acts ? <span className="sq-rail-acts">{p.acts}</span> : null}
      </div>
      {p.children}
    </RailRow>
  );
}

/** One step of a sequence's rail, as its audience's part draws it: its place, the wait before it, and its row. */
export interface RailStep {
  id: string;
  place: number;
  /** The wait before it and who it keeps going; none for the first. */
  wait: { wait: string; only: string | null } | null;
  /** Its row on its day (a RailRow holding its RailBox), drawn by the part that knows how its words are written. */
  row: ReactNode;
}

interface StepsRailProps {
  /** How many steps over how many days, and whether it says "for each person" (a sequence that runs on). */
  span: { count: ReactNode; over: string | null; per: boolean };
  /** Who joins it: its Start (RailStart). */
  start: ReactNode;
  steps: readonly RailStep[];
  /** A one-off's day and its one message, in place of steps. */
  day?: ReactNode;
  /** Add a step, after the steps, or above the last where a call always closes it (a sequence to leads). */
  add?: ReactNode;
  addAboveLast?: boolean;
  /** Where it stops. */
  end: { head: string; sub: string } | null;
  /** Under the rail: its notes, where it sends from, and the sheets its steps and its start open. */
  children?: ReactNode;
}

/** Every sequence's Steps: its span, then the rail from its start to where it stops, then what stands under it. */
export function StepsRail(p: StepsRailProps) {
  const last = p.steps.length - 1;
  return (
    <div className="sq-steps-body" data-testid="sq-steps">
      <p className="sq-span">
        <span>
          <b>{p.span.count}</b>
          {p.span.over ? ` ${p.span.over}` : null}
        </span>
        {p.span.per ? <span className="sq-span-per">{SW.per}</span> : null}
      </p>
      <ol className="sq-rail">
        {p.start}
        {p.steps.map((s, i) => (
          <Fragment key={s.id}>
            {p.addAboveLast && i === last ? p.add : null}
            {s.wait ? <RailWait wait={s.wait.wait} only={s.wait.only} testid={`sq-step-wait-${s.place}`} /> : null}
            {s.row}
          </Fragment>
        ))}
        {p.day}
        {p.addAboveLast && last >= 0 ? null : p.add}
        {p.end ? (
          <RailRow day={SW.end} testid="sq-stops">
            <RailLine head={<b>{p.end.head}</b>} sub={p.end.sub} />
          </RailRow>
        ) : null}
      </ol>
      {p.children}
    </div>
  );
}

/** Add a step, a thumb tall at the steps' end, for every sequence that takes another. */
export function RailAdd({ onAdd, gateProps }: { onAdd: () => void; gateProps: Record<string, unknown> }) {
  return (
    <RailRow>
      <div className="sq-addstep">
        <Button variant="quiet" className="sq-addstep-press" onClick={onAdd} data-testid="sq-add-step" {...gateProps}>
          <Icon name="plus" size={14} /> {SW.addStep}
        </Button>
      </div>
    </RailRow>
  );
}

/** How a step goes for one lead, on its box: an email, or a task for you. */
const byOf = (s: PlaceRailStepVM) => ({ glyph: s.hand ? "phone" : "mail", words: s.how });

interface PlaceRailProps {
  vm: PlaceRailVM;
  /** Each email's words for this lead, by its place, under its title (as they'd get it). */
  words?: ReadonlyMap<number, ReactNode>;
  /** A step pressed: the email as they get it. */
  onOpen?: (place: number) => void;
  /** What stands under End: Take out, the record's door. */
  foot?: ReactNode;
  testid?: string;
}

/**
 * The rail drawn for one lead (their place) or as they'd get it (before they join): Start (when they joined, or that they
 * join when added), each step on its day by what it is doing for them, the waits between, and End (what stops it, and how
 * a reply is learned of).
 */
export function PlaceRail({ vm, words, onOpen, foot, testid = "lead-sheet-rail" }: PlaceRailProps) {
  return (
    <div className="sq-steps-body" data-testid={testid}>
      <ol className="sq-rail">
        <RailRow day={SW.start} testid="lead-sheet-rail-start">
          <RailLine head={<b>{vm.start.head}</b>} sub={vm.start.sub} />
        </RailRow>
        {vm.steps.flatMap((s) => [
          s.wait ? (
            <RailWait
              key={`wait-${s.id}`}
              wait={s.wait.wait}
              only={s.wait.only}
              testid={`lead-sheet-rail-wait-${s.place}`}
            />
          ) : null,
          <RailRow key={s.id} day={SW.day(s.day)} need={s.state?.tone === "need"} testid={`lead-sheet-rail-${s.place}`}>
            <RailBox
              place={s.place}
              title={s.title}
              onOpen={onOpen && !s.hand ? () => onOpen(s.place) : null}
              by={byOf(s)}
              pre={words?.get(s.place) ?? null}
              state={s.state}
              done={s.state?.tone === "done"}
              testid={`lead-sheet-rail-now-${s.place}`}
            />
          </RailRow>,
        ])}
        <RailRow day={SW.end} testid="lead-sheet-rail-end">
          <RailLine head={<b>{vm.end.head}</b>} sub={vm.end.sub} />
        </RailRow>
      </ol>
      {foot}
    </div>
  );
}
