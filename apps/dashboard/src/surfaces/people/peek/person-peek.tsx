/**
 * A person seen over People's list on a desk (canvas A, PEEK-01): the pane beside the rows the Pipeline's and Leads' peeks
 * are (`aside.pk.pl-peek`, not a modal sheet, so the list behind it stays pressable and J and K walk it). Its head is who
 * they are and where they stand (their row's, until their read lands, then the page's own sentence), with the arrows that
 * walk the view ("‹ 4 of 24 ›") and Close; its body is the person page's own parts, unchanged: Up next, their last words
 * and their newest note; its foot the door to their thread and the door to their full page. Every word is contracts'.
 *
 * Hookless: its state is People's (usePeoplePeek). A yes is recorded on their page (the rail's fold), so Up next's rung
 * for it says the fact here and offers no press; the note is read, written on their page.
 */
import { NOTE_WORDS, PERSON_PEEK_WORDS as W, personHeadStateOf, personTabRoute } from "@chanlytics/contracts";
import type { PersonRowVM, PersonVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { routeDoor } from "../../legacy-verbs";
import type { FlashFn } from "../person-verbs";
import type { PersonWalk } from "../walk";
import { BusinessTile } from "../person/business";
import { dealPersonOf } from "../person/ctx";
import { PersonWalkNav, openWith, threadCtaOf } from "../person/hero";
import { PersonNotes } from "../person/notes";
import { LastWords, UpNext } from "../person/overview";

export interface PersonPeekProps {
  id: string;
  /** Its mount's hold on the aside, which plays it out on a desk as the peek closes (peek-leaves.ts). */
  asideRef?: (el: HTMLElement | null) => void;
  row: PersonRowVM | null;
  person: PersonVM | null;
  failed: string | null;
  missing: boolean;
  walk: PersonWalk | null;
  canRecord: boolean;
  flash: FlashFn;
  onStep: (to: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

/** Who they are and where they stand: the row's at once, the page's own words once they are read. */
function peekHead(p: PersonPeekProps) {
  const { person, row, walk, onStep, onClose } = p;
  const name = person?.head.name ?? row?.name ?? "";
  const head = person ? personHeadStateOf(person) : null;
  const state = head?.state ?? row?.state ?? null;
  const word = head?.word ?? row?.stateLabel ?? "";
  return (
    <div className="pk-head">
      {person?.head.face.kind === "tile" ? (
        <BusinessTile face={person.head.face} size="lg" />
      ) : (
        <Face person={{ name, initials: person?.initials ?? row?.initials ?? "" }} size="lg" />
      )}
      <div className="pk-titles">
        <h2 className="pk-name">{name}</h2>
        <div className="pk-sub">
          {state ? <StatePill kind="person" value={state} label={word} testid="person-peek-state" /> : null}
        </div>
        {head?.sentence ? <p className="pp-glance-why">{head.sentence}</p> : null}
      </div>
      {walk ? <PersonWalkNav walk={walk} step={onStep} /> : null}
      <Button
        iconOnly
        size="sm"
        variant="quiet"
        id="people-peek-close"
        aria-label={W.close}
        title={W.close}
        onClick={onClose}
        data-testid="person-peek-close"
      >
        <Icon name="x" size={13} />
      </Button>
    </div>
  );
}

/** The page's own parts over the person read: Up next, their last words, their newest note. */
function peekBody(p: PersonPeekProps) {
  const { person, failed, missing, row, canRecord, flash, onRetry } = p;
  if (missing) return <EmptyState kind="line" title={W.missing.title} body={W.missing.body} />;
  if (!person)
    return failed !== null ? (
      <FailedRead kind="card" what={W.what} why={failed || null} onRetry={onRetry} testid="person-peek-failed" />
    ) : (
      <div className="route-reading pp-glance-reading" role="status" aria-busy="true">
        {W.reading}
      </div>
    );
  const c = { p: person, canRecord, flash, load: onRetry };
  return (
    <>
      <UpNext c={{ ...c, dealP: dealPersonOf(person, row), compose: openWith(c) }} />
      {person.thin ? null : <LastWords c={c} />}
      {person.noteList.length ? (
        <section className="cl-prof-section" aria-label={NOTE_WORDS.title}>
          <h2 className="cl-prof-section-title">{NOTE_WORDS.title}</h2>
          <PersonNotes p={person} canEdit={false} isOwner={false} flash={flash} onChanged={onRetry} compact />
        </section>
      ) : null}
    </>
  );
}

/** The peek: its head, its body, and the doors to their thread and their full page. */
export function PersonPeek(p: PersonPeekProps) {
  const name = p.person?.head.name ?? p.row?.name ?? "";
  const cta = p.person ? threadCtaOf({ p: p.person }) : null;
  return (
    <aside
      ref={p.asideRef}
      className="pk pl-peek pp-peek"
      role="dialog"
      aria-label={W.label(name)}
      data-testid="person-peek"
    >
      {peekHead(p)}
      <div className="pk-body pp-glance-body">{peekBody(p)}</div>
      <div className="pp-glance-foot">
        {cta ? (
          <Button variant="primary" size="sm" {...routeDoor(cta.to)} data-testid="person-peek-thread">
            {cta.label}
          </Button>
        ) : null}
        <LinkButton {...routeDoor(personTabRoute(p.id, "overview"))} data-testid="person-peek-page">
          {W.page} <Icon name="chevron" size={10} />
        </LinkButton>
      </div>
    </aside>
  );
}
