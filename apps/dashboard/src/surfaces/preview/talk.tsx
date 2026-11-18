"use client";

/**
 * A lead's own preview, its conversation and the field under it (decision 0079; the redesign of 17 November 2026): each
 * line in the order it happened (what they asked, AI's answer with what a live conversation would do with it, a call
 * they made, a thing they told it), then the questions not yet asked and one field, which takes a customer's question
 * or, turned to telling, a thing the business tells it. Every word is contracts' (previews/words.ts).
 */
import type { ReactNode, SyntheticEvent } from "react";
import { LEAD_PREVIEW_WORDS as W, previewMinePath, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { PvThree } from "./head";
import { PvCalled } from "./heard";
import type { Call } from "./use-call";
import type { Talk, TalkLine } from "./use-talk";

/** AI's words: its mark, its name, and the words as the page's own. */
function PvAnswer({ text, at, children }: { text: string; at: number | "greeting"; children?: ReactNode }) {
  return (
    <li className="pv-line" data-testid={at === "greeting" ? "pv-greeting" : `pv-turn-${at}`}>
      <span className="pv-line-by">
        <PvThree />
        {W.it}
      </span>
      <p className="pv-answer">{text}</p>
      {children}
    </li>
  );
}

/** One line of the conversation. `last` is the newest answer, which alone offers Tell it what to say. */
function PvLine({ line, at, last, talk }: { line: TalkLine; at: number; last: boolean; talk: Talk }) {
  if (line.kind === "said")
    return (
      <li className="pv-line" data-mine data-testid={`pv-turn-${at}`}>
        <p className="pv-said">
          <span className="rec-sr">{W.you}: </span>
          {line.text}
        </p>
      </li>
    );
  if (line.kind === "call") return <PvCalled line={line} />;
  if (line.kind === "told")
    return (
      <li className="pv-line" data-testid="pv-told">
        <Panel variant="inset" className="pv-told">
          <span className="pv-told-head">
            <span className="pv-label">{W.toldTitle}</span>
            {talk.lastAsked ? (
              <Button
                variant="soft"
                size="touch"
                disabled={talk.busy}
                onClick={() => void talk.say(talk.lastAsked ?? "")}
                data-testid="pv-ask-again"
              >
                <Icon name="refresh" size={14} />
                {W.askAgain}
              </Button>
            ) : null}
          </span>
          <p className="pv-answer">{line.text}</p>
          <span className="pv-ok">
            <Icon name="check" size={14} />
            {W.toldUses}
          </span>
        </Panel>
      </li>
    );
  return (
    <PvAnswer text={line.text} at={at}>
      {line.then ? (
        <p className="pv-then" data-tone={line.then.tone} data-testid={`pv-then-${at}`}>
          {W.then[line.then.tone]}
        </p>
      ) : null}
      {last && line.then?.tone === "yours" && talk.canTell && !talk.telling ? (
        <Button variant="soft" size="touch" onClick={talk.startTelling} data-testid="pv-tell-what">
          <Icon name="pencil" size={14} />
          {W.tellWhat}
        </Button>
      ) : null}
    </PvAnswer>
  );
}

/** The conversation: nothing until it starts, then its greeting first, as their business, and each line after. */
export function PvTalk({ vm, talk }: { vm: PreviewPageVM; talk: Talk }) {
  if (!talk.lines.length && !talk.busy) return null;
  const newest = talk.lines.findLastIndex((line) => line.kind === "answer");
  return (
    <ol className="pv-talk" role="log" aria-live="polite" data-testid="pv-chat">
      <PvAnswer text={vm.greeting} at="greeting" />
      {talk.lines.map((line, at) => (
        <PvLine key={at} line={line} at={at} last={at === newest} talk={talk} />
      ))}
      {talk.busy && !talk.telling ? (
        <li className="pv-line" data-testid="pv-writing">
          <span className="pv-line-by">
            <PvThree live />
            {W.writing}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

/** Where its messages are all said: what that means, Make it mine beside it, and a call while its minutes last. */
function PvSpent({ token, call }: { token: string; call: Call }) {
  return (
    <Panel className="pv-note" role="status" data-testid="pv-spent">
      <p className="pv-answer">{W.spent}</p>
      <span className="pv-note-acts">
        <Button variant="primary" size="touch" href={previewMinePath(token)}>
          {W.mine}
        </Button>
        {call.used ? null : (
          <Button variant="outline" size="touch" onClick={() => void call.start()}>
            <Icon name="phone" size={14} />
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
        <Icon name="phone" size={16} />
      </Button>
    );
  return (
    <Button
      type="submit"
      variant={words ? "primary" : "soft"}
      size="touch"
      iconOnly
      aria-label={talk.telling ? W.teachSend : W.send}
      disabled={talk.busy || !words}
      data-testid="pv-send"
    >
      <Icon name="arrow-up" size={16} />
    </Button>
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
            aria-label={W.tellingStop}
            onClick={talk.stopTelling}
            data-testid="pv-telling"
          >
            <Icon name="pencil" size={14} />
            {W.telling}
            <Icon name="x" size={12} />
          </Button>
          <span className="pv-quiet">{W.tellingNote}</span>
        </div>
      ) : talk.starters.length ? (
        <>
          <span className="pv-label">{W.tryAsking}</span>
          <div className="pv-starters" data-testid="pv-starters">
            {talk.starters.map((question) => (
              <Button
                key={question}
                variant="soft"
                size="touch"
                disabled={talk.busy}
                onClick={() => void talk.say(question)}
              >
                {question}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <form className="pv-ask" onSubmit={onSend} aria-busy={talk.busy || undefined}>
        <Panel variant="field" className="pv-ask-box">
          <Field
            aria-label={talk.telling ? W.teachLabel : W.textLabel}
            placeholder={talk.telling ? W.teachLabel : W.textLabel}
            rows={1}
            shape="words"
            value={talk.text}
            onValueChange={talk.setText}
            readOnly={talk.busy}
            maxLength={500}
            enterKeyHint="go"
            data-testid="pv-text"
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              void talk.send();
            }}
            {...fieldProblem(talk.problem)}
          />
          <PvFieldPress talk={talk} call={call} canCall={canCall} />
        </Panel>
        {talk.near ? (
          <p className="pv-quiet" data-testid="pv-left">
            {talk.near}
          </p>
        ) : null}
      </form>
    </div>
  );
}
