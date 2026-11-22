/**
 * A request, opened in the Inbox (00680; the Forms canvas, board Inbox): who asked and through which form, what they
 * answered and how they came, and the reply, AI's draft where the form asks for one, sent by the member's one press.
 * It stands where a conversation stands: beside the list on a desk, the screen on a phone, under the same head.
 *
 * What the reply's card says follows what the send door says can go (use-request.ts): a reply by email, or in the
 * chat they already have while it is open; a number alone waits for their own message; someone who asked not to be
 * messaged is sent nothing, in the door's own words; an address that is not the one on their page waits for a pick.
 * Every open request has two quiet presses under it: answered another way, or not a real request.
 */
// AI's three at work are Files' own drawing (files/looking.tsx AskLooking): its rules load with the request's page.
import "../../files/files.css";
import "./request.css";
import { useState } from "react";
import { addressOf, emailTypoFix, formatPhoneDisplay, type FormRequestDto, type WriteWay } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState } from "../../kit/empty/empty";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { AskLooking } from "../../files/looking";
import { appNavigate, gate, type Flash } from "../shell";
import { IxWho, threadBack } from "../thread/who";
import { useRequestPage, type RequestPage } from "./use-request";
import { REQUEST_WORDS as W, requestCameWords, requestSubline, requestWho } from "./words";

/** The initials a face draws for a name: its first two words' first letters. */
const initialsFor = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

/** What they answered, a line each, then how they can be reached and how they came. */
function Answers({ dto }: { dto: FormRequestDto }) {
  const reachKinds = new Set(["email", "phone"]);
  const name = dto.lines.find((line) => line.kind === "short")?.id;
  const answered = dto.lines.filter((line) => !reachKinds.has(line.kind) && line.id !== name);
  const ways = [dto.reach.email, formatPhoneDisplay(dto.reach.phone)].filter(Boolean).join(" · ");
  return (
    <Panel variant="pane" size="sm" className="ix-rq-said" data-testid="ix-rq-answers">
      <dl className="ix-rq-lines">
        {answered.map((line) => (
          <div key={line.id}>
            <dt>{line.label}</dt>
            <dd>{line.words}</dd>
          </div>
        ))}
        {ways ? (
          <div>
            <dt>{W.reachLabel(!!dto.reach.email, !!dto.reach.phone)}</dt>
            <dd>{ways}</dd>
          </div>
        ) : null}
      </dl>
      <p className="ix-rq-came">{requestCameWords(dto, dto.known)}</p>
    </Panel>
  );
}

/** A card that says why the request waits, and what can be done about it. */
function Waits({
  glyph,
  title,
  body,
  children,
  testid,
}: {
  glyph: string;
  title: string;
  body?: string | null;
  children?: React.ReactNode;
  testid: string;
}) {
  return (
    <Panel variant="inset" size="sm" className="ix-rq-waits" data-testid={testid}>
      <strong>
        <Icon name={glyph} size={13} />
        {title}
      </strong>
      {body ? <p>{body}</p> : null}
      {children ? <div className="ix-rq-acts">{children}</div> : null}
    </Panel>
  );
}

/** Call them, where the request holds a number. */
function CallThem({ phone, primary, label }: { phone: string | null; primary?: boolean; label: string }) {
  if (!phone) return null;
  return (
    <Button size="sm" variant={primary ? "primary" : undefined} href={`tel:${phone}`} data-testid="ix-rq-call">
      <Icon name="phone" size={12} />
      {label}
    </Button>
  );
}

/** Where the reply goes, said over its words: by email to an address, or in the chat they already have. */
const roadWords = (way: WriteWay, to: string | null) =>
  way.wire === "email" ? (
    <>
      {W.draft.byEmail} <b>{to}</b>
    </>
  ) : (
    W.draft.inChat
  );

