/**
 * The first day of Leads: no search kept and no lead held, so there is nothing to list. The page is one question and the
 * place to answer it (canvas "Leads, the first day", option A, which Ruben chose on 7 Oct 2026): who you want as customers,
 * a field typed in and sent to Ask (Find leads is Ask on this surface, spec F1), and under it the ideas written from
 * this workspace's own business line and what its searches found, each a ready plan the plan sheet opens (00398), with New
 * ideas at their heading's end. Then the line they were written from, one row that opens it in a sheet of its own, and
 * the other way in as a quiet door: a list the owner already has (on a phone the head's act). Named people at companies
 * are asked for in the field's words, or come as an idea with its card (redesigned 22 Oct 2026, in plain words that
 * name no model; Find people's own door taken off the same day). It said what the finder never
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
import { BUSINESS_LINE_MAX, LEAD_PRIOR_MIN, LEAD_WORDS, type LeadSuggestionsDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { RecordSheet } from "../../kit/record/sheet";
import { Sheet } from "../../kit/sheet/sheet";
import { gate } from "../../legacy-verbs";

type Suggestion = LeadSuggestionsDto["items"][number];

/**
 * Why an idea, and how reachable its kind has been where past searches measured it (the platform's own counts, once
 * there are enough: leadReachLine's floor): "Restaurants wrote back: 5 of 20 · About 7 in 10 have an email".
 */
const ideaWhy = (item: Suggestion): string =>
  [item.who_for, item.prior && item.prior.matched >= LEAD_PRIOR_MIN ? item.reach : null].filter(Boolean).join(" · ");

const FIRST_DAY_SAYS = LEAD_WORDS.firstDay;

/**
 * One idea: a search ready to approve, the kit's large button, which opens its plan in the plan sheet (00398); one kept
 * from before ideas were plans opens Ask with its words. On a desk it is a capsule that says what it finds and where, and
 * why under a pointer or the keyboard's focus (the house's tip, as the peek's controls say theirs); on a phone, where
 * nothing hovers, a row the width of the screen with its why under its words and the mark of a door. How reachable its
 * kind is, the plan sheet says.
 */
const LeadIdea = ({
  item,
  onPick,
  canFind,
  phone,
}: {
  item: Suggestion;
  onPick: (item: Suggestion) => void;
  canFind: boolean;
  phone: boolean;
}) => (
  <Button
    size="lg"
    className="ld-first-idea"
    onClick={() => onPick(item)}
    data-testid={`ld-sug-${item.category_key}`}
    data-tip={phone ? undefined : ideaWhy(item) || undefined}
    aria-description={ideaWhy(item) || undefined}
    {...(canFind ? {} : gate("find", "find businesses for you"))}
  >
    {phone && ideaWhy(item) ? (
      <span className="ld-first-idea-text">
        <span className="ld-first-idea-words">{item.words}</span>
        <span className="ld-first-idea-why">{ideaWhy(item)}</span>
      </span>
    ) : (
      <span className="ld-first-idea-words">{item.words}</span>
    )}
    {phone ? <Icon name="chevron" size={14} /> : null}
  </Button>
);

interface FirstDayProps {
  suggestions?: LeadSuggestionsDto | null;
  /** A read of the ideas is out: none yet says they are being written. */
  ideasReading?: boolean;
  canFind?: boolean;
  phone?: boolean;
  lineOpen?: boolean;
  lineDraft?: string;
  lineError?: string | null;
  lineBusy?: boolean;
  /** Write it for me in flight: the line being written from the whole picture. */
  lineWriting?: boolean;
  /** The line in the sheet is one written for the owner and not changed: nothing to save, and where it came from said. */
  lineOurs?: boolean;
  /** Opens Ask on this surface and asks these words, as the field sends them. */
  onAsk?: (words: string) => void;
  /** Opens an idea's plan in the plan sheet, or Ask with its words where it has none. */
  onIdea?: (item: Suggestion) => void;
  /** Asks for other ideas from the same line. */
  onNewIdeas?: () => void;
  /** Lets go of the owner's saved line: the line written from the whole picture, with three new ideas. */
  onLineForMe?: () => void;
  /** Opens the sheet a list of the owner's own is brought in by. */
  onImport?: () => void;
  onOpenLine?: () => void;
  onLineDraft?: (draft: string) => void;
  onSaveLine?: () => void;
  onCancelLine?: () => void;
}

