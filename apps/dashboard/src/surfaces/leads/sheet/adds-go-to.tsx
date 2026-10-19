/**
 * Adds go to ▾, over a search's rows (the canvas's DeskOne and PhoneHalf boards, 18 Oct 2026): where this search's Add
 * goes, its pick, kept on the search (00459 lead_search_aim), so a desk, a phone and a teammate agree; changed here without
 * adding anyone (the canvas's "changing the pick without adding"), or in the picker as a lead is added. Nothing until the
 * sequences are read, and nothing where none takes leads yet (the picker's New makes the first).
 */
import { LEAD_SHEET_WORDS as W, leadPickerRowsOf } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import type { LeadAim } from "./use-aim";

export function AddsGoTo({ aim, flash }: { aim: LeadAim; flash: (f: LegacyFlash) => void }) {
  const rows = aim.targets ? leadPickerRowsOf(aim.targets, aim.target ? aim.target.rootId : null) : null;
  if (!rows || rows.length === 0) return null;
  const pick = aim.target;
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
        groups={[
          {
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
          },
        ]}
      />
    </div>
  );
}
