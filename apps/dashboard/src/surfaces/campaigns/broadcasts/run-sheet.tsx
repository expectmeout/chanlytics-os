/**
 * Chanlytics, Broadcasts: a run waiting on you, opened -- its approval sheet (moved from legacy/pages/broadcasts-run.jsx,
 * decision 0015), with the two things the sheet shares with the report beside it: one person's line, and what each stop
 * asks and promises.
 */
import { Fragment } from "react";
import type { ApprovalVM, BroadcastDetailDto, BroadcastDto, RunPersonVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { confirmPart, policyChipPart } from "../../legacy-parts";
import { gateTitle, navigate } from "../../legacy-verbs";
import { mpParts } from "../parts/message-preview";
import type { PlaybookCardVM } from "../playbooks/surface";

/**
 * A run waiting on you, as the page opens it (page/runs.tsx `sheetFor`): where it sits among the runs waiting (the
 * ledger's order), its playbook and its template for the words, and the acts -- which, when they land, open the next
 * run waiting, or the ledger.
 */
export interface BcSheetAsk {
  position: readonly [number, number] | null;
  canSend: boolean;
  playbook: PlaybookCardVM | null;
  template: { body_preview: string | null } | null;
  businessName: string;
  armed: boolean;
  onArm: (on: boolean) => void;
  stopping: boolean;
  approving: boolean;
  approve: (words?: unknown) => void;
  skip: () => void;
}

// One person's line on a run: who, how it went, the words, their one door, and when.
export const bcPersonRow = (p: RunPersonVM) => {
  const door = p.door;
  return (
    <div
      key={p.contact_id}
      className={`bc-person${p.attn ? " is-attn" : ""}${p.held ? " is-held" : ""}`}
      data-testid="bc-person"
    >
      <span className="bc-person-mark" aria-hidden="true">
        {p.initials}
      </span>
      <button type="button" className="bc-person-name" onClick={() => navigate(`clients/${p.contact_id}`)}>
        {p.name}
      </button>
      <span
        className={`pill${p.pill.tone && p.pill.tone !== "plain" ? ` pill-${p.pill.tone}` : ""} bc-person-pill`}
        data-tone={p.pill.tone}
      >
        {p.pill.label}
      </span>
      <span className="bc-person-words">{p.words}</span>
      {door && (
        <button type="button" className="bc-person-door" onClick={() => navigate(door.to)}>
          {door.label}
        </button>
      )}
      <span className="bc-person-at mono">{p.at || "—"}</span>
    </div>
  );
};
// A run waiting on you, opened: the sheet the canvas draws for the phone -- "approving from the sofa" -- at any
// width, since a run that has not gone has no report to read. What it reaches, by the rules that made its list (a
// run records how many it enrolled and nothing about the rest, so no "of 312"); the words as its first person reads
// them; and the act alone at the foot, pinned, with the skip and the list beside it. The words are the contracts'
// (toApprovalVM, through `broadcasts.approval`); the acts are the page's, and when one lands the next run
// waiting opens, so a queue of two is two presses.
// A part of a bar, as a width: never under a sliver for a part that exists, so one person out of three hundred still shows.
const bcShare = (n: number, of: number) => (of > 0 ? Math.max(1.5, Math.round((n / of) * 1000) / 10) : 0);

/** The sheet's head: the way back, and where this run sits among those waiting. */
function bcSheetTop(sheet: BcSheetAsk, onClose: () => void) {
  const pos = sheet.position;
  return (
    <div className="bc-sheet-top">
      <button
        type="button"
        className="bc-sheet-back"
        onClick={onClose}
        aria-label="Back to Broadcasts"
        data-testid="bc-detail-close"
      >
        <Icon name="chevron" size={18} />
      </button>
      <div className="bc-sheet-where">
        <div className="bc-sheet-k">Waiting on you</div>
        <div className="bc-sheet-pos" data-testid="bc-sheet-pos">
          {pos && pos[1] > 1 ? `${pos[0]} of ${pos[1]} · Campaigns` : "Campaigns"}
        </div>
      </div>
    </div>
  );
}

/**
 * Who it reaches out of everyone its moment named, as the run counted them when it was drawn: green reaches, amber
 * waits only for time, grey was left out -- and a line for each reason, the most first. A run made before runs kept
 * that count says the rules that made its list instead, which are true of everyone on it.
 */
function bcSheetReach(avm: ApprovalVM) {
  return (
    <div className="bc-sheet-reach" data-testid="bc-sheet-reach">
      <div className="bc-sheet-n">
        <span className="bc-sheet-v tabular">{avm.will}</span>
        <span className="bc-sheet-will">
          {avm.of ? (
            <>
              {"will get it, of "}
              <span className="tabular" data-testid="bc-sheet-pool">
                {avm.of.pool}
              </span>
            </>
          ) : (
            "will get it"
          )}
        </span>
      </div>
      {avm.of ? (
        <>
          <div className="bc-sheet-bar is-parts" aria-hidden="true">
            {avm.will > 0 && (
              <span className="bc-sheet-bar-will" style={{ width: `${bcShare(avm.will, avm.of.pool)}%` }} />
            )}
            {avm.of.held > 0 && (
              <span className="bc-sheet-bar-held" style={{ width: `${bcShare(avm.of.held, avm.of.pool)}%` }} />
            )}
            {avm.of.pool - avm.will - avm.of.held > 0 && <span className="bc-sheet-bar-rest" />}
          </div>
          {avm.of.lines.length > 0 && (
            <ul className="bc-sheet-why" data-testid="bc-sheet-why">
              {avm.of.lines.map((l) => {
                const door = l.door;
                return (
                  <li key={l.words}>
                    <span className="cm-reach-dot" data-tone={l.tone} aria-hidden="true" />
                    <span>{l.words}</span>
                    {door && (
                      <button
                        type="button"
                        className="bc-sheet-door"
                        onClick={() => navigate(door.to)}
                        data-testid="bc-sheet-door"
                      >
                        {door.words}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="bc-sheet-bar" aria-hidden="true">
            <span />
          </div>
          {avm.rules.length > 0 && (
            <div className="bc-sheet-rules">
              {avm.rules.map((r) => (
                <div key={r}>{r}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The words as its first person reads them, with the slots marked, and who reads them. */
function bcSheetWords(parts: ReturnType<typeof mpParts>, avm: ApprovalVM) {
  return (
    <div className="bc-sheet-words" data-testid="bc-sheet-words">
      <p className="bc-sheet-quote">
        “
        {parts.map((x, i) =>
          x.kind === "slot" ? (
            <span key={i} className="bc-sheet-slot">
              {x.text}
            </span>
          ) : (
            <Fragment key={i}>{x.text}</Fragment>
          ),
        )}
        ”
      </p>
      <div className="bc-sheet-reader">
        {avm.reader && <span>as {avm.reader} reads it</span>}
        {avm.hiThere > 0 && (
          <span className="bc-sheet-hi" data-testid="bc-sheet-hi">
            {avm.hiThere} {avm.hiThere === 1 ? "gets" : "get"} “Hi there” — no name on file
          </span>
        )}
      </div>
    </div>
  );
}

/** The act, pinned to the foot while the list above it scrolls. */
function bcSheetActs(p: {
  b: BroadcastDto;
  avm: ApprovalVM;
  sheet: BcSheetAsk;
  seeAll: boolean;
  onSeeAll: () => void;
}) {
  const { b, avm, sheet, seeAll, onSeeAll } = p;
  const Confirm = confirmPart();
  const stop = bcStopWords("pending_approval");
  return (
    <div className="bc-sheet-acts" data-testid="bc-sheet-acts">
      {avm.expired && (
        <p className="bc-sheet-expired" data-testid="bc-sheet-expired">
          {avm.expired}
        </p>
      )}
      {sheet.canSend && avm.approve && !sheet.armed && (
        <button
          type="button"
          className="bc-sheet-approve"
          disabled={sheet.approving}
          onClick={sheet.approve}
          data-testid="bc-sheet-approve"
        >
          <Icon name="check" size={16} /> {sheet.approving ? "Approving…" : avm.approve}
        </button>
      )}
      {sheet.armed && sheet.canSend ? (
        <Confirm
          question={stop.question(b)}
          detail={stop.detail}
          yes={stop.yes}
          danger
          busy={sheet.stopping}
          onYes={sheet.skip}
          onNo={() => sheet.onArm(false)}
          testid="bc-sheet-skip"
        />
      ) : (
        <div className="bc-sheet-pair">
          {sheet.canSend && (
            <button
              type="button"
              className="bc-sheet-second"
              onClick={() => sheet.onArm(true)}
              data-testid="bc-sheet-skip"
            >
              Skip this run
            </button>
          )}
          <button
            type="button"
            className="bc-sheet-second"
            aria-expanded={seeAll}
            onClick={onSeeAll}
            data-testid="bc-sheet-see"
          >
            {seeAll ? "Hide the list" : `See the ${avm.will}`}
          </button>
        </div>
      )}
      <span className="bc-sheet-note">{sheet.canSend ? avm.skip : gateTitle("approve", "approve or skip a run")}</span>
    </div>
  );
}

interface BcSheetProps {
  d: BroadcastDetailDto;
  people: RunPersonVM[];
  avm: ApprovalVM;
  sheet: BcSheetAsk;
  onClose: () => void;
  seeAll: boolean;
  onSeeAll: () => void;
}

export function BcSheet({ d, people, avm, sheet, onClose, seeAll, onSeeAll }: BcSheetProps) {
  const b = d.broadcast;
  const PolicyChip = policyChipPart();
  const pb = sheet.playbook;
  const hint =
    pb && pb.triggerHint ? pb.triggerHint.charAt(0).toLowerCase() + pb.triggerHint.slice(1) : b.audience.label;
  const body = sheet.template ? sheet.template.body_preview : null;
  const parts = body ? mpParts(body, avm.values) : [];
  return (
    <div className="bc-sheet" data-testid="bc-sheet">
      {bcSheetTop(sheet, onClose)}
      <div className="bc-sheet-body">
        <div>
          <div className="bc-sheet-titles">
            <h1 className="bc-sheet-title">{b.name}</h1>
            {pb && <PolicyChip cls={pb.policy_class} />}
          </div>
          <div className="bc-sheet-sub">
            Playbook · {hint} · {avm.goes}
          </div>
        </div>
        {bcSheetReach(avm)}
        {parts.length > 0 && bcSheetWords(parts, avm)}
      </div>
      {seeAll && (
        <section className="bc-touched bc-sheet-people" data-testid="bc-sheet-people">
          <div className="bc-touched-head">
            <span className="bc-card-title">Who gets it</span>
          </div>
          {people.map(bcPersonRow)}
        </section>
      )}
      {bcSheetActs({ b, avm, sheet, seeAll, onSeeAll })}
    </div>
  );
}

// What each stop asks and promises, by the run's state.
interface BcStopWords {
  verb: string;
  question: (row: { name: string }) => string;
  detail: string;
  yes: string;
}

const BC_STOP_WORDS: Record<string, BcStopWords> & { scheduled: BcStopWords } = {
  sending: {
    verb: "Stop",
    question: (row) => `Stop ${row.name}?`,
    detail: "Messages already out stay out; the rest do not go.",
    yes: "Yes, stop it",
  },
  pending_approval: {
    verb: "Skip",
    question: (row) => `Skip ${row.name}?`,
    detail: "Nothing sends, and the run closes.",
    yes: "Yes, skip it",
  },
  scheduled: {
    verb: "Cancel",
    question: (row) => `Cancel ${row.name}?`,
    detail: "Nothing will send.",
    yes: "Yes, cancel it",
  },
};

export const bcStopWords = (state: string): BcStopWords => BC_STOP_WORDS[state] || BC_STOP_WORDS.scheduled;
