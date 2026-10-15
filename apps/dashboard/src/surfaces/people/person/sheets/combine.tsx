/**
 * Combine (decision 0052, amending 0028; canvas A, X5): asked in the Merge sheet (hero.tsx), opened from the notice that
 * offers it with the pair already chosen, an owner's press. It was a sheet of its own beside Merge's for the same door
 * (the sheets as verbs, 14 Oct 2026); now Merge's sheet, given the pair, says Combine's question: who the two records
 * are, what the person who answered keeps and takes (contracts combineOf: each row a thing the merge door makes true) and
 * why they are one, and its foot is the press, with no typed name: the question is the sheet. The door keeps the person
 * who answered whichever page it is pressed from, so the press names them first (`mergePerson(keep, drop)`) and reads
 * the door's own answer for who was kept.
 *
 * No Undo: no door undoes a merge. Pressed from the record we wrote to, the page that pressed goes (that record is folded
 * in), so the toast is said on the kept person's page as it opens (`takeArrival`).
 */
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { COMBINE_WORDS, combineOf, personTabRoute } from "@chanlytics/contracts";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import { navigate } from "../../../legacy-verbs";
import { keptOf, mergePerson } from "../../people-detail";
import { MERGE_CLOSED } from "../ctx";
import type { PageCtx } from "../ctx";

/** A toast waiting for the page it was said for: one at a time, taken once. */
let arrival: { id: string; msg: string } | null = null;

/** What the kept person's page says as it opens, once: Combine pressed on the record that folded into them. */
export function useArrivalToast(id: string, flash: PageCtx["flash"]): void {
  const say = useRef(flash);
  say.current = flash;
  useEffect(() => {
    const w = arrival;
    if (!w || w.id !== id) return;
    arrival = null;
    say.current({ msg: w.msg });
  }, [id]);
}

/** Combine's question in the Merge sheet: its title and line, its body, and its foot; null where it cannot be asked. */
export function combineAsk(c: PageCtx): { title: string; sub: string; body: ReactNode; foot: ReactNode } | null {
  const act = c.merge.combine;
  const business = c.p.business?.name ?? (c.p.worksAt && !c.p.worksAt.gone ? c.p.worksAt.name : null);
  if (!act || !business || !c.isOwner) return null;
  const vm = combineOf({
    here: { id: c.p.id, name: c.p.name, email: c.p.email },
    act,
    business,
    dealsOn: c.p.dealsOn,
  });
  const { busy } = c.merge;
  const combine = async () => {
    if (busy) return;
    c.setMerge((s) => ({ ...s, busy: true, error: null }));
    const r = await mergePerson(vm.keepId, vm.dropId);
    if (!r.ok) {
      c.setMerge((s) => ({ ...s, busy: false, error: r.message || COMBINE_WORDS.failed }));
      return;
    }
    // The door's answer is who was kept.
    const kept = keptOf(r.data, vm.keepId);
    const said = COMBINE_WORDS.done(vm.keptName);
    c.setMerge(MERGE_CLOSED);
    if (kept === c.p.id) {
      c.flash({ msg: said });
      c.load();
      return;
    }
    arrival = { id: kept, msg: said };
    navigate(personTabRoute(kept, "overview"), { replace: true });
  };
  return {
    title: vm.title,
    sub: vm.sub,
    body: (
      <div className="cl-prof-combine" data-testid="person-combine-sheet">
        <p className="cl-prof-ask-detail">{vm.body}</p>
        <ul className="cl-prof-combine-rows">
          {vm.rows.map((row) => (
            <li key={row} className="cl-prof-combine-row">
              <Icon name="check" size={13} />
              <span>{row}</span>
            </li>
          ))}
        </ul>
        {vm.why ? <p className="cl-prof-combine-why">{vm.why}</p> : null}
      </div>
    ),
    foot: (
      <Confirm
        question={`${vm.title}?`}
        yes={COMBINE_WORDS.yes}
        no={COMBINE_WORDS.cancel}
        busyLabel={COMBINE_WORDS.busy}
        busy={busy}
        error={c.merge.error}
        onYes={() => void combine()}
        onNo={() => {
          if (!busy) c.setMerge(MERGE_CLOSED);
        }}
        testid="person-combine"
      />
    ),
  };
}
