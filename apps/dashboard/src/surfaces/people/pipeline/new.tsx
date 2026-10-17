/**
 * People › Pipeline's New proposal (docs/decisions/0008-a-proposal-is-part-of-the-deal.md), moved from
 * legacy/pages/pipeline-new.jsx (decision 0015): who a proposal is for, before the one deal sheet opens. A desk's record
 * sheet (the kit's RecordSheet) with no Save -- the pick is the act -- or a phone's, the kit's Sheet in a job's shape.
 * A search over the People rows the page already holds, by People's own rule (plMatcher), the first eight;
 * or Add someone new, by name and number, through People's own door and words (plAddPerson). A pick, or an add, closes
 * it and asks for the deal sheet in its propose mode. Hookless: what is open and what was typed are PipelineScope's.
 * Every word is contracts' (PIPELINE_WORDS.newProposal).
 *
 * Focus: on a desk the record sheet takes it as it opens and hands it to the field `focusOn` names (the search, then
 * the name as Add someone new opens), so the sheet keeps New proposal as what opened it and gives focus back to it.
 * An autoFocus there ran before the sheet did: the sheet took the search box for its opener, and closing dropped focus
 * on the page's body. A phone's sheet keeps a field that takes focus as it draws, so there the fields autoFocus.
 */
import type { PersonRowVM } from "@chanlytics/contracts";
import { Face } from "../../kit/face/face";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import type { FocusOn } from "../../kit/record/focus";
import { RecordSheet } from "../../kit/record/sheet";
import { Sheet } from "../../kit/sheet/sheet";
import { focusAsDrawn } from "../../legacy-verbs";
import { JOB_CANCEL } from "../sheets/phone-sheet";
import { plMatcher } from "../words";
import { P } from "./pipe";

const PIPE_NEW_MAX = 8;

/** Someone being added from New proposal: whether the fields are open, what was typed, and how the door answered. */
export interface NewAdd {
  open: boolean;
  name: string;
  phone: string;
  busy: boolean;
  error: string | null;
}

// Who the words find, by People's own rule; with no words, the first eight People holds, in People's own order.
const pipeNewMatches = (rows: readonly PersonRowVM[], q: string) => {
  const match = plMatcher(q || "");
  return (match ? rows.filter(match) : rows).slice(0, PIPE_NEW_MAX);
};

interface BodyProps {
  rows: readonly PersonRowVM[];
  q: string;
  add: NewAdd;
  onQ: (q: string) => void;
  onPick: (id: string) => void;
  onAddOpen: () => void;
  onAddDraft: (patch: Partial<NewAdd>) => void;
  onAdd: () => void;
  autoFocus?: boolean;
}

/** The people found, or the words for nobody. */
function pipeNewFound(found: readonly PersonRowVM[], onPick: (id: string) => void) {
  const W = P.words.newProposal;
  if (!found.length)
    return (
      <p className="pipe-new-none" data-testid="pipeline-new-none">
        {W.none}
      </p>
    );
  return (
    <ul className="pipe-new-list" data-testid="pipeline-new-list">
      {found.map((p) => (
        <li key={p.id}>
          <button type="button" className="pipe-new-row" onClick={() => onPick(p.id)} data-testid="pipeline-new-pick">
            <Face person={{ name: p.name, initials: p.initials }} size="sm" className="pipe-new-face" />
            <span className="pipe-new-name">
              {p.name}
              {/* They asked to stop: a proposal is a message to send, so the picker says it before a person is chosen. */}
              {p.stopped && <StoppedMark className="pipe-new-stopped" testid="pipeline-new-stopped" />}
            </span>
            {/* Where their deal stands, or when they were last heard: the row's own words. */}
            <span className="pipe-new-said">{p.deal ? p.deal.line : p.lastContact.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Someone new, by name and number: the fields, or the way to open them. */
function pipeNewAdd(b: BodyProps) {
  const { add, onAddOpen, onAddDraft, onAdd, autoFocus = false } = b;
  const W = P.words.newProposal;
  if (!add.open)
    return (
      <LinkButton className="pipe-new-open-add" onClick={onAddOpen} data-testid="pipeline-new-add-open">
        <Icon name="plus" size={12} /> {W.add}
      </LinkButton>
    );
  return (
    <div className="pipe-new-add" data-rec-row="add" data-testid="pipeline-new-add">
      <label className="rec-field">
        <span className="rec-field-label">
          {W.name} <span className="pipe-new-opt">({W.optional})</span>
        </span>
        <input
          className="rec-input"
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- kept as the JSX drew it: only a phone's sheet, which has no focus rule of its own
          autoFocus={autoFocus}
          value={add.name}
          maxLength={80}
          autoComplete="name"
          readOnly={add.busy}
          onChange={(e) => onAddDraft({ name: e.target.value })}
          data-testid="pipeline-new-name"
        />
      </label>
      <label className="rec-field">
        <span className="rec-field-label">{W.number}</span>
        <input
          className="rec-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={add.phone}
          maxLength={24}
          readOnly={add.busy}
          aria-invalid={add.error ? true : undefined}
          aria-describedby={add.error ? "pipeline-new-error" : undefined}
          onChange={(e) => onAddDraft({ phone: e.target.value, error: null })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          data-testid="pipeline-new-phone"
        />
      </label>
      <FieldError id="pipeline-new-error" message={add.error} testid="pipeline-new-error" />
      <button
        type="button"
        className="btn btn-primary btn-sm pipe-new-go"
        disabled={add.busy || !add.phone.trim()}
        onClick={onAdd}
        data-testid="pipeline-new-go"
      >
        {add.busy ? W.adding : W.go}
      </button>
    </div>
  );
}

const PipelineNewBody = (b: BodyProps) => {
  const { rows, q, onQ, onPick, autoFocus = false } = b;
  const W = P.words.newProposal;
  const found = pipeNewMatches(rows, q);
  return (
    <div className="pipe-new" data-testid="pipeline-new">
      {/* The box New conversation's kit Field draws (the same question in the same words), in the record kit's markup
          as the add form below draws its two: the Field would bring Base UI's onto People's first load (+5 KB). */}
      <label className="rec-field" data-rec-row="search">
        <span className="rec-field-label">{W.sub}</span>
        <input
          className="rec-input"
          type="search"
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- only a phone's sheet, which has no focus rule of its own
          autoFocus={autoFocus}
          autoComplete="off"
          value={q}
          placeholder={W.search}
          onChange={(e) => onQ(e.target.value)}
          data-testid="pipeline-new-search"
        />
      </label>
      {pipeNewFound(found, onPick)}
      {pipeNewAdd(b)}
    </div>
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
