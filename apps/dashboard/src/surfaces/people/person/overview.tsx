/**
 * A person's Overview (canvas A §4): Up next, their last words, their notes with the composer, their deals and what is
 * coming. Up next is one ladder of what is true for them now, each row a fact and its one act, four at most and the rest
 * folded (contracts personNextFor over the deal cards the page draws); a deal's next act is its rung's alone, so the deal
 * card under it keeps its other moves. Their last words are the doors to the thread, so the page never says "Open the
 * thread" twice. Every sentence is contracts'; the acts are the page's verbs (pdRun, markStepDone, the visit line's
 * presses, the record kit's fold for a yes).
 */
import { useState } from "react";
import { LAST_WORDS_TITLE, NOTE_REFUSALS, NOTE_WORDS, UP_NEXT_WORDS, personNextFor } from "@chanlytics/contracts";
import type { UpNextRowVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { routeDoor } from "../../legacy-verbs";
import { VisitAsk } from "../../visit-line";
import { PersonDealCard, pdRun } from "../deal/person-deal";
import { markStepDone, seePersonNote } from "../people-detail";
import { PersonNotes } from "./notes";
import { campaignsCard, comingUpSection } from "./sections";
import type { PageCtx } from "./ctx";

/** A rung's one act, as the page's verbs run it; answered when the door takes it, and the page read again. */
function useRungActs(c: PageCtx) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (row: UpNextRowVM) => {
    const a = row.act;
    if (busy) return;
    if (a.kind === "deal") {
      pdRun(c.p, a.act, a.dealId, c.compose);
      return;
    }
    if (a.kind === "record-yes") {
      // The yes is recorded where the card asks it: the rail on a desk, About on a phone.
      if (c.phone) c.goTab("about");
      c.folds.visit.request();
      return;
    }
    if (a.kind === "visit") return;
    setBusy(row.id);
    const r = a.kind === "got-it" ? await seePersonNote(c.p.id, a.noteId) : await markStepDone(c.p.id, a.stepId, true);
    setBusy(null);
    if (!r.ok) {
      c.flash({ tone: "danger", msg: r.message || NOTE_REFUSALS.not_found });
      return;
    }
    // Got it says nothing: the row leaving is the answer (canvas A §2, honest toasts). Done says so, as the card's does.
    if (a.kind === "step-done") c.flash({ msg: NOTE_WORDS.stepDone });
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
  c: PageCtx;
  row: UpNextRowVM;
  busy: string | null;
  run: (r: UpNextRowVM) => void;
}) {
  const a = row.act;
  // A member who may not record reads the ladder; its acts are an owner's or an operator's, Got it the reader's own.
  const may = a.kind === "got-it" || c.canRecord;
  return (
    <li className="cl-prof-rung" data-kind={a.kind} data-testid="person-up-next-row">
      <div className="cl-prof-rung-words">
        <span className="cl-prof-rung-title">{row.title}</span>
        {row.sub ? <span className="cl-prof-rung-sub">{row.sub}</span> : null}
      </div>
      {a.kind === "visit" ? (
        <VisitAsk line={a.line} testid="person-up-next-visit" />
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
function UpNext({ c }: { c: PageCtx }) {
  const vm = personNextFor(c.p, c.dealP, pageClock().zone(), Date.now());
  const [all, setAll] = useState(false);
  const { busy, run } = useRungActs(c);
  if (!vm.rows.length) return null;
  const rows = all && vm.more ? [...vm.rows, ...vm.more.rows] : vm.rows;
  return (
    <section
      className="cl-prof-section cl-prof-next"
      aria-labelledby="person-up-next-title"
      data-testid="person-up-next"
    >
      <h2 className="cl-prof-section-title" id="person-up-next-title">
        {UP_NEXT_WORDS.title}
      </h2>
      <ol className="cl-prof-rungs">
        {rows.map((row) => (
          <Rung key={row.id} c={c} row={row} busy={busy} run={(r) => void run(r)} />
        ))}
      </ol>
      {vm.more && !all ? (
        <Button size="sm" variant="quiet" className="cl-prof-rungs-more" onClick={() => setAll(true)}>
          {vm.more.label} <Icon name="chevron" size={10} />
        </Button>
      ) : null}
    </section>
  );
}

/** Their last words: their newest message and our newest, each a door to the thread. */
function LastWords({ c }: { c: PageCtx }) {
  const words = c.p.lastWords;
  if (!words.length) return null;
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
          const body = (
            <>
              <span className="cl-prof-word-meta">
                {w.who} · {w.when}
              </span>
              <span className="cl-prof-word-text">{w.text}</span>
            </>
          );
          return to ? (
            <a key={w.id} className="cl-prof-word" data-mine={w.mine || undefined} {...routeDoor(to)}>
              {body}
            </a>
          ) : (
            <div key={w.id} className="cl-prof-word" data-mine={w.mine || undefined}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Their notes: the log and the composer, the page's one place to write one. */
function NotesSection({ c }: { c: PageCtx }) {
  return (
    <section
      className="cl-prof-section cl-prof-notes-pane"
      aria-labelledby="person-notes-title"
      data-testid="person-notes-pane"
    >
      <h2 className="cl-prof-section-title" id="person-notes-title">
        {NOTE_WORDS.title}
      </h2>
      <PersonNotes p={c.p} canEdit={c.canRecord} isOwner={c.isOwner} flash={c.flash} onChanged={c.load} />
    </section>
  );
}

/**
 * The Overview, in its order: Up next, their last words, Notes, Deals (each deal's next act on its rung), Coming up; on
 * a phone, where Campaigns has no tab, what a campaign sent them last.
 */
export function Overview({ c }: { c: PageCtx }) {
  return (
    <>
      <UpNext c={c} />
      <LastWords c={c} />
      <NotesSection c={c} />
      <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={c.compose} flash={c.flash} rung />
      {comingUpSection(c.p.comingUp || [])}
      {c.phone ? campaignsCard(c.p) : null}
    </>
  );
}
