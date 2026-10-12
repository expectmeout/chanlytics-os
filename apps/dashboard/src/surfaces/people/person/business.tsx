/**
 * The business a person works at (decision 0052, canvas A §1.4): the line under their name (the business, a door to its
 * sheet; a stand-in's story; or that the business's details were removed), the Works at row in the rail, and the business
 * sheet, the one home of the business's details on their page. Every word and every fact is contracts'
 * (person-page/business.ts over Leads' own peek view model); the sheet is the kit's. The sheet's only press that leaves
 * the page is Open in Leads; a person at the business is a door to their own page.
 */
import { useEffect, useReducer, useState } from "react";
import { WORKS_AT_WORDS } from "@chanlytics/contracts";
import type { BusinessRecordVM, PersonFaceVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Sheet } from "../../kit/sheet/sheet";
import { routeDoor } from "../../legacy-verbs";
import { peekPerson, personDetail, setPersonBusiness } from "../people-detail";
import type { PageCtx } from "./ctx";

/** A business's tile: its initials on the tint its kind decides, the listing's photo over them where there is one. */
export function BusinessTile({ face, size }: { face: PersonFaceVM; size?: "sm" | "lg" | "xl" }) {
  return (
    <Face
      initials={face.initials}
      {...(face.image ? { photo: face.image } : {})}
      {...(size ? { size } : {})}
      className="cl-prof-brand"
      data-tint={face.tint ?? undefined}
    />
  );
}

/** The line under the name: the business as a door to its sheet, a stand-in's story so far, or the business removed. */
export function HeadLine({ c }: { c: PageCtx }) {
  const line = c.p.head.line;
  if (!line) return null;
  if (line.kind === "business")
    return (
      <LinkButton
        className="cl-prof-business"
        aria-label={line.label}
        onClick={() => c.setSheet(true)}
        data-testid="person-business"
      >
        {line.text}
        <Icon name="chevron" size={11} />
      </LinkButton>
    );
  return (
    <p className="cl-prof-origin" data-kind={line.kind} data-testid="person-origin">
      {line.text}
    </p>
  );
}

/** The Works at row (one row, no open state, the door to the sheet), or the line that says the business was removed. */
export function WorksAtCard({ c }: { c: PageCtx }) {
  const w = c.p.worksAtRow;
  if (!w) return null;
  return (
    <section className="cl-prof-rail-section" aria-label={WORKS_AT_WORDS.title} data-testid="person-works-at">
      <div className="cl-prof-rail-label">{WORKS_AT_WORDS.title}</div>
      {w.gone ? (
        <p className="cl-prof-works-gone" data-testid="person-works-gone">
          {w.text}
        </p>
      ) : (
        <Button
          variant="plain"
          className="cl-prof-works-row"
          aria-label={w.label}
          onClick={() => c.setSheet(true)}
          data-testid="person-works-row"
        >
          <BusinessTile face={w.tile} />
          <span className="cl-prof-works-lines">
            {c.phone ? <span className="cl-prof-works-name">{w.name}</span> : null}
            <span className="cl-prof-works-kind">{w.kind}</span>
            {w.read ? <span className="cl-prof-works-read">{w.read}</span> : null}
          </span>
          <Icon name="chevron" size={12} />
        </Button>
      )}
    </section>
  );
}

/**
 * Its people: the one the sheet was opened from says so, each other person is a door to their own page. On their page
 * they are "this page"; opened from their thread (the Inbox's Works at), "this thread", and their name the door to their page.
 */
