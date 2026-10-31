/**
 * A new conversation's message (the design's 4.2, parts 5 and 6): the wire it goes by, said with what it carries; the
 * words, with a subject for an email, or the approved message where WhatsApp carries nothing else; and who answers
 * what comes back, with the note the receptionist will read. Hookless: the sheet's state is handed in (state.ts).
 * Which wire can carry what is the server's answer (contracts writeWaysOf, through the reach read), drawn as it came.
 */
import {
  NEW_CONVERSATION_WORDS as W,
  PLAN_NOTE_MAX,
  REPLY_LIMITS,
  THREAD_PANE_WORDS,
  approvedWordsFor,
  emailSignedLine,
  writeWayWords,
  writeWireName,
  type PersonReachDto,
  type WriteWay,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Segmented } from "../../kit/segmented/segmented";
import { Select } from "../../kit/select/select";
import { approvedKey, onSendKey } from "./state";
import type { SheetState } from "./state";

/** Each wire a message cannot go by, with why: said, never hidden. */
function heldLines(ways: readonly WriteWay[]) {
  return ways
    .filter((w) => !w.ok)
    .map((w) => (
      <p className="ix-new-said" key={w.wire} data-testid={`ix-new-held-${w.wire}`}>
        {writeWayWords(w)}
      </p>
    ));
}

/**
 * The wire: chosen where more than one can carry it, and said with what it carries. The ways it cannot go are one press
 * away under it ("Why not Text or Email?"), each with why: said, never hidden, and never three lines in the way of the
 * words (Ruben, 10 Oct 2026). Where no way is open they are the whole of what is said (NewMessage).
 */
function wirePart(s: SheetState, reach: PersonReachDto, way: WriteWay) {
  const open = reach.ways.filter((w) => w.ok);
  const held = reach.ways.filter((w) => !w.ok);
  return (
    <section className="ix-new-part">
      {open.length > 1 ? (
        <Segmented
          label={W.wire}
          value={way.wire}
          onValueChange={(wire) => s.patch({ wire })}
          options={open.map((w) => ({ value: w.wire, label: writeWireName(w.wire), testid: `ix-new-wire-${w.wire}` }))}
        />
      ) : null}
      <p className="ix-new-said" data-testid="ix-new-way">
        {writeWayWords(way)}
      </p>
      {held.length ? (
        <details className="ix-new-held" data-testid="ix-new-held">
          <summary className="ix-new-held-why">{W.heldWhy(held.map((w) => writeWireName(w.wire)))}</summary>
          {heldLines(reach.ways)}
        </details>
      ) : null}
    </section>
  );
}

