/**
 * The bulk bar (moved from legacy/pages/leads-scope.jsx, decision 0015): what a selection of leads can become (§6.4, S13) --
 * their emails on the clipboard, all contacted, all not a fit, a file. Each acts on the rows shown AND selected; the
 * header box's "Select all N that match" hands the view's filters to the server instead of a list of ids, so a view of
 * 1,240 does not become 1,240 ids in a request.
 */
import type { ReactNode } from "react";
import {
  LEAD_WORDS,
  leadCheckAgainCents,
  type LeadNotAFitWhy,
  type LeadReviewAct,
  type LeadRowVM,
  type LeadsBulkInput,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { gate } from "../../legacy-verbs";
import { Sheet } from "../../kit/sheet/sheet";
import { JOB_CANCEL, PhoneSheetRow, jobBack } from "../../people/sheets/phone-sheet";
import type { ReviewDoors } from "../bench/types";
import { LeadNotFitWhy } from "../peek/asks";

type BulkAction = LeadsBulkInput["action"];
type BulkView = Extract<LeadsBulkInput, { by: "view" }>["view"];

interface BulkBarProps {
  sel: ReadonlySet<string>;
  rows: readonly LeadRowVM[];
  total: number;
  view: BulkView;
  canFind: boolean;
  canExport: boolean;
  busy: boolean;
  whyNot: string | null;
  onClear: () => void;
  onSelectAllMatching: () => void;
  allMatching: boolean;
  onCopyEmails: (picked: LeadRowVM[]) => void;
  onContacted: (body: LeadsBulkInput) => unknown;
  onNotAFit: (why: LeadNotAFitWhy, body: LeadsBulkInput) => unknown;
  whyOpen: boolean;
  onWhyOpen: (open: boolean) => void;
  exportHref: string | null;
  review?: ReviewDoors | null;
  phone?: boolean;
  sheet?: string | null;
  onSheet?: (step: string | null) => void;
  write: ReactNode;
}

/** What the bar says and acts on: the rows picked and shown, how many, and what a selection of Needs review resolves to. */
function bulkFacts(p: BulkBarProps) {
  const picked = p.rows.filter((l) => p.sel.has(l.id));
  const ids = picked.map((l) => l.id);
  const count = p.allMatching ? p.total : ids.length;
  // Selected, and not among the rows shown: the words in the box hide them, and they are selected still (the page keeps a
  // selection through a search). The bar acts on what it shows, so it says what it is leaving out.
  const hidden = p.allMatching ? 0 : p.sel.size - ids.length;
  // A selection that is all Needs review offers what resolves it (D3): the union of its groups' acts. Check again draws only
  // where its courier exists, so nothing here is ever a dead control.
  const review = p.review;
  const acts: LeadReviewAct[] =
    review && !p.allMatching && picked.length > 0 && picked.every((l) => l.cls === "review") ? review.actsFor(ids) : [];
  const scope = (action: BulkAction): LeadsBulkInput =>
    p.allMatching
      ? { by: "view", action: action as "contacted" | "not_a_fit", view: p.view }
      : { by: "ids", action, ids };
  return { picked, ids, count, hidden, acts, scope };
}

/** A phone's sheet of the rest: everything the docked row does not hold, and Not a fit's whys as its next step. */
function phoneSheets(p: BulkBarProps, f: ReturnType<typeof bulkFacts>) {
  const {
    busy,
    canFind,
    canExport,
    allMatching,
    total,
    rows,
    whyNot,
    exportHref,
    sheet = null,
    onSheet = () => undefined,
  } = p;
  const { picked, ids, count, acts, scope } = f;
  const review = p.review as ReviewDoors;
  const gateWork = canFind ? {} : gate("find", "work these leads");
  const W = LEAD_WORDS;
  const shut = (fn: () => unknown) => () => {
    onSheet(null);
    fn();
  };
  // One sheet, its two steps: the acts, and Not a fit's whys with the way back to them. It stays drawn as it leaves.
  const why = sheet === "why";
  return (
    <Sheet
      open={sheet === "more" || why}
      shape="job"
      title={why ? W.notFitTitle || "Not a fit" : `${count.toLocaleString()} selected`}
      close={JOB_CANCEL}
      back={why ? jobBack(() => onSheet("more")) : null}
      onClose={() => onSheet(null)}
      testid={why ? "leads-bulk-why" : "leads-bulk-sheet"}
    >
      {why ? (
        <div className="pp-sheet-rows">
          {(W.whys || []).map((w) => (
            <PhoneSheetRow
              key={w.id}
              label={w.label}
              disabled={busy}
              onClick={shut(() => p.onNotAFit(w.id, scope("not_a_fit")))}
              testid={`leads-bulk-why-${w.id}`}
            />
          ))}
        </div>
      ) : (
        <div className="pp-sheet-rows">
          {!allMatching && total > rows.length ? (
            <PhoneSheetRow
              icon="check"
              label={`Select all ${total.toLocaleString()} that match`}
              onClick={shut(p.onSelectAllMatching)}
              testid="leads-select-matching"
            />
          ) : null}
          {acts.includes("check_again") && review.canCheckAgain ? (
            <PhoneSheetRow
              icon="refresh"
              label={`Check ${ids.length} again`}
              meta={`about ${leadCheckAgainCents(ids.length)}¢`}
              disabled={busy}
              onClick={shut(() => review.onCheckAgain(ids))}
              testid="leads-bulk-check-again"
              gate={canFind ? null : gateWork}
            />
          ) : null}
          {acts.includes("keep") ? (
            <PhoneSheetRow
              icon="check"
              label={`Keep ${ids.length}`}
              disabled={busy}
              onClick={shut(() => review.onKeep(ids))}
              testid="leads-bulk-keep"
              gate={canFind ? null : gateWork}
            />
          ) : null}
          {acts.includes("exclude") ? (
            <PhoneSheetRow
              icon="x"
              label={`Exclude ${ids.length}`}
              disabled={busy}
              onClick={shut(() => review.onExclude(ids))}
              testid="leads-bulk-exclude"
              gate={canFind ? null : gateWork}
            />
          ) : null}
          <PhoneSheetRow
            icon="copy"
            label="Copy emails"
            disabled={busy}
            onClick={shut(() => p.onCopyEmails(picked))}
            testid="leads-bulk-copy"
          />
          {p.write}
          <PhoneSheetRow
            icon="ban"
            label="Not a fit"
            next
            disabled={busy}
            onClick={() => onSheet("why")}
            testid="leads-bulk-not-a-fit"
            gate={canFind ? null : gate("find", "mark these leads not a fit")}
          />
          {canExport ? (
            <a
              className="pp-sheet-row"
              href={exportHref || undefined}
              download
              onClick={() => onSheet(null)}
              data-testid="leads-bulk-export"
            >
              <Icon name="external" size={16} />
              <span className="pp-sheet-row-words">Export</span>
              <span className="pp-sheet-row-meta">CSV</span>
            </a>
          ) : (
            <PhoneSheetRow
              icon="external"
              label="Export"
              meta="CSV"
              onClick={() => undefined}
              gate={gate("export", "export these leads")}
              testid="leads-bulk-export"
            />
          )}
          {whyNot ? <p className="pp-sheet-hint pp-sheet-rows-note">{whyNot}</p> : null}
        </div>
      )}
    </Sheet>
  );
}

/**
 * On a phone (spec 4.5): People's row -- ✕, the count, the act most selections get (Mark contacted) and ⋯ -- and a sheet
 * with the rest. Not a fit asks its five whys as the sheet's step: the peek's own list (LeadNotFitWhy) wears .pl-peek, which
 * a phone draws full screen (leads.css), so from this bar it covered the page. The whys are the peek's words, from their one
 * list (LEAD_WORDS.whys). The step is the page's (`sheet`), so its keyboard listener shuts the sheet on Esc.
 */
function phoneBulkBar(p: BulkBarProps, f: ReturnType<typeof bulkFacts>) {
  const { busy, canFind, onClear, onContacted, onSheet = () => undefined } = p;
  const { count, hidden, scope } = f;
  return (
    <>
      <div className="cl-bulk ld-bulk pp-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
        <button
          type="button"
          className="pp-bar-icon"
          aria-label="Clear the selection"
          onClick={onClear}
          data-testid="leads-bulk-clear"
        >
          <Icon name="x" size={18} />
        </button>
        <span className="cl-bulk-count">
          <b>{count.toLocaleString()}</b> selected
          {hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}
        </span>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => onContacted(scope("contacted"))}
          data-testid="leads-bulk-contacted"
          {...(canFind ? {} : gate("find", "mark these leads contacted"))}
        >
          Mark contacted
        </button>
        <button
          type="button"
          className="pp-bar-icon"
          aria-label={`More for the ${count} selected`}
          aria-haspopup="dialog"
          onClick={() => onSheet("more")}
          data-testid="leads-bulk-more"
        >
          <Icon name="more" size={18} />
        </button>
      </div>
      {phoneSheets(p, f)}
    </>
  );
}

