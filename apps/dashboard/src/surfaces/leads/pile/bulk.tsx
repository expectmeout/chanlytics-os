/**
 * Add them all (the lead workbench, canvas B): over the pile, the door that adds every lead open in this pass to the
 * sequence at once, after saying what each would come to. Its popover holds the buckets the add door's own answers and
 * the send's fill make (contracts leadCardBulkOf: go as they are, greeted “there”, once their address checks out, in
 * another sequence, can't be written to) and the one press that adds those that go, undone as one by the pile's Undo.
 *
 * Its buckets are worked out with the pile (page-pile.tsx), so its door counts only the leads that would go and shows only
 * where two or more would; it closes as its press is made.
 */
import { useState } from "react";
import { leadCardBulkDoorOf, type LeadCardBulkVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Popover } from "../../kit/popover/popover";
import { gate } from "../../legacy-verbs";

/** The bulk door's facts: how many are open, the buckets as they would be now, and the add. */
export interface PileBulkFacts {
  n: number;
  vm: () => LeadCardBulkVM;
  add: (ids: string[]) => void;
}

/** What the popover holds: the buckets, each with its count and where it can't go why, and the press. */
const BulkBody = ({ bulk, busy, done }: { bulk: PileBulkFacts; busy: boolean; done: () => void }) => {
  const vm = bulk.vm();
  return (
    <div className="ld-pile-bulk" data-testid="lead-pile-bulk">
      <h3>{vm.title}</h3>
      <ul>
        {vm.buckets.map((b) => (
          <li key={b.key} className={b.goes ? "goes" : "stays"} data-testid={`lead-pile-bulk-${b.key}`}>
            <span className="ld-pile-bulk-n">{b.n}</span>
            <span>
              {b.label}
              {b.note ? <span className="ld-pile-bulk-note">{b.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <Button
        variant="primary"
        size="sm"
        disabled={busy || vm.waiting > 0 || !vm.ids.length}
        onClick={() => {
          bulk.add(vm.ids);
          done();
        }}
        data-testid="lead-pile-bulk-add"
      >
        {vm.press}
      </Button>
    </div>
  );
};

/** The door over the pile, and its popover. */
export function PileBulk({ bulk, busy }: { bulk: PileBulkFacts; busy: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={leadCardBulkDoorOf(bulk.n)}
      align="end"
      trigger={
        <Button
          size="sm"
          variant="quiet"
          className="ld-pile-all"
          disabled={busy}
          data-testid="lead-pile-bulk-door"
          {...gate("approve", "add leads")}
        >
          {leadCardBulkDoorOf(bulk.n)}
        </Button>
      }
    >
      {open ? <BulkBody bulk={bulk} busy={busy} done={() => setOpen(false)} /> : null}
    </Popover>
  );
}
