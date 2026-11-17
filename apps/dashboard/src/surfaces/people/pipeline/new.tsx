/**
 * People › Pipeline's New proposal (docs/decisions/0008-a-proposal-is-part-of-the-deal.md), moved from
 * legacy/pages/pipeline-new.jsx (decision 0015): who a proposal is for, before the one deal sheet opens. A desk's record
 * sheet (the kit's RecordSheet) with no Save -- the pick is the act -- or a phone's, the kit's Sheet in a job's shape.
 * A search over the People rows the page already holds, by People's own rule (plMatcher), the first eight, drawn by the
 * kit's person pick (kit/person-pick/), the one New conversation's first step draws too;
 * someone new is added on People, by its own New (Ruben, 20 Oct 2026: the picker's Add someone new went). A pick closes
 * it and asks for the deal sheet in its propose mode. Hookless: what is open and what was typed are PipelineScope's.
 * Every word is contracts' (PIPELINE_WORDS.newProposal).
 *
 * Focus: on a desk the record sheet takes it as it opens and hands it to the field `focusOn` names (the search), so the
 * sheet keeps New proposal as what opened it and gives focus back to it.
 * An autoFocus there ran before the sheet did: the sheet took the search box for its opener, and closing dropped focus
 * on the page's body. A phone's sheet keeps a field that takes focus as it draws, so there the fields autoFocus.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import { PersonPick } from "../../kit/person-pick/person-pick";
import type { FocusOn } from "../../kit/record/focus";
import { RecordSheet } from "../../kit/record/sheet";
import { Sheet } from "../../kit/sheet/sheet";
import { focusAsDrawn } from "../../frame-verbs";
import { JOB_CANCEL } from "../sheets/phone-sheet";
import { plMatcher } from "../words";
import { P } from "./pipe";

const PIPE_NEW_MAX = 8;

// Who the words find, by People's own rule; with no words, the first eight People holds, in People's own order.
const pipeNewMatches = (rows: readonly PersonRowVM[], q: string) => {
  const match = plMatcher(q || "");
  return (match ? rows.filter(match) : rows).slice(0, PIPE_NEW_MAX);
};

interface BodyProps {
  rows: readonly PersonRowVM[];
  q: string;
  onQ: (q: string) => void;
  onPick: (id: string) => void;
  autoFocus?: boolean;
}

/** The kit's person pick, as New conversation's first step draws it: the question, its search, who it finds. */
const PipelineNewBody = (b: BodyProps) => {
  const { rows, q, onQ, onPick, autoFocus = false } = b;
  const W = P.words.newProposal;
  return (
    <PersonPick
      label={W.sub}
      placeholder={W.search}
      q={q}
      onQ={onQ}
      people={pipeNewMatches(rows, q)}
      onPick={onPick}
      none={W.none}
      // eslint-disable-next-line jsx-a11y-x/no-autofocus -- only a phone's sheet, which has no focus rule of its own
      autoFocus={autoFocus}
      testid="pipeline-new"
    />
  );
};

export const PipelineNew = (
  props: BodyProps & { open: boolean; phone?: boolean; onClose: () => void; focusOn?: FocusOn | null },
) => {
  const { open, phone = false, onClose, focusOn = null, ...body } = props;
  const W = P.words.newProposal;
  // A phone's is the kit's sheet in a job's shape, drawn while open and on its way out; it keeps the field the body
  // focuses as it draws.
  if (phone) {
    return (
      <Sheet open={open} shape="job" title={W.title} close={JOB_CANCEL} onClose={onClose} testid="pipeline-new-sheet">
        {/* eslint-disable-next-line jsx-a11y-x/no-autofocus -- the kit's sheet keeps a field focused as it opens */}
        <PipelineNewBody {...body} autoFocus={focusAsDrawn()} />
      </Sheet>
    );
  }
  if (!open) return null;
  return (
    <RecordSheet
      id="pipeline-new"
      className="pipe-new-sheet"
      title={W.title}
      onClose={onClose}
      focusOn={focusOn}
      testid="pipeline-new-sheet"
    >
      <PipelineNewBody {...body} />
    </RecordSheet>
  );
};
