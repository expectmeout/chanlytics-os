/**
 * "Use this name" (decision 0052, canvas A §1.2): a reply's signer offered as a person's name, said the same way wherever
 * the reply is read (their page's head, the Inbox's thread header), with one press to take it, Undo in its toast, and
 * x to decline it for everyone. The door is POST people/:id/name (00412's person_name_adopt, _undo and _decline), which
 * answers when it is done; People, the threads and Leads are read again behind it (the refresh map). Every word is
 * contracts' PERSON_NAME_WORDS.
 *
 * Small on purpose: the Inbox draws it, and takes nothing of People's page with it (a route's own JS has a ceiling).
 * Honest toasts (canvas A §2): the press has an inverse door, so its toast carries Undo; Undo's and the x's do not. The
 * first time a member takes a name, the toast says once why the offer exists.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { PERSON_NAME_WORDS, type PersonNameAct } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { meNow } from "../../legacy-verbs";

/** What the page's toast is told. */
type NameSay = (flash: { tone?: string; msg: ReactNode; ms?: number; undo?: (() => void) | null }) => void;

/** The door: use, put back, or decline a reply's signer's name. */
function actOnPersonName(personId: string, body: PersonNameAct) {
  return api()("POST people/[id]/name", { params: { id: personId }, body });
}

/** Where a member's first taken name is remembered, so the line that says why is said once. */
const FIRST_KEY = "chanlytics-person-named-once";

/** Whether this member has been told why a name is offered; telling them marks it. Storage refused: not told. */
function firstTimeFor(member: string | null | undefined): boolean {
  if (!member) return false;
  try {
    const told = (localStorage.getItem(FIRST_KEY) ?? "").split(",");
    if (told.includes(member)) return false;
    localStorage.setItem(FIRST_KEY, [...told.filter(Boolean), member].join(","));
    return true;
  } catch {
    return false;
  }
}

/** Undo of a name taken: the business's name back (or none), settled so the same sign-off is not taken again. */
export async function putNameBack(personId: string, say: NameSay, onChanged: () => void): Promise<void> {
  const r = await actOnPersonName(personId, { act: "undo" });
  if (!r.ok) {
    say({ tone: "danger", msg: r.message || PERSON_NAME_WORDS.refused.settled });
    return;
  }
  const back = (r.data as { name?: string | null }).name ?? null;
  say({ msg: PERSON_NAME_WORDS.backTo(back) });
  onChanged();
}

interface NameOfferProps {
  personId: string;
  /** The reply the name was read from. */
  messageId: string;
  /** The name it offers, for the toast where the door does not say it. */
  name: string;
  /** "Priya Nair signed the reply", and its day, dim after it. */
  fact: string;
  source: string | null;
  /** An owner's or an operator's press; anyone else reads the fact alone. */
  canRecord: boolean;
  say: NameSay;
  /** The door answered: the page reads what it draws again. */
  onChanged: () => void;
  testid?: string;
}

/** The notice: the fact, its day, Use this name, and x. */
export function NameOffer({
  personId,
  messageId,
  name,
  fact,
  source,
  canRecord,
  say,
  onChanged,
  testid,
}: NameOfferProps) {
  const [busy, setBusy] = useState<"use" | "decline" | null>(null);
  const use = async () => {
    if (busy) return;
    setBusy("use");
    const r = await actOnPersonName(personId, { act: "adopt", message_id: messageId });
    setBusy(null);
    if (!r.ok) {
      say({ tone: "danger", msg: r.message || PERSON_NAME_WORDS.refused.settled });
      return;
    }
    const named = (r.data as { name?: string | null }).name ?? name;
    say({
      msg: firstTimeFor(meNow()?.id) ? (
        <>
          {PERSON_NAME_WORDS.named(named)}
          <br />
          <span className="cl-prof-notice-why">{PERSON_NAME_WORDS.firstTime}</span>
        </>
      ) : (
        PERSON_NAME_WORDS.named(named)
      ),
      ms: 15000,
      undo: () => void putNameBack(personId, say, onChanged),
    });
    onChanged();
  };
  const decline = async () => {
    if (busy) return;
    setBusy("decline");
    const r = await actOnPersonName(personId, { act: "decline", message_id: messageId });
    setBusy(null);
    if (!r.ok) {
      say({ tone: "danger", msg: r.message || PERSON_NAME_WORDS.refused.no_signer });
      return;
    }
    say({ msg: PERSON_NAME_WORDS.declined });
    onChanged();
  };
  return (
    <div className="cl-prof-notice" role="group" aria-label={fact} data-testid={testid ?? "person-name-notice"}>
      <span className="cl-prof-notice-fact">{fact}</span>
      {source ? <span className="cl-prof-notice-src">{source}</span> : null}
      {canRecord ? (
        <span className="cl-prof-notice-acts">
          <Button
            size="sm"
            onClick={() => void use()}
            aria-busy={busy === "use" || undefined}
            data-testid="person-name-use"
          >
            {PERSON_NAME_WORDS.use}
          </Button>
          <Button
            size="sm"
            variant="quiet"
            iconOnly
            aria-label={PERSON_NAME_WORDS.notTheirs}
            title={PERSON_NAME_WORDS.notTheirs}
            onClick={() => void decline()}
            aria-busy={busy === "decline" || undefined}
            data-testid="person-name-decline"
          >
            <Icon name="x" size={11} />
          </Button>
        </span>
      ) : null}
    </div>
  );
}