/** The reply: AI's draft, changed in place, sent by one press. */
function Reply({ page, dto, way }: { page: RequestPage; dto: FormRequestDto; way: WriteWay }) {
  const { draft } = page;
  const writing = draft.state === "writing";
  const to = page.emailTo ?? dto.person?.email ?? dto.reach.email;
  const by = writing
    ? W.draft.writing
    : draft.state === "wrote"
      ? draft.changed
        ? W.draft.changed
        : W.draft.wrote
      : W.draft.own;
  const ai = writing || draft.state === "wrote";
  return (
    <Panel variant="pane" size="sm" className="ix-rq-reply" data-testid="ix-rq-reply" aria-busy={writing || undefined}>
      <div className="ix-rq-by" role={writing ? "status" : undefined}>
        {/* One moving thing: the three at work while AI writes, still once it has. The words never move. */}
        {ai ? (
          <span className="ix-rq-three">{writing ? <AskLooking looking /> : <Icon name="three" size={15} />}</span>
        ) : null}
        <span>{by}</span>
      </div>
      <p className="ix-rq-road">{roadWords(way, to)}</p>
      {writing ? null : (
        <>
          <Field
            aria-label={W.draft.aria}
            className="ix-rq-words"
            rows={7}
            value={draft.text}
            onValueChange={page.setText}
            placeholder={W.draft.placeholder}
            maxLength={4000}
            data-testid="ix-rq-words"
          />
          {draft.state === "failed" ? (
            <p className="ix-rq-note" role="status">
              {W.draft.couldNot}
            </p>
          ) : null}
          <div className="ix-rq-acts">
            <Button
              variant="primary"
              disabled={!draft.text.trim() || page.busy !== null}
              onClick={page.send}
              data-testid="ix-rq-send"
              {...gate("approve", "send a reply")}
            >
              <Icon name="send" size={13} />
              {page.busy === "reply" ? W.draft.sending : W.draft.send}
            </Button>
            <LinkButton onClick={page.askAi} data-testid="ix-rq-ask-ai" {...gate("approve", "ask AI for a reply")}>
              {draft.state === "wrote" ? W.draft.again : W.draft.askAi}
            </LinkButton>
          </div>
        </>
      )}
    </Panel>
  );
}

/** The two quiet presses every open request has. */
function Quiet({ page }: { page: RequestPage }) {
  return (
    <div className="ix-rq-quiet">
      <LinkButton onClick={page.mark} data-testid="ix-rq-mark" {...gate("approve", "mark a request answered")}>
        {W.quiet.mark}
      </LinkButton>
      <LinkButton onClick={page.hold} data-testid="ix-rq-not-real" {...gate("approve", "set a request aside")}>
        {W.quiet.notReal}
      </LinkButton>
    </div>
  );
}

/** An open request's reply, by what the send door says can go. */
function OpenRequest({ page, dto }: { page: RequestPage; dto: FormRequestDto }) {
  const phone = dto.reach.phone;
  const mended = dto.unreached && dto.reach.email ? emailTypoFix(dto.reach.email) : null;
  const bounced = dto.unreached ? (
    <Waits glyph="alert" title={W.unreached.title} body={W.unreached.body} testid="ix-rq-unreached">
      {mended && page.emailTo !== mended ? (
        <Button size="sm" variant="primary" onClick={() => page.pickEmail(mended)} data-testid="ix-rq-mended">
          {W.unreached.sendTo(mended)}
        </Button>
      ) : null}
      <CallThem phone={phone} label={W.phoneOnly.call} />
    </Waits>
  ) : null;
  // A number alone: nothing can be texted to a typed number first.
  if (!dto.reach.email && !dto.person?.email && !page.way)
    return (
      <>
        <Waits glyph="clock" title={W.phoneOnly.title} body={W.phoneOnly.body} testid="ix-rq-phone-only">
          <CallThem phone={phone} primary label={W.phoneOnly.call} />
          <Button
            size="sm"
            onClick={page.mark}
            data-testid="ix-rq-mark"
            {...gate("approve", "mark a request answered")}
          >
            {W.quiet.mark}
          </Button>
        </Waits>
        <div className="ix-rq-quiet">
          <LinkButton onClick={page.hold} data-testid="ix-rq-not-real" {...gate("approve", "set a request aside")}>
            {W.quiet.notReal}
          </LinkButton>
        </div>
      </>
    );
  // Their page holds another address than the one typed: the reply waits for a pick, and nothing is drafted to either.
  if (dto.other_email && dto.person?.email && !page.emailTo)
    return (
      <>
        <Waits
          glyph="mail"
          title={W.otherEmail.title}
          body={W.otherEmail.body(dto.person.email)}
          testid="ix-rq-other-email"
        >
          <Button
            variant="primary"
            onClick={() => page.pickEmail(dto.other_email ?? "")}
            data-testid="ix-rq-pick-typed"
          >
            <span className="ix-rq-pick">
              {dto.other_email}
              <small>{W.otherEmail.typed}</small>
            </span>
          </Button>
          <Button onClick={() => page.pickEmail(dto.person?.email ?? "")} data-testid="ix-rq-pick-page">
            <span className="ix-rq-pick">
              {dto.person.email}
              <small>{W.otherEmail.page}</small>
            </span>
          </Button>
        </Waits>
        <Quiet page={page} />
      </>
    );
  if (page.way)
    return (
      <>
        {bounced}
        <Reply page={page} dto={dto} way={page.way} />
        <Quiet page={page} />
      </>
    );
  // The send door's answer is on its way: the request is readable at once, and nothing is offered before it is known.
  if (page.reach === null && dto.person)
    return (
      <p className="ix-rq-note" role="status">
        {W.reading}
      </p>
    );
  // How to reach them could not be checked: said as the read that failed, with its one act. Never "nothing can be
  // sent", which nobody knows yet. Calling them, and saying it was answered, need no check.
  if (page.unchecked)
    return (
      <>
        <Waits glyph="alert" title={W.unchecked.title} testid="ix-rq-unchecked">
          <Button size="sm" onClick={page.checkAgain} data-testid="ix-rq-check-again">
            {W.unchecked.act}
          </Button>
          <CallThem phone={phone} label={W.cantSend.call} />
          <Button
            size="sm"
            onClick={page.mark}
            data-testid="ix-rq-mark"
            {...gate("approve", "mark a request answered")}
          >
            {W.quiet.mark}
          </Button>
        </Waits>
        <div className="ix-rq-quiet">
          <LinkButton onClick={page.hold} data-testid="ix-rq-not-real" {...gate("approve", "set a request aside")}>
            {W.quiet.notReal}
          </LinkButton>
        </div>
      </>
    );
  // Nothing can go: said in the door's own words (they asked not to be messaged, an address that bounced before).
  return (
    <>
      <Waits glyph="alert" title={W.cantSend.title} body={page.why} testid="ix-rq-cant-send">
        <CallThem phone={phone} label={W.cantSend.call} />
        <Button size="sm" onClick={page.mark} data-testid="ix-rq-mark" {...gate("approve", "mark a request answered")}>
          {W.quiet.mark}
        </Button>
      </Waits>
      <div className="ix-rq-quiet">
        <LinkButton onClick={page.hold} data-testid="ix-rq-not-real" {...gate("approve", "set a request aside")}>
          {W.quiet.notReal}
        </LinkButton>
      </div>
    </>
  );
}

