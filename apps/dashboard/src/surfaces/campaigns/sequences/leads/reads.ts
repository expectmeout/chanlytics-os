/**
 * What the draft's record previews with (the lead-to-sequence canvas's Preview as a real lead): the leads in it, one at a
 * time, each read as the lead's own page reads it (GET leads/:id), so its values are its record's; the workspace's own
 * values (Templates' read of Settings) beside the name the sequence signs with; and the search new ready leads would join
 * from. A lead read once is kept for the tab: ‹ › back to one paints at once.
 */
import { useEffect, useState } from "react";
import {
  reachOutExampleLead,
  type LeadCardLead,
  type LeadRowDto,
  type SequenceRecordDto,
  type SlotWorkspace,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { workspaceName } from "../../../people/person-verbs";
import { tplOwn } from "../../templates/words";
import { sequenceVerbs as verbs } from "../verbs";
import { useSequenceRead } from "../use-record";

/** A lead in it, as the preview steps through them. */
export interface PreviewLead {
  id: string;
  name: string;
}

/** The groups of who is in it that the preview reads as: everyone with a place, never those who left. */
const LEFT = new Set(["left", "done", "removed"]);

/** The leads in it, in the order the Leads tab files them, each once. */
export function usePreviewLeads(rec: SequenceRecordDto): PreviewLead[] {
  const read = useSequenceRead(rec.sequence.id, verbs.people, verbs.peekPeople);
  if (read.state !== "read") return [];
  const seen = new Set<string>();
  const out: PreviewLead[] = [];
  for (const r of read.data.rows) {
    if (!r.lead_id || seen.has(r.lead_id) || LEFT.has(r.group)) continue;
    seen.add(r.lead_id);
    out.push({ id: r.lead_id, name: r.name ?? "" });
  }
  return out;
}

/** Each lead's row as its page read it, for the tab. */
const leadRowsRead = new Map<string, LeadRowDto>();

/** One lead's row (null: none asked, or not read yet). */
export function useLeadRow(id: string | null): LeadRowDto | null {
  const [, setRead] = useState(0);
  useEffect(() => {
    if (!id || leadRowsRead.has(id)) return undefined;
    let live = true;
    void api()("GET leads/[id]", { params: { id } }).then((r) => {
      if (!r.ok) return;
      leadRowsRead.set(id, r.data.row);
      if (live) setRead((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [id]);
  return id ? (leadRowsRead.get(id) ?? null) : null;
}

/** What the card's fill knows of a lead from its row: its values, where an email would go, and where it was found. */
export function cardLeadOf(row: LeadRowDto): LeadCardLead {
  return {
    business_name: row.business_name,
    city: row.city,
    kind: row.kind ?? null,
    facts: row.facts ?? null,
    // Where it was found says the foot's first line: a company the people card found, else a place on the map.
    source: row.kind === "company" ? "people_at_companies" : "local_businesses",
    to: row.email,
    emailState: row.email_state,
    canCall: !!row.phone && !row.phone_wrong,
    canChoose: false,
  };
}

/** The example business a preview reads as where nobody is in it yet. */
export const exampleCardLead = (): LeadCardLead => ({
  ...reachOutExampleLead(),
  to: null,
  emailState: "ok",
  canCall: false,
  canChoose: false,
});

/**
 * The workspace's own values as the send fills them (the edge's checkWorkspaceOf): its name for {{your business}}, its
 * booking link from Settings, and the name this sequence signs with.
 */
export function workspaceOf(signedBy: string): SlotWorkspace {
  return {
    businessName: workspaceName() || tplOwn().business_name,
    bookingLink: tplOwn().booking_link,
    yourName: signedBy.trim() || null,
  };
}

/** The name the preview reads as: the lead's, or the example business's where nobody is in it. */
export const previewNameOf = (lead: PreviewLead | null): string =>
  lead?.name || reachOutExampleLead().business_name || "";
