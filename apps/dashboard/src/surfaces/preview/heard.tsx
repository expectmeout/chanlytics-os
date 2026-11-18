"use client";

/**
 * A lead's own preview, what a call left (decision 0079; the redesign of 17 November 2026): the words said on it, as the
 * call's screen shows the newest of them and the call's line keeps them all behind Read it, and What you'd get, the
 * card the business's Inbox would hold after a real call like it. The words are the rehearsal's (read by the page's
 * heard door); the card is the provider's own write-up of the call, in the words every surface says a call in
 * (contracts previews/heard.ts). Every word here is contracts'.
 */
import { useState } from "react";
import { LEAD_PREVIEW_WORDS as W, type PreviewGotVM, type PreviewHeardLine } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { PvThree } from "./head";
import type { TalkLine } from "./use-talk";

/** A call's words, in order: who said each, and what. `newest` keeps the last few alone, as the call's screen shows them. */
export function PvHeard({ lines, newest }: { lines: readonly PreviewHeardLine[]; newest?: number }) {
  const from = newest ? Math.max(0, lines.length - newest) : 0;
  return (
    <ol className="pv-heard" aria-label={W.heardLabel} data-testid="pv-heard">
      {lines.slice(from).map((line, at) => (
        <li key={from + at} className="pv-heard-line" data-who={line.who}>
          <span className="pv-quiet">{line.who === "ai" ? W.it : W.you}</span>
          <p className="pv-answer">{line.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** What the business would get after a real call like this one: how it ended, what the caller wanted, and the notes. */
function PvGot({ got }: { got: PreviewGotVM }) {
  return (
    <Panel as="section" className="pv-got" aria-label={W.gotTitle} data-testid="pv-got">
      <span className="pv-got-head">
        <span className="pv-label">{W.gotTitle}</span>
        {got.outcome ? (
          <span className="pv-got-how" data-yours={got.yours || undefined} data-testid="pv-got-how">
            {got.outcome}
          </span>
        ) : null}
      </span>
      <p className="pv-answer">{got.wanted}</p>
      {got.notes.length ? (
        <ul className="pv-got-notes">
          {got.notes.map((note) => (
            <li key={note}>
              <Icon name="check" size={14} />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="pv-quiet">{W.gotFoot}</p>
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
  return (
    <li className="pv-line" data-testid="pv-called">
      <span className="pv-called">
        <Icon name="phone" size={16} />
        <span className="pv-called-words">
          <b>{W.called(line.seconds)}</b>
          <span>{W.calledSub}</span>
        </span>
        {line.lines.length ? (
          <Button
            variant="quiet"
            size="touch"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            data-testid="pv-read-it"
          >
            {W.readIt}
            <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
          </Button>
        ) : null}
      </span>
      {open ? <PvHeard lines={line.lines} /> : null}
      {line.got ? (
        <PvGot got={line.got} />
      ) : line.writing ? (
        <span className="pv-line-by" role="status" data-testid="pv-got-writing">
          <PvThree live />
          {W.gotWriting}
        </span>
      ) : null}
    </li>
  );
}
