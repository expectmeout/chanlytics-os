/**
 * An email or a text version being written, in the pane beside the list (One message, every channel, step 1; the
 * review's item 16): the subject (an email's) and the words in boxes that draw each slot by its name ("First name"), the
 * way the playbook's bubble does, so the owner never sees `{{1}}`; a menu that puts each of the message's values in by
 * its name, at the caret; and beside the words, how one person reads them, with the message's examples in the slots, kept
 * in step with each keystroke and, for a text, what it comes to on the wire. What is stored is the string with its
 * slots, `{{1}}` as it always was (slots/slot-box.tsx is the way between). Contracts' check runs as it is typed and says
 * what is wrong as the kit's FieldError, in the slots' names; Save is held until it passes, and a refusal the server
 * gives is said in its words, where the check's own were. The words are kept in the tab as they are typed and come back
 * when the editor opens again, as the template composer's do (the unsaved-work rule); Cancel asks first when something
 * was written.
 *
 * Ask's two changes stand under the words (the canvas's step editor): Warmer and Shorter write them again, every value
 * kept (POST templates/versions/rewrite), into the boxes as if typed, so the check reads them and Save stays the person's;
 * Undo puts back the words they replaced.
 *
 * A reach-out's email is written here too (step 5): the same editor over its own slot set (six named slots) and its own
 * rules (`rules`: a subject only on the first step, the cold email's limits, its own sentences), the one check and the one
 * preview reading both.
 *
 * In a message's own sheet (`oneBody`: the message sheet's canvas, 12 Nov 2026) it says less: the box is the words, with
 * no label over it and no preview repeating them under it on any channel (what a preview said beside the words, a text's
 * length and an email's footer, is the box's hint); no note before Send; and Send shows only once something changed, with
 * one Undo beside it (Ask's last change, else every change), where Cancel stood, in the pane's foot (`dock`) as every
 * drawer's acts are. Unchanged, the one act is Done.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  campaignEmailRules,
  validateEmailVersion,
  validateSmsVersion,
  versionSlotsRefusal,
} from "@chanlytics/contracts";
import { namedProblem } from "./message-version-slots";
import type {
  EmailRules,
  OwnVersionChannel,
  SlotSet,
  SlotValue,
  VersionCheck,
  VersionWords,
} from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LineField, LinePress } from "../../kit/line/line";
import { UnsavedAsk, tabDraft, useUnsavedWork } from "../../kit/record/work";
import { useSlotSeats } from "./slots/slot-seats";
import type { BoxName } from "./slots/slot-seats";
import { ValuesMenu, WordsField } from "./slots/words-field";
import { VersionPreview } from "./version-preview";
import { templates as templateVerbs } from "./verbs";
import type { VersionDraft } from "./verbs";
import { textCount } from "./versions";
import { TPL_SHEET_WORDS as SHEET, TPL_VERSION_WORDS as WORDS } from "./words";

const DRAFT_KIND = "template-version";

/** The tab's memory of one version's words: by the message, the language and the channel. */
const draftKey = (name: string, language: string, channel: string): string => `${name}|${language}|${channel}`;

/** What the tab kept of these words, where it kept any: the editor opens on them. */
export function keptWords(name: string, language: string, channel: string): VersionWords | null {
  const kept = tabDraft(DRAFT_KIND, draftKey(name, language, channel));
  if (!kept || typeof kept !== "object") return null;
  const { subject, body } = kept as { subject?: unknown; body?: unknown };
  return typeof body === "string" ? { subject: typeof subject === "string" ? subject : null, body } : null;
}

/** The longest words WhatsApp takes in a message's body. */
const WHATSAPP_WORDS_MAX = 1024;

/** WhatsApp's words, checked as they are typed: there, within WhatsApp's length, and every value one the message has. */
function whatsappCheck(body: string, slots: number): VersionCheck {
  const words = body.replace(/\r\n/g, "\n").trim();
  if (!words) return { ok: false, error: WORDS.whatsappEmpty };
  if (words.length > WHATSAPP_WORDS_MAX) return { ok: false, error: WORDS.whatsappLong };
  const refusal = versionSlotsRefusal(words, slots);
  return refusal ? { ok: false, error: refusal } : { ok: true, value: { subject: null, body: words }, warnings: [] };
}

