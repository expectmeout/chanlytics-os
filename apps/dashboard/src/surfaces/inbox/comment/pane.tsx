/**
 * A comment on one of the business's posts, opened in the Inbox (00692; the content loop PRD's 9.2 and 12.4; the journey
 * canvas's Results board, cells 2 to 8, approved by Ruben on 23 Nov 2026): who commented and on which post, the post's
 * picture and caption, their words, and the business's public answer. AI drafts it knowing the post; the owner changes
 * it, asks AI to write it again, sends it, or leaves it. It stands where a conversation stands: beside the list on a
 * desk, the screen on a phone, under the same head. Every sentence is its model's (model/comment-said.ts, commentPageSaid).
 *
 * The one moving thing is the line's ring while Instagram is asked; AI's three while it writes the answer again.
 */
// AI's three at work are Files' own drawing (files/looking.tsx AskLooking): its rules load with the comment's page.
import "../../files/files.css";
import "./comment.css";
import { useState } from "react";
import { addressOf, commentWho, type CommentRowDto } from "@chanlytics/contracts";
import { knownZone } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { EmptyState } from "../../kit/empty/empty";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { AskLooking } from "../../files/looking";
import { appNavigate, gate, type Flash } from "../shell";
import { COMMENT_WORDS as W, commentPageSaid, type CommentPageSaid } from "../model/comment-said";
import { IxWho, threadBack } from "../thread/who";
import { commentStillOf } from "./still";
import { useCommentPage, type CommentPage } from "./use-comment";

/** The initials a face draws for a name: its first two words' first letters. */
const initialsFor = (name: string): string =>
  name
    .replace(/^@/, "")
    .split(/[\s._]+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

/** The post it is under: its picture and its caption. */
function PostOf({ dto }: { dto: CommentRowDto }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="ix-cm-post">
      {broken ? (
        <span className="ix-cm-still" aria-hidden="true" />
      ) : (
        <img className="ix-cm-still" src={commentStillOf(dto.post.file_id)} alt="" onError={() => setBroken(true)} />
      )}
      {dto.post.caption ? <p className="ix-cm-caption">{dto.post.caption}</p> : null}
    </div>
  );
}

/** Where the answer stands, under the comment: on its way (the ring), up, refused, or not told; with its one link. */
function AnswerLine({ said }: { said: CommentPageSaid }) {
  if (!said.line) return null;
  const { line, look } = said;
  return (
    <div className="ix-cm-line" data-tone={line.tone} role="status" data-testid="ix-cm-line">
      <span className="ix-cm-dot" data-moving={line.tone === "live" ? "" : undefined} aria-hidden="true" />
      <span className="ix-cm-line-words">
        <b>{W.under}</b>
        <span>{line.words}</span>
      </span>
      {look ? (
        <a className="ix-cm-look" href={look.href} target="_blank" rel="noreferrer" data-testid="ix-cm-look">
          {look.label}
        </a>
      ) : null}
    </div>
  );
}

/** "Tell AI what to change": the owner's words, then AI writes the answer again into the box. */
function ChangeIt({ page }: { page: CommentPage }) {
  const [open, setOpen] = useState(false);
  const [change, setChange] = useState("");
  if (!open)
    return (
      <LinkButton
        onClick={() => setOpen(true)}
        data-testid="ix-cm-change"
        {...gate("approve", "ask AI to change an answer")}
      >
        {W.change}
      </LinkButton>
    );
  const ask = () =>
    void page.askAgain(change).then((ok) => {
      if (!ok) return;
      setChange("");
      setOpen(false);
    });
  return (
    <div className="ix-cm-change">
      <Field
        aria-label={W.changeAsk}
        rows={2}
        value={change}
        onValueChange={setChange}
        placeholder={W.changeAsk}
        maxLength={500}
        data-testid="ix-cm-change-words"
      />
      <Button
        size="sm"
        onClick={ask}
        disabled={!change.trim() || page.rewrite === "writing"}
        data-testid="ix-cm-change-go"
      >
        {W.changeGo}
      </Button>
    </div>
  );
}

