/**
 * A step's message in New (decision 0065; the New canvas's C3 and C5): which message a person's step sends, one of the
 * workspace's or one Ask wrote (or one the owner writes here), and the words of one Ask wrote or of a lead's email,
 * edited in place. A message the workspace holds is changed in Messages, where every version of it is; one Ask wrote is
 * filed only when the draft is kept or started, so its words are the draft's until then. Values are said by name while
 * they are written ({{first name}}), put in where the cursor is, and numbered as a message holds them on Save (contracts
 * numberedValues); Ask writes the words again warmer or shorter, every value kept, with Undo.
 */
import { useRef, useState } from "react";
import {
  NEW_VALUES,
  NEW_WORDS as W,
  REACH_OUT_SLOTS,
  numberedValues,
  slugTemplateName,
  triggerOf,
  type CampaignMessage,
  type DraftWho,
  type NewDraftDto,
  type NewEmail,
  type NewMessage,
  type NewWrittenMessage,
  type ParamSpec,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { Segmented } from "../../../kit/segmented/segmented";
import { routeDoor } from "../../../legacy-verbs";
import { templates as templateVerbs } from "../../templates/verbs";
import { channelsSaidOf, heldMessageOf } from "./new-model";
import { Choice, PickSheet } from "./new-sheets";

/** The Library as the message sheet reads it: its messages, and the rows their values are read from. */
export interface LibraryReads {
  messages: readonly CampaignMessage[];
  rows: readonly { id: string; name: string; variables: unknown; body_preview?: string | null }[];
}

/**
 * Why a held message can't be picked on this step, as its run fills its values (the draft's own rule, server
 * draft-judge.ts fillable), or null where it can: a visit's values only on a visit moment's first step, a proposal's only
 * on a deal moment's, never on a one-off or a list, whose run knows neither. "Step 1 only" is said only where this
 * draft's step 1 would take it.
 */
function notHereOf(m: NewMessage, first: boolean, who: DraftWho | null): string | null {
  const moment = who?.kind === "moment" ? (triggerOf(who.trigger)?.kind ?? null) : null;
  const kinds = m.params.map((p) => p.kind);
  if (kinds.some((k) => k === "visit_when" || k === "visit_service") && !(first && moment === "visit"))
    return moment === "visit" ? W.sheets.firstStepOnly : W.sheets.visitOnly;
  if (kinds.includes("proposal_link") && !(first && moment === "deal"))
    return moment === "deal" ? W.sheets.proposalFirstOnly : W.sheets.dealOnly;
  return null;
}

const channelsSaid = (m: NewMessage): string => channelsSaidOf(m.channels, " · ");

/** A step's message: Ask's, one of the workspace's, or one the owner writes. */
export function MessageSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  i: number;
  library: LibraryReads | null;
  onMessage: (m: NewMessage) => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  const step = p.draft.steps[p.i];
  const written = step?.message?.written ? step.message : null;
  const held = (p.library?.messages ?? [])
    .filter((m) => m.offered)
    .map((m) => heldMessageOf(m, p.library?.rows ?? []))
    .filter((m): m is NewMessage => m !== null);
  return (
    <PickSheet
      open={p.open}
      title={W.sheets.message(p.i + 1)}
      sub={W.sheets.messageSub}
      onClose={p.onClose}
      testid="sq-nw-message"
      foot={
        <Button onClick={p.onWrite} data-testid="sq-nw-write">
          <Icon name="plus" size={14} /> {W.sheets.writeOne}
        </Button>
      }
    >
      {written ? (
        <div className="sq-nw-rows">
          <Choice
            glyph="sparkle"
            name={W.sheets.byAskNamed(written.title)}
            said={written.written?.versions.whatsapp ? W.checks.newMessageDetail : channelsSaid(written)}
            on
            onPick={() => p.onMessage(written)}
            testid="sq-nw-message-ask"
          />
        </div>
      ) : null}
      <p className="sq-nw-cap">{W.sheets.yourMessages}</p>
      <div className="sq-nw-rows">
        {held.map((m) => {
          const notHere = notHereOf(m, p.i === 0, p.draft.kind === "sequence" ? p.draft.who : null);
          const fits = notHere === null;
          return (
            <Choice
              key={m.template_id}
              glyph="chat"
              name={m.title}
              said={notHere ?? `${channelsSaid(m)}${m.offer ? ` · ${W.sheets.anOffer}` : ""}`}
              on={step?.message?.template_id === m.template_id}
              off={!fits}
              onPick={() => p.onMessage(m)}
              testid={`sq-nw-message-${m.template_id}`}
            />
          );
        })}
      </div>
    </PickSheet>
  );
}

