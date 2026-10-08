/**
 * The new conversation sheet (a conversation begins from the Inbox, the design's 4.2): who it is for, then the plan and
 * the words, or a call's brief. The kit's Sheet at every width: a pane beside the page on a desk, from the bottom edge
 * on a phone, its foot holding the act. What is written is kept in the tab, and closing over it asks once (state.ts).
 * Its state is state.ts's and its calls verbs.ts's; every word is contracts' (NEW_CONVERSATION_WORDS).
 *
 * It works with no model: the words are the member's to write, and Ask is one press that fills them.
 *
 * It draws the kit's Button, Field, Icon, LinkButton, Segmented, Select, Sheet and Switch, and nothing of the record kit
 * (kit/record) or of People's pages: state.ts says what either costs four other pages.
 */
import {
  DRAFT_ABOUT_MAX,
  DRAFT_ANSWER_MAX,
  NEW_CONVERSATION_WORDS as W,
  type PersonReachDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Segmented } from "../../kit/segmented/segmented";
import { Sheet } from "../../kit/sheet/sheet";
import { gate } from "../shell";
import { NewCall } from "./call";
import { NewMessage } from "./message";
import { useNewConversationSheet } from "./state";
import type { Opened, SheetState } from "./state";
import { NewWho } from "./who";

/** Who it is for, once picked: their name and how they are reached, their thread where they have one, and a way to change. */
function forWho(s: SheetState, reach: PersonReachDto) {
  const { person, thread } = reach;
  return (
    <div className="ix-new-who" data-testid="ix-new-for">
      <strong>{person.name}</strong>
      <span className="ix-new-said">{[person.phone, person.email].filter(Boolean).join(" · ")}</span>
      {thread ? (
        <LinkButton onClick={() => s.goTo(`inbox/${thread}`)} data-testid="ix-new-thread">
          {W.thread}
        </LinkButton>
      ) : null}
      <LinkButton onClick={s.changeWho} data-testid="ix-new-change">
        {W.change}
      </LinkButton>
    </div>
  );
}