interface VersionEditorProps {
  /** The message's name: what the version is filed under. */
  name: string;
  /** An email's or a text's version, or WhatsApp's words, which go back to WhatsApp (`onSendWords`). */
  channel: OwnVersionChannel | "whatsapp";
  language: string;
  /** The words it starts from: the version on file, or what writing one begins with. */
  start: VersionWords;
  /** The message's slots with what each is called, and the example that fills each in a preview, in the same order. */
  slots: SlotSet;
  values: readonly SlotValue[];
  /** An email's rules where it is not a campaign message's (a reach-out's); a campaign message's are made from its slots. */
  rules?: EmailRules<string>;
  /** Another act is under way: nothing here may start one. */
  busy: boolean;
  /**
   * Set where a composer holds the words itself (a new message's: the composer keeps them with the rest of what it holds,
   * so the editor keeps none of its own in the tab and draws no Cancel, which is the composer's): it is told the words as
   * they change, and opens on `start`.
   */
  within?: { onWords: (words: VersionWords) => void };
  /** The save, answered with the server's word; null when it did not start. */
  onSave: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  /** WhatsApp's words sent back to WhatsApp, in place of a version's save. */
  onSendWords?: (body: string) => Promise<ApiResult<unknown> | null>;
  /** How one person reads the words, where the channel has its own look (WhatsApp's bubble). */
  preview?: (words: VersionWords) => ReactNode;
  /** WhatsApp's reason for refusing these words: Ask writes them again as the editor opens. */
  fix?: string | null;
  /** The words WhatsApp approved before a change it refused: offered to go back to, put in the box to send again. */
  approvedBefore?: string | null;
  /**
   * The refused version this editor answers, and Ask's words for this refusal where they were kept: it opens on them, with
   * no second wait; where none were, Ask writes them as it opens and they are kept (keepFixWords).
   */
  fixFor?: { id: string; kept: string | null; reason: string } | null;
  /** What waits while WhatsApp looks at new words (the sequences that send it, the booking text), said once they changed. */
  holds?: string | null;
  /** In a message's own sheet: the words drawn once, and Send only once they changed (the canvas of 12 Nov 2026). */
  oneBody?: boolean;
  /** Nothing is on file yet: the words it opens on are a start to keep, so Save stands from the first. */
  unfiled?: boolean;
  /**
   * Where its acts stand in a message's own sheet: the pane's foot, docked as every drawer's is (the kit's pair, Send first),
   * not small buttons under the words. Null until the foot is drawn, and where it has none they stay under the words.
   */
  dock?: HTMLElement | null;
  onClose: () => void;
}

/**
 * The words being written and everything read from them: the boxes' state (kept in the tab and told to a composer that
 * holds them), the check, the save or the send back, Ask's rewrite (which a refusal starts as the editor opens), whether
 * anything changed, and the one Undo.
 */
type FixFor = VersionEditorProps["fixFor"];

/**
 * Words already written again: the tab's, from an editor left open, else Ask's for a refusal, kept from when they were first
 * written. The editor opens on them, Undo going back to where it started.
 */
const writtenAgain = (kept: VersionWords | null, fixFor: FixFor): VersionWords | null =>
  kept ?? (fixFor?.kept ? { subject: null, body: fixFor.kept } : null);

/** The refusal Ask's new words answer, under which they are kept as they come back. */
const fixKeyOf = (fixFor: FixFor): { template_id: string; reason: string } | undefined =>
  fixFor ? { template_id: fixFor.id, reason: fixFor.reason } : undefined;

/**
 * A refusal of WhatsApp's words before they were sent, for their shape or for what a reader saw in them (the door's
 * `validation`): its sentence, which Ask writes them again from. Null for any other answer (a limit, a twin, a send going
 * out), which new words do not mend.
 */
const wordsRefusedOf = (whatsapp: boolean, answer: { ok: false; code?: string; message: string } | null) =>
  whatsapp && answer?.code === "validation" ? answer.message : null;