/** The answer: its mark, the box, AI's reason where it has one, and the presses where any may be pressed. */
function Answer({ page, said }: { page: CommentPage; said: CommentPageSaid }) {
  const box = said.box;
  const writing = page.rewrite === "writing";
  const mark = writing ? W.rewriting : said.box?.mark;
  return (
    <Panel
      variant="pane"
      size="sm"
      className="ix-cm-answer"
      data-testid="ix-cm-answer"
      aria-busy={writing || undefined}
    >
      <div className="ix-cm-by" role={writing ? "status" : undefined}>
        <span>{W.yours}</span>
        {mark ? (
          <span className="ix-cm-by-ai">
            {/* One moving thing: the three at work while AI writes, still once it has. The words never move. */}
            {writing ? <AskLooking looking /> : <Icon name="three" size={13} />}
            {mark}
          </span>
        ) : null}
      </div>
      {said.note ? (
        <p className="ix-cm-note" data-testid="ix-cm-note">
          {said.note}
        </p>
      ) : null}
      {page.rewriteCannot ? (
        <p className="ix-cm-note" role="status" data-testid="ix-cm-rewrite-cannot">
          {W.cannot(page.rewriteCannot)}
        </p>
      ) : null}
      {box && box.typed && !writing ? (
        <Field
          aria-label={W.yours}
          className="ix-cm-words"
          rows={4}
          value={page.words}
          onValueChange={page.setWords}
          placeholder={W.placeholder}
          maxLength={2200}
          data-testid="ix-cm-words"
        />
      ) : box && !box.typed ? (
        <p className="ix-cm-sent-words" data-testid="ix-cm-sent-words">
          {box.start}
        </p>
      ) : null}
      {page.rewrite === "failed" ? (
        <p className="ix-cm-note" role="status">
          {W.rewriteFailed}
        </p>
      ) : null}
      <AnswerLine said={said} />
      <Acts page={page} said={said} />
    </Panel>
  );
}

/** What may be pressed: Send (or Send again), Tell AI what to change, the price's way, Leave it, Answer it after all. */
function Acts({ page, said }: { page: CommentPage; said: CommentPageSaid }) {
  if (!said.send && !said.leave && !said.answerAfterAll) return null;
  return (
    <div className="ix-cm-acts">
      {said.send ? (
        <Button
          variant="primary"
          disabled={!page.words.trim() || page.busy !== null || page.rewrite === "writing"}
          onClick={page.send}
          data-testid="ix-cm-send"
          {...gate("approve", "answer a comment")}
        >
          <Icon name="send" size={13} />
          {page.busy === "send" ? W.sending : said.send}
        </Button>
      ) : null}
      {said.change ? <ChangeIt page={page} /> : null}
      {said.addPrice ? (
        <LinkButton onClick={() => appNavigate("admin/workspace")} data-testid="ix-cm-add-price">
          {W.addPrice}
        </LinkButton>
      ) : null}
      {said.leave ? (
        <LinkButton onClick={page.leave} data-testid="ix-cm-leave" {...gate("approve", "leave a comment unanswered")}>
          {W.leave}
        </LinkButton>
      ) : null}
      {said.answerAfterAll ? (
        <Button
          size="sm"
          onClick={page.answerAfterAll}
          data-testid="ix-cm-after-all"
          {...gate("approve", "answer a comment")}
        >
          {W.answerAfterAll}
        </Button>
      ) : null}
    </div>
  );
}

/** The comment's page, in the Inbox's pane. `flash` is the Inbox's toast; `onBack` goes back to the comments. */
export function CommentPane({ id, flash, onBack }: { id: string; flash: (f: Flash) => void; onBack: () => void }) {
  const page = useCommentPage(id, flash, onBack);
  const [now] = useState(() => Date.now());
  const { read } = page;
  if (read.state === "reading")
    return <EmptyState kind="page" glyph="inbox" title={W.reading} body="" testid="ix-cm-reading" />;
  if (read.state === "gone")
    return (
      <EmptyState
        kind="page"
        glyph="inbox"
        title={W.gone.title}
        body={W.gone.body}
        action={{ label: W.gone.act, onClick: onBack }}
        testid="ix-cm-gone"
      />
    );
  if (read.state === "failed")
    return (
      <EmptyState
        kind="page"
        glyph="inbox"
        title={W.unread.title}
        body={W.unread.body}
        action={{ label: W.unread.act, onClick: () => void page.again() }}
        testid="ix-cm-unread"
      />
    );
  const { dto } = read;
  const view = commentPageSaid(dto, dto.post.title, knownZone() ?? "UTC", now);
  const person = commentWho(dto);
  const personTo = dto.contact_id ? addressOf({ kind: "person", id: dto.contact_id }) : null;
  return (
    <section className="ix-thread-pane ix-cm" data-testid="ix-comment" data-stage={view.stage} aria-label={view.head}>
      <header className="ix-th-head">
        <div className="ix-th-head-main">
          {threadBack(onBack)}
          <IxWho
            to={personTo}
            go={(to) => appNavigate(to)}
            who={person.replace(/^@/, "")}
            avatar={initialsFor(person)}
            large
          >
            <div className="ix-th-name">
              <span className="ix-th-name-words">{view.head}</span>
            </div>
            <div className="ix-th-sub">{view.on}</div>
          </IxWho>
        </div>
      </header>
      <div className="ix-cm-body">
        <PostOf dto={dto} />
        <p className="ix-cm-said" data-testid="ix-cm-said">
          {view.words}
        </p>
        <Answer page={page} said={view} />
      </div>
    </section>
  );
}
