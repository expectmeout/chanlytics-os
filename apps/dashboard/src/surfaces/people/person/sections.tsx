/**
 * The person page's sections (moved from legacy/pages/client-profile.jsx, decision 0015, step 5): Coming up (their visits that
 * have not ended, each a door to its day), History (the timeline without them), and the rail's About and Campaigns cards.
 * Each is a function of the page's context returning an element, never a component of its own.
 */
import {
  PERSON_WASH_WORDS,
  appointmentWordWhere,
  visitDoor,
  visitLinkWords,
  type PersonAboutFact,
  type PersonVM,
} from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Wash } from "../../kit/motion/wash";
import { navigate } from "../../legacy-verbs";
import { VisitAsk } from "../../visit-line";
import { PersonEmail } from "./name";
import { PersonTimeline } from "./timeline";
import type { PageCtx } from "./ctx";

/**
 * Their visits that have not ended: the calendar's future sat at the top of the timeline, over the conversation it followed.
 * Each is the one visit line (contracts visitLineOf): how it was matched when that was a guess, in the words every page says it
 * in, and, once it has begun and nobody has said whether they came, the same two presses a past visit gets.
 */
export function comingUpSection(comingUp: NonNullable<PersonVM["comingUp"]>) {
  if (comingUp.length === 0) return false;
  return (
    <section
      className="cl-prof-section cl-prof-up"
      aria-labelledby="person-coming-up-title"
      data-testid="person-coming-up"
    >
      <h2 className="cl-prof-section-title" id="person-coming-up-title">
        Coming up
      </h2>
      <div className="cl-prof-up-list">
        {comingUp.map((v) => (
          <div key={v.id} className="cl-prof-up-item">
            <button
              type="button"
              className="cl-prof-up-visit"
              onClick={() => navigate(v.to)}
              data-testid="person-visit-ahead"
            >
              <span className="cl-prof-up-leaf" aria-hidden="true">
                <span className="cl-prof-up-month">{v.month}</span>
                <span className="cl-prof-up-date">{v.date}</span>
              </span>
              <span className="cl-prof-up-words">
                <span className="cl-prof-up-title">{v.title}</span>
                <span className="cl-prof-up-when">
                  {v.day} · {v.time}
                  {v.match ? ` · ${v.match}` : ""}
                </span>
              </span>
              <span className="cl-prof-up-go" aria-hidden="true">
                <Icon name="chevron" size={12} />
              </span>
            </button>
            {/* Under way and nobody has said whether they came: the question and its two presses, beside the door and not in it.
                A copy of the page the tab kept from before this line existed has none, and asks nothing until it is read again. */}
            {(v.visit?.asks.length ?? 0) > 0 && (
              <div className="cl-prof-up-ask">{v.visit && <VisitAsk line={v.visit} testid="person-visit-ask" />}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** The History: the timeline without the visits ahead, narrowed by the filter the page holds. */
export function historySection(c: PageCtx, past: PersonVM["timeline"]) {
  const { p, tlFilter, setTlFilter, tlAll, setTlAll } = c;
  return (
    <section className="cl-prof-section cl-prof-history" aria-labelledby="person-history-title">
      <div className="cl-prof-section-head">
        <h2 className="cl-prof-section-title" id="person-history-title">
          {/* Its newest row someone else added while the page is open: the heading washes (canvas A's wash). */}
          <Wash scope={p.id} value={past[0]?.id ?? ""} said={PERSON_WASH_WORDS.history}>
            History
          </Wash>
        </h2>
      </div>
      <PersonTimeline
        items={past}
        initials={p.initials}
        name={p.name}
        filter={tlFilter}
        onFilter={setTlFilter}
        showAll={tlAll}
        onShowAll={() => setTlAll(true)}
        dealsOn={p.dealsOn}
        fresh={c.fresh}
      />
    </section>
  );
}

/** The one About fact that is changed here is the address, so its row is its control; the next visit and the lead have a door. */
function aboutRow(c: PageCtx, a: PersonAboutFact) {
  const { p, canRecord, flash } = c;
  const lead = p.lead;
  return (
    <div className="cl-prof-attr" key={a.k}>
      <span className="cl-prof-attr-key">{a.k}</span>
      <span className="cl-prof-attr-val">
        {a.k === "Email" ? <PersonEmail p={p} canEdit={canRecord} flash={flash} /> : a.v}
        {/* The next visit opens on the Calendar, its panel where the record has its row, else its day; the row opened nothing. */}
        {a.next && p.nextVisitDate && (
          <button
            type="button"
            className="cl-bucket-link cl-prof-attr-door"
            onClick={() => navigate(visitDoor(p.nextVisitDate ?? "", p.nextVisitId))}
            data-testid="fact-next-visit"
          >
            {visitLinkWords(p.nextVisitId, appointmentWordWhere(p.dealsOn))} <Icon name="arrow-right" size={10} />
          </button>
        )}
        {/* The way back to where the finder found them: the lead, open over Leads. */}
        {a.k === "Added" && lead && (
          <button
            type="button"
            className="cl-bucket-link cl-prof-attr-door"
            onClick={() => navigate(lead.to)}
            title={lead.name}
            data-testid="fact-lead"
          >
            Open the lead <Icon name="arrow-right" size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

/**
 * About holds what the line under the name does not. The six-cell strip that sat above Right now said first contact, the
 * channels, the counts and the next visit again, beside a rail that said them too; its counts and its day door move here.
 * History leads, whatever else the row holds. The proposal is the deal's (0008): its link, whether it went and the day it
 * stands until are the Deal section's, said once, there. The address is the one fact changed here: someone who may change it
 * gets the row even when it is empty, because that row is where an address is added; someone who may not gets it only when
 * there is one.
 */
function aboutRows(c: PageCtx): PersonAboutFact[] {
  const { p, canRecord } = c;
  const said = new Set(["Phone", "Channels", "First contact", "Proposal"]);
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  // Ten seconds on the phone is not "1 min".
  const callTime = p.callSeconds >= 60 ? `${Math.round(p.callSeconds / 60)} min` : `${p.callSeconds} s`;
  const history = {
    k: "History",
    v: `${count(p.threads, "conversation")}${p.escalations ? `, ${p.escalations} needed you` : ""} · ${count(p.calls, "call")}${p.calls ? `, ${callTime}` : ""}`,
  };
  const aboutFacts = p.about.filter((a) => !said.has(a.k));
  if (canRecord && !aboutFacts.some((a) => a.k === "Email")) aboutFacts.unshift({ k: "Email", v: "" });
  return [history, ...aboutFacts];
}

/** The About card. */
export function aboutCard(c: PageCtx) {
  return (
    <div className="cl-prof-rail-section">
      <div className="cl-prof-rail-label">About</div>
      <div className="cl-prof-attr-list">{aboutRows(c).map((a) => aboutRow(c, a))}</div>
    </div>
  );
}

/** What a playbook or a broadcast sent them, and what came of it: each row opens the run's own report. */
export function campaignsCard(p: PersonVM) {
  return (
    p.campaigns.length > 0 && (
      <div className="cl-prof-rail-section" data-testid="person-campaigns">
        <div className="cl-prof-rail-label">Campaigns</div>
        <div className="cl-prof-attr-list">
          {p.campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cl-prof-attr cl-prof-run"
              onClick={() => navigate(c.to)}
              data-testid="person-campaign"
            >
              <span className="cl-prof-attr-key">{c.when}</span>
              <span className="cl-prof-attr-val">
                <span className="cl-prof-run-title">{c.title}</span>
                <span className="cl-prof-run-out" data-tone={c.tone}>
                  {c.line}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  );
}
