/**
 * Leads while a reach-out writes (Reach out, Part 6: H8-H10; canvas board 06), moved from
 * legacy/pages/reach-out/reach-out-leads.jsx (decision 0015). An open search that a reach-out writes to draws a strip under
 * the finder's own (how many it has written to, today's count of the day's share, the next email and who it goes to, the
 * domain), each row's Stage cell a line saying where that business stands, and the peek a block with its story and three
 * doors: Read what went out (the person's thread), Stop writing to them, and Read as no · undo. Every sentence is contracts'
 * (reachOutLineOf, reachOutStripOf, reachOutTimelineOf), read through Campaigns' reach-out reads (GET reach-outs/leads); a
 * read that failed draws nothing of it, never a line it did not read. Who may press is the role store's answer (canDo
 * "approve", and the role gate).
 */
import { useEffect, useMemo, useReducer, useState } from "react";
import type { LeadPeekVM, OwnerSaidIntent, ReachOutLeadTimelineDto, ReachOutLeadsDto } from "@chanlytics/contracts";
import { replies } from "@/legacy-bridge/reach-out/replies";
import { useReadAgain } from "../../campaigns/reach-out/read-again";
import { RoSaidAsk, type SaidMore } from "../../campaigns/reach-out/said-ask";
import { reachOuts } from "../../campaigns/reach-out/surface";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { canDo, gate, navigate, refusalToast, useLegacyToast } from "../../legacy-verbs";
import { LeadStrip } from "../finder/strip-view";
import type { Flash } from "../peek/types";

/** An open search's reach-out: its read, and each lead's line under its stage. */
export interface ReachOutLines {
  dto: ReachOutLeadsDto;
  lineOf: (leadId: string) => string | null;
}

/**
 * An open search's reach-out: its lines, read when the search opens, again as Leads or the reach-outs move (a reply read, a
 * run sent: read-again.ts, at most every thirty seconds and once more at the window's end, so the last of a burst is read;
 * the wiring's second audit, W-campaign-run-template-reachout-8), and at once after a door here moved something. Null while
 * there is none, or it could not be read. Answers the lines with `lineOf(leadId)`, the Stage cell's words.
 */
export const useReachOutLeads = (searchId: string | null): ReachOutLines | null => {
  const [dto, setDto] = useState<ReachOutLeadsDto | null>(null);
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const moved = useReadAgain(searchId);
  useEffect(() => {
    window.addEventListener("reach_out:leads", bump);
    return () => window.removeEventListener("reach_out:leads", bump);
  }, []);
  // Another search: nothing of the last one's stands while this one's is read.
  useEffect(() => {
    setDto(null);
  }, [searchId]);
  useEffect(() => {
    if (!searchId) return undefined;
    let live = true;
    // A read again that fails keeps the lines it read; another search's were let go above.
    void reachOuts.leadLines(searchId).then((d) => {
      if (live && d) setDto(d.lines ? d : null);
    });
    return () => {
      live = false;
    };
  }, [searchId, tick, moved]);
  return useMemo(() => {
    if (!dto || !dto.lines) return null;
    const byLead = new Map(dto.lines.leads.map((l) => [l.lead_id, l]));
    return {
      dto,
      lineOf: (id: string) => {
        const l = byLead.get(id);
        return l ? reachOuts.lineOf(l) : null;
      },
    };
  }, [dto]);
};

/** A door here moved a lead or its chain: the strip and the lines are read again at once. */
const roLeadsMoved = () => window.dispatchEvent(new CustomEvent("reach_out:leads"));

/**
 * The strip under the finder's own, drawn by the finder's strip itself (LeadStrip) so the two read as one family: how it is
 * going (the chain's row on Playbooks), a run that waits, and Pause or Resume for a role that may.
 */
