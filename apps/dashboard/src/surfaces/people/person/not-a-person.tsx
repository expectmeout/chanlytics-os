/**
 * Not a person, in Delete person's sheet (00483): for someone with an email address, a sender of automated mail the
 * mailbox took for a person. On, the delete also keeps their mail in the mailbox from now on; and, where their domain is
 * no free-mail provider's, every address at it with a second switch. Its words are contracts' (email/mailbox-senders.ts).
 */
import type { Dispatch, SetStateAction } from "react";
import { MAILBOX_SENDERS_WORDS as S, senderDomainOffered } from "@chanlytics/contracts";
import { Switch } from "../../kit/switch/switch";
import type { DelState } from "./ctx";

export function NotAPersonSwitches(o: {
  email: string | null;
  del: DelState;
  setDel: Dispatch<SetStateAction<DelState>>;
}) {
  const { email, del, setDel } = o;
  if (!email) return null;
  // The whole domain is offered where it is no free-mail provider's; the server also refuses the business's own.
  const domain = senderDomainOffered(email, []);
  return (
    <>
      <Switch
        checked={!!del.bot}
        onCheckedChange={(on) => setDel((d) => ({ ...d, bot: on, domain: on ? d.domain : false }))}
        label={S.notAPerson}
        readOnly={del.busy}
        data-testid="delete-not-a-person"
      />
      {del.bot && domain ? (
        <Switch
          checked={!!del.domain}
          onCheckedChange={(on) => setDel((d) => ({ ...d, domain: on }))}
          label={S.wholeDomain(domain)}
          readOnly={del.busy}
          data-testid="delete-not-a-person-domain"
        />
      ) : null}
    </>
  );
}
