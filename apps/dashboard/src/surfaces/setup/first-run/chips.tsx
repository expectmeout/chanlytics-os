/**
 * Check's chips (moved from legacy/pages/first-run.jsx, decision 0015): what the business offers and the languages its
 * receptionist speaks, a toggle each, saved as the Business tab saves that list.
 */
import { sameListed, type CheckChipSetVM, type CheckChipVM, type FIRST_RUN_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { canDo, gate, type LegacyFlash } from "../../legacy-verbs";
import { businessTabSave } from "../shell";

type ChipWords = (typeof FIRST_RUN_WORDS)["check"]["chips"];
type ChipList = "services" | "languages";

// The two lists a chip changes, as the Business tab's folds hold them (draftOf): what a row of each is, and the name it
// goes by.
const LISTS: Record<ChipList, { row: (name: string) => unknown; nameOf: (r: unknown) => string }> = {
  services: {
    row: (name) => ({ name }),
    nameOf: (r) => {
      const name: unknown = r && typeof r === "object" ? Reflect.get(r, "name") : null;
      return typeof name === "string" ? name : "";
    },
  },
  languages: { row: (name) => name, nameOf: (r) => (typeof r === "string" ? r : "") },
};

/**
 * A chip's press, saved as the Business tab saves that list: the list's draft as the next save finds it (draftOf on the
 * saver's base), changed, and sent as its fold's one job (foldJob), which writes it as the tab's own editor writes it and
 * refuses to go when the list moved under it. Off, it adds the name at the end, quietly (the chip turns on). On, it takes
 * out every row of that name (sameListed, contracts' one rule), and the toast's Undo puts each back where it was, whole: a
 * service keeps its minutes and its price. Only a refusal is said, in the saver's words. A role that may not change the
 * business sends nothing, whatever pressed it.
 */
function chipPress(o: { list: ChipList; chip: CheckChipVM; flash: (f: LegacyFlash) => void; words: ChipWords }) {
  const { list, chip, flash, words } = o;
  if (!canDo("settings")) return;
  const S = businessTabSave();
  if (!S) return;
  const L = LISTS[list];
  const same = (r: unknown) => sameListed(L.nameOf(r), chip.name);
  const refusals = (f: unknown) => {
    if (f && typeof f === "object" && Reflect.get(f, "tone") === "danger") flash(f as LegacyFlash);
  };
  // `edit` is run once, now, on the list as the next save finds it, and hands back the list the press leaves.
  const send = (edit: (rows: unknown[]) => unknown[], done: (() => void) | null = null) => {
    const opened = S.draftOf(list, S.saver.base());
    S.saver.save(S.foldJob(list, edit(opened), { opened, said: null, done, flash: refusals }));
  };
  if (!chip.on) {
    send((rows) => (rows.some(same) ? rows : rows.concat([L.row(chip.name)])));
    return;
  }
  // Every row of that name, and its place, for the Undo to put back whole.
  let gone: { row: unknown; at: number }[] = [];
  const putBack = (rows: unknown[]) => {
    if (rows.some(same)) return rows;
    const back = rows.slice();
    gone.forEach((g) => back.splice(Math.min(g.at, back.length), 0, g.row));
    return back;
  };
  send(
    (rows) => {
      gone = rows.flatMap((row, at) => (same(row) ? [{ row, at }] : []));
      return rows.filter((r) => !same(r));
    },
    () => {
      if (!gone.length) return;
      flash({
        msg: <>{words.removed(chip.name)}</>,
        undo: () => {
          send(putBack);
          return true;
        },
      });
    },
  );
}

interface ChipsProps {
  list: ChipList;
  label: string;
  set: CheckChipSetVM;
  doing: string;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  words: ChipWords;
  more: { label: string; onClick: () => void; act?: string } | null;
  moreTestid: string;
}

/**
 * One list of chips, under its own words: a toggle each (aria-pressed), gated as a change to the settings (`doing` says
 * what it changes), and, for a role that may change the business, the way to the Business tab's own editor for what the
 * chips do not name. At the profile's cap the chips that are off are not drawn, and the cap's sentence stands where they
 * were (check-chips.ts). Hookless, since the languages' is drawn as its fold's rest.
 */
export const FrChips = ({ list, label, set, doing, canEdit, flash, words, more, moreTestid }: ChipsProps) => (
  <div className="fr-chips" role="group" aria-labelledby={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}`}>
    <span className="fr-chips-label" id={`fr-chips-${list}-label`} data-testid={`fr-chips-${list}-label`}>
      {label}
    </span>
    <span className="fr-chips-list">
      {set.chips.map((c) => (
        <button
          key={c.name}
          type="button"
          className="fr-chip"
          aria-pressed={c.on}
          onClick={() => chipPress({ list, chip: c, flash, words })}
          {...gate("settings", doing)}
          data-testid={`fr-chip-${list}-${c.name}`}
        >
          {c.on ? <Icon name="check" size={11} /> : null}
          {c.name}
        </button>
      ))}
      {more && canEdit ? (
        <button
          type="button"
          className="fr-chip fr-chip-more"
          onClick={more.onClick}
          data-rec-act={more.act || undefined}
          data-testid={moreTestid}
        >
          {more.label}
        </button>
      ) : null}
    </span>
    {set.full ? (
      <span className="fr-chips-full" data-testid={`fr-chips-${list}-full`}>
        {set.full}
      </span>
    ) : null}
  </div>
);