export const ReachOutLeadsStrip = ({ leads }: { leads: ReachOutLines | null }) => {
  const [toastNode, flash] = useLegacyToast();
  const [busy, setBusy] = useState(false);
  const s = leads ? reachOuts.stripOf(leads.dto) : null;
  if (!s || !leads || !leads.dto.lines) return toastNode;
  const root = leads.dto.lines.chain.root_id;
  const name = leads.dto.lines.chain.name;
  const mayToggle = canDo("approve");
  const vm = {
    state: s.running ? "running" : "",
    title: s.title,
    parts: s.parts,
    alert: false,
    progress: s.progress,
    actions: [
      ...(s.waiting ? [{ id: "waiting", label: s.waiting.label, primary: true }] : []),
      { id: "going", label: s.going.label },
      ...(mayToggle ? [{ id: "toggle", label: s.toggle.label }] : []),
    ],
  };
  const onAction = async (id: string) => {
    if (id === "going") return navigate(s.going.to);
    if (id === "waiting" && s.waiting) return navigate(s.waiting.to);
    if (id !== "toggle" || busy) return undefined;
    setBusy(true);
    const r = await (s.toggle.pause ? reachOuts.pause(root) : reachOuts.resume(root)).finally(() => setBusy(false));
    const RW = reachOuts.words.REACH_OUT_ROW_WORDS;
    flash(r && r.ok ? { tone: "ok", msg: s.toggle.pause ? RW.paused(name) : RW.resumed(name) } : refusalToast(r));
    roLeadsMoved();
    return undefined;
  };
  return (
    <div data-testid="ro-leads-strip" data-state={s.running ? "running" : "paused"}>
      <LeadStrip vm={vm} onAction={onAction} />
      {toastNode}
    </div>
  );
};

type TimelineVM = ReturnType<typeof reachOuts.timelineOf>;

/** An owner's doors on the peek (00429): Send it, to the run where a draft waits, and They wrote back…, which asks. */
const RoOwnerDoors = ({
  vm,
  busy,
  asking,
  onAsk,
}: {
  vm: TimelineVM;
  busy: boolean;
  asking: boolean;
  onAsk: () => void;
}) => (
  <>
    {vm.send ? (
      <Button size="sm" onClick={() => vm.send && navigate(vm.send.to)} data-testid="peek-reach-out-send">
        {vm.send.label}
      </Button>
    ) : null}
    {vm.said ? (
      <Button
        size="sm"
        variant="quiet"
        disabled={busy}
        aria-expanded={asking}
        onClick={onAsk}
        data-testid="peek-reach-out-said"
        {...gate("approve", "say what a business wrote back")}
      >
        {vm.said.label}
      </Button>
    ) : null}
  </>
);

/** The block's head and its story: what the reach-out is, where the lead stands, each line, and its stop if any. */
const RoStory = ({ vm, standing }: { vm: TimelineVM; standing: string | null }) => (
  <>
    <summary className="pk-box-head">
      <span className="pk-box-line">
        <Icon name="mail" size={12} />
        <span className="pk-box-sum" data-testid="peek-reach-out-label">
          {vm.label}
        </span>
        <Icon name="chevron-down" size={12} />
      </span>
    </summary>
    {standing ? (
      <p className="pk-alt-why" data-testid="peek-reach-out-standing">
        {standing}
      </p>
    ) : null}
    <ol className="pk-steps" data-testid="peek-reach-out-lines">
      {vm.lines.map((l) => (
        <li key={l.id} className="pk-step">
          {l.when} · {l.text}
        </li>
      ))}
    </ol>
    {vm.stopped ? (
      <p className="pk-alt-why" data-testid="peek-reach-out-stopped">
        {vm.stopped}
      </p>
    ) : null}
  </>
);

/**
 * The peek's block (H9): a lead's story with the reach-out, and its doors. Nothing when no reach-out planned it. For a
 * reach-out its owner sends (00429): Send it, to the run where an email handed to them waits, and They wrote back…, what
 * the business answered in their own inbox, said as one of five words and read as a reply is (its undo the same).
 */
