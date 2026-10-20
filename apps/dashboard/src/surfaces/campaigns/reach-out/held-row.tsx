/**
 * One email the check held (R20), the one row both places that answer it draw (the framework's rating, 19 Oct 2026: two
 * rows for one decision): a run's screen, for its batch (reach-out/approval.tsx), and a sequence's Needs you, for every
 * batch (sequences/needs.tsx). Whose it is (the lead, opened over the page), why the check held it, and its answers
 * (contracts heldAnswersOf), each a button under the why: the decide verb's doors (`sequence_send_decide`), so an answer
 * given in one place is given in both, and Take out at step 1, the leave verb, which the place drawing the row presses.
 * The answer the hold points to is filled, the rest quiet; a refusal is said at the row. A role that may not answer sees
 * the row without its answers. On a run's screen it is a row of the amber card (`look="card"`, the run-to-leads canvas):
 * the business's tile, its name, why in a muted line with the claim in ink, and its answers as pills.
 */
import { REACH_OUT_SHEET_WORDS, type HeldAnswer, type HeldChoice } from "@chanlytics/contracts";
import { Fragment } from "react";
import { Button } from "../../kit/button/button";
import { Face, faceTileOf } from "../../kit/face/face";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { leadOverDoor } from "../../leads/sheet/lead-over";

/** What a held email's row says: whose, why, and its answers in their words. */
interface HeldEmail {
  name: string;
  leadId: string | null;
  why: string;
  answers: readonly HeldAnswer[];
}

/** The row's test ids, which each place keeps as its own: a run's screen's and a sequence's. */
interface HeldRowIds {
  row: string;
  lead: string;
  door: (door: HeldChoice) => string;
  said: string;
}

/** A run's screen's ids for a held email's row. */
export const RUN_HELD_IDS: HeldRowIds = {
  row: "ro-held",
  lead: "ro-held-lead",
  door: (door) => `ro-door-${door}`,
  said: "ro-held-said",
};

/** A sequence's Needs you's ids for a held email's row. */
export const SEQUENCE_HELD_IDS: HeldRowIds = {
  row: "sq-held",
  lead: "sq-held-lead",
  door: (door) => `sq-held-${door}`,
  said: "sq-held-said",
};

interface HeldRowProps {
  h: HeldEmail;
  may: boolean;
  busy: boolean;
  /** A refusal of this row's answer, said under its why; null where there is none. */
  said?: string | null;
  onAnswer: (door: HeldChoice) => void;
  ids: HeldRowIds;
  /** A row of a list (a sequence's Needs you), or of the run's amber card. */
  look?: "row" | "card";
}

/** Why, as the card says it: the claim the check could not back, in its quotes, set in ink. */
function heldWhyParts(why: string) {
  return why
    .split(/(“[^”]+”)/)
    .map((part, at) =>
      /^“[^”]+”$/.test(part) ? <q key={at}>{part.slice(1, -1)}</q> : <Fragment key={at}>{part}</Fragment>,
    );
}

/** The row on the run's amber card: the business's tile, its name, why, its answers as pills, and a refusal under them. */
function HeldCardRow({ h, may, busy, said = null, onAnswer, ids }: HeldRowProps) {
  return (
    <div className="ro-hrow" data-testid={ids.row}>
      <Face person={{ name: h.name }} tile={faceTileOf(h.name)} />
      <div className="ro-hrow-main">
        <div className="ro-hrow-who">
          {h.leadId ? (
            <LinkButton
              size="inherit"
              className="ro-name"
              title={REACH_OUT_SHEET_WORDS.openLead}
              {...leadOverDoor(h.leadId)}
              data-testid={ids.lead}
            >
              {h.name}
            </LinkButton>
          ) : (
            <span className="ro-name">{h.name}</span>
          )}
        </div>
        <p className="ro-hrow-why">{heldWhyParts(h.why)}</p>
        {may && h.answers.length > 0 ? (
          <div className="ro-hrow-acts">
            {h.answers.map((a) => (
              <Button
                key={a.door}
                variant={a.lead ? "secondary" : "quiet"}
                className={a.lead ? "ro-ans" : "ro-ans ro-ans-q"}
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => onAnswer(a.door)}
                data-testid={ids.door(a.door)}
              >
                {a.words}
              </Button>
            ))}
          </div>
        ) : null}
        {said ? (
          <p className="ro-hrow-said" role="alert" data-testid={ids.said}>
            {said}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function HeldEmailRow(p: HeldRowProps) {
  if (p.look === "card") return <HeldCardRow {...p} />;
  const { h, may, busy, said = null, onAnswer, ids } = p;
  return (
    <ListRow
      face={{ person: { name: h.name }, size: "sm" }}
      name={
        h.leadId ? (
          <LinkButton
            size="inherit"
            title={REACH_OUT_SHEET_WORDS.openLead}
            {...leadOverDoor(h.leadId)}
            data-testid={ids.lead}
          >
            {h.name}
          </LinkButton>
        ) : (
          h.name
        )
      }
      said={(place) => (
        <div className={`${place} sq-needs sq-held-why`}>
          {h.why}
          {said ? (
            <span className="pb-warn sq-held-said" role="alert" data-testid={ids.said}>
              {said}
            </span>
          ) : null}
        </div>
      )}
      // The answers as one group in the facts' line, which wraps them on a phone: three stood in a row past its edge.
      facts={
        may
          ? [
              <div key="answers" className="sq-held-answers">
                {h.answers.map((a) => (
                  <Button
                    key={a.door}
                    variant={a.lead ? "secondary" : "quiet"}
                    disabled={busy}
                    aria-busy={busy || undefined}
                    onClick={() => onAnswer(a.door)}
                    data-testid={ids.door(a.door)}
                  >
                    {a.words}
                  </Button>
                ))}
              </div>,
            ]
          : []
      }
      data-testid={ids.row}
    />
  );
}
