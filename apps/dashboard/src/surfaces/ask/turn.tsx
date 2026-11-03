/**
 * One answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, Show and Do, each
 * beside one of the three's own squares on a rail (the stage's spec, S3), lightest to darkest; a figure as a tile with its
 * receipt inside; the rows it names as their own doors; the next step once; and the cards, which approve, edit, wait or undo
 * through the verbs' own routes. What an answer shows is decided by the contract (askCalls().answer: the answer and one door
 * per place); this file only draws.
 */
import { useState } from "react";
import { cardsTogether, wordsLessHolds } from "@chanlytics/contracts";
import type {
  AskAnswer as Answer,
  AskFigure as Figure,
  AskItem,
  AskLanguage,
  AskMessageVM,
  AskProposal,
  AskProposalOutcome,
} from "@chanlytics/contracts";
import type { AskApi } from "@/legacy-bridge/ask";
import { Button } from "../kit/button/button";
import { AskFace } from "../kit/face/ask-face";
import { Icon } from "../kit/icon/icon";
import { LinePress } from "../kit/line/line";
import { AskWords, AskListPart } from "./answer-words";
import { AskCards, AskPlan } from "./card";
import { askKindGlyph } from "./card-parts";
import { AskBreakdown, AskChart } from "./home";
import type { DrawnAnswer, FoldedTurn, LineMove, LineTurn, LiveSay } from "./line/types";
import { askCalls } from "./shell";
import type { LineWords } from "./words";

/** Where an answer's parts go: a door, a next question, and what a card became. */
interface AnswerDoors {
  t: LineWords;
  onNav: (to: string) => void;
  onFollow: (q: string) => unknown;
  onOutcome?: (messageId: string, pid: string, o: AskProposalOutcome) => void;
  onEdit?: (text?: string) => void;
}
/** How a list is marked, and its entries. */
type AskList = Answer["show"]["list"];
/** Show as a part draws it: a list of none while the answer is written. */
type ShowOf = { show: Omit<Answer["show"], "list"> & { list: AskList | null } };
/** A move's id and class, on the answer the keys walk. */
type MoveProps = (me: number, cls: string) => { id?: string; className?: string };

/** An answer no client can shape (the mockup, a test): its words, as prose. */
const atProse = (m: AskMessageVM | null | undefined, lang: AskLanguage | undefined): Answer => ({
  v: 2,
  form: "prose",
  say: { headline: "", detail: (m && m.text) || "" },
  show: { figures: [], items: [], breakdown: null, list: { style: "bullets", entries: [] } },
  do: { open: null, next: [] },
  language: lang || "en",
});

/**
 * The rows the keys walk under an answer, in the order they are drawn: the items that are doors (one door drew a later
 * item to the same place without one), then Open, then the next questions.
 */
