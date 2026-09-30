/**
 * Below the day's card: the few things worth a look that no row above says on its own (moved from
 * pages/dashboard-a-week.jsx, decision 0015, step 4). Each reads a surface the page already holds (Reports, People) and
 * the words are contracts/today.ts todayLeaks through TODAY_HELPERS. Nothing is computed on the page; every number
 * here is the same number on the page it links to. The period card and the journey that stood here are gone: the
 * period is one line at the foot of the day's card, and the reach list's one fact is a row below.
 */
import type { PeopleListsLike, ReportsLike, TodayLeakVM } from "@chanlytics/contracts";
import { useState } from "react";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import { appNavigate, askAbout, borrowed, surfaceFailed, useMoved } from "../shell";

/** The row's own second door, where it has one: called, not drawn, so the tree has no part of its own for it. */
function leakAlso(also: TodayLeakVM["also"]) {
  return (
    also && (
      <button type="button" className="tl-act" onClick={() => appNavigate(also.to)}>
        {also.label}
      </button>
    )
  );
}

// Worth a look: two pages read together.
//
// "18 wrote or called" lives on Reports and "17 asked, never booked" lives on People, and neither page can say they
// are the same eighteen people. This band is the only place on Today that puts two numbers beside each other, and
// it prints the arithmetic under every sentence so nobody has to take it on faith. Each row wears its tone once, as the
// one pill with a word in it (never colour alone), names who is waiting where the page holds them, and offers Ask its own facts:
// "Ask why" asks the row's sentence, so Ask grounds the answer in what it can read. It is gone entirely on a
// workspace with nothing wrong: there is no congratulation state. A third problem is a line, never silence.
//
// On a phone the arithmetic is a receipt, not a decision, so it waits behind the sentence: the sentence is a button
// that shows it, the way the day's figures show theirs, and "Ask why" carries it anyway. The words stay in the DOM
// (hidden), so Ask, the tests and a phone run read the same line. Width is read as the Calendar reads it (crPhone).
const PHONE_QUERY = "(max-width: 720px)";
const twPhone = () => !!(window.matchMedia && window.matchMedia(PHONE_QUERY).matches);

export const TodayLeaks = () => {
  useMoved(["reports", "people", "today"]);
  const [open, setOpen] = useState<string | null>(null);
  const R = borrowed<ReportsLike>("__REPORTS");
  const P = borrowed<PeopleListsLike>("__PEOPLE");
  const T = surfaceValue("today");
  const broke: [string, string] | null =
    !R && surfaceFailed("reports")
      ? ["Reports", "reports"]
      : !P && surfaceFailed("people")
        ? ["People", "people"]
        : null;
  if (broke) {
    return (
      <section className="tsec tl" data-testid="today-leaks">
        <div className="tsec-head">
          <span className="tsec-title">Worth a look</span>
        </div>
        <FailedRead
          kind="line"
          className="tl-failed"
          what={broke[0]}
          body="The queue and the day's card are current."
          surface={broke[1]}
          testid="today-leaks-failed"
        />
      </section>
    );
  }
  if (!R || !P) return null;
  const { rows, moreLine } = TODAY_HELPERS.leaks(R, P, T ? T.noReply : []);
  if (!rows.length) return null;
  const phone = twPhone();
  return (
    <section className="tsec tl" data-testid="today-leaks">
      <div className="tsec-head">
        <span className="tsec-title">Worth a look</span>
      </div>
      <div className="tl-list">
        {rows.map((l) => (
          <div key={l.id} className={`tl-row tl-${l.tone}`} data-testid={`today-leak-${l.id}`}>
            {/* The row's tone, once: the one pill, in the row's corner (dashboard-a-v2.css), so every sentence starts at
                one edge and the pills stand in one column. First in the markup, so a reader hears it before the sentence. */}
            <StatePill kind="tone" value={l.tone} label={l.tag} className="tl-tag" />
            {phone ? (
              <button
                type="button"
                className="tl-text tl-text-door"
                aria-expanded={open === l.id}
                aria-controls={`today-leak-math-${l.id}`}
                onClick={() => setOpen(open === l.id ? null : l.id)}
                data-testid={`today-leak-text-${l.id}`}
              >
                {l.text}
              </button>
            ) : (
              <span className="tl-text">{l.text}</span>
            )}
            {/* The foot: the arithmetic, who the row names, and its doors at the right, on one line where there is room. */}
            <div className="tl-foot">
              <span className="tl-math tabular" id={`today-leak-math-${l.id}`} hidden={phone && open !== l.id}>
                {l.math}
              </span>
              {/* Who the row names, and the lead that says who they are: on the unanswered row, who is waiting right now, from
                  the threads Today holds (not the count's own subjects: the count is Reports' over its period); on the
                  consultations row, the count's own people (0008). The words are contracts'. A person is a name, so each
                  is the one chip. */}
              {l.people.length > 0 && (
                <span className="tl-people">
                  {l.peopleLead && <span className="tl-people-lead">{l.peopleLead}</span>}
                  {l.people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="chip tl-person"
                      onClick={() => appNavigate(p.to)}
                      title={p.title}
                    >
                      {p.name}
                    </button>
                  ))}
                </span>
              )}
              {/* The doors are words: Ask why quiet, the row's own door in ink with its arrow. */}
              <span className="tl-acts">
                <button
                  type="button"
                  className="tl-act"
                  onClick={() => askAbout({ prompt: l.ask })}
                  data-testid={`today-leak-ask-${l.id}`}
                >
                  Ask why
                </button>
                {leakAlso(l.also)}
                <button type="button" className="tl-act tl-act-go" onClick={() => appNavigate(l.cta.to)}>
                  {l.cta.label} <Icon name="arrow-right" size={11} />
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {moreLine && (
        <div className="tsec-note" data-testid="today-leaks-more">
          {moreLine}
        </div>
      )}
    </section>
  );
};
