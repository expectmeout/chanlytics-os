/**
 * A new sequence to leads, written in Sequences (the lead sheet's hand-off, 17 Oct 2026: one creator): the composer on a
 * list as it is, or for a lead on a list of its own made as it starts, as a version of a sequence where one is named (the
 * same steps, waits and mailboxes; contracts reachOutVersionDraftOf). Every trip comes back: Cancel, and Close once it
 * started, return to the Leads address it was opened from, and the sequence a Start made is left for the lead's sheet
 * to choose (trip.ts). Opened cold, with no way back, it returns to Sequences' list.
 */
import { useEffect, useState } from "react";
import { SEQUENCES_ROUTE, type ReachOutChainDto, type SequenceNewLeads } from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { replaceRoute } from "../../legacy-verbs";
import { ReachOutSheet } from "../reach-out/sheet";
import { reachOuts } from "../reach-out/surface";
import { tripLeadName, tripMade, tripNow } from "./trip";

/** What the composer is opened on, once its reads are in: a list by name, or a lead and the sequence it copies. */
type Opened =
  | { kind: "reading" }
  | { kind: "failed" }
  | { kind: "list"; search: { id: string; name: string } }
  | { kind: "lead"; leadId: string; leadName: string; from: ReachOutChainDto | null };

/** The list's name: Leads said it as it opened Sequences, else the lists with no sequence yet name it. */
async function listNameOf(id: string): Promise<string | null> {
  const t = tripNow();
  if (t && t.listId === id && t.listName) return t.listName;
  const sources = await reachOuts.sources();
  return sources ? (sources.find((s) => s.id === id)?.name ?? null) : null;
}

/** The composer's reads: the list's name, or the sequence a version copies. */
function useOpened(leads: SequenceNewLeads, again: number): Opened {
  const [opened, setOpened] = useState<Opened>({ kind: "reading" });
  const forList = "list" in leads.for ? leads.for.list : null;
  const forLead = "lead" in leads.for ? leads.for.lead : null;
  useEffect(() => {
    let live = true;
    const put = (o: Opened) => {
      if (live) setOpened(o);
    };
    if (forList)
      void listNameOf(forList).then((name) =>
        put(name ? { kind: "list", search: { id: forList, name } } : { kind: "failed" }),
      );
    else if (forLead) {
      const leadName = tripLeadName(forLead) ?? reachOuts.words.REACH_OUT_NEW_LIST_WORDS.someone;
      if (!leads.version) put({ kind: "lead", leadId: forLead, leadName, from: null });
      else
        void reachOuts.chainsNow().then((chains) => {
          const from = chains ? chains.find((c) => c.root_id === leads.version) : undefined;
          put(from ? { kind: "lead", leadId: forLead, leadName, from } : { kind: "failed" });
        });
    }
    return () => {
      live = false;
    };
  }, [forList, forLead, leads.version, again]);
  return opened;
}

export function NewForLeads({ leads, back }: { leads: SequenceNewLeads; back: string | null }) {
  const [again, setAgain] = useState(0);
  const opened = useOpened(leads, again);
  const N = reachOuts.words.REACH_OUT_NEW_LIST_WORDS;
  // Back where it was opened from: the lead, or the list of sequences opened cold.
  const leave = () => replaceRoute(back ?? SEQUENCES_ROUTE);
  if (opened.kind === "reading") return <div className="sq-reading" aria-busy="true" />;
  if (opened.kind === "failed")
    return (
      <FailedRead
        what={leads.version ? "the sequence it copies" : "the list"}
        onRetry={() => setAgain((n) => n + 1)}
        testid="sq-new-leads-failed"
      />
    );
  if (opened.kind === "list")
    return (
      <ReachOutSheet
        search={opened.search}
        onClose={leave}
        onDone={(saved) => tripMade(saved.root_id, N.startedOn(opened.search.name))}
      />
    );
  const name = opened.from ? N.nameOf(opened.from.name, opened.leadName) : N.forLead(opened.leadName);
  return (
    <ReachOutSheet
      search={{ id: "", name }}
      onList={{ leadIds: [opened.leadId], leadName: opened.leadName, name, from: opened.from }}
      onClose={leave}
      onDone={(saved) => tripMade(saved.root_id, N.started(opened.leadName))}
    />
  );
}
