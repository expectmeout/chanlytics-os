/**
 * A person's Overview (canvas A §4): Up next, their last words, their notes with the composer, their deals and what is
 * coming. Up next is one ladder of what is true for them now, each row a fact and its one act, four at most and the rest
 * folded (contracts personNextFor over the deal cards the page draws); a deal's next act is its rung's alone, so the deal
 * card under it keeps its other moves. Their last words are the doors to the thread, so the page never says "Open the
 * thread" twice. Every sentence is contracts'; the acts are the page's verbs (pdRun, markStepDone, the visit line's
 * presses, the record kit's fold for a yes).
 */
import { useState } from "react";
import {
  LAST_WORDS_TITLE,
  NOTE_REFUSALS,
  NOTE_WORDS,
  PERSON_WASH_WORDS,
  UP_NEXT_WORDS,
  personNextFor,
  personTabRoute,
} from "@chanlytics/contracts";
import type { UpNextRowVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Wash } from "../../kit/motion/wash";
import { routeDoor } from "../../legacy-verbs";
import { VisitActs } from "../../visit-line";
import { PersonDealCard, pdRun } from "../deal/person-deal";
import { markStepDone, seePersonNote } from "../people-detail";
import { completeStep } from "../../step-done";
import { PersonNotes } from "./notes";
import { FactNotices, hasFactNotices } from "./notices/fact-notices";
import { NOTES_FILTER, campaignsFold, comingUpSection } from "./sections";
import type { NoticeCtx, PageCtx, UpNextCtx } from "./ctx";

/** A rung's one act, as the page's verbs run it; answered when the door takes it, and the page read again. */
function useRungActs(c: UpNextCtx) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (row: UpNextRowVM) => {
    const a = row.act;
    if (busy) return;
    if (a.kind === "deal") {
      pdRun(c.p, a.act, a.dealId, c.compose);
      return;
    }
    if (a.kind === "record-yes") {
      // The yes is recorded where it was asked: the rail's fold on a desk, a sheet over the Overview on a phone.
      c.folds?.visit.request();
      return;
    }
    if (a.kind === "visit") return;
    setBusy(row.id);
    // Done says what every page says (step-done.tsx): "Step done · its words", with an Undo that opens it again.
    if (a.kind === "step-done") {
      const ok = await completeStep({
        personId: c.p.id,
        noteId: a.stepId,
        words: row.title,
        version: c.p.noteList.find((n) => n.id === a.stepId)?.version,
        done: markStepDone,
        say: c.flash,
        onUndone: () => c.load(),
      });
      setBusy(null);
      if (ok) c.load();
      return;
    }
    const r = await seePersonNote(c.p.id, a.noteId);
    setBusy(null);
    if (!r.ok) {
      c.flash({ tone: "danger", msg: r.message || NOTE_REFUSALS.not_found });
      return;
    }
    // Got it says nothing: the row leaving is the answer (canvas A §2, honest toasts).
    c.load();
  };
  return { busy, run };
}

/** One rung: its fact, the line under it, and its one act (a visit's two presses are the visit line's own). */
function Rung({
  c,
  row,
  busy,
  run,
}: {
  c: UpNextCtx;
  row: UpNextRowVM;
  busy: string | null;
  run: (r: UpNextRowVM) => void;
}) {
  const a = row.act;
  // A member who may not record reads the ladder; its acts are an owner's or an operator's, Got it the reader's own.
  // A yes is recorded in the rail's fold, which only the person's page draws: a peek says the fact and offers no press.
  const may = (a.kind === "got-it" || c.canRecord) && (a.kind !== "record-yes" || !!c.folds);
  return (
    <li className="cl-prof-rung" data-kind={a.kind} data-testid="person-up-next-row">
      <div className="cl-prof-rung-words">
        <span className="cl-prof-rung-title">{row.title}</span>
        {row.sub ? <span className="cl-prof-rung-sub">{row.sub}</span> : null}
      </div>
      {a.kind === "visit" ? (
        // The rung's title asks it ("Did Ana come on Sat Oct 10?"); its presses are Kept and Missed, side by side.
        a.line.mark?.id && a.line.asks.length > 0 ? (
          <span className="cl-prof-rung-acts">
            <VisitActs mark={a.line.mark} acts={a.line.asks} testid="person-up-next-visit" variant="secondary" />
          </span>
        ) : null
      ) : may ? (
        <Button
          size="sm"
          onClick={() => run(row)}
          aria-busy={busy === row.id || undefined}
          title={a.kind === "deal" ? a.act.hint || undefined : undefined}
          data-testid="person-up-next-act"
        >
          {a.label}
        </Button>
      ) : null}
    </li>
  );
}

