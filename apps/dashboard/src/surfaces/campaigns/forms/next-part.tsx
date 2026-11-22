/**
 * What happens after a request (the Forms canvas, "What happens next"): each line changed in place. Telling the
 * business is always on; carrying on in WhatsApp is offered where the business has a number; AI drafts the reply and
 * never sends the first one alone; when they write back AI carries on, as with anyone who writes in; when they would
 * like to come is asked as a question. The thank-you's words are the form's own.
 */
import { useId, useState } from "react";
import { FORM_LIMITS, type FormDescription, type FormSheetDto } from "@chanlytics/contracts";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Switch } from "../../kit/switch/switch";
import { Button } from "../../kit/button/button";
import { NoEmailNotice, saysNoEmail } from "./no-email";
import type { DraftEditing } from "./use-forms";
import { FORMS_WORDS as W } from "./words";

const N = W.next;

/** One line: what it is, what it does, and how it stands (a fixed word, or a switch). */
function NextLine({ title, body, end }: { title: string; body: string; end: React.ReactNode }) {
  return (
    <div className="fmv-next">
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
      {end}
    </div>
  );
}

/** A line the owner turns on or off. */
function Switched({
  words,
  on,
  locked,
  canChange,
  onTurn,
  testid,
}: {
  words: readonly [string, string];
  on: boolean;
  /** Why it cannot be on, said in place of what it does. */
  locked?: string | null;
  canChange: boolean;
  onTurn: (on: boolean) => void;
  testid: string;
}) {
  const labelId = useId();
  return (
    <div className="fmv-next">
      <div>
        <strong id={labelId}>{words[0]}</strong>
        <span>{locked ?? words[1]}</span>
      </div>
      <Switch
        labelledBy={labelId}
        checked={on && !locked}
        onCheckedChange={onTurn}
        readOnly={!canChange || !!locked}
        data-testid={testid}
      />
    </div>
  );
}

interface NextPartProps {
  editing: DraftEditing;
  /** Whether the business has a chat a visitor can carry on in. */
  chat: boolean;
  /** Whether a reply by email can go from the business now: said under the lines where it cannot. */
  email: FormSheetDto["email"];
  canChange: boolean;
}

export function NextPart({ editing, chat, email, canChange }: NextPartProps) {
  const { draft } = editing;
  const [thanking, setThanking] = useState(false);
  const turn = (next: Partial<FormDescription["next"]>) =>
    editing.change({ ...draft, next: { ...draft.next, ...next } });
  return (
    <div className="fmv-nexts" data-testid="forms-next">
      <NextLine title={N.told[0]} body={N.told[1]} end={<em>{N.told[2]}</em>} />
      <Switched
        words={[N.chat[0], N.chat[1]]}
        on={draft.next.chat}
        locked={chat ? null : N.chatNone}
        canChange={canChange}
        onTurn={(on) => turn({ chat: on })}
        testid="forms-next-chat"
      />
      <Switched
        words={[N.draft[0], saysNoEmail(email) ? N.draftNoEmail : N.draft[1]]}
        on={draft.next.draft}
        canChange={canChange}
        onTurn={(on) => turn({ draft: on })}
        testid="forms-next-draft"
      />
      <NextLine title={N.back[0]} body={N.back[1]} end={<em>{N.back[2]}</em>} />
      <NextLine title={N.come[0]} body={N.come[1]} end={<em>{N.come[2]}</em>} />
      {thanking ? (
        <div className="fmv-next" data-chosen="">
          <Field
            label={N.thanksLabel}
            rows={2}
            value={draft.thanks}
            onValueChange={(thanks) => editing.change({ ...draft, thanks })}
            maxLength={FORM_LIMITS.thanks}
            data-testid="forms-next-thanks"
          />
        </div>
      ) : (
        <NextLine
          title={N.thanks}
          body={`“${draft.thanks}”`}
          end={
            canChange ? (
              <Button
                iconOnly
                variant="quiet"
                size="sm"
                aria-label={N.thanksLabel}
                onClick={() => setThanking(true)}
                data-testid="forms-next-thanks-edit"
              >
                <Icon name="pencil" size={13} />
              </Button>
            ) : null
          }
        />
      )}
      <NoEmailNotice email={email} testid="forms-next-no-email" />
    </div>
  );
}