/**
 * Words WhatsApp would refuse are written again by Ask at once, from the reason, so the owner reads words it takes and
 * sends those, never left to work a rule out (Ruben, 12 Nov 2026: nothing an owner writes should hold their account up).
 * Their own words are one Undo away, and the reason stays under the box.
 */
function useFixOnRefusal(reason: string | null, done: () => void, ask: ReturnType<typeof useAskRewrite>) {
  useEffect(() => {
    if (!reason) return;
    done();
    void ask.rewrite(WORDS.fixBefore(reason));
  }, [reason, done, ask]);
}

function useVersionWords(p: VersionEditorProps) {
  const { name, channel, language, start, slots, busy, within, onSave, onClose } = p;
  const kind = p.rules ?? campaignEmailRules(slots);
  // An email with no subject of its own (a reach-out's later step answers the one before) has one box of words.
  const hasSubject = channel === "email" && kind.subject;
  // What it opens on: the words the tab kept from an editor left open, else where it starts.
  const [kept] = useState(() => (within ? null : keptWords(name, language, channel)));
  const opened = writtenAgain(kept, p.fixFor);
  const first = opened ?? start;
  const [subject, setSubject] = useState(first.subject ?? "");
  const [body, setBody] = useState(first.body);
  // What the server refused with, until the words change; the check's own sentence is read as they are typed.
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // What the door refused of WhatsApp's words before sending them, until Ask has been asked to write them again.
  const [refusedFor, setRefusedFor] = useState<string | null>(null);
  const typed = (field: BoxName, words: string) => {
    setProblem(null);
    (field === "subject" ? setSubject : setBody)(words);
    const now = { subject: field === "subject" ? words : subject, body: field === "body" ? words : body };
    within?.onWords({ subject: hasSubject ? now.subject : null, body: now.body });
  };
  const seats = useSlotSeats({ subject, body }, typed);
  const written = { subject: hasSubject ? subject : null, body };
  const whatsapp = channel === "whatsapp";
  const check = checkOf(channel, { subject, body }, { kind, slots: slots.keys.length, language });
  const changed = subject !== (start.subject ?? "") || body !== start.body;
  const work = useUnsavedWork(DRAFT_KIND, within ? null : draftKey(name, language, channel), {
    value: { subject, body },
    dirty: !within && changed,
    onLeave: onClose,
  });
  const save = async () => {
    if (!check.ok || busy || saving) return;
    setSaving(true);
    setProblem(null);
    const { subject: filed, body: words } = check.value;
    // A save that never reached the server says so; a refusal it did give is said as it came.
    const sent = whatsapp
      ? (p.onSendWords?.(words) ?? Promise.resolve(null))
      : onSave({ name, language, channel, ...(filed ? { subject: filed } : {}), body: words });
    const r = await sent.catch(() => ({ ok: false as const, message: WORDS.saveFailed }));
    if (r?.ok) {
      work.done();
      onClose();
      return;
    }
    setSaving(false);
    setProblem(r ? r.message : null);
    setRefusedFor(wordsRefusedOf(whatsapp, r));
  };
  /**
   * The words in the boxes as if typed: each box drawn again with them (the seats' put, which keeps its undo), so the
   * check reads them, and a composer holding them is told them whole.
   */
  const put = (words: VersionWords) => {
    const subjectNow = words.subject ?? "";
    if (hasSubject) seats.put("subject", { text: subjectNow, caret: subjectNow.length });
    seats.put("body", { text: words.body, caret: words.body.length });
    within?.onWords({ subject: hasSubject ? subjectNow : null, body: words.body });
  };
  const ask = useAskRewrite({ channel, language, written, saving, put, onProblem: setProblem });
  useFixOnRefusal(
    refusedFor,
    useCallback(() => setRefusedFor(null), []),
    ask,
  );
  // A refused message opens with Ask already writing words WhatsApp can take: the owner reads them and sends them back.
  // Words the tab kept are those already written again: opened on them, Ask is not asked twice.
  const fixed = useRef(opened !== null);
  useEffect(() => {
    if (!p.fix || fixed.current) return;
    fixed.current = true;
    void ask.rewrite(WORDS.fixAsk(p.fix), fixKeyOf(p.fixFor));
  }, [p.fix, p.fixFor, ask]);
  // One Undo: Ask's last change, else back to the words it opened on.
  const undo = () => (ask.canUndo ? ask.undo() : put(start));
  return {
    kind,
    hasSubject,
    subject,
    body,
    problem,
    saving,
    typed,
    seats,
    written,
    whatsapp,
    check,
    changed,
    work,
    save,
    ask,
    undo,
    put,
  };
}

