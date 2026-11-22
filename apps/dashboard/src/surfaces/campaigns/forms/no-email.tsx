/**
 * Said where no reply by email can go from the business yet (the sheet's read, `email`): the fact, what it means for
 * the thank-you a visitor reads, and the one act where the business has one, Connect email. Where the business has no
 * door to open, the send door's own reason stands where the act would. Drawn under what happens Next and before a
 * first publish, the two places an owner decides what a visitor is told.
 *
 * Nothing where email can send, and nothing where that could not be checked just now: a question nobody could ask is
 * not a no, and it is asked again as the sheet is read again.
 */
import { CONNECTIONS_PAGE, type FormSheetDto } from "@chanlytics/contracts";
import { routeDoor } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Notice } from "../../kit/notice/notice";
import { FORMS_WORDS as W } from "./words";

/** Whether the sheet says it: email cannot send, and that was read (a sheet read before it was asked says nothing). */
export const saysNoEmail = (email: FormSheetDto["email"]): boolean => !!email && !email.ready && !email.unchecked;

export function NoEmailNotice({ email, testid }: { email: FormSheetDto["email"]; testid: string }) {
  if (!email || !saysNoEmail(email)) return null;
  const reason = email.connect || !email.why ? "" : ` ${email.why}`;
  return (
    <Notice
      fact={
        <>
          <b>{W.noEmail.fact}</b> {W.noEmail.thanks}
          {reason}
        </>
      }
      act={
        email.connect ? (
          <Button size="sm" {...routeDoor(CONNECTIONS_PAGE)} data-testid={`${testid}-connect`}>
            {W.noEmail.connect}
          </Button>
        ) : null
      }
      label={W.noEmail.label}
      testid={testid}
    />
  );
}
