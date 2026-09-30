/**
 * ONE of the two consent questions (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): three buttons, then
 * "how did they tell you?", then a line saying what is on record.
 *
 * It is a component because there are two of these now and they must look identical: the carriers' requirement (error
 * 30913) is that a person can give one and not the other, and a reader can only see that if the two asks are plainly the
 * same kind of control. The /yes page renders the same pair from `consentPageVM().asks`; this is the desk-side equivalent
 * for an answer given in person, on the phone, or on a signed form.
 *
 * Its own `pick` state, so arming one ask never arms the other. An armed button is drawn as armed (dashed), never as the
 * answer on record: nothing is written until the how is chosen, and `aria-pressed` follows the record alone.
 *
 * A spoken way is written the moment it is chosen. A written way first names its evidence (00137): "their own message" is
 * one of the messages they sent, chosen from `messages` (contracts ownMessagesOf), and a sign-up form carries a note saying
 * which form, or where they wrote when it was somewhere Chanlytics does not see.
 *
 * `yesSources` narrows the ways a YES may have been given, for the ask that has to be written (offers); a no keeps every
 * source, because a no is honoured however it is said. `why` is the explanation a reader may want and never needs in the
 * way: one line behind a tap. `lockedNote` is appended when the ask is locked; the page passes null and says the role once
 * for the whole rail.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import type { PersonVM } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";

/** A way an answer may have been given. */
interface Source {
  id: string;
  label: string;
}

/** The three answers a door takes. */
export type Answer = "opted_in" | "opted_out" | "unknown";

/** What a written way names as its evidence: the message they sent, or the form's note. */
export type Evidence = { message_id: string } | { note: string };

/** What recording an answer comes back with. */
interface Recorded {
  ok: boolean;
  message?: string;
}

/** Where the ask stands: whether a write is out, what went wrong, the answer armed, the written way waiting, and its note. */
interface AskState {
  busy: boolean;
  error: string | null;
  pick: Answer | null;
  way: string | null;
  note: string;
}

const ASK_CLOSED: AskState = { busy: false, error: null, pick: null, way: null, note: "" };

interface AskProps {
  label: string;
  value: string;
  sources: readonly Source[];
  yesSources?: readonly Source[];
  yesHow?: string;
  canRecord: boolean;
  hint: ReactNode;
  why?: { label: string; text: ReactNode } | null;
  onRecord: (
    consent: Answer,
    source: string | null,
    evidence?: Evidence | null,
  ) => Promise<Recorded | null | undefined>;
  testid: string;
  lockedNote?: string | null;
  messages?: PersonVM["ownMessages"];
  bare?: boolean;
}

/** What the ask does with its state. */
interface Doing {
  st: AskState;
  setSt: (next: AskState | ((c: AskState) => AskState)) => void;
  record: (consent: Answer, source: string | null, evidence?: Evidence | null) => Promise<void>;
  pickAnswer: (state: Answer) => void;
  choose: (source: string) => void;
  recordForm: () => void;
  close: () => void;
}

