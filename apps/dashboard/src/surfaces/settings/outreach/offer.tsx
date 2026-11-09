/**
 * How it reaches out (decision 0113): What you offer, and Proof you stand behind. Each row is a fold of the record, one
 * key of the config's reach_out section, saved through the tab's one saver (business/fold-shapes.ts holds what each opens
 * with, writes and refuses). A row with nothing set says what the writers read in its place, and why: what the business
 * says of itself, else its goal (contracts reachOutOfferOf); its box opens on those words (box.tsx).
 */
import { useState } from "react";
import { REACH_OUT_LIMITS, REACH_OUT_SETTINGS_WORDS, reachOutOfferOf, textOrEmpty } from "@chanlytics/contracts";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordBox } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { reachOutFold, roomSaid, type BoxFields } from "./box";
import { OutreachCard, storedReachOut, type OutreachShared } from "./card";

const OFFER_CARDS = REACH_OUT_SETTINGS_WORDS;

/** What you offer: the offer, who it is for, and what it fixes. Every first email is about the first. */
export function OfferCard(shared: OutreachShared) {
  const about = shared.read?.about ?? null;
  const fallback = storedReachOut(shared, "offer") ? null : reachOutOfferOf(shared.config, about);
  return (
    <OutreachCard id="offer" title={OFFER_CARDS.offer.title} sub={OFFER_CARDS.offer.sub}>
      {reachOutFold(shared, {
        id: "offer",
        key: "offer",
        label: OFFER_CARDS.offer.offer,
        rows: 3,
        max: REACH_OUT_LIMITS.offer,
        placeholder: OFFER_CARDS.offer.placeholders.offer,
        empty: OFFER_CARDS.offer.empty,
        fallback,
        from: OFFER_CARDS.offer.from[shared.read?.about_from ?? "goal"],
      })}
      {reachOutFold(shared, {
        id: "who_for",
        key: "who_for",
        label: OFFER_CARDS.offer.whoFor,
        rows: 1,
        max: REACH_OUT_LIMITS.whoFor,
        placeholder: OFFER_CARDS.offer.placeholders.whoFor,
        empty: OFFER_CARDS.offer.empty,
        known: shared.read?.known.newest_search,
      })}
      {reachOutFold(shared, {
        id: "fixes",
        key: "fixes",
        label: OFFER_CARDS.offer.fixes,
        rows: 2,
        max: REACH_OUT_LIMITS.fixes,
        placeholder: OFFER_CARDS.offer.placeholders.fixes,
        empty: OFFER_CARDS.offer.empty,
      })}
    </OutreachCard>
  );
}

/** The claims as the fold edits them: one box a claim, a remove beside each, and an add while there is room. */
const ProofRows = ({ f }: { f: BoxFields }) => {
  const claims = Array.isArray(f.draft) ? f.draft.map(textOrEmpty) : [];
  const put = (next: string[], keys: string[]) => f.update(() => next, keys);
  // The one empty box a list with nothing in it opens on has nothing to take away.
  const alone = claims.length === 1 && !claims[0]?.trim();
  return (
    <div className="ro-claims" data-testid="rec-proof-rows">
      {claims.map((claim, index) => {
        const room = roomSaid(claim.length, REACH_OUT_LIMITS.claim);
        return (
          <div className="ro-claim" key={index} data-testid={`rec-claim-${index}`}>
            <RecordBox
              id={`ro-claim-${index}`}
              label={OFFER_CARDS.proof.claim(index + 1)}
              rows={2}
              className="rec-input-grows"
              value={claim}
              placeholder={OFFER_CARDS.proof.placeholder}
              onChange={(v) =>
                put(
                  claims.map((c, j) => (j === index ? v : c)),
                  [`claim-${index}`],
                )
              }
              problem={f.problems[`claim-${index}`] || null}
              readOnly={f.readOnly}
            />
            {alone ? null : (
              <Button
                variant="quiet"
                size="sm"
                iconOnly
                aria-label={OFFER_CARDS.proof.remove(index + 1)}
                {...f.press(() =>
                  put(
                    claims.filter((_, j) => j !== index),
                    ["proof"],
                  ),
                )}
                data-testid={`rec-claim-remove-${index}`}
              >
                <Icon name="x" size={12} />
              </Button>
            )}
            {room ? <span className="rec-hint">{room}</span> : null}
          </div>
        );
      })}
      {claims.length < REACH_OUT_LIMITS.claims ? (
        <Button size="sm" {...f.press(() => put([...claims, ""], ["proof"]))} data-testid="rec-proof-add">
          <Icon name="plus" size={12} /> {OFFER_CARDS.proof.add}
        </Button>
      ) : null}
      <FieldError id="ro-proof-problem" message={f.problems.proof || null} testid="rec-proof-problem" />
      <p className="bt-fold-note" data-testid="rec-proof-rule">
        {OFFER_CARDS.proof.foot}
      </p>
    </div>
  );
};

/**
 * Proof you stand behind: the only claims Ask may make about the business, word for word, one an email. At rest each
 * claim is a row with how many emails carried it (the read's count of the steps whose words hold it); each row's Change
 * opens the one fold of the list, and Add a claim opens it on a box to type in. An empty box is no claim: the save drops it.
 */
export function ProofCard(shared: OutreachShared) {
  const claims = (shared.config.reach_out?.proof ?? []).map(textOrEmpty).filter((c) => c.trim());
  const sends = (text: string) => shared.read?.claims.find((c) => c.text === text)?.sends ?? 0;
  const [adding, setAdding] = useState(false);
  return (
    <OutreachCard id="proof" title={OFFER_CARDS.proof.title} sub={OFFER_CARDS.proof.sub}>
      <BtFold<unknown>
        canEdit={shared.canEdit}
        flash={shared.flash}
        saver={shared.saver}
        id="proof"
        label={OFFER_CARDS.proof.title}
        channel={null}
        gate={gate("settings", "change the claims it may make")}
        opensOn={adding || !claims.length ? [...claims, ""] : null}
        rest={({ request, can }) => (
          <>
            {claims.map((claim, index) => (
              <RecordRow
                key={index}
                id={index === 0 ? "proof" : `proof-${index}`}
                label={claim}
                stacked
                value={<span data-testid={`rec-row-proof-${index}-meta`}>{OFFER_CARDS.proof.count(sends(claim))}</span>}
                act={
                  shared.canEdit && can
                    ? {
                        label: "Change",
                        icon: "pencil",
                        onClick: () => {
                          setAdding(false);
                          request();
                        },
                      }
                    : null
                }
              />
            ))}
            {shared.canEdit && can && claims.length < REACH_OUT_LIMITS.claims ? (
              <RecordRow
                id={claims.length ? "proof-add" : "proof"}
                label={OFFER_CARDS.proof.add}
                act={{
                  label: OFFER_CARDS.proof.add,
                  icon: "plus",
                  onClick: () => {
                    setAdding(true);
                    request();
                  },
                }}
              />
            ) : null}
            <p className="bt-fold-note" data-testid="rec-proof-foot">
              {OFFER_CARDS.proof.foot}
            </p>
          </>
        )}
        body={(f) => <ProofRows f={f} />}
      />
    </OutreachCard>
  );
}