export const answerMoves = (a: Answer): LineMove[] => [
  ...a.show.items.filter((it) => it.source.door !== false).map((it): LineMove => ({ type: "item", to: it.source.to })),
  ...(a.do.open ? [{ type: "open", to: a.do.open.to } as const] : []),
  ...a.do.next.map((q): LineMove => ({ type: "next", q })),
];
// The newest answer's next questions, less any the conversation already asked or an earlier answer of it already
// offered: one offered again under every answer reads as Ask not listening (Ruben's recording, 16 Oct 2026). They are
// the last of answerMoves' order, so dropping one moves no other move's place.
const atAsked = (s: string | null | undefined) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export const freshNext = (A: AskApi, drawn: DrawnAnswer, turns: LineTurn[]): DrawnAnswer => {
  const seen = new Set<string>();
  turns.forEach((tn, k) => {
    if (tn.q) seen.add(atAsked(tn.q.text));
    if (tn.a && k < turns.length - 1) for (const q of A.answer(tn.a).answer.do.next) seen.add(atAsked(q));
  });
  const next = drawn.answer.do.next.filter((q) => !seen.has(atAsked(q)));
  return next.length === drawn.answer.do.next.length
    ? drawn
    : { ...drawn, answer: { ...drawn.answer, do: { ...drawn.answer.do, next } } };
};
// A figure as one line: the value, what it counts, how it moved. Where it comes from is the value's tooltip, and a press
// on the value opens it on a line of its own, with a door only where oneDoor left it one (spec S4). A pointer resting
// on the line changes nothing on it, so the answer never shifts under the mouse (ask.css).
const AskFigure = ({
  f,
  open,
  onToggle,
  t,
  onNav,
}: {
  f: Figure;
  open: boolean;
  onToggle: () => void;
  t: LineWords;
  onNav: (to: string) => void;
}) => (
  <div className={`ask-tile${open ? " open" : ""}`} data-testid="ask-tile">
    {f.source ? (
      <LinePress
        kind="figure"
        aria-expanded={open}
        onClick={onToggle}
        title={`${t.from} ${f.source.label}`}
        data-testid="ask-figure"
      >
        {f.value}
      </LinePress>
    ) : (
      <span className="line-figure plain">{f.value}</span>
    )}
    <span className="ask-tile-label">{f.label}</span>
    {f.note ? <span className="ask-tile-note">{f.note}</span> : null}
    {f.source ? (
      <span className="ask-tile-from" data-open={open ? "true" : "false"} data-testid="ask-tile-from">
        {t.from} {f.source.label}
        {f.source.door ? (
          <LinePress
            kind="door"
            onClick={() => f.source && onNav(f.source.to)}
            aria-label={t.open}
            title={t.open}
            data-testid="ask-tile-door"
          >
            <Icon name="arrow-right" size={11} />
          </LinePress>
        ) : null}
      </span>
    ) : null}
  </div>
);
// Show: the list they asked for, the whole in its parts, the figures, the rows it names, each row a move the keys walk
// (`itemMove`, its place in answerMoves' order, or -1 for a row drawn without a door). An answer stored before the list
// part has none. A numbered list of rows is its items, numbered in their marks (the list's style with no entries).
const AskShow = ({
  a,
  itemMove,
  moveProps,
  t,
  onNav,
}: {
  a: ShowOf;
  itemMove: number[];
  moveProps: MoveProps;
  t: LineWords;
  onNav: (to: string) => void;
}) => {
  const [receipt, setReceipt] = useState(-1);
  const list: AskList = a.show.list || { style: "bullets", entries: [] };
  const numbered = list.style === "numbers" && !list.entries.length;
  // A row's kind as the mark before it (askKindGlyph), or its place in a numbered list; a row that is a door ends in a chevron.
  const itemBody = (it: AskItem, k: number) => (
    <>
      <span className="ask-item-mark" data-testid="ask-item-mark">
        {numbered ? k + 1 : <Icon name={askKindGlyph(it.source.kind)} size={12} />}
      </span>
      <span className="ask-item-body">
        <span className="ask-item-top">
          <span className="ask-item-title">{it.title}</span>
          {it.meta ? <span className="ask-item-meta">{it.meta}</span> : null}
        </span>
        {it.line ? <span className="ask-item-line">{it.line}</span> : null}
      </span>
      {it.source.door !== false ? <Icon name="chevron" size={12} className="ask-item-chev" /> : null}
    </>
  );
  return (
    <div className="ask-part show" data-testid="ask-show">
      <div className="ask-show">
        {list.entries.length ? <AskListPart l={list} /> : null}
        {a.show.breakdown ? <AskBreakdown b={a.show.breakdown} t={t} onNav={onNav} /> : null}
        {a.show.chart ? <AskChart c={a.show.chart} t={t} onNav={onNav} /> : null}
        {a.show.figures.length ? (
          <div className="ask-figures">
            {a.show.figures.map((f, k) => (
              <AskFigure
                key={k}
                f={f}
                open={receipt === k}
                onToggle={() => setReceipt(receipt === k ? -1 : k)}
                t={t}
                onNav={onNav}
              />
            ))}
          </div>
        ) : null}
        {a.show.items.length ? (
          <div className="ask-items">
            {a.show.items.map((it, k) =>
              itemMove[k] >= 0 ? (
                <LinePress
                  key={k}
                  kind="row"
                  {...moveProps(itemMove[k], "ask-item")}
                  onClick={() => onNav(it.source.to)}
                  data-testid="ask-item"
                >
                  {itemBody(it, k)}
                </LinePress>
              ) : (
                <div key={k} className="line-item plain ask-item" data-testid="ask-item">
                  {itemBody(it, k)}
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// The answer: Say (the headline, or a prose answer's words), Show (the list they asked for, the whole in its parts, the
// figures, the rows it names, numbered when they asked for a numbered list of them), Do (the cards, then one row: Try
// again, Open as the kit's button, the next questions as chips). `walk`: this
// is the answer the keys walk, whose moves carry the ids the line points at (answerMoves' order) and `sel` is the one
// they stand on; a folded answer has none. `next`: whether the next questions are drawn in the answer: a phone's thread
// draws the newest answer's over its field (AskNextRow), or under its cards where it has any, and an earlier answer's
// nowhere (the spec 2026-09-27-ask-chat-on-a-phone, D6, as decision 0088 amends it).
export const AskAnswer = ({
  answer,
  cardOpen,
  cards,
  messageId,
  retry,
  walk = false,
  sel = -1,
  next = true,
  t,
  onNav,
  onFollow,
  onOutcome,
  onEdit,
}: AnswerDoors & {
  answer: Answer;
  cardOpen?: Record<string, boolean>;
  cards?: AskProposal[];
  messageId?: string | null;
  retry?: (() => void) | null;
  walk?: boolean;
  sel?: number;
  next?: boolean;
}) => {
  const a = answer;
  const nexts = next ? a.do.next : [];
  // What holds a card waiting is the card's to say, read before its press: the answer does not say it again.
  const detail = wordsLessHolds(a.say.detail, cards || []);
  const listed = !!(a.show.list && a.show.list.entries.length);
  const hasShow =
    a.show.figures.length > 0 || a.show.items.length > 0 || !!a.show.breakdown || !!a.show.chart || listed;
  const hasDo = !!a.do.open || nexts.length > 0 || (cards && cards.length > 0) || !!retry;
  // Each move's place in answerMoves' order: the items that are doors, then Open, then the next questions.
  let doors = 0;
  const itemMove = a.show.items.map((it) => (it.source.door !== false ? doors++ : -1));
  const openAt = doors;
  const nextAt = openAt + (a.do.open ? 1 : 0);
  const moveProps: MoveProps = (me, cls) =>
    walk ? { id: `ask-move-${me}`, className: `${cls}${sel === me ? " sel" : ""}` } : { className: cls };
  return (
    <div className="ask-answer" data-testid="ask-answer">
      <div className="ask-part say" data-testid="ask-say">
        <div className="ask-say">
          {a.say.headline ? <p className="ask-headline">{a.say.headline}</p> : null}
          {detail ? (
            <AskWords text={detail} className={a.say.headline ? "ask-detail" : "ask-prose"} onNav={onNav} />
          ) : null}
        </div>
      </div>
      {hasShow ? <AskShow a={a} itemMove={itemMove} moveProps={moveProps} t={t} onNav={onNav} /> : null}
      {hasDo ? (
        <div className="ask-part do" data-testid="ask-do">
          <div className="ask-do">
            {/* A plan's cards are one group, where its first card stood, and the cards of no plan beside each other another (contracts cardsTogether). */}
            {cardsTogether(cards || []).map((g) =>
              "plan" in g ? (
                <AskPlan
                  key={`plan:${g.plan[0].plan?.id}`}
                  cards={g.plan}
                  messageId={messageId}
                  t={t}
                  onNav={onNav}
                  onOutcome={onOutcome}
                  onEdit={onEdit}
                  cardOpen={cardOpen}
                />
              ) : (
                <AskCards
                  key={g.cards.at(0)?.id}
                  cards={g.cards}
                  messageId={messageId}
                  t={t}
                  onNav={onNav}
                  onOutcome={onOutcome}
                  onEdit={onEdit}
                  cardOpen={cardOpen}
                />
              ),
            )}
            {retry || a.do.open || nexts.length ? (
              <div className="ask-do-row">
                {retry ? (
                  <Button className="ask-retry" onClick={retry} data-testid="ask-retry">
                    {t.tryAgain}
                  </Button>
                ) : null}
                {a.do.open ? (
                  <Button
                    {...moveProps(openAt, "ask-open")}
                    onClick={() => a.do.open && onNav(a.do.open.to)}
                    data-testid="ask-open"
                  >
                    <Icon name="arrow-right" size={14} />
                    {a.do.open.label}
                  </Button>
                ) : null}
                {/* A long question ends in an ellipsis inside its chip. */}
                {nexts.map((q, k) => (
                  <LinePress
                    key={q}
                    kind="next"
                    {...moveProps(nextAt + k, "ask-next")}
                    onClick={() => onFollow(q)}
                    data-testid="ask-next"
                  >
                    <span>{q}</span>
                  </LinePress>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// Show as it closes while the answer is written (`say.show`, contracts answer-stream.ts answerSoFar), drawn by the
// answer's own part: no row a door and no figure a receipt until the final lands; nothing before a figure or a row has.
const AskShowSoFar = ({ say, t, onNav }: { say?: LiveSay | null; t: LineWords; onNav: (to: string) => void }) =>
  say && say.show ? (
    <AskShow
      a={{
        show: {
          figures: say.show.figures.map((f) => ({ ...f, source: null })),
          items: say.show.items.map((it) => ({ ...it, source: { ...it.source, door: false } })),
          breakdown: null,
          list: null,
        },
      }}
      itemMove={say.show.items.map(() => -1)}
      moveProps={() => ({})}
      t={t}
      onNav={onNav}
    />
  ) : null;

// A turn: the question over it, then the answer. While it streams, Say as written so far (`say`: the headline, then
// the detail, as the answer draws them) or a v1 turn's words, with a cursor after the last, and Show's figures and rows
// as each closes (`say.show`, grounded on the server: contracts answer-stream.ts), drawn by AskShow but not yet doors;
// Do waits for the final message (spec 7.4), and the Line says the answer once it is whole, not every piece (spec
// 6.10). A failed turn says why and, on the latest only, offers Try again (N20). A quick answer (no model) is drawn the same way, from `quick`.
export const AskTurn = ({
  m,
  q,
  quick,
  say,
  latest = false,
  streaming = false,
  walk = false,
  sel = -1,
  next = true,
  t,
  lang,
  onFollow,
  onNav,
  onRetry,
  onOutcome,
  onEdit,
}: AnswerDoors & {
  m: AskMessageVM | null;
  q?: string;
  quick?: Answer;
  say?: LiveSay | null;
  latest?: boolean;
  streaming?: boolean;
  walk?: boolean;
  sel?: number;
  next?: boolean;
  lang?: AskLanguage;
  onRetry?: () => void;
}) => {
  const A = askCalls();
  if (streaming) {
    const cursor = <span className="ask-cursor" />;
    return (
      <div className="ask-turn streaming" data-testid="ask-turn">
        {q ? <p className="ask-turn-q">{q}</p> : null}
        <div className="ask-part say" data-testid="ask-say">
          {say ? (
            <div className="ask-say">
              {say.headline ? (
                <p className="ask-headline">
                  {say.headline}
                  {say.detail ? null : cursor}
                </p>
              ) : null}
              {say.detail ? (
                <AskWords text={say.detail} className={say.headline ? "ask-detail" : "ask-prose"} cursor={cursor} />
              ) : null}
            </div>
          ) : (
            <p className="ask-prose">
              {m?.text}
              {cursor}
            </p>
          )}
        </div>
        <AskShowSoFar say={say} t={t} onNav={onNav} />
      </div>
    );
  }
  const drawn: DrawnAnswer = quick
    ? { answer: quick, cardOpen: {} }
    : A && A.answer
      ? A.answer(m as AskMessageVM)
      : { answer: atProse(m, lang), cardOpen: {} };
  const failed = !!(m && m.failed);
  return (
    <div className={`ask-turn${failed ? " failed" : ""}${latest ? " latest" : ""}`} data-testid="ask-turn">
      {q ? <p className="ask-turn-q">{q}</p> : null}
      <AskAnswer
        answer={drawn.answer}
        cardOpen={drawn.cardOpen}
        cards={m && !failed ? m.proposals || [] : []}
        messageId={m ? m.id : null}
        retry={failed && latest && onRetry ? onRetry : null}
        walk={walk}
        sel={sel}
        next={next}
        t={t}
        onNav={onNav}
        onFollow={onFollow}
        onOutcome={onOutcome}
        onEdit={onEdit}
      />
      {m && m.ungrounded ? (
        <div className="ask-unverified">
          <Icon name="alert" size={11} /> {t.unverified}
        </div>
      ) : null}
    </div>
  );
};

// ---- A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md) ----------------------------

// A question in a phone's thread (D2): the person's own words at the right, in the Inbox's sent bubble. The newest
// carries the id the thread stands at its top (D5, hooks.ts useAskPin).
export const AskQuestion = ({ text, now = false }: { text: string; now?: boolean }) => (
  <p className="ask-q" id={now ? "ask-now-q" : undefined} data-testid="ask-q">
    {text}
  </p>
);

// A phone's earlier turns, each in full (D1): its question, then its answer with its cards as they were left and its
// Open, and no next questions (D6: they are the newest answer's). What a card became is kept on the conversation
// (`onOutcome`), so a card drawn again here never offers Send twice.
export const AskThread = ({
  turns,
  t,
  lang,
  onNav,
  onFollow,
  onOutcome,
  onEdit,
}: AnswerDoors & { turns: FoldedTurn[]; lang?: AskLanguage }) => (
  <div className="ask-thread" data-testid="ask-thread">
    {turns.map((tn, k) => (
      <div key={tn.q.id || k} className="ask-thread-turn">
        <AskQuestion text={tn.q.text} />
        <AskTurn
          m={tn.a}
          next={false}
          t={t}
          lang={lang}
          onNav={onNav}
          onFollow={onFollow}
          onOutcome={onOutcome}
          onEdit={() => onEdit?.(tn.q.text)}
        />
      </div>
    ))}
  </div>
);

// The newest answer's next questions over a phone's field (D6): one row that scrolls sideways, so a long question is
// never cut to an ellipsis. Each keeps the id the keys walk (answerMoves' order), as it had inside the answer.
export const AskNextRow = ({
  answer,
  sel = -1,
  onFollow,
}: {
  answer: Answer;
  sel?: number;
  onFollow: (q: string) => unknown;
}) => {
  const first = answerMoves(answer).findIndex((mv) => mv.type === "next");
  if (first < 0) return null;
  return (
    <div className="ask-next-row" data-testid="ask-next-row">
      {answer.do.next.map((q, k) => (
        <LinePress
          key={q}
          kind="next"
          id={`ask-move-${first + k}`}
          selected={sel === first + k}
          className="ask-next"
          onClick={() => onFollow(q)}
          data-testid="ask-next"
        >
          <span>{q}</span>
        </LinePress>
      ))}
    </div>
  );
};

// The three come forward to listen (D4): over a phone's field while it is in use in a conversation, or while a held
// mic listens, with the words heard. The thread's own face is hidden meanwhile (ask.css `.ask-line-body.dim`): one
// character on the screen.
export const AskListen = ({ heard }: { heard: string }) => (
  <div className="ask-listen" data-testid="ask-listen">
    <span className="ask-listen-stage">
      <AskFace className="ask-hero-canvas" testId="ask-listen-face" />
    </span>
    {heard ? (
      <p className="ask-heard" aria-live="polite">
        {heard}
      </p>
    ) : null}
  </div>
);

// Latest (D7): scrolled up past the newest question, a pill over the field with the three's still mark (a second live
// canvas would be a second character) stands the newest question at the top again.
export const AskLatest = ({ t, overNext, onPress }: { t: LineWords; overNext: boolean; onPress: () => void }) => (
  <LinePress
    kind="latest"
    className="ask-latest"
    data-over-next={overNext ? "1" : "0"}
    onClick={onPress}
    data-testid="ask-latest"
  >
    <Icon name="three" size={13} />
    {t.latest}
  </LinePress>
);
