/**
 * Back today, over Leads' lists (the lead workbench, decision 9: no lead is written to twice by a reach-out): the leads
 * who asked to hear back on a day that has come, each in the words of what they asked and a door to its lead, where the
 * owner writes by hand. Read when the lists are drawn and again when a door moves a lead; drawn only when someone is
 * back, never an empty band. The first three show; the rest are one press away. The last answer is kept for the tab, per
 * workspace: Leads drawn again (a press on its tab) draws it at once and reads it again behind only once it has aged, so
 * the band never lands above lists already drawn (the strips review, 18 Oct 2026: a read on every press, and the band
 * after it).
 */
import { useEffect, useReducer, useState } from "react";
import { LEAD_BACK_WORDS, MIN_MS, askedDayOf, leadsRoute } from "@chanlytics/contracts";
import type { LeadBackDto } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { read } from "@/legacy-bridge/api";
import { getActiveWorkspace } from "@/legacy-bridge/workspace";
import { routeDoor } from "../../legacy-verbs";

/** How many show before "N more". */
const SHOWN = 3;

/** How long the kept answer stands before Leads drawn again reads it again. */
const BACK_KEPT_MS = MIN_MS;

/** The last answer, the workspace it is of and when it was read. */
let backKept: { workspace: string | null; leads: LeadBackDto[] | null; at: number } | null = null;
const keptHere = () => (backKept && backKept.workspace === getActiveWorkspace() ? backKept : null);

/** The business's zone, as the shell's clock holds it. */
const clockZone = (): string => (window.__clock ? window.__clock.zone() : "UTC");

async function readBack(): Promise<LeadBackDto[] | null> {
  try {
    return (await read("GET leads/back")).leads;
  } catch (e) {
    console.error("leads_back_failed", e instanceof Error ? e.message : e);
    return null;
  }
}

export function LeadsBackToday() {
  const [leads, setLeads] = useState<LeadBackDto[] | null>(() => keptHere()?.leads ?? null);
  const [all, setAll] = useState(false);
  const [tick, again] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("reach_out:leads", again);
    return () => window.removeEventListener("reach_out:leads", again);
  }, []);
  useEffect(() => {
    // Drawn again with a fresh answer kept: nothing to read. A door that moved a lead (`tick`) always reads.
    const was = keptHere();
    if (tick === 0 && was && Date.now() - was.at < BACK_KEPT_MS) return undefined;
    let live = true;
    const workspace = getActiveWorkspace();
    void readBack().then((l) => {
      if (l) backKept = { workspace, leads: l, at: Date.now() };
      if (live) setLeads(l);
    });
    return () => {
      live = false;
    };
  }, [tick]);
  if (!leads || leads.length === 0) return null;
  const W = LEAD_BACK_WORDS;
  const now = Date.now();
  const shown = all ? leads : leads.slice(0, SHOWN);
  return (
    <section className="ld-back" aria-label={W.head} data-testid="leads-back">
      <h3 className="ld-back-head" title={W.tip}>
        <Icon name="clock" size={12} /> {W.head} <span>{leads.length}</span>
      </h3>
      <ul>
        {shown.map((l) => (
          <li key={l.lead_id}>
            <LinkButton {...routeDoor(leadsRoute({ list: "all", peek: l.lead_id }))} data-testid="leads-back-lead">
              {W.line(l.business_name, askedDayOf(Date.parse(l.resume_at), clockZone(), now))}
            </LinkButton>
          </li>
        ))}
      </ul>
      {leads.length > SHOWN && !all ? (
        <LinkButton onClick={() => setAll(true)} data-testid="leads-back-more">
          {W.more(leads.length - SHOWN)}
        </LinkButton>
      ) : null}
    </section>
  );
}
