/**
 * Settings › Autonomy › Replies: the people set differently (the Settings wiring review, item 10, 18 Oct 2026). Replies
 * says what the receptionist does for everyone, and a person may have a mode of their own (their page's mode, or Ask's
 * card for many), which nothing here said. One row: how many, how many under each mode, and a menu of the newest
 * changes, each opening the person's page, where their mode is changed. Every word is contracts' (ownModesWords, and
 * the person page's PERSON_MODE_LABELS). Nothing where nobody is set apart, or where the read failed.
 */
import { PERSON_MODE_LABELS, addressOf, ownModesWords, type OwnModesDto } from "@chanlytics/contracts";
import { RecordRow } from "../../kit/record/row";
import { navigate } from "../../frame-verbs";
import { choiceAct } from "../choice-act";

export function AutOwnModes({ own }: { own: OwnModesDto | null | undefined }) {
  const W = ownModesWords(own);
  if (!own || !W) return null;
  return (
    <RecordRow
      id="aut-own-modes"
      label={W.label}
      hint={W.hint}
      value={W.value}
      // The value and a menu at its end, as every row of Settings that opens a list is (../choice-act.tsx).
      act={choiceAct({
        items: [
          { header: W.header },
          ...own.named.map((p) => ({
            label: p.name,
            meta: PERSON_MODE_LABELS[p.mode],
            onClick: () => navigate(addressOf({ kind: "person", id: p.id })),
          })),
        ],
        name: `${W.label}: ${W.value}`,
        testid: "aut-own-modes-menu",
      })}
    />
  );
}