/** The member's own words: a subject for an email, the message, and Ask's rewrites of what is there. */
function wordsPart(s: SheetState, reach: PersonReachDto, way: WriteWay) {
  const { written, ask } = s;
  // The line the first text to them carries: shown before it is sent, and given its room in what may be typed.
  const line = way.wire === "sms" ? reach.first_text_line : null;
  // What an email from this member is signed with (decision 0081), said under the words as the Inbox's box says it.
  const signed = way.wire === "email" ? reach.email_signed : null;
  const sendKey = onSendKey(() => void s.send());
  return (
    <section className="ix-new-part">
      {way.wire === "email" ? (
        <Field
          label={W.subject}
          value={written.subject}
          onValueChange={(subject) => s.patch({ subject })}
          onKeyDown={sendKey}
          maxLength={200}
          data-testid="ix-new-subject"
        />
      ) : null}
      <Field
        label={W.words}
        rows={way.wire === "email" ? 8 : 4}
        value={written.text}
        onValueChange={(text) => s.patch({ text })}
        onKeyDown={sendKey}
        maxLength={REPLY_LIMITS[way.wire].max - (line ? line.length + 1 : 0)}
        data-testid="ix-new-text"
      />
      {line ? (
        <p className="ix-new-said" data-testid="ix-new-first-text">
          {W.firstText(line)}
        </p>
      ) : null}
      {signed ? (
        <p className="ix-new-said" data-testid="ix-new-signed" title={signed}>
          {emailSignedLine(signed)}
        </p>
      ) : null}
      {written.text.trim() && written.about.trim() ? (
        <div className="ix-new-acts">
          <Button size="sm" variant="quiet" disabled={ask.asked.busy} onClick={() => void ask.write("shorter")}>
            {W.write.shorter}
          </Button>
          <Button size="sm" variant="quiet" disabled={ask.asked.busy} onClick={() => void ask.write("warmer")}>
            {W.write.warmer}
          </Button>
          <Button size="sm" variant="quiet" disabled={ask.asked.busy} onClick={() => void ask.write("again")}>
            {W.write.rewrite}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Which approved messages are not offered to this person, and why: one press away, as the thread's own box keeps it
 * ("an explanation one tap away, never in the way"). It was a paragraph under every choice.
 */
function notOffered(s: SheetState, hidden: string | null | undefined) {
  if (!hidden) return null;
  return (
    <>
      <div className="ix-new-acts">
        <LinkButton onClick={s.toggleWhy} aria-expanded={s.why} data-testid="ix-new-why">
          {W.approved.why}
        </LinkButton>
      </div>
      {s.why ? (
        <p className="ix-new-said" data-testid="ix-new-why-said">
          {hidden}
        </p>
      ) : null}
    </>
  );
}

/** Where WhatsApp carries only an approved message: the ones that can go to this person, and the words of the one chosen. */
function approvedPart(s: SheetState, reach: PersonReachDto) {
  const { approved, choice, chosen } = s;
  if (approved.state === "reading")
    return (
      <p className="ix-new-said" role="status">
        {W.reading}
      </p>
    );
  if (approved.state === "failed" || !choice || !chosen)
    return (
      <section className="ix-new-part" data-testid="ix-new-no-approved">
        <p className="ix-new-said" role={approved.state === "failed" ? "alert" : undefined}>
          {approved.state === "failed" ? W.unread : W.approved.none(reach.person.name)}
        </p>
        {notOffered(s, choice?.hidden)}
      </section>
    );
  return (
    <section className="ix-new-part" data-testid="ix-new-approved">
      <Field
        label={W.approved.label}
        control={
          <Select
            value={approvedKey(chosen.template)}
            onValueChange={(approvedPick) => s.patch({ approved: approvedPick })}
            options={choice.sendable.map((x) => ({
              value: approvedKey(x.template),
              label: x.label,
              ...(x.sample ? { meta: THREAD_PANE_WORDS.sample } : {}),
            }))}
            chevron={<Icon name="chevron-down" size={12} />}
            data-testid="ix-new-approved-pick"
          />
        }
      />
      <p className="ix-new-quote" data-testid="ix-new-approved-words">
        {approvedWordsFor(chosen.template, reach.fills)}
      </p>
      {notOffered(s, choice.hidden)}
    </section>
  );
}

/** The note the receptionist will read: shown, changed, or left out. */
function notePart(s: SheetState) {
  if (!s.written.keepNote)
    return (
      <div className="ix-new-acts">
        <LinkButton onClick={() => s.patch({ keepNote: true })} data-testid="ix-new-note-back">
          {W.note.putBack}
        </LinkButton>
      </div>
    );
  return (
    <>
      <Field
        label={W.note.label}
        placeholder={W.note.empty}
        rows={2}
        value={s.note}
        onValueChange={(note) => s.patch({ note })}
        maxLength={PLAN_NOTE_MAX}
        data-testid="ix-new-note"
      />
      <div className="ix-new-acts">
        <LinkButton onClick={() => s.patch({ keepNote: false })} data-testid="ix-new-note-out">
          {W.note.leaveOut}
        </LinkButton>
      </div>
    </>
  );
}

/** Who answers what comes back: a choice where the receptionist answers this person, else said as it is. */
function thenPart(s: SheetState) {
  const { who } = s;
  if (!who) return null;
  if (!who.choice)
    return (
      <p className="ix-new-said" data-testid="ix-new-then-fixed">
        {W.then.comesToYou}
      </p>
    );
  return (
    <section className="ix-new-part">
      <p className="ix-new-lead" id="ix-new-then">
        {W.then.label}
      </p>
      <Segmented
        labelledBy="ix-new-then"
        value={who.then}
        onValueChange={(then) => s.patch({ then })}
        options={[
          {
            value: "receptionist",
            label: W.then.receptionist,
            hint: W.then.receptionistHint,
            testid: "ix-new-then-receptionist",
          },
          { value: "me", label: W.then.me, hint: W.then.meHint, testid: "ix-new-then-me" },
        ]}
      />
      {who.then === "receptionist" ? notePart(s) : null}
    </section>
  );
}

export function NewMessage({ s, reach }: { s: SheetState; reach: PersonReachDto }) {
  const { way } = s;
  // No wire carries a message to them now: each says why, and their page is where a yes is recorded.
  if (!way)
    return (
      <section className="ix-new-part" data-testid="ix-new-no-way">
        <p className="ix-new-lead">{W.noWay(reach.person.name)}</p>
        {heldLines(reach.ways)}
        <div className="ix-new-acts">
          <LinkButton onClick={() => s.goTo(`clients/${reach.person.id}`)} data-testid="ix-new-page">
            {/* Where a yes is what is missing, the door says so: their page is where one is recorded, in their words. */}
            {reach.ways.some((w) => w.hold === "no_yes") ? W.recordYes : W.page}
          </LinkButton>
        </div>
      </section>
    );
  return (
    <>
      {wirePart(s, reach, way)}
      {way.carries === "approved" ? approvedPart(s, reach) : wordsPart(s, reach, way)}
      {thenPart(s)}
    </>
  );
}