/** A value's name as it is written, from the kind a message holds it as. */
const valueSayOf = (kind: string): string => NEW_VALUES.find((v) => v.kind === kind)?.say ?? kind;

/** A written message's words with its values by name, for writing; and back, numbered, on Save. */
function valuesByName(text: string, slots: NewWrittenMessage["slots"]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (all, n: string) => {
    const s = slots.find((x) => x.position === Number(n));
    return s ? `{{${valueSayOf(s.kind)}}}` : all;
  });
}

/** The words as the editor holds them: a version per channel, said by name. */
interface Words {
  title: string;
  whatsapp: string;
  subject: string;
  email: string;
  text: string;
}

const editorWordsOf = (m: NewMessage | null): Words => {
  const w = m?.written;
  const slots = w?.slots ?? [];
  return {
    title: m?.title ?? "",
    whatsapp: valuesByName(w?.versions.whatsapp?.body ?? "", slots),
    subject: valuesByName(w?.versions.email?.subject ?? "", slots),
    email: valuesByName(w?.versions.email?.body ?? "", slots),
    text: valuesByName(w?.versions.sms?.body ?? "", slots),
  };
};

/** The message the editor's words make, numbered as a message holds them; null where a value is none New knows. */
function typedMessageOf(words: Words, offer: boolean, before: NewMessage | null): NewMessage | null {
  const wa = words.whatsapp.trim();
  const sms = offer ? "" : words.text.trim();
  const subject = words.subject.trim();
  const email = words.email.trim();
  const numbered = numberedValues([wa, sms, subject, email]);
  if (!numbered || !words.title.trim() || (!wa && !sms && !(subject && email))) return null;
  const { rewrite, slots } = numbered;
  const versions: NewWrittenMessage["versions"] = {
    ...(wa ? { whatsapp: { body: rewrite(wa) } } : {}),
    ...(subject && email ? { email: { subject: rewrite(subject), body: rewrite(email) } } : {}),
    ...(sms ? { sms: { body: rewrite(sms) } } : {}),
  };
  const channels = (["whatsapp", "email", "sms"] as const).filter((c) => !!versions[c]);
  return {
    template_id: null,
    title: words.title.trim(),
    body: versions.whatsapp?.body ?? versions.sms?.body ?? versions.email?.body ?? "",
    channels,
    params: slots.map((s) => ({ kind: s.kind }) as ParamSpec),
    offer,
    written: {
      name: before?.written?.name ?? slugTemplateName(words.title),
      category: before?.written?.category ?? "marketing",
      versions,
      slots,
    },
  };
}

type Channel = "email" | "whatsapp" | "sms";

/** The box each version's words are written in. */
const BOX_OF: Record<Channel, "email" | "whatsapp" | "text"> = { email: "email", whatsapp: "whatsapp", sms: "text" };

/** The values a person's message may name anywhere: theirs and the business's; a booking's own are a moment's first step's. */
const ANY_STEP_VALUES = NEW_VALUES.slice(0, 4);

/**
 * Ask writing a version's words again, warmer or shorter (POST templates/versions/rewrite, every value kept), put in as
 * if typed, the words it replaced kept for Undo; WhatsApp's words are written again as a text's are.
 */
function useRewrite(words: Words, on: Channel, put: (w: Words) => void) {
  const [asking, setAsking] = useState<"warmer" | "shorter" | null>(null);
  const [before, setBefore] = useState<Words | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const rewrite = async (tone: "warmer" | "shorter") => {
    const box = BOX_OF[on];
    if (asking || !words[box].trim()) return;
    setAsking(tone);
    setProblem(null);
    const email = on === "email";
    const r = await templateVerbs
      .rewrite({
        channel: email ? "email" : "sms",
        language: "en",
        subject: email ? words.subject : null,
        body: words[box],
        tone,
      })
      .catch(() => ({ ok: false as const, message: W.failed.title }));
    setAsking(null);
    if (!r.ok) {
      setProblem(r.message);
      return;
    }
    setBefore(words);
    put({ ...words, [box]: r.data.body, ...(email && r.data.subject ? { subject: r.data.subject } : {}) });
  };
  const undo = () => {
    if (!before) return;
    put(before);
    setBefore(null);
  };
  return { asking, problem, canUndo: before !== null, rewrite, undo };
}

