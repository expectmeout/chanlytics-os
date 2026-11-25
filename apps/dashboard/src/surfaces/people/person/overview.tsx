/**
 * A person's story, the one page's first parts (Ruben, 17 Nov 2026: "ONE shared person page"; the One person page canvas):
 * Now, Latest, Deals for someone with a deal, Notes, Coming up and History, in that order for every person, each drawn
 * whether or not it holds anything, so no part is ever blank. Now is one ladder of what is true for them now, each row a
 * fact and its one act, four at most and the rest folded (contracts personNextFor over the deal cards the page draws); a
 * deal's next act is its rung's alone, so the deal card under it keeps its other moves; a person who needs you says why
 * there, once, the head's act its answer; with nothing waiting it says what AI does for them. Latest is the newest thing
 * of any kind: their last words where it was a message, else the call, the form or the visit it was. Every sentence is
 * contracts'; the acts are the page's verbs (pdRun, markStepDone, the visit line's presses, the record kit's fold for a yes).
 */
import { useState } from "react";
import {
  NOTE_REFUSALS,
  NOTE_WORDS,
  PERSON_PART_WORDS,
  PERSON_WASH_WORDS,
  personNextFor,
  personTabRoute,
} from "@chanlytics/contracts";
import type { PersonVM, UpNextRowVM } from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Wash } from "../../kit/motion/wash";
import { routeDoor } from "../../frame-verbs";
import { VisitActs } from "../../visit-line";
import { PersonDealCard, pdRun } from "../deal/person-deal";
import { markStepDone, seePersonNote } from "../people-detail";
import { completeStep } from "../../step-done";
import { PersonNotes } from "./notes";
import { FactNotices } from "./notices/fact-notices";
import { NOTES_FILTER, comingUpSection, historyPart } from "./sections";
import { PersonTimeline } from "./timeline";
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
        // Refused: the step may be one a teammate changed, so the page reads them again (S9-10).
        onRefused: () => c.load(),
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
          data-tip={a.kind === "deal" ? a.act.hint || undefined : undefined}
          data-testid="person-up-next-act"
        >
          {a.label}
        </Button>
      ) : null}
    </li>
  );
}

/** Whether the head's state asks someone (People's Needs you, or a conversation a member holds): Now says why, once. */
const waitsOnYou = (p: PersonVM): boolean => p.state === "needs_you" || p.state === "waiting_on_you";

/** What AI does for them while nothing waits: their own setting, else the workspace's, or that they asked to stop. */
const aiLine = (p: PersonVM): string =>
  PERSON_PART_WORDS.aiDoes(p.receptionistMode.person ?? p.receptionistMode.workspace, p.consent.state === "opted_out");

/**
 * Why they need you, Now's first row (the one page, D6): Right now's reason and its sentence, said here and not under the
 * name. No press of its own: the head's act, their conversation, is the answer.
 */
function NeedsRow({ p }: { p: PersonVM }) {
  return (
    <li className="cl-prof-rung" data-kind="needs" data-testid="person-now-needs">
      <div className="cl-prof-rung-words">
        <span className="cl-prof-rung-title">{p.rightNow.title}</span>
        <span className="cl-prof-rung-sub">{p.rightNow.detail || PERSON_PART_WORDS.answerIt}</span>
      </div>
    </li>
  );
}

/**
 * Now: why they need you where they do, then the ladder, four rungs, the rest under "N more". Drawn for everyone: with
 * nothing waiting it says so, and what AI does for them (the one page: no part is ever blank).
 */