function peopleHere(b: BusinessRecordVM, from: "page" | "thread") {
  return (
    <section className="cl-prof-biz-part" aria-label={b.peopleTitle}>
      <h3 className="cl-prof-biz-title">{b.peopleTitle}</h3>
      <ul className="cl-prof-biz-people">
        {b.people.map((x) => {
          const to = x.to ?? (from === "thread" ? `clients/${x.id}` : null);
          return (
            <li key={x.id} className="cl-prof-biz-person" data-here={x.here || undefined}>
              <Face initials={x.initials} size="sm" />
              {to ? (
                <a className="cl-prof-biz-door" {...routeDoor(to)} data-testid="person-business-person">
                  {x.name}
                </a>
              ) : (
                <span className="cl-prof-biz-name">{x.name}</span>
              )}
              <span className="cl-prof-biz-line">
                {x.here && from === "thread" ? WORKS_AT_WORDS.thisThread : x.line}
              </span>
              {x.needsYou ? <span className="cl-prof-biz-needs" aria-label="Needs you" /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the listing says: the stage, the verdict, the reach-out, the phone and the links, each where it has something. */
function listingParts(b: BusinessRecordVM) {
  return (
    <>
      <dl className="cl-prof-biz-facts">
        <div className="cl-prof-biz-fact">
          <dt>{WORKS_AT_WORDS.stage}</dt>
          <dd>
            {b.stage.word} <span className="cl-prof-biz-dim">· {b.stage.note}</span>
          </dd>
        </div>
        {b.fit ? (
          <div className="cl-prof-biz-fact">
            <dt>{WORKS_AT_WORDS.fit}</dt>
            <dd>
              {b.fit.word} <span className="cl-prof-biz-dim">· {b.fit.checks}</span>
            </dd>
          </div>
        ) : null}
        {b.reachOut ? (
          <div className="cl-prof-biz-fact">
            <dt>{WORKS_AT_WORDS.reachOut}</dt>
            <dd>
              {b.reachOut.chain}
              {b.reachOut.line ? <span className="cl-prof-biz-dim"> · {b.reachOut.line}</span> : null}
              {b.reachOut.to ? (
                <>
                  {" · "}
                  <a className="cl-prof-biz-door" {...routeDoor(b.reachOut.to)}>
                    {WORKS_AT_WORDS.readWhatWentOut}
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        ) : null}
        {b.phone ? (
          <div className="cl-prof-biz-fact">
            <dt>{WORKS_AT_WORDS.listingPhone}</dt>
            <dd>
              {b.phone.value}
              {b.phone.hours ? <span className="cl-prof-biz-dim"> · {b.phone.hours}</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {b.links.length ? (
        <section className="cl-prof-biz-part" aria-label={WORKS_AT_WORDS.links}>
          <h3 className="cl-prof-biz-title">{WORKS_AT_WORDS.links}</h3>
          <div className="cl-prof-biz-links">
            {b.links.map((l) => (
              <a key={l.href} className="cl-prof-biz-door" href={l.href} target="_blank" rel="noreferrer noopener">
                {l.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** "Not at this business": the person unlinked, settled; the lead keeps its history (an operator's press). */
async function leaveBusiness(c: PageCtx) {
  const r = await setPersonBusiness(c.p.id, null);
  if (!r.ok) {
    c.flash({ tone: "danger", msg: r.message || WORKS_AT_WORDS.leaveHint });
    return;
  }
  c.setSheet(false);
  c.flash({ msg: WORKS_AT_WORDS.leave });
  c.load();
}

/**
 * The business sheet opened from a thread (0052, the Inbox's Works at): the person read through the profile's courier, the
 * tab's copy at once and read again behind it, the sheet saying "Reading…" under the business's name until it is in, and
 * the read's failure where it failed. Its one way out is Open in Leads; "Not at this business" is said on their own page.
 * The Inbox loads this module on the press, so a thread carries none of it until then.
 */
export function BusinessSheetFor({ personId, name, onClose }: { personId: string; name: string; onClose: () => void }) {
  const [person, setPerson] = useState(() => peekPerson(personId));
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, tryAgain] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let here = true;
    setFailed(null);
    personDetail(personId).then(
      (p) => {
        if (here && p) setPerson(p);
      },
      (e: unknown) => {
        if (here) setFailed(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      here = false;
    };
  }, [personId, tries]);
  if (failed && !person?.business)
    return (
      <Sheet
        open
        onClose={onClose}
        title={name}
        close={{ label: WORKS_AT_WORDS.close, glyph: <Icon name="x" size={13} /> }}
        className="cl-prof-business-record"
        testid="person-business-sheet"
      >
        <FailedRead kind="line" what="this business" why={failed} onRetry={tryAgain} testid="person-business-failed" />
      </Sheet>
    );
  return (
    <BusinessRecordSheet
      b={person?.business ?? null}
      open
      onClose={onClose}
      onLeave={null}
      reading={name}
      from="thread"
    />
  );
}

/** The business sheet on a person's page, the door their head's line and the Works at row open. */
export function BusinessSheet({ c }: { c: PageCtx }) {
  return (
    <BusinessRecordSheet
      b={c.p.business}
      open={c.sheet}
      onClose={() => c.setSheet(false)}
      onLeave={c.canRecord ? () => void leaveBusiness(c) : null}
    />
  );
}

/** What the business sheet draws and does, wherever it opens: a person's page, or a thread's Works at (0052). */
interface BusinessRecordSheetProps {
  /** The business, once read; null while it is read, when `reading` names it. */
  b: BusinessRecordVM | null;
  open: boolean;
  onClose: () => void;
  /** "Not at this business", where the page may record it (their own page); null anywhere else. */
  onLeave: (() => void) | null;
  /** The business's name as the press knew it, said over "Reading…" until the business is in. */
  reading?: string | null;
  /** Where it was opened: their page (the default), or their thread, where they are "this thread" and a door to their page. */
  from?: "page" | "thread";
}

/** The business sheet: a pane from the right on a desk, from the bottom on a phone (the kit's Sheet). */
function BusinessRecordSheet({ b, open, onClose, onLeave, reading = null, from = "page" }: BusinessRecordSheetProps) {
  if (!b) {
    if (!reading) return null;
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={reading}
        close={{ label: WORKS_AT_WORDS.close, glyph: <Icon name="x" size={13} /> }}
        className="cl-prof-business-record"
        testid="person-business-sheet"
      >
        <div className="route-reading" role="status" aria-busy="true" data-testid="person-business-reading">
          {WORKS_AT_WORDS.reading}
        </div>
      </Sheet>
    );
  }
  const foot = (
    <>
      {b.phone?.tel ? (
        <Button href={b.phone.tel} size="sm" data-testid="person-business-call">
          <Icon name="phone" size={12} /> {WORKS_AT_WORDS.call}
        </Button>
      ) : null}
      <Button size="sm" variant="quiet" {...routeDoor(b.to)} data-testid="person-business-leads">
        {WORKS_AT_WORDS.openInLeads} <Icon name="chevron" size={11} />
      </Button>
    </>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={b.name}
      sub={b.kind}
      close={{ label: WORKS_AT_WORDS.close, glyph: <Icon name="x" size={13} /> }}
      foot={foot}
      className="cl-prof-business-record"
      testid="person-business-sheet"
    >
      <div className="cl-prof-biz">
        <div className="cl-prof-biz-band">
          <BusinessTile face={b.tile} size="lg" />
          <div className="cl-prof-biz-band-words">
            {b.rating ? <span className="cl-prof-biz-rating">{b.rating}</span> : null}
            {b.address ? (
              b.address.href ? (
                <a className="cl-prof-biz-door" href={b.address.href} target="_blank" rel="noreferrer noopener">
                  {b.address.line}
                </a>
              ) : (
                <span>{b.address.line}</span>
              )
            ) : null}
          </div>
        </div>
        {b.read ? <p className="cl-prof-biz-read">{b.read}</p> : null}
        {peopleHere(b, from)}
        {listingParts(b)}
        {onLeave ? (
          <LinkButton
            className="cl-prof-biz-leave"
            title={WORKS_AT_WORDS.leaveHint}
            onClick={onLeave}
            data-testid="person-business-leave"
          >
            {WORKS_AT_WORDS.leave}
          </LinkButton>
        ) : null}
      </div>
    </Sheet>
  );
}
