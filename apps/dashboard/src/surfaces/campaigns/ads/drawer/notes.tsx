/**
 * The notes under a tapped word's choices (what changing it does, the platform's rules): on a desk every one, under the
 * choices; on a phone the first, and the rest folded under "How this works", where four lines of fine print stood under
 * five choices (Ruben, 14 Oct 2026, the fitted sheets: two lines, then a fold).
 */
import { LIST } from "@chanlytics/contracts/ads-page";
import { RecordDisclosure } from "../../../kit/record/disclosure";

export function AdsNotes({ notes, phone, id }: { notes: readonly string[]; phone: boolean; id: string }) {
  if (notes.length === 0) return null;
  const [first, ...rest] = notes;
  const said = (list: readonly string[]) =>
    list.map((note) => (
      <p key={note} className="ads-note">
        {note}
      </p>
    ));
  if (!phone || rest.length === 0) return <div className="ads-notes">{said(notes)}</div>;
  return (
    <div className="ads-notes">
      {said([first ?? ""])}
      <RecordDisclosure id={`ads-notes-${id}`} label={LIST.how} testid={`ads-notes-${id}`}>
        {said(rest)}
      </RecordDisclosure>
    </div>
  );
}
