/**
 * The bulk bar (moved from legacy/pages/leads-scope.jsx, decision 0015; the lead-to-sequence canvas's DeskBulk, 18 Oct
 * 2026): what a selection of leads can become -- added to a sequence (the search's pick, or any the picker lists, or a new
 * one: bulk-add.tsx), put off for later, not a fit, and, under More, their emails on the clipboard or a file. It says how
 * many have no email, which an add leaves selected with why. Each acts on the rows shown AND selected; the header box's
 * "Select all N that match" hands the view's filters to the server instead of a list of ids, so a view of 1,240 does not
 * become 1,240 ids in a request (Not a fit alone takes that; an add is of the leads shown).
 */
import {
  LEAD_SHEET_WORDS,
  LEAD_WORDS,
  leadCheckAgainCents,
  type LeadNotAFitWhy,
  type LeadReviewAct,
  type LeadRowVM,
  type LeadsBulkInput,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { gate, leaving } from "../../legacy-verbs";
import { Sheet } from "../../kit/sheet/sheet";
import { JOB_CANCEL, PhoneSheetRow } from "../../people/sheets/phone-sheet";
import { dockAct } from "../../people/bulk/phone-bulk";
import type { ReviewDoors } from "../bench/types";
import { LeadNotFitWhy } from "../peek/asks";
import { BulkAddDesk, BulkChoose, type BulkAdd } from "./bulk-add";

const B = LEAD_SHEET_WORDS.bulk;

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
  onNotAFit: (why: LeadNotAFitWhy, body: LeadsBulkInput) => unknown;
  whyOpen: boolean;
  onWhyOpen: (open: boolean) => void;
  /** The press that exports the selection's view as a file: a POST that saves it (page/acts.tsx exportLeads), not a link. */
  onExport: () => void;
  review?: ReviewDoors | null;
  phone?: boolean;
  sheet?: string | null;
  onSheet?: (step: string | null) => void;
  /** Add and Later for the leads chosen and shown (bulk-add.tsx); none while the selection is all that match. */
  add: BulkAdd | null;
  /** The search they are seen in: Later is its own; New is named for it. */
  search: { id: string; name: string } | null;
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
  // Those no email can go to: an add leaves them selected, saying why; the bar says how many first.
  const noEmail = picked.filter((l) => !l.email).length;
  return { picked, ids, count, hidden, acts, scope, noEmail };
}

/** More, on a desk: the emails on the clipboard, and the selection's view as a file. */
function moreMenu(p: BulkBarProps, picked: LeadRowVM[]) {
  return (
    <Menu
      align="end"
      label={B.more}
      trigger={
        <Button size="sm" variant="quiet" disabled={p.busy} data-testid="leads-bulk-more">
          <Icon name="more" size={13} /> {B.more}
        </Button>
      }
      groups={[
        {
          items: [
            { label: "Copy emails", glyph: <Icon name="copy" size={13} />, onSelect: () => p.onCopyEmails(picked) },
            p.canExport
              ? {
                  label: "Export",
                  meta: "CSV",
                  glyph: <Icon name="external" size={13} />,
                  onSelect: () => p.onExport(),
                }
              : {
                  label: "Export",
                  meta: "CSV",
                  glyph: <Icon name="external" size={13} />,
                  gate: gate("export", "export these leads"),
                  onSelect: () => undefined,
                },
          ],
        },
      ]}
    />
  );
}

