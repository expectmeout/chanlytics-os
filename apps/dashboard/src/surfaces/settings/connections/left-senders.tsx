/**
 * Chanlytics — Connections › Your mailbox › Left in your mailbox (00483): who the connected mailbox left mail from, and
 * why, newest first; and the senders the workspace said are not people. Read on a press: the list is written as mail
 * arrives, and nothing on the page's first load waits for it. "It's a person" brings a sender in (their mail from now on,
 * and their last six months with it); Undo takes back what was said of a sender. Its words are contracts'
 * (email/mailbox-senders.ts); who may change it is the block's own gate (the settings permission).
 */
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import {
  MAILBOX_LEFT_WHY_WORDS,
  MAILBOX_SENDERS_WORDS as W,
  senderDomainOffered,
  type MailboxSenderVerdict,
  type MailboxSendersDto,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { LinkButton } from "../../kit/link-button/link-button";
import { Switch } from "../../kit/switch/switch";
import type { DelState } from "../../people/person/ctx";
import { refusalToast, type LegacyFlash } from "../../legacy-verbs";

/** How many senders the list draws before it says how many more there are. */
const SENDERS_DRAWN = 20;

/** One row of the block's grammar: what it says, and its presses. */
function senderRow({
  key,
  says,
  sub,
  acts,
  testid,
}: {
  key: string;
  says: string;
  sub: string;
  acts: ReactNode;
  testid: string;
}) {
  return (
    <div key={key} className="set-dom set-dom-note" data-testid={testid}>
      <span />
      <span className="t">
        <span>{says}</span>
        <span className="dim">{sub}</span>
      </span>
      <span />
      <span />
      <span className="set-int-actions">{acts}</span>
    </div>
  );
}

export function LeftSenders({ owner, flash }: { owner: boolean; flash: (f: LegacyFlash) => void }) {
  const [list, setList] = useState<MailboxSendersDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    const r = await api()("GET mailbox-senders", {});
    if (r.ok) setList(r.data);
    else flash(refusalToast(r, W.failed));
  };
  const sort = async (sender: string, verdict: MailboxSenderVerdict | null) => {
    setBusy(sender);
    const r = await api()("POST mailbox-senders", { body: { sender, verdict } });
    setBusy(null);
    if (!r.ok) return flash(refusalToast(r, W.failed));
    flash({ msg: <>{verdict === "person" ? W.broughtIn(sender) : W.undone(sender)}</> });
    await load();
  };
  if (!list)
    return senderRow({
      key: "left",
      says: W.title,
      sub: W.lead,
      acts: (
        <LinkButton onClick={() => void load()} data-testid="mailbox-left-show">
          {W.show}
        </LinkButton>
      ),
      testid: "mailbox-left",
    });
  const said = list.said.filter((s) => s.verdict === "automated");
  return (
    <>
      {senderRow({
        key: "left",
        says: W.title,
        sub: list.left.length ? W.lead : W.empty,
        acts: null,
        testid: "mailbox-left",
      })}
      {list.left.slice(0, SENDERS_DRAWN).map((l) =>
        senderRow({
          key: l.address,
          says: l.name ? `${l.name} · ${l.address}` : l.address,
          sub: `${MAILBOX_LEFT_WHY_WORDS[l.why]} · ${W.emails(l.count)}`,
          acts: owner ? (
            <LinkButton
              onClick={() => void sort(l.address, "person")}
              disabled={busy !== null}
              data-testid="mailbox-left-bring-in"
            >
              {W.bringIn}
            </LinkButton>
          ) : null,
          testid: "mailbox-left-row",
        }),
      )}
      {list.left.length > SENDERS_DRAWN
        ? senderRow({
            key: "more",
            says: W.more(list.left.length - SENDERS_DRAWN),
            sub: "",
            acts: null,
            testid: "mailbox-left-more",
          })
        : null}
      {said.length ? senderRow({ key: "said", says: W.saidTitle, sub: "", acts: null, testid: "mailbox-said" }) : null}
      {said.map((s) =>
        senderRow({
          key: `said-${s.sender}`,
          says: s.sender,
          sub: MAILBOX_LEFT_WHY_WORDS.said,
          acts: owner ? (
            <LinkButton
              onClick={() => void sort(s.sender, null)}
              disabled={busy !== null}
              data-testid="mailbox-said-undo"
            >
              {W.undo}
            </LinkButton>
          ) : null,
          testid: "mailbox-said-row",
        }),
      )}
    </>
  );
}

/**
 * Not a person, in Delete person's sheet (00483): for someone with an email address, a sender of automated mail the
 * mailbox took for a person. On, the delete also keeps their mail in the mailbox from now on; and, where their domain is
 * no free-mail provider's, every address at it with a second switch.
 */
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
        label={W.notAPerson}
        readOnly={del.busy}
        data-testid="delete-not-a-person"
      />
      {del.bot && domain ? (
        <Switch
          checked={!!del.domain}
          onCheckedChange={(on) => setDel((d) => ({ ...d, domain: on }))}
          label={W.wholeDomain(domain)}
          readOnly={del.busy}
          data-testid="delete-not-a-person-domain"
        />
      ) : null}
    </>
  );
}