/** The words of a person's message Ask wrote (or the owner writes), a channel at a time. */
function PersonWords(p: {
  message: NewMessage | null;
  onSave: (m: NewMessage) => void;
  onClose: () => void;
  open: boolean;
}) {
  const [words, setWords] = useState<Words>(() => editorWordsOf(p.message));
  const offer = p.message?.offer ?? false;
  const [on, setOn] = useState<Channel>(
    p.message?.written?.versions.email && !p.message.written.versions.whatsapp ? "email" : "whatsapp",
  );
  const [valuesOpen, setValuesOpen] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const made = typedMessageOf(words, offer, p.message);
  const set = (k: keyof Words) => (v: string) => setWords((w) => ({ ...w, [k]: v }));
  const ask = useRewrite(words, on, setWords);
  // A value put in where the cursor is in the words shown, as if typed there.
  const putValue = (say: string) => {
    const k = BOX_OF[on];
    const at = box.current?.selectionStart ?? words[k].length;
    const value = `{{${say}}}`;
    setWords((w) => ({ ...w, [k]: w[k].slice(0, at) + value + w[k].slice(at) }));
    setValuesOpen(false);
  };
  const versions: { value: Channel; label: string }[] = [
    { value: "whatsapp", label: W.channels.whatsapp },
    { value: "email", label: W.channels.email },
    ...(offer ? [] : [{ value: "sms" as const, label: W.channels.sms }]),
  ];
  return (
    <PickSheet
      open={p.open}
      title={words.title || W.sheets.newMessage}
      sub={p.message?.written ? W.sheets.askWrote : W.sheets.youWrite}
      onClose={p.onClose}
      testid="sq-nw-words"
      foot={
        <div className="sq-nw-pair" data-foot-pair="">
          <Button onClick={p.onClose}>{W.sheets.cancel}</Button>
          <Button
            variant="primary"
            disabled={!made}
            onClick={() => made && p.onSave(made)}
            data-testid="sq-nw-words-save"
          >
            {W.sheets.save}
          </Button>
        </div>
      }
    >
      {/* A message Ask wrote is named in the sheet's head; one written here is named first. */}
      {p.message ? null : (
        <Field label={W.sheets.title} value={words.title} onValueChange={set("title")} maxLength={60} />
      )}
      <Segmented
        label={W.sheets.version}
        value={on}
        onValueChange={(v) => setOn(v === "email" ? "email" : v === "sms" && !offer ? "sms" : "whatsapp")}
        options={versions}
        className="sq-nw-versions"
      />
      {on === "email" ? (
        <>
          <Field label={W.sheets.subject} value={words.subject} onValueChange={set("subject")} maxLength={200} />
          <Field
            ref={box}
            label={W.sheets.words}
            rows={5}
            value={words.email}
            onValueChange={set("email")}
            maxLength={4000}
          />
        </>
      ) : on === "sms" ? (
        <Field
          ref={box}
          label={W.sheets.words}
          rows={4}
          value={words.text}
          onValueChange={set("text")}
          maxLength={600}
        />
      ) : (
        <Field
          ref={box}
          label={W.sheets.words}
          rows={5}
          value={words.whatsapp}
          onValueChange={set("whatsapp")}
          maxLength={1024}
        />
      )}
      <div className="sq-nw-presses" data-testid="sq-nw-words-ask">
        {(["warmer", "shorter"] as const).map((tone) => (
          <Button
            key={tone}
            size="sm"
            onClick={() => void ask.rewrite(tone)}
            disabled={ask.asking !== null}
            aria-busy={ask.asking === tone}
            data-testid={`sq-nw-words-${tone}`}
          >
            {ask.asking === tone ? W.sheets.asking : W.sheets[tone]}
          </Button>
        ))}
        <Button
          size="sm"
          aria-expanded={valuesOpen}
          onClick={() => setValuesOpen((v) => !v)}
          data-testid="sq-nw-words-value"
        >
          {W.sheets.aValue}
        </Button>
        {ask.canUndo ? (
          <Button size="sm" variant="quiet" onClick={ask.undo} data-testid="sq-nw-words-undo">
            {W.sheets.undo}
          </Button>
        ) : null}
      </div>
      {valuesOpen ? (
        <div className="sq-nw-presses" data-testid="sq-nw-words-values">
          {ANY_STEP_VALUES.map((v) => (
            <Button key={v.kind} size="sm" variant="quiet" onClick={() => putValue(v.say)}>
              {v.label}
            </Button>
          ))}
        </div>
      ) : null}
      {ask.problem ? <p className="sq-nw-note is-warn">{ask.problem}</p> : null}
      <p className="sq-nw-note">
        {offer ? W.sheets.offerNote : W.sheets.valuesSaid(ANY_STEP_VALUES.map((v) => `{{${v.say}}}`).join(", "))}
      </p>
    </PickSheet>
  );
}