/** Where focus goes as a desk's sheet opens: its one field. */
const LINE_FOCUS = { row: "line" };
/** A phone's sheet closes by a word, as People's small jobs do. */
const LINE_CANCEL = { word: "Cancel" };

/** The line being rewritten: the page's draft (`leadLine`), handed down, and what the sheet asks of the page. */
interface LineSheetProps {
  draft: string;
  error: string | null;
  busy: boolean;
  writing: boolean;
  ours: boolean;
  onDraft: (draft: string) => void;
  onSave: () => void;
  onCancel: () => void;
  /** Write it for me, where the member may find: none otherwise. */
  onForMe?: () => void;
}

/**
 * Over the box, one line: what the line is for, or, over a line written for the owner and not changed, where it came
 * from. It was a sentence over a label over the box, and where the line came from a second line beside Write it for me
 * (Ruben, 22 Oct 2026: too much said for one box).
 */
const LineLead = ({ ours }: { ours: boolean }) =>
  ours ? (
    <span className="ld-line-written" data-testid="ld-line-written">
      <Icon name="sparkle" size={12} />
      {FIRST_DAY_SAYS.lineWritten}
    </span>
  ) : (
    <>{FIRST_DAY_SAYS.lineSub}</>
  );

/** The box: the line in a few sentences, its name said to a screen reader (no label drawn), and no count under it. */
const LineBox = ({ draft, error, busy, writing, onDraft, className }: LineSheetProps & { className: string }) => (
  <textarea
    className={className}
    rows={3}
    maxLength={BUSINESS_LINE_MAX}
    value={draft}
    disabled={busy || writing}
    placeholder={FIRST_DAY_SAYS.linePlaceholder}
    aria-label={FIRST_DAY_SAYS.lineLabel}
    aria-invalid={error ? true : undefined}
    aria-describedby={error ? "ld-line-error" : undefined}
    data-testid="ld-line-input"
    onChange={(e) => onDraft(e.target.value)}
  />
);

/**
 * Write it for me (22 Oct 2026): a quiet press that lets the owner's line go, so the line is written from the profile,
 * the customers and the searches, and shown in the box with the sheet still open. Not over a line already written for
 * them; while it writes, it says so.
 */
const LineForMe = ({ busy, writing, ours, onForMe }: LineSheetProps) =>
  onForMe && !ours ? (
    <Button
      variant="quiet"
      size="sm"
      className="ld-line-forme"
      onClick={onForMe}
      disabled={busy || writing}
      aria-busy={writing || undefined}
      data-testid="ld-line-forme"
    >
      <Icon name="sparkle" size={13} />
      {writing ? FIRST_DAY_SAYS.lineWriting : FIRST_DAY_SAYS.lineForMe}
    </Button>
  ) : null;

/** What the sheet's one press does: closes it over a line written for the owner and not changed, else saves. */
const lineGo = (p: LineSheetProps) => (p.ours ? p.onCancel : p.onSave);

/**
 * The business line being rewritten on a phone: the kit's small job, as Add a person is (people/sheets/list-sheets.tsx),
 * from the bottom and only as tall as what it holds: one line of what it is for, the box, and one row under it with
 * Write it for me at its left and Save (Done over a line written for them) at its right. A pull down, the wash and
 * Cancel close it, and it leaves as it came, so it is drawn while shut too (`open`). It had a label, a count and a
 * Save the width of the sheet, which left it tall and mostly empty (Ruben, 22 Oct 2026).
 */
const LeadLinePhoneSheet = (p: LineSheetProps & { open: boolean }) => (
  <Sheet
    open={p.open}
    shape="job"
    title={FIRST_DAY_SAYS.lineTitle}
    close={LINE_CANCEL}
    onClose={p.onCancel}
    testid="ld-line-sheet"
  >
    <p className="ld-line-lead">
      <LineLead ours={p.ours} />
    </p>
    <LineBox {...p} className="pp-input ld-line-box" />
    <FieldError id="ld-line-error" message={p.error} testid="ld-line-error" />
    <div className="ld-line-acts">
      <LineForMe {...p} />
      <Button
        variant="primary"
        size="sm"
        className="ld-line-go"
        disabled={p.busy || p.writing || !p.draft.trim()}
        onClick={lineGo(p)}
        data-testid="ld-line-save"
      >
        {p.ours ? FIRST_DAY_SAYS.lineDone : p.busy ? "Saving…" : "Save"}
      </Button>
    </div>
  </Sheet>
);