/** A request that is no longer open: answered and by what, held and why, or a test. */
function Settled({ page, dto }: { page: RequestPage; dto: FormRequestDto }) {
  if (dto.standing === "held")
    return (
      <Waits
        glyph="eye"
        title={W.held.title}
        body={`${dto.held_why ? W.held.why[dto.held_why] : ""} ${W.held.left}`.trim()}
        testid="ix-rq-held"
      >
        <Button
          size="sm"
          variant="primary"
          onClick={page.letThrough}
          disabled={page.busy !== null}
          data-testid="ix-rq-let-through"
          {...gate("approve", "let a request through")}
        >
          {W.held.letThrough}
        </Button>
      </Waits>
    );
  if (dto.standing === "test") return <Waits glyph="eye" title={W.test.title} body={W.test.body} testid="ix-rq-test" />;
  const how = dto.answered?.how ?? "marked";
  const thread = dto.answered?.conversation_id;
  return (
    <Waits glyph="check" title={W.answered[how]} body="" testid="ix-rq-answered">
      {thread ? (
        <Button
          size="sm"
          onClick={() => appNavigate(addressOf({ kind: "conversation", id: thread, in: "inbox" }))}
          data-testid="ix-rq-thread"
        >
          {W.answered.open}
        </Button>
      ) : null}
      {how === "marked" ? (
        <LinkButton onClick={page.unmark} data-testid="ix-rq-unmark" {...gate("approve", "open a request again")}>
          {W.answered.reopen}
        </LinkButton>
      ) : null}
    </Waits>
  );
}

/** The request's page, in the Inbox's pane. `flash` is the Inbox's toast; `onBack` goes back to its list. */
export function RequestPane({ id, flash, onBack }: { id: string; flash: (f: Flash) => void; onBack: () => void }) {
  const page = useRequestPage(id, flash, onBack);
  const [now] = useState(() => Date.now());
  const { read } = page;
  if (read.state === "reading")
    return <EmptyState kind="page" glyph="inbox" title={W.reading} body="" testid="ix-rq-reading" />;
  if (read.state === "gone")
    return (
      <EmptyState
        kind="page"
        glyph="inbox"
        title={W.gone.title}
        body={W.gone.body}
        action={{ label: W.gone.act, onClick: onBack }}
        testid="ix-rq-gone"
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
        testid="ix-rq-unread"
      />
    );
  const { dto } = read;
  const person = requestWho(dto);
  const personTo = dto.person ? addressOf({ kind: "person", id: dto.person.id }) : null;
  return (
    <section className="ix-thread-pane ix-rq" data-testid="ix-request" aria-label={`${person}: ${dto.heading}`}>
      <header className="ix-th-head">
        <div className="ix-th-head-main">
          {threadBack(onBack)}
          <IxWho to={personTo} go={(to) => appNavigate(to)} who={person} avatar={initialsFor(person)} large>
            <div className="ix-th-name">
              <span className="ix-th-name-words">{person}</span>
            </div>
            <div className="ix-th-sub">{requestSubline(dto, now)}</div>
          </IxWho>
        </div>
      </header>
      <div className="ix-rq-body">
        <Answers dto={dto} />
        {dto.standing === "open" ? <OpenRequest page={page} dto={dto} /> : <Settled page={page} dto={dto} />}
      </div>
    </section>
  );
}
