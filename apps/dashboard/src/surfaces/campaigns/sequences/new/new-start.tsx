/**
 * New, before a draft (decision 0065; the canvas "New: start from what's ready", 11 Nov 2026): one line to say or type
 * what it should do (line.tsx); what changed while the owner was away (since.tsx); what the workspace can start
 * now, the first standing open, and the one thing each other start needs (ready.tsx, by ready-rules.ts); and the
 * customers' journey with its map (journey.tsx). Each start is a line Ask drafts from with its choices already made.
 * While Ask drafts, the line is kept with its Stop; when Ask could not draft it, or nothing here fits, the line stays and
 * Build it yourself is offered. A viewer reads what is happening, and is told who can make one.
 */
import { NEW_WORDS as W, peopleRoute, type NewDraftAsk, type NewKind } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { CmPane } from "../../parts/split";
import { Choice } from "./choice";
import { Journey } from "./journey";
import { NewLine, NEW_LINE_MIN } from "./line";
import * as M from "./new-model";
import { CaseNote, SaidLine } from "./new-parts";
import { Ready, readyReadsOf, type StartReads } from "./ready";
import type { ReadyStart } from "./ready-rules";
import { Since, forgetLeftLine } from "./since";
import "./ready.css";

/**
 * Nothing here can start on what the line asks (D3): what Ask said, the closest ways to do it anyway -- a list kept in
 * People that a sequence starts on, or one message to people picked when it comes up -- and the line, to say again.
 */
function NoFit({ refused, onOnce }: { refused: string; onOnce: () => void }) {
  const said = M.cannotParts(refused);
  return (
    <>
      <CaseNote
        tone="warn"
        title={said.title}
        words={said.words ? `${said.words} ${W.noFit.closest}` : W.noFit.closest}
        testid="sq-nw-refused"
      />
      <div className="sq-nw-rows" data-testid="sq-nw-closest">
        <Choice
          glyph="users"
          name={W.noFit.list.lead}
          said={W.noFit.list.sub}
          door={{ label: W.sheets.open, to: peopleRoute() }}
          testid="sq-nw-closest-list"
        />
        <Choice
          glyph="send"
          name={W.noFit.once.lead}
          said={W.noFit.once.sub}
          tag={W.starts.kind.once}
          onPick={onOnce}
          testid="sq-nw-closest-once"
        />
      </div>
      <p className="sq-nw-note">{W.noFit.again}</p>
    </>
  );
}

/** Ask at work: the line kept with its Stop, and the draft's shape held while it writes. */
function Drafting({ line, onStop }: { line: string; onStop: () => void }) {
  return (
    <div className="sq-nw" aria-busy="true" data-testid="sq-nw-drafting">
      <SaidLine said={line} doing={W.say.drafting} onAgain={onStop} again={W.say.stop} button />
      <p className="sq-nw-cap">{W.draft.who}</p>
      <div className="sq-nw-skel is-big" />
      <p className="sq-nw-cap">{W.draft.theMessage}</p>
      <div className="sq-nw-skel" />
      <p className="sq-nw-note">{W.say.reading}</p>
    </div>
  );
}

export type { StartReads } from "./ready";

interface StartProps {
  line: string;
  onLine: (words: string) => void;
  onDraft: (words: string, fixed?: Omit<NewDraftAsk, "words">) => void;
  drafting: boolean;
  onStop: () => void;
  /** Ask could not draft it just now. */
  failed: boolean;
  /** What Ask said nothing here can do, in a sentence (its refusal), where it said one. */
  refused: string | null;
  /** A draft built by hand: the door's kind, or the one a closest way names (a one-off, D3). */
  onByHand: (kind?: NewKind) => void;
  /** What the door that opened New could not keep (a list gone since its link was made), where it said so. */
  notice: string | null;
  reads: StartReads | null;
  may: boolean;
  onClose: () => void;
}

/** New before a draft, in New's pane. */
export function StartView(p: StartProps) {
  const enough = p.line.trim().length >= NEW_LINE_MIN;
  // However a line is drafted, what the tab kept of it is let go (since.tsx).
  const draft = (words: string, fixed?: Omit<NewDraftAsk, "words">) => {
    forgetLeftLine();
    p.onDraft(words, fixed);
  };
  const draftIt = () => {
    if (enough) draft(p.line.trim());
  };
  // A start is its own line, drafted as it is pressed, with its choices made.
  const start = (s: ReadyStart) => {
    p.onLine(s.line);
    draft(s.line, s.fixed);
  };
  return (
    <CmPane title={W.title} onClose={p.onClose} testid="sq-new">
      {p.drafting ? (
        <Drafting line={p.line} onStop={p.onStop} />
      ) : (
        <div className="sq-nw">
          {p.may ? (
            <NewLine
              line={p.line}
              onLine={p.onLine}
              onDraft={(words) => draft(words)}
              hint={p.failed ? W.say.kept : p.reads?.messages === 0 ? W.say.writes : W.say.hint}
            />
          ) : (
            <CaseNote tone="plain" title={W.viewer.title} words={W.viewer.words} testid="sq-nw-viewer" />
          )}
          {p.notice ? <CaseNote tone="warn" title={p.notice} testid="sq-nw-door-gone" /> : null}
          {p.failed ? (
            <CaseNote
              tone="bad"
              title={W.failed.title}
              words={W.failed.words}
              acts={
                <>
                  <Button size="sm" onClick={draftIt} data-testid="sq-nw-retry">
                    {W.failed.again}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => p.onByHand()} data-testid="sq-nw-by-hand">
                    {W.failed.byHand}
                  </Button>
                </>
              }
              testid="sq-nw-failed"
            />
          ) : p.refused ? (
            <NoFit refused={p.refused} onOnce={() => p.onByHand("once")} />
          ) : null}
          {p.reads ? (
            <>
              <Since
                reads={p.reads}
                line={p.line}
                may={p.may}
                onDraft={(words) => {
                  p.onLine(words);
                  draft(words);
                }}
              />
              <Ready reads={p.reads} may={p.may} onStart={start} />
              <Journey reads={readyReadsOf(p.reads)} may={p.may} onStart={start} />
              {p.reads.messages === 0 ? <p className="sq-nw-note">{W.starts.noMessages}</p> : null}
            </>
          ) : null}
        </div>
      )}
    </CmPane>
  );
}
