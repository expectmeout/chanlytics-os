/**
 * An email or a text version as the person who receives it reads it (One message, every channel, step 1): an email's
 * subject over its body, a text's words in a bubble with the STOP line the sender adds under it and what it comes to on
 * the wire. Each slot is filled with the message's own example (contracts fillSlots), as the WhatsApp preview fills its
 * own, in the bubble's tint so what changes from person to person shows, and a hole stays a hole (as written where the
 * page does not know the message's slots, and by its name, as the editor draws it, where it does). A reach-out's email
 * is read the same way, over its six named slots (step 5). What the sender adds and the page does not draw, an email's
 * footer and unsubscribe, is said in one quiet line, the email kind's own. It draws on the kit's inset and places it;
 * the saved version and the editor's draft are read by it the same way, and the editor keeps it in step with each
 * keystroke.
 */
import { Fragment } from "react";
import {
  campaignEmailRules,
  fillSlots,
  slotKnown,
  slotLabel,
  partWritten,
  slotValueOf,
  smsStopLine,
  toSlotParts,
} from "@chanlytics/contracts";
import type { EmailRules, OwnVersionChannel, SlotSet, SlotValue, VersionWords } from "@chanlytics/contracts";
import { Panel } from "../../kit/panel/panel";
import { textCount } from "./versions";
import { TPL_VERSION_WORDS as WORDS } from "./words";

interface VersionPreviewProps {
  channel: OwnVersionChannel;
  words: VersionWords;
  /** One filled value per slot, in order: what the WhatsApp preview fills the same message with. */
  values: readonly SlotValue[];
  language: string;
  /** The message's slots, where the page draws a hole by its name rather than as written (the editor does). */
  slots?: SlotSet;
  /** An email's rules where it is not a campaign message's: they say what the sender adds under the words. */
  rules?: EmailRules<string>;
}

/**
 * The words with each slot filled by its example, in the tint of what varies. A slot with no example is a hole: as it
 * is written, or, where the names are known, by its name (and as a problem where the message has no such slot).
 */
function Filled({ text, values, slots }: { text: string; values: readonly SlotValue[]; slots?: SlotSet }) {
  return (
    <>
      {toSlotParts(text, slots).map((part, i) => {
        if (part.kind === "text") return <Fragment key={i}>{fillSlots(part.text, values, slots)}</Fragment>;
        const value = slotValueOf(slots, part.slot, values);
        if (slots && !value)
          return (
            <span key={i} className="mp-slot" data-unknown={slotKnown(slots, part.slot) ? undefined : "true"}>
              {slotLabel(slots, part.slot)}
            </span>
          );
        return value === undefined || value === null ? (
          <Fragment key={i}>{partWritten(part)}</Fragment>
        ) : (
          <span key={i} className="mp-slot">
            {value}
          </span>
        );
      })}
    </>
  );
}

/** An email: its subject, its body, and a line for what goes with it. */
function EmailPreview({
  words,
  values,
  slots,
  rules,
}: Pick<VersionPreviewProps, "words" | "values" | "slots" | "rules">) {
  const subject = fillSlots(words.subject ?? "", values, slots);
  return (
    <div className="tpl-ver-preview" data-testid="template-version-preview" data-channel="email">
      <Panel variant="inset" className="tpl-mail">
        {subject ? (
          <p className="tpl-mail-subject" data-testid="template-version-subject">
            <Filled text={words.subject ?? ""} values={values} slots={slots} />
          </p>
        ) : null}
        <p className="tpl-mail-body" data-testid="template-version-body">
          <Filled text={words.body} values={values} slots={slots} />
        </p>
      </Panel>
      <p className="bc-excl-hint" data-testid="template-version-note">
        {(rules ?? campaignEmailRules(0)).foot}
      </p>
    </div>
  );
}

/** A text: its words in a bubble, the STOP line under it and the count the carriers bill by. */
function TextPreview({ words, values, language, slots }: Omit<VersionPreviewProps, "channel" | "rules">) {
  const count = textCount(words.body, language);
  return (
    <div className="tpl-ver-preview" data-testid="template-version-preview" data-channel="sms">
      <Panel variant="inset" size="sm" className="tpl-text-bubble">
        <p className="tpl-text-words" data-testid="template-version-body">
          <Filled text={words.body} values={values} slots={slots} />
        </p>
      </Panel>
      <p className="tpl-text-stop" data-testid="template-version-stop">
        {smsStopLine(language)}
      </p>
      <p className="bc-excl-hint" data-testid="template-version-count">
        {WORDS.counter(count.chars, count.parts)}
      </p>
    </div>
  );
}

/** The version's preview on its channel. */
export function VersionPreview({ channel, words, values, language, slots, rules }: VersionPreviewProps) {
  return channel === "email" ? (
    <EmailPreview words={words} values={values} slots={slots} rules={rules} />
  ) : (
    <TextPreview words={words} values={values} language={language} slots={slots} />
  );
}