type EditorWords = ReturnType<typeof useVersionWords>;

/** The words checked as they are typed, by their channel's own rules. */
function checkOf(
  channel: OwnVersionChannel | "whatsapp",
  words: { subject: string; body: string },
  rules: { kind: EmailRules<string>; slots: number; language: string },
): VersionCheck {
  if (channel === "email") return validateEmailVersion(words, rules.kind);
  if (channel === "whatsapp") return whatsappCheck(words.body, rules.slots);
  return validateSmsVersion({ body: words.body }, rules.slots, rules.language);
}

/**
 * What a preview said beside the words, said under the box in a message's sheet, where no preview repeats them: a text's
 * length on the wire, and what an email's sender adds. Nothing elsewhere, where the preview says it.
 */
function bodyHintOf(p: VersionEditorProps, ed: EditorWords): string | undefined {
  if (!p.oneBody) return undefined;
  if (p.channel === "sms") {
    const count = textCount(ed.body, p.language);
    return WORDS.counter(count.chars, count.parts);
  }
  // WhatsApp's: what Send does, which the sheet says nowhere else.
  return p.channel === "email" ? ed.kind.foot : WORDS.whatsappNote;
}

/** A refused change's way back to the words WhatsApp approved, where they differ from what the box holds. */
function GoBack({ p, ed }: { p: VersionEditorProps; ed: EditorWords }) {
  const before = p.approvedBefore ?? null;
  if (!before || before === ed.body) return null;
  return (
    <LinkButton
      className="tpl-ver-back"
      disabled={ed.saving || ed.ask.asking !== null}
      onClick={() => ed.put({ subject: null, body: before })}
      data-testid="template-words-back"
    >
      {WORDS.goBack}
    </LinkButton>
  );
}

/** The send, or the save: its words while it is out, and the gate a role may not pass. */
function SaveButton({ ed, busy, small }: { ed: EditorWords; busy: boolean; small: boolean }) {
  const { whatsapp, saving } = ed;
  return (
    <Button
      variant="primary"
      {...(small ? { size: "sm" as const } : {})}
      disabled={!ed.check.ok || busy || saving}
      onClick={() => void ed.save()}
      data-testid="template-version-save"
      {...gate("approve", whatsapp ? "send words to WhatsApp" : "save a version")}
    >
      {whatsapp ? (saving ? WORDS.sendingBack : WORDS.sendBack) : saving ? WORDS.saving : WORDS.save}
    </Button>
  );
}

/**
 * A message sheet's acts: Send (or Save) and its Undo once something changed, a new version's Save and Done, else Done
 * alone. In the pane's foot where it has one, docked as every drawer's acts are.
 */
function SheetActs({ p, ed }: { p: VersionEditorProps; ed: EditorWords }) {
  const done = (
    <Button variant="quiet" onClick={p.onClose} data-testid="template-version-cancel">
      {SHEET.done}
    </Button>
  );
  if (!ed.changed && !p.unfiled) return done;
  return (
    <>
      <SaveButton ed={ed} busy={p.busy} small={false} />
      {ed.changed ? (
        <Button
          variant="quiet"
          disabled={ed.saving || ed.ask.asking !== null}
          onClick={ed.undo}
          data-testid="template-version-undo"
        >
          {SHEET.undo}
        </Button>
      ) : (
        done
      )}
    </>
  );
}

