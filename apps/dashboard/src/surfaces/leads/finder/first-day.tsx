/**
 * The first day of Leads: no search kept and no lead held, so there is nothing to list. The page is one question and the
 * place to answer it (canvas "Leads, the first day", option A, which Ruben chose on 7 Oct 2026): who you want as customers,
 * a field that is the door to Ask (Find leads is Ask on this surface, spec F1), and under it the ideas Claude wrote from
 * this workspace's own business line, each a door to Ask with its words. Then the line they were written from, with its
 * one control, which opens the line in a sheet of its own, and the door for a list the owner already has (on a phone
 * the head's act). It said what the finder never
 * does under them ("Businesses only…"), which Ruben took off as not needed (7 Oct 2026).
 *
 * It drew three ways people arrive (their number, their calendar, clients they have) over the finder, in bordered boxes
 * with a coral link each: People's subject, on Leads, and it buried the one thing to do here. The rail, the search box and
 * the head's act stand down with it (scope.tsx), since with no lead there is nothing for them to act on.
 *
 * Never a seeded example: the ideas are the server's, and a read that never landed says so where they would stand, beside
 * a door that still opens. Hookless, like everything else here: the line being rewritten is the page's (`leadLine`), handed
 * down. Every word is contracts' (LEAD_WORDS.firstDay).
 */