/** What resolves a Needs review selection, as a phone's sheet rows: Check again where its courier exists, Keep, Exclude. */
function phoneReviewRows(p: BulkBarProps, f: ReturnType<typeof bulkFacts>, shut: (fn: () => unknown) => () => void) {
  const { busy, canFind } = p;
  const { ids, acts } = f;
  const review = p.review as ReviewDoors;
  const gateWork = canFind ? null : gate("find", "work these leads");
  return (
    <>
      {acts.includes("check_again") && review.canCheckAgain ? (
        <PhoneSheetRow
          icon="refresh"
          label={`Check ${ids.length} again`}
          meta={`about ${leadCheckAgainCents(ids.length)}¢`}
          disabled={busy}
          onClick={shut(() => review.onCheckAgain(ids))}
          testid="leads-bulk-check-again"
          gate={gateWork}
        />
      ) : null}
      {acts.includes("keep") ? (
        <PhoneSheetRow
          icon="check"
          label={`Keep ${ids.length}`}
          disabled={busy}
          onClick={shut(() => review.onKeep(ids))}
          testid="leads-bulk-keep"
          gate={gateWork}
        />
      ) : null}
      {acts.includes("exclude") ? (
        <PhoneSheetRow
          icon="x"
          label={`Exclude ${ids.length}`}
          disabled={busy}
          onClick={shut(() => review.onExclude(ids))}
          testid="leads-bulk-exclude"
          gate={gateWork}
        />
      ) : null}
    </>
  );
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
    onExport,
    sheet = null,
    onSheet = () => undefined,
  } = p;
  const { picked, count, scope } = f;
  const W = LEAD_WORDS;
  const shut = (fn: () => unknown) => () => {
    onSheet(null);
    fn();
  };
  // One sheet, its steps: the acts, Not a fit's whys, and Add's picker (or New) for them all. It stays drawn as it leaves.
  const why = sheet === "why";
  const adding = sheet === "add" && !!p.add;
  return (
    <Sheet
      backCloses
      open={sheet === "more" || why || adding}
      shape="job"
      title={why ? W.notFitTitle || "Not a fit" : adding ? "" : `${count.toLocaleString()} selected`}
      close={JOB_CANCEL}
      back={null}
      onClose={() => onSheet(null)}
      testid={why ? "leads-bulk-why" : adding ? "leads-bulk-add-sheet" : "leads-bulk-sheet"}
    >
      {adding && p.add ? (
        <div className="lw" data-testid="leads-bulk-picker">
          <BulkChoose b={p.add} search={p.search} onClose={() => onSheet(null)} />
        </div>
      ) : why ? (
        <LeadNotFitWhy
          rows
          busy={busy}
          on={{
            onWhy: (w) => {
              shut(() => p.onNotAFit(w, scope("not_a_fit")))();
              return Promise.resolve();
            },
          }}
          testid="leads-bulk-why"
        />
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
          {phoneReviewRows(p, f, shut)}
          {p.add && p.search ? (
            <PhoneSheetRow
              icon="clock"
              label={B.later}
              disabled={busy || p.add.busy}
              onClick={shut(() => void p.add?.later())}
              testid="leads-bulk-later"
              gate={canFind ? null : gate("approve", "put these leads off")}
            />
          ) : null}
          <PhoneSheetRow
            icon="copy"
            label="Copy emails"
            disabled={busy}
            onClick={shut(() => p.onCopyEmails(picked))}
            testid="leads-bulk-copy"
          />
          {canExport ? (
            <PhoneSheetRow
              icon="external"
              label="Export"
              meta="CSV"
              disabled={busy}
              onClick={shut(onExport)}
              testid="leads-bulk-export"
            />
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
          {f.noEmail > 0 ? (
            <p className="pp-sheet-hint pp-sheet-rows-note" data-testid="leads-bulk-no-email">
              {B.noEmail(f.noEmail)}
            </p>
          ) : null}
          {f.hidden > 0 ? (
            <p className="pp-sheet-hint pp-sheet-rows-note" data-testid="leads-bulk-hidden">
              {f.hidden.toLocaleString()} more selected are not shown, and these leave them out.
            </p>
          ) : null}
          {whyNot ? <p className="pp-sheet-hint pp-sheet-rows-note">{whyNot}</p> : null}
        </div>
      )}
    </Sheet>
  );
}

/**
 * On a phone (spec 4.5): People's dock (people/bulk/phone-bulk.tsx), the tab bar's twin -- four equal slots, each a glyph
 * over a word: Clear, Not a fit, Add (the picker for them all, a step of the sheet) and More (Ruben, 10 Oct 2026: parity
 * with People's; Contacted went with the stage's own menu, 18 Oct 2026); how many are selected is the top bar's -- and a
 * sheet with the rest. Not a fit asks its five whys as a sheet: the peek's own
 * list (LeadNotFitWhy) wears .pl-peek, which a phone draws full screen (leads.css), so from this bar it covered the page.
 * The whys are the peek's words, from their one list (LEAD_WORDS.whys). The step is the page's (`sheet`), so its keyboard
 * listener shuts the sheet on Esc. Select on, with nobody picked yet, the acts stand and wait.
 */
function phoneBulkBar(p: BulkBarProps, f: ReturnType<typeof bulkFacts>) {
  const { busy, canFind, onClear, onSheet = () => undefined } = p;
  const { count } = f;
  const off = busy || count === 0;
  return (
    <>
      <div
        className="cl-bulk ld-bulk pp-bulk capsule"
        ref={leaving("leads-dock")}
        data-dock
        role="toolbar"
        aria-label={count ? `${count.toLocaleString()} leads selected` : "Select leads"}
        data-testid="leads-bulk-bar"
      >
        <div className="pp-bulk-acts">
          {dockAct({
            icon: "x",
            word: "Clear",
            onPress: onClear,
            disabled: false,
            testid: "leads-bulk-clear",
            sheet: false,
          })}
          {dockAct({
            icon: "ban",
            word: "Not a fit",
            onPress: () => onSheet("why"),
            disabled: off,
            testid: "leads-bulk-not-a-fit",
            gate: canFind ? null : gate("find", "mark these leads not a fit"),
          })}
          {dockAct({
            icon: "plus",
            word: "Add",
            onPress: () => onSheet("add"),
            disabled: off || !p.add,
            testid: "leads-bulk-add",
            gate: gate("approve", "add these leads to a sequence"),
          })}
          {dockAct({
            icon: "menu",
            word: "More",
            onPress: () => onSheet("more"),
            disabled: off,
            testid: "leads-bulk-more",
          })}
        </div>
      </div>
      {phoneSheets(p, f)}
    </>
  );
}

/**
 * A desk's bar (the canvas's DeskBulk): Clear, the count and how many have no email, what resolves a Needs review
 * selection, then Not a fit, Later and Add with ▴ for the picker, and More.
 */
function deskBulkBar(p: BulkBarProps, f: ReturnType<typeof bulkFacts>) {
  const { busy, canFind, allMatching, total, rows, whyNot, whyOpen, onWhyOpen, view } = p;
  const { picked, ids, count, hidden, acts, noEmail } = f;
  const review = p.review as ReviewDoors;
  const gateWork = canFind ? {} : gate("find", "work these leads");
  return (
    <div className="cl-bulk ld-bulk" role="toolbar" aria-label="Selected leads" data-testid="leads-bulk-bar">
      <Button size="sm" variant="quiet" iconOnly onClick={p.onClear} aria-label="Clear" data-testid="leads-bulk-clear">
        <Icon name="x" size={12} />
      </Button>
      <span className="cl-bulk-count">
        <b>{count}</b> selected
        {noEmail > 0 ? (
          <span className="ld-bulk-warn" data-testid="leads-bulk-no-email">
            {" "}
            {B.noEmail(noEmail)}
          </span>
        ) : null}
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
      {p.add && p.search ? (
        <Button
          size="sm"
          disabled={busy || p.add.busy}
          onClick={() => void p.add?.later()}
          data-testid="leads-bulk-later"
          {...gate("approve", "put these leads off")}
        >
          <Icon name="clock" size={12} /> {B.later}
        </Button>
      ) : null}
      {p.add ? <BulkAddDesk b={p.add} search={p.search} /> : null}
      {moreMenu(p, picked)}
      {whyNot && <span className="cl-prof-aut-hint">{whyNot}</span>}
    </div>
  );
}

export const LeadsBulkBar = (p: BulkBarProps) => {
  const f = bulkFacts(p);
  return p.phone ? phoneBulkBar(p, f) : deskBulkBar(p, f);
};