/** Which message? The ones they wrote, or a way to say it was written somewhere else. */
function messagesPanel(a: AskProps, d: Doing) {
  const { st, setSt, record, close } = d;
  const { testid, messages = [] } = a;
  return (
    <>
      <div className="cl-prof-aut-hint">Which message? Choose the one where they said it.</div>
      {messages.length > 0 ? (
        <div className="cl-prof-msgs" role="group" aria-label="Their messages">
          {messages.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cl-prof-msg"
              disabled={st.busy}
              onClick={() => {
                if (st.pick) void record(st.pick, "customer_message", { message_id: m.id });
              }}
              data-testid={`${testid}-message`}
            >
              <span className="cl-prof-msg-words">“{m.words}”</span>
              <span className="cl-prof-msg-meta">
                {m.via ? `${m.via} · ` : ""}
                {m.when}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cl-prof-aut-hint">Nothing they&apos;ve written to you is here to choose.</div>
      )}
      <div className="cl-prof-aut-hint" data-testid={`${testid}-elsewhere`}>
        Wrote to you somewhere Chanlytics doesn&apos;t see?{" "}
        <button
          type="button"
          className="cl-bucket-link"
          disabled={st.busy}
          onClick={() => setSt((c) => ({ ...c, way: "form", error: null }))}
        >
          Record a sign-up form
        </button>{" "}
        and say where in the note.
      </div>
      <div className="cl-prof-how-chips">
        <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** A sign-up form: the note that says which form, or where they wrote, kept with their answer. */
function formPanel(a: AskProps, d: Doing) {
  const { st, setSt, recordForm, close } = d;
  const { testid } = a;
  const note = st.note.trim();
  return (
    <>
      <div className="cl-prof-aut-hint">
        Which form, or where did they write to you? The note is kept with their answer.
      </div>
      <div className="cl-prof-note">
        <input
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the form was just chosen: the note is what is asked next
          autoFocus
          value={st.note}
          maxLength={200}
          placeholder="Slip 12, or on Instagram"
          aria-label="Which form, or where they wrote to you"
          disabled={st.busy}
          data-testid={`${testid}-note`}
          onChange={(e) => setSt((c) => ({ ...c, note: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") recordForm();
            if (e.key === "Escape") close();
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={st.busy || !note}
          onClick={recordForm}
          data-testid={`${testid}-note-save`}
        >
          Record
        </button>
        <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** How did they tell you? The ways an answer may have been given, chips to press. */
function sourcesPanel(a: AskProps, d: Doing) {
  const { st, choose, close } = d;
  const { sources, yesSources, yesHow } = a;
  return (
    <>
      <div className="cl-prof-aut-hint">{st.pick === "opted_in" && yesHow ? yesHow : "How did they tell you?"}</div>
      <div className="cl-prof-how-chips">
        {(st.pick === "opted_in" && yesSources ? yesSources : sources).map((so) => (
          <button
            key={so.id}
            type="button"
            className="cl-prof-how-chip"
            disabled={st.busy}
            onClick={() => choose(so.id)}
          >
            {so.label}
          </button>
        ))}
        <button type="button" className="cl-bucket-link" disabled={st.busy} onClick={close}>
          Cancel
        </button>
      </div>
    </>
  );
}

/** The how: their message, a form's note, or one of the ways to choose. */
function howPanel(a: AskProps, d: Doing) {
  const { st } = d;
  return (
    <div className="cl-prof-how" data-testid={`${a.testid}-how`}>
      {st.way === "customer_message" ? messagesPanel(a, d) : st.way === "form" ? formPanel(a, d) : sourcesPanel(a, d)}
    </div>
  );
}

/** The three answers, drawn as the record has them, an armed one dashed. */
function answers(a: AskProps, d: Doing) {
  const { value, canRecord, label } = a;
  const { st } = d;
  const choices: [Answer, string][] = [
    ["opted_in", "Yes"],
    ["unknown", "Not asked"],
    ["opted_out", "No"],
  ];
  return (
    <div className="cl-prof-autonomy" role="group" aria-label={label}>
      {choices.map(([sv, text]) => (
        <button
          key={sv}
          type="button"
          className={`cl-prof-aut-seg ${value === sv ? "active" : ""} ${st.pick === sv ? "armed" : ""}`}
          aria-pressed={value === sv}
          disabled={!canRecord || st.busy}
          onClick={() => d.pickAnswer(sv)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** One consent question: the answers, how they were given, what is on record, and why it has to be in writing. */
export function ConsentAsk(props: AskProps) {
  const {
    label,
    value,
    canRecord,
    hint,
    why = null,
    onRecord,
    testid,
    lockedNote = "Only an owner or operator can change this.",
    bare = false,
  } = props;
  // `way` is a written way waiting for its evidence: the message, or the form's note.
  const [st, setSt] = useState<AskState>({ ...ASK_CLOSED });
  const record = async (consent: Answer, source: string | null, evidence: Evidence | null = null) => {
    if (st.busy) return;
    setSt({ ...ASK_CLOSED, busy: true });
    const r = await onRecord(consent, source, evidence);
    if (!r || !r.ok) {
      setSt({ ...ASK_CLOSED, error: (r && r.message) || "Could not record this." });
      return;
    }
    setSt({ ...ASK_CLOSED });
  };
  const pickAnswer = (state: Answer) => {
    if (state === "unknown") {
      // "Not asked" is a reset and needs no source, so it is written straight away, and only when it would change something.
      if (value !== "unknown") void record("unknown", null);
      return;
    }
    setSt((c) => ({ ...c, pick: c.pick === state ? null : state, way: null, note: "", error: null }));
  };
  const choose = (source: string) => {
    if (source === "customer_message" || source === "form") {
      setSt((c) => ({ ...c, way: source, error: null }));
      return;
    }
    if (st.pick) void record(st.pick, source);
  };
  const note = st.note.trim();
  const recordForm = () => {
    if (note && st.pick) void record(st.pick, "form", { note });
  };
  const close = () => setSt({ ...ASK_CLOSED });
  const doing: Doing = { st, setSt, record, choose, recordForm, close, pickAnswer };
  return (
    <div className={bare ? "cl-prof-consent" : "cl-prof-rail-section"} data-testid={testid}>
      {bare ? null : <div className="cl-prof-rail-label">{label}</div>}
      {answers(props, doing)}
      {st.pick && howPanel(props, doing)}
      <div className="cl-prof-aut-hint">
        {hint}
        {!canRecord && lockedNote ? ` ${lockedNote}` : ""}
      </div>
      {why && (
        <details className="cl-prof-why">
          <summary>
            {why.label} <Icon name="chevron-down" size={10} />
          </summary>
          <div className="cl-prof-aut-hint">{why.text}</div>
        </details>
      )}
      <FieldError message={st.error} testid={testid ? `${testid}-error` : null} />
    </div>
  );
}
