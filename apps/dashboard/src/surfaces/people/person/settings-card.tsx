/**
 * What the person page changes about them (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): the record kit's
 * rows (Receptionist, Messages, Offers & news), one line each at rest, and Change opens each one's editor in a `RecordFold`
 * under the row (a sheet on a phone). These save as they are chosen, so their folds are given no `onSave` and draw only Close,
 * and a recorded answer closes its fold. Each row stays in the card behind its sheet on a phone (`behind`), as Settings ›
 * Business keeps its rows: taken out, the card was a row shorter under the wash, and everything under it moved up and back down.
 *
 * TWO ASKS, the same pair the public /yes page renders. One control that said "Offers by WhatsApp" and wrote the conversational
 * column is what made a signed marketing consent impossible to record: the profile then claimed offers could go out, and the
 * composer refused every one of them.
 */
import { Fragment } from "react";
import type { ReactNode } from "react";
import {
  CONSENT_SOURCES,
  GET_YES_ROUTE,
  OFFERS_IN_WRITING_WORDS,
  PERSON_ABOUT_WORDS,
  UP_NEXT_WORDS,
  answerSaidOf,
  appointmentWords,
  isIdentifierName,
  messagesSummaryOf,
  offersYesRefusal,
  receptionistKnowsOf,
  stateOf,
  STOP_ENDED_OFFERS_SOURCE,
  STOP_WORDS,
  verbalOptInScript,
} from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { RecordDisclosure } from "../../kit/record/disclosure";
import { RecordFold } from "../../kit/record/fold";
import { RecordRow } from "../../kit/record/row";
import { navigate } from "../../legacy-verbs";
import { setPersonConsent, setPersonMarketingConsent, setPersonReceptionist } from "../people-detail";
import { workspaceName } from "../person-verbs";
import { ConsentAsk } from "./consent-ask";
import type { Answer, Evidence } from "./consent-ask";
import type { Fold, PageCtx } from "./ctx";

/** A yes to OFFERS is written or it is not recorded (00100): a sign-up form they signed, or their own message. */
const OFFERS_YES = CONSENT_SOURCES.filter((s) => offersYesRefusal(s.id) === null);

/** The receptionist's words for a mode (contracts PERSON_MODE_WORDS): the ones the bulk menu and a pill say. */
const rmWord = (m: unknown): string => stateOf("mode", m).label;

/** What recording an answer comes back with: the door's answer, or what stopped it. */
type Recorded = { ok: boolean; message?: string };

/** Their answer to a question, said in a toast as its receipt says it (contracts answerSaidOf), the name bold. */
function saidAnswer(purpose: "marketing" | "conversational", consent: Answer, who: string): ReactNode {
  return (
    <>
      <b>{who}</b> {answerSaidOf(purpose, consent)}
    </>
  );
}

/**
 * The customer's two answers, recorded by whoever heard them. A yes or a no is not written until the page knows how it was
 * given; "not asked" is a reset and needs no source. One recorder per door. Both reload the person afterwards rather than
 * assuming, because the lists and the Consent column are computed from the row. A written way carries its evidence: the message
 * they sent, or the form's note.
 */
function recordFor(c: PageCtx, purpose: "marketing" | "conversational") {
  const { p, who, flash, load } = c;
  return async (consent: Answer, source: string | null, evidence?: Evidence | null): Promise<Recorded> => {
    const send = purpose === "marketing" ? setPersonMarketingConsent : setPersonConsent;
    const r = await send(p.id, source ? { consent, source, ...evidence } : { consent });
    if (!r.ok) return r;
    flash({ msg: saidAnswer(purpose, consent, who) });
    load();
    return r;
  };
}

/** An answer recorded from its fold closes the fold, and its row says the answer. */
function recordAndClose(c: PageCtx, purpose: "marketing" | "conversational", fold: Fold) {
  const record = recordFor(c, purpose);
  return async (consent: Answer, source: string | null, evidence?: Evidence | null) => {
    const r = await record(consent, source, evidence);
    if (r && r.ok) fold.close();
    return r;
  };
}

