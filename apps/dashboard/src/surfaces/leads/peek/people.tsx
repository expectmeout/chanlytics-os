/**
 * In People (decision 0052, canvas A §1.2): who works at this business, from People's own rows (each row's `worksAt`),
 * the one waiting on you first, each a door to their page; a stand-in's reply signer is offered there too, with the same
 * press, Undo and x as their page (people/person/name-offer.tsx). Nothing for a lead nobody works at, or before People
 * is read. A company the people card found (00430) says, beside it, the people its source named on it: the one its
 * reach-out writes to first, each with their title and public profile, and where they came from; and, for who may find
 * leads, Write to them instead beside another with a work address, while nothing was written to the company (00430
 * lead_addressee_choose, whose refusals say the rest). Every word is contracts'.
 */
import { useState } from "react";
import {
  LEAD_ADDRESSEE_WORDS,
  LEAD_COMPANY_WORDS,
  WORKS_AT_WORDS,
  leadPeopleIndex,
  leadPeopleOf,
} from "@chanlytics/contracts";
import type { LeadCompanyPersonVM, LeadCompanyVM, PersonRowVM } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { canDo, mayAtLeast, refusalToast } from "../../legacy-verbs";
import { chooseAddressee } from "../surface";
import { surfaceValue } from "../../surface-values";
import { NameOffer } from "../../people/person/name-offer";
import type { PeekActs } from "./types";
import { wantPerson } from "../../people/want-person";

/**
 * The people People holds who work at this lead, in the order the row names them (contracts leadPeopleOf): the one a
 * member knows the business by, then whoever waits on you, then the rest.
 */
function peopleAt(lead: { id: string; contactId: string | null }): PersonRowVM[] {
  const rows = surfaceValue("people")?.rows ?? [];
  // Its own person, where People does not hold them yet: asked for once (want-person.ts; R10).
  wantPerson(lead.contactId);
  const index = leadPeopleIndex(rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return leadPeopleOf(lead, index)
    .order.map((id) => byId.get(id))
    .filter((r): r is PersonRowVM => !!r);
}

/**
 * The people a company's source named on it (00430): the addressee first, each with what they do and their profile, and
 * the door that makes another of them the one its reach-out writes to. Only who may find leads is offered it: their
 * address is checked first, a fraction of a cent. What the door said is the page's toast.
 */
export function LeadPeekCompany({
  company,
  lead,
  on,
}: {
  company: LeadCompanyVM | null;
  /** The company's lead: its id, what the door names, and its name, what the toast says. */
  lead: { id: string; name: string };
  on: PeekActs;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!company || !company.people.length) return null;
  const AW = LEAD_ADDRESSEE_WORDS;
  const may = canDo("find");
  const choose = async (p: LeadCompanyPersonVM) => {
    if (busy !== null) return;
    setBusy(p.index);
    const r = await chooseAddressee(lead.id, p.index).finally(() => setBusy(null));
    on.say(r.ok ? { tone: "ok", msg: AW.done(p.name, lead.name, r.data.email_state === "checking") } : refusalToast(r));
  };
  return (
    <section className="pk-box pk-people" aria-label={company.head} data-testid="peek-company">
      <div className="pk-people-head">
        {company.head}
        {company.size ? ` · ${company.size}` : ""}
      </div>
      <ul className="pk-people-list">
        {company.people.map((p) => (
          <li key={p.index} className="pk-people-row" data-testid="peek-company-person">
            <span className="pk-people-line">
              <span>{p.name}</span>
              <span className="pk-people-said" data-needs={p.addressee || undefined}>
                {p.addressee ? LEAD_COMPANY_WORDS.writesTo : (p.what ?? "")}
              </span>
            </span>
            {p.addressee && p.what ? <span className="pk-people-said">{p.what}</span> : null}
            {p.profile ? (
              <LinkButton href={p.profile} target="_blank" rel="noopener noreferrer" data-testid="peek-company-profile">
                {LEAD_COMPANY_WORDS.profile}
              </LinkButton>
            ) : null}
            {p.choose && may ? (
              <LinkButton disabled={busy !== null} onClick={() => void choose(p)} data-testid="peek-company-choose">
                {busy === p.index ? AW.choosing : AW.door}
              </LinkButton>
            ) : null}
          </li>
        ))}
      </ul>
      {company.source ? <p className="pk-alt-why">{company.source}</p> : null}
    </section>
  );
}

export function LeadPeekPeople({ lead, on }: { lead: { id: string; contactId: string | null }; on: PeekActs }) {
  const people = peopleAt(lead);
  if (!people.length) return null;
  return (
    <section className="pk-box pk-people" aria-label={WORKS_AT_WORDS.inPeople(people.length)} data-testid="peek-people">
      <div className="pk-people-head">{WORKS_AT_WORDS.inPeople(people.length)}</div>
      <ul className="pk-people-list">
        {people.map((r) => (
          <li key={r.id} className="pk-people-row" data-testid="peek-person">
            <span className="pk-people-line">
              <LinkButton onClick={() => on.onOpenPerson(r.id)} data-testid="peek-person-open">
                {r.name}
              </LinkButton>
              <span className="pk-people-said" data-needs={r.state === "needs_you" || undefined}>
                {r.state === "needs_you" ? r.stateLabel : r.lastContact.label}
              </span>
            </span>
            {r.signer ? (
              <NameOffer
                personId={r.id}
                messageId={r.signer.messageId}
                name={r.signer.name}
                fact={r.signer.fact}
                source={r.signer.day}
                canRecord={mayAtLeast("operator")}
                say={on.say}
                onChanged={() => undefined}
                testid="peek-name-offer"
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
