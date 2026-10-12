/**
 * In People (decision 0052, canvas A §1.2): who works at this business, from People's own rows (each row's `worksAt`),
 * the one waiting on you first, each a door to their page; a stand-in's reply signer is offered there too, with the same
 * press, Undo and x as their page (people/person/name-offer.tsx). Nothing for a lead nobody works at, or before People
 * is read. Every word is contracts'.
 */
import { WORKS_AT_WORDS } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { mayAtLeast } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { NameOffer } from "../../people/person/name-offer";
import type { PeekActs } from "./types";

/** The people People holds who work at this lead, the ones waiting on you first. */
function peopleAt(leadId: string): PersonRowVM[] {
  const rows = surfaceValue("people")?.rows ?? [];
  return rows
    .filter((r) => r.worksAt?.leadId === leadId)
    .sort((a, b) => Number(b.state === "needs_you") - Number(a.state === "needs_you"));
}

export function LeadPeekPeople({ leadId, on }: { leadId: string; on: PeekActs }) {
  const people = peopleAt(leadId);
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