/** Receptionist for this person: the person's own setting wins; "inherit" removes it. Re-read from the server afterwards, never assumed. */
function setMode(c: PageCtx) {
  const { p, rm, setRm, folds, first, flash, load } = c;
  return async (mode: "auto" | "ask" | "never" | "inherit") => {
    if (rm.busy) return;
    setRm({ busy: true, error: null });
    const r = await setPersonReceptionist(p.id, mode);
    if (!r.ok) {
      setRm({ busy: false, error: r.message || "Could not change this." });
      return;
    }
    setRm({ busy: false, error: null });
    folds.rm.close();
    flash({
      msg:
        mode === "inherit" ? (
          <>
            <b>{first === "them" ? "This person" : first}</b> follows the workspace again
          </>
        ) : (
          <>
            Receptionist for <b>{first === "them" ? "this person" : first}</b>: {rmWord(mode)}
          </>
        ),
    });
    load();
  };
}

/**
 * What the person's own setting says, in a short sentence: set for them alone, or following the workspace. Each says what
 * changes for this person and stops (Ruben, 10 Oct 2026: the sheets said each thing at length).
 */
function modeHint(c: PageCtx): string {
  const { p } = c;
  const rmPerson = p.receptionistMode.person;
  if (!rmPerson)
    return `Following the workspace${p.receptionistMode.workspace ? ` (${rmWord(p.receptionistMode.workspace)})` : ""}.`;
  if (rmPerson === "auto") return "Answers them by itself. Set for them alone.";
  if (rmPerson === "ask") return "Each reply waits for your OK.";
  return "Stays out of their messages, which come to you. It still answers the phone.";
}

/** The receptionist's mode: the three answers, what stands, and the way back to following the workspace. */
function receptionistFold(c: PageCtx, row: ReactNode) {
  const { p, isOwner, canRecord, rm, first, folds } = c;
  const rmPerson = p.receptionistMode.person;
  const rmEffective = rmPerson || p.receptionistMode.workspace;
  const set = setMode(c);
  return (
    <RecordFold
      wide
      id="person-receptionist"
      label="Receptionist"
      open={folds.rm.open}
      onCancel={folds.rm.close}
      behind={row}
    >
      <div data-testid="receptionist-mode">
        <div
          className="cl-prof-autonomy"
          role="group"
          aria-label={`Receptionist for ${first === "them" ? "this person" : first}`}
        >
          {(["auto", "ask", "never"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`cl-prof-aut-seg ${rmEffective === m ? "active" : ""}`}
              aria-pressed={rmEffective === m}
              disabled={!isOwner || rm.busy}
              onClick={() => void set(m)}
            >
              {rmWord(m)}
            </button>
          ))}
        </div>
        <div className="cl-prof-aut-hint">
          {modeHint(c)}
          {!isOwner && canRecord && " Only an owner can change this."}
        </div>
        {rmPerson && isOwner && (
          <button type="button" className="cl-bucket-link" disabled={rm.busy} onClick={() => void set("inherit")}>
            {rmWord("inherit")} <Icon name="arrow-right" size={10} />
          </button>
        )}
        <FieldError message={rm.error} testid="receptionist-mode-error" />
      </div>
    </RecordFold>
  );
}

/** What is on record about their messages, in a sentence: a yes says what may go to them, in the workspace's word. */
function visitHint(c: PageCtx): string {
  const { consent, word } = c.p;
  if (consent.state === "opted_in")
    return `Yes — ${consent.sub}. Reminders about their ${appointmentWords(word).many} may go to them.`;
  if (consent.state === "opted_out")
    return consent.source === "customer_message"
      ? `${consent.sub}. Nothing goes out. Record a yes only if they ask again.`
      : `No — ${consent.sub}. Nothing goes out to them.`;
  return "No answer yet. Replying to them is fine; anything we start needs their yes.";
}

/** Messages: the ask, with the words a yes is asked for in person. */
function visitFold(c: PageCtx, row: ReactNode) {
  const { p, canRecord, folds } = c;
  // What to ask when the yes is spoken. The campaign files this sentence as the way a yes is given in person or on the
  // phone (contracts verbalOptInScript), so the desk is shown the same words a reviewer reads.
  const askScript = verbalOptInScript(workspaceName());
  return (
    <RecordFold
      wide
      id="person-visit"
      label="Messages"
      open={folds.visit.open}
      onCancel={folds.visit.close}
      behind={row}
    >
      <ConsentAsk
        bare
        testid="consent-control"
        label="Messages"
        value={p.consent.state}
        sources={CONSENT_SOURCES}
        yesHow={askScript ? `Asking in person or on the phone? Say: “${askScript}”` : undefined}
        canRecord={canRecord}
        lockedNote={null}
        yesLocked={p.yesLocked}
        messages={p.ownMessages}
        onRecord={recordAndClose(c, "conversational", folds.visit)}
        hint={visitHint(c)}
      />
    </RecordFold>
  );
}

