"use client";

/**
 * A lead's own preview, its conversation and the field under it (decision 0079; the redesign of 17 November 2026, drawn
 * as its canvas draws it): each line in the order it happened, AI's words plain under its mark and theirs in a lozenge
 * at the right (what they asked, AI's answer with what a live conversation would do with it, a call they made, a thing
 * they told it); then the questions not yet asked, standing on the field, and the field itself, a capsule of the
 * control layer's glass, which takes a customer's question or, turned to telling, a thing the business tells it. Every
 * word is contracts' (previews/words.ts).
 */
import type { ReactNode, SyntheticEvent } from "react";
import {
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  PREVIEW_TAUGHT,
  previewMinePath,
  type PreviewPageVM,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { PvThree } from "./head";
import { PvCalled } from "./heard";
import { PvSlide } from "./slide";
import type { Call } from "./use-call";
import type { Talk, TalkLine } from "./use-talk";
import { PvWords, useWriting } from "./written";

/** A stretch of an answer lit as theirs: from one character up to another. */
type Lit = readonly (readonly [number, number])[];
const NONE_LIT: Lit = [];

/**
 * AI's words: its mark and its name over them, and the words plain, as the page's own; what it took from the things
 * they told it lit in them. One that came on this visit (`fresh`) is drawn arriving and written out, and what stands
 * under it waits until it has been, however short or long it is.
 */
function PvAnswer({
  text,
  at,
  lit = NONE_LIT,
  fresh = false,
  children,
}: {
  text: string;
  at: number | "greeting";
  lit?: Lit;
  fresh?: boolean;
  children?: ReactNode;
}) {
  const writing = useWriting(text, lit, fresh);
  return (
    <li
      className="pv-line"
      data-new={fresh || undefined}
      data-testid={at === "greeting" ? "pv-greeting" : `pv-turn-${at}`}
    >
      <span className="pv-line-by">
        <PvThree />
        {W.it}
      </span>
      <p className="pv-says">
        <PvWords text={text} spans={lit} shown={fresh ? writing.shown : null} />
      </p>
      {children ? (
        <div className="pv-after" data-wait={!writing.written || undefined}>
          {children}
        </div>
      ) : null}
    </li>
  );
}

/** What they told it, as a card in the conversation: the words, that it uses them, and the question asked again. */
function PvTold({ text, talk, fresh }: { text: string; talk: Talk; fresh: boolean }) {
  return (
    <li className="pv-line" data-new={fresh || undefined} data-testid="pv-told">
      <Panel as="section" className="pv-told" aria-label={W.toldTitle}>
        <span className="pv-told-head">
          <Icon name="pencil" size={14} />
          {W.toldTitle}
          {talk.lastAsked ? (
            <Button
              size="touch"
              className="pv-told-again"
              disabled={talk.busy}
              onClick={() => void talk.say(talk.lastAsked ?? "")}
              data-testid="pv-ask-again"
            >
              <Icon name="refresh" size={14} />
              {W.askAgain}
            </Button>
          ) : null}
        </span>
        <p className="pv-quote">{text}</p>
        <span className="pv-ok">
          <Icon name="check" size={15} />
          {W.toldUses}
        </span>
      </Panel>
    </li>
  );
}

/** One line of the conversation. `last` is the newest answer, which alone offers Tell it what to say. */
function PvLine({ line, at, last, talk }: { line: TalkLine; at: number; last: boolean; talk: Talk }) {
  if (line.kind === "said")
    return (
      <li className="pv-line" data-mine data-new={line.fresh || undefined} data-testid={`pv-turn-${at}`}>
        <p className="pv-said">
          <span className="rec-sr">{W.you}: </span>
          {line.text}
        </p>
      </li>
    );
  if (line.kind === "call") return <PvCalled line={line} />;
  if (line.kind === "told") return <PvTold text={line.text} talk={talk} fresh={line.fresh === true} />;
  return (
    <PvAnswer text={line.text} at={at} lit={line.then?.spans ?? NONE_LIT} fresh={line.fresh === true}>
      {line.then ? (
        <>
          {line.then.taught ? (
            <span className="pv-used" data-testid={`pv-used-${at}`}>
              <Icon name="pencil" size={13} />
              {W.fromTaught}
            </span>
          ) : null}
          <p className="pv-then" data-tone={line.then.tone} data-testid={`pv-then-${at}`}>
            <Icon name="send" size={14} />
            <span>{W.then[line.then.tone]}</span>
          </p>
          {last && line.then.tone === "yours" && talk.canTell && !talk.telling ? (
            <Button size="touch" onClick={talk.startTelling} data-testid="pv-tell-what">
              <Icon name="pencil" size={15} />
              {W.tellWhat}
            </Button>
          ) : null}
        </>
      ) : null}
    </PvAnswer>
  );
}

/**
 * The conversation: it speaks first, its greeting as their business (decision 0079), and each line after. Before
 * anything is said it is marked empty: a desk draws it, and a phone where it has the room; a phone of a short screen
 * keeps its first for Call it and the field (preview.css).
 */
export function PvTalk({ vm, talk }: { vm: PreviewPageVM; talk: Talk }) {
  const newest = talk.lines.findLastIndex((line) => line.kind === "answer");
  const empty = !talk.lines.length && !talk.busy;
  return (
    <ol className="pv-talk" role="log" aria-live="polite" data-empty={empty || undefined} data-testid="pv-chat">
      <PvAnswer text={vm.greeting} at="greeting" />
      {talk.lines.map((line, at) => (
        <PvLine key={at} line={line} at={at} last={at === newest} talk={talk} />
      ))}
      {talk.busy && !talk.telling ? (
        <li className="pv-line" data-testid="pv-writing">
          <span className="pv-wait">
            <PvThree live />
            {W.writing}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

/** Where its messages are all said: what that means, what is left of its calls, Make it mine, and a call while it may. */
function PvSpent({ token, call }: { token: string; call: Call }) {
  return (
    <Panel className="pv-spent" role="status" data-testid="pv-spent">
      <p className="pv-spent-words">{W.spent}</p>
      <span className="pv-quiet">{call.leftWords}</span>
      <span className="pv-spent-acts">
        <Button variant="primary" size="touch" href={previewMinePath(token)}>
          {W.mine}
        </Button>
        {call.used ? null : (
          <Button size="touch" onClick={() => void call.start()}>
            <Icon name="phone" size={15} />
            {W.callStart}
          </Button>
        )}
      </span>
    </Panel>
  );
}

/** The field's right-hand press: Send once there are words; before that, a call, once the head's own has scrolled away. */
function PvFieldPress({ talk, call, canCall }: { talk: Talk; call: Call; canCall: boolean }) {
  const words = talk.text.trim().length > 0;
  if (!words && !talk.telling && talk.lines.length > 0 && canCall && !call.used)
    return (
      <Button
        variant="ink"
        size="touch"
        iconOnly
        aria-label={W.callStart}
        onClick={() => void call.start()}
        data-testid="pv-call-again"
      >
        <Icon name="phone" size={18} />
      </Button>
    );
  return (
    <Button
      type="submit"
      variant={words ? "primary" : "secondary"}
      size="touch"
      iconOnly
      aria-label={talk.telling ? W.teachSend : W.send}
      disabled={talk.busy || !words}
      data-testid="pv-send"
    >
      <Icon name="arrow-up" size={18} />
    </Button>
  );
}

/** The questions it can answer that are not yet asked, standing on the field in one row that slides. */
function PvStarters({ talk }: { talk: Talk }) {
  return (
    <>
      <span className="pv-label pv-dock-label">{W.tryAsking}</span>
      <PvSlide className="pv-starters" testid="pv-starters" count={talk.starters.length}>
        {talk.starters.map((question) => (
          <Button key={question} size="touch" disabled={talk.busy} onClick={() => void talk.say(question)}>
            {question}
          </Button>
        ))}
      </PvSlide>
    </>
  );
}

/** The field and what stands on it: the questions not yet asked, or that it is being told; then the box and its press. */
export function PvDock({ talk, call, canCall, token }: { talk: Talk; call: Call; canCall: boolean; token: string }) {
  if (talk.spent)
    return (
      <div className="pv-dock">
        <PvSpent token={token} call={call} />
      </div>
    );
  const onSend = (event: SyntheticEvent) => {
    event.preventDefault();
    void talk.send();
  };
  return (
    <div className="pv-dock" data-testid="pv-dock">
      {talk.telling ? (
        <div className="pv-telling">
          <Button
            variant="soft"
            size="touch"
            className="pv-telling-on"
            aria-label={W.tellingStop}
            onClick={talk.stopTelling}
            data-testid="pv-telling"
          >
            <Icon name="pencil" size={14} />
            {W.telling}
            <Icon name="x" size={13} />
          </Button>
          <span className="pv-quiet">{W.tellingNote}</span>
        </div>
      ) : talk.starters.length ? (
        <PvStarters talk={talk} />
      ) : null}
      <form className="pv-ask" onSubmit={onSend} aria-busy={talk.busy || undefined}>
        <div className="pv-ask-box">
          <Field
            aria-label={talk.telling ? W.teachLabel : W.textLabel}
            placeholder={talk.telling ? W.teachLabel : W.textLabel}
            rows={1}
            shape="words"
            value={talk.text}
            onValueChange={talk.setText}
            readOnly={talk.busy}
            // As long as its door takes: a thing told is shorter than a question asked.
            maxLength={talk.telling ? PREVIEW_TAUGHT.chars : PREVIEW_LIMITS.messageChars}
            enterKeyHint="go"
            data-testid="pv-text"
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a new line, and Enter that ends a keyboard's own composing is its own.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void talk.send();
            }}
            {...fieldProblem(talk.problem)}
          />
          <PvFieldPress talk={talk} call={call} canCall={canCall} />
        </div>
        {talk.near ? (
          <p className="pv-quiet pv-near" data-testid="pv-left">
            {talk.near}
          </p>
        ) : null}
      </form>
    </div>
  );
}
