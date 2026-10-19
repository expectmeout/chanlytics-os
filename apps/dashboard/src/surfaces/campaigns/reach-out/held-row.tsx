/**
 * One email the check held (R20), the one row both places that answer it draw (the framework's rating, 19 Oct 2026: two
 * rows for one decision): a run's screen, for its batch (reach-out/approval.tsx), and a sequence's Needs you, for every
 * batch (sequences/needs.tsx). Whose it is (the lead, opened over the page), why the check held it, and its answers, each
 * the decide verb (`sequence_send_decide`), so an answer given in one place is given in both; a refusal is said at the
 * row. A role that may not answer sees the row without its doors.
 */
import { REACH_OUT_SHEET_WORDS, type HoldDoor } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { leadOverDoor } from "../../leads/sheet/lead-over";

/** What a held email's row says: whose, why, and its answers in their words. */
interface HeldEmail {
  name: string;
  leadId: string | null;
  why: string;
  doors: readonly (readonly [HoldDoor, string])[];
}

/** The row's test ids, which each place keeps as its own: a run's screen's and a sequence's. */
interface HeldRowIds {
  row: string;
  lead: string;
  door: (door: HoldDoor) => string;
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
  onDecide: (door: HoldDoor) => void;
  ids: HeldRowIds;
}) {
  const { h, may, busy, said = null, onDecide, ids } = p;
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
            <>
              {" "}
              <span className="pb-warn" role="alert" data-testid={ids.said}>
                {said}
              </span>
            </>
          ) : null}
        </div>
      )}
      facts={
        may
          ? h.doors.map(([door, words]) => (
              <LinkButton
                key={door}
                disabled={busy}
                aria-busy={busy || undefined}
                onClick={() => onDecide(door)}
                data-testid={ids.door(door)}
              >
                {words}
              </LinkButton>
            ))
          : []
      }
      data-testid={ids.row}
    />
  );
}
