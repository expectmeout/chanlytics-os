/**
 * A row of the Week not made yet, opened (the approved boards, Week 12; the PRD's 21.3 in the order a planned piece has):
 * the footage it is planned from, where it goes (a line a place, its time, or why it waits), and the words AI wrote for it,
 * as the approval will make it. Its one fix leads the foot, as on its row. A made piece opens in Content's own viewer.
 */
import { WEEK_WORDS as W, fileViewOf, slotWhenSaid, type WeekRow } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Picture } from "../../../files/photo";
import { CmPane } from "../../parts/split";

/** How a place takes a slot, as its line says it: "Instagram reel", "Google post". */
const placeSaid = (slot: WeekRow["slots"][number]): string =>
  `${W.place[slot.place]} ${slot.kind === "reel" ? "reel" : slot.kind === "story" ? "story" : "post"}`;

export function WeekPlanned({
  row,
  zone,
  onClose,
  onFix,
  busy,
}: {
  row: WeekRow;
  zone: string;
  onClose: () => void;
  onFix: (row: WeekRow) => void;
  busy: boolean;
}) {
  const first = row.slots[0];
  const words = first?.words ?? null;
  return (
    <CmPane
      title={row.title}
      sub={<span data-tone={row.tone || undefined}>{row.line}</span>}
      onClose={onClose}
      testid="cwk-planned"
      className="cwk-planned"
      foot={
        row.fix ? (
          <Button variant="primary" onClick={() => onFix(row)} disabled={busy} data-testid="cwk-planned-fix">
            {row.fix.label}
          </Button>
        ) : undefined
      }
    >
      {row.still ? (
        <div className="cwk-planned-picture">
          <Picture src={`${fileViewOf(row.still)}?w=720`} alt="" name={row.title} />
        </div>
      ) : null}
      <h4>{W.whereItGoes}</h4>
      <ul className="cwk-where">
        {row.slots.map((slot) => (
          <li key={slot.id}>
            <b>{placeSaid(slot)}</b>
            <span>{slot.state === "blocked" ? (slot.blocked_reason ?? "") : slotWhenSaid(slot.at, zone)}</span>
          </li>
        ))}
      </ul>
      {words ? (
        <>
          <h4>{W.caption}</h4>
          <p className="cwk-caption">{words.caption}</p>
        </>
      ) : null}
      {first?.reason ? <p className="cwk-why">{first.reason}</p> : null}
    </CmPane>
  );
}