/**
 * The business line being rewritten on a desk: the record kit's sheet beside the page, as a list is imported in one,
 * with its field focused as it opens, Write it for me under it, and Save (Done over a line written for them) and Cancel
 * in its foot.
 */
const LeadLineDeskSheet = (p: LineSheetProps) => (
  <RecordSheet
    id="lead-line"
    title={FIRST_DAY_SAYS.lineTitle}
    sub={<LineLead ours={p.ours} />}
    onClose={p.onCancel}
    closeLabel="Cancel"
    onSave={lineGo(p)}
    saving={p.busy || p.writing}
    saveLabel={p.ours ? FIRST_DAY_SAYS.lineDone : "Save"}
    savingLabel={p.writing ? "Save" : "Saving…"}
    focusOn={LINE_FOCUS}
    testid="ld-line-sheet"
  >
    <div className="pl-import" data-rec-row="line">
      <div className="rec-field">
        <LineBox {...p} className="rec-input ld-line-box" />
        <FieldError id="ld-line-error" message={p.error} testid="ld-line-error" />
        <LineForMe {...p} />
      </div>
    </div>
  </RecordSheet>
);

/**
 * What stands where the ideas would: the server's reason it could not write them (suggestions.note), "writing" while
 * another read writes them or this page's first read is out, or, for a read that never landed, that they are not
 * available; nothing while there are ideas to show.
 */
const noteOf = (suggestions: LeadSuggestionsDto | null, shown: number, reading: boolean): string | null =>
  !suggestions
    ? reading
      ? FIRST_DAY_SAYS.writing
      : LEAD_WORDS.suggestUnavailable
    : suggestions.pending && !shown
      ? FIRST_DAY_SAYS.writing
      : suggestions.note || null;

/**
 * What the ideas were written from, under them: a row on the inset's ground (a setting, where the ideas over it are
 * acts), "Your business" over the owner's line, and Edit at its end, the whole row the press that opens the line's sheet.
 * Read alone where the member may not rewrite it. Nothing where the read never landed: there is no line to say, and none
 * to edit from. It was a sentence with two links in it, then "Based on" and the line cut short on one quiet line (Ruben,
 * 23 Oct 2026: redesigned again), and New ideas stands by the ideas' own heading.
 */
const BasedOn = ({
  suggestions,
  canFind,
  onOpenLine,
}: {
  suggestions: LeadSuggestionsDto;
  canFind: boolean;
  onOpenLine: () => void;
}) => {
  const said = (
    <span className="ld-first-basis-said">
      <span className="ld-first-basis-label">{FIRST_DAY_SAYS.lineTitle}</span>
      <span className="ld-first-basis-line" data-testid="ld-line">
        {suggestions.business_line}
      </span>
    </span>
  );
  return canFind ? (
    <Button variant="quiet" size="text" className="ld-first-basis" onClick={onOpenLine} data-testid="ld-line-edit">
      {said}
      <span className="ld-first-basis-edit">
        <Icon name="pencil" size={12} />
        {FIRST_DAY_SAYS.edit}
      </span>
    </Button>
  ) : (
    <div className="ld-first-basis">{said}</div>
  );
};

/**
 * The field: the owner types who they want here, and the arrow or Enter sends it, Ask opening on this surface with the
 * words asked (Ruben, 22 Oct 2026: it was a door that only opened Ask, where the words were typed again). Sent with
 * nothing in it, the arrow puts the cursor in the field. The words are the field's own until they are sent, so the page
 * keeps no state for them; a member who may not find reads it and is told why at the arrow (the role gate).
 */
const AskField = ({
  canFind,
  findGate,
  onAsk,
}: {
  canFind: boolean;
  findGate: Record<string, unknown>;
  onAsk: (words: string) => void;
}) => (
  <form
    className="ld-first-ask"
    data-testid="leads-first-find"
    aria-disabled={canFind ? undefined : true}
    onSubmit={(e) => {
      e.preventDefault();
      if (!canFind) return;
      const box = e.currentTarget.elements.namedItem("words") as HTMLInputElement | null;
      const words = (box?.value ?? "").trim();
      if (!words) {
        box?.focus();
        return;
      }
      onAsk(words);
      e.currentTarget.reset();
      box?.blur();
    }}
  >
    {/* The mark and the box are one label: a press on either, or between them, is a press in the box. */}
    <label className="ld-first-ask-in">
      <Icon name="three" size={14} />
      <input
        className="ld-first-ask-words"
        name="words"
        type="text"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={400}
        placeholder={FIRST_DAY_SAYS.ask}
        aria-label={FIRST_DAY_SAYS.ask}
        readOnly={!canFind}
        data-testid="leads-first-words"
      />
    </label>
    <button
      type="submit"
      className="ld-first-ask-go"
      aria-label={FIRST_DAY_SAYS.send}
      data-testid="leads-first-send"
      {...findGate}
    >
      <Icon name="arrow-up" size={18} />
    </button>
  </form>
);