/** What it is about, and Ask's one press: the words for a message the wire carries, or a call's brief. */
function aboutPart(s: SheetState) {
  const { written, ask, how, way } = s;
  // Where only an approved message can go there are no words for Ask to write: the plan is still the receptionist's note.
  const askable = how === "call" || (!!way && way.carries === "words");
  return (
    <section className="ix-new-part">
      <Field
        label={W.about.label}
        hint={W.about.hint}
        rows={2}
        value={written.about}
        onValueChange={(about) => s.patch({ about })}
        maxLength={DRAFT_ABOUT_MAX}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the plan is the next thing to write once a person is picked
        autoFocus
        data-testid="ix-new-about"
      />
      {askable ? (
        <div className="ix-new-acts">
          <Button
            size="sm"
            disabled={!written.about.trim() || ask.asked.busy}
            onClick={() => void ask.write()}
            data-testid="ix-new-write"
          >
            <Icon name="sparkle" size={12} />
            {ask.asked.busy ? W.write.writing : how === "call" ? W.write.brief : W.write.message}
          </Button>
          {ask.asked.error ? (
            <span className="ix-new-said" role="alert" data-testid="ix-new-ask-error">
              {ask.asked.error}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** What Ask needs to know before it writes: each question a field, answered and asked again. */
function asksPart(s: SheetState) {
  const { asks } = s.ask.asked;
  if (!asks.length) return null;
  return (
    <section className="ix-new-part" data-testid="ix-new-asks">
      <p className="ix-new-lead">{W.asks}</p>
      {asks.map((a) => (
        <Field
          key={a.key}
          label={a.question}
          value={s.written.answers[a.key] ?? ""}
          onValueChange={(words) => s.patch({ answers: { ...s.written.answers, [a.key]: words } })}
          maxLength={DRAFT_ANSWER_MAX}
          data-testid={`ix-new-ask-${a.key}`}
        />
      ))}
    </section>
  );
}

/** Step two: the plan and the words, or the brief. Said plainly while the person's reach is read, and where it was not. */
function planStep(s: SheetState) {
  const { reach } = s;
  if (!reach || reach.state === "reading")
    return (
      <p className="ix-new-said" role="status" data-testid="ix-new-reading">
        {W.reading}
      </p>
    );
  if (reach.state === "failed")
    return (
      <div className="ix-new" data-testid="ix-new-unread">
        <p className="ix-new-said" role="alert">
          {reach.message}
        </p>
        <div className="ix-new-acts">
          <LinkButton onClick={s.changeWho}>{W.change}</LinkButton>
        </div>
      </div>
    );
  return (
    <div className="ix-new" data-testid="ix-new-plan">
      {forWho(s, reach.reach)}
      <Segmented
        label={W.how.label}
        value={s.how}
        onValueChange={s.setHow}
        options={[
          { value: "message", label: W.how.message, testid: "ix-new-how-message" },
          { value: "call", label: W.how.call, testid: "ix-new-how-call" },
        ]}
      />
      {aboutPart(s)}
      {asksPart(s)}
      {s.how === "call" ? <NewCall s={s} reach={reach.reach} /> : <NewMessage s={s} reach={reach.reach} />}
    </div>
  );
}

/** The sheet's foot: what a send left unsaid with the door on, the one question, or Cancel and the act. */
function foot(s: SheetState) {
  if (s.sent) {
    const { thread, words } = s.sent;
    return (
      <div className="ix-new-foot">
        <span className="ix-new-say" role="status" data-testid="ix-new-sent">
          {words}
        </span>
        <Button variant="primary" onClick={() => s.goTo(thread)} data-testid="ix-new-open-thread">
          {W.thread}
        </Button>
      </div>
    );
  }
  // Closing over words asks once, where the act was: the kit's one question about what was typed and not sent
  // (Confirm, `discard`), which a sheet's foot lays out as the question over an equal pair. Its Yes is red words and
  // never the red fill: nothing kept is destroyed.
  if (s.work.asking)
    return (
      <Confirm
        question={W.leave.question}
        detail={W.leave.detail}
        yes={W.leave.yes}
        no={W.leave.no}
        discard
        onYes={s.work.discard}
        onNo={s.work.stay}
        testid="ix-new-leave"
      />
    );
  if (s.step === "who") return null;
  return (
    <div className="ix-new-foot">
      {/* What the server refused, in its own words. A long one takes the row over the acts (inbox.css). */}
      {s.error ? (
        <span className="ix-new-say" data-tone="danger" role="alert" data-testid="ix-new-say">
          {s.error}
        </span>
      ) : null}
      {/* The two acts stand together: a sentence with no room beside them takes the row over them, never between. */}
      <div className="ix-new-foot-acts">
        <Button disabled={s.busy} onClick={s.work.leave} data-testid="ix-new-cancel">
          {W.cancel}
        </Button>
        {s.how === "call" ? (
          // Filled once there is something to keep: until then the filled act is the call itself (call.tsx).
          <Button
            variant={s.written.after.trim() ? "primary" : "secondary"}
            disabled={s.busy}
            onClick={() => void s.finishCall()}
            data-testid="ix-new-done"
          >
            {s.written.after.trim() ? W.call.keep : W.done}
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!s.canSend || s.busy}
            onClick={() => void s.send()}
            data-testid="ix-new-send"
            {...gate("approve", W.gate)}
          >
            {s.busy ? W.sending : s.sendsTo ? W.sendTo(s.sendsTo) : W.send}
          </Button>
        )}
      </div>
    </div>
  );
}

export function NewConversationSheet(p: Opened) {
  const s = useNewConversationSheet(p);
  return (
    <Sheet
      open={p.open}
      // Once a message has gone there is nothing left to throw away: closing closes.
      onClose={s.sent ? p.onClose : s.work.leave}
      title={W.title}
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      foot={foot(s)}
      testid="ix-new"
    >
      {s.step === "who" ? <NewWho s={s} /> : planStep(s)}
    </Sheet>
  );
}