/** What is on record about offers and news, in a sentence. */
function offersHint(c: PageCtx): string {
  const { consent } = c.p;
  if (consent.state === "opted_out") return `${STOP_WORDS.said("They")}, offers included.`;
  if (consent.marketing === "opted_in") return `Yes — ${consent.marketingSub}.`;
  if (consent.marketing === "opted_out") return `No — ${consent.marketingSub}. Other messages still reach them.`;
  if (consent.marketingSource === STOP_ENDED_OFFERS_SOURCE)
    return `Not asked — ${consent.marketingSub}. A new yes must come in writing.`;
  return "Not asked. Offers go only to a yes in writing.";
}

/** Offers and news: the ask, in writing only, and why. */
function offersFold(c: PageCtx, row: ReactNode) {
  const { p, canRecord, folds } = c;
  return (
    <RecordFold
      wide
      id="person-offers"
      label="Offers & news"
      open={folds.offers.open}
      onCancel={folds.offers.close}
      behind={row}
    >
      <ConsentAsk
        bare
        testid="consent-marketing"
        label="Offers and news"
        value={p.consent.marketing}
        sources={CONSENT_SOURCES}
        yesSources={OFFERS_YES}
        yesHow="How did they say yes in writing?"
        canRecord={canRecord && p.consent.state !== "opted_out"}
        lockedNote={null}
        yesLocked={p.yesLocked}
        messages={p.ownMessages}
        onRecord={recordAndClose(c, "marketing", folds.offers)}
        hint={offersHint(c)}
        why={
          p.consent.state !== "opted_out" && p.consent.marketing === "unknown"
            ? {
                label: "Why in writing?",
                text: (
                  <>
                    {OFFERS_IN_WRITING_WORDS.lead}
                    <button type="button" className="cl-bucket-link" onClick={() => navigate(GET_YES_ROUTE)}>
                      {OFFERS_IN_WRITING_WORDS.link}
                    </button>
                    .
                  </>
                ),
              }
            : null
        }
      />
    </RecordFold>
  );
}

/**
 * Offers by email, a quiet row beside the two answers (contracts consentOf): Yes once they asked for offers by email,
 * Unsubscribed once they said no to them, Not asked until then, with how and when under it. Read-only: the person says it
 * themselves, in their own email or by pressing Unsubscribe. Not drawn where the row carries no answer.
 */
function emailOffersRow(c: PageCtx) {
  const { consent } = c.p;
  if (!consent.emailOffersLabel) return null;
  // The person says it themselves, in their own email or by pressing Unsubscribe: read only, and said so.
  const value = consent.state === "opted_out" ? STOP_WORDS.mark : consent.emailOffersLabel;
  return (
    <RecordRow
      id="person-email-offers"
      label="Offers by email"
      value={`${value} · ${PERSON_ABOUT_WORDS.readOnly}`}
      stacked
    />
  );
}

/**
 * The card's rows (canvas A, P9.4), each drawn at rest and, while its editor is a sheet on a phone, behind it: the key
 * over its answer, the act at the right ("Record a yes" while nobody asked, else Change). After a stop the answers say
 * Stopped and take no act; the receptionist's row keeps its Change.
 */