export function UpNext({ c }: { c: UpNextCtx }) {
  const vm = personNextFor(c.p, c.dealP, pageClock().zone(), Date.now());
  const [all, setAll] = useState(false);
  const { busy, run } = useRungActs(c);
  const rows = all && vm.more ? [...vm.rows, ...vm.more.rows] : vm.rows;
  const needs = waitsOnYou(c.p);
  return (
    <section
      className="cl-prof-section cl-prof-next"
      aria-labelledby="person-up-next-title"
      data-testid="person-up-next"
    >
      <h2 className="cl-prof-section-title" id="person-up-next-title">
        {/* The ladder someone else changed while the page is open: its name washes (canvas A's wash), never a row's place. */}
        <Wash scope={c.p.id} value={vm.rows.map((r) => r.id).join(" ")} said={PERSON_WASH_WORDS.upNext}>
          {PERSON_PART_WORDS.now}
        </Wash>
      </h2>
      {needs || rows.length ? (
        <ol className="cl-prof-rungs">
          {needs ? <NeedsRow p={c.p} /> : null}
          {rows.map((row) => (
            <Rung key={row.id} c={c} row={row} busy={busy} run={(r) => void run(r)} />
          ))}
        </ol>
      ) : (
        <p className="cl-prof-rest" data-testid="person-now-rest">
          <span className="cl-prof-rest-title">{PERSON_PART_WORDS.nothingWaits}</span>
          <span className="cl-prof-rest-sub">{aiLine(c.p)}</span>
        </p>
      )}
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

/** The kinds that are the conversation itself: their words and ours, and the hand-overs in it. */
const SPOKEN = new Set(["customer", "receptionist", "team", "escalation", "decision"]);

/** Their words and ours, each a door to the conversation (canvas A's two bubbles). */
function wordsList(ctx: NoticeCtx) {
  const to = ctx.p.openThread;
  return (
    <div className="cl-prof-word-list">
      {ctx.p.lastWords.map((w) => {
        // Theirs and ours keep their place, so newer words of theirs wash where the last ones were (canvas A's wash).
        const body = (
          <>
            <span className="cl-prof-word-meta">
              {w.who} · {w.when}
            </span>
            <span className="cl-prof-word-text">
              <Wash scope={ctx.p.id} value={w.id} said={w.mine ? null : PERSON_WASH_WORDS.lastWords}>
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
  );
}

/**
 * Latest: the newest thing of any kind (the one page, D4). Where it was the conversation, their words and ours, each a
 * door to it; else the call, the form, the visit or the step it was, as History says it, with the door to their
 * conversation where they have one. A reply AI holds before it sends is said under it, one row (canvas A).
 */
export function Latest({ c }: { c: NoticeCtx }) {
  const newest = c.p.timeline.find((t) => !t.ahead) ?? null;
  const spoken = c.p.lastWords.length > 0 && (!newest || SPOKEN.has(newest.kind));
  const to = c.p.openThread;
  return (
    <section
      className="cl-prof-section cl-prof-words"
      aria-labelledby="person-words-title"
      data-testid="person-last-words"
    >
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-words-title">
          {PERSON_PART_WORDS.latest}
        </h2>
        {to && !spoken ? (
          <LinkButton {...routeDoor(to)} className="cl-prof-door" data-testid="person-latest-open">
            {PERSON_PART_WORDS.openConversation} <Icon name="chevron" size={10} />
          </LinkButton>
        ) : null}
      </div>
      {spoken ? (
        wordsList(c)
      ) : newest ? (
        <PersonTimeline items={[newest]} initials={c.p.initials} name={c.p.name} showAll word={c.p.word} />
      ) : (
        <p className="cl-prof-rest">
          <span className="cl-prof-rest-title">{PERSON_PART_WORDS.nothingYet}</span>
        </p>
      )}
      <FactNotices c={c} home="last-words" line />
    </section>
  );
}

/**
 * Their notes (canvas A): AI's suggestions, the newest kept notes and the composer, the page's one place to write one;
 * "All notes ›" at the head opens History's Notes, where every note is. Drawn for everyone (the one page).
 */
function NotesSection({ c }: { c: PageCtx }) {
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
      {c.canRecord || c.p.noteList.length > 0 ? (
        <PersonNotes p={c.p} canEdit={c.canRecord} isOwner={c.isOwner} flash={c.flash} onChanged={c.load} compact />
      ) : (
        <p className="cl-prof-rest">
          <span className="cl-prof-rest-sub">{PERSON_PART_WORDS.noNotes}</span>
        </p>
      )}
    </section>
  );
}

/**
 * Their story, the one page's first parts in their one order: Now, Latest, Deals for someone with a deal (each deal's
 * next act on its rung), Notes, Coming up, and History's newest rows. The same for every person, on a phone and a desk.
 */
export function StoryParts({ c, past }: { c: PageCtx; past: PersonVM["timeline"] }) {
  return (
    <>
      <UpNext c={c} />
      <Latest c={c} />
      {c.p.deals.length > 0 ? (
        <PersonDealCard p={c.dealP} canRecord={c.canRecord} onCompose={c.compose} flash={c.flash} rung />
      ) : null}
      <NotesSection c={c} />
      {comingUpSection(c)}
      {historyPart(c, past)}
    </>
  );
}