/** A lead's email: its subject (the first's alone) and its words, each value by name. */
function LeadWords(p: {
  email: NewEmail | null;
  first: boolean;
  onSave: (e: NewEmail) => void;
  onClose: () => void;
  open: boolean;
}) {
  const [subject, setSubject] = useState(p.email?.subject ?? "");
  const [body, setBody] = useState(p.email?.body ?? "");
  return (
    <PickSheet
      open={p.open}
      title={p.first ? W.sheets.firstEmail : W.sheets.laterEmail}
      sub={p.first ? W.sheets.firstEmailSub : W.sheets.laterEmailSub}
      onClose={p.onClose}
      testid="sq-nw-words"
      foot={
        <div className="sq-nw-pair" data-foot-pair="">
          <Button onClick={p.onClose}>{W.sheets.cancel}</Button>
          <Button
            variant="primary"
            onClick={() => p.onSave({ subject: p.first ? subject : null, body })}
            data-testid="sq-nw-words-save"
          >
            {W.sheets.save}
          </Button>
        </div>
      }
    >
      {p.first ? <Field label={W.sheets.subject} value={subject} onValueChange={setSubject} maxLength={80} /> : null}
      <Field label={W.sheets.words} rows={6} value={body} onValueChange={setBody} maxLength={1200} />
      <p className="sq-nw-note">
        {W.sheets.valuesSaid(
          REACH_OUT_SLOTS.slice(0, 6)
            .map((s) => `{{${s}}}`)
            .join(", "),
        )}
      </p>
    </PickSheet>
  );
}

/** The words editor for a step: a lead's email, a person's message Ask wrote, or one of the workspace's (in Messages). */
export function WordsSheet(p: {
  open: boolean;
  draft: NewDraftDto;
  i: number;
  /** A message the owner writes from blank, in place of the step's. */
  blank: boolean;
  /** How many times a sheet was opened: each opening edits the step's words as they stand. */
  opens: number;
  onMessage: (m: NewMessage) => void;
  onEmail: (e: NewEmail) => void;
  onClose: () => void;
}) {
  const step = p.draft.steps[p.i];
  if (!step) return null;
  if (p.draft.audience === "leads")
    return (
      <LeadWords
        key={`${p.i}-${p.opens}`}
        open={p.open}
        email={step.email}
        first={p.i === 0}
        onSave={(e) => {
          p.onEmail(e);
          p.onClose();
        }}
        onClose={p.onClose}
      />
    );
  if (!p.blank && step.message && !step.message.written)
    return (
      <PickSheet
        open={p.open}
        title={step.message.title}
        sub={W.sheets.heldSub}
        onClose={p.onClose}
        testid="sq-nw-words"
      >
        <p className="sq-nw-note">{W.sheets.heldWords}</p>
        <Button {...routeDoor("messages")} data-testid="sq-nw-words-library">
          {W.sheets.openMessages}
        </Button>
      </PickSheet>
    );
  return (
    <PersonWords
      key={`${p.i}-${p.blank ? "blank" : "step"}-${p.opens}`}
      open={p.open}
      message={p.blank ? null : step.message}
      onSave={(m) => {
        p.onMessage(m);
        p.onClose();
      }}
      onClose={p.onClose}
    />
  );
}
