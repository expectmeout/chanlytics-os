/**
 * Combine (decision 0052, amending 0028; canvas A, X5): the kit's Sheet over the page, opened from the notice that offers
 * it, an owner's press. It says who the two records are, what the person who answered keeps and takes (contracts
 * combineOf: each row a thing the merge door makes true) and why they are one, and its foot is the press, with no typed
 * name: the sheet is the question. The door keeps the person who answered whichever page it is pressed from, so the press
 * names them first (`mergePerson(keep, drop)`) and reads the door's own answer for who was kept.
 *
 * No Undo: no door undoes a merge. Pressed from the record we wrote to, the page that pressed goes (that record is folded
 * in), so the toast is said on the kept person's page as it opens (`takeArrival`).
 */
import { useEffect, useRef } from "react";
import { COMBINE_WORDS, combineOf, personTabRoute } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { FieldError } from "../../../kit/field-error/field-error";
import { Icon } from "../../../kit/icon/icon";
import { Sheet } from "../../../kit/sheet/sheet";
import { navigate } from "../../../legacy-verbs";
import { keptOf, mergePerson } from "../../people-detail";
import type { PageCtx } from "../ctx";

/** A toast waiting for the page it was said for: one at a time, taken once. */
let waiting: { id: string; msg: string } | null = null;

/** What the kept person's page says as it opens, once: Combine pressed on the record that folded into them. */
export function useArrivalToast(id: string, flash: PageCtx["flash"]): void {
  const say = useRef(flash);
  say.current = flash;
  useEffect(() => {
    const w = waiting;
    if (!w || w.id !== id) return;
    waiting = null;
    say.current({ msg: w.msg });
  }, [id]);
}

/** The Combine sheet, open while the page holds a pair (`c.combine.act`), for an owner. */
export function CombineSheet({ c }: { c: PageCtx }) {
  const act = c.combine.act;
  const business = c.p.business?.name ?? (c.p.worksAt && !c.p.worksAt.gone ? c.p.worksAt.name : null);
  const vm =
    act && business && c.isOwner
      ? combineOf({ here: { id: c.p.id, name: c.p.name, email: c.p.email }, act, business })
      : null;
  const busy = c.combine.busy;
  const close = () => {
    if (!busy) c.setCombine({ act: null, busy: false, error: null });
  };
  const combine = async () => {
    if (!vm || busy) return;
    c.setCombine((s) => ({ ...s, busy: true, error: null }));
    const r = await mergePerson(vm.keepId, vm.dropId);
    if (!r.ok) {
      c.setCombine((s) => ({ ...s, busy: false, error: r.message || COMBINE_WORDS.failed }));
      return;
    }
    // The door's answer is who was kept.
    const kept = keptOf(r.data, vm.keepId);
    const said = COMBINE_WORDS.done(vm.keptName);
    c.setCombine({ act: null, busy: false, error: null });
    if (kept === c.p.id) {
      c.flash({ msg: said });
      c.load();
      return;
    }
    waiting = { id: kept, msg: said };
    navigate(personTabRoute(kept, "overview"), { replace: true });
  };
  const foot = vm ? (
    <>
      {c.combine.error ? <FieldError message={c.combine.error} testid="person-combine-error" /> : null}
      <div className="cl-prof-combine-foot">
        <span className="cl-prof-combine-role">{COMBINE_WORDS.owner}</span>
        <Button size="sm" variant="quiet" onClick={close} disabled={busy} data-testid="person-combine-cancel">
          {COMBINE_WORDS.cancel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void combine()}
          aria-busy={busy || undefined}
          data-testid="person-combine-yes"
        >
          {busy ? COMBINE_WORDS.busy : COMBINE_WORDS.yes}
        </Button>
      </div>
    </>
  ) : null;
  return (
    <Sheet
      open={!!vm}
      onClose={close}
      title={vm?.title ?? ""}
      sub={vm?.sub}
      close={{ label: COMBINE_WORDS.close, glyph: <Icon name="x" size={13} /> }}
      foot={foot}
      footCloses
      testid="person-combine-sheet"
    >
      {vm ? (
        <div className="cl-prof-combine">
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
      ) : null}
    </Sheet>
  );
}
