/**
 * A setting whose answer is one of a few, shown as every row of Settings shows a value (the phone change list's B3, 25 Nov
 * 2026): the answer in the row's value, and the row's one act at its end, its words in the quiet ink on a desk and the
 * chevron on a phone, the whole row its press, which opens the answers: the house's menu, a phone's sheet, the one chosen
 * ticked on the pick's lilac. The answer was a link with a caret inside it ("They book with your link ⌄", "Sends it ⌄"),
 * a fourth kind of picker beside the row's act, the segmented control and the menu.
 */
import { MoreMenu } from "../kit/more-menu/more-menu";
import type { RecordAct } from "../kit/record/row";

/** The answers in the menu, as the house's menu takes them. */
type ChoiceItems = NonNullable<Parameters<typeof MoreMenu>[0]["items"]>;

/** The act's words, as every row of Settings that opens its value says it. */
const CHOICE_ACT_WORD = "Change";

/**
 * The row's act that opens its answers: the menu's control drawn as the row's act (RecordAct `wrap`), named by the
 * question and its answer ("When someone wants to book: They book with your link"); `gated` holds the whole menu shut and
 * says why, as a role's gate or a save that is out does.
 */
export const choiceAct = (o: {
  items: ChoiceItems;
  name: string;
  gated?: string | null;
  testid?: string | null;
}): RecordAct => ({
  label: CHOICE_ACT_WORD,
  wrap: (_button, face) => (
    <MoreMenu
      items={o.items}
      face={face}
      btnClass="rec-row-act"
      title={o.name}
      ariaLabel={o.name}
      align="right"
      escape
      gated={o.gated ?? null}
      testid={o.testid ?? null}
    />
  ),
});