/** The acts under the words elsewhere: Save and Cancel, which asks first where something was written. */
function PageActs({ p, ed }: { p: VersionEditorProps; ed: EditorWords }) {
  if (ed.work.asking) return <UnsavedAsk onYes={ed.work.discard} onNo={ed.work.stay} testid="template-version-leave" />;
  return (
    <>
      <SaveButton ed={ed} busy={p.busy} small />
      {p.within ? null : (
        <Button variant="quiet" size="sm" onClick={ed.work.leave} data-testid="template-version-cancel">
          {WORDS.cancel}
        </Button>
      )}
    </>
  );
}

/** The boxes: an email's subject, the words, the menu that puts a value in, and the one line to Ask. */
function WordsBoxes({ p, ed }: { p: VersionEditorProps; ed: EditorWords }) {
  const { channel, slots, values } = p;
  const oneBody = p.oneBody ?? false;
  const box = { slots, readOnly: ed.saving || ed.ask.asking !== null, seats: ed.seats, bare: oneBody };
  return (
    <div className="tpl-ver-write">
      {ed.hasSubject ? (
        <WordsField
          {...box}
          // The subject keeps its label: without it the line over the words is not plainly the subject.
          bare={false}
          name="subject"
          label={WORDS.subjectLabel}
          hint={WORDS.subjectCount(ed.subject.length, ed.kind.subjectMax)}
          lines={1}
          value={ed.subject}
          maxLength={ed.kind.subjectMax}
          onType={(words) => ed.typed("subject", words)}
        />
      ) : null}
      <WordsField
        {...box}
        name="body"
        label={WORDS.bodyLabel}
        hint={bodyHintOf(p, ed)}
        lines={channel === "email" ? 8 : 4}
        value={ed.body}
        onType={(words) => ed.typed("body", words)}
      />
      {slots.keys.length > 0 ? (
        <div className="tpl-ver-values">
          <ValuesMenu
            channel={channel === "whatsapp" ? "sms" : channel}
            slots={slots}
            values={values}
            onPick={ed.seats.add}
          />
        </div>
      ) : null}
      <AskLine
        ask={ed.ask}
        disabled={ed.saving || p.busy}
        fixing={!!p.fix && ed.ask.asking !== null}
        undoBeside={!oneBody}
      />
    </div>
  );
}

/**
 * How one person reads the words, beside them: WhatsApp's bubble where the page hands one, else the email or the text.
 * Not in a message's sheet, where the box is the words and nothing repeats them.
 */
function WordsSeen({ p, ed }: { p: VersionEditorProps; ed: EditorWords }) {
  const { channel } = p;
  return (
    <div className="tpl-ver-see">
      <p className="tpl-ver-caption">{WORDS.previewCaption}</p>
      {channel === "whatsapp" || p.preview ? (
        p.preview?.(ed.written)
      ) : (
        <VersionPreview
          channel={channel}
          words={ed.written}
          values={p.values}
          language={p.language}
          slots={p.slots}
          rules={ed.kind}
        />
      )}
    </div>
  );
}

export function VersionEditor(p: VersionEditorProps) {
  const { channel, slots, oneBody = false, dock = null } = p;
  const ed = useVersionWords(p);
  const { check, problem, written } = ed;
  return (
    <div className="tpl-ver-edit" data-testid="template-version-editor" data-channel={channel}>
      <div className="tpl-ver-split">
        <WordsBoxes p={p} ed={ed} />
        {oneBody ? null : <WordsSeen p={p} ed={ed} />}
      </div>
      {check.ok && check.warnings.length > 0 ? (
        <p className="bc-excl-hint" data-testid="template-version-warnings">
          {check.warnings.join(" ")}
        </p>
      ) : null}
      <FieldError message={problem ?? namedProblem(check, written, slots)} testid="template-version-error" />
      <GoBack p={p} ed={ed} />
      {p.holds && ed.changed ? (
        <p className="bc-excl-hint warn" data-testid="template-words-holds">
          {p.holds}
        </p>
      ) : null}
      {ed.whatsapp && !oneBody ? (
        <p className="tpl-ver-note" data-testid="template-words-note">
          {WORDS.whatsappNote}
        </p>
      ) : null}
      {/* In a message's sheet its acts stand in the pane's foot, docked as every drawer's are; under the words elsewhere. */}
      {oneBody && dock ? createPortal(<SheetActs p={p} ed={ed} />, dock) : null}
      <div className="tpl-ver-acts" data-one-body={oneBody || undefined} hidden={oneBody && !!dock}>
        {oneBody ? dock ? null : <SheetActs p={p} ed={ed} /> : <PageActs p={p} ed={ed} />}
      </div>
    </div>
  );
}

