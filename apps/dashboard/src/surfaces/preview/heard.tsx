"use client";

/**
 * A lead's own preview, what a call left (decision 0079; the redesign of 17 November 2026): the words said on it, as the
 * call's screen shows the newest of them and the call's line keeps them all behind Read it, and What you'd get, the
 * card the business's Inbox would hold after a real call like it. The words are the rehearsal's (read by the page's
 * heard door); the card is the provider's own write-up of the call, in the words every surface says a call in
 * (contracts previews/heard.ts). Every word here is contracts'.
 */
import { useId, useState } from "react";
import { LEAD_PREVIEW_WORDS as W, type PreviewGotVM, type PreviewHeardLine } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { StatePill } from "../kit/pill/state-pill";
import { PvThree } from "./head";
import type { TalkLine } from "./use-talk";

/**
 * A call's words, in order: who said each, and what. `newest` keeps the last few alone, as the call's screen shows them,
 * the caller's quiet and AI's large; behind Read it each is said with who said it.
 */
export function PvHeard({ lines, newest, id }: { lines: readonly PreviewHeardLine[]; newest?: number; id?: string }) {
  const from = newest ? Math.max(0, lines.length - newest) : 0;
  return (
    <ol id={id} className="pv-heard" aria-label={W.heardLabel} data-testid="pv-heard">
      {lines.slice(from).map((line, at) => (
        <li key={from + at} className="pv-heard-line" data-who={line.who}>
          <span className="pv-heard-who">{line.who === "ai" ? W.it : W.you}</span>
          <p className="pv-heard-words">{line.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** A to-do as the card says it: its name before the colon in the ink, as a label, then what is to be done. */
function PvTodo({ words }: { words: string }) {
  const colon = words.indexOf(": ");
  if (colon < 0) return <>{words}</>;
  return (
    <>
      <b>{words.slice(0, colon + 1)}</b>
      {words.slice(colon + 1)}
    </>
  );
}

/** What the business would get after a real call like this one: how it ended, what the caller wanted, and the notes. */
function PvGot({ got }: { got: PreviewGotVM }) {
  return (
    <Panel as="section" className="pv-got" aria-label={W.gotTitle} data-testid="pv-got">
      <span className="pv-got-head">
        <Icon name="bell" size={15} />
        {W.gotTitle}
        {got.outcome ? (
          <span className="pv-got-how" data-yours={got.yours || undefined} data-testid="pv-got-how">
            <StatePill kind="tone" value={got.yours ? "warn" : "ok"} label={got.outcome} lit />
          </span>
        ) : null}
      </span>
      {got.wanted ? <p className="pv-got-wanted">{got.wanted}</p> : null}
      {got.notes.length ? (
        <ul className="pv-got-notes">
          {got.notes.map((note, at) => (
            <li key={note}>
              {/* The to-do's glyph, then a person's for what they gave about themselves. */}
              <Icon name={at === 0 && got.todo ? "check" : "user"} size={16} />
              <span>{at === 0 && got.todo ? <PvTodo words={note} /> : note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="pv-got-foot">{W.gotFoot}</p>
    </Panel>
  );
}

/**
 * A call, as a line of the conversation: how long it ran and who answered, its words behind Read it, and under it what
 * the business would get: being written while the provider writes it, then the card. A write-up that never comes
 * leaves the line and its words alone, and nothing is said to have failed.
 */
export function PvCalled({ line }: { line: Extract<TalkLine, { kind: "call" }> }) {
  const [open, setOpen] = useState(false);
  const words = useId();
  return (
    <li className="pv-line pv-line-call" data-testid="pv-called">
      <span className="pv-called">
        <span className="pv-glyph" aria-hidden="true">
          <Icon name="phone" size={18} />
        </span>
        <span className="pv-called-words">
          <b>{W.called(line.seconds)}</b>
          <span>{W.calledSub}</span>
        </span>
        {line.lines.length ? (
          <Button
            variant="quiet"
            size="touch"
            aria-expanded={open}
            aria-controls={open ? words : undefined}
            onClick={() => setOpen(!open)}
            data-testid="pv-read-it"
          >
            {W.readIt}
            <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
          </Button>
        ) : null}
      </span>
      {open ? <PvHeard id={words} lines={line.lines} /> : null}
      {line.got ? (
        <PvGot got={line.got} />
      ) : line.writing ? (
        <span className="pv-wait" role="status" data-testid="pv-got-writing">
          <PvThree live />
          {W.gotWriting}
        </span>
      ) : null}
    </li>
  );
}
