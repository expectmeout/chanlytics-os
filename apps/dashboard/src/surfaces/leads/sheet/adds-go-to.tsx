/**
 * Adds go to ▾, over a search's rows (the canvas's DeskOne and PhoneHalf boards, 18 Oct 2026): where this search's Add
 * goes, its pick, kept on the search (00459 lead_search_aim), so a desk, a phone and a teammate agree; changed here without
 * adding anyone (the canvas's "changing the pick without adding"), or in the picker as a lead is added. Nothing until the
 * sequences are read. Its last item is New sequence (the walk of 30 Oct 2026: a search for a new kind of lead had no way
 * to a sequence of its own from here): every lead shown is chosen and Add opens at New, the one place a sequence is named
 * and started from; with none taking leads yet, New is all it offers.
 */
import { LEAD_SHEET_WORDS as W, leadPickerRowsOf } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuGroup } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import type { LeadAim } from "./use-aim";

export function AddsGoTo({
  aim,
  flash,
  onNew,
}: {
  aim: LeadAim;
  flash: (f: LegacyFlash) => void;
  /** Choose every lead shown and open Add at New; none where nothing is shown to add. */
  onNew: (() => void) | null;
}) {
  const rows = aim.targets ? leadPickerRowsOf(aim.targets, aim.target ? aim.target.rootId : null) : null;
  if (!rows || (rows.length === 0 && !onNew)) return null;
  const pick = aim.target;
  const groups: MenuGroup[] = [];
  if (rows.length)
    groups.push({
      choose: {
        value: pick ? pick.rootId : "",
        onChoose: (id) => {
          const row = rows.find((r) => r.id === id);
          if (!row) return;
          aim.choose(id);
          flash({ tone: "ok", msg: `${W.addsGoTo} ${row.name}` });
        },
        tick: <Icon name="check" size={13} />,
        options: rows.map((r) => ({ value: r.id, label: `${r.name} · ${r.word}` })),
      },
    });
  if (onNew) groups.push({ items: [{ label: W.newSequence, onSelect: onNew }] });
  return (
    <div className="lw-adds" data-testid="leads-adds-go-to">
      <span className="lw-adds-k">{W.addsGoTo}</span>
      <Menu
        label={W.addsGoTo}
        trigger={
          <Button
            size="sm"
            variant="secondary"
            data-testid="leads-adds-go-to-pick"
            {...gate("approve", "choose where adds go")}
          >
            {pick ? pick.name : W.noneYet}
            <Icon name="chevron-down" size={12} />
          </Button>
        }
        groups={groups}
      />
    </div>
  );
}