export const LeadsFirstDay = ({
  suggestions = null,
  ideasReading = false,
  canFind = false,
  phone = false,
  lineOpen = false,
  lineDraft = "",
  lineError = null,
  lineBusy = false,
  lineWriting = false,
  lineOurs = false,
  onAsk = () => undefined,
  onIdea = () => undefined,
  onNewIdeas = () => undefined,
  onLineForMe,
  onImport = () => undefined,
  onOpenLine = () => undefined,
  onLineDraft = () => undefined,
  onSaveLine = () => undefined,
  onCancelLine = () => undefined,
}: FirstDayProps) => {
  const items = (suggestions && suggestions.items) || [];
  const note = noteOf(suggestions, items.length, ideasReading);
  const findGate = canFind ? {} : gate("find", "find businesses for you");
  const line: LineSheetProps = {
    draft: lineDraft,
    error: lineError,
    busy: lineBusy,
    writing: lineWriting,
    ours: lineOurs,
    onDraft: onLineDraft,
    onSave: onSaveLine,
    onCancel: onCancelLine,
    onForMe: canFind ? onLineForMe : undefined,
  };
  return (
    <div className="ld-first" data-testid="leads-first-day">
      <div className="ld-first-col">
        <h1 className="ld-first-h">{FIRST_DAY_SAYS.title}</h1>
        <p className="ld-first-sub">{FIRST_DAY_SAYS.sub}</p>
        <AskField canFind={canFind} findGate={findGate} onAsk={onAsk} />
        {items.length > 0 ? (
          <>
            {/* The ideas' heading, and New ideas from the same line (00399) at its end, for a member who may find. */}
            <div className="ld-first-ideas-head">
              <p className="ld-first-eyebrow">{FIRST_DAY_SAYS.ideas}</p>
              {canFind ? (
                <Button
                  variant="quiet"
                  size="sm"
                  className="ld-first-again"
                  onClick={onNewIdeas}
                  data-testid="ld-ideas-new"
                >
                  <Icon name="refresh" size={13} />
                  {FIRST_DAY_SAYS.newIdeas}
                </Button>
              ) : null}
            </div>
            <div className="ld-first-ideas" data-testid="ld-sugs">
              {items.map((it, n) => (
                <LeadIdea key={`${it.category_key}-${n}`} item={it} onPick={onIdea} canFind={canFind} phone={phone} />
              ))}
            </div>
          </>
        ) : null}
        {note ? (
          <p className="ld-first-note" data-testid="ld-sugs-note">
            {note}
          </p>
        ) : null}
        {suggestions ? <BasedOn suggestions={suggestions} canFind={canFind} onOpenLine={onOpenLine} /> : null}
        {/* The other way in, a quiet door under the ideas: a list the owner already has (a phone's head holds it as the
            page's act, Import leads, so it is not said twice there). Named people at companies is no door of its own here:
            the field asks for them in words, and an idea that finds them opens its card (Ruben, 22 Oct 2026). */}
        {phone ? null : (
          <div className="ld-first-doors">
            <Button
              variant="quiet"
              size="sm"
              className="ld-first-door"
              onClick={onImport}
              data-testid="ld-first-import"
              {...gate("find", "import leads")}
            >
              <Icon name="list" size={14} />
              {FIRST_DAY_SAYS.importIt}
            </Button>
          </div>
        )}
      </div>
      {/* The line's sheet stands over the page, which keeps its sentence behind it: a phone's small job, drawn while
          shut so it leaves as it came, and a desk's sheet beside the page. */}
      {phone ? <LeadLinePhoneSheet open={lineOpen} {...line} /> : lineOpen ? <LeadLineDeskSheet {...line} /> : null}
    </div>
  );
};
