/**
 * What the person page changes about them (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): the record kit's
 * rows (Receptionist, Visit messages, Offers & news), one line each at rest, and Change opens each one's editor in a `RecordFold`
 * under the row (a sheet on a phone). These save as they are chosen, so their folds are given no `onSave` and draw only Close,
 * and a recorded answer closes its fold. Each row stays in the card behind its sheet on a phone (`behind`), as Settings ›
 * Business keeps its rows: taken out, the card was a row shorter under the wash, and everything under it moved up and back down.
 *
 * TWO ASKS, the same pair the public /yes page renders. One control that said "Offers by WhatsApp" and wrote the conversational
 * column is what made a signed marketing consent impossible to record: the profile then claimed offers could go out, and the
 * composer refused every one of them.
 */
import type { ReactNode } from "react";
import { CONSENT_SOURCES, offersYesRefusal, stateOf, verbalOptInScript } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
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

/** Their answer to a question, said in a toast: to offers, or to messages about their visit. */
function saidAnswer(purpose: "marketing" | "conversational", consent: Answer, who: string): ReactNode {
  if (purpose === "marketing") {
    if (consent === "opted_in")
      return (
        <>
          <b>{who}</b> said yes to offers and news
        </>
      );
    if (consent === "opted_out")
      return (
        <>
          <b>{who}</b> said no to offers — messages about their own visit still reach them
        </>
      );
    return (
      <>
        <b>{who}</b> has not been asked about offers
      </>
    );
  }
  if (consent === "opted_in")
    return (
      <>
        <b>{who}</b> said yes to messages about their visit
      </>
    );
  if (consent === "opted_out")
    return (
      <>
        <b>{who}</b> said stop — nothing goes out to them at all
      </>
    );
  return (
    <>
      <b>{who}</b> is back to &quot;not asked&quot;
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

/** What the person's own setting says, in a sentence: set for them alone, or following the workspace. */
function modeHint(c: PageCtx): string {
  const { p } = c;
  const rmPerson = p.receptionistMode.person;
  if (!rmPerson)
    return `Following the workspace${p.receptionistMode.workspace ? ` (${rmWord(p.receptionistMode.workspace)})` : ""}.`;
  if (rmPerson === "auto") return "Answers this person automatically — set for them alone.";
  if (rmPerson === "ask") return "Every message from this person waits for you before anything is sent.";
  return "The receptionist stays out of their WhatsApp thread — their messages come straight to you, and it won't text them after a call. It still answers the phone.";
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

/** What is on record about messages for their visit, in a sentence. */
function visitHint(c: PageCtx): string {
  const { consent } = c.p;
  if (consent.state === "opted_in")
    return `Yes — ${consent.sub}. Reminders and confirmations about their own visit may go to them.`;
  if (consent.state === "opted_out")
    return consent.source === "customer_message"
      ? `${consent.sub}. This stops everything, offers included. Record a yes only if they have asked again themselves.`
      : `No — ${consent.sub}. Nothing goes out to them, offers included.`;
  return "No answer recorded. A reply to something they wrote is always fine; anything we start needs their yes.";
}

/** Messages about their visit: the ask, with the words a yes is asked for in person. */
function visitFold(c: PageCtx, row: ReactNode) {
  const { p, canRecord, folds } = c;
  // What to ask when the yes is spoken. The campaign files this sentence as the way a yes is given in person or on the
  // phone (contracts verbalOptInScript), so the desk is shown the same words a reviewer reads.
  const askScript = verbalOptInScript(workspaceName());
  return (
    <RecordFold
      wide
      id="person-visit"
      label="Visit messages"
      open={folds.visit.open}
      onCancel={folds.visit.close}
      behind={row}
    >
      <ConsentAsk
        bare
        testid="consent-control"
        label="Messages about their visit"
        value={p.consent.state}
        sources={CONSENT_SOURCES}
        yesHow={
          askScript ? `How did they tell you? In person or on the phone, ask in these words: “${askScript}”` : undefined
        }
        canRecord={canRecord}
        lockedNote={null}
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
  if (consent.state === "opted_out")
    return "They asked us to stop, which stops offers too. Nothing to record here until that changes.";
  if (consent.marketing === "opted_in") return `Yes — ${consent.marketingSub}. This is the answer a broadcast needs.`;
  if (consent.marketing === "opted_out")
    return `No — ${consent.marketingSub}. Messages about their own visit still reach them.`;
  return "Not asked. Separate and optional — the one answer a broadcast may be sent on.";
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
        yesHow="How did they give it in writing? A spoken yes is not enough for offers."
        canRecord={canRecord && p.consent.state !== "opted_out"}
        lockedNote={null}
        messages={p.ownMessages}
        onRecord={recordAndClose(c, "marketing", folds.offers)}
        hint={offersHint(c)}
        why={
          p.consent.state !== "opted_out" && p.consent.marketing === "unknown"
            ? {
                label: "Why in writing?",
                text: (
                  <>
                    {"The carriers require it: their own message, or a sign-up form they signed — "}
                    <button type="button" className="cl-bucket-link" onClick={() => navigate("broadcasts")}>
                      print one from Broadcasts
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

/** The card's three rows, each drawn at rest and, while its editor is a sheet on a phone, behind it. */
export function settingsCard(c: PageCtx) {
  const { p, isOwner, canRecord, folds } = c;
  const rmPerson = p.receptionistMode.person;
  const rmEffective = rmPerson || p.receptionistMode.workspace;
  const rmRow = (
    <RecordRow
      id="person-receptionist"
      label="Receptionist"
      value={rmWord(rmEffective)}
      source={rmPerson ? null : "workspace"}
      act={isOwner ? { label: "Change", onClick: folds.rm.request } : null}
    />
  );
  const visitRow = (
    <RecordRow
      id="person-visit"
      label="Visit messages"
      value={p.consent.answerLabel}
      act={canRecord ? { label: "Change", onClick: folds.visit.request } : null}
    />
  );
  const offersRow = (
    <RecordRow
      id="person-offers"
      label="Offers & news"
      value={p.consent.marketingLabel}
      act={canRecord && p.consent.state !== "opted_out" ? { label: "Change", onClick: folds.offers.request } : null}
    />
  );
  return (
    <div className="cl-prof-rec" data-testid="person-settings">
      {folds.rm.open ? null : rmRow}
      {receptionistFold(c, rmRow)}
      {folds.visit.open ? null : visitRow}
      {visitFold(c, visitRow)}
      {folds.offers.open ? null : offersRow}
      {offersFold(c, offersRow)}
    </div>
  );
}
