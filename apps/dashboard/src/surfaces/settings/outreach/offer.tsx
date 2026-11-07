/**
 * How it reaches out (decision 0113): What you offer, and Proof you stand behind. Each row is a fold of the record, one
 * key of the config's reach_out section, saved through the tab's one saver (business/fold-shapes.ts holds what each opens
 * with, writes and refuses). A row with nothing set says what the writers read in its place, in the dim ink of a fact
 * not yet the owner's, and why: what the business does, else its goal (contracts reachOutOfferOf).
 */
import { REACH_OUT_LIMITS, REACH_OUT_SETTINGS_WORDS, reachOutOfferOf } from "@chanlytics/contracts";
import { gate } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordBox, RecordField } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { BtFold } from "../business/gestures/fold";
import { OutreachCard, type OutreachShared } from "./card";

const W = REACH_OUT_SETTINGS_WORDS;
type Fields = Parameters<Parameters<typeof BtFold>[0]["body"]>[0];

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const stored = (shared: OutreachShared, key: string): string | null =>
  textOf(shared.config.reach_out?.[key]).trim() || null;

/** One box of words, named by its fold's label on screen (rec-fold-<id>-label), as the voice's box is. */
const WordsBox = ({ id, rows, placeholder, f }: { id: string; rows: number; placeholder: string; f: Fields }) => (
  <RecordField
    id={`ro-${id}`}
    label={null}
    aria-labelledby={`rec-fold-${id}-label`}
    rows={rows}
    value={textOf(f.draft)}
    onChange={(v) => f.update(() => v, [id])}
    problem={f.problems[id] || null}
    placeholder={placeholder}
    readOnly={f.readOnly || undefined}
    testid={`rec-${id}-box`}
  />
);

/** A row of words: what is set, or what the writers read where nothing is, and a box to change it. */
const wordsFold = (
  shared: OutreachShared,
  p: { id: string; label: string; rows: number; placeholder: string; fallback?: string | null; from?: string | null },
) => (
  <BtFold
    canEdit={shared.canEdit}
    flash={shared.flash}
    saver={shared.saver}
    id={p.id}
    label={p.label}
    channel={null}
    gate={gate("settings", `change ${p.label.toLowerCase()}`)}
    row={{
      value: stored(shared, p.id),
      empty: p.fallback ? <span className="rec-row-empty">{p.fallback}</span> : W.offer.empty,
      hint: p.fallback ? p.from : null,
    }}
    body={(f) => <WordsBox id={p.id} rows={p.rows} placeholder={p.placeholder} f={f} />}
  />
);

/** What you offer: the offer, who it is for, and what it fixes. Every first email is about the first. */
export function OfferCard(shared: OutreachShared) {
  const about = shared.read?.about ?? null;
  const fallback = shared.config.reach_out?.offer ? null : reachOutOfferOf(shared.config, about);
  const from = about?.trim() ? W.offer.fromAbout : W.offer.fromGoal;
  return (
    <OutreachCard id="offer" title={W.offer.title} sub={W.offer.sub}>
      {wordsFold(shared, {
        id: "offer",
        label: W.offer.offer,
        rows: 3,
        placeholder: "After-hours cleaning for dental offices, so every morning starts spotless.",
        fallback,
        from,
      })}
      {wordsFold(shared, {
        id: "who_for",
        label: W.offer.whoFor,
        rows: 1,
        placeholder: "Dental and medical clinics in Austin",
      })}
      {wordsFold(shared, {
        id: "fixes",
        label: W.offer.fixes,
        rows: 2,
        placeholder: "Cleaners who come in during opening hours, or miss rooms",
      })}
    </OutreachCard>
  );
}

/** The claims as the fold edits them: one box a claim, a remove beside each, and an add while there is room. */
const ProofRows = ({ f }: { f: Fields }) => {
  const claims = Array.isArray(f.draft) ? f.draft.map(textOf) : [];
  const put = (next: string[], keys: string[]) => f.update(() => next, keys);
  return (
    <div className="ro-claims" data-testid="rec-proof-rows">
      {claims.map((claim, i) => (
        <div className="ro-claim" key={i} data-testid={`rec-claim-${i}`}>
          <RecordBox
            id={`ro-claim-${i}`}
            label={`Claim ${i + 1}`}
            rows={2}
            value={claim}
            placeholder="We clean 40 clinics across Austin today."
            onChange={(v) =>
              put(
                claims.map((c, j) => (j === i ? v : c)),
                [`claim-${i}`],
              )
            }
            problem={f.problems[`claim-${i}`] || null}
            readOnly={f.readOnly}
          />
          <Button
            variant="quiet"
            size="sm"
            iconOnly
            aria-label={`Remove claim ${i + 1}`}
            {...f.press(() =>
              put(
                claims.filter((_, j) => j !== i),
                ["proof"],
              ),
            )}
            data-testid={`rec-claim-remove-${i}`}
          >
            <Icon name="x" size={12} />
          </Button>
        </div>
      ))}
      {claims.length < REACH_OUT_LIMITS.claims ? (
        <Button size="sm" {...f.press(() => put([...claims, ""], ["proof"]))} data-testid="rec-proof-add">
          <Icon name="plus" size={12} /> {W.proof.add}
        </Button>
      ) : null}
      <FieldError id="ro-proof-problem" message={f.problems.proof || null} testid="rec-proof-problem" />
    </div>
  );
};

/**
 * Proof you stand behind: the only claims Ask may make about the business, word for word, one an email. At rest each
 * claim is a row with how many emails carried it (the read's count of the steps whose words hold it); Add a claim and
 * each row's Change open the one fold of the list.
 */
export function ProofCard(shared: OutreachShared) {
  const claims = (shared.config.reach_out?.proof ?? []).map(textOf).filter((c) => c.trim());
  const sends = (text: string) => shared.read?.claims.find((c) => c.text === text)?.sends ?? 0;
  return (
    <OutreachCard id="proof" title={W.proof.title} sub={W.proof.sub}>
      <BtFold
        canEdit={shared.canEdit}
        flash={shared.flash}
        saver={shared.saver}
        id="proof"
        label={W.proof.title}
        channel={null}
        gate={gate("settings", "change the claims it may make")}
        rest={({ request, can }) => (
          <>
            {claims.map((claim, i) => (
              <RecordRow
                key={i}
                id={i === 0 ? "proof" : `proof-${i}`}
                label={claim}
                stacked
                value={<span data-testid={`rec-row-proof-${i}-meta`}>{W.proof.count(sends(claim))}</span>}
                act={shared.canEdit && can ? { label: "Change", icon: "pencil", onClick: () => request() } : null}
              />
            ))}
            {shared.canEdit && can && claims.length < REACH_OUT_LIMITS.claims ? (
              <RecordRow
                id={claims.length ? "proof-add" : "proof"}
                label={W.proof.add}
                act={{ label: W.proof.add, icon: "plus", onClick: () => request() }}
              />
            ) : null}
            <p className="bt-fold-note" data-testid="rec-proof-foot">
              {W.proof.foot}
            </p>
          </>
        )}
        body={(f) => <ProofRows f={f} />}
      />
    </OutreachCard>
  );
}