/**
 * Ask writing the words again as the owner asks, in their own words (Ruben, 12 Nov 2026: one input, no preset changes): the
 * words in the boxes sent, every value kept (POST templates/versions/rewrite), and put back into the boxes as if typed; the
 * words they replaced kept for Undo. A refusal is said where the check's sentence is.
 */
function useAskRewrite(o: {
  channel: OwnVersionChannel | "whatsapp";
  language: string;
  written: VersionWords;
  saving: boolean;
  put: (words: VersionWords) => void;
  onProblem: (message: string) => void;
}) {
  const [asking, setAsking] = useState<string | null>(null);
  const [before, setBefore] = useState<VersionWords | null>(null);
  /** `fixing`: the words answer WhatsApp's refusal of this version, and are kept beside it as they come back. */
  const rewrite = async (said: string, fixing?: { template_id: string; reason: string }) => {
    if (asking || o.saving || !o.written.body.trim() || !said.trim()) return;
    setAsking(said);
    const was = o.written;
    const request = {
      channel: o.channel,
      language: o.language,
      subject: was.subject,
      body: was.body,
      ask: said.trim(),
    };
    const r = await templateVerbs
      .rewrite(fixing ? { ...request, fixing } : request)
      .catch(() => ({ ok: false as const, message: WORDS.saveFailed }));
    setAsking(null);
    if (!r.ok) {
      o.onProblem(r.message);
      return;
    }
    setBefore(was);
    o.put({ subject: r.data.subject, body: r.data.body });
  };
  const undo = () => {
    if (!before) return;
    o.put(before);
    setBefore(null);
  };
  return { asking, canUndo: before !== null, rewrite, undo };
}

/**
 * The one line to Ask under the words: the owner's own words for what to change, sent on Return or its round press, and
 * the Undo of the last change beside it. While a refusal is answered, it says Ask is writing.
 */
function AskLine({
  ask,
  disabled,
  fixing,
  undoBeside,
}: {
  ask: ReturnType<typeof useAskRewrite>;
  disabled: boolean;
  fixing: boolean;
  /** Its Undo beside it; in a message's sheet the one Undo stands beside Send. */
  undoBeside: boolean;
}) {
  const [said, setSaid] = useState("");
  const send = () => {
    if (!said.trim() || ask.asking !== null || disabled) return;
    void ask.rewrite(said).then(() => setSaid(""));
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="tpl-ver-ask" data-testid="template-version-ask">
      <div className="tpl-ask-line" data-busy={ask.asking !== null || undefined}>
        <span className="tpl-ask-mark" aria-hidden="true">
          <Icon name="three" size={14} />
        </span>
        <LineField
          className="tpl-ask-words"
          rows={1}
          value={ask.asking !== null ? (fixing ? WORDS.fixing : ask.asking) : said}
          readOnly={ask.asking !== null}
          onChange={(event) => setSaid(event.currentTarget.value)}
          onKeyDown={onKey}
          placeholder={WORDS.askHint}
          aria-label={WORDS.askLabel}
          enterKeyHint="send"
          maxLength={300}
          data-testid="template-version-ask-words"
        />
        <LinePress
          kind="send"
          onClick={send}
          disabled={!said.trim() || ask.asking !== null || disabled}
          aria-label={WORDS.ask}
          data-testid="template-version-ask-send"
          {...gate("approve", "ask for new words")}
        >
          <Icon name="arrow-up" size={14} />
        </LinePress>
      </div>
      {undoBeside && ask.canUndo ? (
        <LinkButton onClick={ask.undo} data-testid="template-version-undo">
          {WORDS.undo}
        </LinkButton>
      ) : null}
    </div>
  );
}