function settingsCard(c: PageCtx) {
  const { p, isOwner, canRecord, folds } = c;
  const W = PERSON_ABOUT_WORDS;
  const rmPerson = p.receptionistMode.person;
  const rmEffective = rmPerson || p.receptionistMode.workspace;
  const stopped = p.consent.state === "opted_out";
  // A question nobody has asked them yet is answered by recording their yes (canvas A): the act says so.
  const askOr = (state: string) => (state === "unknown" ? UP_NEXT_WORDS.recordYes : W.change);
  const rmRow = (
    <RecordRow
      id="person-receptionist"
      label="Receptionist"
      value={rmPerson ? rmWord(rmEffective) : `${rmWord(rmEffective)} · ${W.thisWorkspace}`}
      act={isOwner ? { label: W.change, onClick: folds.rm.request } : null}
      stacked
    />
  );
  const visitRow = (
    <RecordRow
      id="person-visit"
      label="Messages"
      value={stopped ? STOP_WORDS.mark : p.consent.answerLabel}
      act={canRecord && !stopped ? { label: askOr(p.consent.state), onClick: folds.visit.request } : null}
      stacked
    />
  );
  const offersRow = (
    <RecordRow
      id="person-offers"
      label="Offers & news"
      value={stopped ? STOP_WORDS.mark : p.consent.marketingLabel}
      act={canRecord && !stopped ? { label: askOr(p.consent.marketing), onClick: folds.offers.request } : null}
      stacked
    />
  );
  return (
    <div className="cl-prof-rec" data-testid="person-settings">
      {folds.visit.open ? null : visitRow}
      {visitFold(c, visitRow)}
      {folds.offers.open ? null : offersRow}
      {offersFold(c, offersRow)}
      {emailOffersRow(c)}
      {folds.rm.open ? null : rmRow}
      {receptionistFold(c, rmRow)}
      {knowsPanel(c)}
    </div>
  );
}

/**
 * The three editors as a phone's sheets over a tab that is not About (canvas A, P1.5): Up next's "Record a yes" opens
 * the yes over the Overview, where it was asked, and About draws its own in place under each row (as a thin record's one
 * scroll does, which holds About's groups under its Overview).
 */
export function phoneFolds(c: PageCtx) {
  if (!c.phone || c.tab === "about" || c.p.thin) return null;
  return (
    <>
      {receptionistFold(c, null)}
      {visitFold(c, null)}
      {offersFold(c, null)}
    </>
  );
}

/** What the receptionist knows of them (canvas A, P9.4): one line of facts, and how it uses the notes. */
function knowsPanel(c: PageCtx) {
  const { p } = c;
  const W = PERSON_ABOUT_WORDS;
  const line = receptionistKnowsOf({
    name: isIdentifierName(p.name) ? null : p.name,
    worksAt: p.worksAt?.name ?? null,
    email: p.email,
    offers: p.consent.state === "opted_out" ? null : p.consent.marketingLabel,
    lastInTouch: p.figures.find((f) => f.id === "last")?.value ?? null,
  });
  if (!line) return null;
  return (
    <Panel variant="inset" size="sm" className="cl-prof-knows" data-testid="person-knows">
      <p className="cl-prof-knows-title">{W.knowsTitle}</p>
      <p className="cl-prof-knows-body">{line}</p>
      <p className="cl-prof-knows-foot">{W.knowsFoot}</p>
    </Panel>
  );
}

/**
 * Messages and receptionist (canvas A): the rail's group of what they may be sent and who answers them, folded behind
 * one line of the three answers, and open while one of its editors is.
 */
export function messagesGroup(c: PageCtx) {
  const { p, folds } = c;
  const effective = p.receptionistMode.person || p.receptionistMode.workspace;
  const parts = messagesSummaryOf(
    { label: p.consent.answerLabel, unknown: p.consent.state === "unknown" },
    {
      label: p.consent.marketingLabel,
      unknown: p.consent.marketing === "unknown" && p.consent.state !== "opted_out",
    },
    rmWord(effective),
  );
  // The first "not asked" is the press that asks it, for someone who may record the answer (canvas A, M1's fold).
  const first = c.canRecord ? parts.find((x) => x.notAsked) : undefined;
  const ask = (id: string) => (id === "visit" ? folds.visit.request() : folds.offers.request());
  const summary = parts.map((x, i) => (
    <Fragment key={x.id}>
      {i > 0 ? " · " : null}
      {x.lead ? `${x.lead} ` : null}
      {x === first ? (
        <LinkButton size="inherit" className="cl-prof-not-asked" onClick={() => ask(x.id)}>
          {x.answer}
        </LinkButton>
      ) : x.notAsked ? (
        <u className="cl-prof-not-asked">{x.answer}</u>
      ) : (
        x.answer
      )}
    </Fragment>
  ));
  return (
    <section className="cl-prof-rail-section" data-testid="person-messages">
      <RecordDisclosure
        id="person-messages"
        look="group"
        label={PERSON_ABOUT_WORDS.messages}
        summary={summary}
        forceOpen={folds.rm.open || folds.visit.open || folds.offers.open}
        // Folded by default, and left as the member left it, from person to person (canvas A, P9.4).
        remember
        testid="person-messages-fold"
      >
        {settingsCard(c)}
      </RecordDisclosure>
    </section>
  );
}
