/**
 * The person page's sections (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): Coming up (their visits that
 * have not ended, each a door to its day), History (the timeline without them), and the rail's About and Campaigns cards.
 * Each is a function of the page's context returning an element, never a component of its own.
 */
import {
  NOTE_WORDS,
  PERSON_ABOUT_WORDS,
  PERSON_CALL_WORDS,
  PERSON_WASH_WORDS,
  type PersonAboutFact,
  type PersonVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu } from "../../kit/menu/menu";
import type { MenuItem } from "../../kit";
import { Wash } from "../../kit/motion/wash";
import { Press } from "../../kit/press";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { routeDoor } from "../../legacy-verbs";
import { doubtRows, writeOn } from "./hero";
import { FactNotices } from "./notices/fact-notices";
import { PersonEmail } from "./name";
import { PersonNotes } from "./notes";
import { PersonTimeline } from "./timeline";
import type { PageCtx } from "./ctx";

/**
 * Their visits that have not ended: the calendar's future sat at the top of the timeline, over the conversation it followed.
 * Each is the one visit line (contracts visitLineOf): how it was matched when that was a guess, in the words every page says it
 * in, and, once it has begun and nobody has said whether they came, the same two presses a past visit gets.
 */
export function comingUpSection(comingUp: NonNullable<PersonVM["comingUp"]>) {
  if (comingUp.length === 0) return false;
  return (
    <section
      className="cl-prof-section cl-prof-up"
      aria-labelledby="person-coming-up-title"
      data-testid="person-coming-up"
    >
      <h2 className="cl-prof-section-title" id="person-coming-up-title">
        Coming up
      </h2>
      <div className="cl-prof-up-list">
        {/* Each a door to its visit (a link: a long press or a new tab opens it). Whether they came is Up next's to ask. */}
        {comingUp.map((v) => (
          <div key={v.id} className="cl-prof-up-item">
            <a className="cl-prof-up-visit" {...routeDoor(v.to)} data-testid="person-visit-ahead">
              <span className="cl-prof-up-leaf" aria-hidden="true">
                <span className="cl-prof-up-month">{v.month}</span>
                <span className="cl-prof-up-date">{v.date}</span>
              </span>
              <span className="cl-prof-up-words">
                <span className="cl-prof-up-title">{v.title}</span>
                <span className="cl-prof-up-when">
                  {v.day} · {v.time}
                  {v.match ? ` · ${v.match}` : ""}
                </span>
              </span>
              <span className="cl-prof-up-go" aria-hidden="true">
                <Icon name="chevron" size={12} />
              </span>
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/** History's tab of their notes, which the Overview's "All notes ›" opens (canvas A). */
export const NOTES_FILTER = "notes";

/**
 * The History: the timeline without the visits ahead, narrowed by the filter the page holds; its Notes, every note with
 * its acts, for anyone who has some or may write one.
 */
export function historySection(c: PageCtx, past: PersonVM["timeline"]) {
  const { p, tlFilter, setTlFilter, tlAll, setTlAll } = c;
  const notes =
    p.noteList.length > 0 || c.canRecord
      ? {
          id: NOTES_FILTER,
          label: NOTE_WORDS.title,
          body: <PersonNotes p={p} canEdit={c.canRecord} isOwner={c.isOwner} flash={c.flash} onChanged={c.load} />,
        }
      : null;
  return (
    <section className="cl-prof-section cl-prof-history" aria-labelledby="person-history-title">
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-history-title">
          {/* Its newest row someone else added while the page is open: the heading washes (canvas A's wash). */}
          <Wash scope={p.id} value={past[0]?.id ?? ""} said={PERSON_WASH_WORDS.history}>
            History
          </Wash>
        </h2>
      </div>
      <PersonTimeline
        items={past}
        initials={p.initials}
        name={p.name}
        filter={tlFilter}
        onFilter={setTlFilter}
        showAll={tlAll}
        onShowAll={() => setTlAll(true)}
        dealsOn={p.dealsOn}
        fresh={c.fresh}
        notes={notes}
      />
    </section>
  );
}

/** A fact the profile said, by its key (contracts aboutOf), or nothing where it said none. */
const factOf = (c: PageCtx, k: string): PersonAboutFact | undefined => c.p.about.find((a) => a.k === k);

/** Call, from the number's row: a phone dials and asks how it went when the app is back; a desk opens Call's popover. */
function ring(c: PageCtx) {
  const vm = c.call.vm;
  if (!vm?.rings) return;
  if (!c.phone) {
    c.call.setOpen(true);
    return;
  }
  window.location.href = vm.tel;
  if (c.canRecord) c.call.dialled();
}

/**
 * Their number (canvas A, D1): the whole row is the press, the number over what it is and since when, and it opens its
 * acts (a sheet from the foot on a phone, a menu on a desk): Call, Text them, Copy the number.
 */
function numberRow(c: PageCtx) {
  const { p } = c;
  const W = PERSON_ABOUT_WORDS;
  if (!p.phone) return null;
  const items: MenuItem[] = [];
  if (c.call.vm?.rings)
    items.push({ label: W.callIt, glyph: <Icon name="phone" size={13} />, onSelect: () => ring(c) });
  // Text them as More says it: drawn and disabled with its reason where nothing can be sent (contracts personActs).
  const text = c.canRecord ? p.acts.find((a) => a.id === "text") : undefined;
  if (text)
    items.push({
      label: W.textIt,
      glyph: <Icon name="chat" size={13} />,
      title: text.off ?? undefined,
      disabled: !!text.off,
      onSelect: () => writeOn(p, "sms"),
    });
  // Copying says so in place (the kit's copy), never a toast; open to every reader.
  items.push({ label: W.copyNumber, glyph: <Icon name="copy" size={13} />, copy: { text: p.phone, said: W.copied } });
  if (c.canRecord && c.call.vm)
    items.push({ label: PERSON_CALL_WORDS.logPast, glyph: <Icon name="clock" size={13} />, onSelect: c.call.logPast });
  return (
    <Menu
      label={p.phone}
      align="start"
      groups={[{ items }]}
      trigger={
        <Press className="cl-prof-reach" data-opens="sheet" data-testid="person-reach-phone">
          <span className="cl-prof-reach-l">
            <span className="cl-prof-reach-v">{p.phone}</span>
            <span className="cl-prof-reach-src">{p.reach.phone}</span>
          </span>
          <Icon name="chevron" size={12} />
        </Press>
      }
    />
  );
}

/**
 * Reach them (canvas A): their number as a row of its own, their WhatsApp name, and their address, added and changed in
 * place (name.tsx PersonEmail), on a line of its own under a hairline.
 */
function reachGroup(c: PageCtx) {
  const { p, canRecord, flash } = c;
  const W = PERSON_ABOUT_WORDS;
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-reach-title" data-testid="person-reach">
      <h3 className="cl-prof-rail-label" id="person-reach-title">
        {W.reach}
      </h3>
      {numberRow(c)}
      {p.waName ? <p className="cl-prof-reach-line">{W.waName(p.waName)}</p> : null}
      {p.email || canRecord ? (
        <div className="cl-prof-reach-email">
          <PersonEmail p={p} canEdit={canRecord} flash={flash} />
          {/* What the address is and where it came from (contracts reachRowsOf), as the number says it. */}
          {p.email ? <span className="cl-prof-reach-src">{p.reach.email}</span> : null}
        </div>
      ) : null}
      {doubtRows(c)}
      <FactNotices c={c} home="reach" />
    </section>
  );
}

/**
 * Where they came from (canvas A, C3): one line, how they first reached you or came to be here and when (contracts
 * personOriginOf), else the About fact it replaces, and the way back to the lead the finder found them as.
 */
function originGroup(c: PageCtx) {
  const { p } = c;
  const fact = factOf(c, "Added") ?? factOf(c, "First contact");
  const line = p.origin ?? (fact && fact.v !== "—" ? fact.v : null);
  if (!line) return null;
  const lead = p.lead;
  return (
    <section className="cl-prof-rail-section" aria-labelledby="person-from-title" data-testid="person-from">
      <h3 className="cl-prof-rail-label" id="person-from-title">
        {PERSON_ABOUT_WORDS.cameFrom}
      </h3>
      <p className="cl-prof-fromline">
        {line}
        {lead ? (
          <>
            {" "}
            <LinkButton {...routeDoor(lead.to)} title={lead.name} data-testid="fact-lead">
              {PERSON_ABOUT_WORDS.openLead} <Icon name="chevron" size={10} />
            </LinkButton>
          </>
        ) : null}
      </p>
    </section>
  );
}

/**
 * The rail's first groups (canvas A): Reach them, then Where they came from. The next visit is Coming up's, their counts
 * the figures', and the proposal the deal's: each said once, there.
 */
export function aboutGroups(c: PageCtx) {
  return (
    <>
      {reachGroup(c)}
      {originGroup(c)}
    </>
  );
}

/**
 * A phone's Campaigns (canvas A, P4): a pane holding one folded line, how many went to them and what came of the newest,
 * that opens on the rows.
 */
export function campaignsFold(p: PersonVM) {
  const newest = p.campaigns[0];
  if (!newest) return null;
  const W = PERSON_ABOUT_WORDS;
  return (
    <section className="cl-prof-section" data-testid="person-campaigns-fold">
      <RecordDisclosure
        id="person-campaigns"
        label={W.campaigns}
        mark={W.campaignsMark(p.campaigns.length, newest.outcome)}
        remember
        testid="person-campaigns-press"
      >
        {campaignRows(p)}
      </RecordDisclosure>
    </section>
  );
}

/** What a playbook or a broadcast sent them, and what came of it: each row opens the run's own report. */
export function campaignsCard(p: PersonVM) {
  return (
    p.campaigns.length > 0 && (
      <div className="cl-prof-rail-section" data-testid="person-campaigns">
        <div className="cl-prof-rail-label">{PERSON_ABOUT_WORDS.campaigns}</div>
        {campaignRows(p)}
      </div>
    )
  );
}

/** The rows of what went to them, each a door to its run's report (a link: a long press or a new tab opens it). */
function campaignRows(p: PersonVM) {
  return (
    <div className="cl-prof-attr-list">
      {p.campaigns.map((c) => (
        <a key={c.id} className="cl-prof-attr cl-prof-run" {...routeDoor(c.to)} data-testid="person-campaign">
          <span className="cl-prof-attr-key">{c.when}</span>
          <span className="cl-prof-attr-val">
            <span className="cl-prof-run-title">{c.title}</span>
            <span className="cl-prof-run-out" data-tone={c.tone}>
              {c.line}
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
