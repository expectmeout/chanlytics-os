/**
 * Campaigns › Playbooks, real (moved from legacy/pages/outbound.jsx, decision 0015): a standing rule that sends one
 * approved template to newly eligible people who said yes, under the workspace's autonomy mode. Every number is a run's.
 * Nothing here scores, estimates or invents.
 *
 * Its moments: People lists that keep themselves current -- win-back (quiet 30 days), welcome (new this week), save our
 * number (phoned only), lapsed -- the month's offer (everyone who said yes, on a cadence), a visit tomorrow or
 * yesterday, and one of the workspace's own lists (00155). Each runs under one of the two Autonomy rows — auto sends,
 * veto sends after a stop window, ask leaves the run waiting here and on Today, never does nothing. Every verb goes
 * through `playbooks` (verbs.ts) and the surface is re-fetched, so the cards are the server's.
 *
 * A real workspace draws its own playbooks (`useSurface("playbooks")`); a demo session draws the same page from the
 * sample (sample.ts); without either, nothing.
 */
import { useEffect, useRef, useState } from "react";
import { tabDraft } from "../../legacy-parts";
import { canDo, demoSession, gateTitle, useLegacyToast } from "../../legacy-verbs";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { useSurface } from "../../use-surface";
import { PlaybookComposer } from "./composer";
import type { PlaybookCardVM, PlaybooksSurface } from "./surface";
import { PB_NONE } from "./words";
import {
  PbAlwaysOn,
  PbChainsFailed,
  pbCards,
  pbChainHere,
  pbEmpty,
  pbGone,
  pbHead,
  pbList,
  pbMore,
} from "./page-parts";
import { playbooksSample } from "./sample";

interface PlaybooksPageProps {
  initialPlaybook?: string | null;
}

interface PlaybooksRealProps extends PlaybooksPageProps {
  data: PlaybooksSurface;
}

// A link to one playbook lands on its card: marked, and brought into view (again when a chain's row lands later).
function scrollToCard(initialPlaybook: string | null) {
  const el =
    initialPlaybook && typeof document !== "undefined" && document.getElementById
      ? document.getElementById(`pb-${initialPlaybook}`)
      : null;
  if (!el || !el.getBoundingClientRect || !el.scrollIntoView) return;
  const at = el.getBoundingClientRect();
  if (at.top < 0 || at.top > window.innerHeight - 80) el.scrollIntoView({ block: "start" });
}

