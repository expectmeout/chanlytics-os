/**
 * An answer's words as the Line draws them (contracts answerBlocks, answerRuns): paragraphs, headings, lists, a table, a
 * customer's words quoted, a callout. Nothing the model wrote is ever drawn as markup.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import type { AnswerBlock, AnswerList, AnswerRun, AskAnswer } from "@chanlytics/contracts";
import { Icon } from "../kit/icon/icon";
import { LinePress } from "../kit/line/line";
import { askCalls } from "./shell";

// A line of the answer's words as runs (contracts answerRuns): bold, italic or plain, each one text, and a door where
// the run names a row the turn read (its route the normaliser's, never the model's). A door opens only on an answer that
// landed (`onNav`): a streaming one draws its words. Nothing the model wrote is ever drawn as markup.
/** A door a run may open: only on an answer that landed. */
type OnNav = ((to: string) => void) | null;

const AskRuns = ({ runs, onNav = null }: { runs: AnswerRun[]; onNav?: OnNav }) =>
  runs.map((r, k) =>
    r.to && onNav ? (
      <LinePress key={k} kind="words" onClick={() => onNav(r.to as string)} data-testid="ask-words-door">
        {r.bold ? <strong>{r.text}</strong> : r.text}
      </LinePress>
    ) : r.bold ? (
      <strong key={k}>{r.text}</strong>
    ) : r.italic ? (
      <em key={k}>{r.text}</em>
    ) : (
      <Fragment key={k}>{r.text}</Fragment>
    ),
  );
// A quote's or a callout's lines, a paragraph each.
const AskLines = ({ lines, onNav }: { lines: AnswerRun[][]; onNav?: OnNav }) =>
  lines.map((l, i) => (
    <p key={i}>
      <AskRuns runs={l} onNav={onNav} />
    </p>
  ));
const atRuns = (s: string): AnswerRun[] => {
  const A = askCalls();
  return A && A.answerRuns ? A.answerRuns(s) : [{ text: s }];
};

// A list in the answer's words, nested up to three deep as the words wrote it.
const AskWordsList = ({ list, onNav }: { list: AnswerList; onNav?: OnNav }) => {
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag className="ask-words-list" start={list.ordered && list.start ? list.start : undefined}>
      {list.items.map((it, k) => (
        <li key={k}>
          <AskRuns runs={it.runs} onNav={onNav} />
          {it.sub ? <AskWordsList list={it.sub} onNav={onNav} /> : null}
        </li>
      ))}
    </Tag>
  );
};

// The answer's words as the Line draws them (contracts answerBlocks): paragraphs with each line its own, a heading over a
// part, lists, a table that scrolls sideways where it is wider than the answer, a customer's words quoted, and a callout
// for what must come first. A streaming answer's cursor follows its last block. Without the bridge (the mockup) the words
// are one paragraph, as they always were.
export const AskWords = ({
  text,
  className,
  cursor = null,
  onNav = null,
}: {
  text: string;
  className: string;
  cursor?: ReactNode;
  onNav?: OnNav;
}) => {
  const A = askCalls();
  const blocks: AnswerBlock[] = A && A.answerBlocks ? A.answerBlocks(text) : [{ kind: "text", lines: [[{ text }]] }];
  const last = blocks.length - 1;
  return (
    <div className={`ask-words ${className}`} data-testid="ask-words">
      {blocks.map((b, k) => {
        const tail = k === last ? cursor : null;
        if (b.kind === "heading")
          return (
            <h4 key={k} className="ask-words-head">
              <AskRuns runs={b.runs} onNav={onNav} />
              {tail}
            </h4>
          );
        if (b.kind === "list")
          return (
            <Fragment key={k}>
              <AskWordsList list={b.list} onNav={onNav} />
              {tail}
            </Fragment>
          );
        if (b.kind === "quote")
          return (
            <blockquote key={k} className="ask-words-quote" data-testid="ask-words-quote">
              <AskLines lines={b.lines} onNav={onNav} />
              {tail}
            </blockquote>
          );
        if (b.kind === "callout")
          return (
            <div key={k} className="ask-words-callout" data-tone={b.tone} data-testid="ask-words-callout">
              <Icon name={b.tone === "warn" ? "alert" : "info"} size={14} />
              <div className="ask-words-callout-words">
                <AskLines lines={b.lines} onNav={onNav} />
                {tail}
              </div>
            </div>
          );
        if (b.kind === "table")
          return (
            <div key={k} className="ask-words-table" data-testid="ask-words-table">
              <table>
                <thead>
                  <tr>
                    {b.head.map((c, i) => (
                      <th key={i} className={b.right[i] ? "ask-words-num" : undefined}>
                        <AskRuns runs={c} onNav={onNav} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, i) => (
                        <td key={i} className={b.right[i] ? "ask-words-num" : undefined}>
                          <AskRuns runs={c} onNav={onNav} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {tail}
            </div>
          );
        return (
          <p key={k}>
            {b.lines.map((l, i) => (
              <Fragment key={i}>
                {i ? <br /> : null}
                <AskRuns runs={l} onNav={onNav} />
              </Fragment>
            ))}
            {tail}
          </p>
        );
      })}
    </div>
  );
};

// What they asked to see as a list, and steps to follow (contracts AskList): a real list, numbered for steps, the page's
// own bullet, or one entry to a line with no mark; the entries never carry a mark of their own (normalizeAnswer), and
// keep the emphasis they were written with.
export const AskListPart = ({ l }: { l: AskAnswer["show"]["list"] }) => {
  const Tag = l.style === "numbers" ? "ol" : "ul";
  return (
    <Tag className={`ask-list ${l.style}`} data-testid="ask-list" data-style={l.style}>
      {l.entries.map((e, k) => (
        <li key={k}>
          <AskRuns runs={atRuns(e)} />
        </li>
      ))}
    </Tag>
  );
};
