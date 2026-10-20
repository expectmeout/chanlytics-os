/**
 * One email the check held (R20), the one row both places that answer it draw (the framework's rating, 19 Oct 2026: two
 * rows for one decision): a run's screen, for its batch (reach-out/approval.tsx), and a sequence's Needs you, for every
 * batch (sequences/needs.tsx). Whose it is (the lead, opened over the page), why the check held it, and its answers
 * (contracts heldAnswersOf), each a button under the why: the decide verb's doors (`sequence_send_decide`), so an answer
 * given in one place is given in both, and Take out at step 1, the leave verb, which the place drawing the row presses.
 * The answer the hold points to is filled, the rest quiet; a refusal is said at the row. A role that may not answer sees
 * the row without its answers.
 */
import { REACH_OUT_SHEET_WORDS, type HeldAnswer, type HeldChoice } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
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

export function HeldEmailRow(p: {
  h: HeldEmail;
  may: boolean;
  busy: boolean;
  /** A refusal of this row's answer, said under its why; null where there is none. */
  said?: string | null;
  onAnswer: (door: HeldChoice) => void;
  ids: HeldRowIds;
}) {
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