function PlaybooksReal({ initialPlaybook = null, data }: PlaybooksRealProps) {
  // The reach-outs are their own surface (Part 4 PR 8): their rows draw when they land.
  const reachOuts = useSurface("reach_outs");
  const [toastNode, flash] = useLegacyToast();
  // Who may start, change or run a playbook: the role store's answer, View-as included.
  const canAct = canDo("approve");
  // A playbook half-written when the page was left opens again as the page does: the tab kept its words
  // (useUnsavedWork), a new one under "new" and a change under the playbook's id.
  const draftOf = (key: string) => !!tabDraft("playbook", key);
  const [composing, setComposing] = useState(() => draftOf("new"));
  const [editing, setEditing] = useState(() => (data.rows || PB_NONE).find((p) => draftOf(p.id)) || null);
  // The moment an empty slot was pressed for, so the composer opens on it rather
  // than on whichever trigger happens to be first.
  const [slot, setSlot] = useState<string | null>(null);
  // The one playbook open in place across the grid: the link's, when a link named
  // one (Templates' "Win-back playbook", Today's run), else none.
  const [openId, setOpenId] = useState(initialPlaybook);
  const followed = useRef(initialPlaybook);
  useEffect(() => {
    if (followed.current === initialPlaybook) return;
    followed.current = initialPlaybook;
    setOpenId(initialPlaybook);
  }, [initialPlaybook]);
  useEffect(() => {
    const open = () => {
      setEditing(null);
      setSlot(null);
      setComposing(true);
    };
    window.addEventListener("playbooks:new", open);
    return () => window.removeEventListener("playbooks:new", open);
  }, []);
  // The reach-outs, each a chain drawn as one row above the moments (reach-out/row.tsx); none when their read failed.
  const [rows, chains] = [data.rows || PB_NONE, reachOuts || PB_NONE];
  const linkedChainHere = pbChainHere(chains, initialPlaybook);
  useEffect(() => {
    scrollToCard(initialPlaybook);
  }, [initialPlaybook, linkedChainHere]);

  const triggers = data.triggers || PB_NONE;
  const usedTriggers = new Set<string>(rows.map((p) => p.trigger));
  const unused = triggers.filter((t) => !usedTriggers.has(t.id));
  const cards = pbCards(rows, triggers);
  const closeComposer = () => {
    setComposing(false);
    setEditing(null);
    setSlot(null);
  };
  const startAt = (id: string) => {
    setEditing(null);
    setSlot(id);
    setComposing(true);
  };
  const startNew = () => {
    setEditing(null);
    setSlot(null);
    setComposing(true);
  };
  const onEdit = (e: PlaybookCardVM) => {
    setComposing(false);
    setEditing(e);
  };

  return (
    <div className="reports pb-page" data-testid="playbooks-real">
      <div className="rp-body cm-page pb-body">
        {pbHead({ rows, chains, triggers, unused, startNew })}
        {pbGone(initialPlaybook, rows, linkedChainHere, Array.isArray(reachOuts)) && (
          <EmptyState
            kind="line"
            title="That playbook isn't here any more."
            body="Its runs stay in Broadcasts, with their numbers."
            testid="pb-gone"
          />
        )}
        {rows.length > 0 && data.templates === null && (
          <FailedRead
            kind="line"
            what="your templates"
            body="The cards show what they send once they read. Everything else here is current."
            surface="playbooks"
            testid="pb-cards-templates-failed"
          />
        )}
        {/* The server could not count who a moment reaches: said once, here, and no card draws a zero it never
            counted -- it drew "0 of 0", "nobody to send to" and the QR over a People read that failed. */}
        {(cards.length > 0 || unused.length > 0) && data.countsRead === false && (
          <FailedRead
            kind="line"
            what="who each moment reaches"
            body="The cards show who they reach once it reads. Everything else here is current."
            surface="playbooks"
            testid="pb-counts-failed"
          />
        )}
        <PbChainsFailed />
        {/* The playbooks, as People's table: the columns named once above the rows; a reach-out's chain first. */}
        {pbList({ cards, chains, canAct, flash, tz: data.timezone, openId, setOpenId, initialPlaybook, onEdit })}
        {pbMore(unused, startAt)}
        {rows.length === 0 && chains.length === 0 && unused.length === 0 && !composing && pbEmpty()}
        {(cards.length > 0 || unused.length > 0) && <PbAlwaysOn rows={rows} />}
        {!canAct && rows.length > 0 && (
          <div className="bc-excl-hint" data-testid="pb-role">
            {gateTitle("approve", "pause, run, change or delete a playbook")}
          </div>
        )}
      </div>

      {/* The composer, in a sheet beside the page: last, so the page's own
          parts keep their place whether it is open or not. */}
      {(composing || editing) && (
        <PlaybookComposer
          key={editing ? editing.id : slot || "new"}
          data={data}
          editing={editing}
          initialTrigger={slot}
          onCancel={closeComposer}
          onDone={(d, changed) => {
            closeComposer();
            flash({
              msg: changed ? (
                <>
                  <b>{d.name}</b> changed
                </>
              ) : (
                <>
                  <b>{d.name}</b> is running — its next run is on the card, by your clock
                </>
              ),
            });
          }}
        />
      )}

      {toastNode}
    </div>
  );
}

/**
 * The page the route draws. A real workspace's own playbooks when the surface has landed, else a demo's sample, else
 * nothing (the standalone mockup's seeded twin left with the move).
 */
export function PlaybooksPage(props: PlaybooksPageProps) {
  const live = useSurface("playbooks");
  const data = live || (demoSession() ? playbooksSample() : null);
  if (!data) return null;
  return <PlaybooksReal {...props} data={data} />;
}