import { LEAD_WORDS, type LeadSuggestionsDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { RecordSheet } from "../../kit/record/sheet";
import { Sheet } from "../../kit/sheet/sheet";
import { gate } from "../../legacy-verbs";

type Suggestion = LeadSuggestionsDto["items"][number];

const FIRST_DAY_SAYS = LEAD_WORDS.firstDay;

/**
 * One idea: a door to Ask with its words in the field, the kit's large button. On a desk it is a capsule that says its
 * name, and who it is for under a pointer or the keyboard's focus (the house's tip, as the peek's controls say theirs); on a
 * phone, where nothing hovers, a row the width of the screen with the mark of a door. How reachable its kind is stays
 * Ask's to say, in the plan it writes: before a workspace has searched, that line is the system's ("checked after 25"),
 * and no reason to pick.
 */
const LeadIdea = ({
  item,
  onPick,
  canFind,
  phone,
}: {
  item: Suggestion;
  onPick: (words: string) => void;
  canFind: boolean;
  phone: boolean;
}) => (
  <Button
    size="lg"
    className="ld-first-idea"
    onClick={() => onPick(item.words)}
    data-testid={`ld-sug-${item.category_key}`}
    data-tip={phone ? undefined : item.who_for}
    aria-description={item.who_for}
    {...(canFind ? {} : gate("find", "find businesses for you"))}
  >
    <span className="ld-first-idea-words">{item.words}</span>
    {phone ? <Icon name="chevron" size={14} /> : null}
  </Button>
);

interface FirstDayProps {
  suggestions?: LeadSuggestionsDto | null;
  canFind?: boolean;
  phone?: boolean;
  lineOpen?: boolean;
  lineDraft?: string;
  lineError?: string | null;
  lineBusy?: boolean;
  /** Opens Ask on this surface, with these words in its field where an idea was picked. */
  onFind?: (words?: string) => void;
  /** Opens the sheet a list of the owner's own is brought in by. */
  onImport?: () => void;
  onOpenLine?: () => void;
  onLineDraft?: (draft: string) => void;
  onSaveLine?: () => void;
  onCancelLine?: () => void;
}

/** How long a business line may be: the door's own bound (contracts BusinessLineSchema). */
const LINE_MAX = 160;
/** Where focus goes as a desk's sheet opens: its one field. */
const LINE_FOCUS = { row: "line" };
/** A phone's sheet closes by a word, as People's small jobs do. */
const LINE_CANCEL = { word: "Cancel" };

/** The line being rewritten: the page's draft (`leadLine`), handed down, and what the sheet asks of the page. */
interface LineSheetProps {
  draft: string;
  error: string | null;
  busy: boolean;
  onDraft: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** Under the box: what is wrong at the left, and how much of the line's length is written at the right. */
const LineUnder = ({ draft, error }: { draft: string; error: string | null }) => (
  <div className="ld-line-under">
    <FieldError id="ld-line-error" message={error} testid="ld-line-error" />
    <span className="ld-line-count" data-testid="ld-line-count">
      {draft.length} of {LINE_MAX}
    </span>
  </div>
);

/**
 * The business line being rewritten on a phone: the kit's small job, as Add a person is (people/sheets/list-sheets.tsx),
 * from the bottom and only as tall as what it holds: what it is for, a box with room for a sentence, how much of its
 * length is written, and Save the width of the sheet. A pull down, the wash and Cancel close it, and it leaves as it
 * came, so it is drawn while shut too (`open`). It was the record kit's sheet, which rises the whole height of the
 * screen for one field (Ruben, 7 Oct 2026), and before that one line squeezed in where the sentence stood.
 */
const LeadLinePhoneSheet = ({
  open,
  draft,
  error,
  busy,
  onDraft,
  onSave,
  onCancel,
}: LineSheetProps & { open: boolean }) => (
  <Sheet
    open={open}
    shape="job"
    title={FIRST_DAY_SAYS.lineTitle}
    close={LINE_CANCEL}
    onClose={onCancel}
    testid="ld-line-sheet"
  >
    <p className="ld-line-lead">{FIRST_DAY_SAYS.lineSub}</p>
    <label className="pp-field">
      <span className="pp-field-label">{FIRST_DAY_SAYS.lineLabel}</span>
      <textarea
        className="pp-input ld-line-box"
        rows={4}
        maxLength={LINE_MAX}
        value={draft}
        disabled={busy}
        placeholder={FIRST_DAY_SAYS.linePlaceholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "ld-line-error" : undefined}
        data-testid="ld-line-input"
        onChange={(e) => onDraft(e.target.value)}
      />
    </label>
    <LineUnder draft={draft} error={error} />
    <Button
      variant="primary"
      className="pp-sheet-go"
      disabled={busy || !draft.trim()}
      onClick={onSave}
      data-testid="ld-line-save"
    >
      {busy ? "Saving…" : "Save"}
    </Button>
  </Sheet>
);

/**
 * The business line being rewritten on a desk: the record kit's sheet beside the page, as a list is imported in one,
 * with its field focused as it opens and Save and Cancel in its foot.
 */
const LeadLineDeskSheet = ({ draft, error, busy, onDraft, onSave, onCancel }: LineSheetProps) => (
  <RecordSheet
    id="lead-line"
    title={FIRST_DAY_SAYS.lineTitle}
    sub={FIRST_DAY_SAYS.lineSub}
    onClose={onCancel}
    closeLabel="Cancel"
    onSave={onSave}
    saving={busy}
    savingLabel="Saving…"
    focusOn={LINE_FOCUS}
    testid="ld-line-sheet"
  >
    <div className="pl-import" data-rec-row="line">
      <div className="rec-field">
        <label>
          <span className="rec-field-label">{FIRST_DAY_SAYS.lineLabel}</span>
          <textarea
            className="rec-input"
            rows={4}
            maxLength={LINE_MAX}
            value={draft}
            disabled={busy}
            placeholder={FIRST_DAY_SAYS.linePlaceholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "ld-line-error" : undefined}
            data-testid="ld-line-input"
            onChange={(e) => onDraft(e.target.value)}
          />
        </label>
        <LineUnder draft={draft} error={error} />
      </div>
    </div>
  </RecordSheet>
);

export const LeadsFirstDay = ({
  suggestions = null,
  canFind = false,
  phone = false,
  lineOpen = false,
  lineDraft = "",
  lineError = null,
  lineBusy = false,
  onFind = () => undefined,
  onImport = () => undefined,
  onOpenLine = () => undefined,
  onLineDraft = () => undefined,
  onSaveLine = () => undefined,
  onCancelLine = () => undefined,
}: FirstDayProps) => {
  const items = (suggestions && suggestions.items) || [];
  // The server says why it could not write them (suggestions.note); a read that never landed says so itself, rather than
  // leaving the space blank.
  const note = suggestions ? suggestions.note || null : LEAD_WORDS.suggestUnavailable;
  const findGate = canFind ? {} : gate("find", "find businesses for you");
  return (
    <div className="ld-first" data-testid="leads-first-day">
      <div className="ld-first-col">
        <h1 className="ld-first-h">{FIRST_DAY_SAYS.title}</h1>
        <p className="ld-first-sub">{FIRST_DAY_SAYS.sub}</p>
        {/* The field is a door, as the top bar's Ask is: a press opens Ask on this surface, where the words are typed. */}
        <button
          type="button"
          className="ld-first-ask"
          onClick={() => onFind()}
          data-testid="leads-first-find"
          {...findGate}
        >
          <Icon name="three" size={14} />
          <span className="ld-first-ask-words">{FIRST_DAY_SAYS.ask}</span>
          <span className="ld-first-ask-go" aria-hidden="true">
            <Icon name="arrow-up" size={18} />
          </span>
        </button>
        {items.length > 0 ? (
          <>
            <p className="ld-first-eyebrow">{FIRST_DAY_SAYS.ideas}</p>
            <div className="ld-first-ideas" data-testid="ld-sugs">
              {items.map((it) => (
                <LeadIdea key={it.category_key} item={it} onPick={onFind} canFind={canFind} phone={phone} />
              ))}
            </div>
          </>
        ) : null}
        {note ? (
          <p className="ld-first-note" data-testid="ld-sugs-note">
            {note}
          </p>
        ) : null}
        {/* What the ideas were written from, and the one control that rewrites it. Nothing where the read never landed:
            there is no line to say, and none to edit from. */}
        {suggestions ? (
          <p className="ld-first-from">
            {FIRST_DAY_SAYS.from} <span data-testid="ld-line">{suggestions.business_line}</span>
            {canFind ? (
              <>
                {" "}
                <LinkButton className="ld-first-edit" onClick={onOpenLine} data-testid="ld-line-edit">
                  {FIRST_DAY_SAYS.edit}
                </LinkButton>
              </>
            ) : null}
          </p>
        ) : null}
        {/* The door for a list the owner already has. A phone's head holds it as the page's act (Import leads, at the right
            of the row of views), so it is not said twice there. */}
        {phone ? null : (
          <p className="ld-first-side">
            {FIRST_DAY_SAYS.haveList}{" "}
            <LinkButton
              className="ld-first-edit"
              onClick={onImport}
              data-testid="ld-first-import"
              {...gate("find", "import leads")}
            >
              {FIRST_DAY_SAYS.importIt}
            </LinkButton>
          </p>
        )}
      </div>
      {/* The line's sheet stands over the page, which keeps its sentence behind it: a phone's small job, drawn while
          shut so it leaves as it came, and a desk's sheet beside the page. */}
      {phone ? (
        <LeadLinePhoneSheet
          open={lineOpen}
          draft={lineDraft}
          error={lineError}
          busy={lineBusy}
          onDraft={onLineDraft}
          onSave={onSaveLine}
          onCancel={onCancelLine}
        />
      ) : lineOpen ? (
        <LeadLineDeskSheet
          draft={lineDraft}
          error={lineError}
          busy={lineBusy}
          onDraft={onLineDraft}
          onSave={onSaveLine}
          onCancel={onCancelLine}
        />
      ) : null}
    </div>
  );
};