export const LeadReachOut = ({ lead, flash }: { lead: LeadPeekVM | null; flash: Flash | null }) => {
  const leadId = lead ? lead.id : null;
  const [story, setStory] = useState<ReachOutLeadTimelineDto | null>(null);
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  // Its story follows the business as the lines do: a reply read, a send gone (read-again.ts).
  const moved = useReadAgain(leadId);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!leadId) return undefined;
    let live = true;
    void reachOuts.leadTimeline(leadId).then((t) => {
      if (live) setStory(t);
    });
    return () => {
      live = false;
    };
  }, [leadId, tick, moved]);
  if (!lead || !story || !story.chain || story.lead_id !== leadId) return null;
  const vm = reachOuts.timelineOf(story);
  // Where it stands, the one line every page says (00426): what is next, or what its answer did.
  const standing = vm.stopped ? null : reachOuts.standingOf(story);
  const W = reachOuts.words.REACH_OUT_STOP_WORDS;
  const said = (r: { ok: boolean } | null | undefined, ok: string) => {
    if (flash) flash(r && r.ok ? { tone: "ok", msg: ok } : refusalToast(r as Parameters<typeof refusalToast>[0]));
  };
  const stop = async () => {
    setSure(false);
    setBusy(true);
    const r = await reachOuts.stopLead(lead.id).finally(() => setBusy(false));
    said(r, r && r.ok && r.data && r.data.already ? W.already(story.business_name) : W.done(story.business_name));
    bump();
    roLeadsMoved();
  };
  const undo = async () => {
    if (busy || !vm.undo) return;
    const done = vm.undo.done;
    setBusy(true);
    const r = await replies.undo(vm.undo.messageId).finally(() => setBusy(false));
    said(r, done);
    bump();
    roLeadsMoved();
  };
  const tell = async (intent: OwnerSaidIntent, more: SaidMore) => {
    if (busy) return;
    setAsking(false);
    setBusy(true);
    const r = await reachOuts.sayReply(lead.id, { intent, ...more }).finally(() => setBusy(false));
    const SW = reachOuts.words.REACH_OUT_SAID_WORDS;
    said(
      r,
      r && r.ok && r.data.already
        ? SW.already(story.business_name)
        : reachOuts.saidReplyWords(
            story.business_name,
            intent,
            r && r.ok ? r.data.resume_at : null,
            more.refer_to ?? null,
          ),
    );
    bump();
    roLeadsMoved();
  };
  return (
    <details className="pk-box" open data-testid="peek-reach-out">
      <RoStory vm={vm} standing={standing ? standing.line : null} />
      {sure ? (
        <Confirm
          question={W.ask(story.business_name)}
          detail={W.detail}
          yes={W.yes}
          danger
          busy={busy}
          onYes={stop}
          onNo={() => setSure(false)}
          testid="peek-reach-out-stop"
        />
      ) : (
        <div className="pk-decide">
          {vm.read ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => vm.read && navigate(vm.read.to)}
              data-testid="peek-reach-out-read"
            >
              {vm.read.label}
            </button>
          ) : null}
          {vm.stop ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => setSure(true)}
              data-testid="peek-reach-out-stop-ask"
              {...gate("approve", "stop writing to a business")}
            >
              {vm.stop.label}
            </button>
          ) : null}
          {vm.undo ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={undo}
              data-testid="peek-reach-out-undo"
              {...gate("approve", "undo a reply read as no")}
            >
              {vm.undo.label}
            </button>
          ) : null}
          <RoOwnerDoors vm={vm} busy={busy} asking={asking} onAsk={() => setAsking((v) => !v)} />
        </div>
      )}
      {asking && vm.said ? (
        <RoSaidAsk
          business={story.business_name}
          busy={busy}
          onSay={(i, more) => void tell(i, more)}
          testid="peek-reach-out-said"
        />
      ) : null}
    </details>
  );
};