/** Up next: the ladder, four rungs, the rest under "N more". Nothing when nothing is true. */
export function UpNext({ c }: { c: UpNextCtx }) {
  const vm = personNextFor(c.p, c.dealP, pageClock().zone(), Date.now());
  const [all, setAll] = useState(false);
  const { busy, run } = useRungActs(c);
  // A next step a call left is Up next's too (a notice under the rungs): the pane draws for it alone.
  if (!vm.rows.length && !hasFactNotices(c, "next")) return null;
  const rows = all && vm.more ? [...vm.rows, ...vm.more.rows] : vm.rows;
  return (
    <section
      className="cl-prof-section cl-prof-next"
      aria-labelledby="person-up-next-title"
      data-testid="person-up-next"
    >
      <h2 className="cl-prof-section-title" id="person-up-next-title">
        {/* The ladder someone else changed while the page is open: its name washes (canvas A's wash), never a row's place. */}
        <Wash scope={c.p.id} value={vm.rows.map((r) => r.id).join(" ")} said={PERSON_WASH_WORDS.upNext}>
          {UP_NEXT_WORDS.title}
        </Wash>
      </h2>
      {rows.length ? (
        <ol className="cl-prof-rungs">
          {rows.map((row) => (
            <Rung key={row.id} c={c} row={row} busy={busy} run={(r) => void run(r)} />
          ))}
        </ol>
      ) : null}
      <FactNotices c={c} home="next" />
      {/* More than four rungs: the rest under one fold, "2 more" (canvas A, M1's fold with a summary). */}
      {vm.more ? (
        <Button
          size="sm"
          variant="quiet"
          className="cl-prof-rungs-more"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          data-open={all || undefined}
        >
          {vm.more.label} <Icon name="chevron" size={10} />
        </Button>
      ) : null}
    </section>
  );
}

/** Their last words: their newest message and our newest, each a door to the thread. */
export function LastWords({ c }: { c: NoticeCtx }) {
  const words = c.p.lastWords;
  if (!words.length && !hasFactNotices(c, "last-words")) return null;
  const to = c.p.openThread;
  return (
    <section
      className="cl-prof-section cl-prof-words"
      aria-labelledby="person-words-title"
      data-testid="person-last-words"
    >
      <h2 className="cl-prof-section-title" id="person-words-title">
        {LAST_WORDS_TITLE}
      </h2>
      <div className="cl-prof-word-list">
        {words.map((w) => {
          // Theirs and ours keep their place, so newer words of theirs wash where the last ones were (canvas A's wash).
          const body = (
            <>
              <span className="cl-prof-word-meta">
                {w.who} · {w.when}
              </span>
              <span className="cl-prof-word-text">
                <Wash scope={c.p.id} value={w.id} said={w.mine ? null : PERSON_WASH_WORDS.lastWords}>
                  {w.text}
                </Wash>
              </span>
            </>
          );
          const place = w.mine ? "ours" : "theirs";
          return to ? (
            <a key={place} className="cl-prof-word" data-mine={w.mine || undefined} {...routeDoor(to)}>
              {body}
            </a>
          ) : (
            <div key={place} className="cl-prof-word" data-mine={w.mine || undefined}>
              {body}
            </div>
          );
        })}
      </div>
      {/* A reply the receptionist holds before it sends: said under the words, one row, its door the thread (canvas A). */}
      <FactNotices c={c} home="last-words" line />
    </section>
  );
}

/**
 * Their notes, as the Overview draws them (canvas A): the newest kept note, the receptionist's suggestion and the
 * composer, the page's one place to write one; "All notes ›" at the head opens History's Notes, where every note is.
 */
export function NotesSection({ c }: { c: PageCtx }) {
  const kept = c.p.noteList.filter((n) => !n.suggested).length;
  const toAll = () => {
    c.setTlFilter(NOTES_FILTER);
    c.goTab("history");
  };
  return (
    <section
      className="cl-prof-section cl-prof-notes-pane"
      aria-labelledby="person-notes-title"
      data-testid="person-notes-pane"
    >
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-notes-title">
          {NOTE_WORDS.title}
        </h2>
        {kept > 1 ? (
          <LinkButton
            {...routeDoor(personTabRoute(c.p.id, "history"), toAll)}
            className="cl-prof-door"
            data-testid="person-notes-all"
          >
            {NOTE_WORDS.all} <Icon name="chevron" size={10} />
          </LinkButton>
        ) : null}
      </div>
      <PersonNotes p={c.p} canEdit={c.canRecord} isOwner={c.isOwner} flash={c.flash} onChanged={c.load} compact />
    </section>
  );
}

/**
 * The Overview, in its order: Up next, their last words, Notes, Deals (each deal's next act on its rung), Coming up; on
 * a phone, where Campaigns has no tab, what a campaign sent them last.
 */
export function Overview({ c }: { c: PageCtx }) {
  // Notes is drawn where there is a note or a suggestion, or once Note was pressed (canvas A): a thin record's page ends
  // with what happened, not an empty composer.
  // At a wide window their notes are the third column's (person-real.tsx), not the Overview's.
  const notes = !c.wide && (c.composing || c.p.noteList.length > 0);
  // A thin record (canvas A, P3: no thread, no deal, little history) is Up next, Coming up and its notes; History follows.
  // A sequence they are in (0060) is what comes to them next, so it is said here too, where it has no tab of its own.
  if (c.p.thin)
    return (
      <>
        <UpNext c={c} />
        {comingUpSection(c.p.comingUp || [])}
        {c.p.inSequences.length > 0 ? campaignsFold(c.p) : null}
        {notes ? <NotesSection c={c} /> : null}
      </>
    );
  return (
    <>
      <UpNext c={c} />
      <LastWords c={c} />
      {notes ? <NotesSection c={c} /> : null}
      <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={c.compose} flash={c.flash} rung />
      {comingUpSection(c.p.comingUp || [])}
      {c.phone ? campaignsFold(c.p) : null}
    </>
  );
}
