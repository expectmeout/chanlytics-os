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
 * A reach-out's email is written here too (step 5): the same editor over its own slot set (six named slots) and its own
 * rules (`rules`: a subject only on the first step, the cold email's limits, its own sentences), the one check and the one
 * preview reading both.
 */
import { useState } from "react";
import { campaignEmailRules, namedProblem, validateEmailVersion, validateSmsVersion } from "@chanlytics/contracts";
import type { EmailRules, OwnVersionChannel, SlotSet, SlotValue, VersionWords } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { gate } from "../../legacy-verbs";
import { tabDraft, unsavedAskPart, useLegacyUnsavedWork } from "../../legacy-parts";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { useSlotSeats } from "./slots/slot-seats";
import { ValuesMenu, WordsField } from "./slots/words-field";
import { VersionPreview } from "./version-preview";
import type { VersionDraft } from "./verbs";
import { TPL_VERSION_WORDS as WORDS } from "./words";

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

interface VersionEditorProps {
  /** The message's name: what the version is filed under. */
  name: string;
  channel: OwnVersionChannel;
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
  /** The save, answered with the server's word; null when it did not start. */
  onSave: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  onClose: () => void;
}

export function VersionEditor(p: VersionEditorProps) {
  const { name, channel, language, start, slots, values, busy, onSave, onClose } = p;
  const kind = p.rules ?? campaignEmailRules(slots);
  // An email with no subject of its own (a reach-out's later step answers the one before) has one box of words.
  const hasSubject = channel === "email" && kind.subject;
  const [first] = useState(() => keptWords(name, language, channel) ?? start);
  const [subject, setSubject] = useState(first.subject ?? "");
  const [body, setBody] = useState(first.body);
  // What the server refused with, until the words change; the check's own sentence is read as they are typed.
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const typed = (words: string, set: (words: string) => void) => {
    setProblem(null);
    set(words);
  };
  const seats = useSlotSeats({ subject, body }, (to, words) => typed(words, to === "subject" ? setSubject : setBody));
  const written = { subject: hasSubject ? subject : null, body };
  const check =
    channel === "email"
      ? validateEmailVersion({ subject, body }, kind)
      : validateSmsVersion({ body }, slots.keys.length, language);
  const work = useLegacyUnsavedWork(DRAFT_KIND, draftKey(name, language, channel), {
    value: { subject, body },
    dirty: subject !== (start.subject ?? "") || body !== start.body,
    onLeave: onClose,
  });
  const save = async () => {
    if (!check.ok || busy || saving) return;
    setSaving(true);
    setProblem(null);
    const { subject: filed, body: words } = check.value;
    // A save that never reached the server says so; a refusal it did give is said as it came.
    const r = await onSave({ name, language, channel, ...(filed ? { subject: filed } : {}), body: words }).catch(
      () => ({ ok: false as const, message: WORDS.saveFailed }),
    );
    if (r?.ok) {
      work.done();
      onClose();
      return;
    }
    setSaving(false);
    setProblem(r ? r.message : null);
  };
  const UnsavedAsk = unsavedAskPart();
  const box = { slots, readOnly: saving, seats };
  return (
    <div className="tpl-ver-edit" data-testid="template-version-editor" data-channel={channel}>
      <div className="tpl-ver-split">
        <div className="tpl-ver-write">
          {hasSubject ? (
            <WordsField
              {...box}
              name="subject"
              label={WORDS.subjectLabel}
              hint={WORDS.subjectCount(subject.length, kind.subjectMax)}
              lines={1}
              value={subject}
              maxLength={kind.subjectMax}
              onType={(words) => typed(words, setSubject)}
            />
          ) : null}
          <WordsField
            {...box}
            name="body"
            label={WORDS.bodyLabel}
            lines={channel === "email" ? 8 : 4}
            value={body}
            onType={(words) => typed(words, setBody)}
          />
          {slots.keys.length > 0 ? (
            <div className="tpl-ver-values">
              <ValuesMenu channel={channel} slots={slots} values={values} onPick={seats.add} />
            </div>
          ) : null}
        </div>
        <div className="tpl-ver-see">
          <p className="tpl-ver-caption">{WORDS.previewCaption}</p>
          <VersionPreview
            channel={channel}
            words={written}
            values={values}
            language={language}
            slots={slots}
            rules={kind}
          />
        </div>
      </div>
      {check.ok && check.warnings.length > 0 ? (
        <p className="bc-excl-hint" data-testid="template-version-warnings">
          {check.warnings.join(" ")}
        </p>
      ) : null}
      <FieldError message={problem ?? namedProblem(check, written, slots)} testid="template-version-error" />
      <div className="tpl-ver-acts">
        {work.asking ? (
          <UnsavedAsk onYes={work.discard} onNo={work.stay} what={WORDS.leaves} testid="template-version-leave" />
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={!check.ok || busy || saving}
              onClick={() => void save()}
              data-testid="template-version-save"
              {...gate("approve", "save a version")}
            >
              {saving ? WORDS.saving : WORDS.save}
            </Button>
            <Button variant="quiet" size="sm" onClick={work.leave} data-testid="template-version-cancel">
              {WORDS.cancel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