/** A desk's bar: the count, what resolves a Needs review selection, and every act in one row. */
function deskBulkBar(p: BulkBarProps, f: ReturnType<typeof bulkFacts>) {
  const { busy, canFind, canExport, allMatching, total, rows, whyNot, exportHref, whyOpen, onWhyOpen, view } = p;
  const { picked, ids, count, hidden, acts } = f;
  const review = p.review as ReviewDoors;
  const gateWork = canFind ? {} : gate("find", "work these leads");
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <span className="cl-bulk-count">
        <b>{count}</b> selected
        {hidden > 0 ? <span data-testid="leads-bulk-hidden"> · {hidden} more not shown</span> : null}
      </span>
      {!allMatching && total > rows.length && (
        <button
          type="button"
          className="cl-bucket-link"
          onClick={p.onSelectAllMatching}
          data-testid="leads-select-matching"
        >
          Select all {total.toLocaleString()} that match
        </button>
      )}
      {acts.includes("check_again") && review.canCheckAgain ? (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => review.onCheckAgain(ids)}
          data-testid="leads-bulk-check-again"
          {...gateWork}
        >
          <Icon name="refresh" size={12} /> Check {ids.length} again{" "}
          <span className="dim">· about {leadCheckAgainCents(ids.length)}¢</span>
        </button>
      ) : null}
      {acts.includes("keep") ? (
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => review.onKeep(ids)}
          data-testid="leads-bulk-keep"
          {...gateWork}
        >
          Keep {ids.length}
        </button>
      ) : null}
      {acts.includes("exclude") ? (
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => review.onExclude(ids)}
          data-testid="leads-bulk-exclude"
          {...gateWork}
        >
          Exclude {ids.length}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() => p.onCopyEmails(picked)}
        data-testid="leads-bulk-copy"
      >
        <Icon name="copy" size={12} /> Copy emails
      </button>
      {p.write}
      <button
        type="button"
        className="btn btn-sm"
        disabled={busy}
        onClick={() =>
          p.onContacted(
            allMatching ? { by: "view", action: "contacted", view } : { by: "ids", action: "contacted", ids },
          )
        }
        data-testid="leads-bulk-contacted"
        {...(canFind ? {} : gate("find", "mark these leads contacted"))}
      >
        <Icon name="check" size={12} /> Mark contacted
      </button>
      {/* The same five whys the peek asks, asked once for the whole selection: LeadNotFitWhy is the peek's own list, so the
          words are spelled in one place (Task 15 step 4). */}
      <span className="ld-bulk-nf">
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={!!whyOpen}
          onClick={() => onWhyOpen(!whyOpen)}
          data-testid="leads-bulk-not-a-fit"
          {...(canFind ? {} : gate("find", "mark these leads not a fit"))}
        >
          <Icon name="ban" size={12} /> Not a fit
        </button>
        {whyOpen ? (
          <LeadNotFitWhy
            busy={busy}
            on={{
              onWhy: async (why) => {
                await p.onNotAFit(
                  why,
                  allMatching ? { by: "view", action: "not_a_fit", view } : { by: "ids", action: "not_a_fit", ids },
                );
              },
            }}
          />
        ) : null}
      </span>
      {canExport ? (
        <a
          className="btn btn-sm"
          href={exportHref || undefined}
          download
          title="Download these leads as a CSV file"
          data-testid="leads-bulk-export"
        >
          <Icon name="external" size={12} /> Export
        </a>
      ) : (
        <button
          type="button"
          className="btn btn-sm"
          {...gate("export", "export these leads")}
          data-testid="leads-bulk-export"
        >
          <Icon name="external" size={12} /> Export
        </button>
      )}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
      <button type="button" className="btn btn-ghost btn-sm" onClick={p.onClear} data-testid="leads-bulk-clear">
        <Icon name="x" size={11} /> Clear
      </button>
    </div>
  );
}

export const LeadsBulkBar = (p: BulkBarProps) => {
  const f = bulkFacts(p);
  return p.phone ? phoneBulkBar(p, f) : deskBulkBar(p, f);
};
